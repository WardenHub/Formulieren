// api/src/services/formsAssistantSpeechService.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

type SpeechRawResult = {
  reason: string;
  result_id?: string | null;
  text?: string | null;
  duration?: number | null;
  offset?: number | null;
  json?: string | null;
};

type ContinuousSpeechOutcome = {
  rawResults: SpeechRawResult[];
  noMatchCount: number;
  canceled?: {
    reason: string;
    error_code?: string | null;
    error_details?: string | null;
  } | null;
};

const DUTCH_DIGIT_WORDS: Record<string, string[]> = {
  "0": ["nul", "zero"],
  "1": ["een", "één", "1"],
  "2": ["twee", "2"],
  "3": ["drie", "3"],
  "4": ["vier", "4"],
  "5": ["vijf", "5"],
  "6": ["zes", "6"],
  "7": ["zeven", "7"],
  "8": ["acht", "8"],
  "9": ["negen", "9"],
};

const DUTCH_LETTER_WORDS: Record<string, string[]> = {
  A: ["a", "aa"],
  B: ["b", "be", "bee"],
  C: ["c", "ce", "cee", "see"],
  D: ["d", "de", "dee", "die"],
  E: ["e", "ee"],
  F: ["f", "ef"],
  G: ["g", "gee"],
  H: ["h", "ha"],
  I: ["i", "ie"],
  J: ["j", "jee"],
  K: ["k", "ka"],
  L: ["l", "el"],
  M: ["m", "em"],
  N: ["n", "en"],
  O: ["o", "oo"],
  P: ["p", "pee"],
  Q: ["q", "ku"],
  R: ["r", "er"],
  S: ["s", "es"],
  T: ["t", "tee"],
  U: ["u", "uu"],
  V: ["v", "vee"],
  W: ["w", "wee"],
  X: ["x", "iks"],
  Y: ["y", "ij", "ei"],
  Z: ["z", "zet"],
};

function escapeRegExp(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

  return "wav";
}

function normalizePhraseList(value: any): string[] {
  const raw = Array.isArray(value) ? value : [];
  const out: string[] = [];
  const seen = new Set<string>();
  const max = Number(process.env.AZURE_SPEECH_MAX_PHRASES || 500);

  for (const item of raw) {
    const text = String(item || "").trim().replace(/\s+/g, " ");
    if (!text) continue;
    if (text.length > 90) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(text);

    if (out.length >= max) break;
  }

  return out;
}

function addPhraseListToRecognizer(recognizer: sdk.SpeechRecognizer, phrases: string[]) {
  const cleanPhrases = normalizePhraseList(phrases);
  if (!cleanPhrases.length) return 0;

  try {
    const phraseList = sdk.PhraseListGrammar.fromRecognizer(recognizer);

    for (const phrase of cleanPhrases) {
      phraseList.addPhrase(phrase);
    }

    return cleanPhrases.length;
  } catch {
    return 0;
  }
}

function normalizeBasicTranscriptText(value: any) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bkomma\b/gi, ",")
    .replace(/\bn\s*v\s*t\b/gi, "n.v.t.")
    .replace(/\bnvt\b/gi, "n.v.t.")
    .replace(/\bniet van toepassing\b/gi, "n.v.t.")
    .replace(/\bop\s*,\s*ja\b/gi, "op ja")
    .replace(/\bop\s*,\s*nee\b/gi, "op nee")
    .replace(/\bop\s*,\s*n\.v\.t\.\b/gi, "op n.v.t.")
    .replace(/\bnaar\s*,\s*ja\b/gi, "naar ja")
    .replace(/\bnaar\s*,\s*nee\b/gi, "naar nee")
    .replace(/\bnaar\s*,\s*n\.v\.t\.\b/gi, "naar n.v.t.");
}

function getKnownLetterDigitCodes(phrases: string[]) {
  return normalizePhraseList(phrases)
    .map((phrase) => phrase.toUpperCase().replace(/\s+/g, ""))
    .filter((phrase) => /^[A-Z][0-9]{1,3}$/.test(phrase));
}

function getKnownDecimalCodes(phrases: string[]) {
  return normalizePhraseList(phrases)
    .map((phrase) => phrase.replace(/\s+/g, ""))
    .filter((phrase) => /^[0-9]{1,2}\.[0-9]{1,2}$/.test(phrase));
}

