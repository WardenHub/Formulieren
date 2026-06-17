// src/pages/Admin/AdminAITab.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { MicIcon } from "@/components/ui/mic";
import { MicOffIcon } from "@/components/ui/mic-off";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { BrainIcon } from "@/components/ui/brain";
import {
  getAdminAssistantAudit,
  getUserDirectory,
  transcribeFormAssistantAudio,
} from "../../api/emberApi.js";
import { useAssistantAudioRecorder } from "../Forms/shared/assistantAudio.jsx";
import { buildDirectoryActorLookup, resolveActorDisplayName } from "../../lib/avatar.js";

function getErrorMessage(error, fallback = "Onbekende fout") {
  return String(error?.message || error || fallback);
}

function formatDateTime(value) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("nl-NL", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function compactText(value, max = 180) {
  const txt = String(value || "").trim();
  if (!txt) return "-";
  if (txt.length <= max) return txt;
  return `${txt.slice(0, max - 1)}…`;
}

function badgeTone(value) {
  const v = String(value || "").toUpperCase();

  if (["APPLIED", "OPEN", "TRANSCRIBE"].includes(v)) return "success";
  if (["PROPOSED", "LOCAL_COMMAND", "AI_INTERPRET"].includes(v)) return "warning";
  if (["REJECTED", "FAILED", "ERROR"].includes(v)) return "danger";

  return "neutral";
}

function AdminPanel({ title, subtitle, actions, children }) {
  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        <div className="admin-toolbar-title">
          <div className="admin-panel-title">{title}</div>
          {subtitle ? <div className="admin-panel-subtitle">{subtitle}</div> : null}
        </div>

        {actions ? <div className="admin-toolbar-actions">{actions}</div> : null}
      </div>

      {children}
    </div>
  );
}

function StatusBadge({ value }) {
  const tone = badgeTone(value);

  return (
    <span className={`admin-status-badge ${tone}`}>
      {value || "-"}
    </span>
  );
}

