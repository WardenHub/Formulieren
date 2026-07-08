import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { createMyFeedback, getMyFeedback } from "../../api/emberApi.js";
import ApiStartupLoader, { useApiStartupLoader } from "../../components/ApiStartupLoader.jsx";
import { MessageCircleMoreIcon } from "../../components/ui/message-circle-more.jsx";

const SENTIMENT_OPTIONS = [
  { key: "positive", label: "Positief", tagClass: "monitor-tag monitor-tag--success" },
  { key: "negative", label: "Negatief", tagClass: "monitor-tag monitor-tag--warning" },
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

function normalizeSourcePath(value) {
  const text = String(value || "").trim();
  if (!text || text === "/feedback") return null;
  return text;
}

function inferContextFromSourcePath(sourcePath) {
  const clean = normalizeSourcePath(sourcePath);
  if (!clean) {
    return {
      source_path: null,
      installation_code: null,
      form_instance_id: null,
      parent_instance_id: null,
    };
  }

  const installationFormMatch = clean.match(/^\/installaties\/([^/?]+)\/formulieren\/(\d+)(?:[/?#]|$)/i);
  if (installationFormMatch) {
    return {
      source_path: clean,
      installation_code: decodeURIComponent(installationFormMatch[1]),
      form_instance_id: Number.parseInt(installationFormMatch[2], 10),
      parent_instance_id: null,
    };
  }

  const installationMatch = clean.match(/^\/installaties\/([^/?]+)(?:[/?#]|$)/i);
  if (installationMatch) {
    return {
      source_path: clean,
      installation_code: decodeURIComponent(installationMatch[1]),
      form_instance_id: null,
      parent_instance_id: null,
    };
  }

  const monitorFormMatch = clean.match(/^\/monitor\/formulieren\/(\d+)(?:[/?#]|$)/i);
  if (monitorFormMatch) {
    return {
      source_path: clean,
      installation_code: null,
      form_instance_id: Number.parseInt(monitorFormMatch[1], 10),
      parent_instance_id: null,
    };
  }

  return {
    source_path: clean,
    installation_code: null,
    form_instance_id: null,
    parent_instance_id: null,
  };
}

function FeedbackCard({ item }) {
  const sentimentMeta =
    SENTIMENT_OPTIONS.find((option) => option.key === item?.sentiment) || SENTIMENT_OPTIONS[0];
  const statusMeta = getStatusMeta(item?.status);

  return (
    <div className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className={sentimentMeta.tagClass}>{sentimentMeta.label}</span>
          <span className={statusMeta.tagClass}>{statusMeta.label}</span>
        </div>

        <div className="muted" style={{ fontSize: 13 }}>
          {formatDateTime(item?.updated_at || item?.created_at)}
        </div>
      </div>

      {item?.message_markdown ? (
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{item.message_markdown}</div>
      ) : (
        <div className="muted">Geen extra toelichting toegevoegd.</div>
      )}

      {item?.source_path || item?.installation_code || item?.form_instance_id ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {item?.source_path ? (
            <span className="monitor-tag monitor-tag--muted">{item.source_path}</span>
          ) : null}
          {item?.installation_code ? (
            <span className="monitor-tag monitor-tag--muted">
              Installatie {item.installation_code}
            </span>
          ) : null}
          {item?.form_instance_id ? (
            <span className="monitor-tag monitor-tag--muted">
              Formulier #{item.form_instance_id}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="monitor-surface monitor-surface--neutral" style={{ padding: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Reactie van Ember-beheer</div>
        {item?.active_reply?.reply_markdown ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {item.active_reply.reply_markdown}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {item?.active_reply?.admin_display_name_snapshot || item?.active_reply?.admin_email_snapshot || "Beheer"}
              {item?.active_reply?.updated_at || item?.active_reply?.created_at
                ? ` ; ${formatDateTime(item.active_reply.updated_at || item.active_reply.created_at)}`
                : ""}
            </div>
          </div>
        ) : (
          <div className="muted">Nog geen reactie geplaatst.</div>
        )}
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitState, setSubmitState] = useState("");
  const [payload, setPayload] = useState({ items: [], summary: {} });
  const [draft, setDraft] = useState({
    sentiment: "positive",
    message_markdown: "",
  });

  const locationState = location.state && typeof location.state === "object" ? location.state : {};
  const inferredContext = useMemo(
    () => inferContextFromSourcePath(locationState?.sourcePath),
    [locationState?.sourcePath]
  );
  const startupLoader = useApiStartupLoader(loading, {
    loadingCopy: "Je feedbackoverzicht wordt geladen.",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await getMyFeedback();
      setPayload(result || { items: [], summary: {} });
    } catch (err) {
      setError(err?.message || String(err));
      setPayload({ items: [], summary: {} });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSubmitState("");

    try {
      await createMyFeedback({
        sentiment: draft.sentiment,
        message_markdown: String(draft.message_markdown || "").trim() || null,
        source_path: inferredContext.source_path,
        installation_code: inferredContext.installation_code,
        form_instance_id: inferredContext.form_instance_id,
        parent_instance_id: inferredContext.parent_instance_id,
      });

      setDraft({
        sentiment: draft.sentiment,
        message_markdown: "",
      });
      setSubmitState("Feedback opgeslagen.");
      await load();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];

  return (
    <div className="admin-page">
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Feedback</h1>
              <div className="ember-page-subtitle">
                Laat kort weten wat goed werkt of wat beter kan in Ember.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="inst-body" style={{ display: "grid", gap: 16 }}>
        <ApiStartupLoader state={startupLoader} startupTitle="Ember haalt je feedback op" />

        <div className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MessageCircleMoreIcon size={22} />
            <div style={{ fontWeight: 900, fontSize: 18 }}>Nieuw feedbackitem</div>
          </div>

          {inferredContext.source_path ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="monitor-tag monitor-tag--muted">
                Context {inferredContext.source_path}
              </span>
              {inferredContext.installation_code ? (
                <span className="monitor-tag monitor-tag--muted">
                  Installatie {inferredContext.installation_code}
                </span>
              ) : null}
              {inferredContext.form_instance_id ? (
                <span className="monitor-tag monitor-tag--muted">
                  Formulier #{inferredContext.form_instance_id}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="muted">
              Geen paginacontext meegegeven; je feedback wordt algemeen opgeslagen.
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SENTIMENT_OPTIONS.map((option) => {
                const active = option.key === draft.sentiment;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={active ? `${option.tagClass} monitor-tag--selected` : "monitor-tag monitor-tag--muted"}
                    onClick={() => setDraft((prev) => ({ ...prev, sentiment: option.key }))}
                    disabled={saving}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <textarea
              className="cf-textarea"
              rows={5}
              placeholder="Optionele toelichting"
              value={draft.message_markdown}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, message_markdown: event.target.value }))
              }
              disabled={saving}
            />

            {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
            {submitState ? <div className="ember-alert ember-alert--success">{submitState}</div> : null}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Opslaan..." : "Feedback opslaan"}
              </button>
            </div>
          </form>
        </div>

        <div className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Mijn feedback</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="monitor-tag monitor-tag--muted">
                Totaal {Number(payload?.summary?.total_count || 0)}
              </span>
              <span className="monitor-tag monitor-tag--muted">
                Open {Number(payload?.summary?.open_count || 0)}
              </span>
              <span className="monitor-tag monitor-tag--muted">
                Beantwoord {Number(payload?.summary?.answered_count || 0)}
              </span>
            </div>
          </div>

          {!loading && !items.length ? (
            <div className="ui-empty">Er zijn nog geen feedbackitems geplaatst.</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {items.map((item) => (
                <FeedbackCard key={item.feedback_id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
