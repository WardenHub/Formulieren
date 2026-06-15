// src/pages/Forms/shared/runtimeBehaviors.jsx

import { createRoot } from "react-dom/client";

import { CircleHelpIcon } from "@/components/ui/circle-help";

import {
  toNumberOrNull,
  formatMaybeNumber,
  computeEffectiveAh,
  computeRequiredAh,
  buildBrandTypeMap,
  valuesEqualLoose,
  computeHoursBetween,
  computeMeldurenNietBeschikbaar,
  sumAvailabilityMelduren,
  sumAantalMeldersFromPerformanceRows,
  computeGeconstateerdeSysteembeschikbaarheid,
} from "./calculations.jsx";

import {
  syncAllMatrixQuestionVisualErrors,
  collectValidationSummary,
} from "./validation.jsx";

function queryQuestionRoot(name) {
  const escaped =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(String(name || ""))
      : String(name || "");

  if (!escaped) return null;
  return document.querySelector(`[data-name="${escaped}"]`);
}

function normalizeGuidanceQuestionName(value) {
  return String(value || "").trim();
}

function normalizeGuidanceMatrixRowKey(value) {
  return String(value || "").trim();
}

function buildMatrixGuidanceLookupKey(questionName, matrixRowKey) {
  const cleanQuestionName = normalizeGuidanceQuestionName(questionName);
  const cleanMatrixRowKey = normalizeGuidanceMatrixRowKey(matrixRowKey);
  if (!cleanQuestionName || !cleanMatrixRowKey) return "";
  return `${cleanQuestionName}::${cleanMatrixRowKey}`;
}

function getQuestionTitleText(question) {
  return String(
    question?.fullTitle ||
      question?.title ||
      question?.locTitle?.renderedHtml ||
      question?.name ||
      "Vraag"
  ).trim();
}

function getQuestionGuidanceItems(guidanceByQuestion, questionName) {
  const key = normalizeGuidanceQuestionName(questionName);
  if (!key) return [];
  const items = guidanceByQuestion?.[key];
  return Array.isArray(items) ? items : [];
}

function getMatrixRowGuidanceItems(guidanceByMatrixRow, questionName, matrixRowKey) {
  const lookupKey = buildMatrixGuidanceLookupKey(questionName, matrixRowKey);
  if (!lookupKey) return [];
  const items = guidanceByMatrixRow?.[lookupKey];
  return Array.isArray(items) ? items : [];
}

function getQuestionGuidanceAnchor(questionRoot) {
  if (!questionRoot) return null;

  return (
    questionRoot.querySelector(".sd-question__header") ||
    questionRoot.querySelector(".sd-question__title") ||
    questionRoot.querySelector(".sd-element__title") ||
    questionRoot.querySelector(".sd-question__content") ||
    questionRoot
  );
}

function isDropdownQuestion(question) {
  return String(question?.getType?.() || question?.jsonObj?.type || "").trim() === "dropdown";
}

function getDropdownAnchorElement(questionRoot) {
  if (!questionRoot) return null;

  return (
    questionRoot.querySelector(".sd-dropdown") ||
    questionRoot.querySelector(".sd-dropdown__value") ||
    questionRoot.querySelector(".sd-input") ||
    questionRoot
  );
}

