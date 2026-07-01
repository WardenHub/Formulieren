import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import UserAvatar from "../../components/UserAvatar.jsx";
import {
  archiveInstallationNote,
  createInstallationNote,
  deleteInstallationNote,
  getInstallationNotes,
  getInstallationWorkflowItems,
  getMe,
  getUserDirectory,
  toggleInstallationNoteReaction,
  updateInstallationNote,
} from "../../api/emberApi.js";
import {
  buildDirectoryActorLookup,
  buildInitials,
  getDirectoryDisplayName,
  resolveActorDirectoryEntry,
  resolveActorDisplayName,
  resolveDirectoryAvatarPath,
} from "../../lib/avatar.js";
import {
  formatDateTime,
  getCardToneClass,
  getToneClass,
  getStatusTone,
  statusLabel,
} from "../Monitor/formsMonitorShared.jsx";
import {
  MessageCircleMore,
  TriangleAlert,
  HandHelping,
  Archive,
  Pencil,
  Trash2,
  Check,
  X,
  Link2,
} from "lucide-react";
import { MessageSquarePlusIcon } from "../../components/ui/message-square-plus.jsx";

const NOTE_KIND_OPTIONS = [
  { key: "NOTE", label: "Notitie", tone: "neutral", Icon: MessageCircleMore },
  { key: "HANDOVER", label: "Overdracht", tone: "active", Icon: HandHelping },
  { key: "WARNING", label: "Waarschuwing", tone: "danger", Icon: TriangleAlert },
];

const REACTION_OPTIONS = [
  { key: "thumbs_up", emoji: "👍" },
  { key: "eyes", emoji: "👀" },
  { key: "warning", emoji: "⚠️" },
  { key: "check", emoji: "✅" },
  { key: "idea", emoji: "💡" },
];

function normalizeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) {
    return `https://${raw}`;
  }
  return raw;
}

function isHttpUrl(value) {
  const raw = String(value || "").trim();
  return /^https?:\/\/\S+$/i.test(raw);
}

function buildMarkdownLink(label, href) {
  const safeHref = normalizeHttpUrl(href);
  const safeLabel = String(label || "").trim() || safeHref;
  return `[${safeLabel}](${safeHref})`;
}

function applyMarkdownLink(currentValue, selectionStart, selectionEnd, href, labelOverride = "") {
  const source = String(currentValue || "");
  const start = Math.max(0, Number(selectionStart ?? 0));
  const end = Math.max(start, Number(selectionEnd ?? start));
  const selectedText = source.slice(start, end);
  const label = String(labelOverride || "").trim() || selectedText || "link";
  const linkMarkup = buildMarkdownLink(label, href);
  const nextValue = source.slice(0, start) + linkMarkup + source.slice(end);

  return {
    value: nextValue,
    caretStart: start + linkMarkup.length,
    caretEnd: start + linkMarkup.length,
    selectedText,
  };
}

