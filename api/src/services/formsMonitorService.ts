//api/src/services/formsMonitorService.ts
import { sqlQuery } from "../db/index.js";
import {
  getFormsMonitorListSql,
  getFormsMonitorDetailSql,
  getFormsMonitorParentSql,
  getFormsMonitorChildrenSql,
  updateFormInstanceStatusSql,
  setFormInstanceInBehandelingIfSubmittedSql,
  updateFormInstanceAssignmentSql,
  getFormInstanceComplimentPointsSql,
  upsertFormInstanceComplimentPointSql,
} from "../db/queries/formsMonitor.sql.js";
import {
  getFormFollowUpSummaryByInstanceSql,
  getFormFollowUpsMonitorByInstanceSql,
  getFormFollowUpByIdSql,
  updateFormFollowUpStatusSql,
  updateFormFollowUpNoteSql,
  updateFormFollowUpCertificateImpactSql,
} from "../db/queries/formFollowUps.sql.js";
import { getUserProfileSql } from "../db/queries/profile.sql.js";
import { isHistoricalInstallationStatus } from "./installationsService.js";
import {
  getUserActorCandidates,
  getUserAuditActor,
  getUserDisplayNameSnapshot,
  getUserEmail,
  getUserObjectId,
} from "../utils/userIdentity.js";

type UserContext = {
  user: any;
  roles: string[];
};

type DetailContext = UserContext & {
  autoClaim?: boolean;
};

function parsePositiveInt(value: any): number | null {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").trim());

  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function normalizeOptionalString(value: any): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function normalizeBoolean(value: any, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "ja"].includes(s)) return true;
  if (["0", "false", "no", "nee"].includes(s)) return false;
  return fallback;
}

function normalizeCertificateImpactOverride(value: any) {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower === "yes") return "yes";
  if (lower === "no") return "no";

  throw new Error("invalid certificate impact override");
}

function profileDisplayName(row: any) {
  const first =
    row?.preferred_display_name ??
    row?.display_name_snapshot ??
    row?.email_snapshot ??
    null;
  const clean = String(first || "").trim();
  return clean || null;
}

async function getUserProfileSnapshot(userObjectIdRaw: any) {
  const userObjectId = normalizeOptionalString(userObjectIdRaw);
  if (!userObjectId) return null;
  const rows = await sqlQuery(getUserProfileSql, { userObjectId });
  const row: any = rows?.[0] ?? null;
  if (!row) return null;
  return {
    user_object_id: String(row.user_object_id || userObjectId),
    display_name_snapshot: profileDisplayName(row),
    email_snapshot: normalizeOptionalString(row.email_snapshot),
  };
}

function isManager(roles: string[]) {
  return roles.includes("admin") || roles.includes("documentbeheerder");
}

function isGebruiker(roles: string[]) {
  return roles.includes("gebruiker");
}

function buildMineDefault(roles: string[], rawMine: any) {
  if (rawMine !== undefined) {
    return normalizeBoolean(rawMine, false);
  }

  if (isGebruiker(roles) && !isManager(roles)) return true;
  return false;
}

function actionSet() {
  return {
    set_in_behandeling: false,
    set_ingediend: false,
    set_concept: false,
    set_afgehandeld: false,
    pdf_export: false,
  };
}

function buildAllowedActions(item: any, followUpSummary: any, roles: string[]) {
  const allowed = actionSet();
  const hints: Record<string, string> = {};

  const status = String(item?.status || "").trim();
  const historical = isHistoricalInstallationStatus(item?.installation_status);
  const manager = isManager(roles);
  const canMarkDone = Boolean(followUpSummary?.can_mark_form_done);

  if (historical) {
    hints.historical = "Deze installatie is historisch en alleen als dossier beschikbaar.";
    return { allowed, hints };
  }

  if (manager && status === "INGEDIEND") {
    allowed.set_in_behandeling = true;
    allowed.set_concept = true;
  }

  if (manager && status === "IN_BEHANDELING") {
    allowed.set_ingediend = true;
    allowed.set_concept = true;
    allowed.set_afgehandeld = canMarkDone;
    if (!canMarkDone) {
      hints.set_afgehandeld = "Nog niet mogelijk; er staan nog open opvolgacties.";
    }
  }

  if (manager && status === "INGETROKKEN") {
    allowed.set_concept = true;
  }

  allowed.pdf_export = false;

  return { allowed, hints };
}

