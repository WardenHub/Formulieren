import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { Survey } from "survey-react-ui";
import "survey-core/survey-core.min.css";
import "survey-core/i18n/dutch";

import "@/styles/surveyjs-overrides.css";
import {
  getFormInstance,
  getFormPrefill,
  getFormsCatalog,
  previewSubmitFormInstance,
} from "@/api/emberApi.js";

import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { ChevronsDownUpIcon } from "@/components/ui/chevrons-down-up";
import { ChevronsUpDownIcon } from "@/components/ui/chevrons-up-down";

import FormPageNavigator from "@/pages/Forms/shared/FormPageNavigator.jsx";

import {
  safeJsonParse,
  normalizeInstanceResponse,
  clamp,
  getLsNumber,
} from "@/pages/Forms/shared/surveyCore.jsx";

import {
  evaluateLocalFollowUps,
} from "@/pages/Forms/shared/followUps.jsx";

import {
  collectValidationSummary,
  syncAllMatrixQuestionVisualErrors,
} from "@/pages/Forms/shared/validation.jsx";

import {
  scrollToDesignerQuestion,
} from "@/pages/Forms/shared/navigation.jsx";

import {
  collectEmberMeta,
  collectRequestedPrefillKeys,
} from "@/pages/Forms/shared/prefill.jsx";

import {
  registerEmberSurveyFunctions,
} from "@/pages/Forms/shared/modelBuilders.jsx";

import {
  buildRuntimeModelFromSurvey,
  applyRuntimePrefillToModel,
  emptyRuntimePrefillPayload,
} from "@/pages/Forms/shared/runtimeBuilder.jsx";

import {
  attachRuntimeBehaviors,
} from "@/pages/Forms/shared/runtimeBehaviors.jsx";

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

