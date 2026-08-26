import { sqlQuery } from "../db/index.js";
import {
  createCertificateSendHistorySql,
  createInstallationCertificateSql,
  getCertificateDocumentChoicesSql,
  getCertificationRequirementsSql,
  getInstallationCertificatesSql,
  updateInstallationCertificateSql,
  upsertCertificationRequirementSql,
} from "../db/queries/certificates.sql.js";
import { assertInstallationWritable } from "./installationsService.js";
import { getUserAuditActor } from "../utils/userIdentity.js";

const SCOPES = ["BMI", "OAI_A", "OAI_B", "OAI_PZI"] as const;
const SCOPE_SET = new Set(SCOPES);
const REQUIREMENT_STATUSES = new Set(["REQUIRED", "NOT_REQUIRED", "UNKNOWN"]);
const CERTIFICATE_TYPES = new Set(["MAINTENANCE", "INSPECTION"]);
const RECORD_STATUSES = new Set(["CURRENT", "HISTORICAL", "REVOKED"]);
const VERIFICATION_STATUSES = new Set(["VERIFIED", "UNVERIFIED", "REJECTED"]);
const SEND_CHANNELS = new Set(["EMAIL", "DIGITAL_LOGBOOK", "OTHER"]);
const RECIPIENT_TYPES = new Set(["CUSTOMER", "INSPECTION_BODY", "THIRD_PARTY", "INTERNAL"]);
const SEND_STATUSES = new Set(["PLANNED", "SENT", "FAILED", "CANCELLED"]);

function requiredText(value: unknown, field: string, maxLength: number) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error(`${field} required`);
  if (clean.length > maxLength) throw new Error(`${field} too long`);
  return clean;
}

function optionalText(value: unknown, maxLength: number) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  if (clean.length > maxLength) throw new Error("text too long");
  return clean;
}

function enumValue(value: unknown, field: string, allowed: Set<string>, fallback?: string) {
  const clean = String(value ?? fallback ?? "").trim().toUpperCase();
  if (!allowed.has(clean)) throw new Error(`${field} invalid`);
  return clean;
}

function dateValue(value: unknown, field: string) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) {
    throw new Error(`${field} invalid`);
  }
  return clean;
}

function dateTimeValue(value: unknown, field: string) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const timestamp = Date.parse(clean);
  if (Number.isNaN(timestamp)) throw new Error(`${field} invalid`);
  return new Date(timestamp).toISOString();
}

function uuid(value: unknown, field: string, optional = false) {
  const clean = String(value ?? "").trim();
  if (!clean && optional) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
    throw new Error(`${field} invalid`);
  }
  return clean;
}

function rowVersion(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!/^0x[0-9a-f]{16}$/i.test(clean)) throw new Error("row version invalid");
  return clean;
}

function parseArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonValue(value: unknown) {
  if (value == null || typeof value !== "string" || !value.trim()) return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeRequirement(row: any) {
  return {
    ...row,
    events: parseArray(row.events_json).map((event: any) => ({
      ...event,
      before: parseJsonValue(event.before_json),
      after: parseJsonValue(event.after_json),
    })),
    events_json: undefined,
  };
}

function normalizeCertificate(row: any) {
  return {
    ...row,
    scopes: parseArray(row.scopes_json).map((item: any) => String(item?.scope || item || "")).filter(Boolean),
    events: parseArray(row.events_json).map((event: any) => ({
      ...event,
      before: parseJsonValue(event.before_json),
      after: parseJsonValue(event.after_json),
    })),
    send_history: parseArray(row.send_history_json),
    scopes_json: undefined,
    events_json: undefined,
    send_history_json: undefined,
  };
}

function cleanCode(code: unknown) {
  return requiredText(code, "installation code", 450);
}

function scopeValues(value: unknown) {
  if (!Array.isArray(value)) throw new Error("certificate scopes required");
  const scopes = Array.from(new Set(value.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)));
  if (!scopes.length) throw new Error("certificate scope required");
  if (scopes.some((scope) => !SCOPE_SET.has(scope as any))) throw new Error("certificate scope invalid");
  return scopes;
}

function expiryWarningDays() {
  const configured = Number(process.env.CERTIFICATE_EXPIRY_WARNING_DAYS || 90);
  return Number.isInteger(configured) && configured >= 1 && configured <= 730 ? configured : 90;
}

function buildScopeSummary(requirements: any[], certificates: any[]) {
  return SCOPES.map((scope) => {
    const requirement = requirements.find((item) => item.scope === scope) || null;
    const relevant = certificates.filter(
      (item) => item.record_status === "CURRENT" && item.scopes.includes(scope)
    );
    const verified = relevant.filter((item) => item.verification_status === "VERIFIED");
    let certificateStatus = "UNKNOWN";

    if (requirement?.requirement_status === "NOT_REQUIRED") {
      certificateStatus = "NOT_REQUIRED";
    } else if (requirement?.requirement_status === "REQUIRED") {
      if (!verified.length) {
        certificateStatus = relevant.length ? "UNKNOWN" : "MISSING";
      } else if (verified.some((item) => item.validity_status === "VALID")) {
        certificateStatus = "VALID";
      } else if (verified.some((item) => item.validity_status === "EXPIRING")) {
        certificateStatus = "EXPIRING";
      } else if (verified.some((item) => item.validity_status === "EXPIRED")) {
        certificateStatus = "EXPIRED";
      } else {
        certificateStatus = "UNKNOWN";
      }
    }

    return {
      scope,
      requirement_status: requirement?.requirement_status || "UNKNOWN",
      requirement,
      certificate_status: certificateStatus,
      current_certificates: relevant,
    };
  });
}