async function getMonitorDetailRow(formInstanceId: number) {
  const rows = await sqlQuery(getFormsMonitorDetailSql, { formInstanceId });
  return rows?.[0] ?? null;
}

async function getParentRow(formInstanceId: number) {
  const rows = await sqlQuery(getFormsMonitorParentSql, { formInstanceId });
  return rows?.[0] ?? null;
}

async function getChildrenRows(formInstanceId: number) {
  const rows = await sqlQuery(getFormsMonitorChildrenSql, { formInstanceId });
  return Array.isArray(rows) ? rows : [];
}

async function getFollowUpSummary(formInstanceId: number) {
  const rows = await sqlQuery(getFormFollowUpSummaryByInstanceSql, { formInstanceId });
  const row: any = rows?.[0] ?? null;

  return {
    total_count: Number(row?.total_count ?? 0),
    open_count: Number(row?.open_count ?? 0),
    terminal_count: Number(row?.terminal_count ?? 0),
    informative_count: Number(row?.informative_count ?? 0),
    relevant_count: Number(row?.relevant_count ?? 0),
    can_mark_form_done: Number(row?.open_count ?? 0) === 0,
  };
}

async function maybeAutoClaim(
  formInstanceId: number,
  item: any,
  roles: string[],
  actor: string,
  autoClaim: boolean
) {
  if (!autoClaim) return false;
  if (!isManager(roles)) return false;
  if (isHistoricalInstallationStatus(item?.installation_status)) return false;
  if (String(item?.status || "").trim() !== "INGEDIEND") return false;

  await sqlQuery(setFormInstanceInBehandelingIfSubmittedSql, {
    formInstanceId,
    updatedBy: actor,
  });

  return true;
}

function assertFormStatusActionAllowed(item: any, action: string, roles: string[], followUpSummary: any) {
  const status = String(item?.status || "").trim();
  const manager = isManager(roles);

  if (!action) {
    throw new Error("invalid action");
  }

  if (action === "set_in_behandeling") {
    if (!manager) throw new Error("forbidden");
    if (status !== "INGEDIEND") throw new Error("invalid status transition");
    return;
  }

  if (action === "set_ingediend") {
    if (!manager) throw new Error("forbidden");
    if (status !== "IN_BEHANDELING") throw new Error("invalid status transition");
    return;
  }

  if (action === "set_concept") {
    if (!manager) throw new Error("forbidden");
    if (!["INGEDIEND", "INGETROKKEN", "IN_BEHANDELING"].includes(status)) {
      throw new Error("invalid status transition");
    }
    return;
  }

  if (action === "set_afgehandeld") {
    if (!manager) throw new Error("forbidden");
    if (status !== "IN_BEHANDELING") throw new Error("invalid status transition");
    if (!followUpSummary?.can_mark_form_done) {
      throw new Error("cannot mark form done");
    }
    return;
  }

  throw new Error("invalid action");
}

function mapFormActionToStatus(action: string) {
  if (action === "set_in_behandeling") return "IN_BEHANDELING";
  if (action === "set_ingediend") return "INGEDIEND";
  if (action === "set_concept") return "CONCEPT";
  if (action === "set_afgehandeld") return "AFGEHANDELD";
  throw new Error("invalid action");
}

function assertFollowUpActionAllowed(followUpRow: any, action: string, roles: string[]) {
  if (!isManager(roles)) throw new Error("forbidden");
  if (!followUpRow) throw new Error("not found");
  if (String(followUpRow.kind || "").trim().toLowerCase() !== "workflow") {
    throw new Error("report-only follow-ups cannot use workflow status actions");
  }

  const valid = [
    "mark_done",
    "set_open",
    "set_waiting_third_party",
    "set_rejected",
    "set_vervallen",
  ];

  if (!valid.includes(action)) {
    throw new Error("invalid action");
  }
}

