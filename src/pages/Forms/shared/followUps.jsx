// src/pages/Forms/shared/followUps.jsx

import {
  normalizeComparable,
  normalizeNullableString,
} from "./surveyCore.jsx";

export function valuesEqualLooseForFollowUp(actual, expected) {
  if (actual === expected) return true;
  return normalizeComparable(actual) === normalizeComparable(expected);
}

export function followUpTruthyYes(value) {
  const v = normalizeComparable(value);
  return v === "ja" || v === "yes" || v === "true" || v === "1" || v === "y";
}

export function walkSurveyNodes(node, fn) {
  if (!node || typeof node !== "object") return;

  fn(node);

  const visitArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      walkSurveyNodes(item, fn);
    }
  };

  visitArray(node.pages);
  visitArray(node.elements);
  visitArray(node.templateElements);
  visitArray(node.questions);
  visitArray(node.rows);
}

export function collectFollowUpDefinitionsFromSurvey(surveyJson) {
  const defs = [];

  walkSurveyNodes(surveyJson, (node) => {
    const followUp = node?.ember?.followUp;
    if (!followUp) return;

    const name = String(node?.name || "").trim();
    if (!name) return;

    defs.push({
      name,
      type: normalizeNullableString(node?.type),
      followUp,
    });
  });

  return defs;
}

export function shouldCreateLocalFollowUp(followUp, rowOrContext) {
  const mode = String(followUp?.mode || "on-condition").trim();

  if (mode === "always") return true;
  if (mode !== "on-condition") return false;

  const condition = followUp?.condition;
  if (!condition || !condition.field) return false;

  const field = String(condition.field).trim();
  const expected = condition.equals;
  const actual = rowOrContext?.[field];

  return valuesEqualLooseForFollowUp(actual, expected);
}

export function resolveLocalCertificateImpact(followUp, rowOrContext) {
  const cfg = followUp?.certificateImpact;
  if (!cfg || typeof cfg !== "object") return null;

  const mode = String(cfg.mode || "").trim();

  if (mode === "fixed") {
    return cfg.value === "yes" ? "yes" : "no";
  }

  if (mode === "field") {
    const field = String(cfg.field || "").trim();
    if (!field) return null;
    return followUpTruthyYes(rowOrContext?.[field]) ? "yes" : "no";
  }

  if (mode === "none") {
    return "no";
  }

  return null;
}

export function getOptionalFollowUpField(data, fieldName) {
  const key = String(fieldName || "").trim();
  if (!key) return null;
  return normalizeNullableString(data?.[key]);
}

export function buildLocalFollowUpTitle(followUp, rowOrContext, itemCode) {
  const workflowTitleField = String(followUp?.workflowtitleField || "").trim();
  const titleValue = workflowTitleField
    ? getOptionalFollowUpField(rowOrContext, workflowTitleField)
    : null;

  if (itemCode && titleValue) return `${itemCode} - ${titleValue}`;
  if (titleValue) return titleValue;
  if (itemCode) return itemCode;
  return "Opvolgingsactie";
}

export function buildSingleQuestionContext(questionName, answerValue, answers) {
  const base = answers && typeof answers === "object" ? { ...answers } : {};
  base[questionName] = answerValue;
  base.value = answerValue;
  return base;
}

export function buildLocalFollowUpFingerprint({ questionName, rowIndex, itemCode }) {
  return [
    normalizeNullableString(questionName) || "",
    rowIndex == null ? "" : String(rowIndex),
    normalizeNullableString(itemCode) || "",
  ].join("|");
}

export function dedupeLocalFollowUps(items) {
  const map = new Map();

  for (const item of items || []) {
    const fp = String(item?.fingerprint || "").trim();
    if (!fp) continue;

    const existing = map.get(fp);
    if (!existing) {
      map.set(fp, item);
      continue;
    }

    const existingScore =
      (existing.workflowTitle ? 2 : 0) +
      (existing.workflowDescription ? 2 : 0) +
      (existing.category ? 1 : 0) +
      (existing.certificateImpact ? 1 : 0) +
      (existing.itemCode ? 1 : 0);

    const nextScore =
      (item.workflowTitle ? 2 : 0) +
      (item.workflowDescription ? 2 : 0) +
      (item.category ? 1 : 0) +
      (item.certificateImpact ? 1 : 0) +
      (item.itemCode ? 1 : 0);

    if (nextScore >= existingScore) {
      map.set(fp, item);
    }
  }

  return Array.from(map.values());
}

export function evaluateLocalFollowUps(surveyJson, answers) {
  const defs = collectFollowUpDefinitionsFromSurvey(surveyJson || {});
  const allAnswers = answers && typeof answers === "object" ? answers : {};
  const found = [];

  for (const def of defs) {
    const questionName = def.name;
    const questionType = def.type;
    const followUp = def.followUp;
    const answerValue = allAnswers?.[questionName];

    if (questionType === "matrixdynamic") {
      const rows = Array.isArray(answerValue) ? answerValue : [];

      rows.forEach((row, zeroBasedIndex) => {
        const rowData = row && typeof row === "object" ? row : {};
        if (!shouldCreateLocalFollowUp(followUp, rowData)) return;

        const rowIndex = zeroBasedIndex + 1;
        const itemCode = getOptionalFollowUpField(rowData, followUp.itemCodeField);

        found.push({
          kind: String(followUp?.kind || "").trim() || "workflow",
          questionName,
          questionType,
          rowIndex,
          itemCode,
          workflowTitle: buildLocalFollowUpTitle(followUp, rowData, itemCode),
          workflowDescription: getOptionalFollowUpField(rowData, followUp.descriptionField),
          category: normalizeNullableString(followUp?.category),
          certificateImpact: resolveLocalCertificateImpact(followUp, rowData),
          fingerprint: buildLocalFollowUpFingerprint({
            questionName,
            rowIndex,
            itemCode,
          }),
        });
      });

      continue;
    }

    const ctx = buildSingleQuestionContext(questionName, answerValue, allAnswers);
    if (!shouldCreateLocalFollowUp(followUp, ctx)) continue;

    const itemCode = getOptionalFollowUpField(ctx, followUp.itemCodeField);

    found.push({
      kind: String(followUp?.kind || "").trim() || "workflow",
      questionName,
      questionType,
      rowIndex: null,
      itemCode,
      workflowTitle: buildLocalFollowUpTitle(followUp, ctx, itemCode),
      workflowDescription: getOptionalFollowUpField(ctx, followUp.descriptionField),
      category: normalizeNullableString(followUp?.category),
      certificateImpact: resolveLocalCertificateImpact(followUp, ctx),
      fingerprint: buildLocalFollowUpFingerprint({
        questionName,
        rowIndex: null,
        itemCode,
      }),
    });
  }

  return {
    definitions: defs,
    items: dedupeLocalFollowUps(found),
  };
}