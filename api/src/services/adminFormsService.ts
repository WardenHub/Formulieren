// /api/src/services/adminFormsService.ts

import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import {
  getAdminFormsListSql,
  getAdminFormDetailSql,
  createAdminFormSql,
  saveAdminFormsOrderSql,
  saveAdminFormConfigSql,
  createAdminFormVersionSql,
  getActiveFormVersionSurveySql,
  getFormQuestionNameUsageSql,
} from "../db/queries/adminForms.sql.js";
import { getUserAuditActor } from "../utils/userIdentity.js";
import {
  getCalculationFieldKeys,
  getKnownCalculationIds,
} from "./formCalculationFields.js";

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

function normalizeNullableString(value: any): string | null {
  if (value == null) return null;
  const txt = String(value).trim();
  return txt.length ? txt : null;
}

function isPlainObject(value: any) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const CONTEXT_TYPES = new Set(["RELATION", "PROJECT", "WORK_ORDER", "INSTALLATION", "EMPLOYEE"]);
const FOLLOW_UP_TRIGGERS = new Set(["ON_SUBMIT", "ON_FINALIZE", "CONDITIONAL"]);
const FORM_REVIEW_SCOPES = new Set(["INSTALLATION", "RELATION", "FORM"]);
const FOLLOW_UP_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const RESPONSIBILITY_TYPES = new Set(["INTERN", "KLANT", "DERDE", "ONBEPAALD"]);
const FOLLOW_UP_VISIBILITIES = new Set(["INTERNAL_ONLY", "CUSTOMER_VISIBLE"]);
const CONDITION_OPERATORS = new Set([
  "equals", "not_equals", "contains", "in", "not_in", "is_empty", "is_not_empty",
  "truthy", "falsy", "greater_than", "greater_or_equal", "less_than", "less_or_equal",
]);

function validateConditionNode(value: any, path = "condition"): string | null {
  if (!isPlainObject(value)) return `${path} moet een object zijn`;
  const branchKeys = ["all", "any", "not"].filter((key) => value[key] !== undefined);
  if (branchKeys.length > 1) return `${path} bevat meerdere logische operatoren`;
  if (value.all !== undefined || value.any !== undefined) {
    const key = value.all !== undefined ? "all" : "any";
    if (!Array.isArray(value[key]) || value[key].length === 0) return `${path}.${key} moet een gevulde array zijn`;
    for (let index = 0; index < value[key].length; index += 1) {
      const error = validateConditionNode(value[key][index], `${path}.${key}[${index}]`);
      if (error) return error;
    }
    return null;
  }
  if (value.not !== undefined) return validateConditionNode(value.not, `${path}.not`);
  const field = String(value.field || "").trim();
  const operator = String(value.operator || "equals").trim().toLowerCase();
  if (!field) return `${path}.field is verplicht`;
  if (!CONDITION_OPERATORS.has(operator)) return `${path}.operator wordt niet ondersteund`;
  if (["in", "not_in"].includes(operator) && !Array.isArray(value.value)) {
    return `${path}.value moet voor ${operator} een array zijn`;
  }
  return null;
}

function normalizeContextRules(value: any) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  let primaryCount = 0;
  const items = rows.map((row: any, index: number) => {
    const context_type = String(row?.context_type || "").trim().toUpperCase();
    if (!CONTEXT_TYPES.has(context_type)) throw new Error(`context_rules[${index}] heeft een ongeldig contexttype`);
    if (seen.has(context_type)) throw new Error(`contexttype ${context_type} komt dubbel voor`);
    seen.add(context_type);
    const is_active = row?.is_active === false ? false : true;
    const is_required = row?.is_required === true;
    const is_primary = row?.is_primary === true;
    const selection_order = normalizeNullableNumber(row?.selection_order) ?? (index + 1) * 10;
    if (selection_order < 0) throw new Error(`context_rules[${index}].selection_order is ongeldig`);
    if (!is_active && (is_required || is_primary)) throw new Error(`inactieve context ${context_type} kan niet verplicht of primair zijn`);
    if (is_primary) primaryCount += 1;
    return { context_type, is_required, is_primary, selection_order, is_active };
  });
  if (primaryCount > 1) throw new Error("slechts één context mag primair zijn");
  if (items.some((item) => item.is_active) && primaryCount !== 1) {
    throw new Error("kies precies één primaire context");
  }
  return items;
}