function mapFollowUpAction(action: string) {
  if (action === "mark_done") {
    return {
      nextStatus: "AFGEHANDELD",
      isResolved: true,
    };
  }
  if (action === "set_open") {
    return {
      nextStatus: "OPEN",
      isResolved: false,
    };
  }
  if (action === "set_waiting_third_party") {
    return {
      nextStatus: "WACHTENOPDERDEN",
      isResolved: false,
    };
  }
  if (action === "set_rejected") {
    return {
      nextStatus: "AFGEWEZEN",
      isResolved: true,
    };
  }
  if (action === "set_vervallen") {
    return {
      nextStatus: "VERVALLEN",
      isResolved: true,
    };
  }

  throw new Error("invalid action");
}

export async function getMonitorList(input: {
  query: any;
  user: any;
  roles: string[];
}) {
  const q = normalizeOptionalString(input?.query?.q);
  const status = normalizeOptionalString(input?.query?.status);
  const formCode = normalizeOptionalString(input?.query?.formCode);
  const mine = buildMineDefault(input.roles || [], input?.query?.mine);
  const includeWithdrawn = normalizeBoolean(input?.query?.includeWithdrawn, false);
  const onlyActionable = normalizeBoolean(input?.query?.onlyActionable, false);
  const take = Math.min(Math.max(Number(input?.query?.take ?? 25) || 25, 1), 200);
  const skip = Math.max(Number(input?.query?.skip ?? 0) || 0, 0);
  const actor = getUserAuditActor(input.user);
  const actorCandidates = getUserActorCandidates(input.user);
  const assignedUserObjectId = normalizeOptionalString(input?.query?.assignedUserObjectId);
  const assignedSearch = normalizeOptionalString(input?.query?.assignedSearch);
  const unassignedOnly = normalizeBoolean(input?.query?.unassignedOnly, false);
  const viewerUserObjectId = getUserObjectId(input.user);

  const rows = await sqlQuery(getFormsMonitorListSql, {
    q,
    status,
    formCode,
    mine,
    includeWithdrawn,
    onlyActionable,
    take,
    skip,
    actor,
    actorCandidatesJson: JSON.stringify(actorCandidates),
    assignedUserObjectId,
    assignedSearch,
    unassignedOnly,
  });

  const items = (rows || []).map((r: any) => ({
    form_instance_id: r.form_instance_id,
    status: r.status,
    instance_title: r.instance_title,
    instance_note: r.instance_note,
    parent_instance_id: r.parent_instance_id,
    atrium_installation_code: r.atrium_installation_code,
    created_at: r.created_at,
    created_by: r.created_by,
    updated_at: r.updated_at,
    updated_by: r.updated_by,
    submitted_at: r.submitted_at,
    submitted_by: r.submitted_by,
    assigned_user_object_id: r.assigned_user_object_id ?? null,
    assigned_display_name_snapshot: r.assigned_display_name_snapshot ?? null,
    assigned_email_snapshot: r.assigned_email_snapshot ?? null,
    assigned_at: r.assigned_at ?? null,
    assigned_by: r.assigned_by ?? null,
    form_code: r.form_code,
    form_name: r.form_name,
    version: r.version == null ? null : Number(r.version),
    version_label: r.version_label,

    installatie_code: r.atrium_installation_code ?? null,
    installatie_naam: r.installatie_naam ?? null,
    installation_status: r.installation_status ?? null,
    BedrijfUnit: r.BedrijfUnit ?? null,
    object_code: r.object_code ?? null,
    object_name: r.obj_naam ?? null,
    gebruiker_code: r.gebruiker_code ?? null,
    gebruiker_name: r.gebruiker_naam ?? null,

    follow_up_summary: {
      total_count: Number(r.follow_up_total_count ?? 0),
      open_count: Number(r.follow_up_open_count ?? 0),
      terminal_count: Number(r.follow_up_terminal_count ?? 0),
    },
    follow_up_counts: {
      total_count: Number(r.follow_up_total_count ?? 0),
      open_count: Number(r.follow_up_open_count ?? 0),
      waiting_count: Number(r.follow_up_waiting_count ?? 0),
      done_count: Number(r.follow_up_done_count ?? 0),
      rejected_count: Number(r.follow_up_rejected_count ?? 0),
      expired_count: Number(r.follow_up_expired_count ?? 0),
      informative_count: Number(r.follow_up_informative_count ?? 0),
      terminal_count: Number(r.follow_up_terminal_count ?? 0),
    },
    relations: {
      has_parent: r.parent_instance_id != null,
      has_children: Number(r.has_children ?? 0) === 1,
      latest_child_form_instance_id:
        r.latest_child_form_instance_id == null ? null : Number(r.latest_child_form_instance_id),
    },
  }));

  const total = items.length > 0 ? Number(rows?.[0]?.total_count ?? items.length) : 0;

  return {
    items,
    meta: {
      take,
      skip,
      total,
      defaults: {
        mine,
      },
      viewer: {
        user_object_id: viewerUserObjectId,
      },
    },
  };
}

