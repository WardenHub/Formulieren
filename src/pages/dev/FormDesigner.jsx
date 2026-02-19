// src/pages/dev/FormDesigner.jsx
import { useEffect, useMemo, useRef, useState } from "react";

import { Survey } from "survey-react-ui";
import { Model } from "survey-core";
import "survey-core/survey-core.min.css";

// Zet dit pas weer aan als surveyjs-overrides.css GEEN globale textarea/input selectors heeft.
// import "@/styles/surveyjs-overrides.css";

import { getFormInstance, getFormPrefill, getFormsCatalog } from "@/api/emberApi.js";

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

/**
 * Extract ember bindings + ember choices from a SurveyJS model.
 * Returns:
 * - binds: [{ name, bind }]
 * - choices: [{ name, choices }]
 */
function collectEmberMeta(model) {
  const binds = [];
  const choices = [];

  if (!model) return { binds, choices };

  const questions = model.getAllQuestions?.() || [];
  for (const q of questions) {
    const ember = q?.jsonObj?.ember;
    if (ember?.bind) {
      binds.push({ name: q.name, bind: ember.bind });
    }
    if (ember?.choices) {
      choices.push({ name: q.name, choices: ember.choices });
    }
  }

  return { binds, choices };
}

/**
 * Build prefill keys list from survey json:
 * - ember.bind kind="prefill" => bind.key
 * - ember.choices => choices.key (catalog key)
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

/**
 * Apply choices to questions based on payload.choices[key] = [{value,text}]
 * We do not require valueField/titleField in survey JSON.
 */
function applyChoices(model, prefillPayload) {
  const payloadChoices = prefillPayload?.choices || prefillPayload?.prefill?.choices || {};
  const { choices } = collectEmberMeta(model);

  for (const item of choices) {
    const cfg = item.choices || {};
    const key = String(cfg.key || "").trim();
    if (!key) continue;

    const raw = payloadChoices[key];
    if (!Array.isArray(raw)) continue;

    const normalized = raw
      .map((x) => {
        if (!x) return null;

        const value = x.value ?? x.key ?? x.code ?? x.option_value ?? x.optionValue ?? null;
        const text = x.text ?? x.label ?? x.name ?? x.display_name ?? x.displayName ?? null;

        if (value === null || value === undefined) return null;
        return { value, text: text != null ? String(text) : String(value) };
      })
      .filter(Boolean);

    const q = model.getQuestionByName?.(item.name);
    if (!q) continue;

    if (String(cfg.mode || "replace") === "replace") {
      q.choices = normalized;
    } else if (String(cfg.mode) === "merge") {
      const existing = Array.isArray(q.choices) ? q.choices : [];
      const map = new Map();
      for (const c of existing) map.set(String(c?.value), c);
      for (const c of normalized) map.set(String(c?.value), c);
      q.choices = Array.from(map.values());
    }
  }
}

/**
 * Compute a bound value for a question:
 * - calculated/today
 * - prefill from payload.values[key]
 */
function resolveBindValue(bind, prefillPayload) {
  const kind = String(bind?.kind || "");
  const key = String(bind?.key || "").trim();

  if (kind === "calculated") {
    if (key === "today") return formatTodayISODate();
    return undefined;
  }

  if (kind === "prefill") {
    // support both shapes:
    // - { values: {...}, choices: {...} }
    // - { prefill: { values: {...}, choices: {...} } }
    return prefillPayload?.values?.[key] ?? prefillPayload?.prefill?.values?.[key];
  }

  return undefined;
}

/**
 * Apply bindings to model.data based on mode.
 * Keeps a per-question "lastApplied" map to support overwrite-if-unchanged.
 */
