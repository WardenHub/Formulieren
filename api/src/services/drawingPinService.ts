import { sqlQuery } from "../db/index.js";
import {
  createDrawingPinSql,
  createManualFollowUpForPinSql,
  deleteDrawingPinSql,
  getDrawingPinsSql,
  getInstallationDrawingsSql,
  getInstallationFollowUpChoicesSql,
  historicalizeComponentPinsSql,
  linkDrawingPinActionSql,
  unlinkDrawingPinActionSql,
  updateDrawingPinSql,
} from "../db/queries/drawingPins.sql.js";
import { assertInstallationWritable } from "./installationsService.js";
import {
  getUserAuditActor,
  getUserDisplayNameSnapshot,
  getUserEmail,
  getUserObjectId,
} from "../utils/userIdentity.js";

const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const RESPONSIBILITY_TYPES = new Set(["WARDENBURG", "CUSTOMER", "THIRD_PARTY", "UNSPECIFIED"]);
const PIN_KINDS = new Set(["DEFICIENCY", "NOTE", "COMPONENT_PLACED"]);
const PIN_STATUSES = new Set(["ACTIVE", "HISTORICAL"]);

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

function positiveInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${field} invalid`);
  return number;
}

function normalizedCoordinate(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${field} invalid`);
  return Number(number.toFixed(8));
}

function rowVersion(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!/^0x[0-9a-f]{16}$/i.test(clean)) throw new Error("row version invalid");
  return clean;
}

function uuid(value: unknown, field: string) {
  const clean = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
    throw new Error(`${field} invalid`);
  }
  return clean;
}

function dateValue(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) {
    throw new Error("due date invalid");
  }
  return clean;
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeRowVersion(value: unknown) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return `0x${value.toString("hex")}`;
  if (typeof value === "object" && Array.isArray((value as any).data)) {
    return `0x${Buffer.from((value as any).data).toString("hex")}`;
  }
  const clean = String(value).trim();
  if (/^0x[0-9a-f]{16}$/i.test(clean)) return clean;
  if (String(value).length === 8) {
    return `0x${Array.from(String(value), (character) => (character.charCodeAt(0) & 0xff).toString(16).padStart(2, "0")).join("")}`;
  }
  return clean || null;
}

function normalizePin(row: any) {
  return {
    ...row,
    page_number: Number(row.page_number),
    x_normalized: Number(row.x_normalized),
    y_normalized: Number(row.y_normalized),
    row_version: normalizeRowVersion(row.row_version),
    follow_up_actions: parseJsonArray(row.follow_up_actions_json),
    follow_up_actions_json: undefined,
  };
}

function cleanCode(code: unknown) {
  return requiredText(code, "installation code", 450);
}

export async function getInstallationDrawings(code: string) {
  const installationCode = cleanCode(code);
  const [drawings, actions] = await Promise.all([
    sqlQuery(getInstallationDrawingsSql, { code: installationCode }),
    sqlQuery(getInstallationFollowUpChoicesSql, { code: installationCode }),
  ]);
  return {
    drawings: (drawings || []).map((row: any) => ({ ...row, pin_count: Number(row.pin_count || 0) })),
    follow_up_actions: actions || [],
  };
}

export async function getDrawingPins(code: string, documentId: string, includeHistory = false) {
  const installationCode = cleanCode(code);
  const cleanDocumentId = uuid(documentId, "document id");
  const rows = await sqlQuery(getDrawingPinsSql, {
    code: installationCode,
    documentId: cleanDocumentId,
    includeHistory: includeHistory ? 1 : 0,
  });
  return { pins: (rows || []).map(normalizePin) };
}

export async function historicalizeComponentPins(code: string, documentId: string, user: any) {
  const rows = await sqlQuery(historicalizeComponentPinsSql, {
    code: cleanCode(code),
    documentId: uuid(documentId, "document id"),
    actor: getUserAuditActor(user),
  });
  return { ok: true, historicalized_count: Number(rows?.[0]?.historicalized_count || 0) };
}

export async function createDrawingPin(code: string, documentId: string, payload: any, user: any) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  const pinKind = String(payload?.pin_kind || "NOTE").trim().toUpperCase();
  if (!PIN_KINDS.has(pinKind)) throw new Error("pin kind invalid");
  const rows = await sqlQuery(createDrawingPinSql, {
    code: installationCode,
    documentId: uuid(documentId, "document id"),
    pageNumber: positiveInteger(payload?.page_number, "page number"),
    xNormalized: normalizedCoordinate(payload?.x_normalized, "x coordinate"),
    yNormalized: normalizedCoordinate(payload?.y_normalized, "y coordinate"),
    label: requiredText(payload?.label, "label", 200),
    description: optionalText(payload?.description, 2000),
    pinKind,
    actor: getUserAuditActor(user),
  });
  return { ok: true, pin: rows?.[0] ? normalizePin(rows[0]) : null };
}

