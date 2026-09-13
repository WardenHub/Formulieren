import { buildRuntimeModelFromSurveySync } from "@/pages/Forms/shared/runtimeBuilder.jsx";
import { getAnswersObject } from "@/pages/Forms/shared/surveyCore.jsx";

function deepClone(value) {
  if (value == null) return value;

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

export function buildOfflineSurveySession(item) {
  const pakket = item?.package_data || {};

  const packageAnswers = getAnswersObject({
    answers_json: pakket?.runtime?.answers_json,
  });

  const localAnswers =
    item?.local_runtime?.answers_json && typeof item.local_runtime.answers_json === "object"
      ? item.local_runtime.answers_json
      : {};

  const mergedAnswers = {
    ...(packageAnswers && typeof packageAnswers === "object" ? packageAnswers : {}),
    ...localAnswers,
  };

  /* De prefill die bij het ophalen is meegegeven, vast aan de versie van dit pakket. Zonder
     dit blijft een keuzelijst offline leeg en valt een gebonden veld anders uit dan online;
     precies het verschil dat pas opvalt wanneer het werk al gedaan is. */
  const prefillPayload = pakket?.runtime?.prefill?.payload || null;

  /* Exact dezelfde opbouw als de online runner, uit hetzelfde bestand. Alles wat hier zou
     worden nageschreven, gaat op termijn afwijken. */
  const gebouwd = buildRuntimeModelFromSurveySync({
    surveyJson: pakket?.runtime?.survey_json,
    answersObj: mergedAnswers,
    prefillPayload,
    instance: pakket?.form_instance || null,
  });

  if (!gebouwd?.ok || !gebouwd.model) {
    throw new Error(gebouwd?.error || "Het offline formulier kon niet worden opgebouwd.");
  }

  const model = gebouwd.model;

  const visiblePages = Array.isArray(model.pages) ? model.pages : [];
  if (visiblePages.length === 0) {
    throw new Error("Dit offline package bevat geen survey-pagina's.");
  }

  /* Getypte tekst hoort meteen in het model te staan, niet pas wanneer het veld de focus
     verliest. De standaard van survey-core is onBlur, en dan ziet de autosave een lange
     opmerking nooit als de monteur de klep dichtdoet terwijl de cursor nog in het veld
     staat. Offline is dat werk weg; er is geen server die het alsnog heeft. */
  model.textUpdateMode = "onTyping";

  model.showTOC = false;
  model.completedHtml = "";
  model.showCompleteButton = false;
  model.showPreviewBeforeComplete = "noPreview";
  model.mode = "edit";

  return {
    model,
    initialData: deepClone(model.data || {}),
  };
}
