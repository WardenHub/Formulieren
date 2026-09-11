// api/src/services/kamQueueService.ts
//
// De KAM-werklijst is een smalle leesweergave over dezelfde tabellen als de Monitor. Het
// verwerken zelf loopt via de bestaande formsMonitor-route; die kent de afrondrol, de poort
// en de beoordelingsronde al. Hier wordt dus niets aan statuslogica herhaald.

import { sqlQuery } from "../db/index.js";
import { getKamQueueFormsSql, getKamQueueRelationsSql } from "../db/queries/kamQueue.sql.js";

function normalizeOptionalString(value: any) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function normalizeBoolean(value: any, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "ja"].includes(s)) return true;
  if (["0", "false", "no", "nee"].includes(s)) return false;
  return fallback;
}

function toCount(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapRelation(row: any) {
  const ingediend = toCount(row.ingediend_count);
  const inBehandeling = toCount(row.in_behandeling_count);

  return {
    relation_source_key: normalizeOptionalString(row.relation_source_key),
    relation_source_system: normalizeOptionalString(row.relation_source_system),
    relation_label: normalizeOptionalString(row.relation_label),
    form_count: toCount(row.form_count),
    ingediend_count: ingediend,
    in_behandeling_count: inBehandeling,
    definitief_count: toCount(row.definitief_count),
    concept_count: toCount(row.concept_count),
    open_point_count: toCount(row.open_point_count),
    overdue_point_count: toCount(row.overdue_point_count),
    total_point_count: toCount(row.total_point_count),
    last_submitted_at: row.last_submitted_at ?? null,
    // Wacht deze relatie op de KAM-coördinator, of is het dossier bij.
    awaiting_kam: ingediend + inBehandeling > 0,
  };
}

function mapForm(row: any) {
  return {
    form_instance_id: Number(row.form_instance_id),
    status: normalizeOptionalString(row.status),
    instance_title: normalizeOptionalString(row.instance_title),
    form_code: normalizeOptionalString(row.form_code),
    form_name: normalizeOptionalString(row.form_name),
    review_scope: normalizeOptionalString(row.review_scope) || "RELATION",
    finalize_role_code: normalizeOptionalString(row.finalize_role_code),
    relation_source_key: normalizeOptionalString(row.relation_source_key),
    relation_label: normalizeOptionalString(row.relation_label),
    project_source_key: normalizeOptionalString(row.project_source_key),
    project_label: normalizeOptionalString(row.project_label),
    created_at: row.created_at ?? null,
    created_by: normalizeOptionalString(row.created_by),
    submitted_at: row.submitted_at ?? null,
    submitted_by: normalizeOptionalString(row.submitted_by),
    finalized_at: row.finalized_at ?? null,
    finalized_by: normalizeOptionalString(row.finalized_by),
    open_point_count: toCount(row.open_point_count),
    total_point_count: toCount(row.total_point_count),
  };
}

export async function getKamQueue(input: { query?: any }) {
  const relationSourceKey = normalizeOptionalString(input?.query?.relationSourceKey);
  const onlyOpen = normalizeBoolean(input?.query?.onlyOpen, false);

  const [relationRows, formRows] = await Promise.all([
    sqlQuery(getKamQueueRelationsSql, {}),
    sqlQuery(getKamQueueFormsSql, { relationSourceKey, onlyOpen }),
  ]);

  const relations = (Array.isArray(relationRows) ? relationRows : []).map(mapRelation);
  const forms = (Array.isArray(formRows) ? formRows : []).map(mapForm);

  return {
    relations,
    forms,
    meta: {
      relation_source_key: relationSourceKey,
      only_open: onlyOpen,
      totals: {
        relation_count: relations.length,
        awaiting_relation_count: relations.filter((r) => r.awaiting_kam).length,
        awaiting_form_count: relations.reduce(
          (sum, r) => sum + r.ingediend_count + r.in_behandeling_count,
          0
        ),
        open_point_count: relations.reduce((sum, r) => sum + r.open_point_count, 0),
        overdue_point_count: relations.reduce((sum, r) => sum + r.overdue_point_count, 0),
      },
    },
  };
}
