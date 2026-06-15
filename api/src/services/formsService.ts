// api/src/services/formsService.ts

import { sqlQuery } from "../db/index.js";

import {
  saveFormAnswersSql,
  submitFormInstanceSql,
  withdrawFormInstanceSql,
} from "../db/queries/formsAnswers.sql.js";

import {
  importAnswerFileSql,
  getFormInstanceSql,
  getFormGuidanceSql,
  getInstallationFormInstancesSql,
  startFormInstanceSql,
  startChildFormInstanceSql,
  getFormsCatalogForInstallationSql,
  getFormStartPreflightSql,
  reopenFormInstanceSql,
  updateFormInstanceMetadataSql,
} from "../db/queries/forms.sql.js";

import { getFormPrefillSql } from "../db/queries/prefill.sql.js";
import {
  previewFormFollowUps,
  syncFormFollowUps,
} from "./followUpService.js";
import {
  assertInstallationWritable,
  getInstallationArchiveState,
} from "./installationsService.js";
import { createFormGuidanceMediaDownloadUrl } from "./blobStorageService.js";

function getUserDisplayName(user: any) {
  return user?.name || user?.upn || user?.objectId || "unknown";
}

function parseJsonObject(value: any, fallback: any = {}) {
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

function parseSurveyJson(value: any) {
  if (value == null) return null;
  if (typeof value === "object") return value;

  const txt = String(value || "").trim();
  if (!txt) return null;

  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function parseInstanceId(value: any): number | null {
  if (value == null) return null;

  const txt = String(value).trim();
  if (!txt) return null;

  const n = typeof value === "number" ? value : Number(txt);

  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function normalizeOptionalText(value: any): string | null {
  if (value == null) return null;
  const txt = String(value).trim();
  return txt ? txt : null;
}

function parseRequiredDraftRev(value: any): number | null {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").trim());

  if (!Number.isFinite(n) || n < 0) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

async function resolveGuidanceMediaUrl(storageKey: any, fileName: any, fallbackUrl: any) {
  const normalizedStorageKey = normalizeOptionalText(storageKey);
  if (normalizedStorageKey) {
    try {
      return await createFormGuidanceMediaDownloadUrl({
        storageKey: normalizedStorageKey,
        downloadFileName: normalizeOptionalText(fileName),
        expiresInSeconds: 600,
      });
    } catch (err) {
      console.error("[forms guidance] media url failed", err);
    }
  }

  return normalizeOptionalText(fallbackUrl);
}

function normalizeGuidanceMatrixRowKey(value: any) {
  return String(value || "").trim();
}

function buildMatrixGuidanceLookupKey(questionName: any, matrixRowKey: any) {
  const cleanQuestionName = String(questionName || "").trim();
  const cleanMatrixRowKey = normalizeGuidanceMatrixRowKey(matrixRowKey);
  if (!cleanQuestionName || !cleanMatrixRowKey) return "";
  return `${cleanQuestionName}::${cleanMatrixRowKey}`;
}

async function buildGuidanceMap(rows: any[]) {
  const byQuestion: Record<string, any[]> = {};
  const byMatrixRow: Record<string, any[]> = {};

  for (const row of Array.isArray(rows) ? rows : []) {
    const questionName = String(row?.question_name || "").trim();
    if (!questionName) continue;
    const matrixRowKey = normalizeGuidanceMatrixRowKey(row?.matrix_row_key);
    const matrixLookupKey = buildMatrixGuidanceLookupKey(questionName, matrixRowKey);

    const video_url = await resolveGuidanceMediaUrl(
      row?.active_video_storage_key,
      row?.active_video_file_name,
      row?.active_video_external_url ?? row?.video_url
    );

    const image_url = await resolveGuidanceMediaUrl(
      row?.active_image_storage_key,
      row?.active_image_file_name,
      row?.active_image_external_url ?? row?.image_url
    );

    const normalizedItem = {
      guidance_id: row?.guidance_id ?? null,
      title: normalizeOptionalText(row?.title) || "Toelichting",
      body_markdown: normalizeOptionalText(row?.body_markdown),
      video_url,
      image_url,
      image_caption:
        normalizeOptionalText(row?.active_image_caption) ||
        normalizeOptionalText(row?.image_caption),
      matrix_row_key: matrixRowKey || null,
      matrix_row_label: normalizeOptionalText(row?.matrix_row_label),
      sort_order:
        row?.link_sort_order == null || !Number.isFinite(Number(row?.link_sort_order))
          ? row?.guidance_sort_order == null || !Number.isFinite(Number(row?.guidance_sort_order))
            ? 0
            : Number(row.guidance_sort_order)
          : Number(row.link_sort_order),
    };

    if (matrixLookupKey) {
      if (!byMatrixRow[matrixLookupKey]) byMatrixRow[matrixLookupKey] = [];
      byMatrixRow[matrixLookupKey].push(normalizedItem);
      continue;
    }

    if (!byQuestion[questionName]) byQuestion[questionName] = [];
    byQuestion[questionName].push(normalizedItem);
  }

  Object.keys(byQuestion).forEach((questionName) => {
    byQuestion[questionName] = byQuestion[questionName].sort((a, b) => {
      const sortDelta = Number(a?.sort_order || 0) - Number(b?.sort_order || 0);
      if (sortDelta !== 0) return sortDelta;
      return String(a?.title || "").localeCompare(String(b?.title || ""), "nl");
    });
  });

  Object.keys(byMatrixRow).forEach((lookupKey) => {
    byMatrixRow[lookupKey] = byMatrixRow[lookupKey].sort((a, b) => {
      const sortDelta = Number(a?.sort_order || 0) - Number(b?.sort_order || 0);
      if (sortDelta !== 0) return sortDelta;
      return String(a?.title || "").localeCompare(String(b?.title || ""), "nl");
    });
  });

  return {
    byQuestion,
    byMatrixRow,
  };
}

export async function getFormStartPreflight(code: string, formCode: string, user: any) {
  const cleanCode = String(code || "").trim();
  const cleanFormCode = String(formCode || "").trim();
  const createdBy = getUserDisplayName(user);
  const archiveState = await getInstallationArchiveState(cleanCode);

  const rows = await sqlQuery(getFormStartPreflightSql, {
    code: cleanCode,
    createdBy,
    formCode: cleanFormCode,
  });

  const row: any = rows?.[0] ?? null;
  if (!row) return { error: "not found" };

  const blocking: any[] = [];
  const warnings: any[] = [];

  const typeKey = row.installation_type_key ?? null;

  const formExists = Number(row.form_exists ?? 0) === 1;
  const formApplicable = Number(row.form_is_applicable ?? 0) === 1;

  const requiresType = row.requires_type === false ? false : true;

  const perfMinRows = row.perf_min_rows == null ? null : Number(row.perf_min_rows);
  const perfSeverity = String(row.perf_severity || "warning").toLowerCase();

  const energyMinRows = row.energy_min_rows == null ? null : Number(row.energy_min_rows);
  const energySeverity = String(row.energy_severity || "warning").toLowerCase();

  const customMinFilled = row.custom_min_filled == null ? null : Number(row.custom_min_filled);
  const customSeverity = String(row.custom_severity || "warning").toLowerCase();

  const perfRowCount = Number(row.perf_row_count ?? 0);
  const energyRowCount = Number(row.energy_row_count ?? 0);
  const customApplicableCount = Number(row.custom_applicable_count ?? 0);
  const customFilledCount = Number(row.custom_filled_count ?? 0);

  function push(sev: string, item: any) {
    if (sev === "blocking") blocking.push(item);
    else warnings.push(item);
  }

  if (!formExists) {
    blocking.push({
      key: "form_unknown",
      message: `Onbekend formulier: ${cleanFormCode || "(leeg)"}.`,
      action: { type: "noop" },
    });
  }

  if (archiveState.isHistorical) {
    blocking.push({
      key: "installation_historical",
      message: "Deze installatie is historisch en alleen als dossier beschikbaar.",
      action: { type: "noop" },
    });
  }

  if (formExists && typeKey && !formApplicable) {
    blocking.push({
      key: "form_not_applicable",
      message: "Dit formulier is niet toepasbaar voor de gekozen installatiesoort.",
      action: { type: "navigate_tab", tab: "custom", tab_key: "custom" },
    });
  }

  if (requiresType && !typeKey) {
    blocking.push({
      key: "installation_type_missing",
      message: "Kies eerst een installatiesoort.",
      action: { type: "navigate_tab", tab: "custom", tab_key: "custom" },
    });
  }

  const canEvaluate = !requiresType || Boolean(typeKey);

  if (formExists && canEvaluate) {
    if (perfMinRows != null && perfRowCount < perfMinRows) {
      push(perfSeverity, {
        key: "performance_requirements_missing",
        message:
          "Prestatie-eisen ontbreken; voeg minimaal 1 regel toe (1 regel met doormelding ‘GEEN’ is toegestaan).",
        action: { type: "navigate_tab", tab: "performance", tab_key: "performance" },
      });
    }

    if (energyMinRows != null && energyRowCount < energyMinRows) {
      push(energySeverity, {
        key: "energy_supply_missing",
        message: "Energievoorziening is nog leeg; voeg minimaal 1 regel toe.",
        action: { type: "navigate_tab", tab: "energy", tab_key: "energy" },
      });
    }

    if (customMinFilled != null && customApplicableCount > 0 && customFilledCount < customMinFilled) {
      push(customSeverity, {
        key: "custom_fields_empty",
        message: "Eigenschappen zijn nog leeg; vul relevante velden aan.",
        action: { type: "navigate_tab", tab: "custom", tab_key: "custom" },
      });
    }
  }

  return {
    ok_to_start: blocking.length === 0,
    blocking,
    warnings,
    meta: {
      atrium_installation_code: row.atrium_installation_code,
      installation_id: row.installation_id,
      installation_type_key: row.installation_type_key,
      installation_status: archiveState.installation_status,
      bedrijf_unit: archiveState.bedrijf_unit,

      form_code: cleanFormCode,
      form_exists: formExists,
      form_is_applicable: formApplicable,

      performance_requirement_row_count: perfRowCount,
      energy_supply_row_count: energyRowCount,
      custom_applicable_count: customApplicableCount,
      custom_filled_count: customFilledCount,

      rules: {
        requires_type: requiresType,
        perf_min_rows: perfMinRows,
        perf_severity: perfSeverity,
        energy_min_rows: energyMinRows,
        energy_severity: energySeverity,
        custom_min_filled: customMinFilled,
        custom_severity: customSeverity,
      },
    },
  };
}

export async function getFormsCatalog(code: string) {
  const cleanCode = String(code || "").trim();

  const rows = await sqlQuery(getFormsCatalogForInstallationSql, { code: cleanCode });

  const items = Array.isArray(rows)
    ? rows.map((r: any) => ({
        form_id: r.form_id,
        code: r.code,
        label: r.name,
        description: r.description ?? null,
        status: r.status ?? null,
        sort_order: r.sort_order == null ? null : Number(r.sort_order),
        is_applicable: Number(r.is_applicable ?? 0) === 1,
        mapping_count: Number(r.mapping_count ?? 0),
      }))
    : [];

  return { items };
}

export async function getInstallationFormInstances(
  code: string,
  options: {
    q?: any;
    statuses?: any;
  } = {}
) {
  const cleanCode = String(code || "").trim();
  const q = normalizeOptionalText(options?.q);
  const statuses = Array.isArray(options?.statuses)
    ? options.statuses
        .map((x: any) => String(x || "").trim().toUpperCase())
        .filter((x: string) => x.length > 0)
    : [];

  const rows = await sqlQuery(getInstallationFormInstancesSql, {
    code: cleanCode,
    q,
    statusesJson: JSON.stringify(statuses),
  });

  const items = Array.isArray(rows)
    ? rows.map((r: any) => ({
        form_instance_id: Number(r.form_instance_id),
        status: String(r.status || ""),
        instance_title: r.instance_title ?? null,
        instance_note: r.instance_note ?? null,
        parent_instance_id: r.parent_instance_id == null ? null : Number(r.parent_instance_id),
        atrium_installation_code: r.atrium_installation_code ?? null,
        installation_status: r.installation_status ?? null,
        BedrijfUnit: r.BedrijfUnit ?? null,
        created_at: r.created_at ?? null,
        created_by: r.created_by ?? null,
        updated_at: r.updated_at ?? null,
        updated_by: r.updated_by ?? null,
        submitted_at: r.submitted_at ?? null,
        submitted_by: r.submitted_by ?? null,
        assigned_user_object_id: r.assigned_user_object_id ?? null,
        assigned_display_name_snapshot: r.assigned_display_name_snapshot ?? null,
        assigned_email_snapshot: r.assigned_email_snapshot ?? null,
        assigned_at: r.assigned_at ?? null,
        assigned_by: r.assigned_by ?? null,
        form_code: r.form_code ?? null,
        form_name: r.form_name ?? null,
        version: r.version == null ? null : Number(r.version),
        version_label: r.version_label ?? null,
        parent: r.parent_form_instance_id
          ? {
              form_instance_id: Number(r.parent_form_instance_id),
              form_code: r.parent_form_code ?? null,
              form_name: r.parent_form_name ?? null,
              instance_title: r.parent_instance_title ?? null,
            }
          : null,
        relations: {
          has_parent: r.parent_instance_id != null,
          has_children: Number(r.has_children ?? 0) === 1,
          child_count: Number(r.child_count ?? 0),
        },
      }))
    : [];

  return { items };
}

export async function startFormInstance(code: string, formCode: string, user: any) {
  const cleanCode = String(code || "").trim();
  const cleanFormCode = String(formCode || "").trim();
  const createdBy = getUserDisplayName(user);

  await assertInstallationWritable(cleanCode);

  const rows = await sqlQuery(startFormInstanceSql, {
    code: cleanCode,
    formCode: cleanFormCode,
    createdBy,
  });

  const row: any = rows?.[0] ?? null;
  if (!row) return { error: "not found" };

  return await getFormInstance(cleanCode, row.form_instance_id);
}

export async function startChildFormInstance(
  code: string,
  parentInstanceId: number | string,
  formCode: string,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const cleanFormCode = String(formCode || "").trim();
  const parentId = parseInstanceId(parentInstanceId);
  const createdBy = getUserDisplayName(user);

  if (parentId == null) {
    return { ok: false, error: "ongeldige parent_instance_id" };
  }

  await assertInstallationWritable(cleanCode);

  const rows = await sqlQuery(startChildFormInstanceSql, {
    code: cleanCode,
    parentInstanceId: parentId,
    formCode: cleanFormCode,
    createdBy,
  });

  const row: any = rows?.[0] ?? null;
  if (!row) return { error: "not found" };

  return await getFormInstance(cleanCode, row.form_instance_id);
}

export async function getFormInstance(code: string, instanceId: number | string) {
  const cleanCode = String(code || "").trim();
  const id = parseInstanceId(instanceId);

  if (id == null) return { error: "not found" };

  const rows = await sqlQuery(getFormInstanceSql, { code: cleanCode, instanceId: id });

  const row: any = rows?.[0] ?? null;
  if (!row) return { error: "not found" };

  const guidanceRows = row?.form_id
    ? await sqlQuery(getFormGuidanceSql, { formId: row.form_id })
    : [];
  const guidanceMaps = await buildGuidanceMap(guidanceRows);

  return {
    item: {
      ...row,
      guidance_by_question: guidanceMaps.byQuestion,
      guidance_by_matrix_row: guidanceMaps.byMatrixRow,
    },
  };
}

export async function updateFormInstanceMetadata(
  code: string,
  instanceId: number | string,
  payload: any,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const id = parseInstanceId(instanceId);
  const updatedBy = getUserDisplayName(user);

  if (id == null) {
    return { ok: false, error: "ongeldige form_instance_id" };
  }

  await assertInstallationWritable(cleanCode);

  const instance_title = normalizeOptionalText(
    payload?.instance_title ?? payload?.instanceTitle
  );
  const instance_note = normalizeOptionalText(
    payload?.instance_note ?? payload?.instanceNote
  );

  const rawParentInstanceId =
    payload?.parent_instance_id ?? payload?.parentInstanceId ?? null;

  const parent_instance_id =
    rawParentInstanceId == null || String(rawParentInstanceId).trim() === ""
      ? null
      : parseInstanceId(rawParentInstanceId);

  if (
    rawParentInstanceId != null &&
    String(rawParentInstanceId).trim() !== "" &&
    parent_instance_id == null
  ) {
    return { ok: false, error: "ongeldige parent_instance_id" };
  }

  if (instance_title != null && instance_title.length > 200) {
    return { ok: false, error: "instance_title mag maximaal 200 tekens bevatten" };
  }

  const expected_draft_rev = parseRequiredDraftRev(
    payload?.expected_draft_rev ?? payload?.expectedDraftRev
  );

  if (expected_draft_rev == null) {
    return { ok: false, error: "expected_draft_rev is verplicht" };
  }

  const rows = await sqlQuery(updateFormInstanceMetadataSql, {
    code: cleanCode,
    instanceId: id,
    instanceTitle: instance_title,
    instanceNote: instance_note,
    parentInstanceId: parent_instance_id,
    expectedDraftRev: expected_draft_rev,
    updatedBy,
  });

  const r: any = rows?.[0] ?? null;
  return { ok: true, result: r };
}

export async function saveFormAnswers(code: string, instanceId: number | string, payload: any, user: any) {
  const cleanCode = String(code || "").trim();
  const id = parseInstanceId(instanceId);
  const updatedBy = getUserDisplayName(user);

  if (id == null) {
    return { ok: false, error: "ongeldige form_instance_id" };
  }

  await assertInstallationWritable(cleanCode);

  const answers_json = payload?.answers_json ?? payload?.answersJson ?? {};
  const calculated_json = payload?.calculated_json ?? payload?.calculatedJson ?? null;
  const expected_draft_rev = Number(payload?.expected_draft_rev ?? payload?.expectedDraftRev);

  if (!Number.isFinite(expected_draft_rev) || expected_draft_rev < 0) {
    return { ok: false, error: "expected_draft_rev is verplicht" };
  }

  const rows = await sqlQuery(saveFormAnswersSql, {
    code: cleanCode,
    instanceId: id,
    answersJson: JSON.stringify(answers_json ?? {}),
    calculatedJson: calculated_json == null ? null : JSON.stringify(calculated_json),
    expectedDraftRev: Math.trunc(expected_draft_rev),
    updatedBy,
  });

  const r: any = rows?.[0] ?? null;
  return { ok: true, result: r };
}

export async function previewSubmitFormInstance(
  code: string,
  instanceId: number | string,
  payload: any,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const id = parseInstanceId(instanceId);

  if (id == null) return { error: "not found" };

  const instanceRes = await getFormInstance(cleanCode, id);
  if (instanceRes?.error === "not found") return { error: "not found" };

  const item: any = instanceRes?.item ?? null;
  if (!item) return { error: "not found" };

  const status = String(item.status || "").trim();
  const surveyJson = parseSurveyJson(item.survey_json);
  const storedAnswers = parseJsonObject(item.answers_json, {});
  const overrideAnswers =
    payload?.answers_json ?? payload?.answersJson ?? payload?.answers ?? null;

  const effectiveAnswers =
    overrideAnswers && typeof overrideAnswers === "object"
      ? overrideAnswers
      : storedAnswers;

  if (status !== "CONCEPT") {
    return {
      ok: true,
      can_submit: false,
      form_instance_id: item.form_instance_id,
      status,
      validation: {
        has_errors: true,
        errors: [
          {
            code: "invalid_status",
            message: `Indienen is niet toegestaan in status '${status || "onbekend"}'.`,
          },
        ],
      },
      follow_ups: {
        ok: true,
        count: 0,
        counts_by_kind: {
          workflow: 0,
          report_only: 0,
          total: 0,
        },
        items: [],
      },
    };
  }

  if (!surveyJson || typeof surveyJson !== "object") {
    return {
      ok: true,
      can_submit: false,
      form_instance_id: item.form_instance_id,
      status,
      validation: {
        has_errors: true,
        errors: [
          {
            code: "survey_json_invalid",
            message: "survey_json ontbreekt of is ongeldig.",
          },
        ],
      },
      follow_ups: {
        ok: true,
        count: 0,
        counts_by_kind: {
          workflow: 0,
          report_only: 0,
          total: 0,
        },
        items: [],
      },
    };
  }

  const preview = await previewFormFollowUps({
    surveyJson,
    answers: effectiveAnswers || {},
  });

  const followUpItems = Array.isArray(preview?.items) ? preview.items : [];
  const workflowCount = followUpItems.filter(
    (x: any) => String(x?.kind || "") === "workflow"
  ).length;
  const reportOnlyCount = followUpItems.filter(
    (x: any) => String(x?.kind || "") === "report-only"
  ).length;

  return {
    ok: true,
    can_submit: true,
    form_instance_id: item.form_instance_id,
    status,
    validation: {
      has_errors: false,
      errors: [],
    },
    follow_ups: {
      ok: true,
      count: followUpItems.length,
      counts_by_kind: {
        workflow: workflowCount,
        report_only: reportOnlyCount,
        total: followUpItems.length,
      },
      items: followUpItems,
    },
    meta: {
      atrium_installation_code: item.atrium_installation_code,
      installation_id: item.installation_id,
      form_code: item.form_code ?? null,
      form_name: item.form_name ?? null,
      draft_rev: item.draft_rev ?? 0,
      previewed_by: getUserDisplayName(user),
      used_override_answers:
        !!overrideAnswers && typeof overrideAnswers === "object",
    },
  };
}

export async function submitFormInstance(code: string, instanceId: number | string, user: any) {
  const cleanCode = String(code || "").trim();
  const id = parseInstanceId(instanceId);
  const submittedBy = getUserDisplayName(user);

  if (id == null) return { error: "not found" };

  await assertInstallationWritable(cleanCode);

  const instanceRes = await getFormInstance(cleanCode, id);
  if (instanceRes?.error === "not found") return { error: "not found" };

  const item: any = instanceRes?.item ?? null;
  if (!item) return { error: "not found" };

  const surveyJson = parseSurveyJson(item.survey_json);
  const answers = parseJsonObject(item.answers_json, {});

  const rows = await sqlQuery(submitFormInstanceSql, {
    code: cleanCode,
    instanceId: id,
    submittedBy,
  });

  const submitResult = rows?.[0] ?? null;

  const followUpSync = await syncFormFollowUps({
    formInstance: {
      form_instance_id: String(item.form_instance_id ?? id),
      installation_id: String(item.installation_id || ""),
      atrium_installation_code: String(item.atrium_installation_code || cleanCode),
    },
    surveyJson: surveyJson || {},
    answers: answers || {},
    user,
  });

  return {
    ok: true,
    result: submitResult,
    follow_up_sync: followUpSync,
  };
}

export async function withdrawFormInstance(code: string, instanceId: number | string, user: any) {
  const cleanCode = String(code || "").trim();
  const id = parseInstanceId(instanceId);
  const updatedBy = getUserDisplayName(user);

  if (id == null) return { error: "not found" };

  await assertInstallationWritable(cleanCode);

  const rows = await sqlQuery(withdrawFormInstanceSql, {
    code: cleanCode,
    instanceId: id,
    updatedBy,
  });

  return { ok: true, result: rows?.[0] ?? null };
}

export async function reopenFormInstance(code: string, instanceId: number | string, user: any) {
  const cleanCode = String(code || "").trim();
  const id = parseInstanceId(instanceId);
  const updatedBy = getUserDisplayName(user);

  if (id == null) return { error: "not found" };

  await assertInstallationWritable(cleanCode);

  const rows = await sqlQuery(reopenFormInstanceSql, {
    code: cleanCode,
    instanceId: id,
    updatedBy,
  });

  const r: any = rows?.[0] ?? null;
  if (!r) return { error: "not found" };

  return { ok: true, result: r };
}

export async function importFormAnswerFile(code: string, file: any, user: any) {
  const cleanCode = String(code || "").trim();
  const updatedBy = getUserDisplayName(user);

  await assertInstallationWritable(cleanCode);

  const formCode = String(file?.form?.code || "").trim();
  const versionLabel = String(file?.form?.version_label || "").trim();
  if (!formCode) return { ok: false, error: "form.code ontbreekt" };
  if (!versionLabel) return { ok: false, error: "form.version_label ontbreekt" };

  const formInstanceId = parseInstanceId(file?.instance?.form_instance_id);
  const draftRev = file?.instance?.draft_rev ?? null;

  const answers = file?.payload?.answers_json ?? {};
  const calculated = file?.payload?.calculated_json ?? null;

  const rows = await sqlQuery(importAnswerFileSql, {
    code: cleanCode,
    formCode,
    versionLabel,
    formInstanceId,
    draftRev,
    answersJson: JSON.stringify(answers ?? {}),
    calculatedJson: calculated == null ? null : JSON.stringify(calculated),
    updatedBy,
  });

  return { ok: true, result: rows?.[0] ?? null };
}

export async function getFormPrefill(
  code: string,
  formCode: string,
  keys: string[],
  user: any
) {
  const cleanCode = String(code || "").trim();
  const cleanFormCode = String(formCode || "").trim();

  const requestedKeys = (Array.isArray(keys) ? keys : [])
    .map((k) => String(k || "").trim())
    .filter((k) => k.length > 0);

  const requiredKeys = [
    "doc_groepen",
    "k_document_types",
    "doc_regels",
    "k_energy_brand_types",
  ];

  const uniqueKeys = Array.from(new Set([...requestedKeys, ...requiredKeys]));
  const runtimeKnownKeys = new Set<string>([
    "form_instance_id",
  ]);

  if (uniqueKeys.length === 0) {
    return {
      ok: true,
      code: cleanCode,
      form_code: cleanFormCode,
      prefill: { values: {}, choices: {} },
      warnings: [],
    };
  }

  const rows = await sqlQuery(getFormPrefillSql, {
    code: cleanCode,
    formCode: cleanFormCode,
    keysJson: JSON.stringify(uniqueKeys),
  });

  const values: any = {};
  const choices: any = {};
  const returnedKeys = new Set<string>();

  for (const r of rows || []) {
    const k = r?.key ? String(r.key) : null;
    if (!k) continue;

    returnedKeys.add(k);

    const kind = String(r?.kind || "value").toLowerCase();
    const vj = r?.value_json;

    let parsed: any = null;
    try {
      parsed = vj == null ? null : JSON.parse(vj);
    } catch {
      parsed = vj;
    }

    if (kind === "choices") {
      choices[k] = parsed;
    } else {
      values[k] = parsed;
    }
  }

  const unknown_keys = uniqueKeys.filter(
    (k) => !returnedKeys.has(k) && !runtimeKnownKeys.has(k)
  );

  return {
    ok: true,
    code: cleanCode,
    form_code: cleanFormCode,
    prefill: { values, choices },
    warnings:
      unknown_keys.length > 0
        ? [
            {
              type: "unknown_keys",
              message: "Niet alle gevraagde prefill-keys zijn bekend.",
              unknown_keys,
            },
          ]
        : [],
  };
}