export async function getMonitorDetail(formInstanceIdRaw: any, context: DetailContext) {
  const formInstanceId = parsePositiveInt(formInstanceIdRaw);
  if (formInstanceId == null) return { error: "not found" };

  const actor = getUserAuditActor(context.user);

  let item = await getMonitorDetailRow(formInstanceId);
  if (!item) return { error: "not found" };

  const changed = await maybeAutoClaim(
    formInstanceId,
    item,
    context.roles || [],
    actor,
    context.autoClaim !== false
  );

  if (changed) {
    item = await getMonitorDetailRow(formInstanceId);
    if (!item) return { error: "not found" };
  }

  const [parent, children, followUpSummary] = await Promise.all([
    getParentRow(formInstanceId),
    getChildrenRows(formInstanceId),
    getFollowUpSummary(formInstanceId),
  ]);
  const complimentPoints = await sqlQuery(getFormInstanceComplimentPointsSql, { formInstanceId });

  const { allowed, hints } = buildAllowedActions(item, followUpSummary, context.roles || []);

  return {
    item,
    parent,
    children,
    follow_up_summary: followUpSummary,
    compliment_points: Array.isArray(complimentPoints) ? complimentPoints : [],
    allowed_actions: allowed,
    action_hints: hints,
    permissions: {
      can_assign_form: isManager(context.roles || []),
      can_set_compliment_points: isManager(context.roles || []),
    },
    viewer: {
      actor: getUserAuditActor(context.user),
      user_object_id: getUserObjectId(context.user),
    },
  };
}

export async function getMonitorFollowUps(formInstanceIdRaw: any, _context: UserContext) {
  const formInstanceId = parsePositiveInt(formInstanceIdRaw);
  if (formInstanceId == null) return { error: "not found" };

  const detail = await getMonitorDetailRow(formInstanceId);
  if (!detail) return { error: "not found" };

  const [rows, summary] = await Promise.all([
    sqlQuery(getFormFollowUpsMonitorByInstanceSql, { formInstanceId }),
    getFollowUpSummary(formInstanceId),
  ]);

  return {
    items: Array.isArray(rows) ? rows : [],
    summary,
  };
}

