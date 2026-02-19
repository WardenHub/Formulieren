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
  startFormInstanceSql,
  getFormsCatalogForInstallationSql,
  getFormStartPreflightSql,
  reopenFormInstanceSql,
} from "../db/queries/forms.sql.js";

import { getFormPrefillSql } from "../db/queries/prefill.sql.js";

function getUserDisplayName(user: any) {
  return user?.name || user?.upn || user?.objectId || "unknown";
}

export async function getFormStartPreflight(code: string, formCode: string, user: any) {
  const cleanCode = String(code || "").trim();
  const cleanFormCode = String(formCode || "").trim();
  const createdBy = getUserDisplayName(user);

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
        is_applicable: Number(r.is_applicable ?? 0) === 1,
        mapping_count: Number(r.mapping_count ?? 0),
      }))
    : [];

  return { items };
}

export async function startFormInstance(code: string, formCode: string, user: any) {
  const cleanCode = String(code || "").trim();
  const cleanFormCode = String(formCode || "").trim();
  const createdBy = getUserDisplayName(user);

  const rows = await sqlQuery(startFormInstanceSql, {
    code: cleanCode,
    formCode: cleanFormCode,
    createdBy,
  });

  const row: any = rows?.[0] ?? null;
  if (!row) return { error: "not found" };

  // return full instance payload
  return await getFormInstance(cleanCode, row.form_instance_id);
}

export async function getFormInstance(code: string, instanceId: string) {
  const cleanCode = String(code || "").trim();
  const id = String(instanceId || "").trim();

  const rows = await sqlQuery(getFormInstanceSql, { code: cleanCode, instanceId: id });

  const row: any = rows?.[0] ?? null;
  if (!row) return { error: "not found" };

  return { item: row };
}

export async function saveFormAnswers(code: string, instanceId: string, payload: any, user: any) {
  const cleanCode = String(code || "").trim();
  const id = String(instanceId || "").trim();
  const updatedBy = getUserDisplayName(user);

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

export async function submitFormInstance(code: string, instanceId: string, user: any) {
  const cleanCode = String(code || "").trim();
  const id = String(instanceId || "").trim();
  const submittedBy = getUserDisplayName(user);

  const rows = await sqlQuery(submitFormInstanceSql, {
    code: cleanCode,
    instanceId: id,
    submittedBy,
  });

  return { ok: true, result: rows?.[0] ?? null };
}

export async function withdrawFormInstance(code: string, instanceId: string, user: any) {
  const cleanCode = String(code || "").trim();
  const id = String(instanceId || "").trim();
  const updatedBy = getUserDisplayName(user);

  const rows = await sqlQuery(withdrawFormInstanceSql, {
    code: cleanCode,
    instanceId: id,
    updatedBy,
  });

  return { ok: true, result: rows?.[0] ?? null };
}

export async function reopenFormInstance(code: string, instanceId: string, user: any) {
  const cleanCode = String(code || "").trim();
  const id = String(instanceId || "").trim();
  const updatedBy = getUserDisplayName(user);

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

  const formCode = String(file?.form?.code || "").trim();
  const versionLabel = String(file?.form?.version_label || "").trim();
  if (!formCode) return { ok: false, error: "form.code ontbreekt" };
  if (!versionLabel) return { ok: false, error: "form.version_label ontbreekt" };

  const formInstanceId = file?.instance?.form_instance_id ?? null;
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

export async function getFormPrefill(code: string, formCode: string, keys: string[], user: any) {
  const cleanCode = String(code || "").trim();
  const cleanFormCode = String(formCode || "").trim();

  const requestedKeys = (Array.isArray(keys) ? keys : [])
    .map((k) => String(k || "").trim())
    .filter((k) => k.length > 0);

  const uniqueKeys = Array.from(new Set(requestedKeys));

  if (uniqueKeys.length === 0) {
    return { ok: true, code: cleanCode, form_code: cleanFormCode, prefill: { values: {}, choices: {} }, warnings: [] };
  }

  const rows = await sqlQuery(getFormPrefillSql, {
    code: cleanCode,
    formCode: cleanFormCode,
    keysJson: JSON.stringify(uniqueKeys),
  });

  const values: any = {};
  const choices: any = {};
  const returnedValueKeys = new Set<string>();

  for (const r of rows || []) {
    const k = r?.key ? String(r.key) : null;
    if (!k) continue;

    const kind = String(r?.kind || "value").toLowerCase();
    const vj = r?.value_json;

    let parsed: any = null;
    try {
      parsed = vj == null ? null : JSON.parse(vj);
    } catch {
      parsed = vj;
    }

    if (kind === "choices") {
      // expected: array of {value,text}
      choices[k] = parsed;
    } else {
      returnedValueKeys.add(k);
      values[k] = parsed;
    }
  }

  const unknown_keys = uniqueKeys.filter((k) => !returnedValueKeys.has(k));

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

