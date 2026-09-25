import crypto from "node:crypto";
import { sqlQuery } from "../db/index.js";
import {
  getInstallationDocumentStampContextSql,
  insertInstallationDocumentStampSql,
} from "../db/queries/installationDocumentStamps.sql.js";
import {
  deleteInstallationDocumentStampBlob,
  downloadInstallationDocumentBlob,
  uploadInstallationDocumentStampBlob,
} from "./blobStorageService.js";
import { assertInstallationWritable } from "./installationsService.js";
import { getEntraJobTitle } from "./entraUserProfileService.js";
import {
  applyDocumentStamp,
  DOCUMENT_STAMP_TYPES,
  type DocumentStampType,
} from "./documentStampPdfService.js";
import {
  getUserAuditActor,
  getUserDisplayNameSnapshot,
  getUserObjectId,
} from "../utils/userIdentity.js";
import { isOriginalDocumentUploader, isValidSelfApprovalReason } from "./documentStampPolicy.js";

function numberInRange(value: unknown, min: number, max: number, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${field} invalid`);
  return parsed;
}

function normalizeStampType(value: unknown): DocumentStampType {
  const clean = String(value || "").trim().toUpperCase() as DocumentStampType;
  if (!DOCUMENT_STAMP_TYPES.includes(clean)) throw new Error("stamp type invalid");
  return clean;
}

function isPdf(context: any) {
  const mime = String(context?.effective_mime_type || context?.original_mime_type || "").toLowerCase();
  const fileName = String(context?.effective_file_name || context?.original_file_name || "").toLowerCase();
  return mime === "application/pdf" || fileName.endsWith(".pdf");
}

function stampedFileName(fileName: unknown) {
  const clean = String(fileName || "document.pdf").trim() || "document.pdf";
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
}

export async function addInstallationDocumentStamp(
  code: string,
  documentId: string,
  payload: any,
  user: any
) {
  await assertInstallationWritable(code);

  const stampType = normalizeStampType(payload?.stamp_type);
  const pageNumber = Math.trunc(numberInRange(payload?.page_number, 1, 100000, "stamp page"));
  const xNormalized = numberInRange(payload?.x_normalized, 0, 1, "stamp x");
  const yNormalized = numberInRange(payload?.y_normalized, 0, 1, "stamp y");
  const widthNormalized = numberInRange(payload?.width_normalized, 0.12, 0.5, "stamp width");
  const actorUserObjectId = getUserObjectId(user);
  if (!actorUserObjectId) throw new Error("user object id missing");

  let contexts: any[];
  try {
    contexts = await sqlQuery(getInstallationDocumentStampContextSql, { code, documentId });
  } catch (error: any) {
    if (String(error?.message || error).includes("Invalid object name 'dbo.InstallationDocumentStamp'")) {
      throw new Error("document stamp migration required");
    }
    throw error;
  }
  const context = contexts?.[0];
  if (!context) throw new Error("document not found");
  if (!context.is_active) throw new Error("document inactive");
  if (!isPdf(context)) throw new Error("document must be pdf");
  if (context.is_signed === true) throw new Error("signed document cannot be stamped");
  if (!context.effective_storage_key || !context.effective_stored_file_id) throw new Error("document has no file");

  // Wie zijn eigen upload aftekent mag dat, mits hij zegt waarom; het komt met zijn naam op
  // het stempel te staan. Zie documentStampPolicy.
  let selfApprovalOverride = false;
  const selfApprovalReason = String(payload?.self_approval_reason || "").trim();

  if (stampType === "GECONTROLEERD") {
    if (!context.original_uploaded_by) throw new Error("original uploader unknown");

    if (isOriginalDocumentUploader(user, context.original_uploaded_by)) {
      if (payload?.self_approval_override !== true) {
        throw new Error("original uploader cannot approve document");
      }
      if (!isValidSelfApprovalReason(selfApprovalReason)) {
        throw new Error("self approval reason required");
      }

      selfApprovalOverride = true;
    }
  }

  const actorJobTitle = await getEntraJobTitle(actorUserObjectId);
  if (!actorJobTitle) throw new Error("entra job title missing");

  const actorDisplayName = getUserDisplayNameSnapshot(user);
  const source = await downloadInstallationDocumentBlob(String(context.effective_storage_key));
  const stampedAt = new Date();
  const rendered = await applyDocumentStamp({
    sourcePdf: source.buffer,
    stampType,
    pageNumber,
    xNormalized,
    yNormalized,
    widthNormalized,
    displayName: actorDisplayName,
    jobTitle: actorJobTitle,
    stampedAt,
  });

  const documentStampId = crypto.randomUUID();
  const resultStoredFileId = crypto.randomUUID();
  const fileName = stampedFileName(context.original_file_name);
  const checksumSha256 = crypto.createHash("sha256").update(rendered.buffer).digest("hex");
  let uploaded: Awaited<ReturnType<typeof uploadInstallationDocumentStampBlob>> | null = null;

  try {
    uploaded = await uploadInstallationDocumentStampBlob({
      installationCode: code,
      documentId,
      documentStampId,
      fileName,
      buffer: rendered.buffer,
    });

    const rows = await sqlQuery(insertInstallationDocumentStampSql, {
      code,
      documentId,
      expectedSourceStoredFileId: context.effective_stored_file_id,
      documentStampId,
      resultStoredFileId,
      storageProvider: uploaded.storageProvider,
      storageContainer: uploaded.storageContainer,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      selfApprovalOverride: selfApprovalOverride ? 1 : 0,
      selfApprovalReason: selfApprovalOverride ? selfApprovalReason : null,
      fileName,
      fileSizeBytes: rendered.buffer.length,
      checksumSha256,
      stampType,
      pageNumber,
      xNormalized,
      yNormalized,
      widthNormalized,
      actorUserObjectId,
      actorDisplayName,
      actorJobTitle,
      actor: getUserAuditActor(user),
    });

    return { ok: true, stamp: rows?.[0] ?? null };
  } catch (error) {
    if (uploaded?.storageKey) {
      try {
        await deleteInstallationDocumentStampBlob(uploaded.storageKey);
      } catch (cleanupError) {
        console.error("[document stamp] blob cleanup failed", cleanupError);
      }
    }
    throw error;
  }
}