export async function updateDrawingPin(code: string, drawingPinId: string, payload: any, user: any) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  const pinKind = String(payload?.pin_kind || "NOTE").trim().toUpperCase();
  const pinStatus = String(payload?.pin_status || "ACTIVE").trim().toUpperCase();
  if (!PIN_KINDS.has(pinKind)) throw new Error("pin kind invalid");
  if (!PIN_STATUSES.has(pinStatus)) throw new Error("pin status invalid");
  const rows = await sqlQuery(updateDrawingPinSql, {
    code: installationCode,
    drawingPinId: uuid(drawingPinId, "drawing pin id"),
    pageNumber: positiveInteger(payload?.page_number, "page number"),
    xNormalized: normalizedCoordinate(payload?.x_normalized, "x coordinate"),
    yNormalized: normalizedCoordinate(payload?.y_normalized, "y coordinate"),
    label: requiredText(payload?.label, "label", 200),
    description: optionalText(payload?.description, 2000),
    pinKind,
    pinStatus,
    rowVersion: rowVersion(payload?.row_version),
    actor: getUserAuditActor(user),
  });
  return { ok: true, pin: rows?.[0] ? normalizePin(rows[0]) : null };
}

export async function deleteDrawingPin(code: string, drawingPinId: string, payload: any, user: any) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  await sqlQuery(deleteDrawingPinSql, {
    code: installationCode,
    drawingPinId: uuid(drawingPinId, "drawing pin id"),
    rowVersion: rowVersion(payload?.row_version),
    actor: getUserAuditActor(user),
  });
  return { ok: true };
}

export async function linkDrawingPinAction(
  code: string,
  drawingPinId: string,
  followUpActionId: string,
  user: any
) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  await sqlQuery(linkDrawingPinActionSql, {
    code: installationCode,
    drawingPinId: uuid(drawingPinId, "drawing pin id"),
    followUpActionId: uuid(followUpActionId, "follow-up action id"),
    actor: getUserAuditActor(user),
  });
  return { ok: true };
}

export async function unlinkDrawingPinAction(
  code: string,
  drawingPinId: string,
  followUpActionId: string,
  user: any
) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  await sqlQuery(unlinkDrawingPinActionSql, {
    code: installationCode,
    drawingPinId: uuid(drawingPinId, "drawing pin id"),
    followUpActionId: uuid(followUpActionId, "follow-up action id"),
    actor: getUserAuditActor(user),
  });
  return { ok: true };
}

export async function createManualFollowUpForPin(
  code: string,
  drawingPinId: string,
  payload: any,
  user: any
) {
  const installationCode = cleanCode(code);
  await assertInstallationWritable(installationCode);
  const priority = String(payload?.priority || "NORMAL").trim().toUpperCase();
  const responsibilityType = String(payload?.responsibility_type || "WARDENBURG").trim().toUpperCase();
  if (!PRIORITIES.has(priority)) throw new Error("priority invalid");
  if (!RESPONSIBILITY_TYPES.has(responsibilityType)) throw new Error("responsibility type invalid");
  const certificateImpact = String(payload?.certificate_impact || "").trim().toLowerCase() || null;
  if (certificateImpact && !["yes", "no"].includes(certificateImpact)) {
    throw new Error("certificate impact invalid");
  }
  const customerVisible = Boolean(payload?.customer_visible);
  const rows = await sqlQuery(createManualFollowUpForPinSql, {
    code: installationCode,
    drawingPinId: uuid(drawingPinId, "drawing pin id"),
    title: requiredText(payload?.title, "title", 300),
    description: optionalText(payload?.description, 10000),
    category: optionalText(payload?.category, 100),
    priority,
    responsibilityType,
    certificateImpact,
    dueDate: dateValue(payload?.due_date),
    internalNote: optionalText(payload?.internal_note, 4000),
    customerNote: customerVisible ? optionalText(payload?.customer_note, 4000) : null,
    customerVisible,
    actor: getUserAuditActor(user),
    actorUserObjectId: getUserObjectId(user),
    actorDisplayName: getUserDisplayNameSnapshot(user),
    actorEmail: getUserEmail(user),
  });
  return { ok: true, follow_up_action: rows?.[0] || null };
}
