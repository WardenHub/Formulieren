// src/pages/Forms/shared/modelBuilders.jsx

import { FunctionFactory } from "survey-core";

let emberFnsRegistered = false;

export function registerEmberSurveyFunctions() {
  if (emberFnsRegistered) return;
  emberFnsRegistered = true;

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