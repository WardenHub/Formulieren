//api/src/services/formsMonitorService.ts
import { randomUUID } from "node:crypto";
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
  getFormInstanceOwnershipSql,
} from "../db/queries/formsMonitor.sql.js";
import {
  getFormFollowUpSummaryByChainSql,
  getFormFollowUpsMonitorByChainSql,
  getFormFollowUpByIdSql,
  getFormInstanceWorkflowRoleAccessSql,
  updateFormFollowUpStatusSql,
  updateFormFollowUpNoteSql,
  updateFormFollowUpCertificateImpactSql,
  updateFormFollowUpClassificationSql,
  insertManualFormFollowUpSql,
  getMonitorFollowUpAttachmentSql,
} from "../db/queries/formFollowUps.sql.js";
import {
  getFollowUpFinalizeGateSql,
  getFollowUpReviewItemsSql,
  createFollowUpReviewBatchSql,
} from "../db/queries/followUpReviews.sql.js";
import { getUserProfileSql } from "../db/queries/profile.sql.js";
import { createFollowUpAttachmentDownloadUrl } from "./blobStorageService.js";
import { isHistoricalInstallationStatus } from "./installationsService.js";
import { syncDefinitionFollowUps } from "./formDefinitionFollowUpRuleService.js";
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

function parseJsonArray(value: any) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function isKamCoordinator(roles: string[]) {
  return roles.includes("kam_coordinator");
}

function isKamOnly(roles: string[]) {
  return isKamCoordinator(roles) && !isManager(roles);
}

/*  Een workflowrol is een functionele rol en geeft uit zichzelf geen autorisatie; de
    platformrol doet dat. Voor het afronden van een formulier moeten die twee aan elkaar
    geknoopt worden. Dat gebeurt hier expliciet en niet met een naamtruc, want lang niet
    elke workflowrol heeft een gelijknamige platformrol; INSPECTION_COORDINATOR hoort
    bijvoorbeeld bij certificering_coordinator. Staat een rol hier niet in, dan is dat een
    configuratiefout en mag niemand afronden. */
const FINALIZE_ROLE_TO_APPLICATION_ROLE: Record<string, string> = {
  KAM_COORDINATOR: "kam_coordinator",
};

/*  Wie dit formulier inhoudelijk afhandelt; de beoordelingsronde vastleggen en het
    formulier definitief maken. Zonder afrondrol op de definitie is dat de
    formulierbeheerder, zoals het altijd was. Noemt de definitie wel een rol, dan is die rol
    de enige die mag afronden; ook een beheerder niet. Dat is bewust, want bij een
    veiligheidsformulier is het afronden de tweede handtekening. */
function resolveFormProcessor(item: any, roles: string[]) {
  const finalizeRoleCode = normalizeOptionalString(item?.finalize_role_code);

  if (!finalizeRoleCode) {
    return { allowed: isManager(roles), roleCode: null, reason: null as string | null };
  }

  const applicationRole = FINALIZE_ROLE_TO_APPLICATION_ROLE[finalizeRoleCode];
  if (!applicationRole) {
    return {
      allowed: false,
      roleCode: finalizeRoleCode,
      reason:
        `Dit formulier verwijst naar de afrondrol ${finalizeRoleCode}, maar die rol is niet ` +
        "aan een platformrol gekoppeld. Een beheerder moet dit in het formulierbeheer herstellen.",
    };
  }

  if (roles.includes(applicationRole)) {
    return { allowed: true, roleCode: finalizeRoleCode, reason: null as string | null };
  }

  const roleLabel =
    normalizeOptionalString(item?.finalize_role_display_name) || finalizeRoleCode;

  return {
    allowed: false,
    roleCode: finalizeRoleCode,
    reason: `Dit formulier wordt afgerond door de rol ${roleLabel}.`,
  };
}

