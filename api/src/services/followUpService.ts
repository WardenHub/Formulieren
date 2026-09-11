/* =========================================================
   /api/src/services/followUpService.ts
   ---------------------------------------------------------
   Sync extracted follow-up candidates to the generic dbo.FollowUpAction domain
   ========================================================= */

import { sqlQuery } from "../db/index.js";
import {
  extractFollowUps,
  type FollowUpCandidate,
} from "./followUpExtractor.js";
import {
  getFormFollowUpsByInstanceSql,
  insertFormFollowUpSql,
  insertRunnerFollowUpPointSql,
  updateFormFollowUpContentSql,
  markFormFollowUpVervallenSql,
  markInstanceFollowUpsVervallenSql,
  reactivateFormFollowUpSql,
  deleteConceptFormFollowUpSql,
} from "../db/queries/formFollowUps.sql.js";
import { getUserAuditActor } from "../utils/userIdentity.js";

type SyncFollowUpsInput = {
  formInstance: {
    form_instance_id: number | string;
    installation_id?: string | null;
    atrium_installation_code?: string | null;
    status?: string | null;
  };
  surveyJson: any;
  answers: Record<string, any>;
  user: any;
};

type PreviewFollowUpsInput = {
  surveyJson: any;
  answers: Record<string, any>;
};

type ExistingFollowUpRow = {
  follow_up_action_id: string;
  form_instance_id: number;
  kind: "workflow" | "report-only";
  source_fingerprint: string;
  source_question_name: string;
  source_question_type: string | null;
  source_row_index: number | null;
  source_item_code: string | null;
  workflow_title: string;
  workflow_description: string | null;
  category: string | null;
  certificate_impact: "yes" | "no" | null;
  certificate_impact_override: "yes" | "no" | null;
  effective_certificate_impact: "yes" | "no" | null;
  status:
    | "OPEN"
      | "AFGEHANDELD"
    | "WACHTENOPDERDEN"
    | "AFGEWEZEN"
    | "VERVALLEN"
    | "INFORMATIEF";
};

// Aangeroepen bij intrekken van een formulier. Punten die iemand al heeft afgehandeld
// of afgewezen blijven staan; alleen wat nog open stond vervalt.
export async function vervalFormInstanceFollowUps(formInstanceId: number | string, user: any) {
  const id = parseFormInstanceId(formInstanceId);
  if (id == null) return { ok: false, error: "ongeldige form_instance_id" };

  const rows = await sqlQuery(markInstanceFollowUpsVervallenSql, {
    formInstanceId: id,
    actor: getUserAuditActor(user),
  });

  const first: any = Array.isArray(rows) ? rows[0] : null;

  return {
    ok: true,
    form_instance_id: id,
    counts: { vervallen: Number(first?.vervallen ?? 0) },
  };
}

const TOEGESTANE_PRIORITEITEN = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);

// Een punt dat de invuller zelf toevoegt tijdens het invullen. Titel is verplicht, want
// dat is de "wat"-vraag; de rest is aanvulling die later aan het punt kan worden gehangen.
/* dbo.FollowUpActionFormSource.source_question_name is NOT NULL en heeft geen default,
   terwijl de punten-sheet in de runner alleen titel, omschrijving en prioriteit meestuurt.
   Daardoor ging er een NULL naar een kolom die dat niet toestaat en eindigde het toevoegen
   van een eigen punt in een 500.

   Een punt van de invuller komt niet uit een vraag; die herkomst staat al in source_type
   MANUAL en in het voorvoegsel van de fingerprint. Deze waarde vult de kolom eerlijk in
   zonder een vraag te verzinnen die er niet is. */
export const MANUAL_POINT_SOURCE_QUESTION = "manual";

export function resolveSourceQuestionName(value: unknown) {
  const schoon = value === null || value === undefined ? "" : String(value).trim();
  return schoon.length ? schoon.slice(0, 200) : MANUAL_POINT_SOURCE_QUESTION;
}