function replaceKnownLetterDigitCodes(text: string, phrases: string[]) {
  let out = text;
  const codes = getKnownLetterDigitCodes(phrases);

  for (const code of codes) {
    const letter = code.slice(0, 1).toUpperCase();
    const digits = code.slice(1);
    const letterWords = DUTCH_LETTER_WORDS[letter] || [letter.toLowerCase()];

    const digitWords = digits
      .split("")
      .map((digit) => DUTCH_DIGIT_WORDS[digit] || [digit]);

    const digitAlternatives = digitWords
      .reduce<string[]>((acc, words) => {
        if (!acc.length) return words;
        const next: string[] = [];
        for (const a of acc) {
          for (const b of words) {
            next.push(`${a} ${b}`);
            next.push(`${a}${b}`);
          }
        }
        return next;
      }, [])
      .concat([digits, digits.split("").join(" ")]);

    for (const letterWord of letterWords) {
      for (const digitText of digitAlternatives) {
        const pattern = new RegExp(`\\b${escapeRegExp(letterWord)}\\s*${escapeRegExp(digitText)}\\b`, "gi");
        out = out.replace(pattern, code);
      }
    }
  }

  return out;
}

function replaceKnownDecimalCodes(text: string, phrases: string[]) {
  let out = text;
  const codes = getKnownDecimalCodes(phrases);

  for (const code of codes) {
    const [left, right] = code.split(".");
    const leftWords = DUTCH_DIGIT_WORDS[left] || [left];
    const rightWords = DUTCH_DIGIT_WORDS[right] || [right];

    const leftAlts = [left, ...leftWords];
    const rightAlts = [right, ...rightWords];

    for (const l of leftAlts) {
      for (const r of rightAlts) {
        const pattern = new RegExp(`\\b${escapeRegExp(l)}\\s*(?:punt|komma|\\.)\\s*${escapeRegExp(r)}\\b`, "gi");
        out = out.replace(pattern, code);
      }
    }
  }

  return out;
}

export function normalizeTranscriptText(value: any, speechPhrases: any[] = []) {
  const phrases = normalizePhraseList(speechPhrases);
  let out = normalizeBasicTranscriptText(value);

  out = replaceKnownLetterDigitCodes(out, phrases);
  out = replaceKnownDecimalCodes(out, phrases);

  return normalizeBasicTranscriptText(out);
}

function getDetailedJson(result: any) {
  try {
    return (
      result?.properties?.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult
      ) || null
    );
  } catch {
    return null;
  }
}

function rawResultFromSpeechResult(result: any): SpeechRawResult {
  return {
    reason: String(result?.reason ?? ""),
    result_id: result?.resultId || null,
    text: result?.text || null,
    duration: typeof result?.duration === "number" ? result.duration : null,
    offset: typeof result?.offset === "number" ? result.offset : null,
    json: getDetailedJson(result),
  };
}