export async function getCertificationOverview(code: string) {
  const installationCode = cleanCode(code);
  const warningDays = expiryWarningDays();
  const [requirementsRows, certificateRows, documents] = await Promise.all([
    sqlQuery(getCertificationRequirementsSql, { code: installationCode }),
    sqlQuery(getInstallationCertificatesSql, {
      code: installationCode,
      expiryWarningDays: warningDays,
    }),
    sqlQuery(getCertificateDocumentChoicesSql, { code: installationCode }),
  ]);
  const requirements = (requirementsRows || []).map(normalizeRequirement);
  const certificates = (certificateRows || []).map(normalizeCertificate);
  return {
    scopes: [...SCOPES],
    expiry_warning_days: warningDays,
    requirements,
    certificates,
    documents: documents || [],
    scope_summary: buildScopeSummary(requirements, certificates),
  };
}

export async function upsertCertificationRequirement(code: string, payload: any, user: any) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  const scope = enumValue(payload?.scope, "scope", SCOPE_SET as Set<string>);
  const existing = Boolean(String(payload?.row_version || "").trim());
  const rows = await sqlQuery(upsertCertificationRequirementSql, {
    code: installationCode,
    scope,
    requirementStatus: enumValue(
      payload?.requirement_status,
      "requirement status",
      REQUIREMENT_STATUSES,
      "UNKNOWN"
    ),
    reason: optionalText(payload?.reason, 2000),
    effectiveFrom: dateValue(payload?.effective_from, "effective from"),
    firstInspectionDueDate: dateValue(payload?.first_inspection_due_date, "first inspection due date"),
    reviewDueDate: dateValue(payload?.review_due_date, "review due date"),
    rowVersion: existing ? rowVersion(payload?.row_version) : null,
    actor: getUserAuditActor(user),
  });
  return { ok: true, requirement: rows?.[0] || null };
}

function certificateParams(code: string, payload: any, user: any) {
  const scopes = scopeValues(payload?.scopes);
  return {
    code,
    certificateType: enumValue(payload?.certificate_type, "certificate type", CERTIFICATE_TYPES),
    certificateNumber: optionalText(payload?.certificate_number, 200),
    description: requiredText(payload?.description, "description", 500),
    issueDate: dateValue(payload?.issue_date, "issue date"),
    inspectionDate: dateValue(payload?.inspection_date, "inspection date"),
    validUntil: dateValue(payload?.valid_until, "valid until"),
    issuerName: optionalText(payload?.issuer_name, 200),
    inspectionBody: optionalText(payload?.inspection_body, 200),
    recordStatus: enumValue(payload?.record_status, "record status", RECORD_STATUSES, "CURRENT"),
    verificationStatus: enumValue(
      payload?.verification_status,
      "verification status",
      VERIFICATION_STATUSES,
      "VERIFIED"
    ),
    supersedesCertificateId: uuid(payload?.supersedes_certificate_id, "superseded certificate id", true),
    documentId: uuid(payload?.installation_document_id, "installation document id", true),
    scopesJson: JSON.stringify(scopes),
    changeReason: optionalText(payload?.change_reason, 2000),
    actor: getUserAuditActor(user),
  };
}

export async function createInstallationCertificate(code: string, payload: any, user: any) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  const rows = await sqlQuery(createInstallationCertificateSql, certificateParams(installationCode, payload, user));
  return { ok: true, installation_certificate_id: rows?.[0]?.installation_certificate_id || null };
}

export async function updateInstallationCertificate(
  code: string,
  certificateId: string,
  payload: any,
  user: any
) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  const rows = await sqlQuery(updateInstallationCertificateSql, {
    ...certificateParams(installationCode, payload, user),
    certificateId: uuid(certificateId, "certificate id"),
    rowVersion: rowVersion(payload?.row_version),
  });
  return { ok: true, installation_certificate_id: rows?.[0]?.installation_certificate_id || null };
}

export async function recordCertificateSend(
  code: string,
  certificateId: string,
  payload: any,
  user: any
) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  const rows = await sqlQuery(createCertificateSendHistorySql, {
    code: installationCode,
    certificateId: uuid(certificateId, "certificate id"),
    channel: enumValue(payload?.channel, "channel", SEND_CHANNELS),
    recipientType: enumValue(payload?.recipient_type, "recipient type", RECIPIENT_TYPES),
    recipientDisplayName: optionalText(payload?.recipient_display_name, 250),
    recipientAddress: optionalText(payload?.recipient_address, 500),
    subjectSnapshot: optionalText(payload?.subject_snapshot, 500),
    sendStatus: enumValue(payload?.send_status, "send status", SEND_STATUSES, "SENT"),
    sentAt: dateTimeValue(payload?.sent_at, "sent at"),
    externalReference: optionalText(payload?.external_reference, 500),
    note: optionalText(payload?.note, 2000),
    actor: getUserAuditActor(user),
  });
  return { ok: Boolean(rows?.[0]?.ok) };
}
