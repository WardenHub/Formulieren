import crypto from "node:crypto";
import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import {
  activateGuidanceMediaAssetSql,
  archiveGuidanceMediaAssetSql,
  createGuidanceItemSql,
  createGuidanceMediaAssetSql,
  getAdminGuidanceCatalogSql,
  getGuidanceMediaAssetContextSql,
  replaceGuidanceLinksSql,
  updateGuidanceItemSql,
} from "../db/queries/adminGuidance.sql.js";
import {
  createFormGuidanceMediaDownloadUrl,
  deleteFormGuidanceMediaBlob,
  uploadFormGuidanceMediaBlob,
} from "./blobStorageService.js";

function actorName(user: any) {
  return user?.name || user?.email || user?.upn || user?.objectId || "unknown";
}

function normalizeOptionalText(value: any) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeRequiredText(value: any) {
  return String(value || "").trim();
}

function normalizeSortOrder(value: any, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function normalizeMediaKind(value: any): "image" | "video" | null {
  const text = String(value || "").trim().toLowerCase();
  if (text === "image" || text === "video") return text;
  return null;
}

function parseJsonObject(value: any, fallback: any = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;

  const text = String(value || "").trim();
  if (!text) return fallback;

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function collectSurveyQuestions(elements: any, target: Map<string, { question_name: string; title: string }>) {
  if (!Array.isArray(elements)) return;

  for (const element of elements) {
    if (!element || typeof element !== "object") continue;

    const type = String(element.type || "").trim().toLowerCase();
    const name = normalizeRequiredText(element.name);
    const title = normalizeRequiredText(
      element.title ??
        element.locTitle?.defaultText ??
        element.locTitleName ??
        element.name
    );

    const isContainer =
      type === "panel" ||
      type === "paneldynamic" ||
      type === "multipletext" ||
      type === "matrixdynamic" ||
      type === "matrixdropdown" ||
      type === "matrix";

    if (name && type !== "html" && type !== "expression" && !target.has(name)) {
      target.set(name, {
        question_name: name,
        title: title || name,
      });
    }

    if (Array.isArray(element.elements)) {
      collectSurveyQuestions(element.elements, target);
    }

    if (Array.isArray(element.templateElements)) {
      collectSurveyQuestions(element.templateElements, target);
    }

    if (Array.isArray(element.rows)) {
      for (const row of element.rows) {
        if (Array.isArray(row?.elements)) {
          collectSurveyQuestions(row.elements, target);
        }
      }
    }

    if (isContainer && Array.isArray(element.panels)) {
      for (const panel of element.panels) {
        collectSurveyQuestions(panel?.elements, target);
      }
    }
  }
}

function extractSurveyQuestions(surveyJson: any) {
  const parsed = parseJsonObject(surveyJson, null);
  const pages = Array.isArray(parsed?.pages) ? parsed.pages : [];
  const map = new Map<string, { question_name: string; title: string }>();

  for (const page of pages) {
    collectSurveyQuestions(page?.elements, map);
  }

  return Array.from(map.values()).sort((a, b) =>
    String(a.title || a.question_name).localeCompare(String(b.title || b.question_name), "nl")
  );
}

async function resolveMediaPreviewUrl(row: any) {
  const sourceKind = String(row?.source_kind || "").trim().toLowerCase();
  const externalUrl = normalizeOptionalText(row?.external_url);
  const storageKey = normalizeOptionalText(row?.storage_key);
  const fileName = normalizeOptionalText(row?.file_name);

  if (sourceKind === "external_url") {
    return externalUrl;
  }

  if (!storageKey) return null;

  try {
    return await createFormGuidanceMediaDownloadUrl({
      storageKey,
      downloadFileName: fileName,
      expiresInSeconds: 600,
    });
  } catch (err) {
    console.error("[guidance] preview url failed", err);
    return null;
  }
}

async function normalizeMediaRow(row: any) {
  const preview_url = await resolveMediaPreviewUrl(row);

  return {
    guidance_media_id: row?.guidance_media_id ?? null,
    guidance_id: row?.guidance_id ?? null,
    media_kind: normalizeOptionalText(row?.media_kind),
    source_kind: normalizeOptionalText(row?.source_kind),
    external_url: normalizeOptionalText(row?.external_url),
    file_name: normalizeOptionalText(row?.file_name),
    mime_type: normalizeOptionalText(row?.mime_type),
    file_size_bytes: row?.file_size_bytes == null ? null : Number(row.file_size_bytes),
    storage_provider: normalizeOptionalText(row?.storage_provider),
    storage_key: normalizeOptionalText(row?.storage_key),
    storage_url: normalizeOptionalText(row?.storage_url),
    caption: normalizeOptionalText(row?.caption),
    is_active: row?.is_active === false ? false : true,
    uploaded_at: row?.uploaded_at ?? null,
    uploaded_by: normalizeOptionalText(row?.uploaded_by),
    archived_at: row?.archived_at ?? null,
    archived_by: normalizeOptionalText(row?.archived_by),
    created_at: row?.created_at ?? null,
    created_by: normalizeOptionalText(row?.created_by),
    updated_at: row?.updated_at ?? null,
    updated_by: normalizeOptionalText(row?.updated_by),
    preview_url,
  };
}

function buildFormsCatalog(rows: any[]) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    form_id: row?.form_id ?? null,
    code: normalizeRequiredText(row?.code),
    name: normalizeRequiredText(row?.name),
    status: normalizeOptionalText(row?.status),
    sort_order: normalizeSortOrder(row?.sort_order, 0),
    questions: extractSurveyQuestions(row?.active_survey_json),
  }));
}

