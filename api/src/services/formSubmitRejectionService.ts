import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import {
  getFormSubmitRejectionSummarySql,
  insertFormSubmitRejectionSql,
  listFormSubmitRejectionsSql,
} from "../db/queries/formSubmitRejections.sql.js";
import {
  getUserAuditActor,
  getUserDisplayNameSnapshot,
  getUserEmail,
  getUserObjectId,
} from "../utils/userIdentity.js";

const REJECTION_SOURCES = new Set(["CLIENT_VALIDATION", "SERVER_PREVIEW", "SERVER_SUBMIT"]);

// Meer dan dit aantal blokkades zegt niets extra's en maakt de rij alleen groot.
const MAXIMUM_DETAILS = 40;

function normalizeText(value: any, maximumLength: number) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text.length) return null;
  return text.length > maximumLength ? text.slice(0, maximumLength) : text;
}

/* Uit de meegestuurde blokkades blijven alleen de vraagnaam, de paginanaam en de melding
   over. Een antwoord of een vrije tekst van de invuller gaat hier nooit in; dat hoort in
   het formulier te blijven staan en niet in een logtabel. */
function normalizeDetails(details: any) {
  if (!Array.isArray(details)) return null;

  const rows = details
    .slice(0, MAXIMUM_DETAILS)
    .map((entry: any) => ({
      question_name: normalizeText(entry?.question_name ?? entry?.name, 200),
      page_name: normalizeText(entry?.page_name ?? entry?.page, 200),
      message: normalizeText(entry?.message ?? entry?.text, 400),
    }))
    .filter((entry) => entry.question_name || entry.page_name || entry.message);

  return rows.length ? JSON.stringify(rows) : null;
}

function parseInstanceId(value: any) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function recordFormSubmitRejection(args: {
  formInstanceId: any;
  source: any;
  reasonCode?: any;
  reasonMessage?: any;
  blockingCount?: any;
  pageName?: any;
  details?: any;
  user: any;
}) {
  const instanceId = parseInstanceId(args.formInstanceId);
  if (instanceId == null) return { ok: false, error: "form instance not found" };

  const source = String(args.source || "").trim().toUpperCase();
  if (!REJECTION_SOURCES.has(source)) return { ok: false, error: "rejection source invalid" };

  const detailsJson = normalizeDetails(args.details);
  const parsedCount = Number(args.blockingCount);
  const blockingCount = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.floor(parsedCount) : 0;

  const rows = await sqlQuery(insertFormSubmitRejectionSql, {
    instanceId,
    rejectionSource: source,
    reasonCode: normalizeText(args.reasonCode, 60),
    reasonMessage: normalizeText(args.reasonMessage, 2000),
    blockingCount,
    pageName: normalizeText(args.pageName, 200),
    detailsJson,
    rejectedBy: getUserAuditActor(args.user),
    rejectedUserObjectId: getUserObjectId(args.user),
    rejectedDisplayName: getUserDisplayNameSnapshot(args.user),
    rejectedEmail: getUserEmail(args.user),
  });

  return { ok: true, form_submit_rejection_id: rows?.[0]?.form_submit_rejection_id ?? null };
}

function parseDetailsJson(value: any) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clampDays(value: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, Math.floor(parsed)));
}

export async function listFormSubmitRejections(params: {
  sinceDays?: any;
  formCode?: any;
  source?: any;
  take?: any;
}) {
  const takeValue = Number(params?.take);
  const take = Number.isFinite(takeValue) ? Math.min(500, Math.max(1, Math.floor(takeValue))) : 200;

  const rows = await sqlQuery(listFormSubmitRejectionsSql, {
    sinceDays: clampDays(params?.sinceDays),
    formCode: normalizeText(params?.formCode, 100) ?? "",
    source: normalizeText(params?.source, 30)?.toUpperCase() ?? "",
    take,
  });

  return {
    items: (rows || []).map((row: any) => ({
      ...row,
      details: parseDetailsJson(row.details_json),
      details_json: undefined,
    })),
  };
}

export async function getFormSubmitRejectionSummary(params: { sinceDays?: any }) {
  const result: any = await sqlQueryRaw(getFormSubmitRejectionSummarySql, {
    sinceDays: clampDays(params?.sinceDays),
  });

  const recordsets = Array.isArray(result?.recordsets) ? result.recordsets : [];

  return {
    since_days: clampDays(params?.sinceDays),
    per_form: Array.isArray(recordsets[0]) ? recordsets[0] : [],
    per_reason: Array.isArray(recordsets[1]) ? recordsets[1] : [],
    per_question: Array.isArray(recordsets[2]) ? recordsets[2] : [],
  };
}
