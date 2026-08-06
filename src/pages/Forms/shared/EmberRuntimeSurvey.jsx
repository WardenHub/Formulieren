import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { DeleteIcon } from "@/components/ui/delete";
import { DownloadIcon } from "@/components/ui/download";
import { PlusIcon } from "@/components/ui/plus";
import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";

import { getMatrixCellQuestion, getMatrixVisibleRows } from "./validation.jsx";
import { getPageTitle, getQuestionTitle } from "./surveyCore.jsx";

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

function isAssessmentMatrix(question) {
  const columns = getMatrixColumns(question);
  const names = new Set(
    columns.map((column) =>
      String(column?.name || "")
        .trim()
        .toLowerCase()
    )
  );

  return (
    (names.has("item_code") || names.has("nr") || names.has("code")) &&
    names.has("onderwerp") &&
    names.has("voldoet") &&
    names.has("opmerking")
  );
}

function getMatrixColumnKeys(question) {
  return new Set(
    getMatrixColumns(question).flatMap((column) => {
      const names = [column?.name, column?.title]
        .map((value) => normalizeLooseKey(value))
        .filter(Boolean);
      return names;
    })
  );
}

function isEnergySupplyMatrix(question) {
  const questionName = normalizeLooseKey(question?.name);
  if (questionName === "esregels") return true;

  const keys = getMatrixColumnKeys(question);
  return (
    keys.has("plaatsingsdatum") &&
    keys.has("schakeling") &&
    (keys.has("merktype") || keys.has("merk")) &&
    (keys.has("overbrugginguren") || keys.has("overbrugging")) &&
    (keys.has("laadspanningv") || keys.has("laadspanning"))
  );
}

function isAvailabilityPeriodsMatrix(question) {
  const questionName = normalizeLooseKey(question?.name);
  if (questionName.includes("buitenbedrijfstelling")) return true;

  const keys = getMatrixColumnKeys(question);
  return (
    keys.has("datum") &&
    (keys.has("tijdbegin") || keys.has("begin")) &&
    (keys.has("tijdeinde") || keys.has("einde")) &&
    (keys.has("tijdsduurdagen") || keys.has("tijdsduur")) &&
    (keys.has("omschrijving") || keys.has("toelichting"))
  );
}

function isPerformanceReadonlyMatrix(question) {
  const questionName = normalizeLooseKey(question?.name);
  if (questionName === "performancedata") return true;

  const keys = getMatrixColumnKeys(question);
  return (
    keys.has("prgebruikersfunctiekey") ||
    keys.has("prgebruikersfunctie") ||
    (keys.has("prlabel") && keys.has("prdoormelding")) ||
    (keys.has("gebruikersfunctie") && keys.has("doormelding"))
  );
}

