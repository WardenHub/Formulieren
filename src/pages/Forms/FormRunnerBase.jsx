// src/pages/Forms/FormRunnerBase.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Survey } from "survey-react-ui";
import { Model } from "survey-core";
import "survey-core/survey-core.min.css";
import "../../styles/surveyjs-overrides.css";


import { ChevronLeftIcon } from "@/components/ui/chevron-left";
import { FileCogIcon } from "@/components/ui/file-cog";
import { FileCheckIcon } from "@/components/ui/file-check";
import { FileCheck2Icon } from "@/components/ui/file-check-2";
import { FolderInputIcon } from "@/components/ui/folder-input";
import { FolderXIcon } from "@/components/ui/folder-x";
import { HistoryIcon } from "@/components/ui/history";

import {
  getFormInstance,
  putFormAnswers,
  submitFormInstance,
  withdrawFormInstance,
  reopenFormInstance,
} from "../../api/emberApi.js";

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

function safeJsonParse(text) {
  const s = String(text || "").trim();
  if (!s) return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function safeSurveyParse(surveyJson) {
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

function formatNlDateTime(iso) {
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

const STATUS_LABELS = {
  CONCEPT: "Concept",
  INGEDIEND: "Ingediend",
  IN_BEHANDELING: "In behandeling",
  AFGEHANDELD: "Afgehandeld",
  INGETROKKEN: "Ingetrokken",
};

function statusLabel(status) {
  const s = String(status || "");
  return STATUS_LABELS[s] || s || "(onbekend)";
}

function translateApiError(err, currentStatus) {
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

  if (
    lower.includes("forbidden") ||
    lower.includes("not authorized") ||
    lower.includes("unauthorized")
  ) {
    return "Je hebt geen rechten om deze actie uit te voeren.";
  }

  return raw;
}

function getDraftRev(inst) {
  const v = inst?.draft_rev ?? inst?.draftRev ?? 0;
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function getAnswersObject(inst) {
  const nextAnswers = inst?.answers_json ?? inst?.answersJson ?? null;

  if (typeof nextAnswers === "string") {
    const parsed = safeJsonParse(nextAnswers);
    return parsed.ok ? parsed.value : null;
  }

  if (nextAnswers && typeof nextAnswers === "object") return nextAnswers;
  return null;
}

export default function FormRunnerBase({ mode }) {
  const isDebug = mode === "debug";

  const { code, instanceId } = useParams();
  const navigate = useNavigate();

  const [instance, setInstance] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [dirty, setDirty] = useState(false);

  const [saveOk, setSaveOk] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [debugAnswersText, setDebugAnswersText] = useState("{\n  \n}\n");

  const backIconRef = useRef(null);

  const saveIconRef = useRef(null);
  const saveOkIconRef = useRef(null);

  const submitIconRef = useRef(null);
  const submitOkIconRef = useRef(null);

  const withdrawIconRef = useRef(null);
  const reopenIconRef = useRef(null);

  const saveOkTimerRef = useRef(null);
  const submitOkTimerRef = useRef(null);

  const lastLoadedKeyRef = useRef("");

  const surveyModelRef = useRef(null);
  const suppressDirtyRef = useRef(false);
  const canEditRef = useRef(false);

  const status = useMemo(() => String(instance?.status || ""), [instance]);
  const statusLbl = useMemo(() => statusLabel(status), [status]);

  const headerTitle = useMemo(() => {
    const formCode =
      instance?.form_code || instance?.formCode || instance?.form_definition_code || "";
    return formCode ? `Formulier: ${formCode}` : "Formulier";
  }, [instance]);

  const surveyParsed = useMemo(() => safeSurveyParse(instance?.survey_json), [instance]);
  const surveyTitle = useMemo(() => {
    if (surveyParsed.ok) {
      const t = surveyParsed.value?.title;
      if (t) return String(t);
    }
    return instance?.form_name || "";
  }, [surveyParsed, instance]);

  function allowedActions(s) {
    const st = String(s || "");

    // UX regels:
    // - CONCEPT: opslaan + indienen + intrekken
    // - INGEDIEND: intrekken + terug naar concept
    // - INGETROKKEN: terug naar concept
    // - AFGEHANDELD / IN_BEHANDELING: niets (read-only)
    if (st === "CONCEPT") return { save: true, submit: true, withdraw: true, reopen: false };
    if (st === "INGEDIEND") return { save: false, submit: false, withdraw: true, reopen: true };
    if (st === "INGETROKKEN") return { save: false, submit: false, withdraw: false, reopen: true };

    return { save: false, submit: false, withdraw: false, reopen: false };
  }

  const actions = useMemo(() => allowedActions(status), [status]);

  const showSave = actions.save;
  const showSubmit = actions.submit;
  const showWithdraw = actions.withdraw;
  const showReopen = actions.reopen;

  const canEditAnswers = actions.save; // alleen in CONCEPT

  useEffect(() => {
    canEditRef.current = canEditAnswers;
  }, [canEditAnswers]);

  function createSurveyModel(surveyJsonObj) {
    const m = new Model(surveyJsonObj);

    m.onValueChanged.add(() => {
      if (!canEditRef.current) return;
      if (suppressDirtyRef.current) return;
      setDirty(true);
    });

    m.onMatrixRowAdded.add(() => {
      if (!canEditRef.current) return;
      if (suppressDirtyRef.current) return;
      setDirty(true);
    });

    m.onMatrixRowRemoved.add(() => {
      if (!canEditRef.current) return;
      if (suppressDirtyRef.current) return;
      setDirty(true);
    });

    return m;
  }

  function setSurveyData(model, answersObj) {
    suppressDirtyRef.current = true;
    try {
      model.data = answersObj && typeof answersObj === "object" ? answersObj : {};
    } finally {
      suppressDirtyRef.current = false;
    }
  }

  function getCurrentAnswersObject() {
    if (isDebug) {
      const parsed = safeJsonParse(debugAnswersText);
      if (!parsed.ok) return { ok: false, error: `JSON is ongeldig: ${parsed.error}` };
      return { ok: true, value: parsed.value };
    }

    if (!surveyModelRef.current) {
      return { ok: false, error: "Survey model ontbreekt. (survey_json niet geladen?)" };
    }

    return { ok: true, value: surveyModelRef.current.data || {} };
  }

  async function reload({ forceEditor } = {}) {
    setLoading(true);
    setError(null);

    try {
      const res = await getFormInstance(code, instanceId);
      const inst = normalizeInstanceResponse(res);
      setInstance(inst || null);

      const nextDraftRev = getDraftRev(inst);
      const answersObj = getAnswersObject(inst);

      const key = `${String(instanceId)}::${String(nextDraftRev)}`;
      const alreadyLoaded = lastLoadedKeyRef.current === key;

      if (isDebug) {
        if (forceEditor || (!dirty && !alreadyLoaded)) {
          setDebugAnswersText(JSON.stringify(answersObj || {}, null, 2));
          setDirty(false);
          lastLoadedKeyRef.current = key;
        }
        return;
      }

      const parsedSurvey = safeSurveyParse(inst?.survey_json);
      if (!parsedSurvey.ok) {
        surveyModelRef.current = null;
        return;
      }

      const shouldOverwrite = forceEditor || (!dirty && !alreadyLoaded);

      if (!surveyModelRef.current) {
        const model = createSurveyModel(parsedSurvey.value);
        surveyModelRef.current = model;
        setSurveyData(model, answersObj);

        setDirty(false);
        lastLoadedKeyRef.current = key;
        return;
      }

      if (shouldOverwrite) {
        setSurveyData(surveyModelRef.current, answersObj);
        setDirty(false);
        lastLoadedKeyRef.current = key;
      }
    } catch (e) {
      setError(translateApiError(e, null));
      setInstance(null);
      surveyModelRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!code || !instanceId) return;

      await reload({ forceEditor: true });
      if (cancelled) return;
    }

    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, instanceId, mode]);

  useEffect(() => {
    return () => {
      if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
      if (submitOkTimerRef.current) clearTimeout(submitOkTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      const key = String(e.key || "");
      if (!e.altKey) return;
      if (key !== "s" && key !== "S") return;

      if (!showSave) return;
      if (busy) return;
      if (!dirty) return;

      e.preventDefault();
      save();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSave, busy, dirty, instance, mode]);

  async function save() {
    if (!showSave) {
      setError(`Opslaan is niet zichtbaar/actief in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    setError(null);

    const cur = getCurrentAnswersObject();
    if (!cur.ok) {
      setBusy(false);
      setError(cur.error);
      return;
    }

    try {
      const expectedDraftRev = getDraftRev(instance);

      await putFormAnswers(code, instanceId, {
        answers_json: cur.value,
        expected_draft_rev: expectedDraftRev,
      });

      setLastSavedAt(new Date().toISOString());
      setSaveOk(true);
      setDirty(false);

      saveOkIconRef.current?.startAnimation?.();
      if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
      saveOkTimerRef.current = setTimeout(() => {
        setSaveOk(false);
        saveOkIconRef.current?.stopAnimation?.();
      }, 2000);

      await reload({ forceEditor: false });
    } catch (e) {
      const msg = String(e?.message || e || "").toLowerCase();

      if (msg.includes("draft_rev") || msg.includes("expected_draft_rev")) {
        setError("Opslaan conflict. Ik heb de nieuwste versie opgehaald. Probeer opnieuw.");
        await reload({ forceEditor: true });
      } else {
        setError(translateApiError(e, status));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!showSubmit) {
      setError(`Indienen is niet toegestaan in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // indien nodig: eerst opslaan, zodat je nooit oude antwoorden indient
      if (dirty) {
        const cur = getCurrentAnswersObject();
        if (!cur.ok) {
          setBusy(false);
          setError(cur.error);
          return;
        }

        const expectedDraftRev = getDraftRev(instance);

        await putFormAnswers(code, instanceId, {
          answers_json: cur.value,
          expected_draft_rev: expectedDraftRev,
        });

        setLastSavedAt(new Date().toISOString());
        setDirty(false);

        setSaveOk(true);
        saveOkIconRef.current?.startAnimation?.();
        if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
        saveOkTimerRef.current = setTimeout(() => {
          setSaveOk(false);
          saveOkIconRef.current?.stopAnimation?.();
        }, 1500);

        await reload({ forceEditor: false });
      }

      await submitFormInstance(code, instanceId);

      setSubmitOk(true);
      submitOkIconRef.current?.startAnimation?.();
      if (submitOkTimerRef.current) clearTimeout(submitOkTimerRef.current);
      submitOkTimerRef.current = setTimeout(() => {
        setSubmitOk(false);
        submitOkIconRef.current?.stopAnimation?.();
      }, 5000);

      await reload({ forceEditor: false });
    } catch (e) {
      const msg = String(e?.message || e || "").toLowerCase();

      if (msg.includes("draft_rev") || msg.includes("expected_draft_rev")) {
        setError("Opslaan conflict. Ik heb de nieuwste versie opgehaald. Probeer opnieuw.");
        await reload({ forceEditor: true });
      } else {
        setError(translateApiError(e, status));
      }
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!showWithdraw) {
      setError(`Intrekken is niet toegestaan in status (${statusLbl}).`);
      return;
    }

    const ok = window.confirm("Weet je zeker dat je dit formulier wilt intrekken?");
    if (!ok) return;

    setBusy(true);
    setError(null);

    try {
      await withdrawFormInstance(code, instanceId);
      await reload({ forceEditor: false });
    } catch (e) {
      setError(translateApiError(e, status));
    } finally {
      setBusy(false);
    }
  }

  async function reopenToConcept() {
    if (!showReopen) {
      setError(`Terug naar concept is niet toegestaan in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await reopenFormInstance(code, instanceId);
      await reload({ forceEditor: false });
    } catch (e) {
      setError(translateApiError(e, status));
    } finally {
      setBusy(false);
    }
  }

  const model = !isDebug ? surveyModelRef.current : null;

  if (loading) return <div className="muted">Laden…</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        className="card"
        style={{
          padding: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button
            type="button"
            className="icon-btn"
            title="Terug"
            onClick={() => navigate(-1)}
            onMouseEnter={() => backIconRef.current?.startAnimation?.()}
            onMouseLeave={() => backIconRef.current?.stopAnimation?.()}
          >
            <ChevronLeftIcon ref={backIconRef} size={18} />
          </button>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>
              {headerTitle}
              {isDebug ? " (debug)" : ""}
            </div>

            <div className="muted" style={{ fontSize: 12 }}>
              installatie: {code} · status: {statusLbl}
              {lastSavedAt ? ` · laatst opgeslagen: ${formatNlDateTime(lastSavedAt)}` : ""}
              {dirty ? " · wijzigingen niet opgeslagen" : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!isDebug && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                navigate(
                  `/installaties/${encodeURIComponent(code)}/formulieren/${encodeURIComponent(
                    instanceId
                  )}/debug`
                )
              }
            >
              Debug JSON
            </button>
          )}

          {isDebug && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                navigate(
                  `/installaties/${encodeURIComponent(code)}/formulieren/${encodeURIComponent(
                    instanceId
                  )}`
                )
              }
            >
              Terug naar formulier
            </button>
          )}

          {showReopen && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={reopenToConcept}
              onMouseEnter={() => reopenIconRef.current?.startAnimation?.()}
              onMouseLeave={() => reopenIconRef.current?.stopAnimation?.()}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              title="Terug naar concept"
            >
              <HistoryIcon ref={reopenIconRef} size={18} />
              Concept
            </button>
          )}

          {showWithdraw && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={withdraw}
              onMouseEnter={() => withdrawIconRef.current?.startAnimation?.()}
              onMouseLeave={() => withdrawIconRef.current?.stopAnimation?.()}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              title="Intrekken"
            >
              <FolderXIcon ref={withdrawIconRef} size={18} />
              Intrekken
            </button>
          )}

          {showSubmit && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={submit}
              onMouseEnter={() => {
                if (!submitOk) submitIconRef.current?.startAnimation?.();
              }}
              onMouseLeave={() => {
                if (!submitOk) submitIconRef.current?.stopAnimation?.();
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              title={dirty ? "Indienen (slaat eerst op)" : "Indienen"}
            >
              {submitOk ? (
                <FileCheck2Icon ref={submitOkIconRef} size={18} />
              ) : (
                <FolderInputIcon ref={submitIconRef} size={18} />
              )}
              Indienen
            </button>
          )}

          {showSave && (
            <button
              type="button"
              className="btn"
              disabled={busy || !dirty}
              onClick={save}
              onMouseEnter={() => {
                if (!saveOk) saveIconRef.current?.startAnimation?.();
              }}
              onMouseLeave={() => {
                if (!saveOk) saveIconRef.current?.stopAnimation?.();
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              title={dirty ? "Opslaan (Alt+S)" : "Geen wijzigingen om op te slaan."}
            >
              {saveOk ? (
                <FileCheckIcon ref={saveOkIconRef} size={18} />
              ) : (
                <FileCogIcon ref={saveIconRef} size={18} />
              )}
              Opslaan
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: "salmon" }}>{error}</div>}

      {!isDebug && (
        <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{surveyTitle || "Formulier"}</div>

          {!surveyParsed.ok ? (
            <div className="muted" style={{ fontSize: 13 }}>
              survey_json niet beschikbaar: {surveyParsed.error}
            </div>
          ) : !model ? (
            <div className="muted" style={{ fontSize: 13 }}>
              Survey model kon niet worden opgebouwd.
            </div>
          ) : (
            <div style={{ opacity: canEditAnswers ? 1 : 0.7 }}>
              {!canEditAnswers && (
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  Bewerken kan alleen in status: Concept.
                </div>
              )}

              <Survey model={model} />
            </div>
          )}
        </div>
      )}

      {isDebug && (
        <>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Antwoorden (debug JSON) — bewerken alleen in Concept
            </div>

            <textarea
              className="input"
              style={{
                width: "100%",
                minHeight: 360,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 12,
                opacity: canEditAnswers ? 1 : 0.6,
              }}
              value={debugAnswersText}
              onChange={(e) => {
                setDebugAnswersText(e.target.value);
                if (canEditAnswers) setDirty(true);
              }}
              spellCheck={false}
              disabled={!canEditAnswers}
              title={!canEditAnswers ? "Bewerken kan alleen in status: Concept." : undefined}
            />
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Instance (debug)
            </div>
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(instance, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
