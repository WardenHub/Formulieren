// src/pages/Forms/shared/assistantFieldMap.jsx

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function readQuestionValue(model, question) {
  if (!question?.name) return undefined;

  try {
    const value = model?.getValue?.(question.name);
    if (value !== undefined) return value;
  } catch {
    // ignore
  }

  if (question.value !== undefined) return question.value;
  if (question.defaultValue !== undefined) return question.defaultValue;

  return undefined;
}

function normalizeChoice(choice) {
  if (choice && typeof choice === "object") {
    return {
      value: choice.value ?? choice.id ?? choice.text ?? choice.title ?? "",
      text: choice.text ?? choice.label ?? choice.title ?? choice.value ?? "",
    };
  }

  return {
    value: choice,
    text: choice,
  };
}

function getColumnChoices(column) {
  return asArray(column?.choices).map(normalizeChoice);
}

function getQuestionChoices(question) {
  return asArray(question?.choices).map(normalizeChoice);
}

function getPageInfoFromQuestion(model, question) {
  const page = question?.page || null;
  const visiblePages = asArray(model?.visiblePages);
  const allPages = asArray(model?.pages);

  let pageIndex = page ? visiblePages.indexOf(page) : -1;
  if (pageIndex < 0 && page) pageIndex = allPages.indexOf(page);

  return {
    pageIndex: pageIndex >= 0 ? pageIndex : null,
    pageNumber: pageIndex >= 0 ? pageIndex + 1 : null,
    pageName: page?.name || null,
    pageTitle: page?.title || page?.name || null,
  };
}

function getPanelInfo(question) {
  let parent = question?.parent || null;

  while (parent) {
    const type = String(parent?.getType?.() || parent?.type || "").toLowerCase();

    if (type.includes("panel")) {
      return {
        panelName: parent.name || null,
        panelTitle: parent.title || parent.name || null,
      };
    }

    parent = parent.parent || null;
  }

  return {
    panelName: null,
    panelTitle: null,
  };
}

function getRowsForMatrix(model, question) {
  const value = readQuestionValue(model, question);

  if (Array.isArray(value)) return value;

  const qDefault = question?.defaultValue;
  if (Array.isArray(qDefault)) return qDefault;

  const jsonDefault = question?.jsonObj?.defaultValue;
  if (Array.isArray(jsonDefault)) return jsonDefault;

  return [];
}

function getMatrixColumns(question) {
  if (Array.isArray(question?.columns)) return question.columns;
  if (Array.isArray(question?.jsonObj?.columns)) return question.jsonObj.columns;
  return [];
}

function getMatrixColumnName(column) {
  return column?.name || column?.cellName || column?.valueName || null;
}

function isAnswerColumn(column) {
  const name = String(getMatrixColumnName(column) || "").toLowerCase();
  const title = String(column?.title || "").toLowerCase();
  return name === "voldoet" || title.includes("voldoet");
}

function isRemarkColumn(column) {
  const name = String(getMatrixColumnName(column) || "").toLowerCase();
  const title = String(column?.title || "").toLowerCase();

  return (
    name === "opmerking" ||
    name === "omschrijving" ||
    title.includes("opmerking") ||
    title.includes("omschrijving")
  );
}

function shouldExposeMatrixColumn(column) {
  return isAnswerColumn(column) || isRemarkColumn(column);
}

function buildMatrixCellField(model, question, row, rowIndex, column, pageInfo, panelInfo) {
  const matrixName = question.name;
  const columnName = getMatrixColumnName(column);
  const itemCode = cleanText(row?.item_code || row?.itemCode || "");
  const onderwerp = cleanText(row?.onderwerp || row?.title || row?.omschrijving || "");
  const value = row?.[columnName];

  const titleBits = [
    itemCode,
    onderwerp,
    column?.title || columnName,
  ].filter(Boolean);

  return {
    kind: "matrix_cell",
    name: `${matrixName}.${rowIndex}.${columnName}`,
    questionName: matrixName,
    matrixName,
    matrixRowIndex: rowIndex,
    matrixRowKey: itemCode || String(rowIndex),
    matrixColumnName: columnName,
    target_path: `${matrixName}[${rowIndex}].${columnName}`,
    targetLabel: titleBits.join(" ; "),
    title: titleBits.join(" ; "),
    itemCode,
    rowTitle: onderwerp,
    onderwerp,
    value,
    choices: getColumnChoices(column),
    type: column?.cellType || column?.type || "text",
    visible: question.visible !== false,
    readOnly: Boolean(question.readOnly || column?.readOnly),
    ...pageInfo,
    ...panelInfo,
  };
}

