import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import {
  completeInspectionCaseSql,
  createInspectionCaseSql,
  createReinspectionSql,
  getInspectionCaseSql,
  getInspectionCaseEventsSql,
  listInspectionCasesSql,
  listInspectionOverviewSql,
  prepareInspectionPackageSql,
  processInspectionConclusionSql,
  refreshInspectionWorkOrdersSql,
  registerInspectionReportSql,
  sendInspectionPackageSql,
  signalInspectionCasesSql,
  updateInspectionCaseSql,
  updateInspectionAssignmentSql,
  updateInspectionChecklistItemSql,
} from "../db/queries/inspections.sql.js";
import { atriumReaderClient } from "./atriumReaderClient.js";
import { getUserAuditActor } from "../utils/userIdentity.js";

export const INSPECTION_STATUSES = [
  "ATTENTION_REQUIRED", "OFFER_REQUIRED", "ORDERED", "PLANNING_REQUIRED",
  "PLANNED_UNCONFIRMED", "PLANNED_CONFIRMED", "EXECUTED_AWAITING_REPORT",
  "REPORT_RECEIVED", "REPAIR_REQUIRED", "REINSPECTION_REQUIRED",
  "CERTIFICATE_RECEIVED", "COMPLETED", "CANCELLED",
] as const;
export const INSPECTION_SCOPES = ["BMI", "OAI_A", "OAI_B", "OAI_PZI"] as const;
export const APPOINTMENT_STATUSES = ["NO_PLANNING", "PLANNED_UNCONFIRMED", "PLANNED_CONFIRMED", "EXECUTED", "CANCELLED_OR_HISTORICAL"] as const;

const STATUS_SET = new Set<string>(INSPECTION_STATUSES);
const SCOPE_SET = new Set<string>(INSPECTION_SCOPES);
const TYPE_SET = new Set(["INITIAL", "FOLLOW_UP", "REINSPECTION"]);
const CHECKLIST_STATUS_SET = new Set(["MISSING", "AVAILABLE", "CHECKED", "SENT", "WAIVED"]);
const RESPONSIBILITY_SET = new Set(["WARDENBURG", "CUSTOMER", "INSPECTION_BODY", "THIRD_PARTY"]);
const ATTENTION_FILTER_SET = new Set(["ALL", "CERTIFICATE_MISSING", "CERTIFICATE_EXPIRING", "CERTIFICATE_EXPIRED", "NO_ACTIVE_CASE", "PLANNING_MISSING", "APPOINTMENT_UNCONFIRMED", "DOCUMENTS_MISSING", "REPORT_MISSING", "REINSPECTION_REQUIRED", "OPEN_ACTIONS"]);

function text(value: unknown, max: number, required = false) {
  const clean = String(value ?? "").trim();
  if (required && !clean) throw new Error("required value missing");
  if (clean.length > max) throw new Error("value too long");
  return clean || null;
}
function uuid(value: unknown, required = true) {
  const clean = String(value ?? "").trim();
  if (!clean && !required) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) throw new Error("identifier invalid");
  return clean;
}
function rowVersion(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!/^0x[0-9a-f]{16}$/i.test(clean)) throw new Error("row version invalid");
  return clean;
}
function date(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) throw new Error("date invalid");
  return clean;
}
function dateTime(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const parsed = Date.parse(clean);
  if (Number.isNaN(parsed)) throw new Error("date time invalid");
  return new Date(parsed).toISOString();
}
function enumValue(value: unknown, allowed: Set<string>, fallback?: string) {
  const clean = String(value ?? fallback ?? "").trim().toUpperCase();
  if (!allowed.has(clean)) throw new Error("value invalid");
  return clean;
}
function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const clean = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "ja"].includes(clean)) return true;
  if (["0", "false", "no", "nee"].includes(clean)) return false;
  return fallback;
}
function scopes(value: unknown) {
  if (!Array.isArray(value)) throw new Error("inspection scopes required");
  const items = [...new Set(value.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))];
  if (!items.length || items.some((scope) => !SCOPE_SET.has(scope))) throw new Error("inspection scopes invalid");
  return items;
}
function parseJson(value: unknown, fallback: any = []) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

export function mapAtriumWorkOrderStatus(raw: unknown) {
  const status = String(raw || "").trim().toUpperCase();
  if (status === "A") return "PLANNED_UNCONFIRMED";
  if (status === "I") return "PLANNED_CONFIRMED";
  if (status === "U") return "EXECUTED";
  if (status === "V" || status === "H") return "CANCELLED_OR_HISTORICAL";
  return "NO_PLANNING";
}