function AuditCard({ item, actorLookup }) {
  const transcript = item?.normalized_text || item?.transcript_text || item?.raw_input_text || "";
  const target = item?.target_label || item?.target_path || item?.question_name || "";
  const actorDisplayName = resolveActorDisplayName(
    item?.turn_created_by || item?.started_by,
    actorLookup,
    "-"
  );

  return (
    <div className="admin-subcard" style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900 }}>
            Formulier #{item?.formuliernummer || item?.form_instance_id || "-"} ;{" "}
            {item?.form_name || item?.form_code || "Onbekend formulier"}
          </div>
          <div className="admin-panel-subtitle">
            Installatie {item?.atrium_installation_code || "-"} ; sessie{" "}
            {item?.assistant_session_id || "-"} ; turn {item?.assistant_turn_id || "-"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <StatusBadge value={item?.turn_kind} />
          {item?.patch_status ? <StatusBadge value={item.patch_status} /> : null}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <div>
          <div className="admin-panel-subtitle">Tijd</div>
          <div>{formatDateTime(item?.turn_created_at || item?.started_at)}</div>
        </div>

        <div>
          <div className="admin-panel-subtitle">Gebruiker</div>
          <div>{actorDisplayName}</div>
        </div>

        <div>
          <div className="admin-panel-subtitle">Provider</div>
          <div>
            {item?.provider || "-"}
            {item?.provider_model ? ` ; ${item.provider_model}` : ""}
          </div>
        </div>

        <div>
          <div className="admin-panel-subtitle">Latency</div>
          <div>{item?.latency_ms == null ? "-" : `${item.latency_ms} ms`}</div>
        </div>
      </div>

      <div>
        <div className="admin-panel-subtitle">Transcript</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{compactText(transcript, 260)}</div>
      </div>

      {target ? (
        <div>
          <div className="admin-panel-subtitle">Patch target</div>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {compactText(target, 220)}
            {item?.patch_op ? ` ; ${item.patch_op}` : ""}
          </div>
        </div>
      ) : null}

      {item?.audio_storage_key ? (
        <div>
          <div className="admin-panel-subtitle">Audio blob</div>
          <code style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {item.audio_storage_provider || "blob"} ; {item.audio_storage_key}
          </code>
        </div>
      ) : null}

      {item?.turn_error_message || item?.patch_error_message ? (
        <div className="ember-error-text">
          {item.turn_error_message || item.patch_error_message}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminAITab() {
  const recorder = useAssistantAudioRecorder({ maxDurationMs: 20000 });

  const micIconRef = useRef(null);
  const micOffIconRef = useRef(null);
  const refreshIconRef = useRef(null);

  const [code, setCode] = useState("");
  const [formInstanceId, setFormInstanceId] = useState("");
  const [lastTranscript, setLastTranscript] = useState(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState("");

  const [q, setQ] = useState("");
  const [take, setTake] = useState(100);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditItems, setAuditItems] = useState([]);
  const [directoryItems, setDirectoryItems] = useState([]);
  const actorLookup = useMemo(() => buildDirectoryActorLookup(directoryItems), [directoryItems]);

  const canRunTest = useMemo(() => {
    return (
      !testBusy &&
      !recorder.busy &&
      !recorder.recording &&
      String(code || "").trim() &&
      String(formInstanceId || "").trim()
    );
  }, [testBusy, recorder.busy, recorder.recording, code, formInstanceId]);

  async function refreshAudit() {
    setAuditLoading(true);
    setAuditError("");

    try {
      const res = await getAdminAssistantAudit({
        q,
        take,
      });

      setAuditItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setAuditError(`Audit laden mislukt; ${getErrorMessage(e)}`);
      setAuditItems([]);
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    refreshAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    getUserDirectory()
      .then((res) => {
        if (cancelled) return;
        setDirectoryItems(Array.isArray(res?.items) ? res.items : []);
      })
      .catch(() => {
        if (cancelled) return;
        setDirectoryItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  async function startRecording() {
    setTestError("");
    setLastTranscript(null);

    try {
      await recorder.start();
    } catch (e) {
      setTestError(getErrorMessage(e, "Opname starten mislukt"));
    }
  }

  async function stopAndTranscribe() {
    setTestError("");
    setTestBusy(true);

    try {
      const clip = await recorder.stop();

      if (!clip?.file) {
        setTestError("Geen audio opgenomen.");
        return;
      }

      const result = await transcribeFormAssistantAudio(code, formInstanceId, clip.file, {
        duration_ms: clip.durationMs,
        entry_point: "admin_ai_test",
        active_page_name: null,
        active_question_name: null,
        active_section_key: null,
        client_context_json: {
          source: "AdminAITab",
          sample_rate: clip.sampleRate,
          file_size: clip.size,
        },
      });

      setLastTranscript(result || null);

      if (result?.assistant_session_id) {
        setQ(String(result.assistant_session_id));
      }

      await refreshAudit();
    } catch (e) {
      setTestError(getErrorMessage(e, "Transcriptie mislukt"));
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AdminPanel
        title="AI assistent"
        subtitle="Transcriptie- en patch-audit voor formulierassistentie. Deze tab is alleen voor beheer en POC-validatie."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            disabled={auditLoading}
            onClick={refreshAudit}
            onMouseEnter={() => refreshIconRef.current?.startAnimation?.()}
            onMouseLeave={() => refreshIconRef.current?.stopAnimation?.()}
          >
            <RefreshCWIcon ref={refreshIconRef} size={16} />
            {auditLoading ? "Vernieuwen..." : "Vernieuwen"}
          </button>
        }
      >
        <div className="admin-form-grid">
          <div className="admin-subcard" style={{ display: "grid", gap: 12 }}>
            <div>
              <div className="admin-subcard-title">Transcriptie smoke test</div>
              <div className="admin-panel-subtitle">
                Neem een korte WAV-opname op en stuur deze naar Azure Speech via de Ember API.
              </div>
            </div>

            {!recorder.supported ? (
              <div className="ember-error-text">
                Deze browser ondersteunt microfoonopname via Web Audio niet.
              </div>
            ) : null}

            <label className="admin-field">
              <span>Installatiecode</span>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Bijvoorbeeld installatiecode"
                spellCheck={false}
              />
            </label>

            <label className="admin-field">
              <span>Formuliernummer</span>
              <input
                className="input"
                value={formInstanceId}
                onChange={(e) => setFormInstanceId(e.target.value)}
                placeholder="Bijvoorbeeld 123"
                inputMode="numeric"
                spellCheck={false}
              />
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {!recorder.recording ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canRunTest || !recorder.supported}
                  onClick={startRecording}
                  onMouseEnter={() => micIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => micIconRef.current?.stopAnimation?.()}
                  title="Start korte opname"
                >
                  <MicIcon ref={micIconRef} size={18} />
                  Start opname
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={testBusy}
                  onClick={stopAndTranscribe}
                  onMouseEnter={() => micOffIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => {
                    if (!recorder.recording) micOffIconRef.current?.stopAnimation?.();
                  }}
                  title="Stop opname en transcribeer"
                >
                  <MicOffIcon ref={micOffIconRef} size={18} />
                  Stop en transcribeer
                </button>
              )}

              {recorder.recording ? (
                <span className="admin-status-badge warning">Opname actief</span>
              ) : null}

              {testBusy || recorder.busy ? (
                <span className="admin-status-badge warning">Verwerken</span>
              ) : null}
            </div>

            {testError || recorder.lastError ? (
              <div className="ember-error-text">{testError || recorder.lastError}</div>
            ) : null}

            {lastTranscript ? (
              <div className="admin-subcard" style={{ display: "grid", gap: 8 }}>
                <div className="admin-subcard-title">Laatste transcript</div>

                <div>
                  <div className="admin-panel-subtitle">Transcript</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {lastTranscript.transcript_text || "-"}
                  </div>
                </div>

                <div>
                  <div className="admin-panel-subtitle">Genormaliseerd</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {lastTranscript.normalized_text || "-"}
                  </div>
                </div>

                <div className="admin-panel-subtitle">
                  Sessie {lastTranscript.assistant_session_id || "-"} ; turn{" "}
                  {lastTranscript.assistant_turn_id || "-"} ; audio{" "}
                  {lastTranscript.assistant_audio_id || "-"}
                </div>
              </div>
            ) : null}
          </div>

          <div className="admin-subcard" style={{ display: "grid", gap: 12 }}>
            <div>
              <div className="admin-subcard-title">Audit filter</div>
              <div className="admin-panel-subtitle">
                Zoek op formuliernummer, installatiecode, transcript, sessie of target.
              </div>
            </div>

            <label className="admin-field">
              <span>Zoeken</span>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Zoekterm"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter") refreshAudit();
                }}
              />
            </label>

            <label className="admin-field">
              <span>Aantal regels</span>
              <input
                className="input"
                value={take}
                onChange={(e) => setTake(e.target.value)}
                inputMode="numeric"
              />
            </label>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={auditLoading}
              onClick={refreshAudit}
            >
              Filter toepassen
            </button>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Auditregels"
        subtitle={`${auditItems.length} regel(s) geladen`}
      >
        {auditError ? <div className="ember-error-text">{auditError}</div> : null}

        {auditLoading ? (
          <div className="muted">Audit wordt geladen...</div>
        ) : auditItems.length === 0 ? (
          <div className="muted">Nog geen auditregels gevonden.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {auditItems.map((item, index) => (
              <AuditCard
                key={`${item.assistant_session_id || "s"}-${item.assistant_turn_id || "t"}-${item.assistant_patch_id || "p"}-${index}`}
                item={item}
                actorLookup={actorLookup}
              />
            ))}
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
