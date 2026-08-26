import crypto, { randomUUID } from "node:crypto";
import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import {
  beginInstallationLogbookSyncSql,
  finishInstallationLogbookSyncSql,
  getInstallationLogbookSql,
  getInstallationLogbookReimportContextSql,
  getInstallationLogbookTrackedDocumentsSql,
  getInstallationLogbookUndoCandidatesSql,
  importInstallationLogbookDocumentSql,
  markInstallationLogbookDocumentUndoneSql,
  markInstallationLogbookDocumentSkippedSql,
  recordInstallationLogbookSyncFailureSql,
  reimportInstallationLogbookDocumentSql,
  restoreInstallationLogbookDocumentAfterUndoFailureSql,
  upsertInstallationLogbookSql,
} from "../db/queries/installationLogbook.sql.js";
import {
  downloadDigiLogDocument,
  getDigiLog,
  scanDigiLogDocuments,
} from "./digitaalLogboekClient.js";
import {
  deleteInstallationDocumentBlob,
  uploadInstallationDocumentBlob,
} from "./blobStorageService.js";
import { assertInstallationWritable } from "./installationsService.js";
import { getUserAuditActor } from "../utils/userIdentity.js";

const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES || 25 * 1024 * 1024);

function asUuid(value: any, errorMessage: string) {
  const text = String(value || "").trim();
  if (!UUID_RE.test(text)) throw new Error(errorMessage);
  return text.toLowerCase();
}

export function parseDigiLogReference(value: any) {
  const text = String(value || "").trim();
  if (UUID_RE.test(text)) return text.toLowerCase();

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("digilog reference invalid");
  }

  const allowedHosts = new Set(["digitaallogboek.com", "www.digitaallogboek.com"]);
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== "https:"
    || !allowedHosts.has(url.hostname.toLowerCase())
    || pathParts.length !== 2
    || pathParts[0].toLowerCase() !== "digilogs"
    || !UUID_RE.test(pathParts[1])
  ) {
    throw new Error("digilog reference invalid");
  }

  return pathParts[1].toLowerCase();
}

function nullableText(value: any, maxLength = 1000) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function sameRemoteVersion(a: any, b: any) {
  const left = new Date(a || 0).getTime();
  const right = new Date(b || 0).getTime();
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function normalizeRemoteDocument(row: any) {
  const id = asUuid(row?.id, "remote document id invalid");
  const modified = new Date(row?.timeLastModified || "");
  if (Number.isNaN(modified.getTime())) throw new Error("remote document version invalid");
  const extension = String(row?.fileExtension || "").trim().replace(/^\./, "").toLowerCase();
  const rawName = String(row?.name || `document-${id}`).replace(/[\\/\r\n]/g, "-").trim();
  const fileName = extension && !rawName.toLowerCase().endsWith(`.${extension}`)
    ? `${rawName}.${extension}`
    : rawName;

  return {
    remote_document_id: id,
    remote_time_last_modified: modified.toISOString(),
    remote_created: row?.created || null,
    remote_name: fileName.slice(0, 260),
    remote_type_title: nullableText(row?.templateDocumentTypeTitle, 250),
    remote_folder_id: row?.folderId && UUID_RE.test(String(row.folderId)) ? String(row.folderId) : null,
    remote_folder_name: nullableText(row?.folderName, 250),
    remote_file_extension: extension ? extension.slice(0, 20) : null,
    remote_mime_type: nullableText(row?.mimeType, 100),
    remote_created_by: nullableText(row?.createdByName, 250),
  };
}

function detectedMimeType(buffer: Buffer, extension: string | null) {
  const ext = String(extension || "").toLowerCase();
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return ext === "pdf" ? "application/pdf" : null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return ext === "png" ? "image/png" : null;
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ["jpg", "jpeg"].includes(ext) ? "image/jpeg" : null;
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    if (ext === "doc") return "application/msword";
    if (ext === "xls") return "application/vnd.ms-excel";
    return null;
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return null;
  }
  if (["txt", "csv"].includes(ext) && !buffer.subarray(0, 4096).includes(0)) {
    return ext === "csv" ? "text/csv" : "text/plain";
  }
  return null;
}

