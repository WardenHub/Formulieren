/* =========================================================
   /api/src/services/followUpExtractor.ts
   ---------------------------------------------------------
   Extract follow-up workflow candidates from SurveyJS
   survey JSON + answers based on ember.followUp metadata
   ========================================================= */

export type FollowUpKind = "workflow" | "report-only";

export type FollowUpCandidate = {
  kind: FollowUpKind;

  fingerprint: string;

  questionName: string;
  questionType: string | null;

  rowIndex: number | null;
  itemCode: string | null;

  workflowTitle: string;
  workflowDescription: string | null;

  category: string | null;

  certificateImpact: "yes" | "no" | null;

  // Classificatie uit de definitie, niet van de invuller. Een punt dat uit een formulier
  // komt stond altijd op NORMAL, INTERN en zonder deadline; daarmee ziet de hele
  // werkvoorraad even dringend uit en ligt elke bevinding impliciet bij ons.
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL" | null;
  responsibilityType: "INTERN" | "KLANT" | "DERDE" | "ONBEPAALD" | null;
  dueInDays: number | null;
};

type ExtractInput = {
  surveyJson: any;
  answers: Record<string, any>;
};

type FollowUpElement = {
  name: string;
  type: string | null;
  ember?: {
    followUp?: any;
  };
};

type NormalizedFollowUpConfig = {
  kind: FollowUpKind;
  config: any;
};

export function extractFollowUps(input: ExtractInput): FollowUpCandidate[] {
  const survey = input?.surveyJson || {};
  const answers = isPlainObject(input?.answers) ? input.answers : {};

  const elements = collectFollowUpElements(survey);
  const results: FollowUpCandidate[] = [];

  for (const element of elements) {
    const questionName = String(element.name || "").trim();
    if (!questionName) continue;

    const questionType = normalizeNullableString(element.type);
    const answerValue = answers[questionName];

    const followUps = normalizeFollowUpConfigs(element?.ember?.followUp);
    if (followUps.length === 0) continue;

    if (questionType === "matrixdynamic") {
      for (const followUp of followUps) {
        extractFromMatrixQuestion({
          kind: followUp.kind,
          questionName,
          questionType,
          followUp: followUp.config,
          answerValue,
          results,
        });
      }
      continue;
    }

    for (const followUp of followUps) {
      extractFromSingleQuestion({
        kind: followUp.kind,
        questionName,
        questionType,
        followUp: followUp.config,
        answers,
        answerValue,
        results,
      });
    }
  }

  return dedupeCandidates(results);
}

function normalizeFollowUpConfigs(raw: any): NormalizedFollowUpConfig[] {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return arr
    .map((cfg) => {
      const kind = normalizeKind(cfg?.kind);
      if (!kind) return null;

      return {
        kind,
        config: cfg,
      };
    })
    .filter(Boolean) as NormalizedFollowUpConfig[];
}

function extractFromMatrixQuestion(args: {
  kind: FollowUpKind;
  questionName: string;
  questionType: string | null;
  followUp: any;
  answerValue: any;
  results: FollowUpCandidate[];
}) {
  const rows = Array.isArray(args.answerValue) ? args.answerValue : [];
  if (rows.length === 0) return;

  rows.forEach((row, zeroBasedIndex) => {
    const rowData = isPlainObject(row) ? row : {};
    if (!shouldCreateFollowUp(args.followUp, rowData)) return;

    const rowIndex = zeroBasedIndex + 1;
    const itemCode = getOptionalField(rowData, args.followUp.itemCodeField);

    const workflowTitle = buildTitle({
      followUp: args.followUp,
      data: rowData,
      itemCode,
    });

    const workflowDescription = getOptionalField(
      rowData,
      args.followUp.descriptionField
    );

    const certificateImpact = resolveCertificateImpact(args.followUp, rowData);

    args.results.push({
      kind: args.kind,
      fingerprint: buildFingerprint({
        questionName: args.questionName,
        rowIndex,
        itemCode,
      }),
      questionName: args.questionName,
      questionType: args.questionType,
      rowIndex,
      itemCode,
      workflowTitle,
      workflowDescription,
      category: normalizeNullableString(args.followUp.category),
      certificateImpact,
      priority: resolvePriority(args.followUp),
      responsibilityType: resolveResponsibility(args.followUp),
      dueInDays: resolveDueInDays(args.followUp),
    });
  });
}

