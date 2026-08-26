import { sqlQuery } from "../db/index.js";
import {
  getFormsHubCatalogSql,
  getFormsHubInstanceSql,
  getFormsHubInstancesSql,
  getFormsHubStartRulesSql,
  reopenFormsHubInstanceSql,
  saveFormsHubAnswersSql,
  searchFormsHubContextSql,
  startFormsHubInstanceSql,
  submitFormsHubInstanceSql,
  updateFormsHubInstanceMetadataSql,
  withdrawFormsHubInstanceSql,
} from "../db/queries/formsHub.sql.js";
import {
  getUserActorCandidates,
  getUserAuditActor,
} from "../utils/userIdentity.js";
import { getFormStartPreflight } from "./formsService.js";
import {
  previewFormFollowUps,
  syncFormFollowUps,
} from "./followUpService.js";
import {
  previewDefinitionFollowUps,
  syncDefinitionFollowUps,
} from "./formDefinitionFollowUpRuleService.js";
import {
  atriumReaderClient,
  getAuthorizedAtriumBusinessUnit,
} from "./atriumReaderClient.js";
import {
  normalizeSelectedContexts,
  reconcileResolvedContexts,
  selectedAtriumContexts,
} from "./formsHubContext.js";

const CONTEXT_TYPES = new Set([
  "RELATION",
  "PROJECT",
  "WORK_ORDER",
  "INSTALLATION",
  "EMPLOYEE",
]);

const CONTEXT_SOURCES = new Set([
  "ATRIUM_READER",
  "FABRIC_GOLD",
  "EMBER_DIRECTORY",
  "ENTRA",
]);

function optionalText(value: any, maxLength = 2000): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function parsePositiveId(value: any): number | null {
  const parsed = Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseJsonArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: any, fallback: any = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function parseDraftRev(value: any): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function mapContextRule(row: any) {
  return {
    context_type: String(row?.context_type || "").toUpperCase(),
    is_required: Boolean(row?.is_required),
    is_primary: Boolean(row?.is_primary),
    selection_order: Number(row?.selection_order ?? 0),
  };
}

function mapContext(row: any) {
  return {
    context_type: String(row?.context_type || "").toUpperCase(),
    source_system: String(row?.source_system || "").toUpperCase(),
    business_unit: row?.business_unit ?? null,
    source_key: row?.source_key ?? null,
    display_code: row?.display_code ?? row?.display_code_snapshot ?? null,
    display_label: row?.display_label ?? row?.display_label_snapshot ?? null,
    metadata: (() => {
      const raw = row?.metadata ?? row?.metadata_json ?? row?.metadata_snapshot_json;
      if (!raw || typeof raw === "object") return raw ?? null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })(),
    is_primary: Boolean(row?.is_primary),
    derivation_type: row?.derivation_type ?? null,
    source_modified_at: row?.source_modified_at ?? null,
    last_verified_at: row?.last_verified_at ?? null,
    verification_status: row?.verification_status ?? null,
    relation_kind: row?.relation_kind ?? null,
  };
}

export async function getAvailableForms() {
  const rows = await sqlQuery(getFormsHubCatalogSql, {});
  return {
    items: (rows || []).map((row: any) => ({
      form_id: row.form_id,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      official_document_number: row.official_document_number ?? null,
      owner_department: row.owner_department ?? null,
      owner_display_name: row.owner_display_name ?? null,
      knowledge_base_reference:
        row.version_knowledge_base_reference ?? row.knowledge_base_reference ?? null,
      requires_installation_review: Boolean(row.requires_installation_review),
      status: row.status,
      sort_order: Number(row.sort_order ?? 0),
      version: Number(row.version),
      version_label: row.version_label,
      published_at: row.published_at ?? null,
      effective_from: row.effective_from ?? null,
      change_summary: row.change_summary ?? null,
      issued_by: row.issued_by ?? null,
      context_rules: parseJsonArray(row.context_rules_json).map(mapContextRule),
    })),
  };
}

export async function getMyForms(
  options: {
    q?: any;
    status?: any;
    mine?: boolean;
    formCode?: any;
    contextQ?: any;
    dateFrom?: any;
    dateTo?: any;
    reviewStatus?: any;
    hasOpenPoints?: any;
  } = {},
  user: any
) {
  const normalizeDate = (value: any) => {
    const text = optionalText(value, 10);
    return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  };
  const normalizeOptionalBoolean = (value: any) => {
    if (value == null || value === "") return null;
    const text = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "ja"].includes(text)) return 1;
    if (["0", "false", "no", "nee"].includes(text)) return 0;
    return null;
  };
  const rows = await sqlQuery(getFormsHubInstancesSql, {
    actorCandidatesJson: JSON.stringify(getUserActorCandidates(user)),
    mine: options.mine === false ? 0 : 1,
    q: optionalText(options.q, 400),
    status: optionalText(options.status, 30)?.toUpperCase() ?? null,
    formCode: optionalText(options.formCode, 100)?.toUpperCase() ?? null,
    contextQ: optionalText(options.contextQ, 400),
    dateFrom: normalizeDate(options.dateFrom),
    dateTo: normalizeDate(options.dateTo),
    reviewStatus: optionalText(options.reviewStatus, 30)?.toUpperCase() ?? null,
    hasOpenPoints: normalizeOptionalBoolean(options.hasOpenPoints),
  });

  return {
    items: (rows || []).map((row: any) => ({
      ...row,
      form_instance_id: Number(row.form_instance_id),
      parent_instance_id:
        row.parent_instance_id == null ? null : Number(row.parent_instance_id),
      version: row.version == null ? null : Number(row.version),
      contexts: parseJsonArray(row.contexts_json).map(mapContext),
    })),
  };
}

