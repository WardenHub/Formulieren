import fs from "node:fs";
import path from "node:path";

import { sqlQuery } from "../db/index.js";
import { getFormFollowUpSummaryByInstanceSql, getFormFollowUpsMonitorByInstanceSql } from "../db/queries/formFollowUps.sql.js";
import { getFormReportPdfSql } from "../db/queries/formReportPdf.sql.js";
import { getFormsMonitorChildrenSql, getFormsMonitorParentSql } from "../db/queries/formsMonitor.sql.js";
import { getFormInstanceDocumentsSql } from "../db/queries/forms.sql.js";
import { getInstallationDocumentsReadSql } from "../db/queries/installationDocuments.sql.js";
import {
  findUserProfileByActorSql,
  getActiveUserProfileSignatureSql,
  getUserProfileSql,
} from "../db/queries/profile.sql.js";
import {
  downloadFormInstanceDocumentBlob,
  downloadUserProfileSignatureBlob,
} from "./blobStorageService.js";

const DISCIPLINE_ASSETS: Record<string, { color: string; gray: string; label: string }> = {
  brandbeveiliging: {
    color: "WB-Brandbeveiliging.jpg",
    gray: "WB-Brandbeveiliging-grijs.jpg",
    label: "Brandbeveiliging",
  },
  inbraakbeveiliging: {
    color: "WB-Inbraakbeveiliging.jpg",
    gray: "WB-Inbraakbeveiliging-grijs.jpg",
    label: "Inbraakbeveiliging",
  },
  camera: {
    color: "WB-Camera.jpg",
    gray: "WB-Camera-grijs.jpg",
    label: "Camerabeveiliging",
  },
  toegangscontrole: {
    color: "WB-Toegangscontrole.png",
    gray: "WB-Toegangscontrole-grijs.png",
    label: "Toegangscontrole",
  },
  telecom_zorg: {
    color: "WB-TelecomZorg.jpg",
    gray: "WB-TelecomZorg-grijs.png",
    label: "Telecom & Zorg",
  },
  service_onderhoud: {
    color: "WB-ServiceOnderhoud-grijs.jpg",
    gray: "WB-ServiceOnderhoud-grijs.jpg",
    label: "Service & Onderhoud",
  },
};

function parseJson(value: any, fallback: any) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeText(value: any) {
  const s = String(value || "").trim();
  return s.length ? s : null;
}