function extractFromSingleQuestion(args: {
  kind: FollowUpKind;
  questionName: string;
  questionType: string | null;
  followUp: any;
  answers: Record<string, any>;
  answerValue: any;
  results: FollowUpCandidate[];
}) {
  const conditionContext = buildSingleQuestionConditionContext(
    args.questionName,
    args.answerValue,
    args.answers
  );

  if (!shouldCreateFollowUp(args.followUp, conditionContext)) return;

  const itemCode = getOptionalField(conditionContext, args.followUp.itemCodeField);

  const workflowTitle = buildTitle({
    followUp: args.followUp,
    data: conditionContext,
    itemCode,
  });

  const workflowDescription = getOptionalField(
    conditionContext,
    args.followUp.descriptionField
  );

  const certificateImpact = resolveCertificateImpact(
    args.followUp,
    conditionContext
  );

  args.results.push({
    kind: args.kind,
    fingerprint: buildFingerprint({
      questionName: args.questionName,
      rowIndex: null,
      itemCode,
    }),
    questionName: args.questionName,
    questionType: args.questionType,
    rowIndex: null,
    itemCode,
    workflowTitle,
    workflowDescription,
    category: normalizeNullableString(args.followUp.category),
    certificateImpact,
    priority: resolvePriority(args.followUp),
    responsibilityType: resolveResponsibility(args.followUp),
    dueInDays: resolveDueInDays(args.followUp),
  });
}

function buildSingleQuestionConditionContext(
  questionName: string,
  answerValue: any,
  answers: Record<string, any>
) {
  const base = isPlainObject(answers) ? { ...answers } : {};

  base[questionName] = answerValue;
  base.value = answerValue;

  return base;
}

function shouldCreateFollowUp(followUp: any, data: any) {
  const mode = String(followUp?.mode || "on-condition").trim();

  if (mode === "always") return true;
  if (mode !== "on-condition") return false;

  const condition = followUp?.condition;
  if (!condition || !condition.field) return false;

  const field = String(condition.field).trim();
  const expected = condition.equals;
  const actual = data?.[field];

  return valuesEqualLoose(actual, expected);
}

const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const RESPONSIBILITIES = new Set(["INTERN", "KLANT", "DERDE", "ONBEPAALD"]);

// Een onbekende waarde levert null op in plaats van een gok; dan valt de tabeldefault in en
// wordt de fout bij het publiceren gemeld in plaats van hier stil rechtgezet.
function resolvePriority(followUp: any): FollowUpCandidate["priority"] {
  const value = String(followUp?.priority ?? "").trim().toUpperCase();
  return PRIORITIES.has(value) ? (value as FollowUpCandidate["priority"]) : null;
}

function resolveResponsibility(followUp: any): FollowUpCandidate["responsibilityType"] {
  const value = String(followUp?.responsibility ?? "").trim().toUpperCase();
  return RESPONSIBILITIES.has(value)
    ? (value as FollowUpCandidate["responsibilityType"])
    : null;
}

// Het aantal dagen dat een punt uit deze vraag mag blijven liggen, geteld vanaf het moment
// dat het ontstaat. De invuller ziet en zet hier niets; dit is een keuze van wie het
// formulier ontwerpt. Een jaar is de bovengrens; daarboven is een deadline geen deadline.
function resolveDueInDays(followUp: any): number | null {
  const raw = followUp?.dueInDays;
  if (raw === null || raw === undefined || raw === "") return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  const days = Math.trunc(parsed);
  if (days < 1 || days > 365) return null;

  return days;
}