function insertRawText(currentValue, selectionStart, selectionEnd, text) {
  const source = String(currentValue || "");
  const start = Math.max(0, Number(selectionStart ?? 0));
  const end = Math.max(start, Number(selectionEnd ?? start));
  const insertText = String(text || "");
  const nextValue = source.slice(0, start) + insertText + source.slice(end);
  const caret = start + insertText.length;

  return {
    value: nextValue,
    caretStart: caret,
    caretEnd: caret,
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

function NoteEditorToolbar({
  disabled = false,
  onInsertLink,
}) {
  return (
    <div className="ember-toolbar" style={{ justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={onInsertLink}
          title="Voeg een hyperlink toe"
        >
          <Link2 size={16} />
          Link invoegen
        </button>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Selecteer tekst en druk op Ctrl+K ; links openen standaard in een nieuw tabblad.
      </div>
    </div>
  );
}

function linkifyText(text) {
  const source = String(text || "");
  const nodes = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(source))) {
    if (match.index > lastIndex) {
      nodes.push(source.slice(lastIndex, match.index));
    }

    const label = match[1] || match[3];
    const href = match[2] || match[3];
    nodes.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        style={{ color: "var(--link)", textDecoration: "underline" }}
      >
        {label}
      </a>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < source.length) {
    nodes.push(source.slice(lastIndex));
  }

  return nodes.flatMap((part, index) => {
    if (typeof part !== "string") return [part];
    return part.split("\n").flatMap((line, lineIndex, arr) => {
      const items = [line];
      if (lineIndex < arr.length - 1) {
        items.push(<br key={`br-${index}-${lineIndex}`} />);
      }
      return items;
    });
  });
}

function getNoteKindMeta(noteKind) {
  return NOTE_KIND_OPTIONS.find((item) => item.key === noteKind) || NOTE_KIND_OPTIONS[0];
}

function buildReactionSummary(reactions = []) {
  const byKey = new Map();
  for (const reaction of reactions) {
    const key = String(reaction?.reaction_key || "").trim();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(reaction);
  }

  return REACTION_OPTIONS.map((item) => ({
    ...item,
    count: (byKey.get(item.key) || []).length,
    items: byKey.get(item.key) || [],
  })).filter((item) => item.count > 0 || REACTION_OPTIONS.some((candidate) => candidate.key === item.key));
}

function normalizeMentionSelection(item) {
  return {
    mentioned_user_object_id: String(item?.user_object_id || "").trim(),
    mentioned_display_name_snapshot: getDirectoryDisplayName(item),
    mentioned_email_snapshot: String(item?.email || item?.email_snapshot || "").trim() || null,
  };
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

function NoteKindButton({ option, active, onClick, disabled = false }) {
  const Icon = option.Icon;
  const className = active
    ? `${getToneClass(option.tone)} monitor-tag--selected`
    : "monitor-tag monitor-tag--muted";

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icon size={16} />
        {option.label}
      </span>
    </button>
  );
}

function MentionPicker({ directoryItems, selectedMentions, onAddMention, disabled = false }) {
  const [query, setQuery] = useState("");
  const selectedLookup = useMemo(() => buildMentionLookup(selectedMentions), [selectedMentions]);

  const matches = useMemo(() => {
    const cleanQuery = String(query || "").trim().toLowerCase();
    if (!cleanQuery) return [];

    return (directoryItems || [])
      .filter((item) => {
        const objectId = String(item?.user_object_id || "").trim();
        if (!objectId || selectedLookup.has(objectId)) return false;

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
  }, [directoryItems, query, selectedLookup]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        className="cf-input"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Noem collega om toe te voegen"
      />
      {matches.length ? (
        <div className="card" style={{ padding: 8, display: "grid", gap: 6 }}>
          {matches.map((item) => {
            const displayName = getDirectoryDisplayName(item) || item?.email || "-";
            return (
              <button
                key={item.user_object_id}
                type="button"
                className="btn"
                style={{ justifyContent: "space-between" }}
                onClick={() => {
                  onAddMention(normalizeMentionSelection(item));
                  setQuery("");
                }}
              >
                <span>{displayName}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {item?.email || ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function NotesTab({
  code,
  installation,
  readOnly = false,
  readOnlyReason = "",
  isActive = false,
  onWorkflowCountChange,
  onWarningNotesChange,
  activationToken = 0,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSubtab = String(searchParams.get("subtab") || "").trim().toLowerCase();
  const requestedNoteId = String(searchParams.get("note") || "").trim();

  const [subtab, setSubtab] = useState(requestedSubtab === "workflow" ? "workflow" : "notes");
  const [notesData, setNotesData] = useState({ notes: [], activeNotes: [], archivedNotes: [], counts: {} });
  const [workflowData, setWorkflowData] = useState({ activeItems: [], historicalItems: [], counts: {} });
  const [directoryItems, setDirectoryItems] = useState([]);
  const [actorLookup, setActorLookup] = useState(new Map());
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [error, setError] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showWorkflowHistory, setShowWorkflowHistory] = useState(false);
  const [draft, setDraft] = useState({
    note_kind: "NOTE",
    body_markdown: "",
    mentions: [],
  });
  const [editingNoteId, setEditingNoteId] = useState("");
  const [editingDraft, setEditingDraft] = useState({
    note_kind: "NOTE",
    body_markdown: "",
    mentions: [],
  });
  const [reactionMenuNoteId, setReactionMenuNoteId] = useState("");
  const textareaRef = useRef(null);
  const editingTextareaRef = useRef(null);
  const [linkDraft, setLinkDraft] = useState({
    target: "draft",
    url: "",
    label: "",
    selectionStart: 0,
    selectionEnd: 0,
    open: false,
  });
  const [mentionDraft, setMentionDraft] = useState({
    target: "draft",
    query: "",
    selectionStart: 0,
    selectionEnd: 0,
    open: false,
  });

  const currentUserObjectId = String(
    me?.user_object_id ||
      me?.profile?.user_object_id ||
      me?.profile?.microsoft_user_object_id ||
      ""
  ).trim();
  const currentRoles = Array.isArray(me?.roles) ? me.roles.map((item) => String(item || "").toLowerCase()) : [];
  const canModerate = currentRoles.includes("admin") || currentRoles.includes("documentbeheerder");
  const canHardDelete = currentRoles.includes("admin");
  const currentMentionTarget = mentionDraft.target === "edit" ? editingDraft.mentions : draft.mentions;
  const mentionMatches = useMemo(() => {
    if (!mentionDraft.open) return [];
    const cleanQuery = String(mentionDraft.query || "").trim().toLowerCase();
    const selectedLookup = buildMentionLookup(currentMentionTarget);

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
  }, [currentMentionTarget, directoryItems, mentionDraft]);

  function syncSearchParams(nextSubtab, nextNoteId = "") {
    const next = new URLSearchParams(searchParams);
    if (nextSubtab === "workflow") next.set("subtab", "workflow");
    else next.set("subtab", "notes");

    if (nextNoteId) next.set("note", nextNoteId);
    else next.delete("note");

    setSearchParams(next, { replace: true });
  }

  async function loadDirectoryAndMe() {
    const [meData, directoryData] = await Promise.all([getMe(), getUserDirectory()]);
    setMe(meData || null);
    const items = Array.isArray(directoryData?.items) ? directoryData.items : [];
    setDirectoryItems(items);
    setActorLookup(buildDirectoryActorLookup(items));
  }

  async function loadNotes(options = {}) {
    setLoading(true);
    setError("");
    try {
      const data = await getInstallationNotes(code, {
        includeArchived: options.includeArchived ?? showArchived,
        markRead: options.markRead ?? true,
      });
      setNotesData(data || { notes: [], activeNotes: [], archivedNotes: [], counts: {} });
      onWarningNotesChange?.((data?.activeNotes || []).filter((item) => item.note_kind === "WARNING"));
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkflow() {
    setWorkflowLoading(true);
    setWorkflowError("");
    try {
      const data = await getInstallationWorkflowItems(code);
      setWorkflowData(data || { activeItems: [], historicalItems: [], counts: {} });
      onWorkflowCountChange?.(Number(data?.counts?.open || 0));
    } catch (err) {
      setWorkflowError(err?.message || String(err));
    } finally {
      setWorkflowLoading(false);
    }
  }

  useEffect(() => {
    setSubtab(requestedSubtab === "workflow" ? "workflow" : "notes");
  }, [requestedSubtab]);

  useEffect(() => {
    if (!isActive) return;
    void loadDirectoryAndMe();
    void loadNotes({ markRead: true });
    void loadWorkflow();
  }, [code, isActive, activationToken]);

  useEffect(() => {
    if (!requestedNoteId) return;
    setSubtab("notes");
  }, [requestedNoteId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!requestedNoteId) return;
      const target = document.getElementById(`installation-note-${requestedNoteId}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [requestedNoteId, notesData.notes]);

  useEffect(() => {
    if (subtab !== "notes" && linkDraft.open) {
      closeLinkEditor();
    }
  }, [subtab, linkDraft.open]);

  useEffect(() => {
    function handlePointerDown(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-installation-reaction-menu]")) return;
      setReactionMenuNoteId("");
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!editingNoteId && linkDraft.open && linkDraft.target === "edit") {
      closeLinkEditor();
    }
  }, [editingNoteId, linkDraft.open, linkDraft.target]);

  useEffect(() => {
    if (!editingNoteId && mentionDraft.open && mentionDraft.target === "edit") {
      closeMentionPicker();
    }
  }, [editingNoteId, mentionDraft.open, mentionDraft.target]);

  useEffect(() => {
    if (!isActive || subtab !== "notes") return undefined;

    function handleSaveShortcut(event) {
      if (!event.altKey || String(event.key || "").toLowerCase() !== "s") return;
      event.preventDefault();

      if (readOnly || saving) return;

      if (editingNoteId) {
        if (!String(editingDraft.body_markdown || "").trim()) return;
        void handleSaveEdit(editingNoteId);
        return;
      }

      if (!String(draft.body_markdown || "").trim()) return;
      void handleCreateNote();
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [draft.body_markdown, editingDraft.body_markdown, editingNoteId, isActive, readOnly, saving, subtab]);

  function closeLinkEditor() {
    setLinkDraft({
      target: "draft",
      url: "",
      label: "",
      selectionStart: 0,
      selectionEnd: 0,
      open: false,
    });
  }

  function closeMentionPicker() {
    setMentionDraft({
      target: "draft",
      query: "",
      selectionStart: 0,
      selectionEnd: 0,
      open: false,
    });
  }

  function focusEditor(target, caretStart = null, caretEnd = null) {
    window.requestAnimationFrame(() => {
      const element = target === "edit" ? editingTextareaRef.current : textareaRef.current;
      if (!element) return;
      element.focus();
      if (caretStart == null || caretEnd == null) return;
      try {
        element.setSelectionRange(caretStart, caretEnd);
      } catch {
        // ignore
      }
    });
  }

  function openLinkEditor(target, currentValue, inputElement) {
    const selectionStart = Number(inputElement?.selectionStart ?? 0);
    const selectionEnd = Number(inputElement?.selectionEnd ?? selectionStart);
    const selectedText = String(currentValue || "").slice(selectionStart, selectionEnd).trim();

    setLinkDraft({
      target,
      url: "",
      label: selectedText,
      selectionStart,
      selectionEnd,
      open: true,
    });
  }

  function syncMentionPicker(target, currentValue, inputElement) {
    const context = findMentionContext(currentValue, inputElement?.selectionStart ?? 0);
    if (!context) {
      closeMentionPicker();
      return;
    }

    setMentionDraft({
      target,
      query: context.query,
      selectionStart: context.selectionStart,
      selectionEnd: context.selectionEnd,
      open: true,
    });
  }

  function handleCtrlK(event, target, currentValue) {
    if (!(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== "k") return;
    event.preventDefault();
    openLinkEditor(target, currentValue, event.currentTarget);
  }

  function handleMentionKeyDown(event, target) {
    const isOpen = mentionDraft.open && mentionDraft.target === target;
    if (!isOpen) return false;

    if (event.key === "Escape") {
      event.preventDefault();
      closeMentionPicker();
      return true;
    }

    if ((event.key === "Enter" || event.key === "Tab") && mentionMatches.length) {
      event.preventDefault();
      insertMentionIntoTarget(mentionMatches[0]);
      return true;
    }

    return false;
  }

  function handleLinkPaste(event, target, currentValue) {
    const pasted = String(event.clipboardData?.getData("text") || "").trim();
    if (!isHttpUrl(pasted)) return;

    const inputElement = event.currentTarget;
    const selectionStart = Number(inputElement?.selectionStart ?? 0);
    const selectionEnd = Number(inputElement?.selectionEnd ?? selectionStart);
    if (selectionStart === selectionEnd) return;

    event.preventDefault();
    const result = applyMarkdownLink(currentValue, selectionStart, selectionEnd, pasted);
    if (target === "edit") {
      setEditingDraft((prev) => ({ ...prev, body_markdown: result.value }));
    } else {
      setDraft((prev) => ({ ...prev, body_markdown: result.value }));
    }
    focusEditor(target, result.caretStart, result.caretEnd);
  }

  function insertMentionIntoTarget(item) {
    const mention = normalizeMentionSelection(item);
    const displayName = mention.mentioned_display_name_snapshot || mention.mentioned_email_snapshot || "Gebruiker";
    const target = mentionDraft.target;
    const sourceValue = target === "edit" ? editingDraft.body_markdown : draft.body_markdown;
    const result = insertMentionReference(sourceValue, mentionDraft, displayName);

    if (target === "edit") {
      setEditingDraft((prev) => ({
        ...prev,
        body_markdown: result.value,
        mentions: prev.mentions.some((entry) => entry.mentioned_user_object_id === mention.mentioned_user_object_id)
          ? prev.mentions
          : [...prev.mentions, mention],
      }));
    } else {
      setDraft((prev) => ({
        ...prev,
        body_markdown: result.value,
        mentions: prev.mentions.some((entry) => entry.mentioned_user_object_id === mention.mentioned_user_object_id)
          ? prev.mentions
          : [...prev.mentions, mention],
      }));
    }

    closeMentionPicker();
    focusEditor(target, result.caretStart, result.caretEnd);
  }

  function applyLinkToTarget() {
    const url = normalizeHttpUrl(linkDraft.url);
    if (!isHttpUrl(url)) return;

    const sourceValue =
      linkDraft.target === "edit" ? editingDraft.body_markdown : draft.body_markdown;
    const result = applyMarkdownLink(
      sourceValue,
      linkDraft.selectionStart,
      linkDraft.selectionEnd,
      url,
      linkDraft.label
    );

    if (linkDraft.target === "edit") {
      setEditingDraft((prev) => ({ ...prev, body_markdown: result.value }));
    } else {
      setDraft((prev) => ({ ...prev, body_markdown: result.value }));
    }

    closeLinkEditor();
    focusEditor(linkDraft.target, result.caretStart, result.caretEnd);
  }

  async function handleCreateNote() {
    setSaving(true);
    try {
      await createInstallationNote(code, draft);
      setDraft({
        note_kind: draft.note_kind,
        body_markdown: "",
        mentions: [],
      });
      await loadNotes({ includeArchived: showArchived, markRead: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(noteId) {
    setSaving(true);
    try {
      await updateInstallationNote(code, noteId, editingDraft);
      setEditingNoteId("");
      await loadNotes({ includeArchived: showArchived, markRead: true });
    } finally {
      setSaving(false);
    }
  }

  function canEditNote(note) {
    return (
      String(note?.author_user_object_id || "").trim() === currentUserObjectId ||
      canModerate
    );
  }

  function canDeleteNote(note) {
    return (
      String(note?.author_user_object_id || "").trim() === currentUserObjectId ||
      canHardDelete
    );
  }

  const activeNotes = notesData.activeNotes || [];
  const archivedNotes = notesData.archivedNotes || [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="tabs-row" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className={subtab === "notes" ? "tab-btn active" : "tab-btn"}
          onClick={() => {
            setSubtab("notes");
            syncSearchParams("notes");
          }}
        >
          Notities
        </button>
        <button
          type="button"
          className={subtab === "workflow" ? "tab-btn active" : "tab-btn"}
          onClick={() => {
            setSubtab("workflow");
            syncSearchParams("workflow");
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span>Workflowitems</span>
            <span className={Number(workflowData?.counts?.open || 0) > 0 ? "monitor-tag monitor-tag--warning" : "monitor-tag monitor-tag--muted"}>
              {Number(workflowData?.counts?.open || 0)}
            </span>
          </span>
        </button>
      </div>

      {subtab === "notes" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 20 }}>Actieve notities</div>
            <button
              type="button"
              className={showArchived ? "monitor-tag monitor-tag--active monitor-tag--selected" : "monitor-tag monitor-tag--muted"}
              onClick={() => {
                const nextValue = !showArchived;
                setShowArchived(nextValue);
                void loadNotes({ includeArchived: nextValue, markRead: true });
              }}
            >
              Historie {archivedNotes.length}
            </button>
          </div>

          {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
          {loading ? <div className="muted">Notities laden...</div> : null}

          {!loading && !activeNotes.length ? (
            <div className="card" style={{ padding: 18 }}>
              <div className="muted">Er zijn nog geen actieve notities op deze installatie.</div>
            </div>
          ) : null}

          {[...activeNotes, ...(showArchived ? archivedNotes : [])].map((note) => {
            const isEditing = editingNoteId === note.installation_note_id;
            const noteMeta = getNoteKindMeta(note.note_kind);
            const noteToneClass = getCardToneClass(
              note.note_kind === "WARNING"
                ? "AFGEWEZEN"
                : note.note_kind === "HANDOVER"
                  ? "OPEN"
                  : "GEPLAND"
            );
            const directoryEntry =
              resolveActorDirectoryEntry(note.author_user_object_id, actorLookup) ||
              resolveActorDirectoryEntry(note.author_email_snapshot, actorLookup);
            const authorName = resolveActorDisplayName(
              note.author_user_object_id || note.author_email_snapshot || note.author_display_name_snapshot,
              actorLookup,
              note.author_display_name_snapshot || note.author_email_snapshot || "-"
            );
            const authorEmail = note.author_email_snapshot || directoryEntry?.email || "";
            const avatarPath = resolveDirectoryAvatarPath(directoryEntry);
            const reactionSummary = buildReactionSummary(note.reactions || []);

            return (
              <div
                key={note.installation_note_id}
                id={`installation-note-${note.installation_note_id}`}
                className={noteToneClass}
                style={{ padding: 18, display: "grid", gap: 14 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <UserAvatar
                      path={avatarPath}
                      fallback={buildInitials(authorName, authorEmail)}
                      alt={authorName || "Auteur"}
                    />
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{authorName}</strong>
                        <span className={getToneClass(noteMeta.tone)}>{noteMeta.label}</span>
                        {note.is_archived ? <span className="monitor-tag monitor-tag--muted">Historisch</span> : null}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {formatDateTime(note.updated_at || note.created_at)}
                        {authorEmail ? ` ; ${authorEmail}` : ""}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canEditNote(note) ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setEditingNoteId(note.installation_note_id);
                          setEditingDraft({
                            note_kind: note.note_kind,
                            body_markdown: note.body_markdown || "",
                            mentions: (note.mentions || []).map((item) => ({
                              mentioned_user_object_id: item.mentioned_user_object_id,
                              mentioned_display_name_snapshot: item.mentioned_display_name_snapshot,
                              mentioned_email_snapshot: item.mentioned_email_snapshot,
                            })),
                          });
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                    ) : null}
                    {canEditNote(note) ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          await archiveInstallationNote(code, note.installation_note_id, !note.is_archived);
                          await loadNotes({ includeArchived: showArchived, markRead: true });
                        }}
                      >
                        <Archive size={16} />
                      </button>
                    ) : null}
                    {canDeleteNote(note) ? (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={async () => {
                          if (!window.confirm("Weet je zeker dat je deze notitie wilt verwijderen?")) return;
                          await deleteInstallationNote(code, note.installation_note_id);
                          await loadNotes({ includeArchived: showArchived, markRead: true });
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {NOTE_KIND_OPTIONS.map((option) => (
                        <NoteKindButton
                          key={option.key}
                          option={option}
                          active={editingDraft.note_kind === option.key}
                          disabled={saving}
                          onClick={() => setEditingDraft((prev) => ({ ...prev, note_kind: option.key }))}
                        />
                      ))}
                    </div>
                    <textarea
                      ref={editingTextareaRef}
                      className="cf-textarea"
                      rows={5}
                      value={editingDraft.body_markdown}
                      onKeyDown={(event) => {
                        if (handleMentionKeyDown(event, "edit")) return;
                        handleCtrlK(event, "edit", editingDraft.body_markdown);
                        syncMentionPicker("edit", editingDraft.body_markdown, event.currentTarget);
                      }}
                      onClick={(event) => syncMentionPicker("edit", editingDraft.body_markdown, event.currentTarget)}
                      onPaste={(event) => handleLinkPaste(event, "edit", editingDraft.body_markdown)}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setEditingDraft((prev) => ({ ...prev, body_markdown: nextValue }));
                        syncMentionPicker("edit", nextValue, event.target);
                      }}
                    />
                    {mentionDraft.open && mentionDraft.target === "edit" && mentionMatches.length ? (
                      <div className="card ember-inline-assist-panel">
                        {mentionMatches.map((item) => {
                          const displayName = getDirectoryDisplayName(item) || item?.email || "-";
                          return (
                            <button
                              key={item.user_object_id}
                              type="button"
                              className="btn ember-inline-assist-option"
                              onClick={() => insertMentionIntoTarget(item)}
                            >
                              <span>{displayName}</span>
                              <span className="ember-inline-assist-option__meta">
                                {item?.email || ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <NoteEditorToolbar
                      disabled={saving}
                      onInsertLink={() =>
                        openLinkEditor("edit", editingDraft.body_markdown, editingTextareaRef.current)
                      }
                    />
                    {linkDraft.open && linkDraft.target === "edit" ? (
                      <div className="card ember-inline-assist-panel ember-inline-assist-panel--editor">
                        <div style={{ fontWeight: 800 }}>Hyperlink invoegen</div>
                        <div style={{ display: "grid", gap: 10, width: "100%" }}>
                          <input
                            className="cf-input"
                            value={linkDraft.label}
                            onChange={(event) =>
                              setLinkDraft((prev) => ({ ...prev, label: event.target.value }))
                            }
                            placeholder="Linktekst"
                          />
                          <input
                            className="cf-input"
                            value={linkDraft.url}
                            autoFocus
                            onChange={(event) =>
                              setLinkDraft((prev) => ({ ...prev, url: event.target.value }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                applyLinkToTarget();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                closeLinkEditor();
                                focusEditor("edit", linkDraft.selectionStart, linkDraft.selectionEnd);
                              }
                            }}
                            placeholder="https://..."
                          />
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              closeLinkEditor();
                              focusEditor("edit", linkDraft.selectionStart, linkDraft.selectionEnd);
                            }}
                          >
                            Annuleren
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={!isHttpUrl(normalizeHttpUrl(linkDraft.url))}
                            onClick={applyLinkToTarget}
                          >
                            Link invoegen
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {editingDraft.mentions.map((mention) => (
                        <button
                          key={mention.mentioned_user_object_id}
                          type="button"
                          className="monitor-tag monitor-tag--active"
                          onClick={() =>
                            setEditingDraft((prev) => ({
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
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setEditingNoteId("")}
                      >
                        <X size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn"
                        title="Wijziging opslaan ; Alt+S"
                        disabled={saving || !String(editingDraft.body_markdown || "").trim()}
                        onClick={() => handleSaveEdit(note.installation_note_id)}
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ fontSize: 15, lineHeight: 1.6 }}>{linkifyText(note.body_markdown)}</div>

                    {(note.mentions || []).length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(note.mentions || []).map((mention) => (
                          <span key={mention.installation_note_mention_id} className="monitor-tag monitor-tag--active">
                            {mention.mentioned_display_name_snapshot || mention.mentioned_email_snapshot || "Gebruiker"}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {reactionSummary
                          .filter((item) => item.count > 0)
                          .map((item) => (
                            <span
                              key={`summary-${item.key}`}
                              className="monitor-tag monitor-tag--muted"
                              title={item.items
                                .map((reaction) =>
                                  resolveActorDisplayName(
                                    reaction.reactor_user_object_id || reaction.reactor_email_snapshot,
                                    actorLookup,
                                    reaction.reactor_display_name_snapshot || reaction.reactor_email_snapshot || "Gebruiker"
                                  )
                                )
                                .join(" ; ")}
                              style={{ fontSize: 14, padding: "8px 12px" }}
                            >
                              <span style={{ fontSize: 18, lineHeight: 1 }}>{item.emoji}</span> {item.count}
                            </span>
                          ))}
                      </div>

                      <div
                        data-installation-reaction-menu
                        style={{ position: "relative", display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}
                      >
                        {reactionMenuNoteId === note.installation_note_id ? (
                          <div
                            className="card ember-inline-assist-panel"
                            style={{
                              position: "absolute",
                              right: 0,
                              bottom: "calc(100% + 10px)",
                              minWidth: 260,
                              zIndex: 8,
                            }}
                          >
                            <div className="ember-page-subtitle">Reactie toevoegen</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {REACTION_OPTIONS.map((reactionOption) => {
                                const count = (note.reactions || []).filter(
                                  (item) => item.reaction_key === reactionOption.key
                                ).length;
                                const myReaction = (note.reactions || []).some(
                                  (item) =>
                                    item.reaction_key === reactionOption.key &&
                                    String(item.reactor_user_object_id || "").trim() === currentUserObjectId
                                );
                                return (
                                  <button
                                    key={reactionOption.key}
                                    type="button"
                                    className={myReaction ? "monitor-tag monitor-tag--active monitor-tag--selected" : "monitor-tag monitor-tag--muted"}
                                    style={{ fontSize: 15, padding: "9px 12px" }}
                                    title={count > 0 ? `${count} reactie(s)` : "Reageer"}
                                    onClick={async () => {
                                      await toggleInstallationNoteReaction(code, note.installation_note_id, reactionOption.key);
                                      setReactionMenuNoteId("");
                                      await loadNotes({ includeArchived: showArchived, markRead: false });
                                    }}
                                  >
                                    <span style={{ fontSize: 18, lineHeight: 1 }}>{reactionOption.emoji}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          className="btn btn-secondary"
                          title="Reacties tonen"
                          onClick={() =>
                            setReactionMenuNoteId((prev) =>
                              prev === note.installation_note_id ? "" : note.installation_note_id
                            )
                          }
                        >
                          <MessageSquarePlusIcon size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 20 }}>Nieuwe notitie</div>
              <div className="muted">
                Leg overdracht, waarschuwingen of gewone notities vast op deze installatie.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {NOTE_KIND_OPTIONS.map((option) => (
                <NoteKindButton
                  key={option.key}
                  option={option}
                  active={draft.note_kind === option.key}
                  disabled={readOnly}
                  onClick={() => setDraft((prev) => ({ ...prev, note_kind: option.key }))}
                />
              ))}
            </div>

            <textarea
              ref={textareaRef}
              className="cf-textarea"
              disabled={readOnly || saving}
              rows={6}
              value={draft.body_markdown}
              onKeyDown={(event) => {
                if (handleMentionKeyDown(event, "draft")) return;
                handleCtrlK(event, "draft", draft.body_markdown);
                syncMentionPicker("draft", draft.body_markdown, event.currentTarget);
              }}
              onClick={(event) => syncMentionPicker("draft", draft.body_markdown, event.currentTarget)}
              onPaste={(event) => handleLinkPaste(event, "draft", draft.body_markdown)}
              onChange={(event) => {
                const nextValue = event.target.value;
                setDraft((prev) => ({ ...prev, body_markdown: nextValue }));
                syncMentionPicker("draft", nextValue, event.target);
              }}
              placeholder="Typ de notitie; plak links direct in de tekst of gebruik Ctrl+K."
            />
            {mentionDraft.open && mentionDraft.target === "draft" && mentionMatches.length ? (
              <div className="card ember-inline-assist-panel">
                {mentionMatches.map((item) => {
                  const displayName = getDirectoryDisplayName(item) || item?.email || "-";
                  return (
                    <button
                      key={item.user_object_id}
                      type="button"
                      className="btn ember-inline-assist-option"
                      onClick={() => insertMentionIntoTarget(item)}
                    >
                      <span>{displayName}</span>
                      <span className="ember-inline-assist-option__meta">
                        {item?.email || ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <NoteEditorToolbar
              disabled={readOnly || saving}
              onInsertLink={() => openLinkEditor("draft", draft.body_markdown, textareaRef.current)}
            />
            {linkDraft.open && linkDraft.target === "draft" ? (
              <div className="card ember-inline-assist-panel ember-inline-assist-panel--editor">
                <div style={{ fontWeight: 800 }}>Hyperlink invoegen</div>
                <div style={{ display: "grid", gap: 10, width: "100%" }}>
                  <input
                    className="cf-input"
                    value={linkDraft.label}
                    onChange={(event) =>
                      setLinkDraft((prev) => ({ ...prev, label: event.target.value }))
                    }
                    placeholder="Linktekst"
                  />
                  <input
                    className="cf-input"
                    value={linkDraft.url}
                    autoFocus
                    onChange={(event) =>
                      setLinkDraft((prev) => ({ ...prev, url: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyLinkToTarget();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        closeLinkEditor();
                        focusEditor("draft", linkDraft.selectionStart, linkDraft.selectionEnd);
                      }
                    }}
                    placeholder="https://..."
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      closeLinkEditor();
                      focusEditor("draft", linkDraft.selectionStart, linkDraft.selectionEnd);
                    }}
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!isHttpUrl(normalizeHttpUrl(linkDraft.url))}
                    onClick={applyLinkToTarget}
                  >
                    Link invoegen
                  </button>
                </div>
              </div>
            ) : null}

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

            {readOnly ? (
              <div className="muted">{readOnlyReason || "Deze installatie is alleen-lezen."}</div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn"
                title="Notitie opslaan ; Alt+S"
                disabled={readOnly || saving || !String(draft.body_markdown || "").trim()}
                onClick={handleCreateNote}
              >
                Notitie opslaan
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {workflowError ? <div className="ember-alert ember-alert--danger">{workflowError}</div> : null}
          {workflowLoading ? <div className="muted">Workflowitems laden...</div> : null}

          <div className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 20 }}>Openstaande workflowitems</div>
                <div className="muted">Actieve actiepunten vanuit formulieren op deze installatie.</div>
              </div>
              <span className={Number(workflowData?.counts?.open || 0) > 0 ? "monitor-tag monitor-tag--warning" : "monitor-tag monitor-tag--muted"}>
                {Number(workflowData?.counts?.open || 0)} open
              </span>
            </div>

            {!workflowLoading && !(workflowData?.activeItems || []).length ? (
              <div className="muted">Er zijn geen actieve workflowitems op deze installatie.</div>
            ) : null}

            {(workflowData?.activeItems || []).map((item) => (
              <div key={item.follow_up_action_id} className={getCardToneClass(item.status)} style={{ padding: 16, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800 }}>
                    {item.source_item_code ? `${item.source_item_code} ; ` : ""}
                    {item.workflow_title || "Workflowitem"}
                  </div>
                  <span className={getToneClass(getStatusTone(item.status))}>{statusLabel(item.status)}</span>
                </div>
                {item.workflow_description ? <div>{item.workflow_description}</div> : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {item.category ? <span className="monitor-tag monitor-tag--muted">{item.category}</span> : null}
                  {item.form_title ? <span className="monitor-tag monitor-tag--active">{item.form_title}</span> : null}
                  {item.instance_number != null ? (
                    <span className="monitor-tag monitor-tag--neutral">Formulier #{item.instance_number}</span>
                  ) : null}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Laatste wijziging; {formatDateTime(item.updated_at || item.created_at)}
                  </div>
                  <Link className="btn" to={`/monitor/formulieren/${encodeURIComponent(item.form_instance_id)}`}>
                    Open formulierafhandeling
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
            <button
              type="button"
              className={showWorkflowHistory ? "tab-btn active" : "tab-btn"}
              style={{ justifySelf: "start" }}
              onClick={() => setShowWorkflowHistory((prev) => !prev)}
            >
              Historie {Number(workflowData?.counts?.historical || 0)}
            </button>

            {showWorkflowHistory ? (
              <div style={{ display: "grid", gap: 10 }}>
                {(workflowData?.historicalItems || []).length ? (
                  workflowData.historicalItems.map((item) => (
                    <div key={item.follow_up_action_id} className={getCardToneClass(item.status)} style={{ padding: 14, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700 }}>
                          {item.source_item_code ? `${item.source_item_code} ; ` : ""}
                          {item.workflow_title || "Workflowitem"}
                        </div>
                        <span className={getToneClass(getStatusTone(item.status))}>{statusLabel(item.status)}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Laatste wijziging; {formatDateTime(item.updated_at || item.created_at)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted">Er zijn nog geen historische workflowitems.</div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
