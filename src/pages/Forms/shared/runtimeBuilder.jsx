// src/pages/Forms/shared/runtimeBuilder.jsx

import { ItemValue, Model } from "survey-core";
import { getFormPrefill } from "@/api/emberApi.js";

import {
  stripHandledMatrixValidatorsFromSurveyJson,
  collectRequestedPrefillKeys,
  injectChoicesIntoSurveyJson,
  applyChoices,
  applyBindings,
} from "./prefill.jsx";

import {
  getAnswersObject,
  safeSurveyParse,
  deepEqual,
} from "./surveyCore.jsx";

import {
  registerEmberSurveyFunctions,
} from "./modelBuilders.jsx";

import {
  syncAllMatrixQuestionVisualErrors,
} from "./validation.jsx";

export function buildPreparedSurveyJson(surveyJson) {
  registerEmberSurveyFunctions();

  const parsed = safeSurveyParse(surveyJson);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const preparedSurveyJson = stripHandledMatrixValidatorsFromSurveyJson(parsed.value);
  return { ok: true, preparedSurveyJson };
}

export function collectRuntimePrefillKeys(preparedSurveyJson) {
  const tempModel = new Model(preparedSurveyJson);
  return collectRequestedPrefillKeys(tempModel);
}

export async function loadRuntimePrefill({ code, formCode, preparedSurveyJson }) {
  const keys = collectRuntimePrefillKeys(preparedSurveyJson);
  const prefillPayload = await getFormPrefill(code, formCode, keys);

  return {
    keys,
    prefillPayload: prefillPayload || {
      ok: true,
      prefill: { values: {}, choices: {} },
      warnings: [],
    },
  };
}

export function createRuntimeSurveyModel(
  surveyJsonObj,
  { onDirtyChange, canEditRef, suppressDirtyRef }
) {
  const model = new Model(surveyJsonObj);

  const markDirty = () => {
    if (!canEditRef?.current) return;
    if (suppressDirtyRef?.current) return;
    onDirtyChange?.(true);
  };

  model.onValueChanged.add(() => {
    markDirty();
    syncAllMatrixQuestionVisualErrors(model);
  });

  model.onMatrixRowAdded.add(() => {
    markDirty();
    syncAllMatrixQuestionVisualErrors(model);
  });

  model.onMatrixRowRemoved.add(() => {
    markDirty();
    syncAllMatrixQuestionVisualErrors(model);
  });

  return model;
}

export function setRuntimeSurveyData(model, answersObj, suppressDirtyRef) {
  suppressDirtyRef.current = true;
  try {
    model.data = answersObj && typeof answersObj === "object" ? answersObj : {};
    syncAllMatrixQuestionVisualErrors(model);
  } finally {
    suppressDirtyRef.current = false;
  }
}

export async function buildRuntimeModelFromInstance({
  instance,
  code,
  onDirtyChange,
  canEditRef,
  suppressDirtyRef,
  lastAppliedMap = {},
}) {
  const preparedRes = buildPreparedSurveyJson(instance?.survey_json);
  if (!preparedRes.ok) {
    return { ok: false, error: preparedRes.error };
  }

  const preparedSurveyJson = preparedRes.preparedSurveyJson;
  const formCode = String(instance?.form_code || "").trim();

  const { prefillPayload } = await loadRuntimePrefill({
    code,
    formCode,
    preparedSurveyJson,
  });

  const enrichedSurveyJson = injectChoicesIntoSurveyJson(preparedSurveyJson, prefillPayload);

  const model = createRuntimeSurveyModel(enrichedSurveyJson, {
    onDirtyChange,
    canEditRef,
    suppressDirtyRef,
  });

  applyChoices(model, prefillPayload, ItemValue);

  const nextApplied = applyBindings({
    model,
    prefillPayload,
    lastAppliedMap,
    onlyRefreshable: false,
    isRefresh: false,
  });

  const answersObj = getAnswersObject(instance) || {};
  const mergedData = {
    ...(model.data || {}),
    ...(answersObj || {}),
  };

  setRuntimeSurveyData(model, mergedData, suppressDirtyRef);

  return {
    ok: true,
    model,
    preparedSurveyJson,
    enrichedSurveyJson,
    prefillPayload,
    lastAppliedMap: nextApplied,
  };
}

export async function refreshRuntimePrefill({
  instance,
  code,
  model,
  lastAppliedMap = {},
}) {
  if (!model) {
    return { ok: false, error: "Survey model ontbreekt." };
  }

  const preparedRes = buildPreparedSurveyJson(instance?.survey_json);
  if (!preparedRes.ok) {
    return { ok: false, error: preparedRes.error };
  }

  const preparedSurveyJson = preparedRes.preparedSurveyJson;
  const formCode = String(instance?.form_code || "").trim();

  const { prefillPayload } = await loadRuntimePrefill({
    code,
    formCode,
    preparedSurveyJson,
  });

  const beforeData = model.data && typeof model.data === "object" ? { ...model.data } : {};

  applyChoices(model, prefillPayload, ItemValue);

  const nextApplied = applyBindings({
    model,
    prefillPayload,
    lastAppliedMap,
    onlyRefreshable: true,
    isRefresh: true,
  });

  syncAllMatrixQuestionVisualErrors(model);

  const afterData = model.data && typeof model.data === "object" ? { ...model.data } : {};
  const changed = !deepEqual(beforeData, afterData);

  return {
    ok: true,
    changed,
    data: afterData,
    prefillPayload,
    lastAppliedMap: nextApplied,
  };
}