function resolveCertificateImpact(
  followUp: any,
  data: any
): "yes" | "no" | null {
  const cfg = followUp?.certificateImpact;
  if (!cfg || typeof cfg !== "object") return null;

  const mode = String(cfg.mode || "").trim();

  if (mode === "fixed") {
    return cfg.value === "yes" ? "yes" : "no";
  }

  if (mode === "field") {
    const field = String(cfg.field || "").trim();
    if (!field) return null;

    const value = data?.[field];
    return truthyYes(value) ? "yes" : "no";
  }

  if (mode === "none") {
    return "no";
  }

  return null;
}

function buildTitle(args: {
  followUp: any;
  data: any;
  itemCode: string | null;
}) {
  const workflowTitleField = String(args.followUp?.workflowtitleField || "").trim();
  const titleValue = workflowTitleField
    ? getOptionalField(args.data, workflowTitleField)
    : null;

  if (args.itemCode && titleValue) {
    return `${args.itemCode} - ${titleValue}`;
  }

  if (titleValue) return titleValue;
  if (args.itemCode) return args.itemCode;

  return "Opvolgingsactie";
}

function getOptionalField(data: any, field: string | undefined): string | null {
  const fieldName = String(field || "").trim();
  if (!fieldName) return null;

  const value = data?.[fieldName];
  return normalizeNullableString(value);
}

function buildFingerprint(args: {
  questionName: string;
  rowIndex: number | null;
  itemCode: string | null;
}) {
  return [
    normalizeFingerprintPart(args.questionName),
    normalizeFingerprintPart(args.rowIndex),
    normalizeFingerprintPart(args.itemCode),
  ].join("|");
}

function normalizeFingerprintPart(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\|/g, "/");
}

function collectFollowUpElements(survey: any): FollowUpElement[] {
  const bucket: FollowUpElement[] = [];
  const pages = Array.isArray(survey?.pages) ? survey.pages : [];

  for (const page of pages) {
    walkForFollowUps(page?.elements, bucket);
  }

  return bucket;
}

function walkForFollowUps(items: any, bucket: FollowUpElement[]) {
  if (!Array.isArray(items)) return;

  for (const el of items) {
    if (!el || typeof el !== "object") continue;

    if (el?.ember?.followUp) {
      bucket.push(el);
    }

    if (Array.isArray(el.elements)) {
      walkForFollowUps(el.elements, bucket);
    }

    if (Array.isArray(el.templateElements)) {
      walkForFollowUps(el.templateElements, bucket);
    }

    if (Array.isArray(el.pages)) {
      for (const nestedPage of el.pages) {
        walkForFollowUps(nestedPage?.elements, bucket);
      }
    }

    if (Array.isArray(el.rows)) {
      for (const row of el.rows) {
        if (Array.isArray(row?.elements)) {
          walkForFollowUps(row.elements, bucket);
        }
      }
    }
  }
}

function dedupeCandidates(items: FollowUpCandidate[]) {
  const map = new Map<string, FollowUpCandidate>();

  for (const item of items) {
    const key = `${String(item?.kind || "").trim()}::${String(item?.fingerprint || "").trim()}`;
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
  if (item.rowIndex !== null) score += 1;
  return score;
}

function normalizeKind(value: unknown): FollowUpKind | null {
  const v = String(value || "").trim();
  if (v === "workflow") return "workflow";
  if (v === "report-only") return "report-only";
  return null;
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function valuesEqualLoose(actual: unknown, expected: unknown) {
  if (actual === expected) return true;

  const a = normalizeComparable(actual);
  const e = normalizeComparable(expected);

  return a === e;
}

function normalizeComparable(value: unknown) {
  if (value === null || value === undefined) return "";

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const s = String(value).trim();
  return s.toLowerCase();
}

function truthyYes(value: unknown) {
  if (value === true) return true;
  if (value === 1) return true;

  const normalized = normalizeComparable(value);

  return (
    normalized === "ja" ||
    normalized === "yes" ||
    normalized === "true" ||
    normalized === "1" ||
    normalized === "y"
  );
}