export async function addRunnerFollowUpPoint(input: {
  formInstanceId: number | string;
  title: any;
  description?: any;
  category?: any;
  priority?: any;
  sourceQuestionName?: any;
  // Een sleutel van de client. Offline gemaakte punten komen daarmee binnen, zodat een
  // herhaalde sync hetzelfde punt niet twee keer aanmaakt; zie insertRunnerFollowUpPointSql.
  clientFingerprint?: any;
  user: any;
}) {
  const formInstanceId = parseFormInstanceId(input?.formInstanceId);
  if (formInstanceId == null) return { ok: false, error: "ongeldige form_instance_id" };

  const workflowTitle = String(input?.title ?? "").trim();
  if (!workflowTitle) return { ok: false, error: "titel is verplicht" };

  const priority = String(input?.priority ?? "NORMAL").trim().toUpperCase();
  if (!TOEGESTANE_PRIORITEITEN.has(priority)) {
    return { ok: false, error: "onbekende prioriteit" };
  }

  const rows = await sqlQuery(insertRunnerFollowUpPointSql, {
    formInstanceId,
    workflowTitle: workflowTitle.slice(0, 300),
    workflowDescription: normalizeNullable(input?.description),
    category: normalizeNullable(input?.category),
    priority,
    sourceQuestionName: resolveSourceQuestionName(input?.sourceQuestionName),
    clientFingerprint: normalizeNullable(input?.clientFingerprint),
    actor: getUserAuditActor(input?.user),
  });

  const first: any = Array.isArray(rows) ? rows[0] : null;

  return {
    ok: true,
    follow_up_action_id: first?.follow_up_action_id ?? null,
    // false betekent: dit punt stond er al, dit was een herhaalde sync.
    created: first?.created == null ? true : Boolean(first.created),
  };
}

export async function previewFormFollowUps(input: PreviewFollowUpsInput) {
  const extracted = dedupeCandidates(
    extractFollowUps({
      surveyJson: input.surveyJson,
      answers: input.answers || {},
    })
  );

  return {
    ok: true,
    count: extracted.length,
    items: extracted,
  };
}

export async function syncFormFollowUps(input: SyncFollowUpsInput) {
  const formInstanceId = parseFormInstanceId(input?.formInstance?.form_instance_id);
  const actor = getUserAuditActor(input?.user);

  if (formInstanceId == null) {
    throw new Error("syncFormFollowUps: form_instance_id ontbreekt");
  }

  const extracted = dedupeCandidates(
    extractFollowUps({
      surveyJson: input.surveyJson,
      answers: input.answers || {},
    })
  );

  const existing = await getExistingFollowUps(formInstanceId);
  const existingByFingerprint = new Map<string, ExistingFollowUpRow>();

  for (const row of existing) {
    existingByFingerprint.set(buildFollowUpSyncKey(row.kind, row.source_fingerprint), row);
  }

  // Zolang het formulier concept is, is een punt werkvoorraad van de invuller zelf.
  // Verdwijnt het dan weer, dan hoort er niets achter te blijven.
  const isConcept = String(input?.formInstance?.status || "").trim().toUpperCase() === "CONCEPT";

  const extractedFingerprints = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let vervallen = 0;
  let reactivated = 0;
  let removed = 0;

  for (const candidate of extracted) {
    const candidateKey = buildFollowUpSyncKey(candidate.kind, candidate.fingerprint);
    extractedFingerprints.add(candidateKey);

    const current = existingByFingerprint.get(candidateKey);

    if (!current) {
      await insertFollowUp({
        formInstanceId,
        actor,
        candidate,
      });
      inserted += 1;
      continue;
    }

    // Een bevinding die terugkomt moet weer open. Zonder dit blijft de rij vervallen,
    // omdat de inhoud ongewijzigd is en de vergelijking hieronder niets ziet.
    if (current.status === "VERVALLEN") {
      await reactivateFollowUp(current.follow_up_action_id, getInitialStatus(candidate.kind), actor);
      reactivated += 1;
    }

    if (!hasMeaningfulChanges(current, candidate)) {
      unchanged += 1;
      continue;
    }

    await updateFollowUpContent({
      followUpActionId: current.follow_up_action_id,
      actor,
      candidate,
    });
    updated += 1;
  }

  for (const row of existing) {
    const fp = buildFollowUpSyncKey(row.kind, row.source_fingerprint);
    if (!fp || extractedFingerprints.has(fp)) continue;

    if (row.status === "VERVALLEN") continue;
    if (row.status === "AFGEHANDELD") continue;
    if (row.status === "AFGEWEZEN") continue;

    if (isConcept) {
      const deleted = await deleteConceptFollowUp(row.follow_up_action_id, getInitialStatus(row.kind));

      if (deleted) {
        removed += 1;
        continue;
      }
    }

    await markFollowUpVervallen(row.follow_up_action_id, actor);
    vervallen += 1;
  }

  return {
    ok: true,
    form_instance_id: formInstanceId,
    counts: {
      extracted: extracted.length,
      inserted,
      updated,
      unchanged,
      vervallen,
      reactivated,
      removed,
    },
  };
}

function getInitialStatus(kind: unknown) {
  return String(kind || "").trim() === "report-only" ? "INFORMATIEF" : "OPEN";
}

async function getExistingFollowUps(formInstanceId: number): Promise<ExistingFollowUpRow[]> {
  const rows = await sqlQuery(getFormFollowUpsByInstanceSql, {
    formInstanceId,
  });

  return Array.isArray(rows) ? rows : [];
}