export async function getAdminGuidanceCatalog() {
  const result: any = await sqlQueryRaw(getAdminGuidanceCatalogSql);
  const recordsets = Array.isArray(result?.recordsets) ? result.recordsets : [];

  const itemRows = Array.isArray(recordsets[0]) ? recordsets[0] : [];
  const linkRows = Array.isArray(recordsets[1]) ? recordsets[1] : [];
  const mediaRows = Array.isArray(recordsets[2]) ? recordsets[2] : [];
  const formRows = Array.isArray(recordsets[3]) ? recordsets[3] : [];

  const normalizedMediaRows = await Promise.all(mediaRows.map((row: any) => normalizeMediaRow(row)));
  const linksByGuidanceId = new Map<string, any[]>();
  const mediaByGuidanceId = new Map<string, any[]>();

  for (const row of linkRows) {
    const guidanceId = String(row?.guidance_id || "").trim();
    if (!guidanceId) continue;
    const current = linksByGuidanceId.get(guidanceId) || [];
    current.push({
      guidance_id: row?.guidance_id ?? null,
      form_id: row?.form_id ?? null,
      form_code: normalizeOptionalText(row?.form_code),
      form_name: normalizeOptionalText(row?.form_name),
      question_name: normalizeRequiredText(row?.question_name),
      sort_order: normalizeSortOrder(row?.sort_order, 0),
      created_at: row?.created_at ?? null,
      created_by: normalizeOptionalText(row?.created_by),
    });
    linksByGuidanceId.set(guidanceId, current);
  }

  for (const row of normalizedMediaRows) {
    const guidanceId = String(row?.guidance_id || "").trim();
    if (!guidanceId) continue;
    const current = mediaByGuidanceId.get(guidanceId) || [];
    current.push(row);
    mediaByGuidanceId.set(guidanceId, current);
  }

  const items = itemRows
    .map((row: any) => {
      const guidanceId = String(row?.guidance_id || "").trim();
      const links = (linksByGuidanceId.get(guidanceId) || []).sort((a, b) => {
        const sortDelta = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (sortDelta !== 0) return sortDelta;
        return String(a.question_name || "").localeCompare(String(b.question_name || ""), "nl");
      });
      const mediaAssets = (mediaByGuidanceId.get(guidanceId) || []).sort((a, b) => {
        const activeDelta = Number(b.is_active === true) - Number(a.is_active === true);
        if (activeDelta !== 0) return activeDelta;
        return String(b.created_at || "").localeCompare(String(a.created_at || ""), "nl");
      });

      const activeImage = mediaAssets.find((item) => item.media_kind === "image" && item.is_active);
      const activeVideo = mediaAssets.find((item) => item.media_kind === "video" && item.is_active);

      return {
        guidance_id: row?.guidance_id ?? null,
        title: normalizeRequiredText(row?.title) || "Nieuwe toelichting",
        body_markdown: normalizeOptionalText(row?.body_markdown),
        video_url: activeVideo?.preview_url || normalizeOptionalText(row?.video_url),
        image_url: activeImage?.preview_url || normalizeOptionalText(row?.image_url),
        image_caption: activeImage?.caption || normalizeOptionalText(row?.image_caption),
        sort_order: normalizeSortOrder(row?.sort_order, 0),
        is_active: row?.is_active === false ? false : true,
        created_at: row?.created_at ?? null,
        created_by: normalizeOptionalText(row?.created_by),
        updated_at: row?.updated_at ?? null,
        updated_by: normalizeOptionalText(row?.updated_by),
        links,
        media_assets: mediaAssets,
      };
    })
    .sort((a: any, b: any) => {
      const sortDelta = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (sortDelta !== 0) return sortDelta;
      return String(a.title || "").localeCompare(String(b.title || ""), "nl");
    });

  return {
    items,
    forms: buildFormsCatalog(formRows),
  };
}