function firstText(...values: any[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function actorObjectId(user: any) {
  return String(user?.objectId || "").trim();
}

function profileDisplayName(row: any) {
  return firstText(row?.preferred_display_name, row?.display_name_snapshot, row?.email_snapshot);
}

function safeFilePart(value: any) {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function valueText(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Ja" : "Nee";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  return "";
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

function formatDateValue(value: any) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = String(value.getFullYear());
    return `${day}-${month}-${year}`;
  }

  const raw = normalizeText(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}-${month}-${year}`;
  }

  if (/^\d{4}-\d{2}-\d{2}t/i.test(raw)) {
    const datePart = raw.slice(0, 10);
    const [year, month, day] = datePart.split("-");
    return `${day}-${month}-${year}`;
  }

  return raw;
}

function readImageDataUrl(filePath: string) {
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function isPreviewableImageMime(value: any) {
  const mime = String(value || "").trim().toLowerCase();
  return mime.startsWith("image/");
}

async function buildFormDocumentPreviewDataUrl(item: any) {
  if (!isPreviewableImageMime(item?.mime_type)) return null;
  if (!item?.storage_key) return null;

  const size = Number(item?.file_size_bytes ?? 0);
  if (Number.isFinite(size) && size > 8 * 1024 * 1024) {
    return null;
  }

  try {
    const blob = await downloadFormInstanceDocumentBlob(String(item.storage_key));
    const contentType = blob.contentType || item.mime_type || "image/jpeg";
    return `data:${contentType};base64,${blob.buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function readLogoDataUrl() {
  const candidates = [
    path.join(process.cwd(), "src", "assets", "Wardenburg_logo.png"),
    path.join(process.cwd(), "src", "assets", "Wardenburg_logo.jpg"),
    path.join(process.cwd(), "..", "src", "assets", "Wardenburg_logo.png"),
  ];

  const logoPath = candidates.find((p) => fs.existsSync(p));
  return logoPath ? readImageDataUrl(logoPath) : null;
}

function readHefasLogoDataUrl() {
  const candidates = [
    path.join(process.cwd(), "src", "assets", "Hefas-logo.png"),
    path.join(process.cwd(), "..", "src", "assets", "Hefas-logo.png"),
  ];

  const logoPath = candidates.find((p) => fs.existsSync(p));
  return logoPath ? readImageDataUrl(logoPath) : null;
}

function readPdfAsset(fileName: string) {
  const candidates = [
    path.join(process.cwd(), "src", "assets", "pdf", fileName),
    path.join(process.cwd(), "..", "src", "assets", "pdf", fileName),
  ];

  const filePath = candidates.find((p) => fs.existsSync(p));
  return filePath ? readImageDataUrl(filePath) : null;
}

function logoDataUrlForCompanyUnit(companyUnit: any) {
  const token = String(companyUnit || "").trim().toLowerCase();
  if (token === "hefas") {
    return readHefasLogoDataUrl() || readLogoDataUrl();
  }
  return readLogoDataUrl();
}

function disciplineAssetsData() {
  return Object.fromEntries(
    Object.entries(DISCIPLINE_ASSETS).map(([key, value]) => [
      key,
      {
        label: value.label,
        colorDataUrl: readPdfAsset(value.color),
        grayDataUrl: readPdfAsset(value.gray),
      },
    ])
  );
}

async function getUserProfileByObjectId(userObjectId: string) {
  if (!userObjectId) return null;
  const rows = await sqlQuery(getUserProfileSql, { userObjectId });
  return rows?.[0] ?? null;
}

async function findUserProfileByActor(actorValue: string) {
  const actor = normalizeText(actorValue);
  if (!actor) return null;
  const rows = await sqlQuery(findUserProfileByActorSql, { actorValue: actor });
  return rows?.[0] ?? null;
}

async function getSignatureDataUrl(userObjectId: string) {
  if (!userObjectId) return null;

  const rows = await sqlQuery(getActiveUserProfileSignatureSql, { userObjectId });
  const row = rows?.[0] ?? null;
  if (!row?.storage_key) return null;

  const blob = await downloadUserProfileSignatureBlob(String(row.storage_key));
  const contentType = blob.contentType || row.mime_type || "image/png";

  return `data:${contentType};base64,${blob.buffer.toString("base64")}`;
}

async function getProfileName(user: any) {
  const userObjectId = actorObjectId(user);
  const profile = await getUserProfileByObjectId(userObjectId);

  return profileDisplayName(profile) || user?.name || user?.email || "Gebruiker";
}

async function resolveReportSigner(item: any, answers: any, user: any) {
  const actorCandidates = [item?.submitted_by, item?.created_by]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  for (const actor of actorCandidates) {
    const profile = await findUserProfileByActor(String(actor));
    const userObjectId = normalizeText(profile?.user_object_id);
    if (!userObjectId) continue;

    const signatureDataUrl =
      String(profile?.signature_source_preference || "").toLowerCase() === "none"
        ? null
        : await getSignatureDataUrl(userObjectId);

    return {
      profileName: profileDisplayName(profile) || actor,
      signatureDataUrl,
      sourceActor: actor,
      userObjectId,
    };
  }

  return {
    profileName:
      firstText(answers?.onderhouder_naam, answers?.Naamonderhouder, answers?.["Naam onderhouder"], item?.submitted_by, item?.created_by) ||
      (await getProfileName(user)),
    signatureDataUrl: null,
    sourceActor: null,
    userObjectId: null,
  };
}

async function getFollowUpSummary(formInstanceId: number) {
  const rows = await sqlQuery(getFormFollowUpSummaryByInstanceSql, { formInstanceId });
  const row: any = rows?.[0] ?? null;

  return {
    total_count: Number(row?.total_count ?? 0),
    open_count: Number(row?.open_count ?? 0),
    terminal_count: Number(row?.terminal_count ?? 0),
    informative_count: Number(row?.informative_count ?? 0),
    relevant_count: Number(row?.relevant_count ?? 0),
    can_mark_form_done: Number(row?.open_count ?? 0) === 0,
  };
}

async function getInstallationDocuments(atriumInstallationCode: string) {
  const code = normalizeText(atriumInstallationCode);
  if (!code) {
    return {
      items: [],
      groups: [],
    };
  }

  const rows = await sqlQuery(getInstallationDocumentsReadSql, { code });
  const items = Array.isArray(rows)
    ? rows
        .filter((row: any) => row?.document_id)
        .map((row: any) => ({
          document_id: row.document_id,
          parent_document_id: row.parent_document_id ?? null,
          relation_type: row.relation_type ?? null,
          title: row.title ?? null,
          note: row.note ?? null,
          document_number: row.document_number ?? null,
          document_date: row.document_date ?? null,
          revision: row.revision ?? null,
          file_name: row.file_name ?? null,
          mime_type: row.mime_type ?? null,
          file_size_bytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
          uploaded_at: row.uploaded_at ?? null,
          uploaded_by: row.uploaded_by ?? null,
          bucket_document_type_key: row.bucket_document_type_key ?? row.document_type_key ?? null,
          bucket_document_type_name: row.bucket_document_type_name ?? row.document_type_name ?? null,
          bucket_section_key: row.bucket_section_key ?? row.section_key ?? null,
          bucket_sort_order: row.bucket_sort_order == null ? null : Number(row.bucket_sort_order),
        }))
    : [];

  const byGroup = new Map<string, any>();
  for (const item of items) {
    const key = String(item.bucket_document_type_key || item.bucket_document_type_name || "overig");
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        key,
        name: item.bucket_document_type_name || item.bucket_document_type_key || "Overig",
        section_key: item.bucket_section_key || null,
        sort_order: item.bucket_sort_order == null ? 999999 : item.bucket_sort_order,
        items: [],
      });
    }
    byGroup.get(key).items.push(item);
  }

  const groups = Array.from(byGroup.values()).sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return String(a.name).localeCompare(String(b.name), "nl");
  });

  return {
    items,
    groups,
  };
}

