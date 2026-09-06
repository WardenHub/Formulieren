import { createContext, memo, startTransition, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { DeleteIcon } from "@/components/ui/delete";
import { DownloadIcon } from "@/components/ui/download";
import { PlusIcon } from "@/components/ui/plus";
import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";

import { getMatrixCellQuestion, getMatrixVisibleRows, getValidationErrorText } from "./validation.jsx";
import { getPageTitle, getQuestionTitle } from "./surveyCore.jsx";
import { evaluateConsistencyRules } from "./validation.jsx";

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length ? text : "";
}

function normalizeName(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeLooseKey(value) {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, "");
}

function getChoiceItems(questionOrColumn) {
  const visibleChoices = Array.isArray(questionOrColumn?.visibleChoices)
    ? questionOrColumn.visibleChoices
    : [];
  const baseChoices = visibleChoices.length
    ? visibleChoices
    : Array.isArray(questionOrColumn?.choices)
      ? questionOrColumn.choices
      : [];

  return baseChoices.map((choice, index) => {
    if (choice && typeof choice === "object" && "value" in choice) {
      return {
        key: String(choice.value ?? `choice-${index}`),
        value: choice.value,
        text: normalizeText(
          choice.text || choice.locText?.renderedHtml || choice.locText?.textOrHtml || choice.value
        ),
      };
    }

    const value = choice ?? "";
    return {
      key: String(value || `choice-${index}`),
      value,
      text: normalizeText(value),
    };
  });
}

function getAnswerToneClass(value) {
  const text = normalizeLower(value).replaceAll(".", "").replaceAll(" ", "");
  if (text === "ja" || text === "yes" || text === "true") return "ember-runtime-segment--yes";
  if (text === "nee" || text === "no" || text === "false") return "ember-runtime-segment--no";
  if (text === "nvt" || text === "nv.t" || text === "n.v.t") return "ember-runtime-segment--neutral";
  return "";
}

function getQuestionItemsMap(itemsByQuestion, questionName) {
  if (!questionName || !itemsByQuestion || typeof itemsByQuestion !== "object") return [];
  const items = itemsByQuestion[String(questionName).trim()];
  return Array.isArray(items) ? items : [];
}

function buildMatrixGuidanceKey(questionName, rowData, rowIndex) {
  const code =
    rowData?.item_code ??
    rowData?.nr ??
    rowData?.code ??
    rowData?.id ??
    rowData?.datum ??
    rowIndex + 1;

  const cleanQuestion = String(questionName || "").trim();
  const cleanCode = String(code || "").trim();
  if (!cleanQuestion || !cleanCode) return "";
  return `${cleanQuestion}::${cleanCode}`;
}

function getMatrixGuidanceItems(guidanceByMatrixRow, questionName, rowData, rowIndex) {
  const key = buildMatrixGuidanceKey(questionName, rowData, rowIndex);
  if (!key || !guidanceByMatrixRow || typeof guidanceByMatrixRow !== "object") return [];
  const items = guidanceByMatrixRow[key];
  return Array.isArray(items) ? items : [];
}

function interpolatePanelTemplate(template, panelData) {
  const source = panelData && typeof panelData === "object" ? panelData : {};
  const raw = String(template || "").trim();
  if (!raw) return "";

  return raw.replace(/\{panel\.([^}]+)\}/g, (_, key) => {
    const value = source?.[key];
    return value == null ? "" : String(value);
  });
}

function getCurrentValue(question) {
  return question?.value ?? "";
}

function getExplicitQuestionTitle(question) {
  return normalizeText(question?.fullTitle || question?.title || question?.locTitle?.renderedHtml || "");
}

function getInputType(question) {
  const inputType = String(question?.inputType || question?.jsonObj?.inputType || "").trim();
  if (inputType === "date" || inputType === "time" || inputType === "number" || inputType === "tel") {
    return inputType;
  }
  return "text";
}

// Welk toetsenbord een telefoon opent. Het vraagtype bepaalt het standaardgedrag; een
// definitie kan het overschrijven met ember.inputMode zonder het type te veranderen, want
// een vraag kan tekst zijn en toch cijfers verwachten.
function getInputMode(question) {
  const override = normalizeText(question?.jsonObj?.ember?.inputMode || question?.ember?.inputMode);
  if (override) return override;

  const inputType = getInputType(question);
  if (inputType === "number") return "decimal";
  if (inputType === "tel") return "tel";

  return undefined;
}

function getEnterKeyHint(question) {
  const override = normalizeText(question?.jsonObj?.ember?.enterKeyHint || question?.ember?.enterKeyHint);
  if (override) return override;
  return "next";
}