function downloadTextFile(filename, text) {
  const blob = new Blob([String(text || "")], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadJsonFile(filename, obj) {
  const text = JSON.stringify(obj ?? null, null, 2) + "\n";
  downloadTextFile(filename, text);
}

function indexToLineCol(text, index) {
  const s = String(text || "");
  const i = clamp(Number(index) || 0, 0, s.length);

  let line = 1;
  let col = 1;

  for (let p = 0; p < i; p += 1) {
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
    for (let p = i; p < s.length; p += 1) {
      const c = s[p];
      if (c === openCh) depth += 1;
      if (c === closeCh) depth -= 1;
      if (depth === 0) return { from: i, to: p };
    }
    return null;
  }

  for (let p = i; p >= 0; p -= 1) {
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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          minWidth: 0,
          flexWrap: "wrap",
        }}
      >
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

function defaultOpenCards() {
  return {
    answers: false,
    lastApplied: false,
    prefill: false,
    followUpDebug: true,
    followUpDefinitions: false,
    localFollowUpPreview: true,
    backendSubmitPreview: false,
  };
}

function readOpenCardsFromStorage() {
  const raw = localStorage.getItem("dev.formdesigner.openCards");
  if (!raw) return defaultOpenCards();

  try {
    const v = JSON.parse(raw);
    return {
      answers: Boolean(v?.answers),
      lastApplied: Boolean(v?.lastApplied),
      prefill: Boolean(v?.prefill),
      followUpDebug: v?.followUpDebug !== false,
      followUpDefinitions: Boolean(v?.followUpDefinitions),
      localFollowUpPreview: v?.localFollowUpPreview !== false,
      backendSubmitPreview: Boolean(v?.backendSubmitPreview),
    };
  } catch {
    return defaultOpenCards();
  }
}

function normalizeAdminBootstrap(raw) {
  if (!raw || typeof raw !== "object") return null;

  let surveyJson = raw.survey_json ?? null;

  if (typeof surveyJson === "string") {
    const parsed = safeJsonParse(surveyJson);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return null;
    surveyJson = parsed.value;
  }

  if (!surveyJson || typeof surveyJson !== "object") return null;

  return {
    source: raw.source ?? "admin",
    form_id: raw.form_id ?? null,
    form_code: raw.form_code ?? null,
    form_name: raw.form_name ?? null,
    survey_json: surveyJson,
    opened_at: raw.opened_at ?? null,
  };
}

function readAdminFormDevBootstrap(locationState) {
  const fromLocation = normalizeAdminBootstrap(locationState);
  if (fromLocation) {
    return { ...fromLocation, _fromStorage: false };
  }

  try {
    const raw = sessionStorage.getItem("admin.formdev.bootstrap");
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const normalized = normalizeAdminBootstrap(parsed);
    if (!normalized) return null;

    return { ...normalized, _fromStorage: true };
  } catch {
    return null;
  }
}

function normalizePrefillPayloadForDesigner(raw, installCode, formCode) {
  if (!raw) {
    return {
      ...emptyRuntimePrefillPayload(),
      meta: {
        installCode: String(installCode || "").trim(),
        formCode: String(formCode || "DEV"),
        requestedKeyCount: 0,
        loadedAt: new Date().toISOString(),
      },
    };
  }

  const prefill = raw?.prefill || raw;
  const warnings = Array.isArray(raw?.warnings) ? raw.warnings : [];

  return {
    ok: Boolean(raw?.ok ?? true),
    prefill: {
      values: prefill?.values || {},
      choices: prefill?.choices || {},
    },
    warnings,
    meta: {
      installCode: String(installCode || "").trim(),
      formCode: String(formCode || "DEV"),
      requestedKeyCount: 0,
      loadedAt: new Date().toISOString(),
    },
    _raw: raw,
  };
}

export default function FormDesigner() {
  registerEmberSurveyFunctions();

  const location = useLocation();

  const adminBootstrap = useMemo(() => {
    return readAdminFormDevBootstrap(location.state);
  }, [location.state]);

  const didApplyAdminBootstrapRef = useRef(false);

  const [editorText, setEditorText] = useState(() => {
    if (adminBootstrap?.survey_json && typeof adminBootstrap.survey_json === "object") {
      return JSON.stringify(adminBootstrap.survey_json, null, 2) + "\n";
    }

    const fromLs = localStorage.getItem("dev.formdesigner.editorText");
    return fromLs || '{\n  "title": "Preview",\n  "pages": []\n}\n';
  });

  const [previewJson, setPreviewJson] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [answersPreview, setAnswersPreview] = useState({});
  const answersRef = useRef({});
  const suppressDirtyRef = useRef(false);
  const canEditRef = useRef(true);
  const validationActivatedRef = useRef(false);

  const [showPreview, setShowPreview] = useState(true);
  const [showEditor, setShowEditor] = useState(() => {
    const v = localStorage.getItem("dev.formdesigner.showEditor");
    return v === null ? true : v === "true";
  });

  const [leftWidth, setLeftWidth] = useState(() =>
    getLsNumber("dev.formdesigner.leftWidth", 620)
  );
  const [editorHeight, setEditorHeight] = useState(() =>
    getLsNumber("dev.formdesigner.editorHeight", 520)
  );

  const [loadFromBackend, setLoadFromBackend] = useState(false);
  const [backendCode, setBackendCode] = useState("");
  const [backendInstanceId, setBackendInstanceId] = useState("");
  const [backendBusy, setBackendBusy] = useState(false);
  const [backendInstance, setBackendInstance] = useState(null);

  const [installCode, setInstallCode] = useState("");
  const [prefillFormCode, setPrefillFormCode] = useState(() => {
    if (adminBootstrap?.form_code) {
      return String(adminBootstrap.form_code);
    }

    const v = localStorage.getItem("dev.formdesigner.prefillFormCode");
    return v || "DEV";
  });

  const [formsCatalog, setFormsCatalog] = useState([]);
  const [formsCatalogBusy, setFormsCatalogBusy] = useState(false);

  const [prefillBusy, setPrefillBusy] = useState(false);
  const [prefillPayload, setPrefillPayload] = useState(null);
  const [lastAppliedMap, setLastAppliedMap] = useState({});

  const [runtimeModel, setRuntimeModel] = useState(null);
  const runtimeDetachRef = useRef(null);

  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const [lineHeightPx, setLineHeightPx] = useState(17);

  const [editorNotice, setEditorNotice] = useState(null);
  const [highlightLine, setHighlightLine] = useState(null);
  const [braceMatch, setBraceMatch] = useState(null);
  const [braceFlash, setBraceFlash] = useState(null);

  const [localFollowUpPreview, setLocalFollowUpPreview] = useState(null);
  const [backendSubmitPreview, setBackendSubmitPreview] = useState(null);
  const [submitPreviewBusy, setSubmitPreviewBusy] = useState(false);

  const [validationSummary, setValidationSummary] = useState([]);
  const [validationActivated, setValidationActivated] = useState(false);
  const [validationListOpen, setValidationListOpen] = useState(true);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);

  const [openCards, setOpenCards] = useState(readOpenCardsFromStorage);

  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const surveyHostRef = useRef(null);

  const noticeTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const validationCollapseAnimTimerRef = useRef(null);

  const pendingNavigationRef = useRef(null);
  const navigationAttemptRef = useRef(0);
  const renderedQuestionElementsRef = useRef(new Map());

  const toggleIconRef = useRef({
    answers: null,
    lastApplied: null,
    prefill: null,
    followUpDebug: null,
    followUpDefinitions: null,
    localFollowUpPreview: null,
    backendSubmitPreview: null,
  });

  const validationCollapseIconRef = useRef(null);

  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const draggingHeightRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);

  const energyAutoStateRef = useRef({});
  const availabilityAutoStateRef = useRef({});

  const followUpMeta = useMemo(() => {
    const { followUps } = collectEmberMeta(runtimeModel);
    return followUps;
  }, [runtimeModel]);

  const unknownKeys = useMemo(() => {
    const ws = Array.isArray(prefillPayload?.warnings) ? prefillPayload.warnings : [];
    const w = ws.find((x) => x?.type === "unknown_keys");
    const uk = w?.unknown_keys;
    return Array.isArray(uk) ? uk.map(String) : [];
  }, [prefillPayload]);

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

  const editorLines = useMemo(() => {
    const s = String(editorText || "");
    return s.length ? s.split("\n").length : 1;
  }, [editorText]);

  const hasValidationItems = validationSummary.length > 0;
  const validationCollapseBtnTitle = validationListOpen
    ? "Controlelijst inklappen"
    : "Controlelijst uitklappen";
  const ValidationCollapseIcon = validationListOpen
    ? ChevronsDownUpIcon
    : ChevronsUpDownIcon;

  const rebuildRuntimeModel = useCallback(async ({
    nextSurveyJson = previewJson,
    nextAnswers = answersRef.current,
    nextPrefillPayload = prefillPayload,
    nextInstance = backendInstance,
  } = {}) => {
    if (!nextSurveyJson) {
      setRuntimeModel(null);
      return;
    }

    if (runtimeDetachRef.current) {
      runtimeDetachRef.current();
      runtimeDetachRef.current = null;
    }

    renderedQuestionElementsRef.current = new Map();

    const buildRes = await buildRuntimeModelFromSurvey({
      surveyJson: nextSurveyJson,
      answersObj: nextAnswers || {},
      prefillPayload: nextPrefillPayload,
      instance: nextInstance,
      onDirtyChange: () => {},
      canEditRef,
      suppressDirtyRef,
      lastAppliedMap,
    });

    if (!buildRes.ok) {
      setRuntimeModel(null);
      setPreviewError(buildRes.error || "Runtime model kon niet worden opgebouwd.");
      return;
    }

    const model = buildRes.model;
    setRuntimeModel(model);
    setLastAppliedMap(buildRes.lastAppliedMap || {});
    setAnswersPreview({ ...(model.data || {}) });

    const afterRenderDesignerHandler = (_, options) => {
      const qname = String(options?.question?.name || "").trim();
      const el = options?.htmlElement || null;

      if (qname && el) {
        renderedQuestionElementsRef.current.set(qname, el);
      }
    };

    model.onAfterRenderQuestion.add(afterRenderDesignerHandler);

    runtimeDetachRef.current = (() => {
      const detachRuntime = attachRuntimeBehaviors({
        model,
        prefillPayload: nextPrefillPayload,
        energyAutoStateRef,
        availabilityAutoStateRef,
        validationActivatedRef,
        suppressDirtyRef,
        onAnswersSnapshotChange: (next) => {
          answersRef.current = next && typeof next === "object" ? next : {};
          setAnswersPreview(answersRef.current);
        },
        onValidationSummaryChange: setValidationSummary,
      });

      return () => {
        detachRuntime?.();
        model.onAfterRenderQuestion.remove(afterRenderDesignerHandler);
      };
    })();

    setPreviewError(null);
  }, [previewJson, prefillPayload, backendInstance, lastAppliedMap]);

  function animateIcon(key) {
    toggleIconRef.current[key]?.startAnimation?.();
  }

  function stopIcon(key) {
    toggleIconRef.current[key]?.stopAnimation?.();
  }

  function toggleCard(key) {
    setOpenCards((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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

  function setAnswers(next) {
    const obj = next && typeof next === "object" ? next : {};
    answersRef.current = obj;
    setAnswersPreview(obj);
  }

  function resetPreviewSideStates() {
    setLocalFollowUpPreview(null);
    setBackendSubmitPreview(null);
    setValidationSummary([]);
    setValidationActivated(false);
    validationActivatedRef.current = false;
    setValidationListOpen(true);
    setCurrentPageIndex(0);
    setBookmarksOpen(false);
    pendingNavigationRef.current = null;
    navigationAttemptRef.current = 0;
  }

  function tryScrollToPendingDesignerQuestion() {
    const pending = pendingNavigationRef.current;
    if (!pending?.questionName) return true;

    const found = scrollToDesignerQuestion(
      pending.questionName,
      renderedQuestionElementsRef
    );

    if (found) {
      pendingNavigationRef.current = null;
      navigationAttemptRef.current = 0;
      return true;
    }

    if (navigationAttemptRef.current >= 16) {
      pendingNavigationRef.current = null;
      navigationAttemptRef.current = 0;
      return false;
    }

    navigationAttemptRef.current += 1;
    window.setTimeout(() => {
      tryScrollToPendingDesignerQuestion();
    }, 120);

    return false;
  }

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

  async function buildPreviewFromEditor() {
    const parsed = safeJsonParse(editorText);
    if (!parsed.ok) {
      setPreviewError(parsed.error);
      return;
    }

    if (!parsed.value || typeof parsed.value !== "object") {
      setPreviewError("JSON is leeg of geen object.");
      return;
    }

    const nextPreviewJson = parsed.value;

    setPreviewError(null);
    setBackendInstance(null);
    setPreviewJson(nextPreviewJson);
    setShowPreview(true);
    setLastAppliedMap({});
    resetPreviewSideStates();

    await rebuildRuntimeModel({
      nextSurveyJson: nextPreviewJson,
      nextAnswers: answersRef.current,
      nextPrefillPayload: prefillPayload,
      nextInstance: null,
    });
  }

  useEffect(() => {
    if (!adminBootstrap?.survey_json) return;
    if (didApplyAdminBootstrapRef.current) return;

    didApplyAdminBootstrapRef.current = true;

    setPreviewError(null);
    setLoadFromBackend(false);
    setBackendBusy(false);
    setShowEditor(true);
    setShowPreview(true);

    if (adminBootstrap?.form_code) {
      setPrefillFormCode(String(adminBootstrap.form_code));
    }

    setTimeout(() => {
      buildPreviewFromEditor();
    }, 0);

    setNotice(
      {
        kind: "ok",
        text: `Admin bootstrap geladen; ${adminBootstrap.form_name || ""}`.trim(),
      },
      { autoClearMs: 1800 }
    );
  }, [adminBootstrap, editorText]);

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

      const surveyObj =
        typeof surveyJsonRaw === "string" ? safeJsonParse(surveyJsonRaw).value : surveyJsonRaw;
      const answersObj =
        typeof answersRaw === "string" ? safeJsonParse(answersRaw).value : answersRaw;

      if (!surveyObj || typeof surveyObj !== "object") {
        setPreviewError("Backend instance heeft geen geldige survey_json.");
        setPreviewJson(null);
        setAnswers({});
        setRuntimeModel(null);
        return;
      }

      setBackendInstance(inst || null);
      setAnswers(answersObj && typeof answersObj === "object" ? answersObj : {});
      setPreviewJson(surveyObj);
      setShowPreview(true);
      setLastAppliedMap({});
      resetPreviewSideStates();

      await rebuildRuntimeModel({
        nextSurveyJson: surveyObj,
        nextAnswers: answersObj && typeof answersObj === "object" ? answersObj : {},
        nextPrefillPayload: prefillPayload,
        nextInstance: inst || null,
      });
    } catch (e) {
      setPreviewError(String(e?.message || e || "Backend load faalde."));
    } finally {
      setBackendBusy(false);
    }
  }

  async function loadPrefillFromBackend() {
    if (!installCode || !String(installCode).trim()) {
      setPreviewError("Vul installatiecode in voor prefill.");
      return;
    }

    if (!runtimeModel) {
      setPreviewError("Geen preview model geladen; klik eerst 'Preview uit editor'.");
      return;
    }

    setPrefillBusy(true);
    setPreviewError(null);

    try {
      const keys = collectRequestedPrefillKeys(runtimeModel);

      if (keys.length === 0) {
        const emptyPayload = {
          ...emptyRuntimePrefillPayload(),
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
        };

        setPrefillPayload(emptyPayload);

        await rebuildRuntimeModel({
          nextSurveyJson: previewJson,
          nextAnswers: answersRef.current,
          nextPrefillPayload: emptyPayload,
          nextInstance: backendInstance,
        });

        return;
      }

      const res = await getFormPrefill(
        String(installCode).trim(),
        String(prefillFormCode || "DEV"),
        keys
      );

      const payload = normalizePrefillPayloadForDesigner(
        res,
        installCode,
        prefillFormCode
      );

      payload.meta.requestedKeyCount = keys.length;

      setPrefillPayload(payload);

      await rebuildRuntimeModel({
        nextSurveyJson: previewJson,
        nextAnswers: answersRef.current,
        nextPrefillPayload: payload,
        nextInstance: backendInstance,
      });

      setValidationSummary([]);
      setValidationActivated(false);
      validationActivatedRef.current = false;
      setValidationListOpen(true);
    } catch (e) {
      setPreviewError(String(e?.message || e || "Prefill load faalde."));
    } finally {
      setPrefillBusy(false);
    }
  }

  function applyPrefill({ onlyRefreshable } = {}) {
    if (!runtimeModel) {
      setPreviewError("Geen preview model geladen.");
      return;
    }

    if (!prefillPayload) {
      setPreviewError("Geen prefill payload geladen.");
      return;
    }

    setPreviewError(null);

    const result = applyRuntimePrefillToModel({
      model: runtimeModel,
      prefillPayload,
      lastAppliedMap,
      onlyRefreshable: Boolean(onlyRefreshable),
      isRefresh: Boolean(onlyRefreshable),
      instance: backendInstance,
    });

    if (!result.ok) {
      setPreviewError(result.error || "Prefill toepassen mislukt.");
      return;
    }

    setLastAppliedMap(result.lastAppliedMap || {});
    setAnswers(result.data || {});
    setValidationSummary([]);
    setValidationActivated(false);
    validationActivatedRef.current = false;
    setValidationListOpen(true);
  }

  function runLocalFollowUpPreview() {
    if (!previewJson || typeof previewJson !== "object") {
      setPreviewError("Geen preview survey geladen.");
      return;
    }

    setPreviewError(null);

    const result = evaluateLocalFollowUps(previewJson, answersPreview || {});
    setLocalFollowUpPreview({
      generated_at: new Date().toISOString(),
      definition_count: Array.isArray(result?.definitions) ? result.definitions.length : 0,
      item_count: Array.isArray(result?.items) ? result.items.length : 0,
      items: result?.items || [],
      definitions: result?.definitions || [],
    });
  }

  function runValidationSync(model) {
    if (!model) return [];
    model.validate(true);
    syncAllMatrixQuestionVisualErrors(model);
    return collectValidationSummary(model);
  }

  function runLocalValidationPreview() {
    if (!runtimeModel) {
      setPreviewError("Geen preview model geladen.");
      return false;
    }

    setPreviewError(null);

    try {
      setValidationActivated(true);
      validationActivatedRef.current = true;

      const summary = runValidationSync(runtimeModel);
      const isValid = summary.length === 0;

      setValidationSummary(summary);
      setValidationListOpen(true);

      if (isValid) {
        setNotice(
          { kind: "ok", text: "Geen openstaande required of validatieproblemen gevonden." },
          { autoClearMs: 1500 }
        );
        return true;
      }

      setNotice({
        kind: "error",
        text: `Er zijn nog ${summary.length} validatieprobleem/problemen.`,
      });

      return false;
    } catch (e) {
      setPreviewError(`Validatie mislukt: ${String(e?.message || e || "onbekende fout")}`);
      return false;
    }
  }

  function openValidationItem(item) {
    const model = runtimeModel;
    if (!model || !item) return;

    const targetPage = Array.isArray(model.visiblePages) ? model.visiblePages[item.pageIndex] : null;
    if (targetPage) {
      model.currentPage = targetPage;
      setCurrentPageIndex(item.pageIndex);
      setBookmarksOpen(false);
    }

    pendingNavigationRef.current = {
      questionName: item.questionName,
      pageIndex: item.pageIndex,
    };
    navigationAttemptRef.current = 0;

    requestAnimationFrame(() => {
      tryScrollToPendingDesignerQuestion();
    });
  }

  function goToPageIndex(pageIndex) {
    const model = runtimeModel;
    const pages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];
    const targetPage = pages[pageIndex] || null;

    if (!model || !targetPage) return;

    model.currentPage = targetPage;
    setCurrentPageIndex(pageIndex);
    setBookmarksOpen(false);
  }

  async function runBackendSubmitPreview() {
    if (!backendCode || !String(backendCode).trim()) {
      setPreviewError("Vul backend code in voor backend submit preview.");
      return;
    }

    if (!backendInstanceId || !String(backendInstanceId).trim()) {
      setPreviewError("Vul backend instanceId in voor backend submit preview.");
      return;
    }

    if (!runtimeModel) {
      setPreviewError("Geen preview model geladen.");
      return;
    }

    const isValid = runLocalValidationPreview();
    if (!isValid) {
      setBackendSubmitPreview(null);
      return;
    }

    setSubmitPreviewBusy(true);
    setPreviewError(null);

    try {
      const res = await previewSubmitFormInstance(
        String(backendCode).trim(),
        String(backendInstanceId).trim(),
        {
          answers_json: answersPreview || {},
        }
      );

      setBackendSubmitPreview(res || null);
      setOpenCards((prev) => ({
        ...prev,
        followUpDebug: true,
        backendSubmitPreview: true,
      }));
    } catch (e) {
      setPreviewError(String(e?.message || e || "Backend submit preview faalde."));
    } finally {
      setSubmitPreviewBusy(false);
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
      setTimeout(() => {
        buildPreviewFromEditor();
      }, 0);
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

  function onDownloadClick() {
    const name = `survey_json_${new Date().toISOString().replaceAll(":", "-")}.json`;
    downloadTextFile(name, editorText);
    setNotice({ kind: "ok", text: `Download gestart: ${name}` }, { autoClearMs: 1500 });
  }

  function onDownloadDebugBundle() {
    const stamp = new Date().toISOString().replaceAll(":", "-");

    const bundle = {
      exported_at: new Date().toISOString(),
      survey_json: previewJson ?? null,
      answers_json: answersPreview ?? {},
      lastApplied: lastAppliedMap ?? {},
      prefillPayload: prefillPayload ?? null,
      localFollowUpPreview: localFollowUpPreview ?? null,
      backendSubmitPreview: backendSubmitPreview ?? null,
      validationSummary: validationSummary ?? [],
      currentPageIndex,
    };

    downloadJsonFile(`ember_debug_bundle_${stamp}.json`, bundle);
    setNotice({ kind: "ok", text: "Debug bundle download gestart." }, { autoClearMs: 1500 });
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
    if (!adminBootstrap?._fromStorage) return;

    try {
      sessionStorage.removeItem("admin.formdev.bootstrap");
    } catch {
      // stil
    }
  }, [adminBootstrap]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setFormsCatalogBusy(true);
      try {
        const res = await getFormsCatalog();
        const items = res?.items || res?.forms || res || [];
        if (!cancelled) setFormsCatalog(Array.isArray(items) ? items : []);
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

  useEffect(() => {
    if (validationSummary.length > 0) {
      setValidationListOpen(true);
    }
  }, [validationSummary]);

  useEffect(() => {
    validationActivatedRef.current = validationActivated;
  }, [validationActivated]);

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

  useEffect(() => {
    function onKeyDown(e) {
      const key = String(e.key || "");

      if (e.altKey && (key === "q" || key === "Q")) {
        if (!hasValidationItems) return;

        e.preventDefault();
        setValidationListOpen((prev) => !prev);

        validationCollapseIconRef.current?.startAnimation?.();

        if (validationCollapseAnimTimerRef.current) {
          clearTimeout(validationCollapseAnimTimerRef.current);
        }

        validationCollapseAnimTimerRef.current = window.setTimeout(() => {
          validationCollapseIconRef.current?.stopAnimation?.();
        }, 650);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasValidationItems]);

  useEffect(() => {
    const model = runtimeModel;
    if (!model) return;

    const syncCurrentPage = () => {
      const pages = Array.isArray(model.visiblePages) ? model.visiblePages : [];
      const idx = Math.max(0, pages.indexOf(model.currentPage));
      setCurrentPageIndex(idx >= 0 ? idx : 0);
    };

    syncCurrentPage();
    model.onCurrentPageChanged.add(syncCurrentPage);

    return () => {
      model.onCurrentPageChanged.remove(syncCurrentPage);
    };
  }, [runtimeModel]);

  useEffect(() => {
    if (!showPreview) return;
    if (!pendingNavigationRef.current?.questionName) return;
    if (!runtimeModel) return;
    if (!surveyHostRef.current) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          tryScrollToPendingDesignerQuestion();
        });
      });
    });
  }, [runtimeModel, showPreview, currentPageIndex]);

  useEffect(() => {
    return () => {
      if (runtimeDetachRef.current) {
        runtimeDetachRef.current();
        runtimeDetachRef.current = null;
      }

      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (validationCollapseAnimTimerRef.current) clearTimeout(validationCollapseAnimTimerRef.current);
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
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
          disabled={prefillBusy || !runtimeModel}
          title={
            !runtimeModel
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
          disabled={prefillBusy || !prefillPayload || !runtimeModel}
          title="Past alle binds toe volgens dezelfde runtime pipeline als FormRunner"
        >
          Apply prefill
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => applyPrefill({ onlyRefreshable: true })}
          disabled={prefillBusy || !prefillPayload || !runtimeModel}
          title="Refresh alleen velden met refreshable: true; zonder user wijzigingen te overschrijven"
        >
          Refresh (refreshable only)
        </button>

        <div style={{ flex: "1 1 auto" }} />

        <div className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
          payload: {prefillPayload ? "geladen" : "niet geladen"}
        </div>
      </div>

      <div
        className="card"
        style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
      >
        <div className="muted" style={{ fontSize: 12 }}>
          Follow-ups / validatie
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={runLocalValidationPreview}
          disabled={!previewJson || !runtimeModel}
          title="Controleert required fields en SurveyJS validators lokaal"
        >
          Check validatie (local)
        </button>

        <button
          type="button"
          className="btn"
          onClick={runLocalFollowUpPreview}
          disabled={!previewJson || !runtimeModel}
          title="Evalueert ember.followUp lokaal op basis van de huidige preview + live answers"
        >
          Preview follow-ups (local)
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={runBackendSubmitPreview}
          disabled={submitPreviewBusy || !backendCode || !backendInstanceId || !runtimeModel}
          title="Roept de echte backend submit-preview endpoint aan; maar pas na lokale validatie"
        >
          {submitPreviewBusy ? "Bezig..." : "Preview submit (backend)"}
        </button>

        <div className="muted" style={{ fontSize: 12 }}>
          ember.followUp vragen: {followUpMeta.length}
        </div>

        <div className="muted" style={{ fontSize: 12 }}>
          validatie issues: {validationSummary.length}
        </div>

        <div className="muted" style={{ fontSize: 12 }}>
          local items: {localFollowUpPreview?.item_count ?? 0}
        </div>

        <div className="muted" style={{ fontSize: 12 }}>
          backend items: {backendSubmitPreview?.count ?? 0}
        </div>
      </div>

      {unknownKeys.length > 0 && (
        <div className="card" style={{ padding: 12, border: "1px solid rgba(250,128,114,0.5)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Prefill waarschuwing: unknown keys ({unknownKeys.length})</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Fix: key typo of ontbrekende mapping in SQL
            </div>
          </div>

          <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
            {unknownKeys.join("\n")}
          </pre>
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
                survey_json editor (autosave localStorage) ; Tab/Shift+Tab werkt
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
                  title="Download 1 bestand met survey_json + answers_json + lastApplied + prefill payload + followUp preview + validation summary"
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
                  Match ; L{braceMatch.aLc.line}:C{braceMatch.aLc.col} ↔ L{braceMatch.bLc.line}:C{braceMatch.bLc.col}
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
          {showPreview && runtimeModel && (
            <FormPageNavigator
              model={runtimeModel}
              currentPageIndex={currentPageIndex}
              validationSummary={validationSummary}
              hasValidatedOnce={validationActivated}
              bookmarksOpen={bookmarksOpen}
              onToggleBookmarks={(next) => {
                if (typeof next === "boolean") {
                  setBookmarksOpen(next);
                  return;
                }
                setBookmarksOpen((prev) => !prev);
              }}
              onNavigateToPage={(pageIndex) => {
                goToPageIndex(pageIndex);
              }}
            />
          )}

          {validationSummary.length > 0 && (
            <div
              className="card"
              style={{
                padding: 12,
                display: "grid",
                gap: 8,
                border: "1px solid rgba(250, 128, 114, 0.35)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>Controleer eerst de volgende velden</div>

                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Klik op een regel om naar het betreffende onderdeel te gaan.
                  </div>
                </div>

                <button
                  type="button"
                  className="icon-btn"
                  title={validationCollapseBtnTitle}
                  onClick={() => setValidationListOpen((prev) => !prev)}
                  onMouseEnter={() => validationCollapseIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => validationCollapseIconRef.current?.stopAnimation?.()}
                >
                  <ValidationCollapseIcon
                    ref={validationCollapseIconRef}
                    size={18}
                    className="nav-anim-icon"
                  />
                </button>
              </div>

              {validationListOpen && (
                <div style={{ display: "grid", gap: 6 }}>
                  {validationSummary.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => openValidationItem(item)}
                      style={{
                        textAlign: "left",
                        justifyContent: "flex-start",
                        whiteSpace: "normal",
                        lineHeight: 1.35,
                      }}
                      title={`${item.pageTitle} · ${item.questionTitle}`}
                    >
                      <span>
                        <strong>{item.pageTitle}</strong>
                        {" · "}
                        {item.questionTitle}
                        {" ; "}
                        {item.message}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {showPreview && (
            <div
              ref={surveyHostRef}
              className="card"
              style={{ padding: 12, minHeight: 420 }}
            >
              {!runtimeModel ? (
                <div className="muted">Geen preview geladen.</div>
              ) : (
                <Survey model={runtimeModel} />
              )}
            </div>
          )}

          <div className="card" style={{ padding: 12, display: "grid", gap: 12 }}>
            <ToggleRow
              title="follow-up debug"
              meta={
                openCards.followUpDebug
                  ? null
                  : `vragen: ${followUpMeta.length} · local: ${localFollowUpPreview?.item_count ?? 0} · backend: ${backendSubmitPreview?.count ?? 0}`
              }
              isOpen={openCards.followUpDebug}
              onToggle={() => toggleCard("followUpDebug")}
              iconRef={(el) => {
                toggleIconRef.current.followUpDebug = el;
              }}
              onIconEnter={() => animateIcon("followUpDebug")}
              onIconLeave={() => stopIcon("followUpDebug")}
            />

            {openCards.followUpDebug && (
              <>
                <div className="card" style={{ padding: 12 }}>
                  <ToggleRow
                    title="ember.followUp vragen in huidige preview"
                    meta={openCards.followUpDefinitions ? null : `${followUpMeta.length}`}
                    isOpen={openCards.followUpDefinitions}
                    onToggle={() => toggleCard("followUpDefinitions")}
                    iconRef={(el) => {
                      toggleIconRef.current.followUpDefinitions = el;
                    }}
                    onIconEnter={() => animateIcon("followUpDefinitions")}
                    onIconLeave={() => stopIcon("followUpDefinitions")}
                  />

                  {openCards.followUpDefinitions && (
                    <div style={{ marginTop: 10 }}>
                      {followUpMeta.length > 0 ? (
                        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(followUpMeta, null, 2)}
                        </pre>
                      ) : (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Geen ember.followUp configuraties gevonden in de huidige preview.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="card" style={{ padding: 12 }}>
                  <ToggleRow
                    title="Local follow-up preview"
                    meta={
                      openCards.localFollowUpPreview
                        ? null
                        : `definities: ${localFollowUpPreview?.definition_count ?? followUpMeta.length} · resultaten: ${localFollowUpPreview?.item_count ?? 0}`
                    }
                    isOpen={openCards.localFollowUpPreview}
                    onToggle={() => toggleCard("localFollowUpPreview")}
                    iconRef={(el) => {
                      toggleIconRef.current.localFollowUpPreview = el;
                    }}
                    onIconEnter={() => animateIcon("localFollowUpPreview")}
                    onIconLeave={() => stopIcon("localFollowUpPreview")}
                  />

                  {openCards.localFollowUpPreview && (
                    <div style={{ marginTop: 10 }}>
                      {localFollowUpPreview ? (
                        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(localFollowUpPreview, null, 2)}
                        </pre>
                      ) : (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Nog geen local follow-up preview geladen.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="card" style={{ padding: 12 }}>
                  <ToggleRow
                    title="Backend submit preview"
                    meta={openCards.backendSubmitPreview ? null : `${backendSubmitPreview?.count ?? 0}`}
                    isOpen={openCards.backendSubmitPreview}
                    onToggle={() => toggleCard("backendSubmitPreview")}
                    iconRef={(el) => {
                      toggleIconRef.current.backendSubmitPreview = el;
                    }}
                    onIconEnter={() => animateIcon("backendSubmitPreview")}
                    onIconLeave={() => stopIcon("backendSubmitPreview")}
                  />

                  {openCards.backendSubmitPreview && (
                    <div style={{ marginTop: 10 }}>
                      {backendSubmitPreview ? (
                        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(backendSubmitPreview, null, 2)}
                        </pre>
                      ) : (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Nog geen backend submit preview geladen.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

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