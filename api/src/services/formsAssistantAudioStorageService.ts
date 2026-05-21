// api/src/services/formsAssistantAudioStorageService.ts

import crypto from "node:crypto";
import path from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";

function cleanPart(value: any, fallback: string) {
  const txt = String(value || "").trim() || fallback;
  return txt
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 160);
}

function getExtension(fileName: any, mimeType: any) {
  const ext = path.extname(String(fileName || "")).replace(".", "").toLowerCase();
  if (ext) return ext;

  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";

  return "webm";
}

function getConnectionString() {
  return (
    process.env.ASSISTANT_AUDIO_STORAGE_CONNECTION_STRING ||
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    process.env.BLOB_STORAGE_CONNECTION_STRING ||
    ""
  ).trim();
}

function getContainerName() {
  return (
    process.env.ASSISTANT_AUDIO_CONTAINER ||
    process.env.AZURE_STORAGE_AUDIO_CONTAINER_NAME ||
    "audio"
  ).trim();
}

export function sha256Hex(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function uploadAssistantAudioToBlob(args: {
  buffer: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
  code: string;
  formInstanceId: number;
  assistantSessionId: number;
  assistantTurnId: number;
}) {
  const connectionString = getConnectionString();
  if (!connectionString) {
    return {
      storage_provider: null,
      storage_key: null,
      storage_url: null,
      checksum_sha256: sha256Hex(args.buffer),
      skipped: true,
      reason: "missing storage connection string",
    };
  }

  const containerName = getContainerName();
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  const container = blobService.getContainerClient(containerName);
  await container.createIfNotExists();

  const ext = getExtension(args.fileName, args.mimeType);
  const safeCode = cleanPart(args.code, "installation");
  const safeOriginal = cleanPart(args.fileName || `audio.${ext}`, `audio.${ext}`);

  const storageKey = [
    "form-assistant",
    safeCode,
    String(args.formInstanceId),
    String(args.assistantSessionId),
    `${Date.now()}-${args.assistantTurnId}-${safeOriginal}`,
  ].join("/");

  const blockBlob = container.getBlockBlobClient(storageKey);

  await blockBlob.uploadData(args.buffer, {
    blobHTTPHeaders: {
      blobContentType: args.mimeType || "application/octet-stream",
    },
    metadata: {
      atriumInstallationCode: safeCode.slice(0, 128),
      formInstanceId: String(args.formInstanceId),
      assistantSessionId: String(args.assistantSessionId),
      assistantTurnId: String(args.assistantTurnId),
    },
  });

  return {
    storage_provider: "blob",
    storage_key: storageKey,
    storage_url: blockBlob.url,
    checksum_sha256: sha256Hex(args.buffer),
    skipped: false,
    reason: null,
  };
}