function normalizeFollowUpRules(value: any) {
  const rows = Array.isArray(value) ? value : [];
  const seenIds = new Set<string>();
  return rows.map((row: any, index: number) => {
    const id = normalizeNullableString(row?.form_follow_up_rule_id);
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`follow_up_rules[${index}] heeft een ongeldig regel-id`);
    }
    if (id && seenIds.has(id.toLowerCase())) throw new Error(`follow_up_rules[${index}] gebruikt een dubbel regel-id`);
    if (id) seenIds.add(id.toLowerCase());
    const trigger_type = String(row?.trigger_type || "").trim().toUpperCase();
    const priority = String(row?.priority || "NORMAL").trim().toUpperCase();
    const responsibility_type = String(row?.responsibility_type || "INTERN").trim().toUpperCase();
    const visibility = String(row?.visibility || "INTERNAL_ONLY").trim().toUpperCase();
    const title = String(row?.action_title_template || "").trim();
    if (!FOLLOW_UP_TRIGGERS.has(trigger_type)) throw new Error(`follow_up_rules[${index}] heeft een ongeldige trigger`);
    if (!title) throw new Error(`follow_up_rules[${index}] mist een actietitel`);
    if (title.length > 300) throw new Error(`follow_up_rules[${index}] actietitel is langer dan 300 tekens`);
    if (!FOLLOW_UP_PRIORITIES.has(priority)) throw new Error(`follow_up_rules[${index}] heeft een ongeldige prioriteit`);
    if (!RESPONSIBILITY_TYPES.has(responsibility_type)) throw new Error(`follow_up_rules[${index}] heeft een ongeldige verantwoordelijkheid`);
    if (!FOLLOW_UP_VISIBILITIES.has(visibility)) throw new Error(`follow_up_rules[${index}] heeft een ongeldige zichtbaarheid`);
    const due_after_days = normalizeNullableNumber(row?.due_after_days);
    if (due_after_days != null && due_after_days < 0) throw new Error(`follow_up_rules[${index}] heeft een ongeldige doorlooptijd`);
    const certificate_impact = normalizeNullableString(row?.certificate_impact)?.toLowerCase() ?? null;
    if (certificate_impact && !["yes", "no"].includes(certificate_impact)) {
      throw new Error(`follow_up_rules[${index}] heeft een ongeldig certificaatgevolg`);
    }
    let condition = row?.condition ?? row?.condition_json ?? null;
    if (typeof condition === "string") {
      try { condition = condition.trim() ? JSON.parse(condition) : null; }
      catch { throw new Error(`follow_up_rules[${index}].condition is geen geldige JSON`); }
    }
    if (condition != null) {
      const error = validateConditionNode(condition, `follow_up_rules[${index}].condition`);
      if (error) throw new Error(error);
    }
    if (trigger_type === "CONDITIONAL" && condition == null) {
      throw new Error(`follow_up_rules[${index}] met trigger CONDITIONAL mist een voorwaarde`);
    }
    const sort_order = normalizeNullableNumber(row?.sort_order) ?? (index + 1) * 10;
    if (sort_order < 0) throw new Error(`follow_up_rules[${index}].sort_order is ongeldig`);
    return {
      form_follow_up_rule_id: id,
      trigger_type,
      condition,
      action_title_template: title,
      action_description_template: normalizeNullableString(row?.action_description_template),
      category: normalizeNullableString(row?.category),
      priority,
      responsibility_type,
      assigned_role_code: normalizeNullableString(row?.assigned_role_code),
      due_after_days,
      certificate_impact,
      visibility,
      sort_order,
      is_active: row?.is_active === false ? false : true,
    };
  });
}

const FOLLOW_UP_PRIORITY_VALUES = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const FOLLOW_UP_RESPONSIBILITY_VALUES = new Set(["INTERN", "KLANT", "DERDE", "ONBEPAALD"]);