async function getFormInstanceDocuments(atriumInstallationCode: string, formInstanceId: number) {
  const code = normalizeText(atriumInstallationCode);
  if (!code || !formInstanceId) {
    return { items: [] };
  }

  const rows = await sqlQuery(getFormInstanceDocumentsSql, {
    code,
    instanceId: formInstanceId,
  });

  const baseItems = Array.isArray(rows)
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
        storage_provider: r.storage_provider ?? null,
        storage_key: r.storage_key ?? null,
        storage_url: r.storage_url ?? null,
        labels: parseJsonArray(r.labels_json),
        follow_ups: parseJsonArray(r.follow_ups_json),
      }))
    : [];

  const items = await Promise.all(
    baseItems.map(async (item: any) => ({
      ...item,
      preview_data_url: await buildFormDocumentPreviewDataUrl(item),
    }))
  );

  return { items };
}

export async function buildFormReportExportModel(formInstanceIdRaw: any, user: any) {
  const formInstanceId = Number(formInstanceIdRaw);
  if (!Number.isInteger(formInstanceId) || formInstanceId <= 0) {
    return { error: "not found" };
  }

  const rows = await sqlQuery(getFormReportPdfSql, { formInstanceId });
  const item = rows?.[0] ?? null;
  if (!item) return { error: "not found" };

  const surveyJson = parseJson(item.survey_json, {});
  const answers = parseJson(item.answers_json, {});

  const [parentRows, childrenRows, followUpRows, followUpSummary, signer, installationDocuments, formInstanceDocuments] =
    await Promise.all([
    sqlQuery(getFormsMonitorParentSql, { formInstanceId }),
    sqlQuery(getFormsMonitorChildrenSql, { formInstanceId }),
    sqlQuery(getFormFollowUpsMonitorByInstanceSql, { formInstanceId }),
    getFollowUpSummary(formInstanceId),
    resolveReportSigner(item, answers, user),
    getInstallationDocuments(item.atrium_installation_code),
    getFormInstanceDocuments(item.atrium_installation_code, formInstanceId),
  ]);

  return {
    ok: true,
    model: {
      formInstanceId,
      item,
      surveyJson,
      answers,
      assets: {
        logoDataUrl: logoDataUrlForCompanyUnit(item.bedrijf_unit),
        disciplineIcons: disciplineAssetsData(),
      },
      form: {
        id: formInstanceId,
        code: item.form_code,
        name: item.form_name,
        version_label: item.version_label,
        status: item.status,
        title: item.instance_title,
        note: item.instance_note,
        atrium_installation_code: item.atrium_installation_code,
        document_profile_key: item.document_profile_key,
        workflow_profile_key: item.workflow_profile_key,
        official_document_number: item.official_document_number,
      },
      installation: {
        code: item.atrium_installation_code,
        installation_name: item.installatie_naam,
        company_unit: item.bedrijf_unit,
        object_name: item.obj_naam,
        formatted_address: item.obj_adr_formatted,
        gebruiker_code: item.gebruiker_code,
        gebruiker_naam: item.gebruiker_naam,
        beheerder_code: item.beheerder_code,
        beheerder_naam: item.beheerder_naam,
        eigenaar_code: item.eigenaar_code,
        eigenaar_naam: item.eigenaar_naam,
      },
      relations: {
        parent: parentRows?.[0] ?? null,
        children: Array.isArray(childrenRows) ? childrenRows : [],
      },
      followUps: {
        items: Array.isArray(followUpRows) ? followUpRows : [],
        summary: followUpSummary,
      },
      installationDocuments,
      formInstanceDocuments,
      signer,
      viewer: {
        profile_name: await getProfileName(user),
        user_object_id: actorObjectId(user),
      },
    },
  };
}

export function buildFormReportFileName(model: any) {
  const onderhoudDatum = valueText(model?.answers?.datum_onderhoud) || "zonder-datum";

  return `${[
    safeFilePart(model?.form?.name || model?.form?.code || "formulier"),
    safeFilePart(model?.form?.atrium_installation_code),
    safeFilePart(onderhoudDatum),
  ]
    .filter(Boolean)
    .join("_")}.pdf`;
}

export function buildFormReportResult(buffer: Buffer, model: any) {
  const fileName = buildFormReportFileName(model);

  return {
    ok: true,
    buffer,
    contentType: "application/pdf",
    contentLength: buffer.length,
    fileName,
    contentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
  };
}

export function formatExportDate(value: any) {
  return formatDateValue(value);
}