function normalizeReaderRow(row: any) {
  const lower = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    source_system: "ATRIUM_READER",
    business_unit: lower.business_unit || null,
    work_order_key: lower.work_order_key,
    work_order_code: lower.work_order_code || null,
    work_order_title: lower.work_order_title || null,
    installation_code: lower.installation_code || null,
    raw_status: String(lower.raw_status || "").trim().toUpperCase(),
    mapped_status: APPOINTMENT_STATUSES.includes(String(lower.mapped_status || "") as any)
      ? String(lower.mapped_status)
      : mapAtriumWorkOrderStatus(lower.raw_status),
    planned_at: lower.planned_at || null,
    executed_at: lower.executed_at || null,
    source_modified_at: lower.source_modified_at || null,
    last_verified_at: lower.last_verified_at || new Date().toISOString(),
  };
}

export async function listInspectionCases(filters: any = {}) {
  const take = Math.max(1, Math.min(500, Math.trunc(Number(filters.take || 200))));
  const q = String(filters.q || "").trim();
  const rows = await sqlQuery(listInspectionCasesSql, {
    take,
    status: filters.status ? enumValue(filters.status, STATUS_SET) : null,
    scope: filters.scope ? enumValue(filters.scope, SCOPE_SET) : null,
    assignedTo: text(filters.assigned_to, 200),
    activeOnly: bool(filters.active, true),
    qLike: q ? `%${q}%` : null,
  });
  return {
    items: (rows || []).map((row: any) => ({
      ...row,
      scopes: parseJson(row.scopes_json).map((item: any) => item.scope),
      scopes_json: undefined,
      missing_required_document_count: Number(row.missing_required_document_count || 0),
      open_action_count: Number(row.open_action_count || 0),
    })),
  };
}

export async function listInspectionOverview(filters: any = {}) {
  const take = Math.max(1, Math.min(25000, Math.trunc(Number(filters.take || 5000))));
  const q = String(filters.q || "").trim();
  const horizonRows = await sqlQuery<{ value_text: string }>("select value_text from dbo.ApplicationConfiguration where configuration_key=N'inspection.signal_horizon_days' and is_active=1;", {});
  const configuredHorizon = Number(horizonRows?.[0]?.value_text || 90);
  const certificateExpiringDays = Number.isFinite(configuredHorizon) ? Math.max(1, Math.min(730, Math.trunc(configuredHorizon))) : 90;
  const rows = await sqlQuery(listInspectionOverviewSql, {
    take,
    qLike: q ? `%${q}%` : null,
    scope: filters.scope ? enumValue(filters.scope, SCOPE_SET) : null,
    status: filters.status ? enumValue(filters.status, STATUS_SET) : null,
    inspectionBody: text(filters.inspection_body, 200),
    attentionFilter: enumValue(filters.attention, ATTENTION_FILTER_SET, "ALL"),
    certificateExpiringDays,
  });
  return {
    items: (rows || []).map((row: any) => ({
      ...row,
      scopes: parseJson(row.scopes_json).map((item: any) => item.scope),
      scopes_json: undefined,
      missing_required_document_count: Number(row.missing_required_document_count || 0),
      open_action_count: Number(row.open_action_count || 0),
      active_inspection_case_count: Number(row.active_inspection_case_count || 0),
      certificate_days_remaining: row.certificate_days_remaining == null ? null : Number(row.certificate_days_remaining),
    })),
  };
}

export async function getInspectionCase(caseId: string) {
  const result = await sqlQueryRaw(getInspectionCaseSql, { caseId: uuid(caseId) });
  const sets: any[] = result.recordsets || [];
  if (!sets[0]?.[0]) throw new Error("inspection case not found");
  return {
    case: sets[0][0], scopes: sets[1] || [], work_orders: sets[2] || [], checklist: sets[3] || [],
    packages: (sets[4] || []).map((item: any) => ({ ...item, items: parseJson(item.items_json), items_json: undefined })),
    reports: sets[5] || [],
    actions: (sets[6] || []).map((item: any) => ({
      ...item,
      drawing_pins: parseJson(item.drawing_pins_json),
      drawing_pins_json: undefined,
    })),
    document_choices: sets[8] || [], certificate_choices: sets[9] || [],
    certification_requirements: sets[10] || [],
    current_certificates: (sets[11] || []).map((item: any) => ({ ...item, scopes: parseJson(item.scopes_json).map((scope: any) => scope.scope), scopes_json: undefined })),
  };
}

