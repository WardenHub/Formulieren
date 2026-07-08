import { useEffect, useMemo, useState } from "react";

import {
  getAdminFeedback,
  putAdminFeedbackReply,
  putAdminFeedbackStatus,
} from "../../api/emberApi.js";
import { MessageCircleMoreIcon } from "../../components/ui/message-circle-more.jsx";

const STATUS_OPTIONS = [
  { key: "", label: "Alle statussen" },
  { key: "OPEN", label: "Open" },
  { key: "IN_BEHANDELING", label: "In behandeling" },
  { key: "BEANTWOORD", label: "Beantwoord" },
  { key: "GESLOTEN", label: "Gesloten" },
];

const SENTIMENT_OPTIONS = [
  { key: "", label: "Alle signalen" },
  { key: "positive", label: "Positief" },
  { key: "negative", label: "Negatief" },
];

const STATUS_META = {
  OPEN: { label: "Open", tagClass: "monitor-tag monitor-tag--warning" },
  IN_BEHANDELING: { label: "In behandeling", tagClass: "monitor-tag monitor-tag--active" },
  BEANTWOORD: { label: "Beantwoord", tagClass: "monitor-tag monitor-tag--success" },
  GESLOTEN: { label: "Gesloten", tagClass: "monitor-tag monitor-tag--muted" },
};