async function assertWorkflowRoleCanAccessFormInstance(
  formInstanceId: number,
  roles: string[]
) {
  if (!isKamOnly(roles)) return;

  const rows = await sqlQuery(getFormInstanceWorkflowRoleAccessSql, {
    formInstanceId,
    workflowRoleCode: "KAM_COORDINATOR",
  });
  if (!rows?.[0]?.has_access) throw new Error("forbidden");
}

// Het detail en de PDF-export pasten alleen de KAM-poort toe. Een gewone gebruiker kon
// daarmee elk formulier van iedereen openen en exporteren, terwijl het overzicht hem tot
// zijn eigen werk beperkte. Nu geldt dezelfde grens op beide plaatsen.
export async function assertMayReadFormInstance(formInstanceId: any, context: any) {
  const roles = context?.roles || [];

  await assertWorkflowRoleCanAccessFormInstance(formInstanceId, roles);

  if (mayReadEveryFormInstance(roles)) return;

  const rows = await sqlQuery(getFormInstanceOwnershipSql, {
    formInstanceId,
    actorCandidatesJson: JSON.stringify(getUserActorCandidates(context?.user)),
  });

  if (!rows?.[0]?.is_owner) throw new Error("forbidden");
}

function isGebruiker(roles: string[]) {
  return roles.includes("gebruiker");
}

// Een gewone gebruiker zag in de UI standaard alleen zijn eigen formulieren, maar
// ?mine=false gaf gewoon alles terug; de scoping was dus een schermkeuze en geen regel.
// Wie geen leidinggevende rol heeft blijft nu ook op de server bij zijn eigen werk, en de
// meegestuurde parameter wordt in dat geval genegeerd in plaats van gerespecteerd.
function mayReadEveryFormInstance(roles: string[]) {
  return isManager(roles) || isKamCoordinator(roles);
}

