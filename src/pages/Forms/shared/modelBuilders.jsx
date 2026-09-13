// src/pages/Forms/shared/modelBuilders.jsx

import { FunctionFactory, surveyLocalization } from "survey-core";
import "survey-core/i18n/dutch";

let emberFnsRegistered = false;

export function registerEmberSurveyFunctions() {
  if (emberFnsRegistered) return;
  emberFnsRegistered = true;

  /* De meldingen van survey-core stonden op Engels, dus een invuller kreeg "Response
     required." te zien. Dat valt online al uit de toon en offline is het erger, want daar
     staat het in de lijst met wat er nog ontbreekt, bij een monteur die verder alleen
     Nederlands ziet. Eén regel, en beide apps spreken dezelfde taal; ze bouwen hun model
     allebei via deze functie. */
  surveyLocalization.defaultLocale = "nl";

  FunctionFactory.Instance.register("toNumber", (params) => {
    const v = params?.[0];

    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;

    const s = String(v).trim();
    if (!s) return 0;

    const normalized = s.replace(",", ".");
    const n = Number(normalized);

    return Number.isFinite(n) ? n : 0;
  });
}