function getMatrixLayoutVariant(question) {
  if (isAdditionalRemarksMatrix(question)) return "additional-remarks";
  if (isEnergySupplyMatrix(question)) return "energy-supply";
  if (isAvailabilityPeriodsMatrix(question)) return "availability-periods";
  return "default";
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
  return errors
    .map((item) => normalizeText(item?.text || item))
    .filter(Boolean);
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

function isAdditionalRemarksMatrix(question) {
  const questionName = normalizeLower(question?.name);
  if (questionName.includes("aanvullende_opmerkingen")) return true;

  const columnNames = new Set(
    getMatrixColumns(question).map((column) => normalizeLower(column?.name))
  );

  return columnNames.has("omschrijving") && columnNames.has("gevolg_certificaat");
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

function getReadonlyTableCellClass(column) {
  const key = normalizeLower(column?.key || column?.name);
  const title = normalizeLower(column?.title || column?.name);

  if (
    key.includes("gebruikersfunctie") ||
    title.includes("gebruikersfunctie") ||
    key.includes("doormelding") ||
    title.includes("doormelding") ||
    key === "pr_label" ||
    title === "label"
  ) {
    return "ember-runtime-table-cell--nowrap";
  }

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
}) {
  const title = getQuestionTitle(question);
  const description = normalizeText(question?.description || question?.locDescription?.renderedHtml);
  const showLabel = String(question?.titleLocation || "").trim().toLowerCase() !== "hidden";

  return (
    <div
      className={`ember-runtime-field ${compactLabel ? "ember-runtime-field--compact" : ""}`}
      data-name={question?.name || undefined}
    >
      {showLabel ? (
        <div className="ember-runtime-field__head">
          <div className="ember-runtime-field__title-wrap">
            <label className="ember-runtime-field__label">
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
  const errors = getQuestionErrors(question, showErrors);
  const placeholder = normalizeText(question?.placeholder || question?.placeHolder);

  return (
    <RuntimeFieldShell
      question={question}
      errors={errors}
      guidanceItems={guidanceItems}
      onOpenGuidance={onOpenGuidance}
    >
      <input
        type={inputType}
        className="ember-runtime-input"
        value={value == null ? "" : String(value)}
        readOnly={readOnly}
        disabled={readOnly}
        placeholder={placeholder || undefined}
        onChange={(event) => setQuestionValue(question, event.target.value)}
      />
    </RuntimeFieldShell>
  );
}

function RuntimeCommentQuestion({ question, canEdit, showErrors, guidanceItems, onOpenGuidance }) {
  const value = getCurrentValue(question);
  const readOnly = isQuestionReadOnly(question, canEdit);
  const errors = getQuestionErrors(question, showErrors);
  const placeholder = normalizeText(question?.placeholder || question?.placeHolder);

  return (
    <RuntimeFieldShell
      question={question}
      errors={errors}
      guidanceItems={guidanceItems}
      onOpenGuidance={onOpenGuidance}
    >
      <textarea
        className="ember-runtime-textarea"
        value={value == null ? "" : String(value)}
        readOnly={readOnly}
        disabled={readOnly}
        rows={Number(question?.rows) > 0 ? Number(question.rows) : 4}
        placeholder={placeholder || undefined}
        onChange={(event) => setQuestionValue(question, event.target.value)}
      />
    </RuntimeFieldShell>
  );
}

function RuntimeDropdownQuestion({ question, canEdit, showErrors, guidanceItems, onOpenGuidance }) {
  const value = getCurrentValue(question);
  const readOnly = isQuestionReadOnly(question, canEdit);
  const errors = getQuestionErrors(question, showErrors);
  const choices = getChoiceItems(question);

  return (
    <RuntimeFieldShell
      question={question}
      errors={errors}
      guidanceItems={guidanceItems}
      onOpenGuidance={onOpenGuidance}
    >
      <select
        className="ember-runtime-select"
        value={value == null ? "" : String(value)}
        disabled={readOnly}
        onChange={(event) => setQuestionValue(question, event.target.value)}
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

function RuntimeRadioGroupQuestion({ question, canEdit, showErrors, guidanceItems, onOpenGuidance }) {
  const value = normalizeText(getCurrentValue(question));
  const readOnly = isQuestionReadOnly(question, canEdit);
  const errors = getQuestionErrors(question, showErrors);
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
        onChange={(nextValue) => setQuestionValue(question, nextValue)}
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

function SegmentButtons({ choices, value, readOnly, onChange }) {
  return (
    <div className="ember-runtime-segment-row">
      {choices.map((choice) => {
        const choiceValue = choice.value == null ? "" : String(choice.value);
        const selected = normalizeText(value) === normalizeText(choiceValue);
        const toneClass = getAnswerToneClass(choiceValue || choice.text);

        return (
          <button
            key={choice.key}
            type="button"
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
            disabled={readOnly}
            aria-pressed={selected}
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
      className="ember-runtime-input"
      value={value == null ? "" : String(value)}
      readOnly={readOnly}
      disabled={readOnly}
      placeholder={placeholder || undefined}
      onChange={(event) => setQuestionValue(cellQuestion, event.target.value)}
    />
  );
}

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

          return (
            <div key={`${questionName}-row-${rowIndex}`} className="ember-runtime-assessment__row">
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
                        questionTitle: matrixRowLabel || getQuestionTitle(question),
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
                  <FieldErrors errors={showErrors ? answerErrors : []} />
                </div>

                <div className="ember-runtime-assessment__cell ember-runtime-assessment__comment">
                  <div className="ember-runtime-assessment__mobile-label">{commentTitle}</div>
                  <textarea
                    className="ember-runtime-textarea ember-runtime-textarea--matrix"
                    value={commentQuestion?.value == null ? "" : String(commentQuestion.value)}
                    readOnly={commentReadOnly}
                    disabled={commentReadOnly}
                    rows={Number(commentColumn?.rows) > 0 ? Number(commentColumn.rows) : 3}
                    placeholder={normalizeText(commentColumn?.placeholder || commentColumn?.placeHolder) || undefined}
                    onChange={(event) => setQuestionValue(commentQuestion, event.target.value)}
                  />
                  <FieldErrors errors={showErrors ? commentErrors : []} />
                </div>
              </div>
            </div>
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

  return (
    <label className="ember-runtime-card-field">
      <span className="ember-runtime-card-field__label">{title}</span>
      <input
        type={inputType}
        className="ember-runtime-input"
        value={value == null ? "" : String(value)}
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

function MatrixCardList({ question, canEdit, installationCode = "" }) {
  const rows = getMatrixVisibleRows(question);
  const columns = getMatrixColumns(question).filter((column) => column?.visible !== false && column?.isVisible !== false);
  const titleVisible = String(question?.titleLocation || "").trim().toLowerCase() !== "hidden";
  const canAddRows = canEdit && question?.isReadOnly !== true && question?.readOnly !== true && question?.canAddRow !== false;
  const canRemoveRows = canEdit && question?.isReadOnly !== true && question?.readOnly !== true && question?.canRemoveRows !== false;
  const layoutVariant = getMatrixLayoutVariant(question);
  const additionalRemarks = layoutVariant === "additional-remarks";
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
          const rowQuestions = columns.map((column) => ({
            column,
            cellQuestion: getMatrixCellQuestion(row, column?.name),
          }));

          return (
            <div
              key={`${question?.name || "matrix"}-row-${rowIndex}`}
              className={[
                "card",
                "ember-runtime-row-card",
                additionalRemarks ? "ember-runtime-row-card--additional-remarks" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="ember-runtime-row-card__head">
                <div className="ember-runtime-row-card__title">
                  {additionalRemarks ? `${rowIndex + 1}` : `${normalizeText(question?.title) || "Regel"} ${rowIndex + 1}`}
                </div>

                {canRemoveRows && typeof question.removeRow === "function" ? (
                  <button
                    type="button"
                    className="btn btn-secondary ember-runtime-remove-btn"
                    onClick={() => question.removeRow(rowIndex)}
                  >
                    <DeleteIcon size={16} />
                    <span>Verwijderen</span>
                  </button>
                ) : null}
              </div>

              <div
                className={[
                  "ember-runtime-row-card__grid",
                  additionalRemarks ? "ember-runtime-row-card__grid--additional-remarks" : "",
                  layoutVariant === "energy-supply" ? "ember-runtime-row-card__grid--energy-supply" : "",
                  layoutVariant === "availability-periods" ? "ember-runtime-row-card__grid--availability-periods" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {rowQuestions.map(({ column, cellQuestion }) => {
                  const extraClass = getMatrixFieldLayoutClass(layoutVariant, column);

                  return (
                    <div
                      key={`${question?.name || "matrix"}-${rowIndex}-${column?.name || "col"}`}
                      className={extraClass}
                    >
                      <MatrixCardField
                        column={column}
                        cellQuestion={cellQuestion}
                        canEdit={canEdit}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
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
  installationCode = "",
  canEdit,
  hasValidatedOnce,
  validationSummary,
  guidanceByQuestion,
  guidanceByMatrixRow,
  onOpenGuidance,
}) {
  useRuntimeRenderVersion(model);

  useEffect(() => {
    if (!model) return;
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
      model.currentPage = currentPage;
    } catch {
      // React rendering blijft leidend.
    }
  }, [model, currentPage]);

  if (!currentPage) {
    return <div className="muted">Geen formulierpagina beschikbaar.</div>;
  }

  return (
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
  );
}
