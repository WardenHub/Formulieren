import crypto from "node:crypto";
import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import { ensureInstallationSql } from "../db/queries/installationTypes.sql.js";
import {
  archiveInstallationProgrammingSql,
  createInstallationProgrammingSql,
  getInstallationProgrammingContextSql,
  getInstallationSoftwareReadSql,
  setInstallationProgrammingFileSql,
  upsertInstallationSoftwareSql,
} from "../db/queries/installationSoftware.sql.js";
import {
  createInstallationProgrammingDownloadUrl,
  deleteInstallationProgrammingBlob,
  downloadInstallationProgrammingBlob,
  uploadInstallationProgrammingBlob,
} from "./blobStorageService.js";
import { assertInstallationWritable } from "./installationsService.js";

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

function isZipFile(file: Express.Multer.File | null | undefined) {
  if (!file?.originalname) return false;
  return String(file.originalname).toLowerCase().endsWith(".zip");
}

function normalizeProgrammingRow(row: any) {
  if (!row) return null;

  return {
    programming_id: row.programming_id,
    parent_programming_id: row.parent_programming_id ?? null,
    version_label: row.version_label ?? "",
    title: row.title ?? "",
    note: row.note ?? "",
    programming_date: row.programming_date ?? null,
    has_file: Boolean(row.storage_key),
    file_name: row.file_name ?? null,
    mime_type: row.mime_type ?? null,
    file_size_bytes: row.file_size_bytes ?? null,
    uploaded_at: row.uploaded_at ?? null,
    uploaded_by: row.uploaded_by ?? null,
    file_last_modified_at: row.file_last_modified_at ?? null,
    file_last_modified_by: row.file_last_modified_by ?? null,
    storage_provider: row.storage_provider ?? null,
    storage_key: row.storage_key ?? null,
    storage_url: row.storage_url ?? null,
    checksum_sha256: row.checksum_sha256 ?? null,
    is_active: row.is_active === false ? false : true,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
  };
}

export async function getInstallationSoftware(code: string) {
  const result: any = await sqlQueryRaw(getInstallationSoftwareReadSql, { code });
  const recordsets = Array.isArray(result?.recordsets) ? result.recordsets : [];

  const installationRows = Array.isArray(recordsets[0]) ? recordsets[0] : [];
  const portalOptionsRows = Array.isArray(recordsets[1]) ? recordsets[1] : [];
  const portalRows = Array.isArray(recordsets[2]) ? recordsets[2] : [];
  const programmingStateRows = Array.isArray(recordsets[3]) ? recordsets[3] : [];
  const programmingRows = Array.isArray(recordsets[4]) ? recordsets[4] : [];

  const installation = installationRows[0] ?? null;
  if (!installation) {
    throw new Error("atrium installation not found");
  }

  return {
    code: installation.atrium_installation_code ?? code,
    atrium: {
      software_versie: installation.software_versie ?? null,
      software_gebruikersnaam: installation.software_gebruikersnaam ?? null,
    },
    portalOptions: portalOptionsRows.map((row: any) => ({
      portal_key: row.portal_key,
      display_name: row.display_name ?? "",
      notes: row.notes ?? null,
      installation_url_template: row.installation_url_template ?? null,
      sort_order: row.sort_order == null ? null : Number(row.sort_order),
      is_active: row.is_active === false ? false : true,
    })),
    managementPortal: portalRows[0]
      ? {
          installation_management_portal_id: portalRows[0].installation_management_portal_id,
          portal_key: portalRows[0].portal_key ?? null,
          portal_display_name: portalRows[0].portal_display_name ?? null,
          installation_url_template: portalRows[0].installation_url_template ?? null,
          portal_installation_name: portalRows[0].portal_installation_name ?? "",
          portal_installation_reference: portalRows[0].portal_installation_reference ?? "",
          portal_installation_url: portalRows[0].portal_installation_url ?? "",
          note: portalRows[0].note ?? "",
          is_active: portalRows[0].is_active === false ? false : true,
          created_at: portalRows[0].created_at ?? null,
          created_by: portalRows[0].created_by ?? null,
          updated_at: portalRows[0].updated_at ?? null,
          updated_by: portalRows[0].updated_by ?? null,
        }
      : null,
    programmingState: programmingStateRows[0]
      ? {
          presence_mode: programmingStateRows[0].presence_mode ?? "NONE",
          presence_note: programmingStateRows[0].presence_note ?? "",
          created_at: programmingStateRows[0].created_at ?? null,
          created_by: programmingStateRows[0].created_by ?? null,
          updated_at: programmingStateRows[0].updated_at ?? null,
          updated_by: programmingStateRows[0].updated_by ?? null,
        }
      : {
          presence_mode: "NONE",
          presence_note: "",
          created_at: null,
          created_by: null,
          updated_at: null,
          updated_by: null,
        },
    programmingItems: programmingRows.map(normalizeProgrammingRow).filter(Boolean),
  };
}