function documentParams(logbookId: string, document: any, updatedBy: string) {
  return {
    installationLogbookId: logbookId,
    remoteDocumentId: document.remote_document_id,
    remoteTimeLastModified: document.remote_time_last_modified,
    remoteName: document.remote_name,
    remoteTypeTitle: document.remote_type_title,
    remoteFolderId: document.remote_folder_id,
    remoteFolderName: document.remote_folder_name,
    remoteFileExtension: document.remote_file_extension,
    remoteMimeType: document.remote_mime_type,
    updatedBy,
  };
}

export async function getInstallationLogbook(code: string) {
  const result: any = await sqlQueryRaw(getInstallationLogbookSql, { code: String(code || "").trim() });
  const importedDocuments = result?.recordsets?.[2] ?? [];
  const documentsBySync = new Map<string, any[]>();
  for (const document of importedDocuments) {
    const syncId = String(document.installation_logbook_sync_id || "");
    if (!syncId) continue;
    const current = documentsBySync.get(syncId) || [];
    current.push(document);
    documentsBySync.set(syncId, current);
  }

  return {
    logbook: result?.recordsets?.[0]?.[0] ?? null,
    history: (result?.recordsets?.[1] ?? []).map((row: any) => ({
      ...row,
      imported_documents: documentsBySync.get(String(row.installation_logbook_sync_id || "")) || [],
    })),
  };
}

export async function linkInstallationLogbook(code: string, payload: any, user: any) {
  await assertInstallationWritable(code);
  const digiLogId = parseDigiLogReference(payload?.digilog_id);
  const remote: any = await getDigiLog(digiLogId);
  if (String(remote?.id || "").toLowerCase() !== digiLogId) throw new Error("digilog not found");

  const rows = await sqlQuery(upsertInstallationLogbookSql, {
    code: String(code || "").trim(),
    digiLogId,
    digiLogTitle: nullableText(remote?.title, 250),
    digiLogUrl: `https://www.digitaallogboek.com/digilogs/${digiLogId}`,
    updatedBy: getUserAuditActor(user),
  });
  return { ok: true, logbook: rows?.[0] ?? null };
}

async function scanPending(logbook: any) {
  const remoteLogbook: any = await getDigiLog(String(logbook.digilog_id));
  const remoteRows = await scanDigiLogDocuments(String(logbook.digilog_id));
  const documents = remoteRows.map(normalizeRemoteDocument);
  const trackedRows: any[] = await sqlQuery(getInstallationLogbookTrackedDocumentsSql, {
    installationLogbookId: logbook.installation_logbook_id,
  });
  const tracked = new Map(trackedRows.map((row) => [String(row.remote_document_id).toLowerCase(), row]));
  const pending = documents.filter((document: any) => {
    const current: any = tracked.get(document.remote_document_id);
    return !current || !sameRemoteVersion(current.handled_remote_time_last_modified, document.remote_time_last_modified);
  });
  const pendingIds = new Set(pending.map((document: any) => document.remote_document_id));
  const selectable = documents.map((document: any) => {
    const current: any = tracked.get(document.remote_document_id);
    const handledStatus = String(current?.handled_status || "").toUpperCase();
    const category = pendingIds.has(document.remote_document_id)
      ? "PENDING"
      : (handledStatus === "SKIPPED" ? "SKIPPED" : "IMPORTED");
    return { ...document, sync_category: category };
  });
  return { remoteLogbook, documents, pending, selectable };
}

export async function previewInstallationLogbookSync(code: string) {
  const status = await getInstallationLogbook(code);
  if (!status.logbook) throw new Error("installation logbook not linked");
  const scanned = await scanPending(status.logbook);
  return {
    ok: true,
    scanned_at: new Date().toISOString(),
    remote_document_count: scanned.documents.length,
    pending_documents: scanned.selectable,
  };
}