function buildMatrixAppendField(question, pageInfo, panelInfo) {
  const matrixName = question.name;

  return {
    kind: "matrix_append",
    name: `${matrixName}.__append__`,
    questionName: matrixName,
    matrixName,
    target_path: matrixName,
    targetLabel: `${question.title || question.name} ; nieuwe regel`,
    title: `${question.title || question.name} ; nieuwe regel`,
    columns: getMatrixColumns(question).map((column) => ({
      name: getMatrixColumnName(column),
      title: column?.title || getMatrixColumnName(column),
      cellType: column?.cellType || column?.type || "text",
      choices: getColumnChoices(column),
    })),
    visible: question.visible !== false,
    readOnly: Boolean(question.readOnly),
    allowAddRows: Boolean(question.allowAddRows),
    ...pageInfo,
    ...panelInfo,
  };
}

function buildNormalQuestionField(model, question, pageInfo, panelInfo) {
  return {
    kind: "question",
    name: question.name,
    questionName: question.name,
    target_path: question.name,
    targetLabel: question.title || question.name,
    title: question.title || question.name,
    value: readQuestionValue(model, question),
    choices: getQuestionChoices(question),
    type: question.getType?.() || question.inputType || question.type || "question",
    visible: question.visible !== false,
    readOnly: Boolean(question.readOnly),
    ...pageInfo,
    ...panelInfo,
  };
}

export function buildAssistantFieldMapFromSurvey(model) {
  if (!model || typeof model.getAllQuestions !== "function") return [];

  const result = [];
  const questions = asArray(model.getAllQuestions());

  for (const question of questions) {
    if (!question?.name) continue;
    if (question.visible === false) continue;

    const qType = String(question.getType?.() || question.type || "").toLowerCase();
    const pageInfo = getPageInfoFromQuestion(model, question);
    const panelInfo = getPanelInfo(question);

    if (qType.includes("matrixdynamic")) {
      const rows = getRowsForMatrix(model, question);
      const columns = getMatrixColumns(question);

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || {};

        for (const column of columns) {
          if (!shouldExposeMatrixColumn(column)) continue;

          const columnName = getMatrixColumnName(column);
          if (!columnName) continue;

          result.push(buildMatrixCellField(model, question, row, rowIndex, column, pageInfo, panelInfo));
        }
      }

      if (question.allowAddRows) {
        result.push(buildMatrixAppendField(question, pageInfo, panelInfo));
      }

      continue;
    }

    result.push(buildNormalQuestionField(model, question, pageInfo, panelInfo));
  }

  return result;
}

function walkSurveyElements(elements, ctx, result) {
  for (const el of asArray(elements)) {
    const type = String(el?.type || "").toLowerCase();

    if (type === "panel") {
      walkSurveyElements(el.elements, {
        ...ctx,
        panelName: el.name || ctx.panelName || null,
        panelTitle: el.title || el.name || ctx.panelTitle || null,
      }, result);
      continue;
    }

    if (type === "matrixdynamic") {
      const rows = asArray(el.defaultValue);
      const columns = asArray(el.columns);

      rows.forEach((row, rowIndex) => {
        columns.forEach((column) => {
          if (!shouldExposeMatrixColumn(column)) return;

          const columnName = getMatrixColumnName(column);
          if (!columnName) return;

          result.push({
            kind: "matrix_cell",
            name: `${el.name}.${rowIndex}.${columnName}`,
            questionName: el.name,
            matrixName: el.name,
            matrixRowIndex: rowIndex,
            matrixRowKey: cleanText(row?.item_code || String(rowIndex)),
            matrixColumnName: columnName,
            target_path: `${el.name}[${rowIndex}].${columnName}`,
            targetLabel: [row?.item_code, row?.onderwerp, column?.title || columnName].filter(Boolean).join(" ; "),
            title: [row?.item_code, row?.onderwerp, column?.title || columnName].filter(Boolean).join(" ; "),
            itemCode: cleanText(row?.item_code || ""),
            rowTitle: cleanText(row?.onderwerp || ""),
            onderwerp: cleanText(row?.onderwerp || ""),
            value: row?.[columnName],
            choices: getColumnChoices(column),
            type: column?.cellType || "text",
            visible: true,
            readOnly: Boolean(el.readOnly || column?.readOnly),
            ...ctx,
          });
        });
      });

      if (el.allowAddRows) {
        result.push({
          kind: "matrix_append",
          name: `${el.name}.__append__`,
          questionName: el.name,
          matrixName: el.name,
          target_path: el.name,
          targetLabel: `${el.title || el.name} ; nieuwe regel`,
          title: `${el.title || el.name} ; nieuwe regel`,
          columns: columns.map((column) => ({
            name: getMatrixColumnName(column),
            title: column?.title || getMatrixColumnName(column),
            cellType: column?.cellType || "text",
            choices: getColumnChoices(column),
          })),
          visible: true,
          readOnly: Boolean(el.readOnly),
          allowAddRows: true,
          ...ctx,
        });
      }

      continue;
    }

    if (el?.name) {
      result.push({
        kind: "question",
        name: el.name,
        questionName: el.name,
        target_path: el.name,
        targetLabel: el.title || el.name,
        title: el.title || el.name,
        value: el.defaultValue,
        choices: getQuestionChoices(el),
        type: el.type || "question",
        visible: true,
        readOnly: Boolean(el.readOnly),
        ...ctx,
      });
    }
  }
}

