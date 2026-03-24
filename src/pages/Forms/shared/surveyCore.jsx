// src/pages/Forms/shared/surveyCore.jsx

export function normalizeInstanceResponse(res) {
  return (
    res?.item ||
    res?.instance ||
    res?.formInstance ||
    res?.data?.item ||
    res?.data?.instance ||
    res?.data?.formInstance ||
    res ||
    null
  );
}

export function safeJsonParse(text) {
  const s = String(text || "").trim();
  if (!s) return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function safeSurveyParse(surveyJson) {
  if (!surveyJson) return { ok: false, error: "survey_json ontbreekt" };
  if (typeof surveyJson === "object") return { ok: true, value: surveyJson };

  const txt = String(surveyJson || "").trim();
  if (!txt) return { ok: false, error: "survey_json is leeg" };

  try {
    return { ok: true, value: JSON.parse(txt) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function formatNlDateTime(iso) {
  if (!iso) return "";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  try {
    return new Intl.DateTimeFormat("nl-NL", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export const STATUS_LABELS = {
  CONCEPT: "Concept",
  INGEDIEND: "Ingediend",
  IN_BEHANDELING: "In behandeling",
  AFGEHANDELD: "Afgehandeld",
  INGETROKKEN: "Ingetrokken",
};

export function statusLabel(status) {
  const s = String(status || "");
  return STATUS_LABELS[s] || s || "(onbekend)";
}

export function translateApiError(err, currentStatus) {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return "Er is iets misgegaan.";

  const lower = raw.toLowerCase();

  if (lower.includes("invalid status transition")) {
    const lbl = statusLabel(currentStatus);
    return `Deze actie is niet toegestaan in de huidige status (${lbl}).`;
  }

  if (lower.includes("expected_draft_rev")) {
    return "Opslaan conflict: dit formulier is ondertussen gewijzigd. Probeer opnieuw.";
  }

  if (lower.includes("preview") && lower.includes("not found")) {
    return "De indiencontrole kon niet worden uitgevoerd omdat het formulier niet is gevonden.";
  }

  if (
    lower.includes("forbidden") ||
    lower.includes("not authorized") ||
    lower.includes("unauthorized")
  ) {
    return "Je hebt geen rechten om deze actie uit te voeren.";
  }

  return raw;
}

export function getDraftRev(inst) {
  const v = inst?.draft_rev ?? inst?.draftRev ?? 0;
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

export function getAnswersObject(inst) {
  const nextAnswers = inst?.answers_json ?? inst?.answersJson ?? null;

  if (typeof nextAnswers === "string") {
    const parsed = safeJsonParse(nextAnswers);
    return parsed.ok ? parsed.value : null;
  }

  if (nextAnswers && typeof nextAnswers === "object") return nextAnswers;
  return null;
}

export function buildSubmitConfirmText(previewRes) {
  const items = Array.isArray(previewRes?.follow_ups?.items)
    ? previewRes.follow_ups.items
    : [];

  const workflowCount = items.filter((x) => x?.kind === "workflow").length;
  const reportOnlyCount = items.filter((x) => x?.kind === "report-only").length;

  const lines = [];

  lines.push("Weet je zeker dat je dit formulier wilt indienen?");
  lines.push("");

  if (workflowCount > 0 || reportOnlyCount > 0) {
    lines.push("Bij indienen worden opvolgregistraties aangemaakt of bijgewerkt:");
    lines.push(`- Workflowacties: ${workflowCount}`);
    lines.push(`- Informatieve rapportopmerkingen: ${reportOnlyCount}`);

    const previewTitles = items
      .map((x) => String(x?.workflowTitle || "").trim())
      .filter(Boolean)
      .slice(0, 8);

    if (previewTitles.length > 0) {
      lines.push("");
      lines.push("Voorbeeld:");

      for (const title of previewTitles) {
        lines.push(`- ${title}`);
      }

      if (items.length > previewTitles.length) {
        lines.push(`- ... en nog ${items.length - previewTitles.length}`);
      }
    }
  } else {
    lines.push("Er zijn geen opvolgregistraties gevonden voor dit formulier.");
  }

  return lines.join("\n");
}

export function normalizeText(value) {
  const s = String(value || "").trim();
  return s.length ? s : null;
}

export function getQuestionTitle(question) {
  const t =
    question?.fullTitle ||
    question?.title ||
    question?.locTitle?.renderedHtml ||
    question?.name ||
    "";

  return normalizeText(t) || "Onbenoemde vraag";
}

export function getPageTitle(page, fallbackIndex = 0) {
  const t =
    page?.title ||
    page?.locTitle?.renderedHtml ||
    page?.name ||
    "";

  return normalizeText(t) || `Pagina ${fallbackIndex + 1}`;
}

export function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;

  const s = String(value).trim();
  return s.length ? s : null;
}

export function normalizeComparable(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim().toLowerCase();
}

export function valuesEqualLooseForFollowUp(actual, expected) {
  if (actual === expected) return true;
  return normalizeComparable(actual) === normalizeComparable(expected);
}

export function followUpTruthyYes(value) {
  const v = normalizeComparable(value);
  return v === "ja" || v === "yes" || v === "true" || v === "1" || v === "y";
}

export function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;

  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

export function deepEqual(a, b) {
  if (a === b) return true;

  if (typeof a !== typeof b) return false;

  if (a === null || b === null) return a === b;

  if (typeof a !== "object") return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }

    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

export function formatTodayISODate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isEmptyAnswer(value) {
  if (value === null || value === undefined) return true;

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  return false;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function getLsNumber(key, fallback) {
  const raw = localStorage.getItem(key);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}