export async function synchronizeInstallationLogbook(code: string, payload: any, user: any) {
  await assertInstallationWritable(code);
  const status = await getInstallationLogbook(code);
  const logbook = status.logbook;
  if (!logbook) throw new Error("installation logbook not linked");

  const scanned = await scanPending(logbook);
  const decisions = Array.isArray(payload?.decisions) ? payload.decisions : [];
  const decisionById = new Map<string, any>();
  for (const decision of decisions) {
    const id = asUuid(decision?.remote_document_id, "sync decision invalid");
    if (decisionById.has(id)) throw new Error("sync decision duplicate");
    decisionById.set(id, decision);
  }

  const selectableIds = new Set(scanned.selectable.map((document: any) => document.remote_document_id));
  if (decisionById.size !== selectableIds.size || [...decisionById.keys()].some((id) => !selectableIds.has(id))) {
    throw new Error("sync preview stale");
  }
  for (const document of scanned.selectable) {
    const decision = decisionById.get(document.remote_document_id);
    if (!sameRemoteVersion(decision?.remote_time_last_modified, document.remote_time_last_modified)) {
      throw new Error("sync preview stale");
    }
    const action = String(decision?.action || "").toUpperCase();
    if (!['IMPORT', 'SKIP', 'NONE'].includes(action)) throw new Error("sync decision invalid");
    if (action === "SKIP" && document.sync_category !== "PENDING") throw new Error("sync decision invalid");
    if (action === "NONE" && document.sync_category === "PENDING") throw new Error("sync decision invalid");
    if (action === 'IMPORT' && !String(decision?.document_type_key || "").trim()) {
      throw new Error("document type required");
    }
  }

  const actor = getUserAuditActor(user);
  const syncId = randomUUID();
  await sqlQuery(beginInstallationLogbookSyncSql, {
    syncId,
    installationLogbookId: logbook.installation_logbook_id,
    remoteDocumentCount: scanned.documents.length,
    pendingDocumentCount: scanned.selectable.length,
    createdBy: actor,
  });

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors: Array<{ remote_document_id: string; error: string }> = [];

  for (const document of scanned.selectable) {
    const decision = decisionById.get(document.remote_document_id);
    if (String(decision.action).toUpperCase() === "NONE") continue;
    if (String(decision.action).toUpperCase() === "SKIP") {
      try {
        await sqlQuery(markInstallationLogbookDocumentSkippedSql, {
          ...documentParams(logbook.installation_logbook_id, document, actor),
          syncId,
        });
        skippedCount += 1;
      } catch (error: any) {
        failedCount += 1;
        errors.push({ remote_document_id: document.remote_document_id, error: "overslaan kon niet worden opgeslagen" });
        try {
          await sqlQuery(recordInstallationLogbookSyncFailureSql, {
            syncId,
            remoteDocumentId: document.remote_document_id,
            documentTypeKey: null,
            action: "SKIP",
            remoteName: document.remote_name,
            remoteTimeLastModified: document.remote_time_last_modified,
            errorMessage: nullableText(error?.message, 1000) || "overslaan kon niet worden opgeslagen",
          });
        } catch { /* hoofdfout blijft leidend */ }
      }
      continue;
    }

    let uploaded: any = null;
    try {
      const downloaded = await downloadDigiLogDocument(String(logbook.digilog_id), document.remote_document_id);
      if (!downloaded.buffer.length) throw new Error("remote file is empty");
      if (downloaded.buffer.length > MAX_FILE_BYTES) throw new Error("remote file exceeds size limit");
      const mimeType = detectedMimeType(downloaded.buffer, document.remote_file_extension);
      if (!mimeType) throw new Error("remote file type or signature is not supported");

      const documentId = randomUUID();
      uploaded = await uploadInstallationDocumentBlob({
        installationCode: code,
        documentId,
        fileName: document.remote_name,
        contentType: mimeType,
        buffer: downloaded.buffer,
      });
      const checksum = crypto.createHash("sha256").update(downloaded.buffer).digest("hex");
      await sqlQuery(importInstallationLogbookDocumentSql, {
        ...documentParams(logbook.installation_logbook_id, document, actor),
        syncId,
        code,
        documentId,
        documentTypeKey: String(decision.document_type_key).trim(),
        remoteCreated: document.remote_created,
        fileName: document.remote_name,
        mimeType,
        fileSizeBytes: downloaded.buffer.length,
        storageProvider: uploaded.storageProvider,
        storageKey: uploaded.storageKey,
        storageUrl: uploaded.storageUrl,
        checksumSha256: checksum,
        sourceReference: `${logbook.digilog_id}/${document.remote_document_id}@${document.remote_time_last_modified}`,
      });
      importedCount += 1;
    } catch (error: any) {
      if (uploaded?.storageKey) {
        try { await deleteInstallationDocumentBlob(uploaded.storageKey); } catch { /* best effort cleanup */ }
      }
      failedCount += 1;
      errors.push({ remote_document_id: document.remote_document_id, error: nullableText(error?.message, 250) || "import failed" });
      try {
        await sqlQuery(recordInstallationLogbookSyncFailureSql, {
          syncId,
          remoteDocumentId: document.remote_document_id,
          documentTypeKey: String(decision.document_type_key || "").trim() || null,
          action: "IMPORT",
          remoteName: document.remote_name,
          remoteTimeLastModified: document.remote_time_last_modified,
          errorMessage: nullableText(error?.message, 1000) || "import failed",
        });
      } catch { /* hoofdfout blijft leidend */ }
    }
  }

  const finalStatus = failedCount === 0 ? "COMPLETED" : (importedCount + skippedCount > 0 ? "PARTIAL" : "FAILED");
  const errorMessage = errors.length ? errors.map((item) => `${item.remote_document_id}: ${item.error}`).join("; ").slice(0, 1000) : null;
  await sqlQuery(finishInstallationLogbookSyncSql, {
    syncId,
    installationLogbookId: logbook.installation_logbook_id,
    status: finalStatus,
    importedCount,
    skippedCount,
    failedCount,
    errorMessage,
    digiLogTitle: nullableText(scanned.remoteLogbook?.title, 250),
    updatedBy: actor,
  });

  return { ok: failedCount === 0, status: finalStatus, imported_count: importedCount, skipped_count: skippedCount, failed_count: failedCount, errors };
}