/* Prioriteit, verantwoordelijkheid en deadline staan in ember.followUp van een vraag. De
   extractor negeert een waarde die hij niet kent, want stil gokken is erger dan de default;
   maar dan moet de fout hier wel gemeld worden, anders publiceert iemand een formulier
   waarin een typefout stil niets doet. */
function validateFollowUpClassification(surveyJson: any): string | null {
  const problems: string[] = [];

  function checkConfig(questionName: string, config: any) {
    if (!isPlainObject(config)) return;

    if (config.priority !== undefined) {
      const value = String(config.priority).trim().toUpperCase();
      if (!FOLLOW_UP_PRIORITY_VALUES.has(value)) {
        problems.push(`${questionName}; priority '${config.priority}' bestaat niet`);
      }
    }

    if (config.responsibility !== undefined) {
      const value = String(config.responsibility).trim().toUpperCase();
      if (!FOLLOW_UP_RESPONSIBILITY_VALUES.has(value)) {
        problems.push(`${questionName}; responsibility '${config.responsibility}' bestaat niet`);
      }
    }

    if (config.dueInDays !== undefined && config.dueInDays !== null) {
      const days = Number(config.dueInDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        problems.push(
          `${questionName}; dueInDays '${config.dueInDays}' moet een heel getal tussen 1 en 365 zijn`
        );
      }
    }
  }

  function walk(node: any) {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }

    if (!isPlainObject(node)) return;

    const followUp = (node as any).ember?.followUp;
    const questionName = String((node as any).name || "een vraag zonder naam");

    if (Array.isArray(followUp)) {
      for (const config of followUp) checkConfig(questionName, config);
    } else {
      checkConfig(questionName, followUp);
    }

    walk((node as any).elements);
    walk((node as any).templateElements);
    walk((node as any).questions);
  }

  walk(surveyJson?.pages);

  return problems.length ? problems.join("; ") : null;
}

/* De veldkaart van een berekening. Een definitie mag de vraag- en kolomnamen zelf noemen
   onder ember.calculations[].fields; noemt hij een sleutel die de berekening niet kent, of
   een naam die niet in de vragenlijst bestaat, dan doet die declaratie stil niets. Dat is
   precies het soort fout dat je pas maanden later ontdekt aan een leeg getal op een
   certificaat, dus hij wordt hier geweigerd. */
function validateCalculationFields(surveyJson: any): string | null {
  const declared = Array.isArray(surveyJson?.ember?.calculations)
    ? surveyJson.ember.calculations
    : [];

  if (!declared.length) return null;

  const bestaandeNamen = collectQuestionAndColumnNames(surveyJson);
  const problems: string[] = [];

  for (const entry of declared) {
    const id = String(entry?.id || "").trim();
    if (!id) continue;

    const known = getKnownCalculationIds();
    if (!known.includes(id)) {
      problems.push(`berekening '${id}' bestaat niet; bekend zijn ${known.join(", ")}`);
      continue;
    }

    const fields = entry?.fields;
    if (!isPlainObject(fields)) continue;

    const toegestaneSleutels = getCalculationFieldKeys(id);

    for (const [key, value] of Object.entries(fields)) {
      if (!toegestaneSleutels.includes(key)) {
        problems.push(`berekening '${id}' kent geen veld '${key}'`);
        continue;
      }

      const namen = Array.isArray(value) ? value : [value];
      for (const naam of namen) {
        const clean = String(naam || "").trim();
        if (!clean) {
          problems.push(`berekening '${id}', veld '${key}' is leeg`);
          continue;
        }
        if (!bestaandeNamen.has(clean)) {
          problems.push(
            `berekening '${id}', veld '${key}' verwijst naar '${clean}' en die vraag of kolom bestaat niet`
          );
        }
      }
    }
  }

  return problems.length ? problems.join("; ") : null;
}

/* Alle vraagnamen en kolomnamen van de vragenlijst; dezelfde verzameling waarop de
   sleutelcontrole van antwoorden werkt. */
