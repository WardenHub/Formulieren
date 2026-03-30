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

export function emptyRuntimePrefillPayload() {
  return {
    ok: true,
    prefill: { values: {}, choices: {} },
    warnings: [],
  };
}

export function normalizeRuntimePrefillPayload(prefillPayload) {
  return prefillPayload || emptyRuntimePrefillPayload();
}

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
    prefillPayload: normalizeRuntimePrefillPayload(prefillPayload),
  };
}

export function createRuntimeSurveyModel(
  surveyJsonObj,
  { onDirtyChange, canEditRef, suppressDirtyRef }
) {
  const model = new Model(surveyJsonObj);

  model.showTOC = false;

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

function getInstanceDocumentNumber(instance) {
  const raw =
    instance?.form_instance_id ??
    instance?.instance_id ??
    instance?.formInstanceId ??
    instance?.instanceId ??
    "DEV";

  const s = String(raw ?? "").trim();
  return s.length ? s : "DEV";
}

export function applyRuntimeInstanceFields(model, instance) {
  if (!model) return;

  const documentnummerQuestion = model.getQuestionByName?.("documentnummer") || null;
  const documentnummer = getInstanceDocumentNumber(instance);

  if (documentnummerQuestion) {
    documentnummerQuestion.readOnly = true;
  }

  if (documentnummerQuestion && documentnummer !== null) {
    model.setValue("documentnummer", documentnummer);
  }
}

export function buildRuntimeMergedData({
  model,
  answersObj,
  instance,
}) {
  const mergedData = {
    ...(model?.data || {}),
    ...(answersObj && typeof answersObj === "object" ? answersObj : {}),
  };

  const documentnummer = getInstanceDocumentNumber(instance);
  if (documentnummer !== null) {
    mergedData.documentnummer = documentnummer;
  }

  return mergedData;
}

export function applyRuntimePrefillToModel({
  model,
  prefillPayload,
  lastAppliedMap = {},
  onlyRefreshable = false,
  isRefresh = false,
  instance = null,
}) {
  if (!model) {
    return { ok: false, error: "Survey model ontbreekt." };
  }

  const effectivePrefillPayload = normalizeRuntimePrefillPayload(prefillPayload);
  const beforeData = model.data && typeof model.data === "object" ? { ...model.data } : {};

  applyChoices(model, effectivePrefillPayload, ItemValue);

  const nextApplied = applyBindings({
    model,
    prefillPayload: effectivePrefillPayload,
    lastAppliedMap,
    onlyRefreshable,
    isRefresh,
  });

  applyRuntimeInstanceFields(model, instance);
  syncAllMatrixQuestionVisualErrors(model);

  const afterData = model.data && typeof model.data === "object" ? { ...model.data } : {};
  const changed = !deepEqual(beforeData, afterData);

  return {
    ok: true,
    changed,
    data: afterData,
    prefillPayload: effectivePrefillPayload,
    lastAppliedMap: nextApplied,
  };
}

export async function buildRuntimeModelFromSurvey({
  surveyJson,
  answersObj = {},
  prefillPayload = null,
  instance = null,
  onDirtyChange,
  canEditRef,
  suppressDirtyRef,
  lastAppliedMap = {},
}) {
  const preparedRes = buildPreparedSurveyJson(surveyJson);
  if (!preparedRes.ok) {
    return { ok: false, error: preparedRes.error };
  }

  const preparedSurveyJson = preparedRes.preparedSurveyJson;
  const effectivePrefillPayload = normalizeRuntimePrefillPayload(prefillPayload);

  const enrichedSurveyJson = injectChoicesIntoSurveyJson(
    preparedSurveyJson,
    effectivePrefillPayload
  );

  const model = createRuntimeSurveyModel(enrichedSurveyJson, {
    onDirtyChange,
    canEditRef,
    suppressDirtyRef,
  });

  applyChoices(model, effectivePrefillPayload, ItemValue);

  const nextApplied = applyBindings({
    model,
    prefillPayload: effectivePrefillPayload,
    lastAppliedMap,
    onlyRefreshable: false,
    isRefresh: false,
  });

  const mergedData = buildRuntimeMergedData({
    model,
    answersObj,
    instance,
  });

  setRuntimeSurveyData(model, mergedData, suppressDirtyRef);
  applyRuntimeInstanceFields(model, instance);

  return {
    ok: true,
    model,
    preparedSurveyJson,
    enrichedSurveyJson,
    prefillPayload: effectivePrefillPayload,
    lastAppliedMap: nextApplied,
  };
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

  const answersObj = getAnswersObject(instance) || {};

  return buildRuntimeModelFromSurvey({
    surveyJson: instance?.survey_json,
    answersObj,
    prefillPayload,
    instance,
    onDirtyChange,
    canEditRef,
    suppressDirtyRef,
    lastAppliedMap,
  });
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

  return applyRuntimePrefillToModel({
    model,
    prefillPayload,
    lastAppliedMap,
    onlyRefreshable: true,
    isRefresh: true,
    instance,
  });
}