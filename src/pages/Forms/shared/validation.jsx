// src/pages/Forms/shared/validation.jsx

import { CustomError } from "survey-core";
import { getPageTitle, getQuestionTitle } from "./surveyCore.jsx";

export function isQuestionReportOnly(question) {
  const kind = String(question?.jsonObj?.ember?.followUp?.kind || "")
    .trim()
    .toLowerCase();

  return kind === "report-only";
}

export function isQuestionBlocking(question) {
  return !isQuestionReportOnly(question);
}

export function isBlankValue(value) {
  return (
    value == null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function getMatrixColumnTitle(column) {
  return String(column?.title || column?.name || "Veld").trim();
}

export function getMatrixVisibleRows(question) {
  if (Array.isArray(question?.visibleRows)) return question.visibleRows;
  if (Array.isArray(question?.generatedVisibleRows)) return question.generatedVisibleRows;
  return [];
}

export function getMatrixCellQuestion(row, columnName) {
  if (!row || !columnName) return null;

  if (typeof row.getQuestionByColumnName === "function") {
    return row.getQuestionByColumnName(columnName) || null;
  }

  const cells = Array.isArray(row?.cells) ? row.cells : [];
  const hit = cells.find(
    (cell) => String(cell?.column?.name || "").trim() === String(columnName).trim()
  );

  return hit?.question || null;
}

export function buildMatrixRowValidationItems(question, pageIndex, pageTitle) {
  const items = [];
  if (!question) return items;

  const questionName = String(question?.name || "").trim();
  if (!questionName) return items;

  const questionTitle = getQuestionTitle(question);
  const surveyRowsRaw = question?.survey?.getValue?.(questionName);
  const rows = Array.isArray(surveyRowsRaw) ? surveyRowsRaw : [];
  const columns = Array.isArray(question.columns) ? question.columns : [];
  const visibleRows = getMatrixVisibleRows(question);

  rows.forEach((rowDataRaw, rowIndex) => {
    const rowData = rowDataRaw && typeof rowDataRaw === "object" ? rowDataRaw : {};
    const visibleRow = visibleRows[rowIndex] || null;

    columns.forEach((column) => {
      const columnName = String(column?.name || "").trim();
      if (!columnName) return;

      const cellQuestion = getMatrixCellQuestion(visibleRow, columnName);
      const isVisible = cellQuestion ? cellQuestion.isVisible !== false : true;
      if (!isVisible) return;

      const cellValue = rowData?.[columnName];

      if (column?.isRequired && isBlankValue(cellValue)) {
        items.push({
          id: `matrix-required::${pageIndex}::${questionName}::${rowIndex}::${columnName}`,
          pageIndex,
          pageTitle,
          questionName,
          questionTitle,
          rowIndex: rowIndex + 1,
          columnName,
          message:
            String(column.requiredErrorText || "").trim() ||
            `${getMatrixColumnTitle(column)} moet nog ingevuld worden.`,
          kind: "required",
        });
      }
    });

    const voldoet = String(rowData?.voldoet ?? "").trim();
    const opmerking = String(rowData?.opmerking ?? "").trim();

    const opmerkingCell = getMatrixCellQuestion(visibleRow, "opmerking");
    const opmerkingVisible = opmerkingCell ? opmerkingCell.isVisible !== false : voldoet === "Nee";

    if (voldoet === "Nee" && opmerkingVisible && opmerking.length === 0) {
      items.push({
        id: `matrix-opmerking-bij-nee::${pageIndex}::${questionName}::${rowIndex}`,
        pageIndex,
        pageTitle,
        questionName,
        questionTitle,
        rowIndex: rowIndex + 1,
        columnName: "opmerking",
        message: "Geef een opmerking op omdat hier 'Nee' is gekozen.",
        kind: "rule",
      });
    }
  });

  return items;
}

export function syncMatrixQuestionVisualError(question) {
  if (!question || question?.getType?.() !== "matrixdynamic") return;

  const page = question.page;
  const visiblePages = Array.isArray(question?.survey?.visiblePages)
    ? question.survey.visiblePages
    : [];
  const pageIndex = Math.max(0, visiblePages.indexOf(page));
  const pageTitle = getPageTitle(page, pageIndex);

  const rowItems = buildMatrixRowValidationItems(question, pageIndex, pageTitle);

  question.clearErrors();

  if (rowItems.length > 0) {
    question.addError(new CustomError(rowItems[0].message));
  }
}

export function syncAllMatrixQuestionVisualErrors(model) {
  if (!model) return;

  const questions = model.getAllQuestions?.() || [];
  questions.forEach((question) => {
    if (question?.getType?.() === "matrixdynamic") {
      syncMatrixQuestionVisualError(question);
    }
  });
}

export function collectMatrixValidationSummary(model) {
  const items = [];
  const pages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];

  pages.forEach((page, pageIndex) => {
    const pageTitle = getPageTitle(page, pageIndex);
    const questions = Array.isArray(page?.questions) ? page.questions : [];

    questions.forEach((question) => {
      if (question?.getType?.() !== "matrixdynamic") return;
      if (!isQuestionBlocking(question)) return;

      items.push(...buildMatrixRowValidationItems(question, pageIndex, pageTitle));
    });
  });

  return items;
}

export function matrixHasAnyNee(rows) {
  if (!Array.isArray(rows)) return false;

  return rows.some((row) => {
    const voldoet = String(row?.voldoet ?? "").trim();
    return voldoet === "Nee";
  });
}

export function matrixHasNeeWithoutOpmerking(rows) {
  if (!Array.isArray(rows)) return false;

  return rows.some((row) => {
    const voldoet = String(row?.voldoet ?? "").trim();
    const opmerking = String(row?.opmerking ?? "").trim();
    return voldoet === "Nee" && opmerking.length === 0;
  });
}

export function collectConditionalAdviceValidationSummary(model) {
  if (!model) return [];

  const items = [];
  const pages = Array.isArray(model.visiblePages) ? model.visiblePages : [];

  pages.forEach((page, pageIndex) => {
    const pageTitle = getPageTitle(page, pageIndex);

    const bevindingenBRows = Array.isArray(model.getValue("bevindingen_b_items"))
      ? model.getValue("bevindingen_b_items")
      : [];

    const adviesBeheerderGebruiker = String(
      model.getValue("advies_beheerder_gebruiker") ?? ""
    ).trim();

    if (matrixHasAnyNee(bevindingenBRows) && adviesBeheerderGebruiker.length === 0) {
      items.push({
        id: `conditional-advice::${pageIndex}::advies_beheerder_gebruiker`,
        pageIndex,
        pageTitle,
        questionName: "advies_beheerder_gebruiker",
        questionTitle: "Advies voor beheerder/gebruiker",
        rowIndex: null,
        columnName: null,
        message: "Vul advies in als er één of meer items met 'Nee' zijn beoordeeld.",
        kind: "question",
      });
    }

    const aBeheerRows = Array.isArray(model.getValue("a_beheer_items"))
      ? model.getValue("a_beheer_items")
      : [];

    const adviesAanBeheerder = String(model.getValue("advies_aan_beheerder") ?? "").trim();

    if (matrixHasAnyNee(aBeheerRows) && adviesAanBeheerder.length === 0) {
      items.push({
        id: `conditional-advice::${pageIndex}::advies_aan_beheerder`,
        pageIndex,
        pageTitle,
        questionName: "advies_aan_beheerder",
        questionTitle: "Advies aan beheerder",
        rowIndex: null,
        columnName: null,
        message: "Vul advies in als er één of meer items met 'Nee' zijn beoordeeld.",
        kind: "question",
      });
    }
  });

  return items;
}

export function dedupeValidationSummary(items) {
  const map = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const key = [
      item.pageIndex ?? "",
      item.questionName ?? "",
      item.rowIndex ?? "",
      item.columnName ?? "",
      item.message ?? "",
    ].join("|");

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

export function collectValidationSummary(model) {
  if (!model) return [];

  const items = [];
  const pages = Array.isArray(model.visiblePages) ? model.visiblePages : [];

  pages.forEach((page, pageIndex) => {
    const pageTitle = getPageTitle(page, pageIndex);
    const questions = Array.isArray(page?.questions) ? page.questions : [];

    questions.forEach((question) => {
      if (!isQuestionBlocking(question)) return;
      if (question?.getType?.() === "matrixdynamic") return;

      const questionName = String(question?.name || "").trim();
      if (!questionName) return;

      const questionTitle = getQuestionTitle(question);
      const errors = Array.isArray(question?.errors) ? question.errors : [];

      errors.forEach((err, errIndex) => {
        const message = String(err?.text || err || "").trim();
        if (!message) return;

        items.push({
          id: `question-error::${pageIndex}::${questionName}::${errIndex}`,
          pageIndex,
          pageTitle,
          questionName,
          questionTitle,
          rowIndex: null,
          columnName: null,
          message,
          kind: "question",
        });
      });
    });
  });

  const matrixItems = collectMatrixValidationSummary(model);

  return dedupeValidationSummary([
    ...items,
    ...matrixItems,
  ]);
}