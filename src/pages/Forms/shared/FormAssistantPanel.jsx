// src/pages/Forms/shared/FormAssistantPanel.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { MicIcon } from "@/components/ui/mic";
import { MicOffIcon } from "@/components/ui/mic-off";
import { BrainIcon } from "@/components/ui/brain";
import { CheckIcon } from "@/components/ui/check";
import { FrownIcon } from "@/components/ui/frown";
import {
  applyFormAssistantPatches,
  interpretFormAssistantText,
  rejectFormAssistantPatches,
  transcribeFormAssistantAudio,
} from "../../../api/emberApi.js";
import { useAssistantAudioRecorder } from "./assistantAudio.jsx";
import {
  applyAssistantPatchesToSurvey,
  buildAssistantFieldMapFromSurvey,
  summarizeAssistantPatch,
} from "./assistantFieldMap.jsx";

function getErrorMessage(error, fallback = "Onbekende fout") {
  return String(error?.message || error || fallback);
}

function getPatchIds(patches) {
  return (Array.isArray(patches) ? patches : [])
    .map((patch) => patch?.assistant_patch_id)
    .filter((id) => id != null);
}

function formatValue(value) {
  if (value == null || value === "") return "leeg";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function minPatchConfidence(patches) {
  const values = (Array.isArray(patches) ? patches : [])
    .map((patch) => Number(patch?.confidence))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return null;
  return Math.min(...values);
}

function AssistantStep({ active, done, label, meta }) {
  return (
    <div
      className={[
        "form-assistant-step",
        active ? "is-active" : "",
        done ? "is-done" : "",
      ].filter(Boolean).join(" ")}
    >
      <span className="form-assistant-step-dot" />
      <span className="form-assistant-step-label">{label}</span>
      {meta ? <span className="form-assistant-step-meta">{meta}</span> : null}
    </div>
  );
}

export default function FormAssistantPanel({
  code,
  instanceId,
  surveyModel,
  canEdit,
  draftRev,
  activePageName,
  onApplied,
  onClose,
}) {
  const recorder = useAssistantAudioRecorder({ maxDurationMs: 20000 });

  const micIconRef = useRef(null);
  const micOffIconRef = useRef(null);
  const brainIconRef = useRef(null);
  const checkIconRef = useRef(null);
  const rejectIconRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [assistantSessionId, setAssistantSessionId] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [normalized, setNormalized] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [patches, setPatches] = useState([]);
  const [applied, setApplied] = useState(false);
  const [autoApply, setAutoApply] = useState(true);

  const summaries = useMemo(() => {
    return patches.map(summarizeAssistantPatch);
  }, [patches]);

  const minConfidence = useMemo(() => minPatchConfidence(patches), [patches]);

  const canAutoApply = useMemo(() => {
    if (!autoApply) return false;
    if (!canEdit) return false;
    if (!patches.length) return false;
    if (applied) return false;

    if (minConfidence == null) return true;
    return minConfidence >= 0.9;
  }, [autoApply, canEdit, patches, applied, minConfidence]);

  useEffect(() => {
    if (!recorder.recording) {
      micOffIconRef.current?.stopAnimation?.();
      return;
    }

    micOffIconRef.current?.startAnimation?.();

    return () => {
      micOffIconRef.current?.stopAnimation?.();
    };
  }, [recorder.recording]);

  async function interpretText(text, sessionId) {
    const fieldMap = buildAssistantFieldMapFromSurvey(surveyModel);

    setPhase("analyzing");

    const res = await interpretFormAssistantText(code, instanceId, {
      assistant_session_id: sessionId || assistantSessionId,
      transcript_text: text,
      field_map: fieldMap,
      entry_point: "form_runner",
      active_page_name: activePageName || surveyModel?.currentPage?.name || null,
      active_question_name: null,
      active_section_key: null,
      client_context: {
        source: "FormAssistantPanel",
        field_map_count: fieldMap.length,
        auto_apply: autoApply,
      },
    });

    const nextPatches = Array.isArray(res?.patches) ? res.patches : [];

    setAssistantSessionId(res?.assistant_session_id || sessionId || assistantSessionId || null);
    setAssistantMessage(res?.assistant_message || "");
    setPatches(nextPatches);
    setApplied(false);

    return {
      ...res,
      patches: nextPatches,
    };
  }

  async function applyPatches(nextPatches = patches) {
    if (!surveyModel) {
      setError("Survey model ontbreekt.");
      return null;
    }

    if (!nextPatches.length) {
      setError("Er zijn geen voorstellen om toe te passen.");
      return null;
    }

    setPhase("applying");

    const result = applyAssistantPatchesToSurvey(surveyModel, nextPatches);
    const patchIds = getPatchIds(nextPatches);

    if (patchIds.length) {
      await applyFormAssistantPatches(code, instanceId, {
        patch_ids: patchIds,
        applied_draft_rev: draftRev ?? null,
      });
    }

    setApplied(true);
    setPhase("done");
    checkIconRef.current?.startAnimation?.();

    onApplied?.({
      changed: result.changed,
      changedCount: result.changedCount,
      patches: nextPatches,
      result,
    });

    return result;
  }

  async function startRecording() {
    if (!canEdit) {
      setError("De assistent kan alleen wijzigingen toepassen in Concept.");
      return;
    }

    setError("");
    setPhase("recording");
    setTranscript("");
    setNormalized("");
    setAssistantMessage("");
    setPatches([]);
    setApplied(false);

    try {
      await recorder.start();
    } catch (e) {
      setPhase("idle");
      setError(getErrorMessage(e, "Opname starten mislukt."));
    }
  }

  async function stopAndProcess() {
    setBusy(true);
    setError("");

    try {
      const clip = await recorder.stop();

      if (!clip?.file) {
        setPhase("idle");
        setError("Geen audio opgenomen.");
        return;
      }

      setPhase("transcribing");

      const transcribe = await transcribeFormAssistantAudio(code, instanceId, clip.file, {
        assistant_session_id: assistantSessionId || undefined,
        duration_ms: clip.durationMs,
        entry_point: "form_runner",
        active_page_name: activePageName || surveyModel?.currentPage?.name || null,
        active_question_name: null,
        active_section_key: null,
        client_context_json: {
          source: "FormAssistantPanel",
          sample_rate: clip.sampleRate,
          file_size: clip.size,
        },
      });

      const text = transcribe?.normalized_text || transcribe?.transcript_text || "";
      setAssistantSessionId(transcribe?.assistant_session_id || null);
      setTranscript(transcribe?.transcript_text || "");
      setNormalized(transcribe?.normalized_text || "");

      if (!text) {
        setPhase("idle");
        setAssistantMessage("Ik heb geen tekst herkend.");
        return;
      }

      const interpreted = await interpretText(text, transcribe?.assistant_session_id || null);
      const nextPatches = interpreted?.patches || [];

      if (nextPatches.length && autoApply) {
        const confidence = minPatchConfidence(nextPatches);
        if (confidence == null || confidence >= 0.9) {
          await applyPatches(nextPatches);
          return;
        }

        setPhase("proposal");
        setAssistantMessage(
          interpreted?.assistant_message ||
            "Ik heb voorstellen gevonden, maar de zekerheid is te laag voor automatisch toepassen."
        );
        return;
      }

      setPhase(nextPatches.length ? "proposal" : "idle");
    } catch (e) {
      setPhase("idle");
      setError(getErrorMessage(e, "Assistent verwerking mislukt."));
    } finally {
      setBusy(false);
    }
  }

  async function reInterpret() {
    const text = normalized || transcript;

    if (!text) {
      setError("Er is nog geen transcript om te interpreteren.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const interpreted = await interpretText(text, assistantSessionId);
      setPhase(interpreted?.patches?.length ? "proposal" : "idle");
    } catch (e) {
      setPhase("idle");
      setError(getErrorMessage(e, "Interpretatie mislukt."));
    } finally {
      setBusy(false);
    }
  }

  async function applyCurrentPatches() {
    setBusy(true);
    setError("");

    try {
      await applyPatches(patches);
    } catch (e) {
      setPhase("proposal");
      setError(getErrorMessage(e, "Voorstellen toepassen mislukt."));
    } finally {
      setBusy(false);
    }
  }

  async function rejectPatches() {
    if (!patches.length) return;

    setBusy(true);
    setError("");

    try {
      const patchIds = getPatchIds(patches);

      if (patchIds.length) {
        await rejectFormAssistantPatches(code, instanceId, {
          patch_ids: patchIds,
          reason: "Afgewezen door gebruiker in FormRunner.",
        });
      }

      setPatches([]);
      setPhase("idle");
      setAssistantMessage("Voorstellen afgewezen.");
      rejectIconRef.current?.startAnimation?.();
    } catch (e) {
      setError(getErrorMessage(e, "Voorstellen afwijzen mislukt."));
    } finally {
      setBusy(false);
    }
  }

  const statusText = (() => {
    if (recorder.recording) return "Luistert...";
    if (phase === "transcribing") return "Transcriptie...";
    if (phase === "analyzing") return "Analyse...";
    if (phase === "applying") return "Toepassen...";
    if (phase === "done") return "Toegepast";
    if (patches.length) return "Voorstel klaar";
    return "Klaar voor opdracht";
  })();

  return (
    <div className="form-assistant-panel">
      <div className="form-assistant-panel-head">
        <div>
          <div className="form-assistant-title">Ember assistent</div>
          <div className="form-assistant-subtitle">
            Spreek een korte opdracht in. Ember transcribeert, analyseert en past veilige voorstellen direct toe.
          </div>
        </div>

        {onClose ? (
          <button
            type="button"
            className="icon-btn"
            title="Assistent sluiten"
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="form-assistant-status-row">
        <span className="form-assistant-status-pill">{statusText}</span>

        <label className="form-assistant-toggle">
          <input
            type="checkbox"
            checked={autoApply}
            disabled={busy || recorder.recording}
            onChange={(e) => setAutoApply(e.target.checked)}
          />
          <span>Direct toepassen</span>
        </label>
      </div>

      <div className="form-assistant-steps">
        <AssistantStep
          label="Transcriptie"
          active={phase === "transcribing" || recorder.recording}
          done={Boolean(transcript)}
        />
        <AssistantStep
          label="Analyse"
          active={phase === "analyzing"}
          done={Boolean(assistantMessage || patches.length)}
        />
        <AssistantStep
          label="Toepassen"
          active={phase === "applying"}
          done={applied}
          meta={applied ? `${patches.length} wijziging(en)` : null}
        />
      </div>

      <div className="form-assistant-actions">
        {!recorder.recording ? (
          <button
            type="button"
            className="btn btn-primary form-assistant-main-btn"
            disabled={!canEdit || busy || recorder.busy || !recorder.supported}
            onClick={startRecording}
            onMouseEnter={() => micIconRef.current?.startAnimation?.()}
            onMouseLeave={() => micIconRef.current?.stopAnimation?.()}
            title="Start opname"
          >
            <MicIcon ref={micIconRef} size={18} />
            Spreek opdracht in
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-danger form-assistant-main-btn"
            disabled={busy}
            onClick={stopAndProcess}
            onMouseEnter={() => micOffIconRef.current?.startAnimation?.()}
            onMouseLeave={() => {
              if (!recorder.recording) micOffIconRef.current?.stopAnimation?.();
            }}
            title="Stop opname, analyseer en pas toe"
          >
            <MicOffIcon ref={micOffIconRef} size={18} />
            Stop en verwerk
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canEdit || busy || !(normalized || transcript)}
          onClick={reInterpret}
          onMouseEnter={() => brainIconRef.current?.startAnimation?.()}
          onMouseLeave={() => brainIconRef.current?.stopAnimation?.()}
          title="Transcript opnieuw analyseren"
        >
          <BrainIcon ref={brainIconRef} size={18} />
          Analyseer opnieuw
        </button>
      </div>

      {!canEdit ? (
        <div className="form-assistant-muted">
          De assistent kan alleen wijzigingen toepassen wanneer het formulier in Concept staat.
        </div>
      ) : null}

      {error || recorder.lastError ? (
        <div className="form-assistant-error">
          {error || recorder.lastError}
        </div>
      ) : null}

      {transcript ? (
        <div className="form-assistant-box">
          <div className="form-assistant-box-label">Transcript</div>
          <div className="form-assistant-transcript">
            {normalized || transcript}
          </div>
        </div>
      ) : null}

      {assistantMessage ? (
        <div className="form-assistant-muted">
          {assistantMessage}
        </div>
      ) : null}

      {summaries.length ? (
        <div className="form-assistant-proposals">
          <div className="form-assistant-proposals-head">
            <strong>Voorstellen</strong>
            <span>{summaries.length}</span>
            {minConfidence != null ? <span>zekerheid {Math.round(minConfidence * 100)}%</span> : null}
          </div>

          <div className="form-assistant-proposal-list">
            {summaries.map((item, idx) => (
              <div
                key={`${item.id || "patch"}-${idx}`}
                className="form-assistant-proposal"
              >
                <div className="form-assistant-proposal-title">{item.label}</div>
                <div className="form-assistant-proposal-meta">
                  {item.op} ; {formatValue(item.oldValue)} → {formatValue(item.newValue)}
                </div>
                {item.reason ? (
                  <div className="form-assistant-proposal-reason">{item.reason}</div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="form-assistant-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || applied}
              onClick={applyCurrentPatches}
              onMouseEnter={() => checkIconRef.current?.startAnimation?.()}
              onMouseLeave={() => checkIconRef.current?.stopAnimation?.()}
            >
              <CheckIcon ref={checkIconRef} size={18} />
              {applied ? "Toegepast" : "Toepassen"}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || applied}
              onClick={rejectPatches}
              onMouseEnter={() => rejectIconRef.current?.startAnimation?.()}
              onMouseLeave={() => rejectIconRef.current?.stopAnimation?.()}
            >
              <FrownIcon ref={rejectIconRef} size={18} />
              Afwijzen
            </button>
          </div>
        </div>
      ) : null}

      {autoApply && phase === "done" ? (
        <div className="form-assistant-success">
          Wijzigingen zijn toegepast. Vergeet niet het formulier op te slaan.
        </div>
      ) : null}

      {!recorder.supported ? (
        <div className="form-assistant-error">
          Deze browser ondersteunt microfoonopname niet.
        </div>
      ) : null}
    </div>
  );
}