export async function getInspectionCaseEvents(caseId: string) {
  const rows = await sqlQuery(getInspectionCaseEventsSql, { caseId: uuid(caseId) });
  return { items: (rows || []).map((item: any) => ({ ...item, before: parseJson(item.before_json, null), after: parseJson(item.after_json, null), before_json: undefined, after_json: undefined })) };
}

export async function createInspectionCase(payload: any, user: any) {
  const inspectionScopes = scopes(payload?.scopes);
  const inspectionType = enumValue(payload?.inspection_type, TYPE_SET, "INITIAL");
  const installationCode = text(payload?.atrium_installation_code, 450, true);
  const rows = await sqlQuery(createInspectionCaseSql, {
    installationCode,
    parentCaseId: uuid(payload?.parent_inspection_case_id, false),
    inspectionType,
    dueDate: date(payload?.due_date),
    signalFromDate: date(payload?.signal_from_date),
    status: enumValue(payload?.status, STATUS_SET, "ATTENTION_REQUIRED"),
    inspectionBody: text(payload?.inspection_body, 200),
    assignedUserId: text(payload?.assigned_user_id, 200),
    assignedRoleCode: text(payload?.assigned_role_code, 100),
    sourceFingerprint: text(payload?.source_fingerprint, 500),
    scopesJson: JSON.stringify(inspectionScopes),
    actor: getUserAuditActor(user),
  });
  return { inspection_case_id: rows?.[0]?.inspection_case_id };
}

export async function updateInspectionCase(caseId: string, payload: any, user: any) {
  const rows = await sqlQuery(updateInspectionCaseSql, {
    caseId: uuid(caseId), rowVersion: rowVersion(payload?.row_version),
    dueDate: date(payload?.due_date), status: enumValue(payload?.status, STATUS_SET),
    inspectionBody: text(payload?.inspection_body, 200),
    logbookLinked: payload?.logbook_linked == null ? null : bool(payload.logbook_linked),
    inspectionBodyHasLogbookAccess: payload?.inspection_body_has_logbook_access == null ? null : bool(payload.inspection_body_has_logbook_access),
    packageAvailableInLogbook: payload?.document_package_available_in_logbook == null ? null : bool(payload.document_package_available_in_logbook),
    reportUploadedToLogbook: payload?.report_uploaded_to_logbook == null ? null : bool(payload.report_uploaded_to_logbook),
    actor: getUserAuditActor(user),
  });
  return { ok: true, row_version: rows?.[0]?.row_version };
}

export async function updateInspectionAssignment(caseId: string, payload: any, user: any) {
  const assignedUserId = text(payload?.assigned_user_id, 200);
  const assignedRoleCode = text(payload?.assigned_role_code, 100);
  if (assignedUserId && assignedRoleCode) throw new Error("choose either an assigned user or an assigned role");
  const rows = await sqlQuery(updateInspectionAssignmentSql, {
    caseId: uuid(caseId),
    rowVersion: rowVersion(payload?.row_version),
    assignedUserId,
    assignedRoleCode,
    actor: getUserAuditActor(user),
  });
  return { ok: true, row_version: rows?.[0]?.row_version };
}

async function inspectionReaderWindowDays() {
  const rows = await sqlQuery<{ value_text: string }>("select value_text from dbo.ApplicationConfiguration where configuration_key=N'inspection.reader_date_window_days' and is_active=1;", {});
  const value = Number(rows?.[0]?.value_text || 730);
  return Number.isFinite(value) ? Math.max(1, Math.min(3650, Math.trunc(value))) : 730;
}

export async function refreshInspectionWorkOrders(caseId: string, user: any) {
  const detail = await getInspectionCase(caseId);
  const installationCode = detail.case.atrium_installation_code;
  const result = detail.case.atrium_work_order_key
    ? await atriumReaderClient.getWorkorder(detail.case.atrium_work_order_key)
    : await atriumReaderClient.getInspectionWorkorders([installationCode], await inspectionReaderWindowDays());
  const rows = result.rows.map(normalizeReaderRow).filter((row) => row.installation_code === installationCode);
  await sqlQuery(refreshInspectionWorkOrdersSql, {
    caseId: uuid(caseId), rowsJson: JSON.stringify(rows), correlationId: result.correlationId, actor: getUserAuditActor(user),
  });
  return { ...result, rows };
}