export async function runMonitorFormStatusAction(formInstanceIdRaw: any, action: string, context: UserContext) {
  const formInstanceId = parsePositiveInt(formInstanceIdRaw);
  if (formInstanceId == null) return { error: "not found" };

  const actor = getUserAuditActor(context.user);
  const item = await getMonitorDetailRow(formInstanceId);
  if (!item) return { error: "not found" };

  if (isHistoricalInstallationStatus(item.installation_status)) {
    throw new Error("historical installation read-only");
  }

  const followUpSummary = await getFollowUpSummary(formInstanceId);

  assertFormStatusActionAllowed(item, action, context.roles || [], followUpSummary);

  const nextStatus = mapFormActionToStatus(action);

  await sqlQuery(updateFormInstanceStatusSql, {
    formInstanceId,
    nextStatus,
    updatedBy: actor,
  });

  return await getMonitorDetail(formInstanceId, {
    user: context.user,
    roles: context.roles || [],
    autoClaim: false,
  });
}

export async function runMonitorFollowUpStatusAction(
  followUpActionIdRaw: any,
  action: string,
  payload: any,
  context: UserContext
) {
  const followUpActionId = normalizeOptionalString(followUpActionIdRaw);
  if (!followUpActionId) return { error: "not found" };

  const actor = getUserAuditActor(context.user);
  const rows = await sqlQuery(getFormFollowUpByIdSql, { followUpActionId });
  const followUpRow: any = rows?.[0] ?? null;
  if (!followUpRow) return { error: "not found" };

  if (isHistoricalInstallationStatus(followUpRow.installation_status)) {
    throw new Error("historical installation read-only");
  }

  assertFollowUpActionAllowed(followUpRow, action, context.roles || []);

  if (
    isManager(context.roles || []) &&
    String(followUpRow.form_status || "").trim() === "INGEDIEND"
  ) {
    await sqlQuery(setFormInstanceInBehandelingIfSubmittedSql, {
      formInstanceId: followUpRow.form_instance_id,
      updatedBy: actor,
    });
  }

  const mapped = mapFollowUpAction(action);
  const resolutionNote = normalizeOptionalString(payload?.resolution_note ?? payload?.resolutionNote);

  await sqlQuery(updateFormFollowUpStatusSql, {
    followUpActionId,
    nextStatus: mapped.nextStatus,
    actor,
    resolutionNote,
    isResolved: mapped.isResolved ? 1 : 0,
  });

  const summary = await getFollowUpSummary(Number(followUpRow.form_instance_id));

  return {
    ok: true,
    follow_up_action_id: followUpActionId,
    form_instance_id: Number(followUpRow.form_instance_id),
    summary,
  };
}

export async function updateMonitorFollowUpNote(
  followUpActionIdRaw: any,
  payload: any,
  context: UserContext
) {
  const followUpActionId = normalizeOptionalString(followUpActionIdRaw);
  if (!followUpActionId) return { error: "not found" };

  if (!isManager(context.roles || [])) {
    throw new Error("forbidden");
  }

  const actor = getUserAuditActor(context.user);
  const note = normalizeOptionalString(payload?.note);

  const existingRows = await sqlQuery(getFormFollowUpByIdSql, { followUpActionId });
  const existing = existingRows?.[0] ?? null;
  if (!existing) return { error: "not found" };

  if (isHistoricalInstallationStatus(existing.installation_status)) {
    throw new Error("historical installation read-only");
  }

  const rows = await sqlQuery(updateFormFollowUpNoteSql, {
    followUpActionId,
    note,
    actor,
  });

  return {
    ok: true,
    item: rows?.[0] ?? null,
  };
}

export async function updateMonitorFollowUpCertificateImpact(
  followUpActionIdRaw: any,
  payload: any,
  context: UserContext
) {
  const followUpActionId = normalizeOptionalString(followUpActionIdRaw);
  if (!followUpActionId) return { error: "not found" };

  if (!isManager(context.roles || [])) {
    throw new Error("forbidden");
  }

  const actor = getUserAuditActor(context.user);
  const certificateImpactOverride = normalizeCertificateImpactOverride(
    payload?.certificate_impact_override ?? payload?.certificateImpactOverride
  );

  const existingRows = await sqlQuery(getFormFollowUpByIdSql, { followUpActionId });
  const existing = existingRows?.[0] ?? null;
  if (!existing) return { error: "not found" };

  if (String(existing.kind || "").trim().toLowerCase() !== "workflow") {
    throw new Error("certificate impact override is only allowed for workflow follow-ups");
  }

  if (isHistoricalInstallationStatus(existing.installation_status)) {
    throw new Error("historical installation read-only");
  }

  const rows = await sqlQuery(updateFormFollowUpCertificateImpactSql, {
    followUpActionId,
    certificateImpactOverride,
    actor,
  });

  return {
    ok: true,
    item: rows?.[0] ?? null,
  };
}

