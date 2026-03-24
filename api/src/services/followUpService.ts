/* =========================================================
   /api/src/services/followUpService.ts
   ---------------------------------------------------------
   Sync extracted follow-up candidates to dbo.FormFollowUpAction
   ========================================================= */

import { sqlQuery } from "../db/index.js";
import {
  extractFollowUps,
  type FollowUpCandidate,
} from "./followUpExtractor.js";
import {
  getFormFollowUpsByInstanceSql,
  insertFormFollowUpSql,
  updateFormFollowUpContentSql,
  markFormFollowUpVervallenSql,
} from "../db/queries/formFollowUps.sql.js";

type SyncFollowUpsInput = {
  formInstance: {
    form_instance_id: number | string;
    installation_id: string;
    atrium_installation_code: string;
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
  source_fingerprint: string;
  source_question_name: string;
  source_question_type: string | null;
  source_row_index: number | null;
  source_item_code: string | null;
  workflow_title: string;
  workflow_description: string | null;
  category: string | null;
  certificate_impact: "yes" | "no" | null;
  status:
    | "OPEN"
    | "AFGEHANDELD"
    | "WACHTENOPDERDEN"
    | "AFGEWEZEN"
    | "VERVALLEN"
    | "INFORMATIEF";
};

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
  const installationId = String(input?.formInstance?.installation_id || "").trim();
  const atriumCode = String(input?.formInstance?.atrium_installation_code || "").trim();
  const actor = getActor(input?.user);

  if (formInstanceId == null) {
    throw new Error("syncFormFollowUps: form_instance_id ontbreekt");
  }
  if (!installationId) {
    throw new Error("syncFormFollowUps: installation_id ontbreekt");
  }
  if (!atriumCode) {
    throw new Error("syncFormFollowUps: atrium_installation_code ontbreekt");
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
    existingByFingerprint.set(String(row.source_fingerprint), row);
  }

  const extractedFingerprints = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let vervallen = 0;

  for (const candidate of extracted) {
    extractedFingerprints.add(candidate.fingerprint);

    const current = existingByFingerprint.get(candidate.fingerprint);

    if (!current) {
      await insertFollowUp({
        formInstanceId,
        installationId,
        atriumCode,
        actor,
        candidate,
      });
      inserted += 1;
      continue;
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
    const fp = String(row.source_fingerprint || "").trim();
    if (!fp || extractedFingerprints.has(fp)) continue;

    if (row.status === "VERVALLEN") continue;
    if (row.status === "AFGEHANDELD") continue;
    if (row.status === "AFGEWEZEN") continue;

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
    },
  };
}

async function getExistingFollowUps(formInstanceId: number): Promise<ExistingFollowUpRow[]> {
  const rows = await sqlQuery(getFormFollowUpsByInstanceSql, {
    formInstanceId,
  });

  return Array.isArray(rows) ? rows : [];
}

async function insertFollowUp(args: {
  formInstanceId: number;
  installationId: string;
  atriumCode: string;
  actor: string;
  candidate: FollowUpCandidate;
}) {
  const { formInstanceId, installationId, atriumCode, actor, candidate } = args;

  const initialStatus = candidate.kind === "report-only" ? "INFORMATIEF" : "OPEN";

  await sqlQuery(insertFormFollowUpSql, {
    formInstanceId,
    installationId,
    atriumCode,
    sourceQuestionName: candidate.questionName,
    sourceQuestionType: candidate.questionType || null,
    sourceRowIndex: candidate.rowIndex ?? null,
    sourceItemCode: candidate.itemCode || null,
    sourceFingerprint: candidate.fingerprint,
    workflowTitle: candidate.workflowTitle,
    workflowDescription: candidate.workflowDescription || null,
    category: candidate.category || null,
    certificateImpact: candidate.certificateImpact || null,
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

function dedupeCandidates(items: FollowUpCandidate[]) {
  const map = new Map<string, FollowUpCandidate>();

  for (const item of items || []) {
    const fp = String(item?.fingerprint || "").trim();
    if (!fp) continue;

    const existing = map.get(fp);
    if (!existing) {
      map.set(fp, item);
      continue;
    }

    if (scoreCandidate(item) >= scoreCandidate(existing)) {
      map.set(fp, item);
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

function getActor(user: any) {
  const raw =
    user?.email ||
    user?.upn ||
    user?.preferred_username ||
    user?.name ||
    user?.id ||
    "system";

  return String(raw).trim() || "system";
}