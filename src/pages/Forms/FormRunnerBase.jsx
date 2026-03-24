// src/pages/Forms/FormRunnerBase.jsx
// This is a base component for running a form instance, used by both the regular runner and the debug view.
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
import { CheckCheckIcon } from "@/components/ui/check-check";

import {
  getFormInstance,
  putFormAnswers,
  submitFormInstance,
  previewSubmitFormInstance,
  withdrawFormInstance,
  reopenFormInstance,
} from "../../api/emberApi.js";

import {
  normalizeInstanceResponse,
  safeJsonParse,
  safeSurveyParse,
  formatNlDateTime,
  statusLabel,
  translateApiError,
  getDraftRev,
  getAnswersObject,
  buildSubmitConfirmText,
} from "./shared/surveyCore.jsx";

import {
  collectValidationSummary,
  syncAllMatrixQuestionVisualErrors,
} from "./shared/validation.jsx";

import { scrollToQuestionByName } from "./shared/navigation.jsx";

function createRunnerSurveyModel(surveyJsonObj, { onDirtyChange, canEditRef, suppressDirtyRef }) {
  const model = new Model(surveyJsonObj);

  const markDirty = () => {
    if (!canEditRef.current) return;
    if (suppressDirtyRef.current) return;
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

function setSurveyData(model, answersObj, suppressDirtyRef) {
  suppressDirtyRef.current = true;
  try {
    model.data = answersObj && typeof answersObj === "object" ? answersObj : {};
    syncAllMatrixQuestionVisualErrors(model);
  } finally {
    suppressDirtyRef.current = false;
  }
}

export default function FormRunnerBase({ mode }) {
  const isDebug = mode === "debug";

  const { code, instanceId } = useParams();
  const navigate = useNavigate();

  const [instance, setInstance] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [validationSummary, setValidationSummary] = useState([]);

  const [dirty, setDirty] = useState(false);

  const [saveOk, setSaveOk] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  const [validateOk, setValidateOk] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [debugAnswersText, setDebugAnswersText] = useState("{\n  \n}\n");

  const backIconRef = useRef(null);

  const validateIconRef = useRef(null);
  const validateOkIconRef = useRef(null);

  const saveIconRef = useRef(null);
  const saveOkIconRef = useRef(null);

  const submitIconRef = useRef(null);
  const submitOkIconRef = useRef(null);

  const withdrawIconRef = useRef(null);
  const reopenIconRef = useRef(null);

  const validateOkTimerRef = useRef(null);
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

    if (st === "CONCEPT") return { validate: true, save: true, submit: true, withdraw: true, reopen: false };
    if (st === "INGEDIEND") return { validate: false, save: false, submit: false, withdraw: true, reopen: true };
    if (st === "INGETROKKEN") return { validate: false, save: false, submit: false, withdraw: false, reopen: true };

    return { validate: false, save: false, submit: false, withdraw: false, reopen: false };
  }

  const actions = useMemo(() => allowedActions(status), [status]);

  const showValidate = actions.validate;
  const showSave = actions.save;
  const showSubmit = actions.submit;
  const showWithdraw = actions.withdraw;
  const showReopen = actions.reopen;

  const canEditAnswers = actions.save;

  useEffect(() => {
    canEditRef.current = canEditAnswers;
  }, [canEditAnswers]);

  function clearTransientSuccess() {
    setValidateOk(false);
    setSaveOk(false);
    setSubmitOk(false);

    validateOkIconRef.current?.stopAnimation?.();
    saveOkIconRef.current?.stopAnimation?.();
    submitOkIconRef.current?.stopAnimation?.();
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

  function runLocalValidation() {
    if (isDebug) {
      return { ok: true, summary: [] };
    }

    const model = surveyModelRef.current;
    if (!model) {
      if (!surveyParsed.ok) return { ok: true, summary: [] };
      return {
        ok: false,
        error: "Survey model ontbreekt. (survey_json niet geladen?)",
        summary: [],
      };
    }

    try {
      model.validate(true);
      syncAllMatrixQuestionVisualErrors(model);

      const summary = collectValidationSummary(model);
      return {
        ok: summary.length === 0,
        summary,
        error:
          summary.length > 0
            ? "Controleer eerst de gemarkeerde velden."
            : null,
      };
    } catch (e) {
      return {
        ok: false,
        error: `Validatie mislukt: ${String(e?.message || e || "onbekende fout")}`,
        summary: [],
      };
    }
  }

  function applyValidationResult(result, { showSuccess } = {}) {
    const summary = Array.isArray(result?.summary) ? result.summary : [];
    setValidationSummary(summary);

    if (!result?.ok) {
      setError(result?.error || "Controleer eerst de gemarkeerde velden.");
      setValidateOk(false);
      validateOkIconRef.current?.stopAnimation?.();
      return false;
    }

    setError(null);

    if (showSuccess) {
      setValidateOk(true);
      validateOkIconRef.current?.startAnimation?.();

      if (validateOkTimerRef.current) clearTimeout(validateOkTimerRef.current);
      validateOkTimerRef.current = setTimeout(() => {
        setValidateOk(false);
        validateOkIconRef.current?.stopAnimation?.();
      }, 1500);
    }

    return true;
  }

  function openValidationItem(item) {
    if (isDebug) return;

    const model = surveyModelRef.current;
    if (!model || !item) return;

    const targetPage = Array.isArray(model.pages) ? model.pages[item.pageIndex] : null;
    if (targetPage) {
      model.currentPage = targetPage;
    }

    requestAnimationFrame(() => {
      scrollToQuestionByName(item.questionName);
    });
  }

  async function saveCurrentAnswers(curValue) {
    const expectedDraftRev = getDraftRev(instance);

    await putFormAnswers(code, instanceId, {
      answers_json: curValue,
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

  async function reload({ forceEditor } = {}) {
    setLoading(true);
    setError(null);
    setValidationSummary([]);

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
        const model = createRunnerSurveyModel(parsedSurvey.value, {
          onDirtyChange: setDirty,
          canEditRef,
          suppressDirtyRef,
        });

        surveyModelRef.current = model;
        setSurveyData(model, answersObj, suppressDirtyRef);

        setDirty(false);
        lastLoadedKeyRef.current = key;
        return;
      }

      if (shouldOverwrite) {
        setSurveyData(surveyModelRef.current, answersObj, suppressDirtyRef);
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
      if (validateOkTimerRef.current) clearTimeout(validateOkTimerRef.current);
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

  async function validateForm() {
    if (!showValidate) {
      setError(`Controleren is niet toegestaan in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    clearTransientSuccess();
    setError(null);

    try {
      const result = runLocalValidation();
      applyValidationResult(result, { showSuccess: true });
    } finally {
      setBusy(false);
    }
  }

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
      await saveCurrentAnswers(cur.value);
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
    clearTransientSuccess();
    setError(null);
    setValidationSummary([]);

    try {
      const cur = getCurrentAnswersObject();
      if (!cur.ok) {
        setError(cur.error);
        return;
      }

      const validation = runLocalValidation();
      const valid = applyValidationResult(validation, { showSuccess: false });
      if (!valid) return;

      const preview = await previewSubmitFormInstance(code, instanceId, {
        answers_json: cur.value,
      });

      if (preview?.can_submit === false) {
        setError(
          preview?.message ||
            "Indienen is nog niet mogelijk. Controleer het formulier en probeer opnieuw."
        );
        return;
      }

      const confirmed = window.confirm(buildSubmitConfirmText(preview));
      if (!confirmed) return;

      if (dirty) {
        await saveCurrentAnswers(cur.value);
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

          {showValidate && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={validateForm}
              onMouseEnter={() => {
                if (!validateOk) validateIconRef.current?.startAnimation?.();
              }}
              onMouseLeave={() => {
                if (!validateOk) validateIconRef.current?.stopAnimation?.();
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              title="Controleer het formulier zonder op te slaan"
            >
              {validateOk ? (
                <CheckCheckIcon ref={validateOkIconRef} size={18} />
              ) : (
                <CheckCheckIcon ref={validateIconRef} size={18} />
              )}
              Controleer
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
              title={
                dirty
                  ? "Indienen; controleert, toont opvolgingen en slaat eerst op"
                  : "Indienen"
              }
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

      {!isDebug && validationSummary.length > 0 && (
        <div
          className="card"
          style={{
            padding: 12,
            display: "grid",
            gap: 8,
            border: "1px solid rgba(250, 128, 114, 0.35)",
          }}
        >
          <div style={{ fontWeight: 800 }}>
            Controleer eerst de volgende velden
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            Klik op een regel om naar het betreffende onderdeel te gaan.
          </div>

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
                  {" — "}
                  {item.message}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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