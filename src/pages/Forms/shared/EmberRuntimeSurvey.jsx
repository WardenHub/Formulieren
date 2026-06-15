import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { CircleHelpIcon } from "@/components/ui/circle-help";
import { DeleteIcon } from "@/components/ui/delete";
import { PlusIcon } from "@/components/ui/plus";

import { getMatrixCellQuestion, getMatrixVisibleRows } from "./validation.jsx";
import { getPageTitle, getQuestionTitle } from "./surveyCore.jsx";

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length ? text : "";
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

function getInputType(question) {
  const inputType = String(question?.inputType || question?.jsonObj?.inputType || "").trim();
  if (inputType === "date" || inputType === "time" || inputType === "number") return inputType;
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

function isAssessmentMatrix(question) {
  const columns = Array.isArray(question?.columns) ? question.columns : [];
  const names = new Set(
    columns.map((column) =>
      String(column?.name || "")
        .trim()
        .toLowerCase()
    )
  );

  return (
    names.has("item_code") &&
    names.has("onderwerp") &&
    names.has("voldoet") &&
    names.has("opmerking")
  );
}

function isReadonlyMatrix(question) {
  if (question?.canAddRow || question?.canRemoveRows) return false;
  const columns = Array.isArray(question?.columns) ? question.columns : [];
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
  const columns = Array.isArray(question?.columns) ? question.columns : [];
  return columns.map((column, index) => ({
    key: String(column?.name || `col-${index}`),
    title: normalizeText(column?.title || column?.name || `Kolom ${index + 1}`),
    width: String(column?.width || "").trim(),
  }));
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

function getColumnCellDisplayValue(rowData, columnName) {
  const value = rowData?.[columnName];
  if (value == null) return "";
  return String(value);
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
      <div className="ember-runtime-segment-row">
        {choices.map((choice) => {
          const choiceValue = choice.value == null ? "" : String(choice.value);
          const selected = value === normalizeText(choiceValue);

          return (
            <button
              key={choice.key}
              type="button"
              className={`ember-runtime-segment ${selected ? "ember-runtime-segment--selected" : ""}`}
              onClick={() => {
                if (readOnly) return;
                setQuestionValue(question, choice.value);
              }}
              disabled={readOnly}
              aria-pressed={selected}
            >
              {choice.text}
            </button>
          );
        })}
      </div>
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

function MatrixReadonlyTable({ question }) {
  const columns = buildReadonlyMatrixColumns(question);
  const rows = buildReadonlyMatrixRows(question);
  const titleVisible = String(question?.titleLocation || "").trim().toLowerCase() !== "hidden";

  return (
    <div className="ember-runtime-matrix" data-name={question?.name || undefined}>
      {titleVisible && normalizeText(question?.title) ? (
        <div className="ember-runtime-matrix__head">
          <div className="ember-runtime-matrix__title">{normalizeText(question?.title)}</div>
        </div>
      ) : null}

      <div className="ember-runtime-table-shell">
        <table className="ember-runtime-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {columns.map((column) => (
                  <td key={`${row.key}-${column.key}`}>{getColumnCellDisplayValue(row.data, column.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixAssessment({ question, canEdit, showErrors, validationSummary, guidanceByMatrixRow, onOpenGuidance }) {
  const rows = getMatrixVisibleRows(question);
  const questionName = String(question?.name || "").trim();

  return (
    <div className="ember-runtime-assessment" data-name={questionName || undefined}>
      <div className="ember-runtime-assessment__header ember-runtime-assessment__grid">
        <div>Nr</div>
        <div aria-hidden="true" />
        <div>Onderwerp</div>
        <div>Voldoet *</div>
        <div>Opmerking</div>
      </div>

      <div className="ember-runtime-assessment__rows">
        {rows.map((row, rowIndex) => {
          const rowData = row?.value && typeof row.value === "object" ? row.value : {};
          const nrQuestion = getMatrixCellQuestion(row, "item_code");
          const topicQuestion = getMatrixCellQuestion(row, "onderwerp");
          const answerQuestion = getMatrixCellQuestion(row, "voldoet");
          const commentQuestion = getMatrixCellQuestion(row, "opmerking");
          const guidanceItems = getMatrixGuidanceItems(
            guidanceByMatrixRow,
            questionName,
            rowData,
            rowIndex
          );

          const answerErrors = getMatrixRowErrors(validationSummary, questionName, rowIndex, "voldoet");
          const commentErrors = getMatrixRowErrors(validationSummary, questionName, rowIndex, "opmerking");
          const answerValue = normalizeText(answerQuestion?.value);
          const readOnly = isQuestionReadOnly(answerQuestion, canEdit);
          const commentReadOnly = isQuestionReadOnly(commentQuestion, canEdit);
          const choices = getChoiceItems(answerQuestion);
          const matrixRowLabel = [rowData?.item_code, rowData?.onderwerp].filter(Boolean).join(" ; ");

          return (
            <div key={`${questionName}-row-${rowIndex}`} className="ember-runtime-assessment__row">
              <div className="ember-runtime-assessment__grid">
                <div className="ember-runtime-assessment__nr">
                  <div className="ember-runtime-readonly-cell">
                    {getCurrentValue(nrQuestion) || rowData?.item_code || rowIndex + 1}
                  </div>
                </div>

                <div className="ember-runtime-assessment__guidance">
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

                <div className="ember-runtime-assessment__topic">
                  <div className="ember-runtime-readonly-cell ember-runtime-readonly-cell--topic">
                    {getCurrentValue(topicQuestion) || rowData?.onderwerp || ""}
                  </div>
                </div>

                <div className="ember-runtime-assessment__answer">
                  <div className="ember-runtime-segment-row ember-runtime-segment-row--tight">
                    {choices.map((choice) => {
                      const choiceValue = choice.value == null ? "" : String(choice.value);
                      const selected = answerValue === normalizeText(choiceValue);

                      return (
                        <button
                          key={`${questionName}-${rowIndex}-${choice.key}`}
                          type="button"
                          className={`ember-runtime-segment ember-runtime-segment--touch ${
                            selected ? "ember-runtime-segment--selected" : ""
                          }`}
                          onClick={() => {
                            if (readOnly) return;
                            setQuestionValue(answerQuestion, choice.value);
                          }}
                          disabled={readOnly}
                          aria-pressed={selected}
                        >
                          {choice.text}
                        </button>
                      );
                    })}
                  </div>
                  <FieldErrors errors={showErrors ? answerErrors : []} />
                </div>

                <div className="ember-runtime-assessment__comment">
                  <textarea
                    className="ember-runtime-textarea ember-runtime-textarea--matrix"
                    value={commentQuestion?.value == null ? "" : String(commentQuestion.value)}
                    readOnly={commentReadOnly}
                    disabled={commentReadOnly}
                    rows={3}
                    placeholder={normalizeText(commentQuestion?.placeholder || commentQuestion?.placeHolder) || undefined}
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
  const type = String(cellQuestion?.getType?.() || column?.cellType || "text").trim();
  const readOnly = isQuestionReadOnly(cellQuestion, canEdit);
  const value = cellQuestion?.value ?? "";
  const title = normalizeText(column?.title || column?.name || "");

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

function MatrixCardList({ question, canEdit }) {
  const rows = getMatrixVisibleRows(question);
  const columns = Array.isArray(question?.columns) ? question.columns : [];
  const titleVisible = String(question?.titleLocation || "").trim().toLowerCase() !== "hidden";

  return (
    <div className="ember-runtime-matrix" data-name={question?.name || undefined}>
      {(titleVisible && normalizeText(question?.title)) || question?.canAddRow ? (
        <div className="ember-runtime-matrix__head">
          <div className="ember-runtime-matrix__title">{normalizeText(question?.title)}</div>
          {question?.canAddRow ? (
            <button
              type="button"
              className="btn btn-secondary ember-runtime-add-btn"
              onClick={() => question.addRow()}
              disabled={!canEdit}
            >
              <PlusIcon size={16} />
              <span>{normalizeText(question?.addRowText) || "Regel toevoegen"}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="ember-runtime-card-list">
        {rows.map((row, rowIndex) => {
          const rowQuestions = columns.map((column) => ({
            column,
            cellQuestion: getMatrixCellQuestion(row, column?.name),
          }));

          return (
            <div key={`${question?.name || "matrix"}-row-${rowIndex}`} className="card ember-runtime-row-card">
              <div className="ember-runtime-row-card__head">
                <div className="ember-runtime-row-card__title">
                  {normalizeText(question?.title) || "Regel"} {rowIndex + 1}
                </div>

                {question?.canRemoveRows ? (
                  <button
                    type="button"
                    className="btn btn-secondary ember-runtime-remove-btn"
                    onClick={() => question.removeRow(rowIndex)}
                    disabled={!canEdit}
                  >
                    <DeleteIcon size={16} />
                    <span>Verwijderen</span>
                  </button>
                ) : null}
              </div>

              <div className="ember-runtime-row-card__grid">
                {rowQuestions.map(({ column, cellQuestion }) => (
                  <MatrixCardField
                    key={`${question?.name || "matrix"}-${rowIndex}-${column?.name || "col"}`}
                    column={column}
                    cellQuestion={cellQuestion}
                    canEdit={canEdit}
                  />
                ))}
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

  return <MatrixCardList question={question} canEdit={props.canEdit} />;
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
              {rows.map((row, rowIndex) => (
                <tr key={`${parentKey}-row-${rowIndex}`}>
                  {columns.map((column, columnIndex) => (
                    <td key={`${parentKey}-cell-${rowIndex}-${column?.name || columnIndex}`}>
                      {getColumnCellDisplayValue(row, column?.name)}
                    </td>
                  ))}
                </tr>
              ))}
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
  showErrors,
  validationSummary,
  guidanceByQuestion,
  guidanceByMatrixRow,
  onOpenGuidance,
}) {
  if (!isQuestionVisible(question)) return null;

  const type = String(question?.getType?.() || question?.jsonObj?.type || "").trim();
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
  const { panel } = props;
  if (!isQuestionVisible(panel)) return null;

  const elements = Array.isArray(panel?.elements) ? panel.elements : [];
  const title = getQuestionTitle(panel);
  const simpleOnly = elements.every((element) => {
    const type = String(element?.getType?.() || element?.jsonObj?.type || "").trim();
    return ["text", "comment", "dropdown", "radiogroup"].includes(type);
  });

  return (
    <section className="card ember-runtime-panel" data-name={panel?.name || undefined}>
      {title ? <div className="ember-runtime-panel__title">{title}</div> : null}
      <div className={`ember-runtime-panel__content ${simpleOnly ? "ember-runtime-panel__content--grid" : ""}`}>
        {elements.map((element, index) => (
          <RuntimeElement key={`${panel?.name || "panel"}-${element?.name || index}`} element={element} {...props} />
        ))}
      </div>
    </section>
  );
}

function RuntimeElement(props) {
  const { element } = props;

  if (isPanelLike(element)) {
    return <RuntimePanel panel={element} {...props} />;
  }

  return (
    <RuntimeQuestion
      question={element}
      canEdit={props.canEdit}
      showErrors={props.showErrors}
      validationSummary={props.validationSummary}
      guidanceByQuestion={props.guidanceByQuestion}
      guidanceByMatrixRow={props.guidanceByMatrixRow}
      onOpenGuidance={props.onOpenGuidance}
    />
  );
}

export default function EmberRuntimeSurvey({
  model,
  canEdit,
  hasValidatedOnce,
  validationSummary,
  guidanceByQuestion,
  guidanceByMatrixRow,
  onOpenGuidance,
}) {
  useRuntimeRenderVersion(model);

  const currentPage = model?.currentPage || null;
  const visiblePages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];
  const pageIndex = Math.max(0, visiblePages.indexOf(currentPage));
  const pageTitle = useMemo(() => getPageTitle(currentPage, pageIndex), [currentPage, pageIndex]);
  const elements = Array.isArray(currentPage?.elements) ? currentPage.elements.filter(isQuestionVisible) : [];

  if (!currentPage) {
    return <div className="muted">Geen formulierpagina beschikbaar.</div>;
  }

  return (
    <div className="ember-runtime-page">
      <div className="ember-runtime-page__head">
        <div className="ember-runtime-page__title">{pageTitle}</div>
      </div>

      <div className="ember-runtime-page__body">
        {elements.map((element, index) => (
          <RuntimeElement
            key={`${currentPage?.name || "page"}-${element?.name || index}`}
            element={element}
            canEdit={canEdit}
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
