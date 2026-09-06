// src/pages/Forms/shared/validation.jsx

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

// Ook gebruikt door de renderer; een survey-core fout heeft de tekst niet altijd op .text
// staan, en zonder deze resolver rendert een veldfout als "[object Object]".
export function getValidationErrorText(error) {
  let resolvedText = null;

  if (typeof error?.getText === "function") {
    try {
      resolvedText = error.getText();
    } catch {
      resolvedText = null;
    }
  }

  const values = [
    error?.text,
    error?.locText?.renderedHtml,
    error?.locText?.text,
    resolvedText,
    error?.message,
    error,
  ];

  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }

    if (value && typeof value === "object") {
      const localized = [
        value.renderedHtml,
        value.text,
        value.default,
        value["nl-NL"],
        value.nl,
      ]
        .filter((candidate) => typeof candidate === "string" || typeof candidate === "number")
        .map((candidate) => String(candidate).trim())
        .find(Boolean);

      if (localized) return localized;
    }
  }

  return "Deze vraag bevat een ongeldige of ontbrekende waarde.";
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

function getMatrixRowValue(rowData, columns, preferredNames) {
  const matchingColumn = columns.find((column) =>
    preferredNames.includes(String(column?.name || "").trim().toLowerCase())
  );

  const matchingName = String(matchingColumn?.name || "").trim();
  const candidates = [matchingName, ...preferredNames].filter(Boolean);

  for (const name of candidates) {
    const value = rowData?.[name];
    if (!isBlankValue(value)) return String(value).trim();
  }

  return null;
}

function getMatrixRowIdentity(rowData, columns, rowIndex) {
  const questionNumber = getMatrixRowValue(rowData, columns, ["item_code", "nr", "code"]);
  const questionSubject = getMatrixRowValue(rowData, columns, ["onderwerp", "subject", "omschrijving", "title"]);

  return {
    questionNumber: questionNumber || String(rowIndex + 1),
    questionSubject,
  };
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
    const { questionNumber, questionSubject } = getMatrixRowIdentity(rowData, columns, rowIndex);

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
          questionNumber,
          questionSubject,
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
        questionNumber,
        questionSubject,
        rowIndex: rowIndex + 1,
        columnName: "opmerking",
        message: "Geef een opmerking op omdat hier 'Nee' is gekozen.",
        kind: "rule",
      });
    }
  });

  return items;
}

// Matrixfouten worden niet via question.errors getoond maar via de validatiesamenvatting;
// SurveyJS-validators op matrices worden bij het bouwen al gestript. Deze helper haalt
// daarom alleen de resterende SurveyJS-fouten weg zodat er geen dubbele melding staat.
export function syncMatrixQuestionVisualError(question) {
  if (!question || question?.getType?.() !== "matrixdynamic") return;

  question.clearErrors();
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

function parseVergelijkbaarGetal(waarde) {
  if (waarde === null || waarde === undefined || waarde === "") return null;

  const getal = Number(String(waarde).replace(",", "."));
  return Number.isFinite(getal) ? getal : null;
}

function vergelijkingGeldt(operator, links, rechts) {
  if (links === null || rechts === null) return false;

  switch (String(operator || "").trim().toLowerCase()) {
    case "lt":
      return links < rechts;
    case "lte":
      return links <= rechts;
    case "gt":
      return links > rechts;
    case "gte":
      return links >= rechts;
    case "ne":
      return links !== rechts;
    case "eq":
      return links === rechts;
    default:
      return false;
  }
}

// Consistentieregels uit de formulierdefinitie, als "ember": { "consistency": [ ... ] }.
// Een regel stelt een feit vast door twee antwoorden te vergelijken en eist dan een
// bepaald antwoord in een matrixregel. Zo blijft de vaststelling bij het systeem en het
// oordeel bij de invuller, terwijl het rapport zichzelf niet kan tegenspreken.
//
//   { "id": "a2-beschikbaarheid",
//     "compare": { "field": "...geconstateerd", "operator": "lt", "otherField": "...pve" },
//     "highlight": ["...geconstateerd"],
//     "require": { "matrix": "a_beheer_items", "matchColumn": "item_code",
//                  "matchValue": "A2", "column": "voldoet", "equals": "Nee" },
//     "message": "..." }
export function evaluateConsistencyRules(model, surveyDefinition) {
  const regels = surveyDefinition?.ember?.consistency;
  const leeg = { items: [], highlightQuestions: new Set() };

  if (!model || !Array.isArray(regels) || regels.length === 0) return leeg;

  const items = [];
  const highlightQuestions = new Set();
  const pages = Array.isArray(model.visiblePages) ? model.visiblePages : [];

  regels.forEach((regel, regelIndex) => {
    const links = parseVergelijkbaarGetal(model.getValue?.(regel?.compare?.field));
    const rechts = parseVergelijkbaarGetal(model.getValue?.(regel?.compare?.otherField));

    if (!vergelijkingGeldt(regel?.compare?.operator, links, rechts)) return;

    (Array.isArray(regel?.highlight) ? regel.highlight : []).forEach((naam) => {
      const schoon = String(naam || "").trim();
      if (schoon) highlightQuestions.add(schoon);
    });

    const eis = regel?.require;
    const matrixNaam = String(eis?.matrix || "").trim();
    if (!matrixNaam) return;

    const rijen = Array.isArray(model.getValue?.(matrixNaam)) ? model.getValue(matrixNaam) : [];
    const matchKolom = String(eis?.matchColumn || "").trim();
    const matchWaarde = String(eis?.matchValue ?? "").trim();
    const kolom = String(eis?.column || "").trim();
    const verwacht = String(eis?.equals ?? "").trim();

    const rijIndex = matchKolom
      ? rijen.findIndex((rij) => String(rij?.[matchKolom] ?? "").trim() === matchWaarde)
      : 0;

    if (rijIndex < 0) return;

    const huidig = String(rijen[rijIndex]?.[kolom] ?? "").trim();
    if (huidig === verwacht) return;

    const matrixQuestion = model.getQuestionByName?.(matrixNaam) || null;
    const page = matrixQuestion?.page || null;
    const pageIndex = page ? pages.indexOf(page) : -1;

    items.push({
      id: `consistency::${regel?.id || regelIndex}`,
      pageIndex: pageIndex >= 0 ? pageIndex : 0,
      pageTitle: getPageTitle(page, pageIndex >= 0 ? pageIndex : 0),
      questionName: matrixNaam,
      questionTitle: getQuestionTitle(matrixQuestion),
      questionNumber: matchWaarde || null,
      questionSubject: null,
      rowIndex: rijIndex + 1,
      columnName: kolom,
      message:
        String(regel?.message || "").trim() ||
        `Deze regel moet op '${verwacht}' staan op basis van de berekende waarden.`,
      kind: "consistency",
    });
  });

  return { items, highlightQuestions };
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

export function collectValidationSummary(model, surveyDefinition = null) {
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
        const message = getValidationErrorText(err);

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
  const consistencyItems = evaluateConsistencyRules(model, surveyDefinition).items;

  return dedupeValidationSummary([
    ...items,
    ...matrixItems,
    ...consistencyItems,
  ]);
}