async function recognizeContinuousFromWavFile(args: {
  tempPath: string;
  speechConfig: sdk.SpeechConfig;
  speechPhrases?: any[];
  timeoutMs?: number;
}): Promise<ContinuousSpeechOutcome & { phraseCount: number }> {
  const audioBuffer = await fs.promises.readFile(args.tempPath);
  const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);
  const recognizer = new sdk.SpeechRecognizer(args.speechConfig, audioConfig);
  const phraseCount = addPhraseListToRecognizer(recognizer, normalizePhraseList(args.speechPhrases));

  const timeoutMs = Number(args.timeoutMs || 120000);

  const rawResults: SpeechRawResult[] = [];
  let noMatchCount = 0;

  return await new Promise<ContinuousSpeechOutcome & { phraseCount: number }>((resolve, reject) => {
    let settled = false;
    let cancelError: Error | null = null;

    const timer = setTimeout(() => {
      cancelError = new Error(`azure speech timeout after ${timeoutMs}ms`);
      stopRecognition();
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);

      try {
        recognizer.recognized = undefined as any;
        recognizer.canceled = undefined as any;
        recognizer.sessionStopped = undefined as any;
      } catch {
        // ignore cleanup errors
      }

      try {
        recognizer.close();
      } catch {
        // ignore cleanup errors
      }
    }

    function finalize(extra?: Partial<ContinuousSpeechOutcome>) {
      if (settled) return;
      settled = true;

      cleanup();

      if (cancelError) {
        reject(cancelError);
        return;
      }

      resolve({
        rawResults,
        noMatchCount,
        canceled: extra?.canceled || null,
        phraseCount,
      });
    }

    function stopRecognition(extra?: Partial<ContinuousSpeechOutcome>) {
      try {
        recognizer.stopContinuousRecognitionAsync(
          () => finalize(extra),
          () => finalize(extra)
        );
      } catch {
        finalize(extra);
      }
    }

    recognizer.recognized = (_sender: sdk.Recognizer, event: sdk.SpeechRecognitionEventArgs) => {
      const result = event?.result;

      if (!result) return;

      if (result.reason === sdk.ResultReason.RecognizedSpeech) {
        rawResults.push(rawResultFromSpeechResult(result));
        return;
      }

      if (result.reason === sdk.ResultReason.NoMatch) {
        noMatchCount += 1;
        rawResults.push(rawResultFromSpeechResult(result));
      }
    };

    recognizer.canceled = (_sender: sdk.Recognizer, event: sdk.SpeechRecognitionCanceledEventArgs) => {
      const canceled = {
        reason: String(event.reason),
        error_code: event.errorCode == null ? null : String(event.errorCode),
        error_details: event.errorDetails || null,
      };

      if (event.reason === sdk.CancellationReason.Error) {
        cancelError = new Error(
          `azure speech canceled: ${canceled.reason}; ${canceled.error_details || "geen details"}`
        );
      }

      finalize({ canceled });
    };

    recognizer.sessionStopped = () => {
      finalize();
    };

    recognizer.startContinuousRecognitionAsync(
      () => {
        // started
      },
      (startErr: string) => {
        cancelError = new Error(String(startErr || "azure speech start failed"));
        finalize();
      }
    );
  });
}

export async function transcribeAudioBuffer(args: {
  buffer: Buffer;
  mimeType?: string | null;
  fileName?: string | null;
  speechPhrases?: any[];
}) {
  const { speechConfig, language } = getSpeechConfig();
  const speechPhrases = normalizePhraseList(args.speechPhrases);

  const tempName = `ember-assistant-${Date.now()}-${crypto.randomUUID()}.${extFromMime(args.mimeType)}`;
  const tempPath = path.join(os.tmpdir(), tempName);

  await fs.promises.writeFile(tempPath, args.buffer);

  const started = Date.now();

  try {
    const outcome = await recognizeContinuousFromWavFile({
      tempPath,
      speechConfig,
      speechPhrases,
      timeoutMs: Number(process.env.AZURE_SPEECH_TIMEOUT_MS || 120000),
    });

    const latencyMs = Date.now() - started;

    const transcript = outcome.rawResults
      .filter((item) => item.reason === String(sdk.ResultReason.RecognizedSpeech))
      .map((item) => item.text || "")
      .filter((text) => text.trim())
      .join(" ")
      .trim();

    if (!transcript) {
      return {
        transcript_text: "",
        normalized_text: "",
        language_code: language,
        provider: "azure-speech",
        provider_model: "speech-to-text-continuous-phrase-list",
        latency_ms: latencyMs,
        raw_response: {
          reason: "NoMatch",
          phrase_count: outcome.phraseCount,
          no_match_count: outcome.noMatchCount,
          canceled: outcome.canceled || null,
          results: outcome.rawResults,
        },
      };
    }

    return {
      transcript_text: transcript,
      normalized_text: normalizeTranscriptText(transcript, speechPhrases),
      language_code: language,
      provider: "azure-speech",
      provider_model: "speech-to-text-continuous-phrase-list",
      latency_ms: latencyMs,
      raw_response: {
        reason: "RecognizedSpeech",
        phrase_count: outcome.phraseCount,
        no_match_count: outcome.noMatchCount,
        canceled: outcome.canceled || null,
        results: outcome.rawResults,
      },
    };
  } finally {
    await fs.promises.unlink(tempPath).catch(() => undefined);
  }
}