async function insertFollowUp(args: {
  formInstanceId: number;
  actor: string;
  candidate: FollowUpCandidate;
}) {
  const { formInstanceId, actor, candidate } = args;

  const initialStatus = getInitialStatus(candidate.kind);

  await sqlQuery(insertFormFollowUpSql, {
    formInstanceId,
    sourceQuestionName: candidate.questionName,
    sourceQuestionType: candidate.questionType || null,
    sourceRowIndex: candidate.rowIndex ?? null,
    sourceItemCode: candidate.itemCode || null,
    sourceFingerprint: candidate.fingerprint,
    kind: candidate.kind,
    workflowTitle: candidate.workflowTitle,
    workflowDescription: candidate.workflowDescription || null,
    category: candidate.category || null,
    certificateImpact: candidate.certificateImpact || null,
    priority: candidate.priority,
    responsibilityType: candidate.responsibilityType,
    dueInDays: candidate.dueInDays,
    initialStatus,
    actor,
  });
}

async function updateFollowUpContent(args: {
  followUpActionId: string;
  actor: string;
  candidate: FollowUpCandidate;
}) {
  const { followUpActionId, actor, candidate } = args;

  await sqlQuery(updateFormFollowUpContentSql, {
    followUpActionId,
    sourceQuestionName: candidate.questionName,
    sourceQuestionType: candidate.questionType || null,
    sourceRowIndex: candidate.rowIndex ?? null,
    sourceItemCode: candidate.itemCode || null,
    kind: candidate.kind,
    workflowTitle: candidate.workflowTitle,
    workflowDescription: candidate.workflowDescription || null,
    category: candidate.category || null,
    certificateImpact: candidate.certificateImpact || null,
    actor,
  });
}

async function markFollowUpVervallen(followUpActionId: string, actor: string) {
  await sqlQuery(markFormFollowUpVervallenSql, {
    followUpActionId,
    actor,
  });
}

async function reactivateFollowUp(followUpActionId: string, initialStatus: string, actor: string) {
  await sqlQuery(reactivateFormFollowUpSql, {
    followUpActionId,
    initialStatus,
    actor,
  });
}

// Geeft terug of de rij werkelijk is verwijderd. De veiligheidscontrole staat in SQL,
// zodat hij niet kan afwijken van wat er in dezelfde stap wordt weggegooid.
async function deleteConceptFollowUp(followUpActionId: string, initialStatus: string) {
  const rows = await sqlQuery(deleteConceptFormFollowUpSql, {
    followUpActionId,
    initialStatus,
  });

  const first = Array.isArray(rows) ? rows[0] : null;
  return Boolean(first?.deleted);
}

function dedupeCandidates(items: FollowUpCandidate[]) {
  const map = new Map<string, FollowUpCandidate>();

  for (const item of items || []) {
    const key = buildFollowUpSyncKey(item?.kind, item?.fingerprint);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }

    if (scoreCandidate(item) >= scoreCandidate(existing)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

function scoreCandidate(item: FollowUpCandidate) {
  let score = 0;
  if (item.workflowTitle) score += 2;
  if (item.workflowDescription) score += 2;
  if (item.category) score += 1;
  if (item.certificateImpact) score += 1;
  if (item.itemCode) score += 1;
  if (item.kind === "workflow") score += 1;
  return score;
}

function hasMeaningfulChanges(row: ExistingFollowUpRow, candidate: FollowUpCandidate) {
  return (
    normalizeNullable(row.kind) !== normalizeNullable(candidate.kind) ||
    normalizeNullable(row.source_question_name) !== normalizeNullable(candidate.questionName) ||
    normalizeNullable(row.source_question_type) !== normalizeNullable(candidate.questionType) ||
    normalizeNumber(row.source_row_index) !== normalizeNumber(candidate.rowIndex) ||
    normalizeNullable(row.source_item_code) !== normalizeNullable(candidate.itemCode) ||
    normalizeNullable(row.workflow_title) !== normalizeNullable(candidate.workflowTitle) ||
    normalizeNullable(row.workflow_description) !== normalizeNullable(candidate.workflowDescription) ||
    normalizeNullable(row.category) !== normalizeNullable(candidate.category) ||
    normalizeNullable(row.certificate_impact) !== normalizeNullable(candidate.certificateImpact)
  );
}

function normalizeNullable(v: unknown) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function buildFollowUpSyncKey(kind: unknown, fingerprint: unknown) {
  const cleanKind = String(kind || "").trim();
  const cleanFingerprint = String(fingerprint || "").trim();
  return `${cleanKind}::${cleanFingerprint}`;
}

function normalizeNumber(v: unknown) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseFormInstanceId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).trim());

  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