function applyBindings({ model, prefillPayload, lastAppliedMap, onlyRefreshable }) {
  const nextApplied = { ...(lastAppliedMap || {}) };
  const data = { ...(model.data || {}) };

  const { binds } = collectEmberMeta(model);

  for (const item of binds) {
    const bind = item.bind || {};
    const mode = String(bind.mode || "overwrite-if-empty");
    const refreshable = Boolean(bind.refreshable);

    if (onlyRefreshable && !refreshable) continue;

    const nextVal = resolveBindValue(bind, prefillPayload);
    if (nextVal === undefined) continue;

    const curVal = data[item.name];
    const lastApplied = nextApplied[item.name];

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

export default function FormDesigner() {
  const [editorText, setEditorText] = useState(() => {
    const fromLs = localStorage.getItem("dev.formdesigner.editorText");
    return fromLs || '{\n  "title": "Preview",\n  "pages": []\n}\n';
  });

  const [previewJson, setPreviewJson] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [answersPreview, setAnswersPreview] = useState({});
  const [showPreview, setShowPreview] = useState(true);

  const [showEditor, setShowEditor] = useState(() => {
    const v = localStorage.getItem("dev.formdesigner.showEditor");
    return v === null ? true : v === "true";
  });

  const [leftWidth, setLeftWidth] = useState(() => getLsNumber("dev.formdesigner.leftWidth", 620));
  const [editorHeight, setEditorHeight] = useState(() =>
    getLsNumber("dev.formdesigner.editorHeight", 520)
  );

  const [loadFromBackend, setLoadFromBackend] = useState(false);
  const [backendCode, setBackendCode] = useState("");
  const [backendInstanceId, setBackendInstanceId] = useState("");
  const [backendBusy, setBackendBusy] = useState(false);

  // Prefill (backend)
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

      const surveyObj =
        typeof surveyJsonRaw === "string" ? safeJsonParse(surveyJsonRaw).value : surveyJsonRaw;

      const answersObj =
        typeof answersRaw === "string" ? safeJsonParse(answersRaw).value : answersRaw;

      if (!surveyObj || typeof surveyObj !== "object") {
        setPreviewError("Backend instance heeft geen geldige survey_json.");
        setPreviewJson(null);
        setAnswersPreview({});
        return;
      }

      setPreviewJson(surveyObj);
      setAnswersPreview(answersObj && typeof answersObj === "object" ? answersObj : {});
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

        const min = 360;
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

  const model = useMemo(() => {
    if (!previewJson) return null;

    const m = new Model(previewJson);

    m.onValueChanged.add(() => {
      setAnswersPreview({ ...(m.data || {}) });
    });

    modelRef.current = m;
    return m;
  }, [previewJson]);

  useEffect(() => {
    if (!model) return;
    model.data = answersPreview && typeof answersPreview === "object" ? answersPreview : {};
  }, [model, answersPreview]);

  function applyPrefill({ onlyRefreshable }) {
    if (!modelRef.current) {
      setPreviewError("Geen preview model geladen.");
      return;
    }
    if (!prefillPayload) {
      setPreviewError("Geen prefill payload geladen.");
      return;
    }

    setPreviewError(null);

    applyChoices(modelRef.current, prefillPayload);

    const nextApplied = applyBindings({
      model: modelRef.current,
      prefillPayload,
      lastAppliedMap,
      onlyRefreshable,
    });

    setLastAppliedMap(nextApplied);
    setAnswersPreview({ ...(modelRef.current.data || {}) });
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

      // backend returns: { ok, code, form_code, prefill: { values, choices }, warnings? }
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

      setPrefillPayload(payload);
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

  return (
    <div style={{ display: "grid", gap: 12 }}>
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
          <input
            type="checkbox"
            checked={loadFromBackend}
            onChange={(e) => setLoadFromBackend(e.target.checked)}
          />
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
          disabled={prefillBusy || !prefillPayload || !modelRef.current}
          title="Past alle binds toe volgens mode"
        >
          Apply prefill
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => applyPrefill({ onlyRefreshable: true })}
          disabled={prefillBusy || !prefillPayload || !modelRef.current}
          title="Refresh alleen velden met refreshable: true"
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
              gridTemplateRows: "auto minmax(0, 1fr) auto",
            }}
          >
            <div className="muted" style={{ fontSize: 12 }}>
              survey_json editor (autosave localStorage) — Tab/Shift+Tab werkt
            </div>

            <textarea
              className="input"
              style={{
                width: "100%",
                height: "100%",
                minHeight: Math.round(editorHeight),
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 12,
                lineHeight: 1.4,
                resize: "none",
              }}
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              spellCheck={false}
              disabled={backendBusy}
            />

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
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                preview
              </div>

              {!model ? <div className="muted">Geen preview geladen.</div> : <Survey model={model} />}
            </div>
          )}

          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              answers_json (live)
            </div>

            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(answersPreview || {}, null, 2)}
            </pre>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              lastApplied (voor overwrite-if-unchanged)
            </div>

            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(lastAppliedMap || {}, null, 2)}
            </pre>
          </div>

          {prefillPayload && (
            <div className="card" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                prefill payload (debug)
              </div>

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(prefillPayload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