function buildMineDefault(roles: string[], rawMine: any) {
  if (!mayReadEveryFormInstance(roles)) return true;

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
    review_followups: false,
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
  // Beoordelen en afronden volgen de afrondrol van de definitie; de overige
  // statusovergangen blijven administratief werk van de formulierbeheerder.
  const processor = resolveFormProcessor(item, roles);

  if (historical) {
    hints.historical = "Deze installatie is historisch en alleen als dossier beschikbaar.";
    return { allowed, hints };
  }

  if (status === "INGEDIEND" && (manager || processor.allowed)) {
    allowed.set_in_behandeling = true;
  }

  if (manager && status === "INGEDIEND") {
    allowed.set_concept = true;
  }

  if (manager && status === "IN_BEHANDELING") {
    allowed.set_ingediend = true;
    allowed.set_concept = true;
  }

  if (status === "IN_BEHANDELING") {
    if (processor.allowed) {
      allowed.set_afgehandeld = canMarkDone;
      // Beoordelen aanbieden heeft alleen zin als er een beoordelingsronde bestaat waarin de
      // punten meekunnen. Is die er niet, dan opent het scherm een lege lijst en lijkt het alsof
      // er niets aan de hand is.
      const reviewCanHelp = Boolean(followUpSummary?.review_can_help);
      allowed.review_followups = !canMarkDone && reviewCanHelp;
      if (!canMarkDone) {
        hints.set_afgehandeld =
          followUpSummary?.finalize_blocked_reason ||
          "Leg eerst de opvolgingsreview vast.";
      }
    } else if (processor.reason) {
      // Zonder uitleg lijkt een ontbrekende knop op een storing.
      hints.set_afgehandeld = processor.reason;
    }
  }

  if (roles.includes("admin") && status === "AFGEHANDELD") {
    allowed.set_in_behandeling = true;
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

async function getFollowUpChainSummary(formInstanceId: number) {
  const rows = await sqlQuery(getFormFollowUpSummaryByChainSql, { formInstanceId });
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

function buildFinalizeBlockedReason(row: any): string | null {
  if (Boolean(row?.can_finalize)) return null;

  const unreachable = Number(row?.unreachable_review_count ?? 0);
  if (unreachable > 0) {
    const scope = String(row?.review_scope || "INSTALLATION").trim().toUpperCase();
    const telwoord = `${unreachable} actiepunt${unreachable === 1 ? "" : "en"} van dit formulier`;

    // De reden noemt het anker dat ontbreekt. Bij een relatieronde is dat de relatie en
    // niet de installatie; die oude tekst las bij een projectformulier als een datafout.
    if (scope === "RELATION") {
      return (
        `${telwoord} hangt niet aan een relatie en kan daardoor niet worden beoordeeld. ` +
        "De beoordeling loopt voor dit formulier per relatie; zonder relatie is er geen " +
        "beoordelingsronde om het punt in mee te nemen."
      );
    }

    return (
      `${telwoord} hangt niet aan een installatie en kan daardoor niet worden beoordeeld. ` +
      "De beoordeling loopt voor dit formulier per installatie; zonder installatie is er geen " +
      "beoordelingsronde om het punt in mee te nemen."
    );
  }

  const parts: string[] = [];
  const missingReview = Number(row?.missing_review_count ?? 0);
  const missingAssignment = Number(row?.missing_assignment_count ?? 0);
  const missingDueDate = Number(row?.missing_due_date_count ?? 0);
  const missingAttachment = Number(row?.missing_attachment_count ?? 0);

  if (missingReview > 0) parts.push(`${missingReview} nog te beoordelen`);
  if (missingAssignment > 0) parts.push(`${missingAssignment} zonder toegewezen persoon`);
  if (missingDueDate > 0) parts.push(`${missingDueDate} zonder deadline`);
  if (missingAttachment > 0) parts.push(`${missingAttachment} zonder bijlage`);

  if (!parts.length) return null;

  return `Er zijn nog actiepunten die aandacht vragen; ${parts.join(", ")}.`;
}

async function getFinalizeGate(formInstanceId: number) {
  const rows = await sqlQuery(getFollowUpFinalizeGateSql, { formInstanceId });
  const row: any = rows?.[0] ?? {};

  return {
    latest_review_batch_id: normalizeOptionalString(row?.latest_review_batch_id),
    required_review_count: Number(row?.required_review_count ?? 0),
    reviewed_count: Number(row?.reviewed_count ?? 0),
    missing_review_count: Number(row?.missing_review_count ?? 0),
    missing_assignment_count: Number(row?.missing_assignment_count ?? 0),
    missing_due_date_count: Number(row?.missing_due_date_count ?? 0),
    missing_attachment_count: Number(row?.missing_attachment_count ?? 0),
    unreachable_review_count: Number(row?.unreachable_review_count ?? 0),
    review_context_available: Boolean(row?.review_context_available),
    review_scope: String(row?.review_scope || "INSTALLATION").trim().toUpperCase(),
    can_finalize: Boolean(row?.can_finalize),
    // Waarom het niet kan, in gewone taal, zodat het scherm het kan zeggen in plaats van
    // een knop uit te zetten zonder uitleg.
    blocked_reason: buildFinalizeBlockedReason(row),
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
  if (!isManager(roles) && !resolveFormProcessor(item, roles).allowed) return false;
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

  const processor = resolveFormProcessor(item, roles);

  if (action === "set_in_behandeling") {
    // Oppakken mag ook de rol die het formulier afrondt; anders kan die er niet aan
    // beginnen zonder een beheerder erbij te halen.
    if (status === "INGEDIEND" && (manager || processor.allowed)) return;
    if (!manager) throw new Error("forbidden");
    if (status === "AFGEHANDELD" && roles.includes("admin")) return;
    throw new Error("invalid status transition");
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
    // Definitief maken is de laatste inhoudelijke handeling en volgt de afrondrol van de
    // definitie. Noemt die een rol, dan mag alleen die rol afronden; ook een beheerder niet.
    if (!processor.allowed) throw new Error("forbidden");
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
  if (!followUpRow) throw new Error("not found");
  if (String(followUpRow.kind || "").trim().toLowerCase() !== "workflow") {
    throw new Error("report-only follow-ups cannot use workflow status actions");
  }

  const assignedRoleCode = normalizeOptionalString(followUpRow.assigned_role_code);
  if (assignedRoleCode === "KAM_COORDINATOR") {
    if (!isKamCoordinator(roles)) throw new Error("forbidden");
  } else if (!isManager(roles)) {
    throw new Error("forbidden");
  }

  const valid = [
    "mark_done",
    "set_open",
    "set_planning_needed",
    "set_waiting_third_party",
    "set_planned",
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
  if (action === "set_planning_needed") {
    return {
      nextStatus: "PLANNING_NODIG",
      isResolved: false,
    };
  }

  if (action === "set_waiting_third_party") {
    return {
      nextStatus: "WACHTENOPDERDEN",
      isResolved: false,
    };
  }
  if (action === "set_planned") {
    return {
      nextStatus: "GEPLAND",
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
  const kamOnly = isKamOnly(input.roles || []);
  const workflowRoleCode = kamOnly ? "KAM_COORDINATOR" : null;

  // Veiligheidsformulieren hangen niet aan een installatie en worden in de KAM-werklijst
  // afgehandeld. Ze staan daarom standaard buiten de Monitor; die blijft over de
  // installatieformulieren gaan. Wie alleen de KAM-rol heeft ziet verder niets, dus voor
  // die gebruiker staat de schakelaar altijd aan.
  const includeSafetyForms = kamOnly
    ? true
    : normalizeBoolean(input?.query?.includeSafetyForms, false);

  // De statuschips en de actiechips filterden tot nu toe in de browser, binnen de opgehaalde
  // pagina. Met paginering klopt dat niet meer; daarom komen ze nu mee naar de server.
  const allowedFormStatuses = new Set([
    "CONCEPT",
    "INGEDIEND",
    "IN_BEHANDELING",
    "AFGEHANDELD",
    "INGETROKKEN",
  ]);
  const selectedStatuses = Array.isArray(input?.query?.selectedStatuses)
    ? input.query.selectedStatuses
    : String(input?.query?.selectedStatuses || "")
        .split(",")
        .map((value: string) => value.trim())
        .filter(Boolean);
  const cleanSelectedStatuses = selectedStatuses
    .map((value: any) => String(value || "").trim().toUpperCase())
    .filter((value: string) => allowedFormStatuses.has(value));

  const allowedActionFilters = new Set([
    "ALL",
    "OPEN",
    "PLANNING_NODIG",
    "WACHTENOPDERDEN",
    "GEPLAND",
    "DONE",
  ]);
  const requestedActionFilter = String(input?.query?.actionStatusFilter || "ALL")
    .trim()
    .toUpperCase();
  const actionStatusFilter = allowedActionFilters.has(requestedActionFilter)
    ? requestedActionFilter
    : "ALL";

  const noRemainingOpenActionPoints = normalizeBoolean(
    input?.query?.noRemainingOpenActionPoints,
    false
  );

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
    workflowRoleCode,
    selectedStatusesJson: JSON.stringify(cleanSelectedStatuses),
    actionStatusFilter,
    noRemainingOpenActionPoints,
    includeSafetyForms,
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
    review_scope: r.review_scope ?? "INSTALLATION",
    finalize_role_code: r.finalize_role_code ?? null,
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

    primary_context_type: r.primary_context_type ?? null,
    primary_context_code: r.primary_context_code ?? null,
    primary_context_label: r.primary_context_label ?? null,
    context_count: Number(r.context_count ?? 0),

    follow_up_summary: {
      total_count: Number(r.follow_up_total_count ?? 0),
      open_count: Number(r.follow_up_actionable_count ?? 0),
      terminal_count: Number(r.follow_up_terminal_count ?? 0),
    },
    follow_up_counts: {
      total_count: Number(r.follow_up_total_count ?? 0),
      open_count: Number(r.follow_up_open_count ?? 0),
      planning_needed_count: Number(r.follow_up_planning_needed_count ?? 0),
      waiting_count: Number(r.follow_up_waiting_count ?? 0),
      planned_count: Number(r.follow_up_planned_count ?? 0),
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
  await assertMayReadFormInstance(formInstanceId, context);

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

  item = {
    ...item,
    contexts: parseJsonArray(item.contexts_json),
    documents: parseJsonArray(item.documents_json),
    assignment_audit: parseJsonArray(item.assignment_audit_json),
    contexts_json: undefined,
    documents_json: undefined,
    assignment_audit_json: undefined,
  };

  const [parent, children, followUpSummaryRaw, finalizeGate, followUpRows, reviewRows] = await Promise.all([
    getParentRow(formInstanceId),
    getChildrenRows(formInstanceId),
    getFollowUpChainSummary(formInstanceId),
    getFinalizeGate(formInstanceId),
    sqlQuery(getFormFollowUpsMonitorByChainSql, { formInstanceId }),
    sqlQuery(getFollowUpReviewItemsSql, { formInstanceId }),
  ]);
  const followUpSummary = {
    ...followUpSummaryRaw,
    can_mark_form_done: finalizeGate.can_finalize,
    finalize_blocked_reason: finalizeGate.blocked_reason,
    review_can_help: finalizeGate.review_context_available && finalizeGate.unreachable_review_count === 0,
  };
  const complimentPoints = await sqlQuery(getFormInstanceComplimentPointsSql, { formInstanceId });

  const { allowed, hints } = buildAllowedActions(item, followUpSummary, context.roles || []);

  return {
    item,
    parent,
    children,
    follow_ups: (followUpRows || []).map((row: any) => ({
      ...row,
      drawing_pins: parseJsonArray(row.drawing_pins_json),
      drawing_pins_json: undefined,
      attachments: parseJsonArray(row.attachments_json),
      attachments_json: undefined,
      atrium_contexts: parseJsonArray(row.atrium_contexts_json),
      atrium_contexts_json: undefined,
    })),
    follow_up_reviews: (reviewRows || []).map((row: any) => ({
      ...row,
      drawing_pins: parseJsonArray(row.drawing_pins_json),
      drawing_pins_json: undefined,
      attachments: parseJsonArray(row.attachments_json),
      attachments_json: undefined,
      atrium_contexts: parseJsonArray(row.atrium_contexts_json),
      atrium_contexts_json: undefined,
    })),
    follow_up_summary: followUpSummary,
    finalize_gate: finalizeGate,
    compliment_points: Array.isArray(complimentPoints) ? complimentPoints : [],
    allowed_actions: allowed,
    action_hints: hints,
    permissions: {
      can_assign_form: isManager(context.roles || []),
      can_set_compliment_points: isManager(context.roles || []),
      // Een handmatig punt krijgt verplicht een installatiecontext; die tabel is de plek
      // waar de werklijst en de beoordelingsronde hem vinden. Zonder installatie liep de
      // aanroep op een harde SQL-fout terwijl de knop gewoon aanklikbaar was.
      can_add_follow_ups:
        isManager(context.roles || []) &&
        !isHistoricalInstallationStatus(item.installation_status) &&
        Boolean(normalizeOptionalString(item.atrium_installation_code)) &&
        ["INGEDIEND", "IN_BEHANDELING"].includes(String(item.status || "").trim()),
      add_follow_ups_blocked_reason: !normalizeOptionalString(item.atrium_installation_code)
        ? "Dit formulier hangt niet aan een installatie. Een actiepunt hoort bij een installatie; zonder installatie is er geen werklijst en geen beoordelingsronde om het punt in te zetten."
        : null,
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
  await assertMayReadFormInstance(formInstanceId, _context);

  const [rows, summaryRaw, finalizeGate] = await Promise.all([
    sqlQuery(getFormFollowUpsMonitorByChainSql, { formInstanceId }),
    getFollowUpChainSummary(formInstanceId),
    getFinalizeGate(formInstanceId),
  ]);

  return {
    items: Array.isArray(rows)
      ? rows.map((row: any) => ({
          ...row,
          drawing_pins: parseJsonArray(row.drawing_pins_json),
          drawing_pins_json: undefined,
          attachments: parseJsonArray(row.attachments_json),
          attachments_json: undefined,
          atrium_contexts: parseJsonArray(row.atrium_contexts_json),
          atrium_contexts_json: undefined,
        }))
      : [],
    summary: {
      ...summaryRaw,
      can_mark_form_done: finalizeGate.can_finalize,
      finalize_blocked_reason: finalizeGate.blocked_reason,
    },
    finalize_gate: finalizeGate,
  };
}

export async function getMonitorFollowUpReview(formInstanceIdRaw: any, context: UserContext) {
  const formInstanceId = parsePositiveInt(formInstanceIdRaw);
  if (formInstanceId == null) return { error: "not found" };

  const detail = await getMonitorDetailRow(formInstanceId);
  if (!detail) return { error: "not found" };
  await assertWorkflowRoleCanAccessFormInstance(formInstanceId, context.roles || []);
  if (isHistoricalInstallationStatus(detail.installation_status)) {
    throw new Error("historical installation read-only");
  }

  const [items, gate] = await Promise.all([
    sqlQuery(getFollowUpReviewItemsSql, { formInstanceId }),
    getFinalizeGate(formInstanceId),
  ]);

  return {
    items: Array.isArray(items)
      ? items.map((row: any) => ({
          ...row,
          drawing_pins: parseJsonArray(row.drawing_pins_json),
          drawing_pins_json: undefined,
          attachments: parseJsonArray(row.attachments_json),
          attachments_json: undefined,
          atrium_contexts: parseJsonArray(row.atrium_contexts_json),
          atrium_contexts_json: undefined,
        }))
      : [],
    gate,
    // Dezelfde grens als createMonitorFollowUpReview afdwingt; anders zegt het scherm dat
    // beoordelen niet mag terwijl de API het toestaat, of omgekeerd.
    permissions: { can_review: resolveFormProcessor(detail, context.roles || []).allowed },
  };
}

export async function createMonitorFollowUpReview(
  formInstanceIdRaw: any,
  payload: any,
  context: UserContext
) {
  const formInstanceId = parsePositiveInt(formInstanceIdRaw);
  if (formInstanceId == null) return { error: "not found" };

  const detail = await getMonitorDetailRow(formInstanceId);
  if (!detail) return { error: "not found" };

  // De beoordelingsronde hoort bij dezelfde persoon die afrondt; bij een formulier met een
  // eigen afrondrol is dat dus die rol en niet de formulierbeheerder. resolveFormProcessor
  // valt zonder afrondrol terug op de beheerder, dus dit is dezelfde grens als het scherm
  // toont. Twee verschillende grenzen zou betekenen dat de knop weg is maar de API het
  // alsnog doet.
  if (!resolveFormProcessor(detail, context.roles || []).allowed) {
    throw new Error("forbidden");
  }

  if (isHistoricalInstallationStatus(detail.installation_status)) {
    throw new Error("historical installation read-only");
  }
  if (String(detail.status || "").trim() !== "IN_BEHANDELING") {
    throw new Error("invalid status transition");
  }

  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const items = rawItems.map((item: any) => ({
    follow_up_action_id: normalizeOptionalString(item?.follow_up_action_id),
    review_decision: normalizeOptionalString(item?.review_decision)?.toUpperCase(),
    customer_discussed: normalizeBoolean(item?.customer_discussed, false),
    customer_visible: normalizeBoolean(item?.customer_visible, false),
    certificate_impact: normalizeCertificateImpactOverride(item?.certificate_impact),
    review_note: normalizeOptionalString(item?.review_note),
  }));

  if (items.some((item: any) => !item.follow_up_action_id || !item.review_decision || !item.certificate_impact)) {
    throw new Error("follow-up review classification invalid");
  }

  const actor = getUserAuditActor(context.user);
  const rows = await sqlQuery(createFollowUpReviewBatchSql, {
    formInstanceId,
    itemsJson: JSON.stringify(items),
    actor,
  });
  const batch = rows?.[0] ?? null;
  const gate = await getFinalizeGate(formInstanceId);

  return { ok: true, batch, gate };
}

export async function createMonitorManualFollowUp(
  formInstanceIdRaw: any,
  payload: any,
  context: UserContext
) {
  const formInstanceId = parsePositiveInt(formInstanceIdRaw);
  if (formInstanceId == null) return { error: "not found" };

  if (!isManager(context.roles || [])) {
    throw new Error("forbidden");
  }

  const item = await getMonitorDetailRow(formInstanceId);
  if (!item) return { error: "not found" };

  if (isHistoricalInstallationStatus(item.installation_status)) {
    throw new Error("historical installation read-only");
  }

  if (!["INGEDIEND", "IN_BEHANDELING"].includes(String(item.status || "").trim())) {
    throw new Error("manual follow-ups require a submitted form");
  }

  // Voor de insert; anders komt de gebruiker uit op 'installation context not found' uit
  // de database, en dat leest als een storing in plaats van als een onmogelijkheid.
  if (!normalizeOptionalString(item.atrium_installation_code)) {
    throw new Error("manual follow-up requires an installation");
  }

  const workflowTitle = normalizeOptionalString(payload?.workflow_title ?? payload?.title);
  if (!workflowTitle) {
    throw new Error("manual follow-up title is required");
  }
  if (workflowTitle.length > 400) {
    throw new Error("manual follow-up title is too long");
  }

  const actor = getUserAuditActor(context.user);
  const workflowDescription = normalizeOptionalString(
    payload?.workflow_description ?? payload?.description
  );
  const requestedKind = String(payload?.kind ?? payload?.manual_kind ?? "workflow")
    .trim()
    .toLowerCase();
  const kind = requestedKind === "report-only" || requestedKind === "informatief"
    ? "report-only"
    : "workflow";
  const certificateImpact = kind === "workflow"
    ? normalizeCertificateImpactOverride(
        payload?.certificate_impact ?? payload?.certificateImpact ?? "yes"
      )
    : null;
  const rows = await sqlQuery(insertManualFormFollowUpSql, {
    formInstanceId,
    atriumInstallationCode: item.atrium_installation_code,
    sourceFingerprint: `manual:${randomUUID()}`,
    workflowTitle,
    workflowDescription,
    kind,
    certificateImpact,
    actor,
  });
  const followUpActionId = String(rows?.[0]?.follow_up_action_id || "").trim();
  if (!followUpActionId) {
    throw new Error("manual follow-up could not be created");
  }

  if (String(item.status || "").trim() === "INGEDIEND") {
    await sqlQuery(setFormInstanceInBehandelingIfSubmittedSql, {
      formInstanceId,
      updatedBy: actor,
    });
  }

  return {
    ok: true,
    follow_up_action_id: followUpActionId,
    form_instance_id: formInstanceId,
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

  const followUpSummaryRaw = await getFollowUpChainSummary(formInstanceId);
  const finalizeGate = await getFinalizeGate(formInstanceId);
  const followUpSummary = {
    ...followUpSummaryRaw,
    can_mark_form_done: finalizeGate.can_finalize,
    finalize_blocked_reason: finalizeGate.blocked_reason,
    review_can_help: finalizeGate.review_context_available && finalizeGate.unreachable_review_count === 0,
  };

  assertFormStatusActionAllowed(item, action, context.roles || [], followUpSummary);

  const nextStatus = mapFormActionToStatus(action);

  await sqlQuery(updateFormInstanceStatusSql, {
    formInstanceId,
    nextStatus,
    updatedBy: actor,
  });

  if (nextStatus === "AFGEHANDELD") {
    let answers: Record<string, any> = {};
    try {
      const parsed = item.answers_json == null || item.answers_json === ""
        ? {}
        : typeof item.answers_json === "object"
          ? item.answers_json
          : JSON.parse(String(item.answers_json));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) answers = parsed;
    } catch {
      throw new Error("answers_json is invalid during finalize");
    }
    await syncDefinitionFollowUps({
      formInstanceId,
      answers,
      user: context.user,
      triggers: ["ON_FINALIZE"],
    });
  }

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

  const summary = await getFollowUpChainSummary(Number(followUpRow.form_instance_id));

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

const CLASSIFICATION_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const CLASSIFICATION_RESPONSIBILITIES = new Set(["INTERN", "KLANT", "DERDE", "ONBEPAALD"]);

/* Prioriteit, verantwoordelijkheid en deadline bijstellen vanuit de Monitor. Dit kon alleen
   op de installatietab, en die route eist een installatiecode; een formulier zonder
   installatie viel er dus buiten terwijl de Monitor juist het scherm is waar beoordeeld
   wordt. Alleen de meegestuurde velden wijzigen. */
export async function updateMonitorFollowUpClassification(
  followUpActionIdRaw: any,
  payload: any,
  context: UserContext
) {
  const followUpActionId = normalizeOptionalString(followUpActionIdRaw);
  if (!followUpActionId) return { error: "not found" };

  if (!isManager(context.roles || [])) {
    throw new Error("forbidden");
  }

  const has = (key: string) => payload != null && Object.hasOwn(payload, key);

  let priority: string | null = null;
  if (has("priority")) {
    priority = String(payload.priority || "").trim().toUpperCase();
    if (!CLASSIFICATION_PRIORITIES.has(priority)) return { ok: false, error: "priority invalid" };
  }

  let responsibilityType: string | null = null;
  if (has("responsibility_type")) {
    responsibilityType = String(payload.responsibility_type || "").trim().toUpperCase();
    if (!CLASSIFICATION_RESPONSIBILITIES.has(responsibilityType)) {
      return { ok: false, error: "responsibility invalid" };
    }
  }

  const dueDateSet = has("due_date");
  const dueDate = dueDateSet ? normalizeOptionalString(payload.due_date) : null;

  if (priority === null && responsibilityType === null && !dueDateSet) {
    return { ok: false, error: "niets om bij te werken" };
  }

  const existingRows = await sqlQuery(getFormFollowUpByIdSql, { followUpActionId });
  const existing = existingRows?.[0] ?? null;
  if (!existing) return { error: "not found" };

  if (isHistoricalInstallationStatus(existing.installation_status)) {
    throw new Error("historical installation read-only");
  }

  const rows = await sqlQuery(updateFormFollowUpClassificationSql, {
    followUpActionId,
    priority,
    responsibilityType,
    dueDate,
    dueDateSet: dueDateSet ? 1 : 0,
    actor: getUserAuditActor(context.user),
  });

  return { ok: true, item: rows?.[0] ?? null };
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

/* De foto of het bestand bij een actiepunt tonen in de Monitor. De installatieroute werkt
   alleen voor formulieren met een installatie; deze werkt voor beide, omdat hij via de
   formulierbron van het punt loopt. */
export async function getMonitorFollowUpAttachmentDownloadUrl(
  followUpActionId: string,
  storedFileId: string
) {
  const cleanActionId = String(followUpActionId || "").trim();
  const cleanFileId = String(storedFileId || "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(cleanActionId)) throw new Error("follow-up attachment not found");
  if (!/^[0-9a-f-]{36}$/i.test(cleanFileId)) throw new Error("follow-up attachment not found");

  const rows = await sqlQuery(getMonitorFollowUpAttachmentSql, {
    followUpActionId: cleanActionId,
    storedFileId: cleanFileId,
  });

  const attachment = (rows || [])[0];
  if (!attachment || !attachment.storage_key) throw new Error("follow-up attachment not found");

  const url = await createFollowUpAttachmentDownloadUrl({
    storageKey: String(attachment.storage_key),
    expiresInSeconds: 300,
    downloadFileName: attachment.file_name ?? null,
  });

  return {
    ok: true,
    url,
    expires_in_seconds: 300,
    file_name: attachment.file_name ?? null,
    mime_type: attachment.mime_type ?? null,
    file_size_bytes: attachment.file_size_bytes ?? null,
  };
}