function getStatusMeta(status) {
  return STATUS_META[String(status || "").trim().toUpperCase()] || STATUS_META.OPEN;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AdminFeedbackTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({ items: [], summary: {} });
  const [filters, setFilters] = useState({
    status: "",
    sentiment: "",
  });
  const [selectedFeedbackId, setSelectedFeedbackId] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminFeedback(filters);
      setPayload(result || { items: [], summary: {} });
      const nextItems = Array.isArray(result?.items) ? result.items : [];
      setSelectedFeedbackId((prev) =>
        prev && nextItems.some((item) => item.feedback_id === prev)
          ? prev
          : nextItems[0]?.feedback_id || ""
      );
    } catch (err) {
      setError(err?.message || String(err));
      setPayload({ items: [], summary: {} });
      setSelectedFeedbackId("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [filters.status, filters.sentiment]);

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const selectedItem = useMemo(
    () => items.find((item) => item.feedback_id === selectedFeedbackId) || null,
    [items, selectedFeedbackId]
  );

  useEffect(() => {
    setReplyDraft(selectedItem?.active_reply?.reply_markdown || "");
  }, [selectedItem?.feedback_id, selectedItem?.active_reply?.reply_markdown]);

  async function refreshAfterChange(nextFeedbackId = selectedFeedbackId) {
    const result = await getAdminFeedback(filters);
    const nextItems = Array.isArray(result?.items) ? result.items : [];
    setPayload(result || { items: [], summary: {} });
    setSelectedFeedbackId(
      nextFeedbackId && nextItems.some((item) => item.feedback_id === nextFeedbackId)
        ? nextFeedbackId
        : nextItems[0]?.feedback_id || ""
    );
  }

  async function handleStatusChange(nextStatus) {
    if (!selectedItem?.feedback_id) return;
    setSavingStatus(true);
    setError("");
    try {
      await putAdminFeedbackStatus(selectedItem.feedback_id, { status: nextStatus });
      await refreshAfterChange(selectedItem.feedback_id);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleReplySave() {
    if (!selectedItem?.feedback_id) return;
    setSavingReply(true);
    setError("");
    try {
      await putAdminFeedbackReply(selectedItem.feedback_id, { reply_markdown: replyDraft });
      await refreshAfterChange(selectedItem.feedback_id);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSavingReply(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MessageCircleMoreIcon size={22} />
            <div style={{ fontWeight: 900, fontSize: 18 }}>Feedbackbeheer</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="monitor-tag monitor-tag--muted">
              Totaal {Number(payload?.summary?.total_count || 0)}
            </span>
            <span className="monitor-tag monitor-tag--muted">
              Open {Number(payload?.summary?.open_count || 0)}
            </span>
            <span className="monitor-tag monitor-tag--muted">
              Negatief {Number(payload?.summary?.negative_count || 0)}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select
            className="cf-input"
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            style={{ maxWidth: 220 }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.key || "all"} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="cf-input"
            value={filters.sentiment}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, sentiment: event.target.value }))
            }
            style={{ maxWidth: 220 }}
          >
            {SENTIMENT_OPTIONS.map((option) => (
              <option key={option.key || "all"} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(300px, 420px) minmax(0, 1fr)",
        }}
      >
        <div className="card" style={{ padding: 12, display: "grid", gap: 10, alignContent: "start" }}>
          {loading ? (
            <div className="muted">Feedback laden...</div>
          ) : !items.length ? (
            <div className="ui-empty">Geen feedbackitems gevonden.</div>
          ) : (
            items.map((item) => {
              const statusMeta = getStatusMeta(item.status);
              const sentimentLabel = item.sentiment === "negative" ? "Negatief" : "Positief";
              const selected = item.feedback_id === selectedFeedbackId;

              return (
                <button
                  key={item.feedback_id}
                  type="button"
                  className={selected ? "monitor-surface monitor-surface--active" : "monitor-surface monitor-surface--neutral"}
                  style={{
                    padding: 14,
                    display: "grid",
                    gap: 10,
                    textAlign: "left",
                    border: 0,
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedFeedbackId(item.feedback_id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className={item.sentiment === "negative" ? "monitor-tag monitor-tag--warning" : "monitor-tag monitor-tag--success"}>
                        {sentimentLabel}
                      </span>
                      <span className={statusMeta.tagClass}>{statusMeta.label}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {formatDateTime(item.updated_at || item.created_at)}
                    </div>
                  </div>

                  <div style={{ fontWeight: 800 }}>
                    {item.user_display_name_snapshot || item.user_email_snapshot || "Gebruiker"}
                  </div>

                  <div className="muted" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
                    {item.message_markdown || "Geen extra toelichting."}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
          {!selectedItem ? (
            <div className="ui-empty">Selecteer een feedbackitem om details te bekijken.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {selectedItem.user_display_name_snapshot || selectedItem.user_email_snapshot || "Gebruiker"}
                  </div>
                  <div className="muted">
                    {selectedItem.user_email_snapshot || "Geen e-mailadres bekend"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {STATUS_OPTIONS.filter((option) => option.key).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={
                        option.key === selectedItem.status
                          ? `${getStatusMeta(option.key).tagClass} monitor-tag--selected`
                          : "monitor-tag monitor-tag--muted"
                      }
                      disabled={savingStatus}
                      onClick={() => handleStatusChange(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selectedItem.source_path ? (
                  <span className="monitor-tag monitor-tag--muted">{selectedItem.source_path}</span>
                ) : null}
                {selectedItem.installation_code ? (
                  <span className="monitor-tag monitor-tag--muted">
                    Installatie {selectedItem.installation_code}
                  </span>
                ) : null}
                {selectedItem.form_instance_id ? (
                  <span className="monitor-tag monitor-tag--muted">
                    Formulier #{selectedItem.form_instance_id}
                  </span>
                ) : null}
              </div>

              <div
                className="monitor-surface monitor-surface--neutral"
                style={{ padding: 14, whiteSpace: "pre-wrap", lineHeight: 1.6 }}
              >
                {selectedItem.message_markdown || "Geen extra toelichting toegevoegd."}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Adminreactie</div>
                <textarea
                  className="cf-textarea"
                  rows={6}
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  placeholder="Plaats hier een reactie voor de gebruiker"
                />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div className="muted">
                    {selectedItem.active_reply?.updated_at || selectedItem.active_reply?.created_at
                      ? `Laatste reactie ; ${formatDateTime(
                          selectedItem.active_reply.updated_at || selectedItem.active_reply.created_at
                        )}`
                      : "Nog geen reactie geplaatst."}
                  </div>

                  <button
                    type="button"
                    className="btn"
                    disabled={savingReply || !String(replyDraft || "").trim()}
                    onClick={handleReplySave}
                  >
                    {savingReply ? "Opslaan..." : "Reactie opslaan"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
