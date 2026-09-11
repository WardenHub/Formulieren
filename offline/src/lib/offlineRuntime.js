import { Model } from "survey-core";
import { registerEmberSurveyFunctions } from "@/pages/Forms/shared/modelBuilders.jsx";
import {
  injectRuntimeMatrixEnhancements,
  stripHandledMatrixValidatorsFromSurveyJson,
} from "@/pages/Forms/shared/prefill.jsx";
import { getAnswersObject, safeSurveyParse } from "@/pages/Forms/shared/surveyCore.jsx";

function deepClone(value) {
  if (value == null) return value;

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function normalizeFixedMatrixAnswers(model, answersObj) {
  const base =
    answersObj && typeof answersObj === "object"
      ? deepClone(answersObj)
      : {};

  if (!model?.getAllQuestions) return base;

  const questions = model.getAllQuestions() || [];

  for (const question of questions) {
    const type = String(question?.getType?.() || question?.jsonObj?.type || "").trim();
    if (type !== "matrixdynamic") continue;

    const name = String(question?.name || "").trim();
    if (!name) continue;

    const allowAddRows =
      question?.allowAddRows === true ||
      question?.jsonObj?.allowAddRows === true;
    if (allowAddRows) continue;

    const defaultRows = Array.isArray(question?.defaultValue)
      ? question.defaultValue
      : Array.isArray(question?.jsonObj?.defaultValue)
        ? question.jsonObj.defaultValue
        : [];

    if (!defaultRows.length) continue;

    const currentRows = Array.isArray(base[name]) ? base[name] : null;
    if (!currentRows || currentRows.length <= defaultRows.length) continue;

    base[name] = currentRows.slice(0, defaultRows.length);
  }

  return base;
}

function getInstanceDocumentNumber(pkg) {
  const raw =
    pkg?.form_instance?.form_instance_id ??
    pkg?.form_instance?.instance_id ??
    "OFFLINE";

  const text = String(raw ?? "").trim();
  return text.length ? text : "OFFLINE";
}

export function buildOfflineSurveySession(item) {
  const surveyJson = item?.package_data?.runtime?.survey_json;
  const parsed = safeSurveyParse(surveyJson);
  if (!parsed.ok) throw new Error(parsed.error || "survey_json kon niet worden gelezen.");
  registerEmberSurveyFunctions();

  const model = new Model(
    injectRuntimeMatrixEnhancements(stripHandledMatrixValidatorsFromSurveyJson(parsed.value))
  );
  const visiblePages = Array.isArray(model.pages) ? model.pages : [];
  if (visiblePages.length === 0) {
    throw new Error("Dit offline package bevat geen survey-pagina's.");
  }

  model.showTOC = false;
  model.completedHtml = "";
  model.showCompleteButton = false;
  model.showPreviewBeforeComplete = "noPreview";
  model.mode = "edit";

  const packageAnswers = getAnswersObject({
    answers_json: item?.package_data?.runtime?.answers_json,
  });

  const localAnswers =
    item?.local_runtime?.answers_json &&
    typeof item.local_runtime.answers_json === "object"
      ? item.local_runtime.answers_json
      : {};

  const mergedAnswers = {
    ...(packageAnswers && typeof packageAnswers === "object" ? packageAnswers : {}),
    ...localAnswers,
  };

  model.data = normalizeFixedMatrixAnswers(model, mergedAnswers);

  const documentnummer = getInstanceDocumentNumber(item?.package_data);
  const documentnummerQuestion = model.getQuestionByName?.("documentnummer") || null;
  if (documentnummerQuestion) {
    documentnummerQuestion.readOnly = true;
    model.setValue("documentnummer", documentnummer);
  }

  return {
    model,
    initialData: deepClone(model.data || {}),
  };
}