export async function undoInstallationLogbookSync(code: string, syncIdValue: any, payload: any, user: any) {
  await assertInstallationWritable(code);
  const syncId = asUuid(syncIdValue, "logbook sync id invalid");
  const requestedIds = Array.isArray(payload?.document_ids)
    ? [...new Set(payload.document_ids.map((value: any) => asUuid(value, "logbook document id invalid")))]
    : [];
  if (requestedIds.length > 100) throw new Error("too many logbook documents");

  const rows: any[] = await sqlQuery(getInstallationLogbookUndoCandidatesSql, {
    code: String(code || "").trim(),
    syncId,
    documentIdsJson: requestedIds.length ? JSON.stringify(requestedIds) : null,
  });
  if (!rows.length || (requestedIds.length && rows.length !== requestedIds.length)) {
    throw new Error("logbook sync documents not removable");
  }
  if (rows.some((row) => Number(row.active_related_document_count || 0) > 0)) {
    throw new Error("logbook document has active related documents");
  }
  if (rows.some((row) => Number(row.audit_reference_count || 0) > 0)) {
    throw new Error("logbook document has audit references");
  }

  const actor = getUserAuditActor(user);
  const removed: string[] = [];
  const errors: Array<{ document_id: string; error: string }> = [];

  for (const row of rows) {
    const params = {
      code: String(code || "").trim(),
      syncDocumentId: row.installation_logbook_sync_document_id,
      documentId: row.installation_document_id,
      updatedBy: actor,
    };
    try {
      await sqlQuery(markInstallationLogbookDocumentUndoneSql, params);
      try {
        if (row.storage_key) await deleteInstallationDocumentBlob(String(row.storage_key));
      } catch (blobError: any) {
        await sqlQuery(restoreInstallationLogbookDocumentAfterUndoFailureSql, {
          ...params,
          storageProvider: row.storage_provider ?? null,
          storageKey: row.storage_key ?? null,
          storageUrl: row.storage_url ?? null,
          checksumSha256: row.checksum_sha256 ?? null,
        });
        throw blobError;
      }
      removed.push(String(row.installation_document_id));
    } catch (error: any) {
      errors.push({
        document_id: String(row.installation_document_id),
        error: nullableText(error?.message, 250) || "verwijderen is mislukt",
      });
    }
  }

  return {
    ok: errors.length === 0,
    removed_count: removed.length,
    removed_document_ids: removed,
    failed_count: errors.length,
    errors,
  };
}