export async function upsertInstallationSoftware(code: string, payload: any, user: any) {
  await assertInstallationWritable(code);

  const updatedBy = actorName(user);

  await sqlQuery(ensureInstallationSql, {
    code,
    createdBy: updatedBy,
  });

  await sqlQuery(upsertInstallationSoftwareSql, {
    code,
    portalKey: toNullableString(payload?.management_portal?.portal_key),
    portalInstallationName: toNullableString(payload?.management_portal?.portal_installation_name),
    portalInstallationReference: toNullableString(payload?.management_portal?.portal_installation_reference),
    portalInstallationUrl: toNullableString(payload?.management_portal?.portal_installation_url),
    portalNote: toNullableString(payload?.management_portal?.note),
    presenceMode: toNullableString(payload?.programming_state?.presence_mode) || "NONE",
    presenceNote: toNullableString(payload?.programming_state?.presence_note),
    updatedBy,
  });

  return getInstallationSoftware(code);
}

export async function uploadInstallationProgramming(
  code: string,
  payload: any,
  file: Express.Multer.File,
  user: any
) {
  await assertInstallationWritable(code);

  if (!file) {
    throw new Error("missing file");
  }

  if (!isZipFile(file)) {
    throw new Error("programming file must be zip");
  }

  const updatedBy = actorName(user);

  await sqlQuery(ensureInstallationSql, {
    code,
    createdBy: updatedBy,
  });

  const createdRows = await sqlQuery(createInstallationProgrammingSql, {
    code,
    parentProgrammingId: toNullableString(payload?.parent_programming_id),
    versionLabel: toNullableString(payload?.version_label),
    title: toNullableString(payload?.title) || toNullableString(file.originalname.replace(/\.zip$/i, "")),
    note: toNullableString(payload?.note),
    programmingDate: payload?.programming_date ?? null,
    createdBy: updatedBy,
  });

  const created = createdRows?.[0] ?? null;
  const programmingId = created?.programming_id;

  if (!programmingId) {
    throw new Error("programming not created");
  }

  const checksum = sha256Hex(file.buffer);

  let uploaded: { storageProvider: string; storageKey: string; storageUrl: string | null } | null = null;

  try {
    uploaded = await uploadInstallationProgrammingBlob({
      installationCode: code,
      programmingId,
      fileName: file.originalname,
      contentType: file.mimetype || "application/zip",
      buffer: file.buffer,
    });

    const rows = await sqlQuery(setInstallationProgrammingFileSql, {
      code,
      programmingId,
      fileName: file.originalname,
      mimeType: file.mimetype || "application/zip",
      fileSizeBytes: file.size ?? file.buffer.length,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      checksumSha256: checksum,
      updatedBy,
    });

    return {
      ok: true,
      item: normalizeProgrammingRow(rows?.[0] ?? null),
    };
  } catch (err) {
    if (uploaded?.storageKey) {
      try {
        await deleteInstallationProgrammingBlob(uploaded.storageKey);
      } catch (cleanupErr) {
        console.error("[programming upload] blob cleanup failed", cleanupErr);
      }
    }
    throw err;
  }
}

export async function getInstallationProgrammingContext(code: string, programmingId: string) {
  const rows = await sqlQuery(getInstallationProgrammingContextSql, {
    code,
    programmingId,
  });

  return normalizeProgrammingRow(rows?.[0] ?? null);
}

export async function getInstallationProgrammingDownloadUrl(code: string, programmingId: string) {
  const item = await getInstallationProgrammingContext(code, programmingId);
  if (!item) {
    throw new Error("programming not found");
  }
  if (!item.storage_key) {
    throw new Error("programming has no file");
  }

  const url = await createInstallationProgrammingDownloadUrl({
    storageKey: String(item.storage_key),
    expiresInSeconds: 300,
    downloadFileName: item.file_name ?? null,
  });

  return {
    ok: true,
    url,
    expires_in_seconds: 300,
    file_name: item.file_name ?? null,
  };
}

function buildAttachmentDisposition(fileName: string | null) {
  const safe = String(fileName || "programmering.zip").replace(/["\r\n]/g, "").trim() || "programmering.zip";
  return `attachment; filename="${safe}"`;
}

export async function downloadInstallationProgrammingFile(code: string, programmingId: string) {
  const item = await getInstallationProgrammingContext(code, programmingId);
  if (!item) {
    throw new Error("programming not found");
  }
  if (!item.storage_key) {
    throw new Error("programming has no file");
  }

  const blobResult = await downloadInstallationProgrammingBlob(String(item.storage_key));

  return {
    ok: true,
    buffer: blobResult.buffer,
    contentType: item.mime_type || blobResult.contentType || "application/octet-stream",
    contentLength: blobResult.contentLength ?? blobResult.buffer.length,
    fileName: item.file_name ?? "programmering.zip",
    contentDisposition: buildAttachmentDisposition(item.file_name ?? "programmering.zip"),
  };
}

export async function archiveInstallationProgramming(code: string, programmingId: string, user: any) {
  await assertInstallationWritable(code);

  const item = await getInstallationProgrammingContext(code, programmingId);
  if (!item) {
    throw new Error("programming not found");
  }

  await sqlQuery(archiveInstallationProgrammingSql, {
    code,
    programmingId,
    updatedBy: actorName(user),
  });

  return {
    ok: true,
  };
}
