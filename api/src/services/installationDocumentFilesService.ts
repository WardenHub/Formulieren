// api/src/services/installationDocumentFilesService.ts

import crypto from "node:crypto";
import { sqlQuery } from "../db/index.js";
import {
  getInstallationDocumentContextSql,
  createInstallationDocumentReplacementSql,
  createInstallationDocumentAttachmentSql,
  setInstallationDocumentFileSql,
} from "../db/queries/installationDocuments.sql.js";
import {
  uploadInstallationDocumentBlob,
  deleteInstallationDocumentBlob,
  createInstallationDocumentDownloadUrl,
  downloadInstallationDocumentBlob,
} from "./blobStorageService.js";

function actorName(user: any) {
  return user?.name || user?.email || user?.objectId || "unknown";
}

function toNullableString(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function sha256Hex(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function getDocumentContext(code: string, documentId: string) {
  const rows = await sqlQuery(getInstallationDocumentContextSql, {
    code,
    documentId,
  });

  return rows?.[0] ?? null;
}

export async function createReplacementDocument(
  code: string,
  parentDocumentId: string,
  payload: any,
  user: any
) {
  const parent = await getDocumentContext(code, parentDocumentId);
  if (!parent) {
    throw new Error("parent document not found");
  }

  if (String(parent.relation_type || "").trim().toUpperCase() === "BIJLAGE") {
    throw new Error("parent document invalid");
  }

  const rows = await sqlQuery(createInstallationDocumentReplacementSql, {
    code,
    parentDocumentId,
    title: toNullableString(payload?.title),
    note: toNullableString(payload?.note),
    documentNumber: toNullableString(payload?.document_number),
    documentDate: payload?.document_date ?? null,
    revision: toNullableString(payload?.revision),
    createdBy: actorName(user),
  });

  return {
    ok: true,
    document: rows?.[0] ?? null,
  };
}

export async function createAttachmentDocument(
  code: string,
  parentDocumentId: string,
  payload: any,
  user: any
) {
  const parent = await getDocumentContext(code, parentDocumentId);
  if (!parent) {
    throw new Error("parent document not found");
  }

  if (String(parent.relation_type || "").trim().toUpperCase() === "BIJLAGE") {
    throw new Error("parent document invalid");
  }

  const rows = await sqlQuery(createInstallationDocumentAttachmentSql, {
    code,
    parentDocumentId,
    title: toNullableString(payload?.title),
    note: toNullableString(payload?.note),
    documentNumber: toNullableString(payload?.document_number),
    documentDate: payload?.document_date ?? null,
    revision: toNullableString(payload?.revision),
    createdBy: actorName(user),
  });

  return {
    ok: true,
    document: rows?.[0] ?? null,
  };
}

export async function uploadDocumentFile(
  code: string,
  documentId: string,
  file: Express.Multer.File,
  user: any
) {
  if (!file) {
    throw new Error("missing file");
  }

  const document = await getDocumentContext(code, documentId);
  if (!document) {
    throw new Error("document not found");
  }

  if (document.storage_key) {
    throw new Error("document already has file");
  }

  const checksum = sha256Hex(file.buffer);

  let uploaded: { storageProvider: string; storageKey: string; storageUrl: string | null } | null = null;

  try {
    uploaded = await uploadInstallationDocumentBlob({
      installationCode: code,
      documentId,
      fileName: file.originalname,
      contentType: file.mimetype || "application/octet-stream",
      buffer: file.buffer,
    });

    const rows = await sqlQuery(setInstallationDocumentFileSql, {
      code,
      documentId,
      fileName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      fileSizeBytes: file.size ?? file.buffer.length,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      checksumSha256: checksum,
      updatedBy: actorName(user),
    });

    return {
      ok: true,
      document: rows?.[0] ?? null,
    };
  } catch (err) {
    if (uploaded?.storageKey) {
      try {
        await deleteInstallationDocumentBlob(uploaded.storageKey);
      } catch (cleanupErr) {
        console.error("[document upload] blob cleanup failed", cleanupErr);
      }
    }
    throw err;
  }
}

export async function getDocumentDownloadUrl(
  code: string,
  documentId: string
) {
  const document = await getDocumentContext(code, documentId);
  if (!document) {
    throw new Error("document not found");
  }

  if (!document.storage_key) {
    throw new Error("document has no file");
  }

  const url = await createInstallationDocumentDownloadUrl({
    storageKey: String(document.storage_key),
    expiresInSeconds: 300,
    downloadFileName: document.file_name ?? null,
  });

  return {
    ok: true,
    url,
    expires_in_seconds: 300,
    file_name: document.file_name ?? null,
  };
}

function buildAttachmentDisposition(fileName: string | null) {
  const safe = String(fileName || "document").replace(/["\r\n]/g, "").trim() || "document";
  return `attachment; filename="${safe}"`;
}

export async function downloadDocumentFile(
  code: string,
  documentId: string
) {
  const document = await getDocumentContext(code, documentId);
  if (!document) {
    throw new Error("document not found");
  }

  if (!document.storage_key) {
    throw new Error("document has no file");
  }

  const blobResult = await downloadInstallationDocumentBlob(String(document.storage_key));

  return {
    ok: true,
    buffer: blobResult.buffer,
    contentType: document.mime_type || blobResult.contentType || "application/octet-stream",
    contentLength: blobResult.contentLength ?? blobResult.buffer.length,
    fileName: document.file_name ?? "document",
    contentDisposition: buildAttachmentDisposition(document.file_name ?? "document"),
  };
}