export function buildAssistantFieldMapFromSurveyJson(surveyJson) {
  const survey = typeof surveyJson === "string" ? JSON.parse(surveyJson) : surveyJson;
  const result = [];

  asArray(survey?.pages).forEach((page, pageIndex) => {
    walkSurveyElements(page.elements, {
      pageIndex,
      pageNumber: pageIndex + 1,
      pageName: page.name || null,
      pageTitle: page.title || page.name || null,
      panelName: null,
      panelTitle: null,
    }, result);
  });

  return result;
}

function parseJsonMaybe(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function unwrapJsonValue(value) {
  const parsed = parseJsonMaybe(value, value);

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Object.prototype.hasOwnProperty.call(parsed, "value") &&
    Object.keys(parsed).length === 1
  ) {
    return parsed.value;
  }

  return parsed;
}

function getPatchNewValue(patch) {
  if (patch?.new_value !== undefined) return patch.new_value;
  if (patch?.newValue !== undefined) return patch.newValue;
  return unwrapJsonValue(patch?.new_value_json);
}

function getPatchOldValue(patch) {
  if (patch?.old_value !== undefined) return patch.old_value;
  if (patch?.oldValue !== undefined) return patch.oldValue;
  return unwrapJsonValue(patch?.old_value_json);
}

function parseMatrixTargetPath(path) {
  const m = String(path || "").match(/^([^[.\s]+)\[(\d+)\]\.([A-Za-z0-9_]+)$/);
  if (!m) return null;

  return {
    matrixName: m[1],
    rowIndex: Number(m[2]),
    columnName: m[3],
  };
}

function cloneRows(rows) {
  return asArray(rows).map((row) => ({ ...(row || {}) }));
}

export function applyAssistantPatchToSurvey(model, patch) {
  if (!model || !patch) {
    return { changed: false, reason: "model_or_patch_missing" };
  }

  const op = String(patch.patch_op || patch.patchOp || "SET").toUpperCase();
  const targetKind = String(patch.target_kind || patch.targetKind || "").toUpperCase();
  const targetPath = patch.target_path || patch.targetPath || "";
  const newValue = getPatchNewValue(patch);

  if (op === "APPEND_ROW" || targetKind === "MATRIX_ROW") {
    const matrixName =
      patch.matrix_name ||
      patch.matrixName ||
      targetPath ||
      patch.question_name ||
      patch.questionName;

    if (!matrixName) return { changed: false, reason: "matrix_missing" };

    const rows = cloneRows(model.getValue(matrixName));
    rows.push(newValue && typeof newValue === "object" ? newValue : { value: newValue });
    model.setValue(matrixName, rows);

    return { changed: true, targetPath: matrixName };
  }

  const parsed = parseMatrixTargetPath(targetPath);
  const matrixName = patch.matrix_name || patch.matrixName || parsed?.matrixName || null;
  const rowIndexRaw = patch.matrix_row_index ?? patch.matrixRowIndex ?? parsed?.rowIndex;
  const columnName = patch.matrix_column_name || patch.matrixColumnName || parsed?.columnName || null;

  if (matrixName && rowIndexRaw != null && columnName) {
    const rowIndex = Number(rowIndexRaw);
    const rows = cloneRows(model.getValue(matrixName));

    while (rows.length <= rowIndex) {
      rows.push({});
    }

    const oldValue = rows[rowIndex]?.[columnName];
    rows[rowIndex] = {
      ...(rows[rowIndex] || {}),
      [columnName]: newValue,
    };

    model.setValue(matrixName, rows);

    return {
      changed: oldValue !== newValue,
      targetPath: `${matrixName}[${rowIndex}].${columnName}`,
      oldValue,
      newValue,
    };
  }

  const questionName = patch.question_name || patch.questionName || targetPath;
  if (!questionName) return { changed: false, reason: "question_missing" };

  const oldValue = model.getValue(questionName);
  model.setValue(questionName, newValue);

  return {
    changed: oldValue !== newValue,
    targetPath: questionName,
    oldValue,
    newValue,
  };
}

export function applyAssistantPatchesToSurvey(model, patches) {
  const results = asArray(patches).map((patch) => ({
    patch,
    result: applyAssistantPatchToSurvey(model, patch),
  }));

  return {
    changed: results.some((item) => item.result?.changed),
    changedCount: results.filter((item) => item.result?.changed).length,
    results,
  };
}

export function summarizeAssistantPatch(patch) {
  const newValue = getPatchNewValue(patch);
  const oldValue = getPatchOldValue(patch);

  return {
    id: patch?.assistant_patch_id || patch?.id || null,
    label: patch?.target_label || patch?.targetLabel || patch?.target_path || patch?.targetPath || "Wijziging",
    op: patch?.patch_op || patch?.patchOp || "SET",
    oldValue,
    newValue,
    confidence: patch?.confidence ?? null,
    reason: patch?.reason || "",
  };
}