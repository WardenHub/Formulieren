// src/pages/dev/FormDesigner.jsx
import { useEffect, useMemo, useRef, useState } from "react";

import { Survey } from "survey-react-ui";
import { ItemValue, Model } from "survey-core";
import "survey-core/survey-core.min.css";
import "survey-core/i18n/dutch";

import "@/styles/surveyjs-overrides.css";
import { getFormInstance, getFormPrefill, getFormsCatalog } from "@/api/emberApi.js";

import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";

function safeJsonParse(text) {
  const s = String(text || "").trim();
  if (!s) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function normalizeInstanceResponse(res) {
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getLsNumber(key, fallback) {
  const raw = localStorage.getItem(key);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function isEmptyAnswer(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function formatTodayISODate() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Traverse survey JSON elements recursively.
 */
function walkElements(node, fn) {
  if (!node) return;

  const visitArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const el of arr) {
      fn(el);
      walkElements(el, fn);
    }
  };

  if (Array.isArray(node.pages)) visitArray(node.pages);
  if (Array.isArray(node.elements)) visitArray(node.elements);
  if (Array.isArray(node.templateElements)) visitArray(node.templateElements);
  if (Array.isArray(node.questions)) visitArray(node.questions);
}

/**
 * Inject ember.choices into the survey JSON itself, so SurveyModel is built with choices present.
 */
function injectChoicesIntoSurveyJson(surveyJson, prefillPayload) {
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

    const normalized = raw
      .map((x) => {
        if (!x) return null;
        const value = x.value ?? x.key ?? x.code ?? x.option_value ?? x.optionValue ?? null;
        const text = x.text ?? x.label ?? x.name ?? x.display_name ?? x.displayName ?? null;
        if (value === null || value === undefined) return null;
        return { value, text: text != null ? String(text) : String(value) };
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

/**
 * Extract ember bindings + ember choices keys (+ ember.filter) from a SurveyJS model.
 */
function collectEmberMeta(model) {
  const binds = [];
  const choices = [];

  if (!model) return { binds, choices };

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

    if (ember?.choices) choices.push({ name: q.name, choices: ember.choices });
  }

  return { binds, choices };
}

function applyArrayFilter(value, filterCfg) {
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

/**
 * Apply bindings to model.data based on mode.
 */
function applyBindings({ model, prefillPayload, lastAppliedMap, onlyRefreshable, isRefresh }) {
  const nextApplied = { ...(lastAppliedMap || {}) };
  const data = { ...(model.data || {}) };

  const { binds } = collectEmberMeta(model);

  for (const item of binds) {
    const bind = item.bind || {};
    const mode = String(bind.mode || "overwrite-if-empty");
    const refreshable = Boolean(bind.refreshable);
    if (onlyRefreshable && !refreshable) continue;

    const q = model.getQuestionByName?.(item.name);
    const liveFilter = q?.jsonObj?.ember?.filter || null;
    const filterCfg = item.filter || liveFilter;

    let nextVal = resolveBindValue(bind, prefillPayload);
    if (nextVal === undefined) continue;

    nextVal = applyArrayFilter(nextVal, filterCfg);

    const curVal = data[item.name];
    const lastApplied = nextApplied[item.name];

    if (isRefresh) {
      const canRefresh = isEmptyAnswer(curVal) || deepEqual(curVal, lastApplied);
      if (!canRefresh) continue;
      data[item.name] = nextVal;
      nextApplied[item.name] = nextVal;
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
      data[item.name] = nextVal;
      nextApplied[item.name] = nextVal;
    }
  }

  model.data = data;
  return nextApplied;
}

/**
 * Build prefill keys list from survey model:
 * - ember.bind kind="prefill" => bind.key
 * - ember.choices => choices.key
 */
function collectRequestedPrefillKeys(model) {
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

function applyEmberFilterToArray(rows, filter) {
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

function resolveBindValue(bind, prefillPayload, emberFilter) {
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

function normalizeChoiceItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x) return null;
      const value = x.value ?? x.key ?? x.code ?? x.option_value ?? x.optionValue ?? null;
      const text = x.text ?? x.label ?? x.name ?? x.display_name ?? x.displayName ?? null;
      if (value === null || value === undefined) return null;
      return { value, text: text != null ? String(text) : String(value) };
    })
    .filter(Boolean);
}

/**
 * Apply ember.choices from prefill payload to SurveyJS questions.
 * Use ItemValue so dropdowns render + keep values stable.
 */
function applyChoices(model, prefillPayload) {
  if (!model) return;

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

    const normalized = normalizeChoiceItems(raw).map((o) => new ItemValue(o.value, o.text));

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

function formatJsonText(text) {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const value = parsed.value;
  if (value === null || value === undefined) return { ok: true, value: "" };
  return { ok: true, value: JSON.stringify(value, null, 2) + "\n" };
}

async function copyToClipboard(text) {
  const s = String(text || "");
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(s);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = s;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function downloadJsonFile(filename, obj) {
  const text = JSON.stringify(obj ?? null, null, 2) + "\n";
  downloadTextFile(filename, text);
}

function downloadTextFile(filename, text) {
  const blob = new Blob([String(text || "")], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function indexToLineCol(text, index) {
  const s = String(text || "");
  const i = clamp(Number(index) || 0, 0, s.length);
  let line = 1;
  let col = 1;
  for (let p = 0; p < i; p++) {
    if (s[p] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

function lineColToIndex(text, line, col) {
  const s = String(text || "");
  const targetLine = Math.max(1, Number(line) || 1);
  const targetCol = Math.max(1, Number(col) || 1);

  let curLine = 1;
  let idx = 0;

  while (idx < s.length && curLine < targetLine) {
    if (s[idx] === "\n") curLine += 1;
    idx += 1;
  }

  idx += targetCol - 1;
  return clamp(idx, 0, s.length);
}

function findLineRange(text, lineNo) {
  const s = String(text || "");
  const ln = Math.max(1, Number(lineNo) || 1);

  let curLine = 1;
  let startIdx = 0;

  while (startIdx < s.length && curLine < ln) {
    if (s[startIdx] === "\n") curLine += 1;
    startIdx += 1;
  }

  let endIdx = startIdx;
  while (endIdx < s.length && s[endIdx] !== "\n") endIdx += 1;

  return { startIdx, endIdx };
}

function parseJsonErrorLoc(errorMsg, text) {
  const msg = String(errorMsg || "");

  const posM = msg.match(/position\s+(\d+)/i);
  const lineM = msg.match(/line\s+(\d+)/i);
  const colM = msg.match(/column\s+(\d+)/i);

  const pos = posM ? Number(posM[1]) : null;
  const line = lineM ? Number(lineM[1]) : null;
  const col = colM ? Number(colM[1]) : null;

  if (Number.isFinite(line) && Number.isFinite(col)) {
    return { line, col, pos: lineColToIndex(text, line, col) };
  }

  if (Number.isFinite(pos)) {
    const lc = indexToLineCol(text, pos);
    return { line: lc.line, col: lc.col, pos };
  }

  return null;
}

function findMatchingBrace(text, pos) {
  const s = String(text || "");
  const i = clamp(Number(pos) || 0, 0, Math.max(0, s.length - 1));
  const ch = s[i];

  const pairs = { "{": "}", "[": "]", "}": "{", "]": "[" };
  if (!pairs[ch]) return null;

  const isOpen = ch === "{" || ch === "[";
  const openCh = isOpen ? ch : pairs[ch];
  const closeCh = isOpen ? pairs[ch] : ch;

  let depth = 0;

  if (isOpen) {
    for (let p = i; p < s.length; p++) {
      const c = s[p];
      if (c === openCh) depth += 1;
      if (c === closeCh) depth -= 1;
      if (depth === 0) return { from: i, to: p };
    }
    return null;
  }

  for (let p = i; p >= 0; p--) {
    const c = s[p];
    if (c === closeCh) depth += 1;
    if (c === openCh) depth -= 1;
    if (depth === 0) return { from: p, to: i };
  }
  return null;
}

function short(s, max = 180) {
  const t = String(s || "");
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function ToggleRow({ title, meta, isOpen, onToggle, iconRef, onIconEnter, onIconLeave }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      onMouseEnter={onIconEnter}
      onMouseLeave={onIconLeave}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        cursor: "pointer",
        userSelect: "none",
      }}
      title={isOpen ? "inklappen" : "uitklappen"}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {meta ? (
          <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {meta}
          </div>
        ) : null}
      </div>

      <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
        {!isOpen ? (
          <PlusIcon ref={iconRef} size={18} className="nav-anim-icon" />
        ) : (
          <ChevronUpIcon ref={iconRef} size={18} className="nav-anim-icon" />
        )}
      </div>
    </div>
  );
}

export default function FormDesigner() {
  const [editorText, setEditorText] = useState(() => {
    const fromLs = localStorage.getItem("dev.formdesigner.editorText");
    return fromLs || '{\n  "title": "Preview",\n  "pages": []\n}\n';
  });

  const [previewJson, setPreviewJson] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [answersPreview, setAnswersPreview] = useState({});
  const answersRef = useRef({});
  const autoApplyAfterLoadRef = useRef(false);
  const settingAnswersProgrammaticallyRef = useRef(false);

  const [showPreview, setShowPreview] = useState(true);
  const [showEditor, setShowEditor] = useState(() => {
    const v = localStorage.getItem("dev.formdesigner.showEditor");
    return v === null ? true : v === "true";
  });

  const [leftWidth, setLeftWidth] = useState(() => getLsNumber("dev.formdesigner.leftWidth", 620));
  const [editorHeight, setEditorHeight] = useState(() => getLsNumber("dev.formdesigner.editorHeight", 520));

  const [loadFromBackend, setLoadFromBackend] = useState(false);
  const [backendCode, setBackendCode] = useState("");
  const [backendInstanceId, setBackendInstanceId] = useState("");
  const [backendBusy, setBackendBusy] = useState(false);

  const [installCode, setInstallCode] = useState("");
  const [prefillFormCode, setPrefillFormCode] = useState(() => {
    const v = localStorage.getItem("dev.formdesigner.prefillFormCode");
    return v || "DEV";
  });

  const [formsCatalog, setFormsCatalog] = useState([]);
  const [formsCatalogBusy, setFormsCatalogBusy] = useState(false);

  const [prefillBusy, setPrefillBusy] = useState(false);
  const [prefillPayload, setPrefillPayload] = useState(null);

  const [lastAppliedMap, setLastAppliedMap] = useState({});

  const fileInputRef = useRef(null);
  const modelRef = useRef(null);
  const editorRef = useRef(null);

  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const [lineHeightPx, setLineHeightPx] = useState(17);

  const [editorNotice, setEditorNotice] = useState(null);
  const noticeTimerRef = useRef(null);

  const [highlightLine, setHighlightLine] = useState(null);
  const highlightTimerRef = useRef(null);

  const [braceMatch, setBraceMatch] = useState(null);
  const [braceFlash, setBraceFlash] = useState(null);

  const [openCards, setOpenCards] = useState(() => {
    const raw = localStorage.getItem("dev.formdesigner.openCards");
    if (!raw) return { answers: false, lastApplied: false, prefill: false };
    try {
      const v = JSON.parse(raw);
      return {
        answers: Boolean(v?.answers),
        lastApplied: Boolean(v?.lastApplied),
        prefill: Boolean(v?.prefill),
      };
    } catch {
      return { answers: false, lastApplied: false, prefill: false };
    }
  });

  const toggleIconRef = useRef({
    answers: null,
    lastApplied: null,
    prefill: null,
  });

  function animateIcon(key) {
    toggleIconRef.current[key]?.startAnimation?.();
  }
  function stopIcon(key) {
    toggleIconRef.current[key]?.stopAnimation?.();
  }

  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const draggingHeightRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);

  useEffect(() => {
    localStorage.setItem("dev.formdesigner.editorText", editorText);
  }, [editorText]);

  useEffect(() => {
    localStorage.setItem("dev.formdesigner.showEditor", String(showEditor));
  }, [showEditor]);

  useEffect(() => {
    localStorage.setItem("dev.formdesigner.leftWidth", String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem("dev.formdesigner.editorHeight", String(editorHeight));
  }, [editorHeight]);

  useEffect(() => {
    localStorage.setItem("dev.formdesigner.prefillFormCode", String(prefillFormCode || "DEV"));
  }, [prefillFormCode]);

  useEffect(() => {
    localStorage.setItem("dev.formdesigner.openCards", JSON.stringify(openCards));
  }, [openCards]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setFormsCatalogBusy(true);
      try {
        const res = await getFormsCatalog();
        const items = res?.items || res?.forms || res || [];
        const normalized = Array.isArray(items) ? items : [];
        if (!cancelled) setFormsCatalog(normalized);
      } catch {
        if (!cancelled) setFormsCatalog([]);
      } finally {
        if (!cancelled) setFormsCatalogBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const cs = window.getComputedStyle(el);
    const lh = cs?.lineHeight ? Number(String(cs.lineHeight).replace("px", "")) : NaN;
    if (Number.isFinite(lh) && lh > 0) setLineHeightPx(lh);
  }, [showEditor]);

  function setNotice(next, { autoClearMs } = {}) {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }

    setEditorNotice(next);

    if (autoClearMs && next) {
      noticeTimerRef.current = setTimeout(() => {
        setEditorNotice(null);
        noticeTimerRef.current = null;
      }, autoClearMs);
    }
  }

  useEffect(() => {
    if (!editorNotice || editorNotice.kind !== "error") return;

    const parsed = safeJsonParse(editorText);
    if (parsed.ok) {
      setEditorNotice(null);
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
    }
  }, [editorText, editorNotice]);

  function flashHighlightLine(line, focus = true) {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);

    setHighlightLine(line);

    highlightTimerRef.current = setTimeout(() => {
      setHighlightLine(null);
      highlightTimerRef.current = null;
    }, 1800);

    const el = editorRef.current;
    if (!el) return;

    const top = (Math.max(1, line) - 1) * lineHeightPx;
    const pad = 5 * lineHeightPx;
    const desired = Math.max(0, top - pad);
    el.scrollTop = desired;
    setEditorScrollTop(desired);

    if (focus) el.focus();

    const { startIdx, endIdx } = findLineRange(editorText, line);
    el.setSelectionRange(startIdx, endIdx);

    requestAnimationFrame(() => {
      const caret = clamp(startIdx, 0, editorText.length);
      el.setSelectionRange(caret, caret);
    });
  }

  function updateBraceMatch() {
    const el = editorRef.current;
    if (!el) return;

    const txt = String(el.value || "");
    const caret = el.selectionStart ?? 0;

    const p1 = clamp(caret, 0, Math.max(0, txt.length - 1));
    const p2 = clamp(caret - 1, 0, Math.max(0, txt.length - 1));

    const hit = findMatchingBrace(txt, p1) || findMatchingBrace(txt, p2) || null;

    if (!hit) {
      setBraceMatch(null);
      return;
    }

    const aLc = indexToLineCol(txt, hit.from);
    const bLc = indexToLineCol(txt, hit.to);

    setBraceMatch({ aIdx: hit.from, bIdx: hit.to, aLc, bLc });

    const until = Date.now() + 700;
    setBraceFlash({ until });
    setTimeout(() => {
      setBraceFlash((prev) => {
        if (!prev) return null;
        if (prev.until !== until) return prev;
        return null;
      });
    }, 720);
  }

  function setAnswers(next) {
    const obj = next && typeof next === "object" ? next : {};
    answersRef.current = obj;
    setAnswersPreview(obj);
  }

  function buildPreviewFromEditor() {
    const parsed = safeJsonParse(editorText);
    if (!parsed.ok) {
      setPreviewError(parsed.error);
      return;
    }
    if (!parsed.value || typeof parsed.value !== "object") {
      setPreviewError("JSON is leeg of geen object.");
      return;
    }

    setPreviewError(null);
    setPreviewJson(parsed.value);
    setShowPreview(true);
  }

  async function loadPreviewFromBackend() {
    if (!backendCode || !backendInstanceId) {
      setPreviewError("Vul code + instanceId in.");
      return;
    }

    setBackendBusy(true);
    setPreviewError(null);

    try {
      const res = await getFormInstance(backendCode, backendInstanceId);
      const inst = normalizeInstanceResponse(res);

      const surveyJsonRaw = inst?.survey_json ?? inst?.surveyJson ?? null;
      const answersRaw = inst?.answers_json ?? inst?.answersJson ?? null;

      const surveyObj = typeof surveyJsonRaw === "string" ? safeJsonParse(surveyJsonRaw).value : surveyJsonRaw;
      const answersObj = typeof answersRaw === "string" ? safeJsonParse(answersRaw).value : answersRaw;

      if (!surveyObj || typeof surveyObj !== "object") {
        setPreviewError("Backend instance heeft geen geldige survey_json.");
        setPreviewJson(null);
        setAnswers({});
        return;
      }

      settingAnswersProgrammaticallyRef.current = true;
      setAnswers(answersObj && typeof answersObj === "object" ? answersObj : {});
      settingAnswersProgrammaticallyRef.current = false;

      setPreviewJson(surveyObj);
      setShowPreview(true);
    } catch (e) {
      setPreviewError(String(e?.message || e || "Backend load faalde."));
    } finally {
      setBackendBusy(false);
    }
  }

  function onPickFileClick() {
    fileInputRef.current?.click?.();
  }

  function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || "");
      setEditorText(txt);
      setTimeout(() => buildPreviewFromEditor(), 0);
    };
    reader.readAsText(file);

    e.target.value = "";
  }

  function handleEditorKeyDown(e) {
    if (e.key !== "Tab") return;

    e.preventDefault();

    const el = e.currentTarget;
    const value = String(el.value || "");
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;

    const indent = "  ";

    const hasSelection = end > start;
    const selectedText = value.slice(start, end);
    const affectsMultipleLines = hasSelection && selectedText.includes("\n");

    if (e.shiftKey) {
      if (affectsMultipleLines) {
        const before = value.slice(0, start);
        const sel = value.slice(start, end);
        const after = value.slice(end);

        const lines = sel.split("\n");
        let removedTotal = 0;

        const nextLines = lines.map((line) => {
          if (line.startsWith(indent)) {
            removedTotal += indent.length;
            return line.slice(indent.length);
          }
          if (line.startsWith("\t")) {
            removedTotal += 1;
            return line.slice(1);
          }
          return line;
        });

        const nextSel = nextLines.join("\n");
        const next = before + nextSel + after;

        setEditorText(next);

        requestAnimationFrame(() => {
          el.selectionStart = start;
          el.selectionEnd = end - removedTotal;
        });
        return;
      }

      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const prefix = value.slice(lineStart, start);

      if (prefix.endsWith(indent)) {
        const cutStart = start - indent.length;
        const next = value.slice(0, cutStart) + value.slice(start);
        setEditorText(next);

        requestAnimationFrame(() => {
          el.selectionStart = cutStart;
          el.selectionEnd = cutStart;
        });
        return;
      }

      if (prefix.endsWith("\t")) {
        const cutStart = start - 1;
        const next = value.slice(0, cutStart) + value.slice(start);
        setEditorText(next);

        requestAnimationFrame(() => {
          el.selectionStart = cutStart;
          el.selectionEnd = cutStart;
        });
        return;
      }

      return;
    }

    if (affectsMultipleLines) {
      const before = value.slice(0, start);
      const sel = value.slice(start, end);
      const after = value.slice(end);

      const lines = sel.split("\n");
      const nextLines = lines.map((line) => indent + line);
      const nextSel = nextLines.join("\n");

      const next = before + nextSel + after;
      setEditorText(next);

      requestAnimationFrame(() => {
        el.selectionStart = start;
        el.selectionEnd = end + indent.length * lines.length;
      });
      return;
    }

    const next = value.slice(0, start) + indent + value.slice(end);
    setEditorText(next);

    requestAnimationFrame(() => {
      const pos = start + indent.length;
      el.selectionStart = pos;
      el.selectionEnd = pos;
    });
  }

  async function onFormatClick() {
    const res = formatJsonText(editorText);
    if (!res.ok) {
      setNotice({ kind: "error", text: `Format faalde: ${short(res.error)}` });

      const loc = parseJsonErrorLoc(res.error, editorText);
      if (loc?.line) flashHighlightLine(loc.line, true);

      return;
    }

    setEditorText(res.value);
    setNotice({ kind: "ok", text: "JSON geformatteerd." }, { autoClearMs: 1200 });
  }

  async function onCopyClick() {
    try {
      await copyToClipboard(editorText);
      setNotice({ kind: "ok", text: "JSON naar klembord gekopieerd." }, { autoClearMs: 1200 });
    } catch (e) {
      setNotice({ kind: "error", text: `Copy faalde: ${short(e?.message || String(e))}` });
    }
  }

  function onDownloadDebugBundle() {
    const stamp = new Date().toISOString().replaceAll(":", "-");

    const bundle = {
      exported_at: new Date().toISOString(),
      survey_json: previewJson ?? null,
      answers_json: answersPreview ?? {},
      lastApplied: lastAppliedMap ?? {},
      prefillPayload: prefillPayload ?? null,
    };

    downloadJsonFile(`ember_debug_bundle_${stamp}.json`, bundle);
    setNotice({ kind: "ok", text: "Debug bundle download gestart." }, { autoClearMs: 1500 });
  }

  function onDownloadClick() {
    const name = `survey_json_${new Date().toISOString().replaceAll(":", "-")}.json`;
    downloadTextFile(name, editorText);
    setNotice({ kind: "ok", text: `Download gestart: ${name}` }, { autoClearMs: 1500 });
  }

  function onDividerMouseDown(e) {
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = leftWidth;
    document.body.style.userSelect = "none";
  }

  function onEditorHeightHandleMouseDown(e) {
    draggingHeightRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = editorHeight;
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    function onMouseMove(e) {
      if (draggingRef.current) {
        const dx = e.clientX - dragStartXRef.current;
        const next = dragStartWidthRef.current + dx;

        const min = 420;
        const max = Math.max(min, window.innerWidth - 420);
        setLeftWidth(clamp(next, min, max));
      }

      if (draggingHeightRef.current) {
        const dy = e.clientY - dragStartYRef.current;
        const next = dragStartHeightRef.current + dy;

        const min = 260;
        const max = Math.max(min, window.innerHeight - 180);
        setEditorHeight(clamp(next, min, max));
      }
    }

    function onMouseUp() {
      if (draggingRef.current || draggingHeightRef.current) {
        draggingRef.current = false;
        draggingHeightRef.current = false;
        document.body.style.userSelect = "";
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [leftWidth, editorHeight]);

  // Build model from previewJson; seed with answersRef.current (no “state echo” that can revert user edits)
  const model = useMemo(() => {
    if (!previewJson) return null;

    const m = new Model(previewJson);

    const seed = answersRef.current && typeof answersRef.current === "object" ? answersRef.current : {};
    m.data = { ...(m.data || {}), ...seed };

    m.onValueChanged.add(() => {
      const next = { ...(m.data || {}) };
      answersRef.current = next;
      setAnswersPreview(next);
    });

    modelRef.current = m;
    return m;
  }, [previewJson]);

  useEffect(() => {
    if (!autoApplyAfterLoadRef.current) return;
    if (!prefillPayload) return;

    requestAnimationFrame(() => {
      if (!autoApplyAfterLoadRef.current) return;
      if (!modelRef.current) return;

      autoApplyAfterLoadRef.current = false;
      applyPrefill({ onlyRefreshable: false });
    });
  }, [prefillPayload, previewJson]);

  function applyPrefill({ onlyRefreshable, payloadOverride } = {}) {
    const payload = payloadOverride || prefillPayload;
    if (!modelRef.current) {
      setPreviewError("Geen preview model geladen.");
      return;
    }
    if (!payload) {
      setPreviewError("Geen prefill payload geladen.");
      return;
    }

    setPreviewError(null);

    applyChoices(modelRef.current, payload);

    const nextApplied = applyBindings({
      model: modelRef.current,
      prefillPayload: payload,
      lastAppliedMap,
      onlyRefreshable,
      isRefresh: Boolean(onlyRefreshable),
    });

    setLastAppliedMap(nextApplied);

    const nextAnswers = { ...(modelRef.current.data || {}) };
    settingAnswersProgrammaticallyRef.current = true;
    answersRef.current = nextAnswers;
    setAnswersPreview(nextAnswers);
    settingAnswersProgrammaticallyRef.current = false;
  }

  async function loadPrefillFromBackend() {
    if (!installCode || !String(installCode).trim()) {
      setPreviewError("Vul installatiecode in voor prefill.");
      return;
    }
    if (!modelRef.current) {
      setPreviewError("Geen preview model geladen (klik eerst 'Preview uit editor').");
      return;
    }

    setPrefillBusy(true);
    setPreviewError(null);

    try {
      const keys = collectRequestedPrefillKeys(modelRef.current);
      if (keys.length === 0) {
        setPrefillPayload({
          ok: true,
          values: {},
          choices: {},
          warnings: [
            {
              type: "no_keys",
              message: "Geen ember.bind(kind=prefill) of ember.choices keys gevonden in survey.",
            },
          ],
          meta: {
            installCode: String(installCode).trim(),
            formCode: String(prefillFormCode || "DEV"),
            requestedKeyCount: 0,
            loadedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const res = await getFormPrefill(String(installCode).trim(), String(prefillFormCode || "DEV"), keys);

      const prefill = res?.prefill || {};
      const warnings = Array.isArray(res?.warnings) ? res.warnings : [];

      const payload = {
        ok: Boolean(res?.ok ?? true),
        values: prefill?.values || {},
        choices: prefill?.choices || {},
        warnings,
        meta: {
          installCode: String(installCode).trim(),
          formCode: String(prefillFormCode || "DEV"),
          requestedKeyCount: keys.length,
          loadedAt: new Date().toISOString(),
        },
        _raw: res,
      };
      autoApplyAfterLoadRef.current = true;
      setPrefillPayload(payload);

      // Keep dropdowns visually correct even before Apply:
      if (previewJson && payload?.choices) {
        const nextSurvey = injectChoicesIntoSurveyJson(previewJson, payload);
        setPreviewJson(nextSurvey);
      }
    } catch (e) {
      setPreviewError(String(e?.message || e || "Prefill load faalde."));
    } finally {
      setPrefillBusy(false);
    }
  }

  const unknownKeys = useMemo(() => {
    const ws = Array.isArray(prefillPayload?.warnings) ? prefillPayload.warnings : [];
    const w = ws.find((x) => x?.type === "unknown_keys");
    const uk = w?.unknown_keys;
    return Array.isArray(uk) ? uk.map(String) : [];
  }, [prefillPayload]);

  const splitStyle = useMemo(() => {
    if (!showEditor) return { display: "grid", gridTemplateColumns: "1fr", gap: 12 };
    return {
      display: "grid",
      gridTemplateColumns: `${Math.round(leftWidth)}px 10px minmax(0, 1fr)`,
      gap: 12,
      alignItems: "stretch",
      minHeight: 420,
    };
  }, [showEditor, leftWidth]);

  const formsCatalogNormalized = useMemo(() => {
    const arr = Array.isArray(formsCatalog) ? formsCatalog : [];
    const mapped = arr
      .map((x) => {
        if (!x) return null;
        const code = x.code ?? x.form_code ?? x.formCode ?? x.key ?? null;
        const name = x.name ?? x.display_name ?? x.displayName ?? x.title ?? null;
        if (!code) return null;
        return { code: String(code), name: name != null ? String(name) : "" };
      })
      .filter(Boolean);

    mapped.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
    return mapped;
  }, [formsCatalog]);

  const editorLines = useMemo(() => {
    const s = String(editorText || "");
    const count = s.length ? s.split("\n").length : 1;
    return count;
  }, [editorText]);

  function toggleCard(key) {
    setOpenCards((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Local SurveyJS “clean Ember” overrides (fix: dropdown hover + remove blue dividers) */}
      <style>{`
        .sd-list__item:hover,
        .sd-list__item.sd-list__item--selected:hover,
        .sv-list__item:hover {
          background: rgba(255,255,255,0.08) !important;
        }
        .sd-list__item:hover .sd-item__text,
        .sd-list__item:hover span,
        .sv-list__item:hover {
          color: rgba(255,255,255,0.92) !important;
        }

        .sd-page__title,
        .sd-page__description {
          border-bottom: 1px solid rgba(255,255,255,0.10) !important;
        }
        .sd-title,
        .sd-element__title,
        .sd-question__title {
          color: rgba(255,255,255,0.92) !important;
        }

        .sd-input:focus,
        .sd-dropdown:focus-within,
        .sd-text:focus-within {
          outline: none !important;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.14) !important;
        }
      `}</style>

      <div className="card" style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={onPickFileClick}>
          JSON laden
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={buildPreviewFromEditor}
          disabled={loadFromBackend}
          title={loadFromBackend ? "Zet 'load from backend' uit om editor te previewen." : undefined}
        >
          Preview uit editor
        </button>

        <button type="button" className="btn btn-secondary" onClick={() => setShowEditor((v) => !v)}>
          {showEditor ? "Verberg editor" : "Toon editor"}
        </button>

        <button type="button" className="btn btn-secondary" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? "Verberg preview" : "Toon preview"}
        </button>

        <div style={{ flex: "1 1 auto" }} />

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={loadFromBackend} onChange={(e) => setLoadFromBackend(e.target.checked)} />
          Load from backend instanceId (preview-only)
        </label>

        <input
          className="input"
          placeholder="code"
          style={{ width: 140 }}
          value={backendCode}
          onChange={(e) => setBackendCode(e.target.value)}
          disabled={!loadFromBackend || backendBusy}
        />

        <input
          className="input"
          placeholder="instanceId"
          style={{ width: 240 }}
          value={backendInstanceId}
          onChange={(e) => setBackendInstanceId(e.target.value)}
          disabled={!loadFromBackend || backendBusy}
        />

        <button type="button" className="btn" onClick={loadPreviewFromBackend} disabled={!loadFromBackend || backendBusy}>
          Load preview
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={onFileSelected}
        />
      </div>

      <div className="card" style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
          Prefill (backend)
        </div>

        <input
          className="input"
          placeholder="installatiecode"
          style={{ width: 220 }}
          value={installCode}
          onChange={(e) => setInstallCode(e.target.value)}
          disabled={prefillBusy}
        />

        <select
          className="input"
          style={{ width: 320 }}
          value={prefillFormCode}
          onChange={(e) => setPrefillFormCode(e.target.value)}
          disabled={prefillBusy || formsCatalogBusy}
          title={formsCatalogBusy ? "Catalog laden..." : "Kies een formuliercode voor prefill regels"}
        >
          <option value="DEV">DEV (designer)</option>
          {formsCatalogNormalized.map((f) => (
            <option key={f.code} value={f.code}>
              {f.name ? `${f.name} (${f.code})` : f.code}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={loadPrefillFromBackend}
          disabled={prefillBusy || !modelRef.current}
          title={
            !modelRef.current
              ? "Klik eerst 'Preview uit editor' om de survey te laden."
              : "Haalt keys uit survey + doet backend call."
          }
        >
          Load prefill (backend)
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => applyPrefill({ onlyRefreshable: false })}
          disabled={prefillBusy || !prefillPayload || !previewJson}
          title="Past alle binds toe volgens mode"
        >
          Apply prefill
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => applyPrefill({ onlyRefreshable: true })}
          disabled={prefillBusy || !prefillPayload || !previewJson}
          title="Refresh alleen velden met refreshable: true (zonder user wijzigingen te overschrijven)"
        >
          Refresh (refreshable only)
        </button>

        <div style={{ flex: "1 1 auto" }} />

        <div className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
          payload: {prefillPayload ? "geladen" : "niet geladen"}
        </div>
      </div>

      {unknownKeys.length > 0 && (
        <div className="card" style={{ padding: 12, border: "1px solid rgba(250,128,114,0.5)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Prefill waarschuwing: unknown keys ({unknownKeys.length})</div>
            <div className="muted" style={{ fontSize: 12 }}>Fix: key typo of ontbrekende mapping in SQL</div>
          </div>

          <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>{unknownKeys.join("\n")}</pre>
        </div>
      )}

      {previewError && <div style={{ color: "salmon" }}>{previewError}</div>}

      <div style={splitStyle}>
        {showEditor && (
          <div
            className="card"
            style={{
              padding: 12,
              minHeight: 420,
              height: "100%",
              display: "grid",
              gap: 8,
              gridTemplateRows: "auto auto minmax(0, 1fr) auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                survey_json editor (autosave localStorage) — Tab/Shift+Tab werkt
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={onFormatClick}>
                  Format
                </button>
                <button type="button" className="btn btn-secondary" onClick={onCopyClick}>
                  Copy
                </button>
                <button type="button" className="btn btn-secondary" onClick={onDownloadClick}>
                  Form
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={onDownloadDebugBundle}
                  title="Download 1 bestand met survey_json + answers_json + lastApplied + prefill payload"
                >
                  Debug
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => downloadJsonFile("prefillPayload.json", prefillPayload || null)}
                  disabled={!prefillPayload}
                  title="Download prefill payload (values/choices/warnings/meta)"
                >
                  Prefill
                </button>
              </div>
            </div>

            <div style={{ minHeight: 18, display: "flex", alignItems: "center", gap: 10 }}>
              {editorNotice ? (
                <div
                  style={{
                    fontSize: 12,
                    color: editorNotice.kind === "error" ? "salmon" : "rgba(255,255,255,0.7)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    flex: "1 1 auto",
                  }}
                  title={editorNotice.text}
                >
                  {editorNotice.text}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12, opacity: 0.65 }}>
                  &nbsp;
                </div>
              )}

              {braceMatch ? (
                <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  Match — L{braceMatch.aLc.line}:C{braceMatch.aLc.col} ↔ L{braceMatch.bLc.line}:C{braceMatch.bLc.col}
                </div>
              ) : null}
            </div>

            <div
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "48px minmax(0, 1fr)",
                gap: 0,
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "relative",
                  background: "rgba(255,255,255,0.03)",
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -editorScrollTop,
                    left: 0,
                    right: 0,
                    padding: "10px 8px",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    fontSize: 11,
                    lineHeight: `${lineHeightPx}px`,
                    color: "rgba(255,255,255,0.35)",
                    textAlign: "right",
                    userSelect: "none",
                    pointerEvents: "none",
                    whiteSpace: "pre",
                  }}
                >
                  {Array.from({ length: editorLines }).map((_, i) => {
                    const ln = i + 1;
                    const isHit = highlightLine === ln;
                    return (
                      <div key={ln} style={{ color: isHit ? "rgba(250,128,114,0.85)" : undefined }}>
                        {ln}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ position: "relative" }}>
                {highlightLine ? (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: (highlightLine - 1) * lineHeightPx - editorScrollTop + 10,
                      height: lineHeightPx,
                      background: "rgba(250,128,114,0.12)",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}

                {braceFlash ? (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 8,
                      height: 8,
                      width: 8,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.22)",
                      boxShadow: "0 0 0 4px rgba(255,255,255,0.06)",
                      opacity: 0.9,
                      pointerEvents: "none",
                    }}
                    title="{} match"
                  />
                ) : null}

                <textarea
                  ref={editorRef}
                  className="input"
                  style={{
                    width: "100%",
                    height: "100%",
                    minHeight: Math.round(editorHeight),
                    border: "none",
                    borderRadius: 0,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    fontSize: 12,
                    lineHeight: 1.4,
                    resize: "none",
                    padding: 10,
                  }}
                  value={editorText}
                  onChange={(e) => setEditorText(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  onKeyUp={updateBraceMatch}
                  onClick={updateBraceMatch}
                  onSelect={updateBraceMatch}
                  onScroll={(e) => setEditorScrollTop(e.currentTarget.scrollTop)}
                  spellCheck={false}
                  disabled={backendBusy}
                />
              </div>
            </div>

            <div
              onMouseDown={onEditorHeightHandleMouseDown}
              title="Sleep om editor hoogte te wijzigen"
              style={{
                cursor: "row-resize",
                height: 10,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
              }}
            />
          </div>
        )}

        {showEditor && (
          <div
            onMouseDown={onDividerMouseDown}
            title="Sleep om editor breedte te wijzigen"
            style={{
              cursor: "col-resize",
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              width: 10,
            }}
          />
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {showPreview && (
            <div className="card" style={{ padding: 12, minHeight: 420 }}>
              {!model ? <div className="muted">Geen preview geladen.</div> : <Survey model={model} />}
            </div>
          )}

          <div className="card" style={{ padding: 12 }}>
            <ToggleRow
              title="answers_json (live)"
              meta={openCards.answers ? null : "ingeklapt"}
              isOpen={openCards.answers}
              onToggle={() => toggleCard("answers")}
              iconRef={(el) => {
                toggleIconRef.current.answers = el;
              }}
              onIconEnter={() => animateIcon("answers")}
              onIconLeave={() => stopIcon("answers")}
            />
            {openCards.answers && (
              <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(answersPreview || {}, null, 2)}
              </pre>
            )}
          </div>

          <div className="card" style={{ padding: 12 }}>
            <ToggleRow
              title="lastApplied (voor overwrite-if-unchanged)"
              meta={openCards.lastApplied ? null : "ingeklapt"}
              isOpen={openCards.lastApplied}
              onToggle={() => toggleCard("lastApplied")}
              iconRef={(el) => {
                toggleIconRef.current.lastApplied = el;
              }}
              onIconEnter={() => animateIcon("lastApplied")}
              onIconLeave={() => stopIcon("lastApplied")}
            />
            {openCards.lastApplied && (
              <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(lastAppliedMap || {}, null, 2)}
              </pre>
            )}
          </div>

          {prefillPayload && (
            <div className="card" style={{ padding: 12 }}>
              <ToggleRow
                title="prefill payload (debug)"
                meta={openCards.prefill ? null : "ingeklapt"}
                isOpen={openCards.prefill}
                onToggle={() => toggleCard("prefill")}
                iconRef={(el) => {
                  toggleIconRef.current.prefill = el;
                }}
                onIconEnter={() => animateIcon("prefill")}
                onIconLeave={() => stopIcon("prefill")}
              />
              {openCards.prefill && (
                <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(prefillPayload, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}