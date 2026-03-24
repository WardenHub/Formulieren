// /api/src/services/adminFormsService.ts

import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import {
  getAdminFormsListSql,
  getAdminFormDetailSql,
  createAdminFormSql,
  saveAdminFormsOrderSql,
  saveAdminFormConfigSql,
  createAdminFormVersionSql,
} from "../db/queries/adminForms.sql.js";

function getUserDisplayName(user: any) {
  return user?.name || user?.upn || user?.objectId || "unknown";
}

function parseJsonObject(value: any, fallback: any = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;

  const txt = String(value || "").trim();
  if (!txt) return fallback;

  try {
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function parseFormId(value: any): string | null {
  const txt = String(value || "").trim();
  if (!txt) return null;
  return txt;
}

function normalizeNullableNumber(value: any): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function isPlainObject(value: any) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateSurveyJson(surveyJson: any) {
  if (!isPlainObject(surveyJson)) {
    return {
      ok: false,
      error: "survey_json moet een json object zijn",
    };
  }

  const pages = surveyJson.pages;
  if (pages === undefined) {
    return {
      ok: false,
      error: "survey_json mist verplicht veld 'pages'",
    };
  }

  if (!Array.isArray(pages)) {
    return {
      ok: false,
      error: "survey_json.pages moet een array zijn",
    };
  }

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];

    if (!isPlainObject(page)) {
      return {
        ok: false,
        error: `survey_json.pages[${i}] moet een object zijn`,
      };
    }

    if (page.elements !== undefined && !Array.isArray(page.elements)) {
      return {
        ok: false,
        error: `survey_json.pages[${i}].elements moet een array zijn`,
      };
    }
  }

  if (surveyJson.title !== undefined && typeof surveyJson.title !== "string") {
    return {
      ok: false,
      error: "survey_json.title moet een string zijn",
    };
  }

  try {
    JSON.stringify(surveyJson);
  } catch {
    return {
      ok: false,
      error: "survey_json kan niet veilig worden geserialiseerd",
    };
  }

  return {
    ok: true,
  };
}
export async function getAdminForms() {
  const rows = await sqlQuery(getAdminFormsListSql);

  const items = Array.isArray(rows)
    ? rows.map((r: any) => ({
        form_id: r.form_id,
        code: r.code,
        name: r.name,
        description: r.description ?? null,
        status: r.status ?? null,
        sort_order: r.sort_order == null ? null : Number(r.sort_order),
        latest_version: Number(r.latest_version ?? 0),
        latest_version_label: r.latest_version_label ?? null,
        version_count: Number(r.version_count ?? 0),
      }))
    : [];

  return { items };
}

export async function getAdminFormDetail(formId: string) {
  const id = parseFormId(formId);
  if (!id) return { error: "not found" };

  const result: any = await sqlQueryRaw(getAdminFormDetailSql, { formId: id });
  const recordsets = result?.recordsets || [];

  const formRow: any = recordsets?.[0]?.[0] ?? null;
  if (!formRow) return { error: "not found" };

  const versionRows: any[] = Array.isArray(recordsets?.[1]) ? recordsets[1] : [];
  const applicabilityRows: any[] = Array.isArray(recordsets?.[2]) ? recordsets[2] : [];
  const preflightRow: any = recordsets?.[3]?.[0] ?? null;

  const versions = versionRows.map((r: any, index: number) => ({
    form_version_id: r.form_version_id,
    version: Number(r.version ?? 0),
    version_label: r.version_label,
    published_at: r.published_at ?? null,
    published_by: r.published_by ?? null,
    is_latest: index === 0,
    survey_json: parseJsonObject(r.survey_json, {}),
  }));

  const item = {
    form_id: formRow.form_id,
    code: formRow.code,
    name: formRow.name,
    description: formRow.description ?? null,
    status: formRow.status ?? null,
    sort_order: formRow.sort_order == null ? null : Number(formRow.sort_order),
    active_survey_json: parseJsonObject(formRow.active_survey_json, null),
    latest_version: versions.length > 0 ? versions[0].version : 0,
    latest_version_label: versions.length > 0 ? versions[0].version_label : null,
    version_count: versions.length,
    versions,
    applicability_type_keys: applicabilityRows
      .map((r: any) => String(r.installation_type_key || "").trim())
      .filter((x: string) => x.length > 0),
    preflight: {
      requires_type: preflightRow?.requires_type === false ? false : true,
      perf_min_rows: preflightRow?.perf_min_rows == null ? null : Number(preflightRow.perf_min_rows),
      perf_severity: String(preflightRow?.perf_severity || "warning").toLowerCase(),
      energy_min_rows:
        preflightRow?.energy_min_rows == null ? null : Number(preflightRow.energy_min_rows),
      energy_severity: String(preflightRow?.energy_severity || "warning").toLowerCase(),
      custom_min_filled:
        preflightRow?.custom_min_filled == null ? null : Number(preflightRow.custom_min_filled),
      custom_severity: String(preflightRow?.custom_severity || "warning").toLowerCase(),
      is_active: preflightRow?.is_active === false ? false : true,
    },
  };

  return { item };
}