export async function searchContext(
  contextType: any,
  q: any,
  _businessUnit: any
) {
  const normalizedType = String(contextType || "").trim().toUpperCase();
  if (!CONTEXT_TYPES.has(normalizedType)) {
    return { ok: false, error: "onbekend contexttype" };
  }

  const query = optionalText(q, 200);
  if (!query || query.length < 3) {
    return { ok: false, error: "zoekterm moet minimaal 3 tekens bevatten" };
  }

  if (["RELATION", "PROJECT", "WORK_ORDER"].includes(normalizedType)) {
    const readerResult = normalizedType === "RELATION"
      ? await atriumReaderClient.findRelations(query)
      : normalizedType === "PROJECT"
        ? await atriumReaderClient.findProjects(query)
        : await atriumReaderClient.findWorkorders(query);
    return { ok: true, items: readerResult.items.map(mapContext), rowCount: readerResult.rowCount, truncated: readerResult.truncated, correlationId: readerResult.correlationId };
  }

  const rows = await sqlQuery(searchFormsHubContextSql, {
    contextType: normalizedType,
    q: query,
    businessUnit: normalizedType === "INSTALLATION"
      ? getAuthorizedAtriumBusinessUnit()
      : null,
  });

  return { ok: true, items: (rows || []).map(mapContext) };
}

export async function resolveContext(
  contextType: any,
  sourceSystem: any,
  sourceKey: any
) {
  const normalizedType = String(contextType || "").trim().toUpperCase();
  const normalizedSource = String(sourceSystem || "").trim().toUpperCase();
  const normalizedKey = optionalText(sourceKey, 450);

  if (!CONTEXT_TYPES.has(normalizedType)) {
    return { ok: false, error: "onbekend contexttype" };
  }
  if (!CONTEXT_SOURCES.has(normalizedSource) || !normalizedKey) {
    return { ok: false, error: "ongeldige broncontext" };
  }

  if (!["RELATION", "PROJECT", "WORK_ORDER"].includes(normalizedType)) {
    return { ok: true, items: [] };
  }

  if (normalizedSource !== "ATRIUM_READER") {
    return { ok: false, error: "ongeldige broncontext" };
  }
  const readerResult = await atriumReaderClient.resolveContext(normalizedType, normalizedKey);
  return { ok: true, items: readerResult.items.map(mapContext), rowCount: readerResult.rowCount, truncated: readerResult.truncated, correlationId: readerResult.correlationId };
}

