import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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

export default function FormRunnerDebug() {
  const { code, instanceId } = useParams();
  const navigate = useNavigate();

  const [instance, setInstance] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [answersText, setAnswersText] = useState("{\n  \n}\n");
  const [dirty, setDirty] = useState(false);

  const [saveOk, setSaveOk] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

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

  const status = useMemo(() => String(instance?.status || ""), [instance]);
  const statusLbl = useMemo(() => statusLabel(status), [status]);

  const headerTitle = useMemo(() => {
    const formCode =
      instance?.form_code || instance?.formCode || instance?.form_definition_code || "";
    return formCode ? `Formulier: ${formCode}` : "Formulier";
  }, [instance]);

  // Regels volgens jouw lijst
  const showSave = status === "CONCEPT";
  const showReopen = status !== "CONCEPT" && status !== "AFGEHANDELD";
  const showSubmit = status !== "INGEDIEND" && status !== "AFGEHANDELD";
  const showWithdraw = status !== "INGETROKKEN" && status !== "AFGEHANDELD";

  const canEditAnswers = showSave;

  async function reload({ forceEditor } = {}) {
    setLoading(true);
    setError(null);

    try {
      const res = await getFormInstance(code, instanceId);
      const inst = normalizeInstanceResponse(res);
      setInstance(inst || null);

      const nextDraftRev = inst?.draft_rev ?? inst?.draftRev ?? null;
      const nextAnswers = inst?.answers_json ?? inst?.answersJson ?? null;

      const answersObj =
        typeof nextAnswers === "string"
          ? safeJsonParse(nextAnswers).ok
            ? safeJsonParse(nextAnswers).value
            : null
          : nextAnswers;

      const key = `${String(instanceId)}::${String(nextDraftRev ?? "")}`;
      const alreadyLoaded = lastLoadedKeyRef.current === key;

      if (forceEditor || (!dirty && !alreadyLoaded)) {
        if (answersObj && typeof answersObj === "object") {
          setAnswersText(JSON.stringify(answersObj, null, 2));
        } else {
          setAnswersText("{\n  \n}\n");
        }
        setDirty(false);
        lastLoadedKeyRef.current = key;
      }
    } catch (e) {
      setError(translateApiError(e, status));
      setInstance(null);
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
  }, [code, instanceId]);

  useEffect(() => {
    return () => {
      if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
      if (submitOkTimerRef.current) clearTimeout(submitOkTimerRef.current);
    };
  }, []);

  // Alt+S -> opslaan (alleen als opslaan zichtbaar is)
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
  }, [showSave, busy, dirty, answersText, instance]);

  async function save() {
    if (!showSave) {
      setError(`Opslaan is niet zichtbaar/actief in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    setError(null);

    const parsed = safeJsonParse(answersText);
    if (!parsed.ok) {
      setBusy(false);
      setError(`JSON is ongeldig: ${parsed.error}`);
      return;
    }

    try {
      const expectedDraftRevRaw = instance?.draft_rev ?? instance?.draftRev;
      const expectedDraftRev = Number.isFinite(Number(expectedDraftRevRaw))
        ? Number(expectedDraftRevRaw)
        : 0;

      await putFormAnswers(code, instanceId, {
        answers_json: parsed.value,
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

      if (msg.includes("draft_rev")) {
        setError("Opslaan conflict. Ik heb de nieuwste versie opgehaald. Probeer opnieuw.");
        await reload({ forceEditor: false });
      } else {
        setError(translateApiError(e, status));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);

    try {
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
      setError(translateApiError(e, status));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
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
              {headerTitle} (debug)
            </div>

            <div className="muted" style={{ fontSize: 12 }}>
              installatie: {code} · status: {statusLbl}
              {lastSavedAt ? ` · laatst opgeslagen: ${formatNlDateTime(lastSavedAt)}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
              title="Indienen"
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
              title={dirty ? "Opslaan (Alt+S)" : "Geen wijzigingen om op op te slaan."}
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

      <div className="card" style={{ padding: 12 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Antwoorden (debug JSON)
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
          value={answersText}
          onChange={(e) => {
            setAnswersText(e.target.value);
            setDirty(true);
          }}
          spellCheck={false}
          disabled={!canEditAnswers}
          title={!canEditAnswers ? "Bewerken kan alleen in status: Concept." : undefined}
        />
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Instance (debug)</div>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(instance, null, 2)}
        </pre>
      </div>
    </div>
  );
}