// Een stabiel id per vraag, zodat het label werkelijk aan zijn invoer hangt. Tikken op het
// label zet de focus in het veld en een schermlezer leest de vraag voor bij het veld.
function getFieldInputId(question) {
  const name = normalizeText(question?.name);
  if (!name) return undefined;
  return `ember-field-${name.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

function getFieldLabelId(question) {
  const inputId = getFieldInputId(question);
  return inputId ? `${inputId}-label` : undefined;
}

// Fouten per veld in plaats van pas na Controleer. Een veld dat is ingevuld en weer
// verlaten mag zijn eigen fout tonen; een veld waar nog nooit in is getypt blijft stil,
// anders staat een pas geopend formulier meteen vol rode tekst. Bij keuzevragen is de
// keuze zelf het moment, want daar verdwijnt de fout op hetzelfde moment als hij ontstaat.
function useFieldErrorVisibility(question, showErrors, { blurRequired = true } = {}) {
  const [interacted, setInteracted] = useState(false);
  const [blurred, setBlurred] = useState(false);

  const validateNow = useCallback(() => {
    try {
      question?.validate?.(true);
    } catch {
      // Een mislukte veldcontrole mag het invullen nooit blokkeren.
    }
  }, [question]);

  const markInteracted = useCallback(() => {
    setInteracted(true);
    if (!blurRequired) validateNow();
  }, [blurRequired, validateNow]);

  const markBlurred = useCallback(() => {
    validateNow();
    setBlurred(true);
  }, [validateNow]);

  const visible = showErrors || (interacted && (blurRequired ? blurred : true));

  return { visible, markInteracted, markBlurred };
}

function isQuestionVisible(question) {
  return question?.isVisible !== false;
}

function isQuestionReadOnly(question, canEdit) {
  return !canEdit || question?.isReadOnly === true || question?.readOnly === true;
}

function isQuestionRequired(question) {
  return question?.isRequired === true;
}

function isPanelLike(element) {
  return String(element?.getType?.() || element?.jsonObj?.type || "").trim() === "panel";
}

function getQuestionType(question) {
  return String(question?.getType?.() || question?.jsonObj?.type || "").trim();
}

function getColumnType(column, cellQuestion) {
  return String(cellQuestion?.getType?.() || column?.cellType || "text").trim();
}

function getColumnTitle(column, fallback = "") {
  return normalizeText(column?.title || column?.name || fallback);
}

function getMatrixColumns(question) {
  return Array.isArray(question?.columns) ? question.columns : [];
}

function findMatrixColumn(question, names) {
  const wanted = new Set(
    names.map((name) =>
      String(name || "")
        .trim()
        .toLowerCase()
    )
  );

  return getMatrixColumns(question).find((column) =>
    wanted.has(
      String(column?.name || "")
        .trim()
        .toLowerCase()
    )
  );
}

const MATRIX_LAYOUTS = new Set([
  "assessment",
  "energy-supply",
  "availability-periods",
  "performance-readonly",
  "additional-remarks",
  "default",
]);

// De weergavevariant van een matrix staat in de formulierdefinitie, als "ember": { "layout": ... }.
// Eerder werd hij geraden uit kolomnamen en vraagnamen, waardoor de gedeelde runtime de
// semantiek van één specifiek formulier kende en elk nieuw formulier codewijzigingen vroeg.
function getMatrixLayoutVariant(question) {
  const declared = normalizeLower(question?.jsonObj?.ember?.layout);
  return MATRIX_LAYOUTS.has(declared) ? declared : "default";
}

function isAssessmentMatrix(question) {
  return getMatrixLayoutVariant(question) === "assessment";
}

function isPerformanceReadonlyMatrix(question) {
  return getMatrixLayoutVariant(question) === "performance-readonly";
}

function getMatrixFieldLayoutClass(layoutVariant, column) {
  const key = normalizeLooseKey(column?.name || column?.title);

  if (layoutVariant === "additional-remarks") {
    if (key === "omschrijving") return "ember-runtime-card-field--additional-main";
    if (key === "gevolgcertificaat") return "ember-runtime-card-field--additional-side";
    return "";
  }

  if (layoutVariant === "energy-supply") {
    if (key === "plaatsingsdatum") return "ember-runtime-card-field--energy ember-runtime-card-field--energy-primary";
    if (key === "aantal") return "ember-runtime-card-field--energy ember-runtime-card-field--energy-primary";
    if (key === "capperaccuah" || key === "capperaccu") return "ember-runtime-card-field--energy ember-runtime-card-field--energy-primary";
    if (key === "schakeling") return "ember-runtime-card-field--energy ember-runtime-card-field--energy-primary";
    if (key === "merktype" || key === "merk") return "ember-runtime-card-field--energy ember-runtime-card-field--energy-primary";
    if (key === "aanwezigecapah" || key === "aanwezigecap") return "ember-runtime-card-field--energy";
    if (key === "alarmma" || key === "alarm") return "ember-runtime-card-field--energy";
    if (key === "rustma" || key === "rust") return "ember-runtime-card-field--energy";
    if (key === "benodigdah" || key === "benodigd") return "ember-runtime-card-field--energy";
    if (key === "overbrugginguren" || key === "overbrugging") return "ember-runtime-card-field--energy";
    if (key === "opmerking") return "ember-runtime-card-field--energy-note";
    if (
      key === "accu1v" ||
      key === "accu2v" ||
      key === "vt0" ||
      key === "vt1" ||
      key === "laadspanningv" ||
      key === "laadspanning"
    ) {
      return "ember-runtime-card-field--energy-secondary";
    }
    return "ember-runtime-card-field--energy";
  }

  if (layoutVariant === "availability-periods") {
    if (key === "heledag") {
      return "ember-runtime-card-field--availability-full-day";
    }
    if (key === "omschrijving" || key === "toelichting") {
      return "ember-runtime-card-field--availability-note";
    }
    if (
      key === "datum" ||
      key === "tijdbegin" ||
      key === "tijdeinde" ||
      key === "tijdsduurdagen" ||
      key === "tijdsduur"
    ) {
      return "ember-runtime-card-field--availability-primary";
    }
    return "ember-runtime-card-field--availability-secondary";
  }

  return "";
}

function isAutoHeaderPanel(panel) {
  const explicitTitle = getExplicitQuestionTitle(panel);
  const panelName = normalizeLower(panel?.name);
  return !explicitTitle && panelName.endsWith("_header");
}

function isReadonlyMatrix(question) {
  if (question?.canAddRow || question?.canRemoveRows) return false;
  if (question?.isReadOnly === true || question?.readOnly === true) return true;

  const columns = getMatrixColumns(question);
  if (!columns.length) return false;

  return columns.every((column) => column?.readOnly === true || column?.cellType === "text");
}

function getQuestionErrors(question, showErrors) {
  if (!showErrors) return [];
  const errors = Array.isArray(question?.errors) ? question.errors : [];
  // survey-core zet de tekst van een verplicht-fout niet op .text maar achter getText();
  // met de oude afhandeling stond er letterlijk "[object Object]" onder het veld. De
  // resolver uit validation.jsx kent alle vormen en wordt ook door de foutenlijst gebruikt,
  // zodat veld en lijst dezelfde tekst tonen.
  return errors.map((item) => normalizeText(getValidationErrorText(item))).filter(Boolean);
}

function getMatrixRowErrors(validationSummary, questionName, rowIndex, columnName = null) {
  if (!Array.isArray(validationSummary) || !questionName) return [];

  return validationSummary
    .filter((item) => {
      if (String(item?.questionName || "") !== String(questionName)) return false;
      if (Number(item?.rowIndex) !== Number(rowIndex + 1)) return false;
      if (!columnName) return true;
      return String(item?.columnName || "") === String(columnName);
    })
    .map((item) => normalizeText(item?.message))
    .filter(Boolean);
}

function buildReadonlyMatrixColumns(question) {
  const columns = getMatrixColumns(question);
  return columns
    .filter((column) => column?.visible !== false && column?.isVisible !== false)
    .map((column, index) => ({
      key: String(column?.name || `col-${index}`),
      title: normalizeText(column?.title || column?.name || `Kolom ${index + 1}`),
      width: String(column?.width || "").trim(),
    }));
}

function parseColumnWidthPercent(width) {
  const match = String(width || "").trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function getReadonlyColumnMinWidth(column) {
  const key = normalizeLower(column?.key || column?.name);
  const title = normalizeLower(column?.title || column?.name);
  const widthPercent = parseColumnWidthPercent(column?.width);

  if (key.includes("omschrijving") || key.includes("opmerking") || title.includes("omschrijving")) {
    return 220;
  }

  if (key.includes("gebruikersfunctie") || title.includes("gebruikersfunctie")) {
    return 220;
  }

  if (key.includes("doormelding") || title.includes("doormelding")) {
    return 190;
  }

  if (key.includes("label") || key.includes("ruimte") || key.includes("locatie")) {
    return 190;
  }

  if (key.includes("max_") || title.startsWith("max") || key.includes("risico")) {
    return 118;
  }

  if (title.length <= 3 || key.includes("aantal") || key.endsWith("_v") || key.endsWith("_ah")) {
    return 84;
  }

  if (widthPercent != null) {
    if (widthPercent >= 20) return 190;
    if (widthPercent >= 14) return 170;
    if (widthPercent >= 10) return 140;
    if (widthPercent <= 5) return 84;
  }

  return 130;
}

function getReadonlyTableMinWidth(columns) {
  const items = Array.isArray(columns) ? columns : [];
  if (!items.length) return 720;

  const total = items.reduce((sum, column) => sum + getReadonlyColumnMinWidth(column), 0);
  return Math.max(760, Math.min(2200, total));
}

function isWideReadonlyMatrix(columns) {
  const items = Array.isArray(columns) ? columns : [];
  if (items.length >= 7) return true;

  return items.some((column) => {
    const key = normalizeLower(column?.key || column?.name);
    return key.startsWith("pr_") || key.startsWith("es_");
  });
}

function isDocumentMatrixColumns(columns) {
  const names = new Set((Array.isArray(columns) ? columns : []).map((column) => normalizeLower(column?.key || column?.name)));
  return (
    names.has("doc_titel") ||
    names.has("doc_nummer") ||
    names.has("doc_revisie") ||
    names.has("doc_datum")
  );
}

function formatDocumentDate(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("nl-NL");
}

function openDocumentUrl(url) {
  const href = normalizeText(url);
  if (!href || typeof window === "undefined") return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function downloadDocumentUrl(url, fileName) {
  const href = normalizeText(url);
  if (!href || typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = normalizeText(fileName) || "document";
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function getReadonlyTableCellClass() {
  return "";
}

function isDocumentGroupValue(items) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return false;
  return rows.every((item) => Array.isArray(item?.types));
}

function buildReadonlyMatrixRows(question) {
  const value = Array.isArray(question?.value) ? question.value : [];
  return value.map((row, rowIndex) => ({
    key:
      row?.item_code ||
      row?.doc_nummer ||
      row?.datum ||
      row?.meldernummer ||
      `row-${rowIndex}`,
    data: row && typeof row === "object" ? row : {},
  }));
}

function getMatrixRowData(question, row, rowIndex) {
  if (row?.value && typeof row.value === "object") return row.value;
  const value = Array.isArray(question?.value) ? question.value : [];
  const hit = value[rowIndex];
  return hit && typeof hit === "object" ? hit : {};
}

function getColumnCellDisplayValue(rowData, columnName) {
  const value = rowData?.[columnName];
  if (value == null) return "";
  return String(value);
}

function isBlankMatrixRowData(rowData, columns) {
  const data = rowData && typeof rowData === "object" ? rowData : {};
  const visibleColumns = Array.isArray(columns) ? columns : [];

  return visibleColumns.every((column) => {
    const key = String(column?.name || "").trim();
    if (!key) return true;
    const value = data?.[key];
    if (Array.isArray(value)) return value.length === 0;
    if (value && typeof value === "object") return Object.keys(value).length === 0;
    return String(value ?? "").trim() === "";
  });
}

function setQuestionValue(question, nextValue) {
  if (!question) return;
  question.value = nextValue;
}

function useRuntimeRenderVersion(model) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!model) return undefined;

    const bump = () => {
      startTransition(() => {
        setVersion((current) => current + 1);
      });
    };

    const bindings = [
      [model.onValueChanged, bump],
      [model.onCurrentPageChanged, bump],
      [model.onMatrixRowAdded, bump],
      [model.onMatrixRowRemoved, bump],
      [model.onDynamicPanelAdded, bump],
      [model.onDynamicPanelRemoved, bump],
    ];

    bindings.forEach(([event, handler]) => event?.add?.(handler));

    return () => {
      bindings.forEach(([event, handler]) => event?.remove?.(handler));
    };
  }, [model]);

  return useDeferredValue(version);
}

function QuestionGuidanceButton({ items, onOpen }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <button
      type="button"
      className="icon-btn ember-runtime-guidance-btn"
      onClick={onOpen}
      title="Toon uitleg"
      aria-label="Toon uitleg"
    >
      <CircleHelpIcon size={16} />
    </button>
  );
}

function RuntimeHintDisclosure({
  title = "Toon uitleg",
  text,
  href = "",
  linkLabel = "",
}) {
  const [open, setOpen] = useState(false);
  if (!normalizeText(text)) return null;

  return (
    <div className="ember-runtime-hint-disclosure">
      <button
        type="button"
        className="icon-btn ember-runtime-hint-disclosure__toggle"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <CircleHelpIcon size={16} />
      </button>

      {open ? (
        <div className="ember-runtime-inline-hint" role="note">
          <div className="ember-runtime-inline-hint__icon" aria-hidden="true">
            <CircleHelpIcon size={16} />
          </div>
          <div className="ember-runtime-inline-hint__body">
            <div className="ember-runtime-inline-hint__text">{text}</div>
            {href ? (
              <a
                className="ember-runtime-inline-hint__link"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {linkLabel || "Open"}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldErrors({ errors }) {
  if (!Array.isArray(errors) || errors.length === 0) return null;

  return (
    <div className="ember-runtime-field-errors">
      {errors.map((error, index) => (
        <div key={`${error}-${index}`} className="ember-runtime-field-error">
          {error}
        </div>
      ))}
    </div>
  );
}

function RuntimeFieldShell({
  question,
  children,
  errors,
  guidanceItems,
  onOpenGuidance,
  compactLabel = false,
  inputId,
}) {
  const title = getQuestionTitle(question);
  const description = normalizeText(question?.description || question?.locDescription?.renderedHtml);
  const showLabel = String(question?.titleLocation || "").trim().toLowerCase() !== "hidden";

  const warnQuestions = useContext(RuntimeWarningsContext);
  const isWarned = warnQuestions.has(String(question?.name || "").trim());

  return (
    <div
      className={[
        "ember-runtime-field",
        compactLabel ? "ember-runtime-field--compact" : "",
        isWarned ? "ember-runtime-field--warn" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-name={question?.name || undefined}
    >
      {showLabel ? (
        <div className="ember-runtime-field__head">
          <div className="ember-runtime-field__title-wrap">
            <label
              className="ember-runtime-field__label"
              id={getFieldLabelId(question)}
              htmlFor={inputId || undefined}
            >
              {title}
              {isQuestionRequired(question) ? <span className="ember-runtime-required"> *</span> : null}
            </label>
            {description ? <div className="ember-runtime-field__description">{description}</div> : null}
          </div>

          <QuestionGuidanceButton items={guidanceItems} onOpen={onOpenGuidance} />
        </div>
      ) : null}

      {children}
      <FieldErrors errors={errors} />
    </div>
  );
}

function RuntimeTextQuestion({ question, canEdit, showErrors, guidanceItems, onOpenGuidance }) {
  const value = getCurrentValue(question);
  const readOnly = isQuestionReadOnly(question, canEdit);
  const inputType = getInputType(question);
  const { visible, markInteracted, markBlurred } = useFieldErrorVisibility(question, showErrors);
  const errors = getQuestionErrors(question, visible);
  const placeholder = normalizeText(question?.placeholder || question?.placeHolder);
  const inputId = getFieldInputId(question);

  return (
    <RuntimeFieldShell
      question={question}
      errors={errors}
      guidanceItems={guidanceItems}
      onOpenGuidance={onOpenGuidance}
      inputId={inputId}
    >
      <input
        id={inputId}
        type={inputType}
        inputMode={getInputMode(question)}
        enterKeyHint={getEnterKeyHint(question)}
        className="ember-runtime-input"
        value={value == null ? "" : String(value)}
        readOnly={readOnly}
        disabled={readOnly}
        aria-invalid={errors.length > 0 ? true : undefined}
        placeholder={placeholder || undefined}
        onChange={(event) => {
          markInteracted();
          setQuestionValue(question, event.target.value);
        }}
        onBlur={markBlurred}
      />
    </RuntimeFieldShell>
  );
}

function RuntimeCommentQuestion({ question, canEdit, showErrors, guidanceItems, onOpenGuidance }) {
  const value = getCurrentValue(question);
  const readOnly = isQuestionReadOnly(question, canEdit);
  const { visible, markInteracted, markBlurred } = useFieldErrorVisibility(question, showErrors);
  const errors = getQuestionErrors(question, visible);
  const placeholder = normalizeText(question?.placeholder || question?.placeHolder);
  const inputId = getFieldInputId(question);

  return (
    <RuntimeFieldShell
      question={question}
      errors={errors}
      guidanceItems={guidanceItems}
      onOpenGuidance={onOpenGuidance}
      inputId={inputId}
    >
      <textarea
        id={inputId}
        className="ember-runtime-textarea"
        value={value == null ? "" : String(value)}
        readOnly={readOnly}
        disabled={readOnly}
        rows={Number(question?.rows) > 0 ? Number(question.rows) : 4}
        aria-invalid={errors.length > 0 ? true : undefined}
        placeholder={placeholder || undefined}
        onChange={(event) => {
          markInteracted();
          setQuestionValue(question, event.target.value);
        }}
        onBlur={markBlurred}
      />
    </RuntimeFieldShell>
  );
}

function RuntimeDropdownQuestion({ question, canEdit, showErrors, guidanceItems, onOpenGuidance }) {
  const value = getCurrentValue(question);
  const readOnly = isQuestionReadOnly(question, canEdit);
  const { visible, markInteracted } = useFieldErrorVisibility(question, showErrors, {
    blurRequired: false,
  });
  const errors = getQuestionErrors(question, visible);
  const choices = getChoiceItems(question);
  const inputId = getFieldInputId(question);

  return (
    <RuntimeFieldShell
      question={question}
      errors={errors}
      guidanceItems={guidanceItems}
      onOpenGuidance={onOpenGuidance}
      inputId={inputId}
    >
      <select
        id={inputId}
        className="ember-runtime-select"
        value={value == null ? "" : String(value)}
        disabled={readOnly}
        aria-invalid={errors.length > 0 ? true : undefined}
        onChange={(event) => {
          markInteracted();
          setQuestionValue(question, event.target.value);
        }}
      >
        <option value="">Kies...</option>
        {choices.map((choice) => (
          <option key={choice.key} value={choice.value ?? ""}>
            {choice.text}
          </option>
        ))}
      </select>
    </RuntimeFieldShell>
  );
}

// Een boolean is tweewaardig maar kan onbeantwoord zijn. Twee knoppen maken dat verschil
// zichtbaar; een enkel vinkje leest een leeg antwoord ten onrechte als "nee", en bij een
// veiligheidsvragenlijst is dat onderscheid niet vrijblijvend. Dezelfde keuzes worden
// gebruikt binnen en buiten een matrix, zodat een boolean er overal hetzelfde uitziet.
function getBooleanChoices(definition) {
  const bron = definition || {};

  return [
    {
      key: "true",
      value: "valueTrue" in bron ? bron.valueTrue : true,
      text: normalizeText(bron.labelTrue) || "Ja",
    },
    {
      key: "false",
      value: "valueFalse" in bron ? bron.valueFalse : false,
      text: normalizeText(bron.labelFalse) || "Nee",
    },
  ];
}

function RuntimeBooleanQuestion({ question, canEdit, showErrors, guidanceItems, onOpenGuidance }) {
  const readOnly = isQuestionReadOnly(question, canEdit);
  const { visible, markInteracted } = useFieldErrorVisibility(question, showErrors, {
    blurRequired: false,
  });
  const errors = getQuestionErrors(question, visible);
  const choices = getBooleanChoices(question?.jsonObj);

  return (
    <RuntimeFieldShell
      question={question}
      errors={errors}
      guidanceItems={guidanceItems}
      onOpenGuidance={onOpenGuidance}
    >
      <SegmentButtons
        choices={choices}
        value={getCurrentValue(question)}
        readOnly={readOnly}
        ariaLabelledBy={getFieldLabelId(question)}
        invalid={errors.length > 0}
        onChange={(nextValue) => {
          markInteracted();
          setQuestionValue(question, nextValue);
        }}
      />
    </RuntimeFieldShell>
  );
}

function RuntimeRadioGroupQuestion({ question, canEdit, showErrors, guidanceItems, onOpenGuidance }) {
  const value = normalizeText(getCurrentValue(question));
  const readOnly = isQuestionReadOnly(question, canEdit);
  const { visible, markInteracted } = useFieldErrorVisibility(question, showErrors, {
    blurRequired: false,
  });
  const errors = getQuestionErrors(question, visible);
  const choices = getChoiceItems(question);

  return (
    <RuntimeFieldShell
      question={question}
      errors={errors}
      guidanceItems={guidanceItems}
      onOpenGuidance={onOpenGuidance}
    >
      <SegmentButtons
        choices={choices}
        value={value}
        readOnly={readOnly}
        ariaLabelledBy={getFieldLabelId(question)}
        invalid={errors.length > 0}
        onChange={(nextValue) => {
          markInteracted();
          setQuestionValue(question, nextValue);
        }}
      />
    </RuntimeFieldShell>
  );
}

function RuntimeHtmlQuestion({ question }) {
  const html =
    normalizeText(question?.locHtml?.renderedHtml) ||
    normalizeText(question?.html) ||
    normalizeText(question?.locTitle?.renderedHtml) ||
    normalizeText(question?.title);

  if (!html) return null;

  return (
    <div
      className="ember-runtime-html"
      data-name={question?.name || undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Een keuzerij is semantisch een radiogroep en geen serie schakelknoppen. Met role radio
// meldt een schermlezer "1 van 3" in plaats van "schakelknop", en werken de pijltjestoetsen
// zoals iedereen van een keuzelijst verwacht. De focus loopt volgens de gebruikelijke
// afspraak: de rij is één tabstop, daarbinnen navigeren de pijltjes.
function SegmentButtons({ choices, value, readOnly, onChange, ariaLabelledBy, invalid }) {
  const rowRef = useRef(null);

  const selectedIndex = choices.findIndex((choice) => {
    const choiceValue = choice.value == null ? "" : String(choice.value);
    return normalizeText(value) === normalizeText(choiceValue);
  });

  function focusChoice(index) {
    const buttons = rowRef.current?.querySelectorAll("[role='radio']");
    buttons?.[index]?.focus();
  }

  function handleKeyDown(event, index) {
    if (readOnly) return;

    const last = choices.length - 1;
    let next = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index >= last ? 0 : index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index <= 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;

    if (next == null) return;

    event.preventDefault();
    onChange?.(choices[next].value);
    focusChoice(next);
  }

  return (
    <div
      ref={rowRef}
      className="ember-runtime-segment-row"
      role="radiogroup"
      aria-labelledby={ariaLabelledBy || undefined}
      aria-invalid={invalid ? true : undefined}
      aria-readonly={readOnly ? true : undefined}
    >
      {choices.map((choice, index) => {
        const choiceValue = choice.value == null ? "" : String(choice.value);
        const selected = normalizeText(value) === normalizeText(choiceValue);
        const toneClass = getAnswerToneClass(choiceValue || choice.text);
        const isFocusStop = selected || (selectedIndex < 0 && index === 0);

        return (
          <button
            key={choice.key}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={isFocusStop ? 0 : -1}
            className={[
              "ember-runtime-segment",
              toneClass,
              selected ? "ember-runtime-segment--selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              if (readOnly) return;
              onChange?.(choice.value);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            disabled={readOnly}
          >
            {choice.text}
          </button>
        );
      })}
    </div>
  );
}

function MatrixReadonlyTable({ question }) {
  const columns = buildReadonlyMatrixColumns(question);
  const rows = buildReadonlyMatrixRows(question);
  const titleVisible = String(question?.titleLocation || "").trim().toLowerCase() !== "hidden";
  const isWide = isWideReadonlyMatrix(columns);
  const minWidth = getReadonlyTableMinWidth(columns);
  const performanceHintHref = question?.survey?.installationCode
    ? `/installaties/${encodeURIComponent(question.survey.installationCode)}?tab=performance`
    : "";

  if (isDocumentMatrixColumns(columns)) {
    return (
      <ReadonlyDocumentMatrix
        title={titleVisible ? normalizeText(question?.title) : ""}
        rows={rows.map((row) => row.data)}
      />
    );
  }

  return (
    <div className="ember-runtime-matrix" data-name={question?.name || undefined}>
      {titleVisible && normalizeText(question?.title) ? (
        <div className="ember-runtime-matrix__head">
          <div className="ember-runtime-matrix__title">{normalizeText(question?.title)}</div>
          {isPerformanceReadonlyMatrix(question) ? (
            <RuntimeHintDisclosure
              title="Toon uitleg over prestatie-eisen"
              text="Prestatie-eisen beheer je bij de installatie onder Prestatie-eisen. Werk daar de brongegevens bij en gebruik daarna in het formulier bovenaan Voorinvulling vernieuwen om de nieuwste Ember-data opnieuw op te halen."
              href={performanceHintHref}
              linkLabel="Open installatie ; Prestatie-eisen"
            />
          ) : null}
        </div>
      ) : null}

      <div
        className={[
          "ember-runtime-table-shell",
          isWide ? "ember-runtime-table-shell--wide" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <table
          className={[
            "ember-runtime-table",
            isWide ? "ember-runtime-table--wide" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={isWide ? { "--ember-runtime-table-min-width": `${minWidth}px` } : undefined}
        >
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={
                    isWide
                      ? { minWidth: `${getReadonlyColumnMinWidth(column)}px` }
                      : column.width
                        ? { width: column.width }
                        : undefined
                  }
                >
                  <span
                    className={[
                      "ember-runtime-table-heading",
                      getReadonlyTableCellClass(column) ? "ember-runtime-table-heading--nowrap" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {column.title}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.key}>
                  {columns.map((column) => {
                    const cellValue = getColumnCellDisplayValue(row.data, column.key);

                    return (
                      <td key={`${row.key}-${column.key}`} data-label={column.title}>
                        <span
                        className={[
                          "ember-runtime-table-cell",
                          getReadonlyTableCellClass(column),
                          cellValue ? "" : "ember-runtime-table-cell--empty",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {cellValue || "-"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="muted">
                  Geen gegevens beschikbaar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReadonlyDocumentMatrix({ title, rows }) {
  const items = Array.isArray(rows) ? rows : [];

  return (
    <div className="ember-runtime-matrix">
      {title ? (
        <div className="ember-runtime-matrix__head">
          <div className="ember-runtime-matrix__title">{title}</div>
        </div>
      ) : null}

      <div className="ember-runtime-document-list">
        {items.length ? (
          items.map((row, rowIndex) => {
            const titleText =
              normalizeText(row?.doc_titel) ||
              normalizeText(row?.doc_bestandsnaam) ||
              normalizeText(row?.doc_nummer) ||
              `Document ${rowIndex + 1}`;
            const metaParts = [
              normalizeText(row?.doc_nummer),
              formatDocumentDate(row?.doc_datum),
              normalizeText(row?.doc_revisie),
            ].filter(Boolean);
            const fileUrl = normalizeText(row?.doc_storage_url);
            const fileName = normalizeText(row?.doc_bestandsnaam) || titleText;

            return (
              <div key={`doc-row-${rowIndex}-${titleText}`} className="card ember-runtime-document-card">
                <div className="ember-runtime-document-card__head">
                  <div className="ember-runtime-document-card__title-wrap">
                    <div className="ember-runtime-document-card__title">{titleText}</div>
                    {metaParts.length ? (
                      <div className="ember-runtime-document-card__meta">{metaParts.join(" ; ")}</div>
                    ) : null}
                  </div>

                  {fileUrl ? (
                    <div className="ember-runtime-document-card__actions">
                      <button
                        type="button"
                        className="btn btn-secondary icon-btn"
                        title="Open document"
                        aria-label="Open document"
                        onClick={() => openDocumentUrl(fileUrl)}
                      >
                        <ArrowBigRightIcon size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary icon-btn"
                        title="Download document"
                        aria-label="Download document"
                        onClick={() => downloadDocumentUrl(fileUrl, fileName)}
                      >
                        <DownloadIcon size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className="ember-runtime-empty">Geen documenten beschikbaar.</div>
        )}
      </div>
    </div>
  );
}

function ReadonlyDocumentGroups({ title, items }) {
  const groups = Array.isArray(items) ? items : [];

  return (
    <div className="ember-runtime-matrix">
      {title ? (
        <div className="ember-runtime-matrix__head">
          <div className="ember-runtime-matrix__title">{title}</div>
        </div>
      ) : null}

      <div className="ember-runtime-document-sections">
        {groups.map((group, groupIndex) => {
          const typeItems = Array.isArray(group?.types) ? group.types : [];
          const visibleTypes = typeItems.filter((typeRow) => Array.isArray(typeRow?.documents) && typeRow.documents.length > 0);
          if (!visibleTypes.length) return null;

          return (
            <section
              key={`doc-group-${group?.groep_key || groupIndex}`}
              className="card ember-runtime-document-section"
            >
              <div className="ember-runtime-document-section__title">
                {normalizeText(group?.groep_naam) || "Documenten"}
              </div>

              <div className="ember-runtime-document-type-list">
                {visibleTypes.map((typeRow, typeIndex) => {
                  const docs = Array.isArray(typeRow?.documents) ? typeRow.documents : [];
                  const showTypeLabel =
                    visibleTypes.length > 1 ||
                    normalizeLower(typeRow?.doc_type_naam) !== normalizeLower(group?.groep_naam);

                  return (
                    <div
                      key={`doc-type-${typeRow?.doc_type || typeIndex}`}
                      className="ember-runtime-document-type-group"
                    >
                      {showTypeLabel ? (
                        <div className="ember-runtime-document-type-group__title">
                          {normalizeText(typeRow?.doc_type_naam) || "Bestanden"}
                        </div>
                      ) : null}

                      <div className="ember-runtime-document-list">
                        {docs.map((doc, docIndex) => {
                          const titleText =
                            normalizeText(doc?.doc_titel) ||
                            normalizeText(doc?.doc_bestandsnaam) ||
                            normalizeText(doc?.doc_nummer) ||
                            `Document ${docIndex + 1}`;
                          const metaParts = [
                            normalizeText(doc?.doc_nummer),
                            formatDocumentDate(doc?.doc_datum),
                            normalizeText(doc?.doc_revisie),
                          ].filter(Boolean);
                          const fileUrl = normalizeText(doc?.doc_storage_url);
                          const fileName = normalizeText(doc?.doc_bestandsnaam) || titleText;

                          return (
                            <div
                              key={`doc-${typeRow?.doc_type || typeIndex}-${doc?.doc_nummer || docIndex}`}
                              className="card ember-runtime-document-card"
                            >
                              <div className="ember-runtime-document-card__head">
                                <div className="ember-runtime-document-card__title-wrap">
                                  <div className="ember-runtime-document-card__title">{titleText}</div>
                                  {metaParts.length ? (
                                    <div className="ember-runtime-document-card__meta">
                                      {metaParts.join(" ; ")}
                                    </div>
                                  ) : null}
                                </div>

                                {fileUrl ? (
                                  <div className="ember-runtime-document-card__actions">
                                    <button
                                      type="button"
                                      className="btn btn-secondary icon-btn"
                                      title="Open document"
                                      aria-label="Open document"
                                      onClick={() => openDocumentUrl(fileUrl)}
                                    >
                                      <ArrowBigRightIcon size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-secondary icon-btn"
                                      title="Download document"
                                      aria-label="Download document"
                                      onClick={() => downloadDocumentUrl(fileUrl, fileName)}
                                    >
                                      <DownloadIcon size={16} />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function AssessmentReadonlyCell({ value, strong = false }) {
  return (
    <div className={`ember-runtime-readonly-cell ${strong ? "ember-runtime-readonly-cell--topic" : ""}`}>
      {value}
    </div>
  );
}

function AssessmentTextCell({ cellQuestion, rowData, column, canEdit, fallback }) {
  const value = cellQuestion?.value ?? rowData?.[column?.name] ?? fallback ?? "";
  const readOnly = isQuestionReadOnly(cellQuestion, canEdit) || column?.readOnly === true;
  const inputType = getInputType(cellQuestion || column);
  const placeholder = normalizeText(column?.placeholder || column?.placeHolder);

  if (readOnly) {
    return <AssessmentReadonlyCell value={value == null ? "" : String(value)} strong={column?.name === "onderwerp"} />;
  }

  return (
    <input
      type={inputType}
      inputMode={getInputMode(cellQuestion || column)}
      enterKeyHint={getEnterKeyHint(cellQuestion || column)}
      className="ember-runtime-input"
      value={value == null ? "" : String(value)}
      readOnly={readOnly}
      disabled={readOnly}
      placeholder={placeholder || undefined}
      onChange={(event) => setQuestionValue(cellQuestion, event.target.value)}
    />
  );
}

// Eén beoordelingsregel. Bewust gememoïseerd: een pagina als
// bijlage_d_gestuurde_voorzieningen heeft twintig regels van elk drie knoppen, een
// tekstveld en een uitlegknop. Zonder memo hertekent één letter in een opmerking ze
// allemaal. Het survey-core model is muteerbaar, dus referentievergelijking ziet geen
// waardewijziging; daarom komen alle beslissende waarden hier binnen als primitieven.
function assessmentRowPropsAreEqual(prev, next) {
  return (
    prev.rowIndex === next.rowIndex &&
    prev.codeValue === next.codeValue &&
    prev.topicValue === next.topicValue &&
    prev.answerValue === next.answerValue &&
    prev.commentValue === next.commentValue &&
    prev.rowErrorsKey === next.rowErrorsKey &&
    prev.answerReadOnly === next.answerReadOnly &&
    prev.commentReadOnly === next.commentReadOnly &&
    prev.showErrors === next.showErrors &&
    prev.canEdit === next.canEdit &&
    prev.guidanceKey === next.guidanceKey &&
    prev.choicesKey === next.choicesKey &&
    prev.answerQuestion === next.answerQuestion &&
    prev.commentQuestion === next.commentQuestion &&
    prev.topicQuestion === next.topicQuestion
  );
}

const MatrixAssessmentRow = memo(function MatrixAssessmentRow({
  questionName,
  rowIndex,
  codeTitle,
  topicTitle,
  answerTitle,
  commentTitle,
  codeValue,
  topicValue,
  answerValue,
  commentValue,
  choices,
  guidanceItems,
  matrixRowLabel,
  rowErrors,
  showErrors,
  canEdit,
  answerReadOnly,
  commentReadOnly,
  topicQuestion,
  answerQuestion,
  commentQuestion,
  topicColumn,
  commentColumn,
  rowData,
  onOpenGuidance,
}) {
  return (
    <div className="ember-runtime-assessment__row">
      <div className="ember-runtime-assessment__grid">
        <div className="ember-runtime-assessment__cell ember-runtime-assessment__nr">
          <div className="ember-runtime-assessment__mobile-label">{codeTitle}</div>
          <AssessmentReadonlyCell value={codeValue} />
        </div>

        <div className="ember-runtime-assessment__cell ember-runtime-assessment__guidance">
          <QuestionGuidanceButton
            items={guidanceItems}
            onOpen={() =>
              onOpenGuidance?.({
                questionName,
                questionTitle: matrixRowLabel,
                matrixRowLabel: matrixRowLabel || null,
                items: guidanceItems,
              })
            }
          />
        </div>

        <div className="ember-runtime-assessment__cell ember-runtime-assessment__topic">
          <div className="ember-runtime-assessment__mobile-label">{topicTitle}</div>
          <AssessmentTextCell
            cellQuestion={topicQuestion}
            rowData={rowData}
            column={topicColumn}
            canEdit={canEdit}
            fallback={topicValue}
          />
        </div>

        <div className="ember-runtime-assessment__cell ember-runtime-assessment__answer">
          <div className="ember-runtime-assessment__mobile-label">{answerTitle} *</div>
          <div className="ember-runtime-segment-row ember-runtime-segment-row--tight">
            {choices.map((choice) => {
              const choiceValue = choice.value == null ? "" : String(choice.value);
              const selected = answerValue === normalizeText(choiceValue);
              const toneClass = getAnswerToneClass(choiceValue || choice.text);

              return (
                <button
                  key={`${questionName}-${rowIndex}-${choice.key}`}
                  type="button"
                  className={[
                    "ember-runtime-segment",
                    "ember-runtime-segment--touch",
                    toneClass,
                    selected ? "ember-runtime-segment--selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (answerReadOnly) return;
                    setQuestionValue(answerQuestion, choice.value);
                  }}
                  disabled={answerReadOnly}
                  aria-pressed={selected}
                >
                  {choice.text}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ember-runtime-assessment__cell ember-runtime-assessment__comment">
          <div className="ember-runtime-assessment__mobile-label">{commentTitle}</div>
          <textarea
            className="ember-runtime-textarea ember-runtime-textarea--matrix"
            value={commentValue}
            readOnly={commentReadOnly}
            disabled={commentReadOnly}
            rows={Number(commentColumn?.rows) > 0 ? Number(commentColumn.rows) : 3}
            placeholder={normalizeText(commentColumn?.placeholder || commentColumn?.placeHolder) || undefined}
            onChange={(event) => setQuestionValue(commentQuestion, event.target.value)}
          />
          <FieldErrors errors={showErrors ? rowErrors : []} />
        </div>
      </div>
    </div>
  );
}, assessmentRowPropsAreEqual);

function MatrixAssessment({ question, canEdit, showErrors, validationSummary, guidanceByMatrixRow, onOpenGuidance }) {
  const rows = getMatrixVisibleRows(question);
  const questionName = normalizeName(question?.name);

  const codeColumn = findMatrixColumn(question, ["item_code", "nr", "code"]);
  const topicColumn = findMatrixColumn(question, ["onderwerp"]);
  const answerColumn = findMatrixColumn(question, ["voldoet"]);
  const commentColumn = findMatrixColumn(question, ["opmerking"]);

  const codeName = normalizeName(codeColumn?.name);
  const topicName = normalizeName(topicColumn?.name);
  const answerName = normalizeName(answerColumn?.name);
  const commentName = normalizeName(commentColumn?.name);

  const codeTitle = getColumnTitle(codeColumn, "Nr");
  const topicTitle = getColumnTitle(topicColumn, "Onderwerp");
  const answerTitle = getColumnTitle(answerColumn, "Voldoet");
  const commentTitle = getColumnTitle(commentColumn, "Opmerking");

  return (
    <div className="ember-runtime-assessment" data-name={questionName || undefined}>
      <div className="ember-runtime-assessment__header ember-runtime-assessment__grid">
        <div>{codeTitle}</div>
        <div aria-hidden="true" />
        <div>{topicTitle}</div>
        <div>{answerTitle} *</div>
        <div>{commentTitle}</div>
      </div>

      <div className="ember-runtime-assessment__rows">
        {rows.map((row, rowIndex) => {
          const rowData = getMatrixRowData(question, row, rowIndex);
          const nrQuestion = getMatrixCellQuestion(row, codeName);
          const topicQuestion = getMatrixCellQuestion(row, topicName);
          const answerQuestion = getMatrixCellQuestion(row, answerName);
          const commentQuestion = getMatrixCellQuestion(row, commentName);

          const guidanceItems = getMatrixGuidanceItems(
            guidanceByMatrixRow,
            questionName,
            rowData,
            rowIndex
          );

          const answerErrors = getMatrixRowErrors(validationSummary, questionName, rowIndex, answerName);
          const commentErrors = getMatrixRowErrors(validationSummary, questionName, rowIndex, commentName);
          const rowErrors = [...new Set([...answerErrors, ...commentErrors])];

          const answerValue = normalizeText(answerQuestion?.value ?? rowData?.[answerName]);
          const answerReadOnly = isQuestionReadOnly(answerQuestion, canEdit) || answerColumn?.readOnly === true;
          const commentReadOnly = isQuestionReadOnly(commentQuestion, canEdit) || commentColumn?.readOnly === true;
          const choices = getChoiceItems(answerQuestion || answerColumn);

          const codeValue =
            getCurrentValue(nrQuestion) ||
            rowData?.[codeName] ||
            rowData?.item_code ||
            rowData?.nr ||
            rowData?.code ||
            rowIndex + 1;

          const topicValue =
            getCurrentValue(topicQuestion) ||
            rowData?.[topicName] ||
            rowData?.onderwerp ||
            "";

          const matrixRowLabel = [codeValue, topicValue].filter(Boolean).join(" ; ");
          const commentValue = commentQuestion?.value == null ? "" : String(commentQuestion.value);

          return (
            <MatrixAssessmentRow
              key={`${questionName}-row-${rowIndex}`}
              questionName={questionName}
              rowIndex={rowIndex}
              codeTitle={codeTitle}
              topicTitle={topicTitle}
              answerTitle={answerTitle}
              commentTitle={commentTitle}
              codeValue={codeValue}
              topicValue={topicValue}
              answerValue={answerValue}
              commentValue={commentValue}
              choices={choices}
              choicesKey={choices.map((choice) => choice.key).join("|")}
              guidanceItems={guidanceItems}
              guidanceKey={guidanceItems.map((item) => item?.guidance_id ?? "").join("|")}
              matrixRowLabel={matrixRowLabel || getQuestionTitle(question)}
              rowErrors={rowErrors}
              rowErrorsKey={rowErrors.join("|")}
              showErrors={showErrors}
              canEdit={canEdit}
              answerReadOnly={answerReadOnly}
              commentReadOnly={commentReadOnly}
              topicQuestion={topicQuestion}
              answerQuestion={answerQuestion}
              commentQuestion={commentQuestion}
              topicColumn={topicColumn}
              commentColumn={commentColumn}
              rowData={rowData}
              onOpenGuidance={onOpenGuidance}
            />
          );
        })}
      </div>
    </div>
  );
}

function MatrixCardField({ cellQuestion, column, canEdit }) {
  const type = getColumnType(column, cellQuestion);
  const readOnly = isQuestionReadOnly(cellQuestion, canEdit) || column?.readOnly === true;
  const value = cellQuestion?.value ?? "";
  const title = getColumnTitle(column);

  if (type === "boolean" || type === "checkbox") {
    const choices = getBooleanChoices(column?.jsonObj ?? column);

    // Bestaande antwoorden kunnen als tekst zijn opgeslagen; die blijven herkend.
    const tekstwaarde = String(value ?? "").trim().toLowerCase();
    const isAan = value === true || ["1", "true", "ja", "yes"].includes(tekstwaarde);
    const isUit = value === false || ["0", "false", "nee", "no"].includes(tekstwaarde);

    // In een matrix is een boolean vrijwel altijd een compacte schakelaar naast andere
    // velden, geen zelfstandige vraag. Twee knoppen worden daar te smal. Een formulier
    // kan dat overrulen met "ember": { "control": "segments" } op de kolom.
    const control = normalizeLower(column?.jsonObj?.ember?.control);

    if (control !== "segments") {
      return (
        <div className="ember-runtime-card-field ember-runtime-card-field--boolean">
          <span className="ember-runtime-card-field__label">{title}</span>
          <button
            type="button"
            role="switch"
            aria-checked={isAan}
            disabled={readOnly}
            className={`ember-runtime-switch ${isAan ? "ember-runtime-switch--on" : ""}`}
            onClick={() => {
              if (readOnly) return;
              setQuestionValue(cellQuestion, isAan ? choices[1].value : choices[0].value);
            }}
          >
            <span className="ember-runtime-switch__track">
              <span className="ember-runtime-switch__thumb" />
            </span>
            <span className="ember-runtime-switch__label">
              {isAan ? choices[0].text : choices[1].text}
            </span>
          </button>
        </div>
      );
    }

    return (
      <div className="ember-runtime-card-field ember-runtime-card-field--boolean">
        <span className="ember-runtime-card-field__label">{title}</span>
        <SegmentButtons
          choices={choices}
          value={isAan ? choices[0].value : isUit ? choices[1].value : value}
          readOnly={readOnly}
          onChange={(nextValue) => setQuestionValue(cellQuestion, nextValue)}
        />
      </div>
    );
  }

  if (type === "comment") {
    return (
      <label className="ember-runtime-card-field ember-runtime-card-field--full">
        <span className="ember-runtime-card-field__label">{title}</span>
        <textarea
          className="ember-runtime-textarea ember-runtime-textarea--card"
          rows={Number(column?.rows) > 0 ? Number(column.rows) : 3}
          value={value == null ? "" : String(value)}
          readOnly={readOnly}
          disabled={readOnly}
          placeholder={normalizeText(column?.placeholder || column?.placeHolder) || undefined}
          onChange={(event) => setQuestionValue(cellQuestion, event.target.value)}
        />
      </label>
    );
  }

  if (type === "dropdown") {
    const choices = getChoiceItems(cellQuestion || column);
    return (
      <label className="ember-runtime-card-field">
        <span className="ember-runtime-card-field__label">{title}</span>
        <select
          className="ember-runtime-select"
          value={value == null ? "" : String(value)}
          disabled={readOnly}
          onChange={(event) => setQuestionValue(cellQuestion, event.target.value)}
        >
          <option value="">Kies...</option>
          {choices.map((choice) => (
            <option key={choice.key} value={choice.value ?? ""}>
              {choice.text}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (type === "radiogroup") {
    const choices = getChoiceItems(cellQuestion || column);
    return (
      <div className="ember-runtime-card-field ember-runtime-card-field--full">
        <span className="ember-runtime-card-field__label">{title}</span>
        <SegmentButtons
          choices={choices}
          value={value == null ? "" : String(value)}
          readOnly={readOnly}
          onChange={(nextValue) => setQuestionValue(cellQuestion, nextValue)}
        />
      </div>
    );
  }

  const inputType = getInputType(cellQuestion || column);
  const tekst = value == null ? "" : String(value);

  // Een read-only tekstcel draagt vaak de vraag zelf, zoals de onderwerpkolom. In een
  // invoerveld van één regel wordt die afgekapt, en afkappen mag hier nooit gebeuren.
  // Read-only tekst wordt daarom als doorlopende tekst getoond die meegroeit.
  if (readOnly && inputType === "text") {
    return (
      <div className="ember-runtime-card-field">
        <span className="ember-runtime-card-field__label">{title}</span>
        <div className="ember-runtime-readonly-text">{tekst}</div>
      </div>
    );
  }

  return (
    <label className="ember-runtime-card-field">
      <span className="ember-runtime-card-field__label">{title}</span>
      <input
        type={inputType}
        inputMode={getInputMode(cellQuestion || column)}
        enterKeyHint={getEnterKeyHint(cellQuestion || column)}
        className="ember-runtime-input"
        value={tekst}
        readOnly={readOnly}
        disabled={readOnly}
        placeholder={normalizeText(column?.placeholder || column?.placeHolder) || undefined}
        onChange={(event) => setQuestionValue(cellQuestion, event.target.value)}
      />
    </label>
  );
}

function EnergySupplyMatrixHint({ installationCode }) {
  const href = installationCode
    ? `/installaties/${encodeURIComponent(installationCode)}?tab=energy`
    : "";

  return (
    <RuntimeHintDisclosure
      title="Toon uitleg over energievoorzieningen"
      text="Nieuwe energievoorzieningen voeg je toe bij de installatie onder Energievoorziening. Gebruik daarna bovenaan Voorinvulling vernieuwen om de nieuwste Ember-data opnieuw in dit formulier te laden."
      href={href}
      linkLabel="Open installatie ; Energievoorziening"
    />
  );
}

const GEEN_WAARSCHUWING = new Set();

// Vragen die door een consistentieregel worden aangemerkt. Via context, omdat de
// veldcomponenten vijf lagen diep zitten en prop-drilling daar niets oplost.
const RuntimeWarningsContext = createContext(GEEN_WAARSCHUWING);

// Het kaartraster telt twaalf kolommen. Een matrixkolom die zelf een breedte opgeeft
// krijgt daar een evenredig aandeel van; zonder opgave geldt een kwart van de rij.
// Zo krijgt een nummerkolom van 6% geen even brede baan als een onderwerpkolom van 44%.
function getCardFieldSpan(column) {
  const ruw = String(column?.width ?? "").trim();
  const percentage = ruw.endsWith("%") ? Number(ruw.slice(0, -1)) : NaN;

  if (!Number.isFinite(percentage) || percentage <= 0) return 3;

  const span = Math.round((percentage / 100) * 12);
  return Math.min(12, Math.max(1, span));
}

function parseMatrixNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

// Een matrix mag zelf opgeven welke kolom niet lager mag zijn dan welke andere.
// Ontbreekt die opgave, dan geldt de bestaande energievoorziening-conventie, zodat
// het huidige onderhoudsformulier blijft werken zonder aanpassing aan de definitie.
function getCapacityWarningRule(question, layoutVariant) {
  const declared = question?.jsonObj?.ember?.capacityWarning;

  if (declared?.actualColumn && declared?.requiredColumn) {
    return {
      actualColumn: normalizeName(declared.actualColumn),
      requiredColumn: normalizeName(declared.requiredColumn),
    };
  }

  if (layoutVariant === "energy-supply") {
    return {
      actualColumn: "es_effectieve_ah",
      requiredColumn: "es_benodigd_ah",
    };
  }

  return null;
}

function getCapacityWarningColumns(question, row, rowIndex, layoutVariant) {
  const rule = getCapacityWarningRule(question, layoutVariant);
  if (!rule) return GEEN_WAARSCHUWING;

  const rowData = getMatrixRowData(question, row, rowIndex);
  const actual = parseMatrixNumber(rowData?.[rule.actualColumn]);
  const required = parseMatrixNumber(rowData?.[rule.requiredColumn]);

  if (actual === null || required === null || actual >= required) return GEEN_WAARSCHUWING;

  return new Set([rule.actualColumn, rule.requiredColumn]);
}

// Een brede matrix mag zijn kolommen in gelabelde secties verdelen, zodat een kaart met
// veel velden niet één vlakke muur invoervelden wordt. De indeling staat op de matrix
// zelf en niet op de kolommen, omdat SurveyJS onbekende kolomeigenschappen niet
// betrouwbaar bewaart en de indeling zo op één leesbare plek in het formulier staat:
//
//   "ember": { "groups": [ { "id": "capaciteit", "label": "Capaciteit",
//                            "columns": ["es_aantal", "es_capaciteit_ah"] } ] }
//
// Kolommen die in geen enkele groep staan blijven vooraan en in hun eigen volgorde.
// Zonder deze opgave verandert er niets aan de weergave.
function buildMatrixFieldGroups(question, columns) {
  const declared = question?.jsonObj?.ember?.groups;
  if (!Array.isArray(declared) || declared.length === 0) return null;

  const byName = new Map();

  columns.forEach((column) => {
    const name = normalizeName(column?.name);
    if (name) byName.set(name, column);
  });

  const used = new Set();
  const groups = [];

  declared.forEach((group) => {
    const names = Array.isArray(group?.columns) ? group.columns : [];
    const groupColumns = [];

    names.forEach((rawName) => {
      const name = normalizeName(rawName);
      if (!name || used.has(name)) return;

      const column = byName.get(name);
      if (!column) return;

      used.add(name);
      groupColumns.push(column);
    });

    if (groupColumns.length) {
      groups.push({
        id: normalizeName(group?.id) || `groep-${groups.length + 1}`,
        label: normalizeText(group?.label),
        columns: groupColumns,
      });
    }
  });

  if (!groups.length) return null;

  const ungrouped = columns.filter((column) => !used.has(normalizeName(column?.name)));

  return ungrouped.length
    ? [{ id: "__ongegroepeerd", label: "", columns: ungrouped }, ...groups]
    : groups;
}

// Eén regelkaart. Zelfde reden als bij de beoordelingsregels: het survey-core model is
// muteerbaar, dus referentievergelijking ziet geen waardewijziging. De beslissende waarden
// komen daarom als primitieven binnen; rowSignature is de inhoud van de rij als tekst.
function cardRowPropsAreEqual(prev, next) {
  return (
    prev.rowIndex === next.rowIndex &&
    prev.rowSignature === next.rowSignature &&
    prev.capacityWarningKey === next.capacityWarningKey &&
    prev.canEdit === next.canEdit &&
    prev.canRemoveRows === next.canRemoveRows &&
    prev.rowGridClassName === next.rowGridClassName &&
    prev.additionalRemarks === next.additionalRemarks &&
    prev.cardTitle === next.cardTitle &&
    prev.row === next.row &&
    prev.fieldGroups === next.fieldGroups &&
    prev.columns === next.columns
  );
}

const MatrixCardRow = memo(function MatrixCardRow({
  row,
  rowIndex,
  columns,
  fieldGroups,
  layoutVariant,
  rowGridClassName,
  additionalRemarks,
  cardTitle,
  canEdit,
  canRemoveRows,
  capacityWarningColumns,
  onRemoveRow,
}) {
  const renderRowField = (column, cellQuestion) => {
    const extraClass = getMatrixFieldLayoutClass(layoutVariant, column);
    const warnsOnCapacity = capacityWarningColumns.has(normalizeName(column?.name));

    return (
      <div
        key={`${rowIndex}-${column?.name || "col"}`}
        className={[extraClass, warnsOnCapacity ? "ember-cap-too-low" : ""]
          .filter(Boolean)
          .join(" ")}
        style={{ gridColumn: `span ${getCardFieldSpan(column)}` }}
      >
        <MatrixCardField column={column} cellQuestion={cellQuestion} canEdit={canEdit} />
      </div>
    );
  };

  return (
    <div
      className={[
        "card",
        "ember-runtime-row-card",
        additionalRemarks ? "ember-runtime-row-card--additional-remarks" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="ember-runtime-row-card__head">
        <div className="ember-runtime-row-card__title">{cardTitle}</div>

        {canRemoveRows && typeof onRemoveRow === "function" ? (
          <button
            type="button"
            className="btn btn-secondary ember-runtime-remove-btn"
            onClick={() => onRemoveRow(rowIndex)}
          >
            <DeleteIcon size={16} />
            <span>Verwijderen</span>
          </button>
        ) : null}
      </div>

      {fieldGroups ? (
        fieldGroups.map((group) => (
          <div key={group.id} className="ember-runtime-row-card__group">
            {group.label ? (
              <div className="ember-runtime-row-card__group-title">{group.label}</div>
            ) : null}

            <div className={rowGridClassName}>
              {group.columns.map((column) =>
                renderRowField(column, getMatrixCellQuestion(row, column?.name))
              )}
            </div>
          </div>
        ))
      ) : (
        <div className={rowGridClassName}>
          {columns.map((column) =>
            renderRowField(column, getMatrixCellQuestion(row, column?.name))
          )}
        </div>
      )}
    </div>
  );
}, cardRowPropsAreEqual);

function MatrixCardList({ question, canEdit, installationCode = "" }) {
  const rows = getMatrixVisibleRows(question);

  // De kolomlijst en de veldgroepen worden vastgehouden. Zonder dit kreeg elke regelkaart
  // bij elke toetsaanslag een nieuwe array binnen, waardoor de memo altijd miste en alle
  // regels alsnog hertekenden. De signatuur is de zichtbare kolomnamen; verandert er een
  // kolom van zichtbaarheid, dan wordt de lijst opnieuw opgebouwd.
  const columnsSignature = getMatrixColumns(question)
    .filter((column) => column?.visible !== false && column?.isVisible !== false)
    .map((column) => normalizeName(column?.name))
    .join("|");

  const columns = useMemo(
    () =>
      getMatrixColumns(question).filter(
        (column) => column?.visible !== false && column?.isVisible !== false
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, columnsSignature]
  );
  const titleVisible = String(question?.titleLocation || "").trim().toLowerCase() !== "hidden";
  const canAddRows = canEdit && question?.isReadOnly !== true && question?.readOnly !== true && question?.canAddRow !== false;
  const canRemoveRows = canEdit && question?.isReadOnly !== true && question?.readOnly !== true && question?.canRemoveRows !== false;
  const layoutVariant = getMatrixLayoutVariant(question);
  const additionalRemarks = layoutVariant === "additional-remarks";
  const fieldGroups = useMemo(
    () => buildMatrixFieldGroups(question, columns),
    [question, columns]
  );

  const rowGridClassName = [
    "ember-runtime-row-card__grid",
    additionalRemarks ? "ember-runtime-row-card__grid--additional-remarks" : "",
    layoutVariant === "energy-supply" ? "ember-runtime-row-card__grid--energy-supply" : "",
    layoutVariant === "availability-periods" ? "ember-runtime-row-card__grid--availability-periods" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const explicitTitle = normalizeText(question?.title);
  const questionName = normalizeText(question?.name);
  const titleMatchesName =
    explicitTitle &&
    questionName &&
    normalizeLooseKey(explicitTitle) === normalizeLooseKey(questionName);
  const matrixTitle = titleMatchesName ? "" : explicitTitle;

  useEffect(() => {
    if (layoutVariant !== "additional-remarks") return;
    if (!canAddRows) return;
    if (question?.__emberInitialBlankRowCleared) return;
    if (rows.length !== 1) return;

    const rowData = getMatrixRowData(question, rows[0], 0);
    if (!isBlankMatrixRowData(rowData, columns)) return;

    // Het survey-core model is bewust een extern, muteerbaar object en is de bron van
    // waarheid voor antwoorden; React rendert eroverheen. Schrijven gebeurt alleen in
    // effects, en daar heeft de immutability-regel geen bezwaar tegen.
    question.__emberInitialBlankRowCleared = true;
    question.value = [];
  }, [canAddRows, columns, layoutVariant, question, rows]);

  return (
    <div className="ember-runtime-matrix" data-name={question?.name || undefined}>
      {(titleVisible && matrixTitle) || canAddRows ? (
        <div className="ember-runtime-matrix__head">
          <div className="ember-runtime-matrix__title">{matrixTitle}</div>
          <div className="ember-runtime-matrix__head-actions">
            {layoutVariant === "energy-supply" ? (
              <EnergySupplyMatrixHint installationCode={installationCode} />
            ) : null}

            {canAddRows && typeof question.addRow === "function" ? (
              <button
                type="button"
                className="btn btn-secondary ember-runtime-add-btn"
                onClick={() => question.addRow()}
              >
                <PlusIcon size={16} />
                <span>{normalizeText(question?.addRowText) || "Regel toevoegen"}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="ember-runtime-card-list">
        {rows.map((row, rowIndex) => {
          const rowData = getMatrixRowData(question, row, rowIndex);

          // Accucapaciteit te laag. Dit werd eerder op de SurveyJS-tabel geplakt via
          // vaste kolomposities; die tabel bestaat in deze runtime niet meer, waardoor
          // de waarschuwing nergens meer verscheen. Nu op de modelwaarden zelf.
          const capacityWarning = getCapacityWarningColumns(question, row, rowIndex, layoutVariant);

          return (
            <MatrixCardRow
              key={`${question?.name || "matrix"}-row-${rowIndex}`}
              row={row}
              rowIndex={rowIndex}
              columns={columns}
              fieldGroups={fieldGroups}
              layoutVariant={layoutVariant}
              rowGridClassName={rowGridClassName}
              additionalRemarks={additionalRemarks}
              cardTitle={
                additionalRemarks
                  ? `${rowIndex + 1}`
                  : `${normalizeText(question?.title) || "Regel"} ${rowIndex + 1}`
              }
              canEdit={canEdit}
              canRemoveRows={canRemoveRows}
              capacityWarningColumns={capacityWarning}
              // De inhoud van de rij als tekst; alleen als die verandert hoort de kaart
              // opnieuw te tekenen. Zonder deze sleutel hertekent één letter in een
              // opmerking elke regel van de matrix.
              rowSignature={JSON.stringify(rowData)}
              capacityWarningKey={[...capacityWarning].sort().join("|")}
              onRemoveRow={
                typeof question.removeRow === "function"
                  ? (index) => question.removeRow(index)
                  : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function RuntimeMatrixQuestion(props) {
  const { question } = props;

  if (isAssessmentMatrix(question)) {
    return <MatrixAssessment {...props} />;
  }

  if (isReadonlyMatrix(question)) {
    return <MatrixReadonlyTable question={question} />;
  }

  return <MatrixCardList question={question} canEdit={props.canEdit} installationCode={props.installationCode} />;
}

function RuntimeReadonlyDynamicPanelChild({ childDef, value, parentKey }) {
  const type = String(childDef?.type || "").trim();

  if (type === "paneldynamic") {
    return (
      <RuntimeReadonlyDynamicPanel
        key={`${parentKey}-${childDef?.name || "paneldynamic"}`}
        definition={childDef}
        value={value}
      />
    );
  }

  if (type === "matrixdynamic") {
    const rows = Array.isArray(value) ? value : [];
    const columns = Array.isArray(childDef?.columns) ? childDef.columns : [];

    if (isDocumentMatrixColumns(columns)) {
      return (
        <ReadonlyDocumentMatrix
          key={`${parentKey}-${childDef?.name || "documents"}`}
          title={normalizeText(childDef?.title)}
          rows={rows}
        />
      );
    }

    return (
      <div key={`${parentKey}-${childDef?.name || "matrix"}`} className="ember-runtime-matrix">
        <div className="ember-runtime-table-shell">
          <table className="ember-runtime-table">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={`${parentKey}-head-${column?.name || index}`}>{column?.title || column?.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row, rowIndex) => (
                  <tr key={`${parentKey}-row-${rowIndex}`}>
                    {columns.map((column, columnIndex) => (
                      <td key={`${parentKey}-cell-${rowIndex}-${column?.name || columnIndex}`}>
                        {getColumnCellDisplayValue(row, column?.name)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={Math.max(1, columns.length)} className="muted">
                    Geen gegevens beschikbaar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}

function RuntimeReadonlyDynamicPanel({ definition, value }) {
  const items = Array.isArray(value) ? value : [];
  const templateElements = Array.isArray(definition?.templateElements) ? definition.templateElements : [];
  const title = normalizeText(definition?.templateTitle);

  if (!items.length) {
    return <div className="ember-runtime-empty">Nog geen gegevens beschikbaar.</div>;
  }

  if (isDocumentGroupValue(items)) {
    return (
      <ReadonlyDocumentGroups
        title={normalizeText(definition?.title)}
        items={items}
      />
    );
  }

  return (
    <div className="ember-runtime-dynamic-list">
      {items.map((item, itemIndex) => {
        const itemKey = `${definition?.name || "panel"}-${itemIndex}`;
        const itemTitle = interpolatePanelTemplate(title, item);

        return (
          <div key={itemKey} className="card ember-runtime-dynamic-card">
            {itemTitle ? <div className="ember-runtime-dynamic-card__title">{itemTitle}</div> : null}

            <div className="ember-runtime-dynamic-card__body">
              {templateElements.map((childDef, childIndex) => {
                const childName = childDef?.valueName || childDef?.name;
                const childValue = childName ? item?.[childName] : null;

                return (
                  <RuntimeReadonlyDynamicPanelChild
                    key={`${itemKey}-${childName || childIndex}`}
                    childDef={childDef}
                    value={childValue}
                    parentKey={`${itemKey}-${childName || childIndex}`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RuntimeQuestion({
  question,
  canEdit,
  installationCode,
  showErrors,
  validationSummary,
  guidanceByQuestion,
  guidanceByMatrixRow,
  onOpenGuidance,
}) {
  if (!isQuestionVisible(question)) return null;

  const type = getQuestionType(question);
  const guidanceItems = getQuestionItemsMap(guidanceByQuestion, question?.name);
  const openGuidance = () =>
    onOpenGuidance?.({
      questionName: question?.name || "",
      questionTitle: getQuestionTitle(question),
      items: guidanceItems,
    });

  if (type === "html") {
    return <RuntimeHtmlQuestion question={question} />;
  }

  if (type === "text") {
    return (
      <RuntimeTextQuestion
        question={question}
        canEdit={canEdit}
        showErrors={showErrors}
        guidanceItems={guidanceItems}
        onOpenGuidance={openGuidance}
      />
    );
  }

  if (type === "comment") {
    return (
      <RuntimeCommentQuestion
        question={question}
        canEdit={canEdit}
        showErrors={showErrors}
        guidanceItems={guidanceItems}
        onOpenGuidance={openGuidance}
      />
    );
  }

  if (type === "dropdown") {
    return (
      <RuntimeDropdownQuestion
        question={question}
        canEdit={canEdit}
        showErrors={showErrors}
        guidanceItems={guidanceItems}
        onOpenGuidance={openGuidance}
      />
    );
  }

  if (type === "radiogroup") {
    return (
      <RuntimeRadioGroupQuestion
        question={question}
        canEdit={canEdit}
        showErrors={showErrors}
        guidanceItems={guidanceItems}
        onOpenGuidance={openGuidance}
      />
    );
  }

  if (type === "boolean") {
    return (
      <RuntimeBooleanQuestion
        question={question}
        canEdit={canEdit}
        showErrors={showErrors}
        guidanceItems={guidanceItems}
        onOpenGuidance={openGuidance}
      />
    );
  }

  if (type === "matrixdynamic") {
    return (
      <RuntimeMatrixQuestion
        question={question}
        canEdit={canEdit}
        installationCode={installationCode}
        showErrors={showErrors}
        validationSummary={validationSummary}
        guidanceByMatrixRow={guidanceByMatrixRow}
        onOpenGuidance={onOpenGuidance}
      />
    );
  }

  if (type === "paneldynamic") {
    return <RuntimeReadonlyDynamicPanel definition={question?.jsonObj || {}} value={question?.value} />;
  }

  return (
    <div className="ember-runtime-unsupported" data-name={question?.name || undefined}>
      {getQuestionTitle(question)} ; type `{type}` wordt nog niet ondersteund in de Ember-runtime.
    </div>
  );
}

function RuntimePanel(props) {
  const { panel, element: _ignoredElement, ...runtimeProps } = props;
  const initialCollapsed =
    panel?.isCollapsed === true ||
    normalizeLower(panel?.state || panel?.jsonObj?.state) === "collapsed";
  const canCollapse = panel?.showCollapseButton === true || panel?.jsonObj?.showCollapseButton === true;
  const [isOpen, setIsOpen] = useState(!initialCollapsed);

  if (!isQuestionVisible(panel)) return null;

  const elements = Array.isArray(panel?.elements) ? panel.elements : [];
  const autoHeaderPanel = isAutoHeaderPanel(panel);
  const title = autoHeaderPanel ? "" : getQuestionTitle(panel);
  const simpleOnly = elements.every((element) => {
    const type = getQuestionType(element);
    return ["text", "comment", "dropdown", "radiogroup"].includes(type);
  });

  return (
    <section
      className={[
        "card",
        "ember-runtime-panel",
        autoHeaderPanel ? "ember-runtime-panel--meta-header" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-name={panel?.name || undefined}
    >
      {title ? (
        canCollapse ? (
          <button
            type="button"
            className="ember-runtime-panel__toggle"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
          >
            <span className="ember-runtime-panel__title">{title}</span>
            <span className="ember-runtime-panel__toggle-icon" aria-hidden="true">
              {isOpen ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
            </span>
          </button>
        ) : (
          <div className="ember-runtime-panel__title">{title}</div>
        )
      ) : null}

      {isOpen ? (
        <div className={`ember-runtime-panel__content ${simpleOnly ? "ember-runtime-panel__content--grid" : ""}`}>
          {elements.map((element, index) => (
            <RuntimeElement
              key={`${panel?.name || "panel"}-${element?.name || index}`}
              {...runtimeProps}
              element={element}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RuntimeElement(props) {
  const { element, panel: _ignoredPanel, ...runtimeProps } = props;

  if (isPanelLike(element)) {
    return <RuntimePanel {...runtimeProps} panel={element} />;
  }

  return (
    <RuntimeQuestion
      question={element}
      canEdit={runtimeProps.canEdit}
      installationCode={runtimeProps.installationCode}
      showErrors={runtimeProps.showErrors}
      validationSummary={runtimeProps.validationSummary}
      guidanceByQuestion={runtimeProps.guidanceByQuestion}
      guidanceByMatrixRow={runtimeProps.guidanceByMatrixRow}
      onOpenGuidance={runtimeProps.onOpenGuidance}
    />
  );
}

export default function EmberRuntimeSurvey({
  model,
  activePageIndex = 0,
  surveyDefinition = null,
  installationCode = "",
  canEdit,
  hasValidatedOnce,
  validationSummary,
  guidanceByQuestion,
  guidanceByMatrixRow,
  onOpenGuidance,
}) {
  const renderVersionForWarnings = useRuntimeRenderVersion(model);

  // Vragen die door een consistentieregel worden gemarkeerd, bijvoorbeeld een berekende
  // beschikbaarheid die onder de eis uitkomt. Puur visueel; de blokkade zelf loopt via
  // de validatiesamenvatting zodat de invuller het oordeel geeft, niet het systeem.
  const warnQuestions = useMemo(
    () => evaluateConsistencyRules(model, surveyDefinition).highlightQuestions,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, surveyDefinition, renderVersionForWarnings]
  );

  useEffect(() => {
    if (!model) return;
    // Zie de toelichting bij de matrix; het model is extern muteerbaar en leidend.
    model.installationCode = installationCode || "";
  }, [model, installationCode]);

  const visiblePages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];
  const parsedPageIndex = Number(activePageIndex);
  const safePageIndex =
    Number.isInteger(parsedPageIndex) && parsedPageIndex >= 0 && parsedPageIndex < visiblePages.length
      ? parsedPageIndex
      : 0;

  const currentPage = visiblePages[safePageIndex] || model?.currentPage || null;
  const pageIndex = safePageIndex;
  const pageTitle = useMemo(() => getPageTitle(currentPage, pageIndex), [currentPage, pageIndex]);
  const elements = Array.isArray(currentPage?.elements) ? currentPage.elements.filter(isQuestionVisible) : [];

  useEffect(() => {
    if (!model || !currentPage) return;
    if (model.currentPage === currentPage) return;

    try {
      // React blijft leidend voor wat er getoond wordt; deze schrijfactie houdt het
      // survey-core model in de pas voor logica die zelf currentPage uitleest.
      model.currentPage = currentPage;
    } catch {
      // Een model dat de paginawissel weigert mag het renderen niet blokkeren.
    }
  }, [model, currentPage]);

  if (!currentPage) {
    return <div className="muted">Geen formulierpagina beschikbaar.</div>;
  }

  return (
    <RuntimeWarningsContext.Provider value={warnQuestions}>
    <div className="ember-runtime-page" data-page-name={currentPage?.name || undefined}>
      <div className="ember-runtime-page__head">
        <div className="ember-runtime-page__title">{pageTitle}</div>
      </div>

      <div className="ember-runtime-page__body">
        {elements.map((element, index) => (
          <RuntimeElement
            key={`${currentPage?.name || "page"}-${element?.name || index}`}
            element={element}
            canEdit={canEdit}
            installationCode={installationCode}
            showErrors={hasValidatedOnce}
            validationSummary={validationSummary}
            guidanceByQuestion={guidanceByQuestion}
            guidanceByMatrixRow={guidanceByMatrixRow}
            onOpenGuidance={onOpenGuidance}
          />
        ))}
      </div>
    </div>
    </RuntimeWarningsContext.Provider>
  );
}