export async function startForm(formCode: any, payload: any, user: any) {
  const cleanFormCode = optionalText(formCode, 100);
  if (!cleanFormCode) return { ok: false, error: "formuliercode ontbreekt" };

  let contexts: any[];
  try {
    contexts = normalizeSelectedContexts(payload?.contexts);
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }

  const rules = await sqlQuery(getFormsHubStartRulesSql, { formCode: cleanFormCode });
  const allowedTypes = new Set(
    (Array.isArray(rules) ? rules : [])
      .map((rule: any) => String(rule.context_type || "").toUpperCase())
      .filter(Boolean)
  );
  const readerSelections = selectedAtriumContexts(contexts);
  const needsAtriumBusinessUnit = contexts.some(
    (context) => context.context_type !== "EMPLOYEE"
  );
  const authorizedBusinessUnit = needsAtriumBusinessUnit
    ? getAuthorizedAtriumBusinessUnit()
    : null;
  const readerResolutions = await Promise.all(readerSelections.map(async (selected) => {
    const resolved = await atriumReaderClient.resolveContext(selected.context_type, selected.source_key);
    return {
      selected,
      correlationId: resolved.correlationId,
      items: resolved.items,
    };
  }));

  let resolvedContexts;
  try {
    resolvedContexts = reconcileResolvedContexts(
      contexts,
      readerResolutions,
      allowedTypes,
      authorizedBusinessUnit || "",
    );
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }

  const installationContext = resolvedContexts.find(
    (item) => item.context_type === "INSTALLATION"
  );
  if (installationContext) {
    const preflight = await getFormStartPreflight(
      installationContext.source_key,
      cleanFormCode,
      user
    );
    if (!preflight?.ok_to_start) {
      const messages = (Array.isArray(preflight?.blocking) ? preflight.blocking : [])
        .map((item: any) => String(item?.message || "").trim())
        .filter(Boolean);
      return {
        ok: false,
        error: messages.join(" ") || "Het formulier voldoet niet aan de startvoorwaarden.",
        preflight,
      };
    }
  }

  const parentInstanceIdRaw = payload?.parent_instance_id ?? null;
  const parentInstanceId =
    parentInstanceIdRaw == null || String(parentInstanceIdRaw).trim() === ""
      ? null
      : parsePositiveId(parentInstanceIdRaw);

  if (parentInstanceIdRaw != null && parentInstanceId == null) {
    return { ok: false, error: "ongeldige parent_instance_id" };
  }

  const rows = await sqlQuery(startFormsHubInstanceSql, {
    formCode: cleanFormCode,
    contextsJson: JSON.stringify(resolvedContexts),
    authorizedBusinessUnit,
    instanceTitle: optionalText(payload?.instance_title, 200),
    instanceNote: optionalText(payload?.instance_note, 4000),
    parentInstanceId,
    createdBy: getUserAuditActor(user),
  });

  const row: any = rows?.[0] ?? null;
  if (!row) return { ok: false, error: "formulier kon niet worden gestart" };

  const installationCode = optionalText(row.atrium_installation_code, 450);
  return {
    ok: true,
    item: {
      form_instance_id: Number(row.form_instance_id),
      form_version_id: row.form_version_id,
      form_id: row.form_id,
      atrium_installation_code: installationCode,
      route: installationCode
        ? `/installaties/${encodeURIComponent(installationCode)}/formulieren/${encodeURIComponent(row.form_instance_id)}`
        : `/formulieren/${encodeURIComponent(row.form_instance_id)}`,
    },
  };
}

export async function getFormInstance(instanceId: any) {
  const id = parsePositiveId(instanceId);
  if (id == null) return { error: "not found" };
  const rows = await sqlQuery(getFormsHubInstanceSql, { instanceId: id });
  const row: any = rows?.[0] ?? null;
  if (!row) return { error: "not found" };

  return {
    item: {
      ...row,
      form_instance_id: Number(row.form_instance_id),
      parent_instance_id:
        row.parent_instance_id == null ? null : Number(row.parent_instance_id),
      contexts: parseJsonArray(row.contexts_json).map(mapContext),
    },
  };
}

export async function updateFormInstanceMetadata(
  instanceId: any,
  payload: any,
  user: any
) {
  const id = parsePositiveId(instanceId);
  if (id == null) return { ok: false, error: "ongeldige form_instance_id" };

  const expectedDraftRev = parseDraftRev(
    payload?.expected_draft_rev ?? payload?.expectedDraftRev
  );
  if (expectedDraftRev == null) {
    return { ok: false, error: "expected_draft_rev is verplicht" };
  }

  const rawParent = payload?.parent_instance_id ?? payload?.parentInstanceId ?? null;
  const parentInstanceId =
    rawParent == null || String(rawParent).trim() === ""
      ? null
      : parsePositiveId(rawParent);
  if (rawParent != null && parentInstanceId == null) {
    return { ok: false, error: "ongeldige parent_instance_id" };
  }

  const rows = await sqlQuery(updateFormsHubInstanceMetadataSql, {
    instanceId: id,
    instanceTitle: optionalText(payload?.instance_title ?? payload?.instanceTitle, 200),
    instanceNote: optionalText(payload?.instance_note ?? payload?.instanceNote, 4000),
    parentInstanceId,
    expectedDraftRev,
    updatedBy: getUserAuditActor(user),
  });
  return { ok: true, result: rows?.[0] ?? null };
}