function getPopupRootElement() {
  const candidates = Array.from(
    document.querySelectorAll(
      ".sv-popup--menu-phone, .sv-popup--menu-tablet, .sv-popup, .sd-dropdown__popup"
    )
  );

  return (
    candidates.find((el) => {
      if (!(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }) || null
  );
}

function getPopupContainerElement(popupRoot) {
  if (!popupRoot) return null;
  return popupRoot.querySelector(":scope > .sv-popup__container") || popupRoot;
}

function positionDropdownPopupUnderAnchor(popupRoot, anchorEl) {
  if (!popupRoot || !anchorEl) return false;

  const container = getPopupContainerElement(popupRoot);
  if (!container) return false;

  const rect = anchorEl.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  const gap = 6;
  const sidePadding = 16;
  const preferredWidth = Math.max(360, Math.round(rect.width), Math.round(viewportWidth * 0.22));
  const maxWidth = Math.min(760, viewportWidth - sidePadding * 2);
  const width = Math.max(320, Math.min(preferredWidth, maxWidth));

  let left = Math.round(rect.left);
  let top = Math.round(rect.bottom + gap);

  if (left + width > viewportWidth - sidePadding) {
    left = Math.max(sidePadding, viewportWidth - sidePadding - width);
  }

  if (left < sidePadding) {
    left = sidePadding;
  }

  const maxHeight = Math.max(220, viewportHeight - top - sidePadding);

  if (maxHeight < 220) {
    top = Math.max(
      sidePadding,
      Math.round(rect.top - Math.min(420, viewportHeight - sidePadding * 2))
    );
  }

  popupRoot.classList.add("ember-dropdown-popup-inline");

  popupRoot.style.position = "fixed";
  popupRoot.style.left = `${left}px`;
  popupRoot.style.top = `${top}px`;
  popupRoot.style.right = "auto";
  popupRoot.style.bottom = "auto";
  popupRoot.style.inset = "auto";
  popupRoot.style.transform = "none";
  popupRoot.style.margin = "0";
  popupRoot.style.width = `${width}px`;
  popupRoot.style.maxWidth = `${width}px`;
  popupRoot.style.height = "auto";
  popupRoot.style.display = "block";
  popupRoot.style.zIndex = "1200";

  container.style.width = "100%";
  container.style.maxWidth = "100%";
  container.style.maxHeight = `${Math.min(420, maxHeight)}px`;
  container.style.overflow = "hidden";
  container.style.minWidth = `${width}px`;

  return true;
}

function normalizeAnswerText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(".", "")
    .replaceAll(" ", "")
    .replaceAll("-", "")
    .replaceAll("_", "");
}

function getAnswerItemText(item) {
  if (!item) return "";

  return (
    item.querySelector(".sd-item__control-label")?.textContent ||
    item.querySelector(".sd-radio__control-label")?.textContent ||
    item.querySelector(".sd-checkbox__control-label")?.textContent ||
    item.querySelector(".sd-item__text")?.textContent ||
    item.textContent ||
    ""
  );
}

function applyAnswerItemClasses(root) {
  if (!root) return;

  const items = root.querySelectorAll(
    ".sd-selectbase .sd-item, .sd-selectbase .sd-radio, .sd-selectbase .sd-checkbox"
  );

  items.forEach((item) => {
    item.classList.remove("ember-answer-ja", "ember-answer-nee", "ember-answer-nvt");

    const normalized = normalizeAnswerText(getAnswerItemText(item));

    if (normalized === "ja") {
      item.classList.add("ember-answer-ja");
      return;
    }

    if (normalized === "nee") {
      item.classList.add("ember-answer-nee");
      return;
    }

    if (
      normalized === "nvt" ||
      normalized === "nvtn" ||
      normalized === "nietvantoepassing"
    ) {
      item.classList.add("ember-answer-nvt");
    }
  });
}

function applyAllAnswerItemClasses(model) {
  const root =
    document.querySelector(".sd-root-modern") ||
    document.querySelector(".sd-root") ||
    document.body;

  applyAnswerItemClasses(root);

  const questions = model?.getAllQuestions?.() || [];
  questions.forEach((question) => {
    const name = String(question?.name || "").trim();
    if (!name) return;
    applyAnswerItemClasses(queryQuestionRoot(name));
  });
}


function normalizeMatrixColumnName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

function getMatrixColumns(question) {
  const cols = question?.visibleColumns || question?.columns || question?.columnsValue || [];
  if (!Array.isArray(cols)) return [];

  return cols
    .map((col, index) => ({
      index,
      name: normalizeMatrixColumnName(col?.name || col?.valueName || col?.title || ""),
      cellType: String(col?.cellType || col?.getType?.() || "").trim().toLowerCase(),
      readOnly: col?.readOnly === true,
      hasReadOnlyIf: Boolean(col?.readOnlyIf),
    }))
    .filter((col) => col.name);
}

function isReadOnlyControl(control) {
  if (!control) return false;

  return (
    control.readOnly === true ||
    control.disabled === true ||
    control.hasAttribute("readonly") ||
    control.hasAttribute("disabled") ||
    control.getAttribute("aria-readonly") === "true" ||
    control.getAttribute("aria-disabled") === "true" ||
    control.classList?.contains("sd-input--readonly") ||
    control.classList?.contains("sd-input--disabled") ||
    Boolean(control.closest?.(".sd-question--readonly, .sd-question--disabled, .sd-row--readonly"))
  );
}

function getControlDisplayValue(control) {
  if (!control) return "";

  if (control.tagName === "SELECT") {
    const selected = control.options?.[control.selectedIndex];
    return String(selected?.text || control.value || "").trim();
  }

  const value = String(control.value || control.getAttribute("value") || "").trim();
  if (value) return value;

  return String(control.textContent || "").trim();
}

function getMatrixQuestionRows(question) {
  const fromValue = Array.isArray(question?.value) ? question.value : null;
  if (fromValue) return fromValue;

  const surveyValue = question?.survey?.getValue?.(question?.name);
  if (Array.isArray(surveyValue)) return surveyValue;

  if (Array.isArray(question?.defaultValue)) return question.defaultValue;
  return [];
}

function getMatrixQuestionDefaultRows(question) {
  if (Array.isArray(question?.defaultValue)) return question.defaultValue;
  if (Array.isArray(question?.jsonObj?.defaultValue)) return question.jsonObj.defaultValue;
  return [];
}

function resolveMatrixRowGuidanceKey(rowData, defaultRowData, rowIndex) {
  const candidates = [
    rowData?.item_code,
    rowData?.itemCode,
    rowData?.nr,
    rowData?.code,
    defaultRowData?.item_code,
    defaultRowData?.itemCode,
    defaultRowData?.nr,
    defaultRowData?.code,
    rowData?.onderwerp,
    rowData?.title,
    defaultRowData?.onderwerp,
    defaultRowData?.title,
    rowIndex != null ? String(Number(rowIndex) + 1) : "",
  ];

  for (const candidate of candidates) {
    const normalized = normalizeGuidanceMatrixRowKey(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function resolveMatrixRowGuidanceLabel(rowData, defaultRowData, rowIndex) {
  const codeCandidates = [
    rowData?.item_code,
    rowData?.itemCode,
    rowData?.nr,
    rowData?.code,
    defaultRowData?.item_code,
    defaultRowData?.itemCode,
    defaultRowData?.nr,
    defaultRowData?.code,
  ];

  const titleCandidates = [
    rowData?.onderwerp,
    rowData?.title,
    rowData?.omschrijving,
    defaultRowData?.onderwerp,
    defaultRowData?.title,
    defaultRowData?.omschrijving,
  ];

  const code = codeCandidates
    .map((candidate) => String(candidate || "").trim())
    .find(Boolean);

  const title = titleCandidates
    .map((candidate) => String(candidate || "").trim())
    .find(Boolean);

  return [code, title || `Regel ${Number(rowIndex) + 1}`].filter(Boolean).join(" ; ");
}

function isEmptyMatrixWithoutAdd(question, rows) {
  const allowAddRows = question?.allowAddRows === true || question?.jsonObj?.allowAddRows === true;
  return !allowAddRows && Array.isArray(rows) && rows.length === 0;
}

function ensureMatrixDisplayText(cell, text, className = "ember-matrix-readonly-text") {
  if (!cell) return;

  const normalized = String(text || "").trim();
  if (!normalized) return;

  const control =
    cell.querySelector("input") ||
    cell.querySelector("textarea") ||
    cell.querySelector(".sd-input");

  if (control) {
    control.classList.add("ember-matrix-hidden-readonly-control");
  }

  let display = cell.querySelector(`:scope > .${className}`);
  if (!display) {
    display = document.createElement("div");
    display.className = className;
    cell.appendChild(display);
  }

  let label = display.querySelector(":scope > .ember-matrix-readonly-text__label");
  if (!label) {
    const existingButton = display.querySelector(":scope > .ember-matrix-row-guidance-btn");
    display.textContent = "";
    if (existingButton) display.appendChild(existingButton);
    label = document.createElement("span");
    label.className = "ember-matrix-readonly-text__label";
    display.appendChild(label);
  }

  label.textContent = normalized;
  display.title = normalized;
}

function ensureReadonlyTopicText(cell) {
  if (!cell) return;

  const control =
    cell.querySelector("input") ||
    cell.querySelector("textarea") ||
    cell.querySelector(".sd-input");

  if (!control || !isReadOnlyControl(control)) return;

  const text = getControlDisplayValue(control);
  ensureMatrixDisplayText(cell, text);
}

function ensureFixedTopicText(cell, rowData, defaultRowData, col) {
  if (!cell || col?.name !== "onderwerp") return;

  const defaultText = String(defaultRowData?.[col.name] || "").trim();
  const valueText = String(rowData?.[col.name] || "").trim();

  if (defaultText) {
    ensureMatrixDisplayText(cell, valueText || defaultText);
    return;
  }

  ensureReadonlyTopicText(cell);
}

function ensureMatrixHeaderCellContent(cell) {
  if (!cell) return;
  const isHeaderCell = cell.tagName === "TH" || cell.classList.contains("sd-table__cell--header");
  if (!isHeaderCell) return;

  let label = cell.querySelector(":scope > .ember-matrix-header-label");
  if (label) return;

  label = document.createElement("div");
  label.className = "ember-matrix-header-label";

  Array.from(cell.childNodes).forEach((node) => {
    const isEmptyText = node.nodeType === Node.TEXT_NODE && !String(node.textContent || "").trim();
    if (!isEmptyText) label.appendChild(node);
  });

  cell.appendChild(label);
}

function classifyMatrixCell(cell, col, rowData, defaultRowData) {
  if (!cell || !col?.name) return;

  cell.dataset.emberMatrixCol = col.name;
  cell.classList.add("ember-matrix-col", `ember-matrix-col--${col.name}`);

  if (col.cellType) {
    cell.dataset.emberMatrixType = col.cellType;
    cell.classList.add(`ember-matrix-type--${col.cellType}`);
  }

  if (col.name === "onderwerp") {
    ensureFixedTopicText(cell, rowData, defaultRowData, col);
  }

  ensureMatrixHeaderCellContent(cell);
}

function getMatrixDataCells(row) {
  if (!row) return [];
  return Array.from(row.querySelectorAll(":scope > th, :scope > td"));
}

function getMatrixColumnTrack(col) {
  const name = String(col?.name || "").toLowerCase();
  const type = String(col?.cellType || "").toLowerCase();

  if (name === "item_code" || name === "nr") return "86px";
  if (name === "onderwerp" || name === "titel" || name === "title") return "minmax(260px, 1.2fr)";
  if (name === "voldoet") return "minmax(300px, 0.82fr)";
  if (name === "opmerking" || type === "comment") return "minmax(320px, 1.12fr)";
  if (name.includes("document")) return "minmax(190px, 0.9fr)";
  if (name.includes("datum") || name.includes("date")) return "minmax(140px, 0.65fr)";
  if (name.includes("revisie") || name.includes("revision") || name.includes("rev")) return "minmax(120px, 0.55fr)";
  if (type === "dropdown") return "minmax(180px, 1fr)";

  return "minmax(150px, 1fr)";
}

function applyMatrixGridTemplate(root, columns) {
  if (!root || !Array.isArray(columns) || columns.length === 0) return;

  const template = columns.map(getMatrixColumnTrack).join(" ");
  root.style.setProperty("--ember-matrix-grid-template", template);
  root.style.setProperty("--ember-matrix-col-count", String(columns.length));
  root.classList.add("ember-matrix-runtime--grid");
}

function removeMatrixColGroup(root) {
  if (!root) return;
  root
    .querySelectorAll("colgroup[data-ember-matrix-colgroup]")
    .forEach((colgroup) => colgroup.remove());
}

function hasMatrixRowGuidanceForQuestion(guidanceByMatrixRow, questionName) {
  const cleanQuestionName = normalizeGuidanceQuestionName(questionName);
  if (!cleanQuestionName || !guidanceByMatrixRow || typeof guidanceByMatrixRow !== "object") return false;

  const prefix = `${cleanQuestionName}::`;
  return Object.entries(guidanceByMatrixRow).some(
    ([key, items]) => String(key || "").startsWith(prefix) && Array.isArray(items) && items.length > 0
  );
}

function unmountMatrixGuidanceButton(button, guidanceReactRoots) {
  if (button?._emberReactRoot) {
    button._emberReactRoot.unmount();
    guidanceReactRoots?.delete?.(button._emberReactRoot);
  }
  button?.remove();
}

function clearMatrixGuidanceButtons(cell, guidanceReactRoots) {
  if (!cell) return;
  cell
    .querySelectorAll(".ember-matrix-row-guidance-btn")
    .forEach((button) => unmountMatrixGuidanceButton(button, guidanceReactRoots));
  cell.classList.remove("ember-matrix-guidance-cell");
  cell
    .querySelectorAll(".ember-matrix-readonly-text--with-guidance")
    .forEach((element) => element.classList.remove("ember-matrix-readonly-text--with-guidance"));
}

function removeMatrixGuidanceColumnCell(row, guidanceReactRoots) {
  const cell = row?.querySelector(":scope > .ember-matrix-guidance-col");
  if (!cell) return;
  clearMatrixGuidanceButtons(cell, guidanceReactRoots);
  cell.remove();
}

function ensureMatrixRowGuidanceButton({
  question,
  rowCells,
  columns,
  rowData,
  defaultRowData,
  rowIndex,
  guidanceByMatrixRow,
  onOpenQuestionGuidance,
  guidanceReactRoots,
}) {
  if (!question) return;

  const questionName = normalizeGuidanceQuestionName(question?.name);
  const matrixRowKey = resolveMatrixRowGuidanceKey(rowData, defaultRowData, rowIndex);
  const guidanceItems = getMatrixRowGuidanceItems(guidanceByMatrixRow, questionName, matrixRowKey);

  const topicIndex = columns.findIndex((col) => col?.name === "onderwerp");
  const numberIndex = columns.findIndex((col) => col?.name === "item_code" || col?.name === "nr");
  const anchorIndex = topicIndex >= 0 ? topicIndex : numberIndex >= 0 ? numberIndex : 0;
  const fallbackAnchorCell = Array.isArray(rowCells) ? rowCells[anchorIndex] : null;
  const buttonCell = fallbackAnchorCell;
  if (!buttonCell) return;

  if (Array.isArray(rowCells)) {
    rowCells.forEach((cell) => {
      if (cell !== buttonCell) clearMatrixGuidanceButtons(cell, guidanceReactRoots);
    });
  }

  const existingButton = buttonCell.querySelector(".ember-matrix-row-guidance-btn");

  if (guidanceItems.length === 0) {
    unmountMatrixGuidanceButton(existingButton, guidanceReactRoots);
    buttonCell.classList.remove("ember-matrix-guidance-cell");
    buttonCell
      .querySelectorAll(".ember-matrix-readonly-text--with-guidance")
      .forEach((element) => element.classList.remove("ember-matrix-readonly-text--with-guidance"));
    return;
  }

  buttonCell.classList.add("ember-matrix-guidance-cell");
  const display = buttonCell.querySelector(":scope > .ember-matrix-readonly-text");
  const buttonHost = buttonCell;
  if (display) display.classList.remove("ember-matrix-readonly-text--with-guidance");

  let button = existingButton;
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "ember-matrix-row-guidance-btn";
    button.setAttribute("aria-label", "Toon uitleg bij deze matrixregel");

    const iconMount = document.createElement("span");
    iconMount.className = "ember-matrix-row-guidance-btn__icon";
    button.appendChild(iconMount);

    const root = createRoot(iconMount);
    root.render(<CircleHelpIcon size={16} className="nav-anim-icon" />);
    button._emberReactRoot = root;
    guidanceReactRoots?.add?.(root);

    buttonCell.appendChild(button);
  }

  button
    .querySelectorAll(".ember-matrix-row-guidance-btn__text")
    .forEach((element) => element.remove());

  if (button.parentElement !== buttonHost) {
    buttonHost.appendChild(button);
  }

  const matrixRowLabel = resolveMatrixRowGuidanceLabel(rowData, defaultRowData, rowIndex);

  button.title =
    guidanceItems.length > 1
      ? `${guidanceItems.length} uitlegitems beschikbaar`
      : "Uitleg beschikbaar";

  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenQuestionGuidance?.({
      questionName,
      questionTitle: matrixRowLabel || getQuestionTitleText(question),
      matrixRowKey,
      matrixRowLabel,
      items: guidanceItems,
    });
  };
}

function applyMatrixColumnAttributes(
  question,
  htmlElement,
  guidanceByMatrixRow = null,
  onOpenQuestionGuidance,
  guidanceReactRoots
) {
  if (!question || !htmlElement) return;

  const type = String(question?.getType?.() || question?.jsonObj?.type || "").trim();
  if (type !== "matrixdynamic") return;

  const columns = getMatrixColumns(question);
  if (!columns.length) return;

  const root = htmlElement;
  const names = new Set(columns.map((col) => col.name));
  const rowsValue = getMatrixQuestionRows(question);
  const defaultRows = getMatrixQuestionDefaultRows(question);
  const hasGuidanceColumn = hasMatrixRowGuidanceForQuestion(guidanceByMatrixRow, question?.name);

  root.classList.add("ember-matrix-runtime");
  root.classList.toggle("ember-matrix-runtime--has-guidance", hasGuidanceColumn);

  applyMatrixGridTemplate(root, columns);
  removeMatrixColGroup(root);

  if (isEmptyMatrixWithoutAdd(question, rowsValue)) {
    root.classList.add("ember-matrix-runtime--empty-readonly");
  } else {
    root.classList.remove("ember-matrix-runtime--empty-readonly");
  }

  if (names.has("item_code") || names.has("nr")) root.classList.add("ember-matrix-runtime--has-nr");
  if (names.has("onderwerp")) root.classList.add("ember-matrix-runtime--has-topic");
  if (names.has("voldoet")) root.classList.add("ember-matrix-runtime--has-voldoet");
  if (names.has("opmerking")) root.classList.add("ember-matrix-runtime--has-opmerking");

  if ((names.has("item_code") || names.has("nr")) && names.has("onderwerp") && names.has("voldoet")) {
    root.classList.add("ember-matrix-runtime--assessment");
  }

  if (columns.length >= 7 && rowsValue.length > 0) root.classList.add("ember-matrix-runtime--wide");
  if (columns.some((col) => col.cellType === "dropdown")) root.classList.add("ember-matrix-runtime--has-dropdown");

  let bodyRowIndex = 0;
  const tableRows = root.querySelectorAll("tr");
  tableRows.forEach((row) => {
    removeMatrixGuidanceColumnCell(row, guidanceReactRoots);

    const cells = getMatrixDataCells(row);
    if (!cells.length) return;

    const isHeaderRow = cells.some((cell) => cell.tagName === "TH") || row.closest("thead");
    const rowData = isHeaderRow ? null : rowsValue[bodyRowIndex] || null;
    const defaultRowData = isHeaderRow ? null : defaultRows[bodyRowIndex] || null;

    columns.forEach((col, index) => classifyMatrixCell(cells[index], col, rowData, defaultRowData));

    if (!isHeaderRow) {
      ensureMatrixRowGuidanceButton({
        question,
        rowCells: cells,
        columns,
        rowData,
        defaultRowData,
        rowIndex: bodyRowIndex,
        guidanceByMatrixRow,
        onOpenQuestionGuidance,
        guidanceReactRoots,
      });
    }

    if (!isHeaderRow) bodyRowIndex += 1;
  });
}

function applyAllMatrixLayoutClasses(
  model,
  guidanceByMatrixRow = null,
  onOpenQuestionGuidance,
  guidanceReactRoots
) {
  const questions = model?.getAllQuestions?.() || [];

  questions.forEach((question) => {
    if (String(question?.getType?.() || question?.jsonObj?.type || "").trim() !== "matrixdynamic") return;

    const name = String(question?.name || "").trim();
    if (!name) return;

    const root = queryQuestionRoot(name);
    if (!root) return;

    applyMatrixColumnAttributes(
      question,
      root,
      guidanceByMatrixRow,
      onOpenQuestionGuidance,
      guidanceReactRoots
    );
  });
}

function syncValidationVisualsOnlyWhenActivated(model, validationActivatedRef) {
  if (!validationActivatedRef?.current) return;
  syncAllMatrixQuestionVisualErrors(model, true);
}

export function applyCapWarnings(model) {
  if (!model) return;

  const matrixRoot = queryQuestionRoot("es_regels");
  if (!matrixRoot) return;

  const rows = Array.isArray(model.getValue("es_regels")) ? model.getValue("es_regels") : [];
  const trList = matrixRoot.querySelectorAll("tbody tr");

  trList.forEach((tr, rowIndex) => {
    const row = rows[rowIndex];
    if (!row || typeof row !== "object") return;

    const aanwezige = toNumberOrNull(row.es_effectieve_ah);
    const benodigd = toNumberOrNull(row.es_benodigd_ah);

    const shouldWarn =
      aanwezige !== null &&
      benodigd !== null &&
      aanwezige < benodigd;

    const cells = tr.querySelectorAll("td");
    const aanwezigeCell = cells[5];
    const benodigdCell = cells[8];

    if (aanwezigeCell) {
      aanwezigeCell.classList.toggle("ember-cap-too-low", shouldWarn);
    }

    if (benodigdCell) {
      benodigdCell.classList.toggle("ember-cap-too-low", shouldWarn);
    }
  });
}

export function applyAvailabilityWarnings(model) {
  if (!model) return;

  const geconstateerd = toNumberOrNull(model.getValue("a2_systeembeschikbaarheid_geconstateerd"));
  const pve = toNumberOrNull(model.getValue("a2_systeembeschikbaarheid_pve"));

  const shouldWarn =
    geconstateerd !== null &&
    pve !== null &&
    geconstateerd < pve;

  const root = queryQuestionRoot("a2_systeembeschikbaarheid_geconstateerd");
  if (!root) return;

  root.classList.toggle("ember-availability-too-low", shouldWarn);
}

export function normalizeEnergyRows(model, prefillPayload, energyAutoStateRef) {
  if (!model) return;

  const rows = Array.isArray(model.getValue("es_regels")) ? model.getValue("es_regels") : [];
  if (!rows.length) return;

  const agingFactor = model.getValue("es_verouderingsfactor");
  const brandTypeMap = buildBrandTypeMap(prefillPayload);

  let changed = false;

  const nextRows = rows.map((r, rowIndex) => {
    const row = r && typeof r === "object" ? { ...r } : {};
    const stateKey = String(rowIndex);

    const prevState = energyAutoStateRef.current[stateKey] || {
      lastMerkType: null,
      autoCapaciteitAh: null,
      autoEffectieveAh: null,
    };

    const nextState = { ...prevState };

    const merkType = row.es_merk_type ? String(row.es_merk_type) : "";
    const brand = merkType ? brandTypeMap.get(merkType) : null;
    const merkTypeChanged = prevState.lastMerkType !== merkType;

    if (brand?.default_capacity_ah != null) {
      const defaultCap = formatMaybeNumber(brand.default_capacity_ah, 3);
      const currentCap = toNumberOrNull(row.es_capaciteit_ah);

      if (merkTypeChanged || currentCap === null) {
        if (!valuesEqualLoose(row.es_capaciteit_ah, defaultCap)) {
          row.es_capaciteit_ah = defaultCap;
          changed = true;
        }

        nextState.autoCapaciteitAh = defaultCap;
      }
    }

    const computedEffectiveAh = formatMaybeNumber(
      computeEffectiveAh(row.es_capaciteit_ah, row.es_aantal, row.es_schakeling),
      3
    );

    const currentEffective = row.es_effectieve_ah;
    const effectiveIsEmpty = toNumberOrNull(currentEffective) === null;
    const effectiveStillAuto =
      prevState.autoEffectieveAh != null &&
      valuesEqualLoose(currentEffective, prevState.autoEffectieveAh);

    if (effectiveIsEmpty || effectiveStillAuto || merkTypeChanged) {
      if (!valuesEqualLoose(currentEffective, computedEffectiveAh)) {
        row.es_effectieve_ah = computedEffectiveAh;
        changed = true;
      }

      nextState.autoEffectieveAh = computedEffectiveAh;
    }

    const requiredAh = formatMaybeNumber(
      computeRequiredAh(
        row.es_ruststroom_ma,
        row.es_alarmstroom_ma,
        row.es_overbrugging_uren,
        agingFactor
      ),
      3
    );

    if (!valuesEqualLoose(row.es_benodigd_ah, requiredAh)) {
      row.es_benodigd_ah = requiredAh;
      changed = true;
    }

    nextState.lastMerkType = merkType;
    energyAutoStateRef.current[stateKey] = nextState;

    return row;
  });

  if (changed) {
    model.setValue("es_regels", nextRows);
  } else {
    requestAnimationFrame(() => {
      applyCapWarnings(model);
    });
  }
}

export function normalizeAvailabilityRows(model, availabilityAutoStateRef) {
  if (!model) return;

  const rows = Array.isArray(model.getValue("a2_buitenbedrijfstellingen"))
    ? model.getValue("a2_buitenbedrijfstellingen")
    : [];

  const perfRows = Array.isArray(model.getValue("performance_data_view"))
    ? model.getValue("performance_data_view")
    : [];

  let changed = false;

  const nextRows = rows.map((r, rowIndex) => {
    const row = r && typeof r === "object" ? { ...r } : {};
    const stateKey = String(rowIndex);

    const prevState = availabilityAutoStateRef.current[stateKey] || {};
    availabilityAutoStateRef.current[stateKey] = { ...prevState };

    const urenPerDag = formatMaybeNumber(
      computeHoursBetween(row.tijd_begin, row.tijd_einde),
      3
    );

    if (!valuesEqualLoose(row.uren_pd_niet_beschikbaar, urenPerDag)) {
      row.uren_pd_niet_beschikbaar = urenPerDag;
      changed = true;
    }

    const meldurenNietBeschikbaar = formatMaybeNumber(
      computeMeldurenNietBeschikbaar(
        row.uren_pd_niet_beschikbaar,
        row.melders_niet_beschikbaar,
        row.tijdsduur_dagen
      ),
      3
    );

    if (!valuesEqualLoose(row.melduren_niet_beschikbaar, meldurenNietBeschikbaar)) {
      row.melduren_niet_beschikbaar = meldurenNietBeschikbaar;
      changed = true;
    }

    return row;
  });

  const totaalMeldurenBuitenWerking = sumAvailabilityMelduren(nextRows);
  const totaalAantalMelders = sumAantalMeldersFromPerformanceRows(perfRows);
  const geconstateerd = computeGeconstateerdeSysteembeschikbaarheid(
    totaalAantalMelders,
    totaalMeldurenBuitenWerking
  );

  if (changed) {
    model.setValue("a2_buitenbedrijfstellingen", nextRows);
    return;
  }

  if (!valuesEqualLoose(model.getValue("a2_melduren_buiten_werking"), totaalMeldurenBuitenWerking)) {
    model.setValue("a2_melduren_buiten_werking", totaalMeldurenBuitenWerking);
  }

  if (!valuesEqualLoose(model.getValue("a2_aantal_melders"), totaalAantalMelders)) {
    model.setValue("a2_aantal_melders", totaalAantalMelders);
  }

  if (!valuesEqualLoose(model.getValue("a2_systeembeschikbaarheid_geconstateerd"), geconstateerd)) {
    model.setValue("a2_systeembeschikbaarheid_geconstateerd", geconstateerd);
  }

  const a2Rows = Array.isArray(model.getValue("a2_items")) ? model.getValue("a2_items") : [];
  if (a2Rows.length > 0) {
    const nextA2Rows = a2Rows.map((row, idx) => {
      if (idx !== 0) return row;

      const rr = row && typeof row === "object" ? { ...row } : {};
      rr.eis = "NEN 2535:1996 & 2009 §4.4";
      return rr;
    });

    if (JSON.stringify(nextA2Rows) !== JSON.stringify(a2Rows)) {
      model.setValue("a2_items", nextA2Rows);
    }
  }

  requestAnimationFrame(() => {
    applyAvailabilityWarnings(model);
  });
}

export function attachRuntimeBehaviors({
  model,
  prefillPayload,
  energyAutoStateRef,
  availabilityAutoStateRef,
  validationActivatedRef,
  suppressDirtyRef,
  onAnswersSnapshotChange,
  onValidationSummaryChange,
  guidanceByQuestion = null,
  guidanceByMatrixRow = null,
  onOpenQuestionGuidance,
}) {
  if (!model) return () => {};

  let normalizeRaf = 0;
  let validationRaf = 0;
  let answerClassRaf = 0;

  let activeDropdownAnchorEl = null;
  const detachDomListeners = [];
  const guidanceReactRoots = new Set();
  const matrixLayoutTimers = new Set();

  let popupObserver = null;
  let matrixLayoutRaf = 0;

  function forceMatrixTableReflow() {
    const roots = document.querySelectorAll(".ember-matrix-runtime");
    roots.forEach((root) => {
      const table =
        root.querySelector("table") ||
        root.querySelector(".sd-matrixdynamic__table") ||
        root.querySelector(".sd-table");
      if (table) {
        table.style.transform = "translateZ(0)";
        void table.offsetWidth;
        table.style.transform = "";
      }
    });

    window.dispatchEvent(new Event("resize"));
  }

  function refreshAllMatrixLayouts() {
    applyAllMatrixLayoutClasses(
      model,
      guidanceByMatrixRow,
      onOpenQuestionGuidance,
      guidanceReactRoots
    );
    applyAllAnswerItemClasses(model);
    forceMatrixTableReflow();
  }

  function scheduleMatrixLayoutStabilization() {
    if (matrixLayoutRaf) cancelAnimationFrame(matrixLayoutRaf);

    matrixLayoutRaf = requestAnimationFrame(() => {
      matrixLayoutRaf = 0;
      refreshAllMatrixLayouts();
    });

    matrixLayoutTimers.forEach((timer) => clearTimeout(timer));
    matrixLayoutTimers.clear();

    [40, 140, 360].forEach((delay) => {
      const timer = window.setTimeout(() => {
        matrixLayoutTimers.delete(timer);
        refreshAllMatrixLayouts();
      }, delay);
      matrixLayoutTimers.add(timer);
    });
  }

  function ensureQuestionGuidanceButton(question, htmlElement) {
    const questionName = normalizeGuidanceQuestionName(question?.name);
    const guidanceItems = getQuestionGuidanceItems(guidanceByQuestion, questionName);
    const questionRoot = htmlElement || queryQuestionRoot(questionName);
    if (!questionRoot) return;

    const existingButton = questionRoot.querySelector(".ember-question-guidance-btn");

    if (guidanceItems.length === 0) {
      if (existingButton?._emberReactRoot) {
        existingButton._emberReactRoot.unmount();
        guidanceReactRoots.delete(existingButton._emberReactRoot);
      }
      existingButton?.remove();
      questionRoot.classList.remove("ember-question-guidance-host");
      return;
    }

    questionRoot.classList.add("ember-question-guidance-host");

    const anchor = getQuestionGuidanceAnchor(questionRoot);
    if (!anchor) return;

    let button = existingButton;
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "ember-question-guidance-btn";
      button.setAttribute("aria-label", "Toon toelichting bij deze vraag");

      const iconMount = document.createElement("span");
      iconMount.className = "ember-question-guidance-btn__icon";
      button.appendChild(iconMount);

      const text = document.createElement("span");
      text.className = "ember-question-guidance-btn__text";
      text.textContent = "Toelichting";
      button.appendChild(text);

      const root = createRoot(iconMount);
      root.render(<CircleHelpIcon size={16} className="nav-anim-icon" />);
      button._emberReactRoot = root;
      guidanceReactRoots.add(root);

      anchor.appendChild(button);
    }

    button.title =
      guidanceItems.length > 1
        ? `${guidanceItems.length} toelichtingen beschikbaar`
        : "Toelichting beschikbaar";

    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpenQuestionGuidance?.({
        questionName,
        questionTitle: getQuestionTitleText(question),
        items: guidanceItems,
      });
    };
  }

  function scheduleAnswerClassRefresh(root) {
    if (answerClassRaf) cancelAnimationFrame(answerClassRaf);

    answerClassRaf = requestAnimationFrame(() => {
      answerClassRaf = 0;
      applyAnswerItemClasses(root || document);
      applyAllAnswerItemClasses(model);
    });
  }

  function refreshDerivedState(name) {
    const key = String(name || "");

    const isEnergyRelevant =
      key === "es_verouderingsfactor" ||
      key.startsWith("es_regels");

    const isAvailabilityRelevant =
      key === "a2_systeembeschikbaarheid_pve" ||
      key.startsWith("a2_buitenbedrijfstellingen") ||
      key.startsWith("performance_data_view") ||
      key.startsWith("a2_items");

    if (normalizeRaf) cancelAnimationFrame(normalizeRaf);

    normalizeRaf = requestAnimationFrame(() => {
      normalizeRaf = 0;

      if (isEnergyRelevant) {
        normalizeEnergyRows(model, prefillPayload, energyAutoStateRef);
      }

      if (isAvailabilityRelevant) {
        normalizeAvailabilityRows(model, availabilityAutoStateRef);
      }

      requestAnimationFrame(() => {
        applyCapWarnings(model);
        applyAvailabilityWarnings(model);
      });
    });
  }

  function refreshValidationIfNeeded() {
    if (!validationActivatedRef?.current) return;
    if (suppressDirtyRef?.current) return;

    if (validationRaf) cancelAnimationFrame(validationRaf);

    validationRaf = requestAnimationFrame(() => {
      validationRaf = 0;

      try {
        model.validate(true);
        syncAllMatrixQuestionVisualErrors(model, true);

        const summary = collectValidationSummary(model);
        onValidationSummaryChange?.(summary);
      } catch {
        // stil
      }
    });
  }

  function tryRepositionActiveDropdownPopup() {
    const popupRoot = getPopupRootElement();
    if (!popupRoot || !activeDropdownAnchorEl) return false;
    return positionDropdownPopupUnderAnchor(popupRoot, activeDropdownAnchorEl);
  }

  function registerDropdownAnchor(question, htmlElement) {
    if (!isDropdownQuestion(question) || !htmlElement) return;

    const root = htmlElement;

    const setAnchor = () => {
      activeDropdownAnchorEl = getDropdownAnchorElement(root);

      requestAnimationFrame(() => {
        tryRepositionActiveDropdownPopup();
      });

      window.setTimeout(() => {
        tryRepositionActiveDropdownPopup();
      }, 30);
    };

    const onPointerDown = () => {
      setAnchor();
    };

    const onFocusIn = () => {
      setAnchor();
    };

    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("focusin", onFocusIn, true);

    detachDomListeners.push(() => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("focusin", onFocusIn, true);
    });
  }


  function registerDropdownDelegation() {
    const root =
      document.querySelector(".sd-root-modern") ||
      document.querySelector(".sd-root") ||
      document.body;

    const setAnchorFromTarget = (target) => {
      const el = target instanceof HTMLElement ? target : null;
      const dropdown = el?.closest?.(".sd-dropdown, .sv-dropdown_select-wrapper");
      if (!dropdown) return;

      activeDropdownAnchorEl = getDropdownAnchorElement(dropdown);

      requestAnimationFrame(() => {
        tryRepositionActiveDropdownPopup();
      });

      window.setTimeout(() => {
        tryRepositionActiveDropdownPopup();
      }, 30);

      window.setTimeout(() => {
        tryRepositionActiveDropdownPopup();
      }, 90);
    };

    const onPointerDown = (event) => setAnchorFromTarget(event.target);
    const onFocusIn = (event) => setAnchorFromTarget(event.target);

    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("focusin", onFocusIn, true);

    detachDomListeners.push(() => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("focusin", onFocusIn, true);
    });
  }

  registerDropdownDelegation();

  const valueChangedHandler = (_, options) => {
    if (!suppressDirtyRef?.current) {
      onAnswersSnapshotChange?.({ ...(model.data || {}) });
    }

    scheduleAnswerClassRefresh(document);

    requestAnimationFrame(() => {
      syncValidationVisualsOnlyWhenActivated(model, validationActivatedRef);
    });

    refreshDerivedState(options?.name);
    refreshValidationIfNeeded();
  };

  const afterRenderQuestionHandler = (_, options) => {
    scheduleAnswerClassRefresh(options?.htmlElement);

    registerDropdownAnchor(options?.question, options?.htmlElement);
    ensureQuestionGuidanceButton(options?.question, options?.htmlElement);

    const qname = String(options?.question?.name || "");

    if (qname === "es_regels") {
      requestAnimationFrame(() => applyCapWarnings(model));
    }

    if (
      qname === "a2_buitenbedrijfstellingen" ||
      qname === "a2_resultaat_panel" ||
      qname === "a2_systeembeschikbaarheid_geconstateerd"
    ) {
      requestAnimationFrame(() => applyAvailabilityWarnings(model));
    }

    if (options?.question?.getType?.() === "matrixdynamic") {
      requestAnimationFrame(() => {
        applyMatrixColumnAttributes(
          options?.question,
          options?.htmlElement,
          guidanceByMatrixRow,
          onOpenQuestionGuidance,
          guidanceReactRoots
        );
        syncValidationVisualsOnlyWhenActivated(model, validationActivatedRef);
        scheduleMatrixLayoutStabilization();
      });
    }
  };

  model.onValueChanged.add(valueChangedHandler);
  model.onAfterRenderQuestion.add(afterRenderQuestionHandler);

  popupObserver = new MutationObserver(() => {
    tryRepositionActiveDropdownPopup();
    scheduleAnswerClassRefresh(document);
  });

  popupObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  requestAnimationFrame(() => {
    normalizeEnergyRows(model, prefillPayload, energyAutoStateRef);
    normalizeAvailabilityRows(model, availabilityAutoStateRef);
    applyAllAnswerItemClasses(model);
    refreshAllMatrixLayouts();

    requestAnimationFrame(() => {
      applyCapWarnings(model);
      applyAvailabilityWarnings(model);
      syncValidationVisualsOnlyWhenActivated(model, validationActivatedRef);
      tryRepositionActiveDropdownPopup();
      applyAllAnswerItemClasses(model);
      refreshAllMatrixLayouts();
      scheduleMatrixLayoutStabilization();
      (model?.getAllQuestions?.() || []).forEach((question) => {
        ensureQuestionGuidanceButton(question, queryQuestionRoot(question?.name));
      });
    });
  });

  return () => {
    if (normalizeRaf) cancelAnimationFrame(normalizeRaf);
    if (validationRaf) cancelAnimationFrame(validationRaf);
    if (answerClassRaf) cancelAnimationFrame(answerClassRaf);
    if (matrixLayoutRaf) cancelAnimationFrame(matrixLayoutRaf);
    matrixLayoutTimers.forEach((timer) => clearTimeout(timer));
    matrixLayoutTimers.clear();

    if (popupObserver) {
      popupObserver.disconnect();
      popupObserver = null;
    }

    detachDomListeners.forEach((fn) => fn());
    detachDomListeners.length = 0;
    guidanceReactRoots.forEach((root) => root.unmount());
    guidanceReactRoots.clear();

    model.onValueChanged.remove(valueChangedHandler);
    model.onAfterRenderQuestion.remove(afterRenderQuestionHandler);
  };
}