export async function updateMonitorFormAssignment(
  formInstanceIdRaw: any,
  payload: any,
  context: UserContext
) {
  const formInstanceId = parsePositiveInt(formInstanceIdRaw);
  if (formInstanceId == null) return { error: "not found" };
  if (!isManager(context.roles || [])) throw new Error("forbidden");

  const item = await getMonitorDetailRow(formInstanceId);
  if (!item) return { error: "not found" };
  if (isHistoricalInstallationStatus(item.installation_status)) {
    throw new Error("historical installation read-only");
  }

  const changedBy = getUserAuditActor(context.user);
  const clearRequested = normalizeBoolean(payload?.clear, false);
  const requestedUserObjectId = clearRequested
    ? null
    : normalizeOptionalString(payload?.assigned_user_object_id ?? payload?.assignedUserObjectId);

  let snapshot = null;
  if (requestedUserObjectId) {
    snapshot = await getUserProfileSnapshot(requestedUserObjectId);
    if (!snapshot) throw new Error("assigned user not found");
  }

  await sqlQuery(updateFormInstanceAssignmentSql, {
    formInstanceId,
    assignedUserObjectId: snapshot?.user_object_id ?? null,
    assignedDisplayNameSnapshot: snapshot?.display_name_snapshot ?? null,
    assignedEmailSnapshot: snapshot?.email_snapshot ?? null,
    changedBy,
  });

  return await getMonitorDetail(formInstanceId, {
    user: context.user,
    roles: context.roles || [],
    autoClaim: false,
  });
}

export async function upsertMonitorComplimentPoint(
  formInstanceIdRaw: any,
  payload: any,
  context: UserContext
) {
  const formInstanceId = parsePositiveInt(formInstanceIdRaw);
  if (formInstanceId == null) return { error: "not found" };
  if (!isManager(context.roles || [])) throw new Error("forbidden");

  const item = await getMonitorDetailRow(formInstanceId);
  if (!item) return { error: "not found" };
  if (String(item.status || "").trim() === "INGETROKKEN") {
    throw new Error("compliment points not allowed for withdrawn forms");
  }
  if (isHistoricalInstallationStatus(item.installation_status)) {
    throw new Error("historical installation read-only");
  }

  const reviewerUserObjectId = getUserObjectId(context.user);
  if (!reviewerUserObjectId) throw new Error("missing reviewer");

  const pointValueRaw = Number(payload?.point_value ?? payload?.pointValue ?? 0);
  const pointValue =
    pointValueRaw === 1 ? 1 : pointValueRaw === -1 ? -1 : 0;
  const reason = normalizeOptionalString(payload?.reason);

  if (pointValue === -1 && !reason) {
    throw new Error("negative compliment point requires reason");
  }

  const reviewerSnapshot = {
    user_object_id: reviewerUserObjectId,
    display_name_snapshot: getUserDisplayNameSnapshot(context.user),
    email_snapshot: getUserEmail(context.user),
  };

  await sqlQuery(upsertFormInstanceComplimentPointSql, {
    formInstanceId,
    reviewerUserObjectId: reviewerSnapshot.user_object_id,
    reviewerDisplayNameSnapshot: reviewerSnapshot.display_name_snapshot,
    reviewerEmailSnapshot: reviewerSnapshot.email_snapshot,
    pointValue,
    reason,
    changedBy: getUserAuditActor(context.user),
  });

  return await getMonitorDetail(formInstanceId, {
    user: context.user,
    roles: context.roles || [],
    autoClaim: false,
  });
}