export async function saveFormAnswers(instanceId: any, payload: any, user: any) {
  const id = parsePositiveId(instanceId);
  if (id == null) return { ok: false, error: "ongeldige form_instance_id" };
  const expectedDraftRev = parseDraftRev(
    payload?.expected_draft_rev ?? payload?.expectedDraftRev
  );
  if (expectedDraftRev == null) {
    return { ok: false, error: "expected_draft_rev is verplicht" };
  }

  const answers = payload?.answers_json ?? payload?.answersJson ?? {};
  const calculated = payload?.calculated_json ?? payload?.calculatedJson ?? null;
  const rows = await sqlQuery(saveFormsHubAnswersSql, {
    instanceId: id,
    answersJson: JSON.stringify(answers ?? {}),
    calculatedJson: calculated == null ? null : JSON.stringify(calculated),
    expectedDraftRev,
    updatedBy: getUserAuditActor(user),
  });
  return { ok: true, result: rows?.[0] ?? null };
}

export async function previewSubmitFormInstance(instanceId: any, payload: any) {
  const current = await getFormInstance(instanceId);
  if (current?.error) return current;
  const item: any = current.item;
  const status = String(item?.status || "");
  if (status !== "CONCEPT") {
    return {
      ok: true,
      can_submit: false,
      form_instance_id: item.form_instance_id,
      status,
      validation: {
        has_errors: true,
        errors: [{ code: "invalid_status", message: "Formulier is niet meer bewerkbaar." }],
      },
      follow_ups: { ok: true, count: 0, counts_by_kind: { workflow: 0, report_only: 0, total: 0 }, items: [] },
    };
  }

  const surveyJson = parseJsonObject(item.survey_json, null);
  if (!surveyJson) return { ok: false, error: "survey_json ontbreekt of is ongeldig" };
  const override = payload?.answers_json ?? payload?.answersJson ?? payload?.answers;
  const answers = override && typeof override === "object"
    ? override
    : parseJsonObject(item.answers_json, {});
  const [preview, definitionItems] = await Promise.all([
    previewFormFollowUps({ surveyJson, answers }),
    previewDefinitionFollowUps({ formInstanceId: item.form_instance_id, answers }),
  ]);
  const items = [
    ...(Array.isArray(preview?.items) ? preview.items : []),
    ...definitionItems,
  ];
  const workflow = items.filter((item: any) => item?.kind === "workflow").length;
  const reportOnly = items.filter((item: any) => item?.kind === "report-only").length;

  return {
    ok: true,
    can_submit: true,
    form_instance_id: item.form_instance_id,
    status,
    validation: { has_errors: false, errors: [] },
    follow_ups: {
      ok: true,
      count: items.length,
      counts_by_kind: { workflow, report_only: reportOnly, total: items.length },
      items,
    },
  };
}

export async function submitFormInstance(instanceId: any, user: any) {
  const id = parsePositiveId(instanceId);
  if (id == null) return { error: "not found" };
  const current = await getFormInstance(id);
  if (current?.error) return current;
  const item: any = current.item;
  const surveyJson = parseJsonObject(item.survey_json, {});
  const answers = parseJsonObject(item.answers_json, {});
  const actor = getUserAuditActor(user);

  const rows = await sqlQuery(submitFormsHubInstanceSql, { instanceId: id, actor });
  const followUpSync = await syncFormFollowUps({
    formInstance: {
      form_instance_id: id,
      installation_id: null,
      atrium_installation_code: null,
    },
    surveyJson,
    answers,
    user,
  });
  const definitionRuleSync = await syncDefinitionFollowUps({
    formInstanceId: id,
    answers,
    user,
  });
  return {
    ok: true,
    result: rows?.[0] ?? null,
    follow_up_sync: {
      ...followUpSync,
      definition_rules: definitionRuleSync,
    },
  };
}

export async function withdrawFormInstance(instanceId: any, user: any) {
  const id = parsePositiveId(instanceId);
  if (id == null) return { error: "not found" };
  const rows = await sqlQuery(withdrawFormsHubInstanceSql, {
    instanceId: id,
    actor: getUserAuditActor(user),
  });
  return { ok: true, result: rows?.[0] ?? null };
}

export async function reopenFormInstance(instanceId: any, user: any) {
  const id = parsePositiveId(instanceId);
  if (id == null) return { error: "not found" };
  const rows = await sqlQuery(reopenFormsHubInstanceSql, {
    instanceId: id,
    actor: getUserAuditActor(user),
  });
  return { ok: true, result: rows?.[0] ?? null };
}