export async function createGuidanceItem(payload: any, user: any) {
  const title = normalizeRequiredText(payload?.title);
  if (!title) {
    return { ok: false, error: "title is verplicht" };
  }

  const current = await getAdminGuidanceCatalog();
  const maxSort = (current.items || []).reduce((max: number, item: any) => {
    const next = Number(item?.sort_order ?? 0);
    return next > max ? next : max;
  }, 0);

  const rows = await sqlQuery(createGuidanceItemSql, {
    title,
    bodyMarkdown: normalizeOptionalText(payload?.body_markdown),
    sortOrder: normalizeSortOrder(payload?.sort_order, maxSort + 10),
    isActive: payload?.is_active === false ? false : true,
    actor: actorName(user),
  });

  const createdGuidanceId = rows?.[0]?.guidance_id ?? null;
  const catalog = await getAdminGuidanceCatalog();
  return {
    ...catalog,
    created_guidance_id: createdGuidanceId,
  };
}

export async function updateGuidanceItem(guidanceId: string, payload: any, user: any) {
  const title = normalizeRequiredText(payload?.title);
  if (!title) {
    return { ok: false, error: "title is verplicht" };
  }

  await sqlQuery(updateGuidanceItemSql, {
    guidanceId,
    title,
    bodyMarkdown: normalizeOptionalText(payload?.body_markdown),
    sortOrder: normalizeSortOrder(payload?.sort_order, 0),
    isActive: payload?.is_active === false ? false : true,
    actor: actorName(user),
  });

  return getAdminGuidanceCatalog();
}

export async function replaceGuidanceLinks(guidanceId: string, links: any[], user: any) {
  const normalized = (Array.isArray(links) ? links : [])
    .map((row, index) => ({
      form_id: normalizeOptionalText(row?.form_id),
      question_name: normalizeRequiredText(row?.question_name),
      sort_order: normalizeSortOrder(row?.sort_order, (index + 1) * 10),
    }))
    .filter((row) => row.form_id && row.question_name);

  await sqlQuery(replaceGuidanceLinksSql, {
    guidanceId,
    linksJson: JSON.stringify(normalized),
    actor: actorName(user),
  });

  return getAdminGuidanceCatalog();
}