export async function reimportInstallationLogbookDocument(code: string, documentIdValue: any, user: any) {
  await assertInstallationWritable(code);
  const documentId = asUuid(documentIdValue, "logbook document id invalid");
  const contextRows: any[] = await sqlQuery(getInstallationLogbookReimportContextSql, {
    code: String(code || "").trim(),
    documentId,
  });
  const context = contextRows[0];
  if (!context) throw new Error("logbook document not found");
  if (context.is_active || context.storage_key) throw new Error("logbook document already active");

  const [remoteLogbook, remoteRows] = await Promise.all([
    getDigiLog(String(context.digilog_id)),
    scanDigiLogDocuments(String(context.digilog_id)),
  ]);
  const remote = remoteRows
    .map(normalizeRemoteDocument)
    .find((item: any) => item.remote_document_id === String(context.remote_document_id).toLowerCase());
  if (!remote) throw new Error("remote logbook document not found");

  const actor = getUserAuditActor(user);
  const syncId = randomUUID();
  await sqlQuery(beginInstallationLogbookSyncSql, {
    syncId,
    installationLogbookId: context.installation_logbook_id,
    remoteDocumentCount: 1,
    pendingDocumentCount: 1,
    createdBy: actor,
  });

  let uploaded: any = null;
  try {
    const downloaded = await downloadDigiLogDocument(String(context.digilog_id), remote.remote_document_id);
    if (!downloaded.buffer.length) throw new Error("remote file is empty");
    if (downloaded.buffer.length > MAX_FILE_BYTES) throw new Error("remote file exceeds size limit");
    const mimeType = detectedMimeType(downloaded.buffer, remote.remote_file_extension);
    if (!mimeType) throw new Error("remote file type or signature is not supported");

    uploaded = await uploadInstallationDocumentBlob({
      installationCode: code,
      documentId,
      fileName: remote.remote_name,
      contentType: mimeType,
      buffer: downloaded.buffer,
    });
    const checksum = crypto.createHash("sha256").update(downloaded.buffer).digest("hex");
    await sqlQuery(reimportInstallationLogbookDocumentSql, {
      ...documentParams(context.installation_logbook_id, remote, actor),
      syncId,
      code: String(code || "").trim(),
      documentId,
      documentTypeKey: context.document_type_key,
      remoteCreated: remote.remote_created,
      fileName: remote.remote_name,
      mimeType,
      fileSizeBytes: downloaded.buffer.length,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      checksumSha256: checksum,
      sourceReference: `${context.digilog_id}/${remote.remote_document_id}@${remote.remote_time_last_modified}`,
    });
    await sqlQuery(finishInstallationLogbookSyncSql, {
      syncId,
      installationLogbookId: context.installation_logbook_id,
      status: "COMPLETED",
      importedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      errorMessage: null,
      digiLogTitle: nullableText((remoteLogbook as any)?.title, 250),
      updatedBy: actor,
    });
    return { ok: true, status: "COMPLETED", imported_count: 1, document_id: documentId };
  } catch (error: any) {
    if (uploaded?.storageKey) {
      try { await deleteInstallationDocumentBlob(uploaded.storageKey); } catch { /* best effort cleanup */ }
    }
    const errorMessage = nullableText(error?.message, 1000) || "opnieuw synchroniseren is mislukt";
    try {
      await sqlQuery(recordInstallationLogbookSyncFailureSql, {
        syncId,
        remoteDocumentId: remote.remote_document_id,
        documentTypeKey: context.document_type_key,
        action: "REIMPORT",
        remoteName: remote.remote_name,
        remoteTimeLastModified: remote.remote_time_last_modified,
        errorMessage,
      });
      await sqlQuery(finishInstallationLogbookSyncSql, {
        syncId,
        installationLogbookId: context.installation_logbook_id,
        status: "FAILED",
        importedCount: 0,
        skippedCount: 0,
        failedCount: 1,
        errorMessage,
        digiLogTitle: nullableText((remoteLogbook as any)?.title, 250),
        updatedBy: actor,
      });
    } catch { /* oorspronkelijke fout blijft leidend */ }
    throw error;
  }
}
