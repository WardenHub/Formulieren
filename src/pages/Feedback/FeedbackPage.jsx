import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { HandHeart, Pencil, Trash2 } from "lucide-react";

import { createMyFeedback, deleteMyFeedback, getMyFeedback, getUserDirectory, putMyFeedback } from "../../api/emberApi.js";
import ApiStartupLoader, { useApiStartupLoader } from "../../components/ApiStartupLoader.jsx";
import {
  NoteEditorToolbar,
  NoteLinkDialog,
  NoteRichTextContent,
  applyMarkdownLink,
  insertRawText,
  isHttpUrl,
  normalizeHttpUrl,
} from "../../components/notes/NoteRichText.jsx";
import { DownvoteIcon } from "../../components/ui/downvote.jsx";
import { MessageCircleMoreIcon } from "../../components/ui/message-circle-more.jsx";
import { UpvoteIcon } from "../../components/ui/upvote.jsx";
import { getDirectoryDisplayName } from "../../lib/avatar.js";

const SENTIMENT_OPTIONS = [
  {
    key: "positive",
    label: "Positief",
    tagClass: "monitor-tag monitor-tag--success",
    Icon: UpvoteIcon,
    iconColor: "#1f9d55",
  },
  {
    key: "negative",
    label: "Verbeterpunt",
    tagClass: "monitor-tag monitor-tag--warning",
    Icon: DownvoteIcon,
    iconColor: "#dc2626",
  },
  {
    key: "proposal",
    label: "Voorstel",
    tagClass: "monitor-tag monitor-tag--active",
    Icon: HandHeart,
    iconColor: "var(--accent, #0f766e)",
  },
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

function getSentimentMeta(sentiment) {
  return SENTIMENT_OPTIONS.find((option) => option.key === sentiment) || SENTIMENT_OPTIONS[0];
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

function getContextLabel(sourcePath) {
  const clean = String(sourcePath || "").trim();
  if (!clean || clean === "/") return "Home";
  if (/^\/monitor\/formulieren\/\d+(?:[/?#]|$)/i.test(clean)) return "Formuliermonitor";
  if (/^\/monitor(?:[/?#]|$)/i.test(clean)) return "Monitor";
  if (/^\/installaties\/[^/?]+\/formulieren\/\d+(?:[/?#]|$)/i.test(clean)) return "Formulieren";
  if (/^\/installaties(?:[/?#]|$)/i.test(clean)) return "Installaties";
  if (/^\/profiel(?:[/?#]|$)/i.test(clean)) return "Profiel";
  if (/^\/smoelenboek(?:[/?#]|$)/i.test(clean)) return "Smoelenboek";
  return clean;
}

function inferContextFromSourcePath(sourcePath) {
  const clean = normalizeSourcePath(sourcePath);
  const contextLabel = getContextLabel(clean);

  if (!clean) {
    return {
      source_path: null,
      installation_code: null,
      form_instance_id: null,
      parent_instance_id: null,
      context_label: "Algemeen",
    };
  }

  const installationFormMatch = clean.match(/^\/installaties\/([^/?]+)\/formulieren\/(\d+)(?:[/?#]|$)/i);
  if (installationFormMatch) {
    return {
      source_path: clean,
      installation_code: decodeURIComponent(installationFormMatch[1]),
      form_instance_id: Number.parseInt(installationFormMatch[2], 10),
      parent_instance_id: null,
      context_label: contextLabel,
    };
  }

  const installationMatch = clean.match(/^\/installaties\/([^/?]+)(?:[/?#]|$)/i);
  if (installationMatch) {
    return {
      source_path: clean,
      installation_code: decodeURIComponent(installationMatch[1]),
      form_instance_id: null,
      parent_instance_id: null,
      context_label: contextLabel,
    };
  }

  const monitorFormMatch = clean.match(/^\/monitor\/formulieren\/(\d+)(?:[/?#]|$)/i);
  if (monitorFormMatch) {
    return {
      source_path: clean,
      installation_code: null,
      form_instance_id: Number.parseInt(monitorFormMatch[1], 10),
      parent_instance_id: null,
      context_label: contextLabel,
    };
  }

  return {
    source_path: clean,
    installation_code: null,
    form_instance_id: null,
    parent_instance_id: null,
    context_label: contextLabel,
  };
}

function findMentionContext(currentValue, selectionStart) {
  const source = String(currentValue || "");
  const caret = Math.max(0, Number(selectionStart ?? 0));
  const beforeCaret = source.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;

  const fullMatch = String(match[0] || "");
  const query = String(match[2] || "");
  const start = caret - fullMatch.length + (fullMatch.startsWith("@") ? 0 : 1);
  const end = caret;

  return {
    query,
    selectionStart: start,
    selectionEnd: end,
  };
}

function insertMentionReference(currentValue, mentionContext, displayName) {
  const label = `@${String(displayName || "").trim()}`.trim();
  return insertRawText(
    currentValue,
    mentionContext?.selectionStart ?? 0,
    mentionContext?.selectionEnd ?? 0,
    `${label} `
  );
}

function buildMentionLookup(mentions = []) {
  const map = new Map();
  for (const item of mentions) {
    const key = String(item?.mentioned_user_object_id || "").trim();
    if (!key) continue;
    map.set(key, item);
  }
  return map;
}

function normalizeMentionSelection(item) {
  return {
    mentioned_user_object_id: String(item?.user_object_id || "").trim(),
    mentioned_display_name_snapshot: getDirectoryDisplayName(item),
    mentioned_email_snapshot: String(item?.email || item?.email_snapshot || "").trim() || null,
  };
}

function SentimentButton({ option, active, onClick, disabled = false }) {
  const Icon = option.Icon;

  return (
    <button
      type="button"
      className={active ? `${option.tagClass} monitor-tag--selected` : "monitor-tag monitor-tag--muted"}
      title={option.label}
      aria-label={option.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 42,
        minHeight: 34,
        paddingInline: 10,
      }}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={22} style={{ color: active ? option.iconColor : "currentColor" }} />
    </button>
  );
}

function SentimentBadge({ sentiment, size = 18 }) {
  const sentimentMeta = getSentimentMeta(sentiment);
  const Icon = sentimentMeta.Icon;

  return (
    <span
      className={sentimentMeta.tagClass}
      title={sentimentMeta.label}
      aria-label={sentimentMeta.label}
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <Icon size={size} style={{ color: sentimentMeta.iconColor }} />
    </span>
  );
}

function FeedbackCard({ item, actionBusy, onEdit, onDelete }) {
  const statusMeta = getStatusMeta(item?.status);
  const contextLabel = getContextLabel(item?.source_path);

  return (
    <div className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <SentimentBadge sentiment={item?.sentiment} />
          <span className={statusMeta.tagClass}>{statusMeta.label}</span>
          <span className="monitor-tag monitor-tag--muted">Context: {contextLabel}</span>
        </div>

        <div className="muted" style={{ fontSize: 13 }}>
          {formatDateTime(item?.updated_at || item?.created_at)}
        </div>
      </div>

      {item?.message_markdown ? (
        <div style={{ lineHeight: 1.6 }}>
          <NoteRichTextContent text={item.message_markdown} mentions={[]} />
        </div>
      ) : (
        <div className="muted">Geen extra toelichting toegevoegd.</div>
      )}


      {!item?.has_reply && !item?.active_reply ? (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={onEdit}>
            <Pencil size={16} /> Bewerken
          </button>
          <button type="button" className="btn danger" disabled={actionBusy} onClick={onDelete}>
            <Trash2 size={16} /> Verwijderen
          </button>
        </div>
      ) : null}
      {item?.installation_code || item?.form_instance_id ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

      {item?.active_reply?.reply_markdown ? (
        <div className="monitor-surface monitor-surface--neutral" style={{ padding: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Reactie van Admin</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ lineHeight: 1.6 }}>
              <NoteRichTextContent text={item.active_reply.reply_markdown} mentions={[]} />
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {item?.active_reply?.admin_display_name_snapshot || item?.active_reply?.admin_email_snapshot || "Beheer"}
              {item?.active_reply?.updated_at || item?.active_reply?.created_at
                ? ` ; ${formatDateTime(item.active_reply.updated_at || item.active_reply.created_at)}`
                : ""}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function FeedbackPage() {
  const location = useLocation();
  const textareaRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [directoryItems, setDirectoryItems] = useState([]);
  const [error, setError] = useState("");
  const [submitState, setSubmitState] = useState("");
  const [payload, setPayload] = useState({ items: [], summary: {} });
  const [feedbackActionBusy, setFeedbackActionBusy] = useState(false);
  const [listFilters, setListFilters] = useState({ sentiment: "", status: "", topic: "" });
  const [draft, setDraft] = useState({
    sentiment: "positive",
    message_markdown: "",
    mentions: [],
  });
  const [linkDraft, setLinkDraft] = useState({
    url: "",
    label: "",
    selectionStart: 0,
    selectionEnd: 0,
    open: false,
  });
  const [mentionDraft, setMentionDraft] = useState({
    query: "",
    selectionStart: 0,
    selectionEnd: 0,
    open: false,
  });

  const locationState = location.state && typeof location.state === "object" ? location.state : {};
  const inferredContext = useMemo(
    () => inferContextFromSourcePath(locationState?.sourcePath || location.pathname || "/"),
    [location.pathname, locationState?.sourcePath]
  );
  const startupLoader = useApiStartupLoader(loading, {
    loadingCopy: "Je feedbackoverzicht wordt geladen.",
  });

  const mentionMatches = useMemo(() => {
    if (!mentionDraft.open) return [];
    const cleanQuery = String(mentionDraft.query || "").trim().toLowerCase();
    const selectedLookup = buildMentionLookup(draft.mentions);

    return (directoryItems || [])
      .filter((item) => {
        const objectId = String(item?.user_object_id || "").trim();
        if (!objectId || selectedLookup.has(objectId)) return false;

        if (!cleanQuery) return true;

        const haystack = [
          getDirectoryDisplayName(item),
          item?.email,
          item?.email_snapshot,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");

        return haystack.includes(cleanQuery);
      })
      .slice(0, 8);
  }, [directoryItems, draft.mentions, mentionDraft]);

  function closeLinkEditor() {
    setLinkDraft({
      url: "",
      label: "",
      selectionStart: 0,
      selectionEnd: 0,
      open: false,
    });
  }

  function closeMentionPicker() {
    setMentionDraft({
      query: "",
      selectionStart: 0,
      selectionEnd: 0,
      open: false,
    });
  }

  function focusEditor(selectionStart, selectionEnd = selectionStart) {
    window.requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function syncMentionPicker(currentValue, inputElement) {
    const context = findMentionContext(currentValue, inputElement?.selectionStart ?? 0);
    if (!context) {
      closeMentionPicker();
      return;
    }

    setMentionDraft({
      query: context.query,
      selectionStart: context.selectionStart,
      selectionEnd: context.selectionEnd,
      open: true,
    });
  }

  function openLinkEditor(currentValue, inputElement) {
    const selectionStart = inputElement?.selectionStart ?? 0;
    const selectionEnd = inputElement?.selectionEnd ?? selectionStart;
    const selectedText = String(currentValue || "").slice(selectionStart, selectionEnd);

    setLinkDraft({
      url: "",
      label: selectedText,
      selectionStart,
      selectionEnd,
      open: true,
    });
    closeMentionPicker();
  }

  function handleCtrlK(event, currentValue) {
    if ((event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "k") {
      event.preventDefault();
      openLinkEditor(currentValue, event.currentTarget);
    }
  }

  function insertEmojiIntoDraft(emojiValue) {
    const input = textareaRef.current;
    const result = insertRawText(
      draft.message_markdown,
      input?.selectionStart ?? draft.message_markdown.length,
      input?.selectionEnd ?? input?.selectionStart ?? draft.message_markdown.length,
      emojiValue
    );

    setDraft((prev) => ({ ...prev, message_markdown: result.value }));
    closeMentionPicker();
    focusEditor(result.caretStart, result.caretEnd);
  }

  function applyLinkToDraft() {
    const normalizedUrl = normalizeHttpUrl(linkDraft.url);
    if (!isHttpUrl(normalizedUrl)) return;

    const result = applyMarkdownLink(
      draft.message_markdown,
      linkDraft.selectionStart,
      linkDraft.selectionEnd,
      normalizedUrl,
      linkDraft.label
    );

    setDraft((prev) => ({ ...prev, message_markdown: result.value }));
    closeLinkEditor();
    focusEditor(result.caretStart, result.caretEnd);
  }

  function insertMentionIntoDraft(item) {
    const displayName = getDirectoryDisplayName(item) || item?.email || "Gebruiker";
    const result = insertMentionReference(draft.message_markdown, mentionDraft, displayName);
    const nextMention = normalizeMentionSelection(item);

    setDraft((prev) => ({
      ...prev,
      message_markdown: result.value,
      mentions: [...prev.mentions.filter((entry) => entry.mentioned_user_object_id !== nextMention.mentioned_user_object_id), nextMention],
    }));
    closeMentionPicker();
    focusEditor(result.caretStart, result.caretEnd);
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [feedbackResult, directoryResult] = await Promise.all([
        getMyFeedback(),
        getUserDirectory().catch(() => ({ items: [] })),
      ]);
      setPayload(feedbackResult || { items: [], summary: {} });
      setDirectoryItems(Array.isArray(directoryResult?.items) ? directoryResult.items : []);
    } catch (err) {
      setError(err?.message || String(err));
      setPayload({ items: [], summary: {} });
      setDirectoryItems([]);
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
        mentions: [],
      });
      closeLinkEditor();
      closeMentionPicker();
      setSubmitState("Feedback opgeslagen.");
      await load();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleEditFeedback(item) {
    if (!item?.feedback_id) return;
    const nextMessage = window.prompt("Feedback bewerken", item.message_markdown || "");
    if (nextMessage == null) return;

    setFeedbackActionBusy(true);
    setError("");
    try {
      await putMyFeedback(item.feedback_id, {
        sentiment: item.sentiment,
        message_markdown: String(nextMessage || "").trim() || null,
      });
      setSubmitState("Feedback bijgewerkt.");
      await load();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setFeedbackActionBusy(false);
    }
  }

  async function handleDeleteFeedback(item) {
    if (!item?.feedback_id) return;
    if (!window.confirm("Weet je zeker dat je deze feedback wilt verwijderen?")) return;

    setFeedbackActionBusy(true);
    setError("");
    try {
      await deleteMyFeedback(item.feedback_id);
      setSubmitState("Feedback verwijderd.");
      await load();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setFeedbackActionBusy(false);
    }
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const visibleItems = useMemo(() => items.filter((item) => {
    if (listFilters.sentiment && item.sentiment !== listFilters.sentiment) return false;
    if (listFilters.status && item.status !== listFilters.status) return false;
    const needle = listFilters.topic.trim().toLowerCase();
    return !needle || `${item.source_path || ""} ${item.message_markdown || ""} ${item.form_instance_id || ""}`.toLowerCase().includes(needle);
  }), [items, listFilters]);
  const feedbackGroups = useMemo(() => {
    const groups = new Map();
    for (const item of visibleItems) {
      const label = item.form_instance_id ? `Formulier #${item.form_instance_id}` : getContextLabel(item.source_path) || "Algemeen";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    }
    return Array.from(groups, ([label, groupItems]) => ({ label, items: groupItems }));
  }, [visibleItems]);

  return (
    <div className="admin-page">
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Feedback</h1>
              <div className="ember-page-subtitle">
                Laat weten wat goed werkt of wat beter kan in Ember.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="inst-body" style={{ display: "grid", gap: 16 }}>
        <ApiStartupLoader state={startupLoader} startupTitle="Ember haalt je feedback op" />

        <div className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <MessageCircleMoreIcon size={22} />
              <div style={{ fontWeight: 900, fontSize: 18 }}>Geef feedback</div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className="monitor-tag monitor-tag--muted">Context: {inferredContext.context_label}</span>
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
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {SENTIMENT_OPTIONS.map((option) => (
                <SentimentButton
                  key={option.key}
                  option={option}
                  active={option.key === draft.sentiment}
                  disabled={saving}
                  onClick={() => setDraft((prev) => ({ ...prev, sentiment: option.key }))}
                />
              ))}
            </div>

            <textarea
              ref={textareaRef}
              className="cf-textarea"
              rows={4}
              value={draft.message_markdown}
              onKeyDown={(event) => {
                handleCtrlK(event, draft.message_markdown);
                syncMentionPicker(draft.message_markdown, event.currentTarget);
              }}
              onClick={(event) => syncMentionPicker(draft.message_markdown, event.currentTarget)}
              onChange={(event) => {
                const nextValue = event.target.value;
                setDraft((prev) => ({ ...prev, message_markdown: nextValue }));
                syncMentionPicker(nextValue, event.target);
              }}
              disabled={saving}
              placeholder="Licht je feedback toe; gebruik @ voor collega’s en Ctrl+K voor een link."
            />

            {mentionDraft.open && mentionMatches.length ? (
              <div className="card ember-inline-assist-panel">
                {mentionMatches.map((item) => {
                  const displayName = getDirectoryDisplayName(item) || item?.email || "-";
                  return (
                    <button
                      key={item.user_object_id}
                      type="button"
                      className="btn ember-inline-assist-option"
                      onClick={() => insertMentionIntoDraft(item)}
                    >
                      <span>{displayName}</span>
                      <span className="ember-inline-assist-option__meta">{item?.email || ""}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <NoteEditorToolbar
              disabled={saving}
              onInsertLink={() => openLinkEditor(draft.message_markdown, textareaRef.current)}
              onInsertEmoji={insertEmojiIntoDraft}
            />

            <NoteLinkDialog
              open={linkDraft.open}
              label={linkDraft.label}
              url={linkDraft.url}
              onLabelChange={(label) => setLinkDraft((prev) => ({ ...prev, label }))}
              onUrlChange={(url) => setLinkDraft((prev) => ({ ...prev, url }))}
              onConfirm={applyLinkToDraft}
              onCancel={() => {
                closeLinkEditor();
                focusEditor(linkDraft.selectionStart, linkDraft.selectionEnd);
              }}
            />

            {draft.mentions.length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {draft.mentions.map((mention) => (
                  <button
                    key={mention.mentioned_user_object_id}
                    type="button"
                    className="monitor-tag monitor-tag--active"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        mentions: prev.mentions.filter(
                          (item) => item.mentioned_user_object_id !== mention.mentioned_user_object_id
                        ),
                      }))
                    }
                  >
                    {mention.mentioned_display_name_snapshot || mention.mentioned_email_snapshot || "Gebruiker"} ×
                  </button>
                ))}
              </div>
            ) : null}

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

          <div className="feedback-filter-row">
            <select className="cf-input" value={listFilters.sentiment} onChange={(event) => setListFilters((value) => ({ ...value, sentiment: event.target.value }))}>
              <option value="">Alle feedbacktypen</option>
              {SENTIMENT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <select className="cf-input" value={listFilters.status} onChange={(event) => setListFilters((value) => ({ ...value, status: event.target.value }))}>
              <option value="">Alle statussen</option>
              {Object.entries(STATUS_META).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
            <input className="cf-input" value={listFilters.topic} onChange={(event) => setListFilters((value) => ({ ...value, topic: event.target.value }))} placeholder="Formulier, norm, vraag of onderwerp" />
          </div>

          {!loading && !visibleItems.length ? (
            <div className="ui-empty">Er zijn nog geen feedbackitems geplaatst.</div>
          ) : (
            <div className="feedback-groups">
              {feedbackGroups.map((group) => (
                <section key={group.label} className="feedback-group">
                  <div className="feedback-group__head">
                    <strong>{group.label}</strong>
                    <div className="follow-up-tags">
                      {SENTIMENT_OPTIONS.map((option) => <span key={option.key} className={option.tagClass}>{option.label} {group.items.filter((item) => item.sentiment === option.key).length}</span>)}
                    </div>
                  </div>
                  <div className="feedback-group__items">{group.items.map((item) => (
                    <FeedbackCard key={item.feedback_id} item={item} actionBusy={feedbackActionBusy} onEdit={() => handleEditFeedback(item)} onDelete={() => handleDeleteFeedback(item)} />
                  ))}</div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

