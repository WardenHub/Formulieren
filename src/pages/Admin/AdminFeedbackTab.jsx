import { useEffect, useMemo, useState } from "react";

import {
  deleteAdminFeedback,
  getAdminFeedback,
  markAdminFeedbackRead,
  putAdminFeedbackReply,
  putAdminFeedbackStatus,
} from "../../api/emberApi.js";
import { Trash2 } from "lucide-react";
import { MessageCircleMoreIcon } from "../../components/ui/message-circle-more.jsx";
import { getSentimentMeta, SENTIMENT_OPTIONS as FEEDBACK_SENTIMENT_OPTIONS } from "../Feedback/feedbackShared.js";

const STATUS_OPTIONS = [
  { key: "", label: "Alle statussen" },
  { key: "OPEN", label: "Open" },
  { key: "IN_BEHANDELING", label: "In behandeling" },
  { key: "BEANTWOORD", label: "Beantwoord" },
  { key: "GESLOTEN", label: "Gesloten" },
];

const SENTIMENT_OPTIONS = [
  { key: "", label: "Alle signalen" },
  ...FEEDBACK_SENTIMENT_OPTIONS.map((option) => ({
    key: option.key,
    label: option.label,
  })),
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
    form: "",
    topic: "",
    user: "",
  });
  const [selectedFeedbackId, setSelectedFeedbackId] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [deletingFeedback, setDeletingFeedback] = useState(false);
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
  const visibleItems = useMemo(() => items.filter((item) => {
    const formNeedle = String(filters.form || "").trim().toLowerCase();
    const topicNeedle = String(filters.topic || "").trim().toLowerCase();
    const userNeedle = String(filters.user || "").trim().toLowerCase();
    if (formNeedle && !String(item.form_instance_id || item.source_path || "").toLowerCase().includes(formNeedle)) return false;
    if (topicNeedle && !`${item.source_path || ""} ${item.message_markdown || ""}`.toLowerCase().includes(topicNeedle)) return false;
    if (userNeedle && !`${item.user_display_name_snapshot || ""} ${item.user_email_snapshot || ""}`.toLowerCase().includes(userNeedle)) return false;
    return true;
  }), [filters.form, filters.topic, filters.user, items]);
  const groupedItems = useMemo(() => {
    const groups = new Map();
    for (const item of visibleItems) {
      const key = item.form_instance_id ? `Formulier #${item.form_instance_id}` : item.source_path || "Algemene feedback";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return Array.from(groups, ([label, groupItems]) => ({ label, items: groupItems }));
  }, [visibleItems]);
  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.feedback_id === selectedFeedbackId) || visibleItems[0] || null,
    [visibleItems, selectedFeedbackId]
  );

  useEffect(() => {
    setReplyDraft(selectedItem?.active_reply?.reply_markdown || "");
  }, [selectedItem?.feedback_id, selectedItem?.active_reply?.reply_markdown]);

  useEffect(() => {
    if (!selectedItem?.feedback_id || selectedItem.status !== "OPEN") return undefined;

    let cancelled = false;
    async function markRead() {
      try {
        await markAdminFeedbackRead(selectedItem.feedback_id);
        if (!cancelled) await refreshAfterChange(selectedItem.feedback_id);
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    }

    void markRead();
    return () => {
      cancelled = true;
    };
  }, [selectedItem?.feedback_id, selectedItem?.status]);

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

  async function handleDeleteFeedback() {
    if (!selectedItem?.feedback_id) return;
    if (!window.confirm("Weet je zeker dat je deze feedback wilt verwijderen?")) return;

    setDeletingFeedback(true);
    setError("");
    try {
      await deleteAdminFeedback(selectedItem.feedback_id);
      await refreshAfterChange("");
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setDeletingFeedback(false);
    }
  }

  useEffect(() => {
    function handleAltS(event) {
      if (!event.altKey || String(event.key || "").toLowerCase() !== "s") return;
      if (!selectedItem?.feedback_id || savingReply || !String(replyDraft || "").trim()) return;
      event.preventDefault();
      void handleReplySave();
    }

    window.addEventListener("keydown", handleAltS);
    return () => window.removeEventListener("keydown", handleAltS);
  }, [selectedItem?.feedback_id, replyDraft, savingReply]);

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
              Voorstel {Number(payload?.summary?.proposal_count || 0)}
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
          <input className="cf-input" value={filters.form} onChange={(event) => setFilters((prev) => ({ ...prev, form: event.target.value }))} placeholder="Formulier" style={{ maxWidth: 220 }} />
          <input className="cf-input" value={filters.topic} onChange={(event) => setFilters((prev) => ({ ...prev, topic: event.target.value }))} placeholder="Norm, vraag of onderwerp" style={{ maxWidth: 240 }} />
          <input className="cf-input" value={filters.user} onChange={(event) => setFilters((prev) => ({ ...prev, user: event.target.value }))} placeholder="Gebruiker" style={{ maxWidth: 220 }} />

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
          ) : !visibleItems.length ? (
            <div className="ui-empty">Geen feedbackitems gevonden.</div>
          ) : (
            groupedItems.map((group) => (
              <section key={group.label} className="feedback-group">
                <div className="feedback-group__head"><strong>{group.label}</strong><span className="monitor-tag monitor-tag--muted">{group.items.length}</span></div>
                {group.items.map((item) => {
              const statusMeta = getStatusMeta(item.status);
              const sentimentMeta = getSentimentMeta(item.sentiment);
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
                      <span className={sentimentMeta.tagClass}>
                        {sentimentMeta.label}
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
                })}
              </section>
            ))
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
                <span className={getSentimentMeta(selectedItem.sentiment).tagClass}>
                  {getSentimentMeta(selectedItem.sentiment).label}
                </span>
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800 }}>Adminreactie</div>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={deletingFeedback}
                    onClick={handleDeleteFeedback}
                    title="Feedback verwijderen"
                  >
                    <Trash2 size={16} /> Verwijderen
                  </button>
                </div>
                <textarea
                  className="cf-textarea"
                  rows={6}
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.altKey && String(event.key || "").toLowerCase() === "s") {
                      event.preventDefault();
                      void handleReplySave();
                    }
                  }}
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
                    {savingReply ? "Opslaan..." : "Reactie opslaan (Alt+S)"}
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
