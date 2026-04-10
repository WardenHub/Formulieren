import {
  deepClone,
  deepEqual,
  formatTodayISODate,
  isEmptyAnswer,
} from "./surveyCore.jsx";

export function walkElements(node, fn) {
  if (!node || typeof node !== "object") return;

  fn(node);

  const visitArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const el of arr) {
      walkElements(el, fn);
    }
  };

  visitArray(node.pages);
  visitArray(node.elements);
  visitArray(node.templateElements);
  visitArray(node.questions);
  visitArray(node.columns);
  visitArray(node.rows);
  visitArray(node.choices);
}

export function stripHandledMatrixValidatorsFromSurveyJson(surveyJson) {
  const next = deepClone(surveyJson);

  walkElements(next, (el) => {
    if (String(el?.type || "").trim() !== "matrixdynamic") return;

    const columns = Array.isArray(el?.columns) ? el.columns : [];
    const hasVoldoet = columns.some((c) => String(c?.name || "").trim() === "voldoet");
    const hasOpmerking = columns.some((c) => String(c?.name || "").trim() === "opmerking");

    if (!hasVoldoet || !hasOpmerking) return;

    el.validators = [];
  });

  return next;
}

export function injectChoicesIntoSurveyJson(surveyJson, prefillPayload) {
  const payloadChoices = prefillPayload?.choices || prefillPayload?.prefill?.choices || {};
  const next = deepClone(surveyJson);

  walkElements(next, (el) => {
    const ember = el?.ember;
    const cfg = ember?.choices;
    if (!cfg) return;

    const key = String(cfg.key || "").trim();
    if (!key) return;

    const raw = payloadChoices[key];
    if (!Array.isArray(raw)) return;

    const valueField = String(cfg.valueField || "value");
    const textField = String(cfg.textField || "text");

    const normalized = raw
      .map((x) => {
        if (!x || typeof x !== "object") return null;

        const value =
          x[valueField] ??
          x.value ??
          x.key ??
          x.code ??
          x.option_value ??
          x.optionValue ??
          null;

        const text =
          x[textField] ??
          x.text ??
          x.label ??
          x.name ??
          x.display_name ??
          x.displayName ??
          null;

        if (value === null || value === undefined) return null;

        return {
          value,
          text: text != null ? String(text) : String(value),
        };
      })
      .filter(Boolean);

    const mode = String(cfg.mode || "replace");

    if (mode === "merge" && Array.isArray(el.choices)) {
      const map = new Map();
      for (const c of el.choices) map.set(String(c?.value), c);
      for (const c of normalized) map.set(String(c?.value), c);
      el.choices = Array.from(map.values());
    } else {
      el.choices = normalized;
    }
  });

  return next;
}

export function collectEmberMeta(model) {
  const binds = [];
  const choices = [];
  const followUps = [];

  if (!model) return { binds, choices, followUps };

  const questions = model.getAllQuestions?.() || [];
  for (const q of questions) {
    const ember = q?.jsonObj?.ember;

    if (ember?.bind) {
      binds.push({
        name: q.name,
        bind: ember.bind,
        filter: ember.filter || null,
      });
    }

    if (ember?.choices) {
      choices.push({ name: q.name, choices: ember.choices });
    }

    if (ember?.followUp) {
      followUps.push({
        name: q.name,
        type: q.getType?.() || q?.jsonObj?.type || null,
        followUp: ember.followUp,
      });
    }
  }

  return { binds, choices, followUps };
}

export function applyArrayFilter(value, filterCfg) {
  if (!Array.isArray(value)) return value;
  if (!filterCfg || typeof filterCfg !== "object") return value;

  const field = String(filterCfg.panelField || filterCfg.field || "").trim();
  if (!field) return value;

  const equalsAnyRaw = filterCfg.equalsAny ?? null;
  const equalsRaw = filterCfg.equals ?? null;

  const equalsAny = Array.isArray(equalsAnyRaw)
    ? equalsAnyRaw.map((x) => String(x))
    : equalsRaw != null
      ? [String(equalsRaw)]
      : [];

  if (equalsAny.length === 0) return value;

  const set = new Set(equalsAny);
  return value.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const v = row[field];
    if (v === null || v === undefined) return false;
    return set.has(String(v));
  });
}

export function applyEmberFilterToArray(rows, filter) {
  if (!Array.isArray(rows)) return rows;
  if (!filter || typeof filter !== "object") return rows;

  const field = String(filter.panelField || "").trim();
  if (!field) return rows;

  const hasEquals = Object.prototype.hasOwnProperty.call(filter, "equals");
  const hasEqualsAny = Array.isArray(filter.equalsAny);

  if (!hasEquals && !hasEqualsAny) return rows;

  return rows.filter((r) => {
    const v = r?.[field];

    if (hasEquals) return String(v ?? "") === String(filter.equals ?? "");
    if (hasEqualsAny) {
      const set = new Set(filter.equalsAny.map((x) => String(x)));
      return set.has(String(v ?? ""));
    }

    return true;
  });
}