export async function createAdminForm(payload: any, user: any) {
  const code = String(payload?.code || "").trim();
  const name = String(payload?.name || "").trim();
  const description =
    payload?.description == null ? null : String(payload.description).trim() || null;

  if (!code) return { ok: false, error: "code is verplicht" };
  if (!name) return { ok: false, error: "name is verplicht" };

  const existing = await getAdminForms();
  const maxSort = (existing.items || []).reduce((max: number, item: any) => {
    const n = Number(item?.sort_order ?? 0);
    return n > max ? n : max;
  }, 0);

  const createdBy = getUserDisplayName(user);

  const rows = await sqlQuery(createAdminFormSql, {
    code,
    name,
    description,
    sortOrder: maxSort + 10,
    createdBy,
  });

  const row: any = rows?.[0] ?? null;
  if (!row?.form_id) return { error: "create failed" };

  return await getAdminFormDetail(row.form_id);
}

export async function saveAdminFormsOrder(items: any[], user: any) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((x, index) => {
      const form_id = parseFormId(x?.form_id);
      const sort_order = normalizeNullableNumber(x?.sort_order ?? (index + 1) * 10);
      return { form_id, sort_order };
    })
    .filter((x) => x.form_id && x.sort_order != null);

  if (normalized.length === 0) {
    return { ok: false, error: "geen geldige items ontvangen" };
  }

  const updatedBy = getUserDisplayName(user);

  await sqlQuery(saveAdminFormsOrderSql, {
    itemsJson: JSON.stringify(normalized),
    updatedBy,
  });

  return { ok: true };
}

export async function saveAdminFormConfig(formId: string, payload: any, user: any) {
  const id = parseFormId(formId);
  if (!id) return { ok: false, error: "ongeldig form_id" };

  const name = String(payload?.name || "").trim();
  const description =
    payload?.description == null ? null : String(payload.description).trim() || null;
  const status = String(payload?.status || "").trim().toUpperCase();

  if (!name) return { ok: false, error: "name is verplicht" };
  if (!["A", "M", "I"].includes(status)) return { ok: false, error: "ongeldige status" };

  const applicability_type_keys = Array.isArray(payload?.applicability_type_keys)
    ? payload.applicability_type_keys
        .map((x: any) => String(x || "").trim())
        .filter((x: string) => x.length > 0)
    : [];

  const preflight = payload?.preflight || {};

  const updatedBy = getUserDisplayName(user);

  await sqlQuery(saveAdminFormConfigSql, {
    formId: id,
    name,
    description,
    status,
    applicabilityJson: JSON.stringify(applicability_type_keys),
    requiresType: preflight?.requires_type === false ? false : true,
    perfMinRows: normalizeNullableNumber(preflight?.perf_min_rows),
    perfSeverity: String(preflight?.perf_severity || "warning").toLowerCase(),
    energyMinRows: normalizeNullableNumber(preflight?.energy_min_rows),
    energySeverity: String(preflight?.energy_severity || "warning").toLowerCase(),
    customMinFilled: normalizeNullableNumber(preflight?.custom_min_filled),
    customSeverity: String(preflight?.custom_severity || "warning").toLowerCase(),
    preflightIsActive: preflight?.is_active === false ? false : true,
    updatedBy,
  });

  return await getAdminFormDetail(id);
}

export async function createAdminFormVersion(formId: string, payload: any, user: any) {
  const id = parseFormId(formId);
  if (!id) return { ok: false, error: "ongeldig form_id" };

  const surveyJsonInput = payload?.survey_json ?? payload?.surveyJson ?? null;
  if (surveyJsonInput == null) {
    return { ok: false, error: "survey_json is verplicht" };
  }

  let surveyJsonObject: any = null;

  if (typeof surveyJsonInput === "string") {
    try {
      surveyJsonObject = JSON.parse(surveyJsonInput);
    } catch {
      return { ok: false, error: "survey_json is geen geldige json" };
    }
  } else if (typeof surveyJsonInput === "object") {
    surveyJsonObject = surveyJsonInput;
  } else {
    return { ok: false, error: "survey_json is ongeldig" };
  }

  if (!isPlainObject(surveyJsonObject)) {
    return { ok: false, error: "survey_json moet een json object zijn" };
  }

  const validation = validateSurveyJson(surveyJsonObject);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const publishedBy = getUserDisplayName(user);

  const rows = await sqlQuery(createAdminFormVersionSql, {
    formId: id,
    surveyJson: JSON.stringify(surveyJsonObject),
    publishedBy,
  });

  const row: any = rows?.[0] ?? null;
  if (!row?.form_version_id) return { error: "create version failed" };

  return await getAdminFormDetail(id);
}