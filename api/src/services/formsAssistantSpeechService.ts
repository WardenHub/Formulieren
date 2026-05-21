// api/src/services/formsAssistantSpeechService.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

function getSpeechConfig() {
  const key = String(process.env.AZURE_SPEECH_KEY || "").trim();
  const region = String(process.env.AZURE_SPEECH_REGION || "").trim();
  const language = String(process.env.AZURE_SPEECH_LANGUAGE || "nl-NL").trim();

  if (!key) throw new Error("missing AZURE_SPEECH_KEY");
  if (!region) throw new Error("missing AZURE_SPEECH_REGION");

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = language;
  speechConfig.outputFormat = sdk.OutputFormat.Detailed;

  return { speechConfig, language };
}

function extFromMime(mimeType: any) {
  const m = String(mimeType || "").toLowerCase();

  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("webm")) return "webm";

  return "webm";
}

export function normalizeTranscriptText(value: any) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bkomma\b/gi, ",")
    .replace(/\bn v t\b/gi, "n.v.t.")
    .replace(/\bnvt\b/gi, "n.v.t.")
    .replace(/\bniet van toepassing\b/gi, "n.v.t.");
}

export async function transcribeAudioBuffer(args: {
  buffer: Buffer;
  mimeType?: string | null;
  fileName?: string | null;
}) {
  const { speechConfig, language } = getSpeechConfig();

  const tempName = `ember-assistant-${Date.now()}-${crypto.randomUUID()}.${extFromMime(args.mimeType)}`;
  const tempPath = path.join(os.tmpdir(), tempName);

  await fs.promises.writeFile(tempPath, args.buffer);

  try {
    const audioConfig = sdk.AudioConfig.fromWavFileInput(
      await fs.promises.readFile(tempPath)
    );

    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    const started = Date.now();

    const result: sdk.SpeechRecognitionResult = await new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        (r) => {
          recognizer.close();
          resolve(r);
        },
        (err) => {
          recognizer.close();
          reject(err);
        }
      );
    });

    const latencyMs = Date.now() - started;

    if (result.reason === sdk.ResultReason.Canceled) {
      const details = sdk.CancellationDetails.fromResult(result);
      throw new Error(
        `azure speech canceled: ${details.reason}; ${details.errorDetails || "geen details"}`
      );
    }

    if (result.reason === sdk.ResultReason.NoMatch) {
      return {
        transcript_text: "",
        normalized_text: "",
        language_code: language,
        provider: "azure-speech",
        provider_model: "speech-to-text",
        latency_ms: latencyMs,
        raw_response: {
          reason: "NoMatch",
          result_id: result.resultId,
        },
      };
    }

    const transcript = String(result.text || "").trim();

    return {
      transcript_text: transcript,
      normalized_text: normalizeTranscriptText(transcript),
      language_code: language,
      provider: "azure-speech",
      provider_model: "speech-to-text",
      latency_ms: latencyMs,
      raw_response: {
        reason: String(result.reason),
        result_id: result.resultId,
        duration: result.duration,
        offset: result.offset,
        json: result.properties?.getProperty(
          sdk.PropertyId.SpeechServiceResponse_JsonResult
        ) || null,
      },
    };
  } finally {
    await fs.promises.unlink(tempPath).catch(() => undefined);
  }
}