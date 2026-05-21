// src/pages/Forms/shared/assistantAudio.jsx

import { useRef, useState } from "react";

const DEFAULT_TARGET_SAMPLE_RATE = 16000;
const DEFAULT_MAX_DURATION_MS = 30000;

function flattenFloat32Chunks(chunks, totalLength) {
  const result = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function downsampleBuffer(buffer, sourceSampleRate, targetSampleRate) {
  if (targetSampleRate === sourceSampleRate) return buffer;
  if (targetSampleRate > sourceSampleRate) return buffer;

  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);

    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;

    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function encodeWavPcm16(samples, sampleRate) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

function stopTracks(stream) {
  try {
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch {
    // stil opruimen
  }
}

function closeAudioContext(ctx) {
  try {
    if (ctx?.state !== "closed") {
      ctx?.close?.();
    }
  } catch {
    // stil opruimen
  }
}

export function assistantAudioSupported() {
  return Boolean(
    typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      (window.AudioContext || window.webkitAudioContext)
  );
}

export function createAssistantAudioFileName(prefix = "ember-assistant") {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return `${prefix}-${stamp}.wav`;
}

export function useAssistantAudioRecorder(options = {}) {
  const targetSampleRate = Number(options.targetSampleRate || DEFAULT_TARGET_SAMPLE_RATE);
  const maxDurationMs = Number(options.maxDurationMs || DEFAULT_MAX_DURATION_MS);

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState("");
  const [lastFile, setLastFile] = useState(null);
  const [lastDurationMs, setLastDurationMs] = useState(null);

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const chunksRef = useRef([]);
  const totalLengthRef = useRef(0);
  const startedAtRef = useRef(null);
  const maxTimerRef = useRef(null);

  async function start() {
    if (!assistantAudioSupported()) {
      const msg = "Microfoonopname wordt niet ondersteund in deze browser.";
      setLastError(msg);
      throw new Error(msg);
    }

    if (recording || busy) return null;

    setLastError("");
    setLastFile(null);
    setLastDurationMs(null);
    setBusy(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextCtor();

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      chunksRef.current = [];
      totalLengthRef.current = 0;
      startedAtRef.current = Date.now();

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);

        chunksRef.current.push(copy);
        totalLengthRef.current += copy.length;
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      processorRef.current = processor;

      setRecording(true);

      if (maxDurationMs > 0) {
        maxTimerRef.current = window.setTimeout(() => {
          stop().catch(() => undefined);
        }, maxDurationMs);
      }

      return true;
    } catch (e) {
      stopTracks(streamRef.current);
      closeAudioContext(audioContextRef.current);

      streamRef.current = null;
      audioContextRef.current = null;
      sourceRef.current = null;
      processorRef.current = null;

      const msg = String(e?.message || e || "Microfoon kon niet worden gestart.");
      setLastError(msg);
      throw new Error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!recording && !streamRef.current && !audioContextRef.current) return null;

    setBusy(true);

    if (maxTimerRef.current) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }

    const audioContext = audioContextRef.current;
    const sourceSampleRate = audioContext?.sampleRate || 48000;
    const startedAt = startedAtRef.current || Date.now();

    try {
      try {
        processorRef.current?.disconnect?.();
      } catch {
        // stil opruimen
      }

      try {
        sourceRef.current?.disconnect?.();
      } catch {
        // stil opruimen
      }

      stopTracks(streamRef.current);

      const totalLength = totalLengthRef.current || 0;
      const merged = flattenFloat32Chunks(chunksRef.current || [], totalLength);
      const resampled = downsampleBuffer(merged, sourceSampleRate, targetSampleRate);
      const wavBlob = encodeWavPcm16(resampled, targetSampleRate);

      const durationMs = Math.max(0, Date.now() - startedAt);
      const file = new File([wavBlob], createAssistantAudioFileName(), {
        type: "audio/wav",
      });

      setLastFile(file);
      setLastDurationMs(durationMs);
      setLastError("");

      return {
        file,
        durationMs,
        sampleRate: targetSampleRate,
        size: file.size,
      };
    } catch (e) {
      const msg = String(e?.message || e || "Opname verwerken mislukt.");
      setLastError(msg);
      throw new Error(msg);
    } finally {
      closeAudioContext(audioContextRef.current);

      streamRef.current = null;
      audioContextRef.current = null;
      sourceRef.current = null;
      processorRef.current = null;
      chunksRef.current = [];
      totalLengthRef.current = 0;
      startedAtRef.current = null;

      setRecording(false);
      setBusy(false);
    }
  }

  function reset() {
    setLastError("");
    setLastFile(null);
    setLastDurationMs(null);
  }

  return {
    supported: assistantAudioSupported(),
    recording,
    busy,
    lastError,
    lastFile,
    lastDurationMs,
    start,
    stop,
    reset,
  };
}