export async function updateChecklistItem(caseId: string, requirementId: string, payload: any, user: any) {
  const rows = await sqlQuery(updateInspectionChecklistItemSql, {
    caseId: uuid(caseId), requirementId: uuid(requirementId), rowVersion: rowVersion(payload?.row_version),
    status: enumValue(payload?.status, CHECKLIST_STATUS_SET), documentId: uuid(payload?.installation_document_id, false), storedFileId: uuid(payload?.stored_file_id, false),
    responsibilityType: enumValue(payload?.responsibility_type, RESPONSIBILITY_SET), assignedUserId: text(payload?.assigned_user_id, 200), assignedRoleCode: text(payload?.assigned_role_code, 100),
    dueDate: date(payload?.due_date), note: text(payload?.note, 2000), actor: getUserAuditActor(user),
    createAction: bool(payload?.create_action), actionTitle: text(payload?.action_title, 300), isBlocking: bool(payload?.is_blocking),
  });
  return { ok: true, row_version: rows?.[0]?.row_version };
}

export async function preparePackage(caseId: string, payload: any, user: any) {
  const ids = Array.isArray(payload?.installation_document_ids) ? payload.installation_document_ids.map((id: any) => uuid(id)) : [];
  if (!ids.length) throw new Error("inspection package documents required");
  const rows = await sqlQuery(prepareInspectionPackageSql, { caseId: uuid(caseId), documentIdsJson: JSON.stringify(ids), inspectionBody: text(payload?.inspection_body, 200), recipientSnapshot: payload?.recipient_snapshot ? JSON.stringify(payload.recipient_snapshot) : null, note: text(payload?.note, 2000), actor: getUserAuditActor(user) });
  return rows?.[0] || { ok: true };
}
export async function sendPackage(caseId: string, packageId: string, payload: any, user: any) {
  await sqlQuery(sendInspectionPackageSql, { caseId: uuid(caseId), packageId: uuid(packageId), rowVersion: rowVersion(payload?.row_version), sentAt: dateTime(payload?.sent_at), externalReference: text(payload?.external_reference, 500), note: text(payload?.note, 2000), actor: getUserAuditActor(user) });
  return { ok: true };
}
export async function registerReport(caseId: string, payload: any, user: any) {
  const conclusion = enumValue(payload?.conclusion, new Set(["PASS", "FAIL", "PENDING"]));
  const rows = await sqlQuery(registerInspectionReportSql, { caseId: uuid(caseId), documentId: uuid(payload?.installation_document_id), storedFileId: uuid(payload?.stored_file_id), reportReference: text(payload?.report_reference, 200), reportVersion: text(payload?.report_version, 50), inspectionDate: date(payload?.inspection_date), conclusion, inspectionBody: text(payload?.inspection_body, 200), note: text(payload?.note, 2000), actor: getUserAuditActor(user) });
  return rows?.[0] || { ok: true };
}
export async function processConclusion(caseId: string, payload: any, user: any) {
  await sqlQuery(processInspectionConclusionSql, { caseId: uuid(caseId), rowVersion: rowVersion(payload?.row_version), conclusion: enumValue(payload?.conclusion, new Set(["PASS", "FAIL"])), certificateId: uuid(payload?.installation_certificate_id, false), dueDate: date(payload?.repair_due_date), note: text(payload?.note, 2000), actor: getUserAuditActor(user) });
  return { ok: true };
}
export async function createReinspection(caseId: string, payload: any, user: any) {
  const rows = await sqlQuery(createReinspectionSql, { caseId: uuid(caseId), dueDate: date(payload?.due_date), signalFromDate: date(payload?.signal_from_date), inspectionBody: text(payload?.inspection_body, 200), assignedUserId: text(payload?.assigned_user_id, 200), assignedRoleCode: text(payload?.assigned_role_code, 100), actor: getUserAuditActor(user) });
  return rows?.[0] || { ok: true };
}
export async function completeInspectionCase(caseId: string, payload: any, user: any) {
  await sqlQuery(completeInspectionCaseSql, { caseId: uuid(caseId), rowVersion: rowVersion(payload?.row_version), actor: getUserAuditActor(user) });
  return { ok: true };
}
export async function signalInspectionCases(user: any) {
  const rows = await sqlQuery(signalInspectionCasesSql, { actor: getUserAuditActor(user) });
  return rows?.[0] || { ok: true };
}