function collectQuestionAndColumnNames(surveyJson: any) {
  const namen = new Set<string>();

  function walk(node: any) {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }

    if (!isPlainObject(node)) return;

    const naam = String((node as any).name || "").trim();
    if (naam) namen.add(naam);

    walk((node as any).elements);
    walk((node as any).questions);
    walk((node as any).templateElements);
    walk((node as any).columns);
  }

  walk(surveyJson?.pages);
  return namen;
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

  const followUpProblem = validateFollowUpClassification(surveyJson);
  if (followUpProblem) {
    return {
      ok: false,
      error: `ember.followUp bevat een onbekende waarde; ${followUpProblem}`,
    };
  }

  const calculationProblem = validateCalculationFields(surveyJson);
  if (calculationProblem) {
    return {
      ok: false,
      error: `ember.calculations klopt niet; ${calculationProblem}`,
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
        document_profile_key: normalizeNullableString(r.document_profile_key),
        certification_mark_key: normalizeNullableString(r.certification_mark_key),
        workflow_profile_key: normalizeNullableString(r.workflow_profile_key),
        official_document_number: normalizeNullableString(r.official_document_number),
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
  const contextRuleRows: any[] = Array.isArray(recordsets?.[4]) ? recordsets[4] : [];
  const followUpRuleRows: any[] = Array.isArray(recordsets?.[5]) ? recordsets[5] : [];
  const workflowRoleRows: any[] = Array.isArray(recordsets?.[6]) ? recordsets[6] : [];
  const certificationMarkRows: any[] = Array.isArray(recordsets?.[7]) ? recordsets[7] : [];

  const versions = versionRows.map((r: any, index: number) => ({
    form_version_id: r.form_version_id,
    version: Number(r.version ?? 0),
    version_label: r.version_label,
    published_at: r.published_at ?? null,
    published_by: r.published_by ?? null,
    certification_mark_key: normalizeNullableString(r.certification_mark_key),
    change_summary: normalizeNullableString(r.change_summary),
    is_active: Boolean(r.is_active),
    is_latest: index === 0,
    survey_json: parseJsonObject(r.survey_json, {}),
  }));

  const item = {
    form_id: formRow.form_id,
    code: formRow.code,
    name: formRow.name,
    description: formRow.description ?? null,
    document_profile_key: normalizeNullableString(formRow.document_profile_key),
    certification_mark_key: normalizeNullableString(formRow.certification_mark_key),
    workflow_profile_key: normalizeNullableString(formRow.workflow_profile_key),
    official_document_number: normalizeNullableString(formRow.official_document_number),
    owner_department: normalizeNullableString(formRow.owner_department),
    owner_display_name: normalizeNullableString(formRow.owner_display_name),
    knowledge_base_reference: normalizeNullableString(formRow.knowledge_base_reference),
    requires_installation_review: formRow.requires_installation_review === true,
    review_scope: normalizeNullableString(formRow.review_scope) || "INSTALLATION",
    finalize_role_code: normalizeNullableString(formRow.finalize_role_code),
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
    context_rules: contextRuleRows.map((r: any) => ({
      context_type: String(r.context_type || "").trim().toUpperCase(),
      is_required: r.is_required === true,
      is_primary: r.is_primary === true,
      selection_order: Number(r.selection_order ?? 0),
      is_active: r.is_active === false ? false : true,
    })),
    follow_up_rules: followUpRuleRows.map((r: any) => ({
      form_follow_up_rule_id: r.form_follow_up_rule_id,
      trigger_type: String(r.trigger_type || "").trim().toUpperCase(),
      condition: parseJsonObject(r.condition_json, null),
      action_title_template: r.action_title_template,
      action_description_template: r.action_description_template ?? null,
      category: r.category ?? null,
      priority: String(r.priority || "NORMAL").trim().toUpperCase(),
      responsibility_type: String(r.responsibility_type || "INTERN").trim().toUpperCase(),
      assigned_role_code: r.assigned_role_code ?? null,
      due_after_days: r.due_after_days == null ? null : Number(r.due_after_days),
      certificate_impact: r.certificate_impact ?? null,
      visibility: String(r.visibility || "INTERNAL_ONLY").trim().toUpperCase(),
      sort_order: Number(r.sort_order ?? 0),
      is_active: r.is_active === false ? false : true,
    })),
    workflow_roles: workflowRoleRows.map((r: any) => ({
      role_code: r.role_code,
      display_name: r.display_name,
      description: r.description ?? null,
      is_active: r.is_active === false ? false : true,
    })),
    certification_marks: certificationMarkRows.map((r: any) => ({
      certification_mark_key: r.certification_mark_key,
      authority_code: r.authority_code,
      scheme_code: r.scheme_code,
      process_code: r.process_code,
      display_name: r.display_name,
      asset_file_name: r.asset_file_name,
      source_url: normalizeNullableString(r.source_url),
      sort_order: Number(r.sort_order ?? 0),
      is_active: r.is_active === false ? false : true,
    })),
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

  const createdBy = getUserAuditActor(user);

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

  const updatedBy = getUserAuditActor(user);

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
  const documentProfileKey = normalizeNullableString(payload?.document_profile_key);
  const certificationMarkKey = normalizeNullableString(payload?.certification_mark_key);
  const workflowProfileKey = normalizeNullableString(payload?.workflow_profile_key);
  const officialDocumentNumber = normalizeNullableString(payload?.official_document_number);
  const ownerDepartment = normalizeNullableString(payload?.owner_department);
  const ownerDisplayName = normalizeNullableString(payload?.owner_display_name);
  const knowledgeBaseReference = normalizeNullableString(payload?.knowledge_base_reference);
  const requiresInstallationReview = payload?.requires_installation_review === true;

  // De beoordelingsronde van dit formulier; per installatie, per relatie, of alleen de
  // punten van het formulier zelf. Een onbekende waarde valt terug op het bestaande gedrag
  // in plaats van de definitie in een onbruikbare stand te zetten.
  const reviewScopeRaw = String(payload?.review_scope || "").trim().toUpperCase();
  const reviewScope = FORM_REVIEW_SCOPES.has(reviewScopeRaw) ? reviewScopeRaw : "INSTALLATION";

  // Leeg betekent het bestaande gedrag; de formulierbeheerders ronden af.
  const finalizeRoleCode = normalizeNullableString(payload?.finalize_role_code);
  const status = String(payload?.status || "").trim().toUpperCase();

  if (!name) return { ok: false, error: "name is verplicht" };
  if (!["A", "M", "I"].includes(status)) return { ok: false, error: "ongeldige status" };

  const applicability_type_keys = Array.isArray(payload?.applicability_type_keys)
    ? payload.applicability_type_keys
        .map((x: any) => String(x || "").trim())
        .filter((x: string) => x.length > 0)
    : [];

  const preflight = payload?.preflight || {};
  let contextRules: any[];
  let followUpRules: any[];
  try {
    contextRules = normalizeContextRules(payload?.context_rules);
    followUpRules = normalizeFollowUpRules(payload?.follow_up_rules);
  } catch (error: any) {
    return { ok: false, error: error?.message || "ongeldige formulierconfiguratie" };
  }

  const updatedBy = getUserAuditActor(user);

  await sqlQuery(saveAdminFormConfigSql, {
    formId: id,
    name,
    description,
    documentProfileKey,
    certificationMarkKey,
    workflowProfileKey,
    officialDocumentNumber,
    ownerDepartment,
    ownerDisplayName,
    knowledgeBaseReference,
    requiresInstallationReview,
    reviewScope,
    finalizeRoleCode,
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
    contextRulesJson: JSON.stringify(contextRules),
    followUpRulesJson: JSON.stringify(followUpRules),
    updatedBy,
  });

  return await getAdminFormDetail(id);
}

// Een vraagnaam is de sleutel waar een antwoord, een opvolgactie en een stuk uitleg aan
// vastzitten. Hernoemen of weghalen breekt die verbinding stil; daarom halen we alle namen
// uit een definitie op om twee versies met elkaar te kunnen vergelijken.
function collectQuestionNames(surveyJson: any) {
  const names = new Set<string>();

  function walk(node: any) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }

    const name = typeof node.name === "string" ? node.name.trim() : "";
    if (name && (node.type || Array.isArray(node.columns) || Array.isArray(node.rows))) {
      names.add(name);
    }

    walk(node.pages);
    walk(node.elements);
    walk(node.templateElements);
    walk(node.questions);
  }

  walk(surveyJson?.pages);
  return names;
}