export function resolveBindValue(bind, prefillPayload, emberFilter) {
  const kind = String(bind?.kind || "");
  const key = String(bind?.key || "").trim();

  if (kind === "calculated") {
    if (key === "today") return formatTodayISODate();
    return undefined;
  }

  if (kind === "prefill") {
    const raw = prefillPayload?.values?.[key] ?? prefillPayload?.prefill?.values?.[key];
    if (Array.isArray(raw)) return applyEmberFilterToArray(raw, emberFilter);
    return raw;
  }

  return undefined;
}

function cloneBindableValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  return deepClone(value);
}

function getQuestionValueName(question, fallbackName) {
  const valueName = String(question?.valueName || "").trim();
  if (valueName) return valueName;
  return String(fallbackName || "").trim();
}

function setQuestionBoundValue(model, question, questionName, nextValue, dataBag) {
  const targetName = getQuestionValueName(question, questionName);
  if (!targetName) return;

  const clonedValue = cloneBindableValue(nextValue);

  if (question && typeof question.value !== "undefined") {
    question.value = clonedValue;
  } else {
    model.setValue(targetName, clonedValue);
  }

  dataBag[targetName] = clonedValue;
}

export function applyBindings({
  model,
  prefillPayload,
  lastAppliedMap,
  onlyRefreshable,
  isRefresh,
}) {
  const nextApplied = { ...(lastAppliedMap || {}) };
  const data = { ...(model.data || {}) };

  const { binds } = collectEmberMeta(model);

  for (const item of binds) {
    const bind = item.bind || {};
    const mode = String(bind.mode || "overwrite-if-empty");
    const refreshable = Boolean(bind.refreshable);
    if (onlyRefreshable && !refreshable) continue;

    const q = model.getQuestionByName?.(item.name) || null;
    const liveFilter = q?.jsonObj?.ember?.filter || null;
    const filterCfg = item.filter || liveFilter;

    let nextVal = resolveBindValue(bind, prefillPayload, filterCfg);
    if (nextVal === undefined) continue;

    nextVal = applyArrayFilter(nextVal, filterCfg);

    const valueKey = getQuestionValueName(q, item.name);
    const curVal = data[valueKey];
    const lastApplied = nextApplied[item.name];

    if (isRefresh) {
      const canRefresh = isEmptyAnswer(curVal) || deepEqual(curVal, lastApplied);
      if (!canRefresh) continue;

      setQuestionBoundValue(model, q, item.name, nextVal, data);
      nextApplied[item.name] = cloneBindableValue(nextVal);
      continue;
    }

    const shouldOverwrite =
      mode === "always-overwrite"
        ? true
        : mode === "overwrite-if-empty"
          ? isEmptyAnswer(curVal)
          : mode === "overwrite-if-unchanged"
            ? isEmptyAnswer(curVal) || deepEqual(curVal, lastApplied)
            : false;

    if (shouldOverwrite) {
      setQuestionBoundValue(model, q, item.name, nextVal, data);
      nextApplied[item.name] = cloneBindableValue(nextVal);
    }
  }

  return nextApplied;
}

export function collectRequestedPrefillKeys(model) {
  const keys = new Set();
  const { binds, choices } = collectEmberMeta(model);

  for (const b of binds) {
    const bind = b?.bind || {};
    if (String(bind.kind || "") === "prefill") {
      const k = String(bind.key || "").trim();
      if (k) keys.add(k);
    }
  }

  for (const c of choices) {
    const cfg = c?.choices || {};
    const k = String(cfg.key || "").trim();
    if (k) keys.add(k);
  }

  return Array.from(keys.values());
}

export function normalizeChoiceItems(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((x) => {
      if (!x) return null;

      const value = x.value ?? x.key ?? x.code ?? x.option_value ?? x.optionValue ?? null;
      const text = x.text ?? x.label ?? x.name ?? x.display_name ?? x.displayName ?? null;
      if (value === null || value === undefined) return null;

      return {
        value,
        text: text != null ? String(text) : String(value),
      };
    })
    .filter(Boolean);
}

export function applyChoices(model, prefillPayload, ItemValueCtor) {
  if (!model) return;
  if (!ItemValueCtor) return;

  const payloadChoices = prefillPayload?.choices || prefillPayload?.prefill?.choices || {};
  const { choices } = collectEmberMeta(model);

  for (const item of choices) {
    const cfg = item?.choices || {};
    const key = String(cfg.key || "").trim();
    if (!key) continue;

    const raw = payloadChoices[key];
    if (!Array.isArray(raw)) continue;

    const q = model.getQuestionByName?.(item.name);
    if (!q) continue;

    const normalized = normalizeChoiceItems(raw).map(
      (o) => new ItemValueCtor(o.value, o.text)
    );

    const mode = String(cfg.mode || "replace");
    if (mode === "merge" && Array.isArray(q.choices)) {
      const map = new Map();
      for (const c of q.choices) map.set(String(c?.value), c);
      for (const c of normalized) map.set(String(c?.value), c);
      q.choices = Array.from(map.values());
    } else {
      q.choices = normalized;
    }
  }
}