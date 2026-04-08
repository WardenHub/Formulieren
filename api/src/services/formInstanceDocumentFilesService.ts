// api/src/services/formInstanceDocumentFilesService.ts
import crypto from "node:crypto";
import { sqlQuery } from "../db/index.js";
import {
  getFormInstanceDocumentContextSql,
  getFormInstanceDocumentsSql,
  upsertFormInstanceDocumentsSql,
  setFormInstanceDocumentFileSql,
  createFormInstanceDocumentReplacementSql,
  createFormInstanceDocumentAttachmentSql,
  replaceFormInstanceDocumentLabelsSql,
  replaceFormInstanceDocumentFollowUpsSql,
  deleteFormInstanceDocumentSql,
} from "../db/queries/forms.sql.js";
import {
  uploadFormInstanceDocumentBlob,
  deleteFormInstanceDocumentBlob,
  createFormInstanceDocumentDownloadUrl,
  downloadFormInstanceDocumentBlob,
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

function parseJsonArray(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseImageMeta(file: Express.Multer.File) {
  const mime = String(file?.mimetype || "").toLowerCase();
  const wantsImageMeta =
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/png" ||
    mime === "image/webp";

  return {
    imageWidthPx: null as number | null,
    imageHeightPx: null as number | null,
    wantsImageMeta,
  };
}

function buildAttachmentDisposition(fileName: string | null) {
  const safe = String(fileName || "document").replace(/["\r\n]/g, "").trim() || "document";
  return `attachment; filename="${safe}"`;
}

export async function getFormInstanceDocumentContext(
  code: string,
  instanceId: string | number,
  documentId: string
) {
  const rows = await sqlQuery(getFormInstanceDocumentContextSql, {
    code,
    instanceId,
    documentId,
  });

  return rows?.[0] ?? null;
}

export async function getFormInstanceDocuments(
  code: string,
  instanceId: string | number
) {
  const rows = await sqlQuery(getFormInstanceDocumentsSql, {
    code,
    instanceId,
  });

  const items = Array.isArray(rows)
    ? rows.map((r: any) => ({
        form_instance_document_id: r.form_instance_document_id,
        form_instance_id: Number(r.form_instance_id),
        parent_document_id: r.parent_document_id ?? null,
        relation_type: r.relation_type ?? null,
        title: r.title ?? null,
        note: r.note ?? null,
        document_number: r.document_number ?? null,
        document_date: r.document_date ?? null,
        revision: r.revision ?? null,
        file_name: r.file_name ?? null,
        mime_type: r.mime_type ?? null,
        file_size_bytes: r.file_size_bytes == null ? null : Number(r.file_size_bytes),
        uploaded_at: r.uploaded_at ?? null,
        uploaded_by: r.uploaded_by ?? null,
        file_last_modified_at: r.file_last_modified_at ?? null,
        file_last_modified_by: r.file_last_modified_by ?? null,
        storage_provider: r.storage_provider ?? null,
        storage_key: r.storage_key ?? null,
        storage_url: r.storage_url ?? null,
        checksum_sha256: r.checksum_sha256 ?? null,
        source_system: r.source_system ?? null,
        source_reference: r.source_reference ?? null,
        image_width_px: r.image_width_px == null ? null : Number(r.image_width_px),
        image_height_px: r.image_height_px == null ? null : Number(r.image_height_px),
        image_variant: r.image_variant ?? null,
        is_active: r.is_active === false ? false : Number(r.is_active ?? 1) === 1,
        created_at: r.created_at ?? null,
        created_by: r.created_by ?? null,
        updated_at: r.updated_at ?? null,
        updated_by: r.updated_by ?? null,
        labels: parseJsonArray(r.labels_json),
        follow_ups: parseJsonArray(r.follow_ups_json),
      }))
    : [];

  return { items };
}

export async function upsertFormInstanceDocuments(
  code: string,
  instanceId: string | number,
  items: any[],
  user: any
) {
  const rows = await sqlQuery(upsertFormInstanceDocumentsSql, {
    code,
    instanceId,
    itemsJson: JSON.stringify(Array.isArray(items) ? items : []),
    updatedBy: actorName(user),
  });

  return {
    ok: true,
    items: Array.isArray(rows) ? rows : [],
  };
}

export async function createReplacementDocument(
  code: string,
  instanceId: string | number,
  parentDocumentId: string,
  payload: any,
  user: any
) {
  const parent = await getFormInstanceDocumentContext(code, instanceId, parentDocumentId);
  if (!parent) {
    throw new Error("parent document not found");
  }

  if (String(parent.relation_type || "").trim().toUpperCase() === "BIJLAGE") {
    throw new Error("parent document invalid");
  }

  const rows = await sqlQuery(createFormInstanceDocumentReplacementSql, {
    code,
    instanceId,
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
  instanceId: string | number,
  parentDocumentId: string,
  payload: any,
  user: any
) {
  const parent = await getFormInstanceDocumentContext(code, instanceId, parentDocumentId);
  if (!parent) {
    throw new Error("parent document not found");
  }

  if (String(parent.relation_type || "").trim().toUpperCase() === "BIJLAGE") {
    throw new Error("parent document invalid");
  }

  const rows = await sqlQuery(createFormInstanceDocumentAttachmentSql, {
    code,
    instanceId,
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

export async function replaceDocumentLabels(
  code: string,
  instanceId: string | number,
  documentId: string,
  labels: any[],
  user: any
) {
  const rows = await sqlQuery(replaceFormInstanceDocumentLabelsSql, {
    code,
    instanceId,
    documentId,
    labelsJson: JSON.stringify(Array.isArray(labels) ? labels : []),
    updatedBy: actorName(user),
  });

  return {
    ok: true,
    labels: Array.isArray(rows) ? rows : [],
  };
}

export async function replaceDocumentFollowUps(
  code: string,
  instanceId: string | number,
  documentId: string,
  items: any[],
  user: any
) {
  const rows = await sqlQuery(replaceFormInstanceDocumentFollowUpsSql, {
    code,
    instanceId,
    documentId,
    itemsJson: JSON.stringify(Array.isArray(items) ? items : []),
    updatedBy: actorName(user),
  });

  return {
    ok: true,
    follow_ups: Array.isArray(rows) ? rows : [],
  };
}

export async function uploadDocumentFile(
  code: string,
  instanceId: string | number,
  documentId: string,
  file: Express.Multer.File,
  user: any
) {
  if (!file) {
    throw new Error("missing file");
  }

  const document = await getFormInstanceDocumentContext(code, instanceId, documentId);
  if (!document) {
    throw new Error("document not found");
  }

  if (document.storage_key) {
    throw new Error("document already has file");
  }

  const checksum = sha256Hex(file.buffer);
  const imageMeta = parseImageMeta(file);

  let uploaded: {
    storageProvider: string;
    storageKey: string;
    storageUrl: string | null;
  } | null = null;

  try {
    uploaded = await uploadFormInstanceDocumentBlob({
      installationCode: code,
      formInstanceId: String(instanceId),
      documentId,
      fileName: file.originalname,
      contentType: file.mimetype || "application/octet-stream",
      buffer: file.buffer,
    });

    const rows = await sqlQuery(setFormInstanceDocumentFileSql, {
      code,
      instanceId,
      documentId,
      fileName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      fileSizeBytes: file.size ?? file.buffer.length,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      checksumSha256: checksum,
      imageWidthPx: imageMeta.imageWidthPx,
      imageHeightPx: imageMeta.imageHeightPx,
      updatedBy: actorName(user),
    });

    return {
      ok: true,
      document: rows?.[0] ?? null,
    };
  } catch (err) {
    if (uploaded?.storageKey) {
      try {
        await deleteFormInstanceDocumentBlob(uploaded.storageKey);
      } catch (cleanupErr) {
        console.error("[form instance document upload] blob cleanup failed", cleanupErr);
      }
    }
    throw err;
  }
}

export async function getDocumentDownloadUrl(
  code: string,
  instanceId: string | number,
  documentId: string
) {
  const document = await getFormInstanceDocumentContext(code, instanceId, documentId);
  if (!document) {
    throw new Error("document not found");
  }

  if (!document.storage_key) {
    throw new Error("document has no file");
  }

  const url = await createFormInstanceDocumentDownloadUrl({
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

export async function downloadDocumentFile(
  code: string,
  instanceId: string | number,
  documentId: string
) {
  const document = await getFormInstanceDocumentContext(code, instanceId, documentId);
  if (!document) {
    throw new Error("document not found");
  }

  if (!document.storage_key) {
    throw new Error("document has no file");
  }

  const blobResult = await downloadFormInstanceDocumentBlob(String(document.storage_key));

  return {
    ok: true,
    buffer: blobResult.buffer,
    contentType: document.mime_type || blobResult.contentType || "application/octet-stream",
    contentLength: blobResult.contentLength ?? blobResult.buffer.length,
    fileName: document.file_name ?? "document",
    contentDisposition: buildAttachmentDisposition(document.file_name ?? "document"),
  };
}

export async function deleteDocument(
  code: string,
  instanceId: string | number,
  documentId: string,
  user: any
) {
  const document = await getFormInstanceDocumentContext(code, instanceId, documentId);
  if (!document) {
    throw new Error("form instance document not found");
  }

  if (String(document.form_instance_status || "").toUpperCase() !== "CONCEPT") {
    throw new Error("form instance not editable");
  }

  if (document.storage_key) {
    await deleteFormInstanceDocumentBlob(String(document.storage_key));
  }

  const rows = await sqlQuery(deleteFormInstanceDocumentSql, {
    code,
    instanceId,
    documentId,
    updatedBy: actorName(user),
  });

  return {
    ok: true,
    result: rows?.[0] ?? null,
  };
}