function describeUsage(row: any) {
  const parts: string[] = [];
  const followUps = Number(row?.follow_up_count || 0);
  const guidance = Number(row?.guidance_count || 0);
  const answers = Number(row?.answered_instance_count || 0);

  if (answers > 0) parts.push(answers === 1 ? "1 ingevuld formulier" : `${answers} ingevulde formulieren`);
  if (followUps > 0) parts.push(`${followUps} actiepunt${followUps === 1 ? "" : "en"}`);
  if (guidance > 0) parts.push(guidance === 1 ? "1 stuk uitleg" : `${guidance} stukken uitleg`);

  return parts.join(", ");
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

  // Een versie zonder uitleg is later niet meer te plaatsen; de invuller krijgt bovendien
  // een melding dat zijn formulier is bijgewerkt en die melding hoort te zeggen waarom.
  const changeSummary = normalizeNullableString(
    payload?.change_summary ?? payload?.changeSummary
  );
  if (!changeSummary) {
    return { ok: false, error: "change_summary is verplicht; beschrijf kort wat er wijzigt" };
  }
  if (changeSummary.length > 2000) {
    return { ok: false, error: "change_summary mag maximaal 2000 tekens bevatten" };
  }

  // Vraagnamen die verdwijnen breken bestaande antwoorden, opvolgacties en uitleg. Dat mag,
  // maar niet per ongeluk; het moet met naam en toenaam bevestigd worden.
  const activeRows = await sqlQuery(getActiveFormVersionSurveySql, { formId: id });
  const activeVersion: any = activeRows?.[0] ?? null;

  if (activeVersion?.survey_json) {
    const previousSurvey = parseJsonObject(activeVersion.survey_json, null);
    const previousNames = collectQuestionNames(previousSurvey);
    const nextNames = collectQuestionNames(surveyJsonObject);
    const removedNames = [...previousNames].filter((name) => !nextNames.has(name));

    if (removedNames.length > 0) {
      const usageRows = await sqlQuery(getFormQuestionNameUsageSql, {
        formId: id,
        questionNamesJson: JSON.stringify(removedNames),
      });

      const blocking = (usageRows || []).filter(
        (row: any) =>
          Number(row.follow_up_count || 0) > 0 ||
          Number(row.guidance_count || 0) > 0 ||
          Number(row.answered_instance_count || 0) > 0
      );

      const acknowledged = new Set(
        (Array.isArray(payload?.accept_removed_questions) ? payload.accept_removed_questions : [])
          .map((value: any) => String(value || "").trim())
          .filter(Boolean)
      );

      const unacknowledged = blocking.filter((row: any) => !acknowledged.has(String(row.question_name)));

      if (unacknowledged.length > 0) {
        return {
          ok: false,
          error:
            "Deze vragen verdwijnen terwijl er nog gegevens aan hangen: " +
            unacknowledged
              .map((row: any) => `${row.question_name} (${describeUsage(row)})`)
              .join("; ") +
            ". Bevestig ze in accept_removed_questions als dit de bedoeling is.",
          removed_questions: blocking.map((row: any) => ({
            question_name: row.question_name,
            follow_up_count: Number(row.follow_up_count || 0),
            guidance_count: Number(row.guidance_count || 0),
            answered_instance_count: Number(row.answered_instance_count || 0),
          })),
        };
      }
    }
  }

  const publishedBy = getUserAuditActor(user);

  const rows = await sqlQuery(createAdminFormVersionSql, {
    formId: id,
    surveyJson: JSON.stringify(surveyJsonObject),
    publishedBy,
    changeSummary,
  });

  const row: any = rows?.[0] ?? null;
  if (!row?.form_version_id) return { error: "create version failed" };

  return await getAdminFormDetail(id);
}