function validateUploadFileForKind(file: Express.Multer.File | null | undefined, mediaKind: "image" | "video") {
  if (!file) throw new Error("missing file");

  const mimeType = String(file.mimetype || "").toLowerCase();
  if (mediaKind === "image" && !mimeType.startsWith("image/")) {
    throw new Error("guidance image must be image");
  }
  if (mediaKind === "video" && !mimeType.startsWith("video/")) {
    throw new Error("guidance video must be video");
  }
}

export async function uploadGuidanceMedia(
  guidanceId: string,
  payload: any,
  file: Express.Multer.File | null | undefined,
  user: any
) {
  const mediaKind = normalizeMediaKind(payload?.media_kind);
  if (!mediaKind) {
    return { ok: false, error: "ongeldige media_kind" };
  }

  validateUploadFileForKind(file, mediaKind);

  const guidanceMediaId = crypto.randomUUID();
  const actor = actorName(user);
  let uploaded: { storageProvider: string; storageKey: string; storageUrl: string | null } | null = null;

  try {
    uploaded = await uploadFormGuidanceMediaBlob({
      guidanceId,
      guidanceMediaId,
      fileName: String(file?.originalname || `${mediaKind}-bestand`),
      contentType: file?.mimetype || null,
      buffer: file?.buffer || Buffer.alloc(0),
    });

    await sqlQuery(createGuidanceMediaAssetSql, {
      guidanceMediaId,
      guidanceId,
      mediaKind,
      sourceKind: "upload",
      externalUrl: null,
      fileName: normalizeOptionalText(file?.originalname),
      mimeType: normalizeOptionalText(file?.mimetype),
      fileSizeBytes: file?.size ?? file?.buffer?.length ?? null,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      caption: normalizeOptionalText(payload?.caption),
      isActive: payload?.is_active === false ? false : true,
      actor,
    });
  } catch (err) {
    if (uploaded?.storageKey) {
      try {
        await deleteFormGuidanceMediaBlob(uploaded.storageKey);
      } catch (cleanupErr) {
        console.error("[guidance] blob cleanup failed", cleanupErr);
      }
    }
    throw err;
  }

  return getAdminGuidanceCatalog();
}

export async function addExternalGuidanceMedia(guidanceId: string, payload: any, user: any) {
  const mediaKind = normalizeMediaKind(payload?.media_kind);
  if (!mediaKind) {
    return { ok: false, error: "ongeldige media_kind" };
  }

  const externalUrl = normalizeOptionalText(payload?.external_url);
  if (!externalUrl) {
    return { ok: false, error: "external_url is verplicht" };
  }

  await sqlQuery(createGuidanceMediaAssetSql, {
    guidanceMediaId: crypto.randomUUID(),
    guidanceId,
    mediaKind,
    sourceKind: "external_url",
    externalUrl,
    fileName: null,
    mimeType: null,
    fileSizeBytes: null,
    storageProvider: null,
    storageKey: null,
    storageUrl: null,
    caption: normalizeOptionalText(payload?.caption),
    isActive: payload?.is_active === false ? false : true,
    actor: actorName(user),
  });

  return getAdminGuidanceCatalog();
}

export async function activateGuidanceMedia(guidanceId: string, guidanceMediaId: string, user: any) {
  await sqlQuery(activateGuidanceMediaAssetSql, {
    guidanceId,
    guidanceMediaId,
    actor: actorName(user),
  });

  return getAdminGuidanceCatalog();
}

export async function archiveGuidanceMedia(guidanceId: string, guidanceMediaId: string, user: any) {
  const rows = await sqlQuery(getGuidanceMediaAssetContextSql, {
    guidanceId,
    guidanceMediaId,
  });
  const existing = rows?.[0] ?? null;
  if (!existing) {
    return { ok: false, error: "guidance media not found" };
  }

  await sqlQuery(archiveGuidanceMediaAssetSql, {
    guidanceId,
    guidanceMediaId,
    actor: actorName(user),
  });

  return getAdminGuidanceCatalog();
}
