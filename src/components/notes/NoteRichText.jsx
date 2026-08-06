import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Picker as EmojiMartPicker } from "emoji-mart";
import emojiData from "@emoji-mart/data";
import emojiRegex from "emoji-regex";
import { FluentEmoji } from "@lobehub/fluent-emoji";
import { Link2, SmilePlus } from "lucide-react";

const EMOJI_FALLBACKS = ["👍", "✅", "👀", "💡", "🎉", "⚠️", "😀", "📎"];

export function normalizeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) {
    return `https://${raw}`;
  }
  return raw;
}

export function isHttpUrl(value) {
  const raw = String(value || "").trim();
  return /^https?:\/\/\S+$/i.test(raw);
}

export function buildMarkdownLink(label, href) {
  const safeHref = normalizeHttpUrl(href);
  const safeLabel = String(label || "").trim() || safeHref;
  return `[${safeLabel}](${safeHref})`;
}

export function applyMarkdownLink(currentValue, selectionStart, selectionEnd, href, labelOverride = "") {
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

export function insertRawText(currentValue, selectionStart, selectionEnd, text) {
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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMentionPatterns(mentions = []) {
  return (mentions || [])
    .map((mention, index) => {
      const displayName = String(mention?.mentioned_display_name_snapshot || "").trim();
      const email = String(mention?.mentioned_email_snapshot || "").trim();
      const label = displayName || email;
      if (!label) return null;
      return {
        index,
        label,
        regex: new RegExp(`@${escapeRegex(label)}\\b`, "gi"),
      };
    })
    .filter(Boolean);
}

function tokenizeInlineText(source, mentions = [], keyPrefix = "note") {
  const mentionPatterns = buildMentionPatterns(mentions);
  const parts = [];
  const lines = String(source || "").split("\n");

  lines.forEach((line, lineIndex) => {
    let cursor = 0;
    while (cursor < line.length) {
      let bestMatch = null;

      for (const pattern of mentionPatterns) {
        pattern.regex.lastIndex = cursor;
        const match = pattern.regex.exec(line);
        if (!match) continue;
        if (!bestMatch || match.index < bestMatch.match.index) {
          bestMatch = { pattern, match };
        }
      }

      if (!bestMatch) {
        parts.push(line.slice(cursor));
        break;
      }

      if (bestMatch.match.index > cursor) {
        parts.push(line.slice(cursor, bestMatch.match.index));
      }

      parts.push(
        <span
          key={`${keyPrefix}-mention-${lineIndex}-${bestMatch.pattern.index}-${bestMatch.match.index}`}
          className="ember-inline-mention"
        >
          {bestMatch.pattern.label}
        </span>
      );
      cursor = bestMatch.match.index + bestMatch.match[0].length;
    }

    if (!line.length) {
      parts.push("");
    }

    if (lineIndex < lines.length - 1) {
      parts.push(<br key={`${keyPrefix}-br-${lineIndex}`} />);
    }
  });

  const regex = emojiRegex();
  const output = [];

  parts.forEach((part, index) => {
    if (typeof part !== "string") {
      output.push(part);
      return;
    }

    let lastIndex = 0;
    let match;
    while ((match = regex.exec(part))) {
      if (match.index > lastIndex) {
        output.push(part.slice(lastIndex, match.index));
      }
      output.push(
        <span key={`${keyPrefix}-emoji-${index}-${match.index}`} className="ember-inline-emoji" aria-hidden="true">
          <FluentEmoji emoji={match[0]} size={20} type="flat" />
        </span>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < part.length) {
      output.push(part.slice(lastIndex));
    }
    regex.lastIndex = 0;
  });

  return output;
}

export function NoteRichTextContent({ text, mentions = [] }) {
  const source = String(text || "");
  const nodes = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(source))) {
    if (match.index > lastIndex) {
      nodes.push(...tokenizeInlineText(source.slice(lastIndex, match.index), mentions, `note-${match.index}`));
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
        {tokenizeInlineText(label, [], `label-${match.index}`)}
      </a>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < source.length) {
    nodes.push(...tokenizeInlineText(source.slice(lastIndex), mentions, `note-tail-${lastIndex}`));
  }

  return <>{nodes}</>;
}

function EmojiPickerSurface({ onSelect }) {
  const hostRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!hostRef.current) return undefined;

    try {
      const picker = new EmojiMartPicker({
        data: emojiData,
        theme: "auto",
        previewPosition: "none",
        skinTonePosition: "none",
        autoFocus: true,
        i18n: {
          search: "Zoeken",
          clear: "Wissen",
          notfound: "Geen emoji gevonden",
          categories: {
            search: "Zoekresultaten",
            recent: "Vaak gebruikt",
            people: "Smileys en mensen",
            nature: "Dieren en natuur",
            foods: "Eten en drinken",
            activity: "Activiteiten",
            places: "Reizen en plaatsen",
            objects: "Objecten",
            symbols: "Symbolen",
            flags: "Vlaggen",
            custom: "Aangepast",
          },
          categorieslabel: "Emojicategorieën",
        },
        onEmojiSelect: (emoji) => {
          const value = String(emoji?.native || "").trim();
          if (value) onSelectRef.current?.(value);
        },
      });
      hostRef.current.replaceChildren(picker);
      return () => picker.remove();
    } catch {
      setUnavailable(true);
      return undefined;
    }
  }, []);

  if (unavailable) {
    return (
      <div className="ember-note-emoji-fallback" aria-label="Emoji kiezen">
        {EMOJI_FALLBACKS.map((emoji) => (
          <button key={emoji} type="button" className="btn btn-secondary" onClick={() => onSelect?.(emoji)}>
            <FluentEmoji emoji={emoji} size={22} type="flat" />
          </button>
        ))}
      </div>
    );
  }

  return <div ref={hostRef} className="ember-note-emoji-host" />;
}

export function NoteLinkDialog({
  open = false,
  label = "",
  url = "",
  onLabelChange,
  onUrlChange,
  onCancel,
  onConfirm,
}) {
  const urlInputRef = useRef(null);
  const normalizedUrl = normalizeHttpUrl(url);
  const canConfirm = isHttpUrl(normalizedUrl);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => urlInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="ember-note-link-dialog-layer" role="presentation">
      <button
        type="button"
        className="ember-note-link-dialog-backdrop"
        aria-label="Hyperlinkvenster sluiten"
        onClick={onCancel}
      />
      <section className="card ember-note-link-dialog" role="dialog" aria-modal="true" aria-label="Hyperlink invoegen">
        <div className="ember-note-link-dialog__title">Hyperlink invoegen</div>
        <label className="ember-note-link-dialog__field">
          <span>Webadres</span>
          <input
            ref={urlInputRef}
            className="cf-input"
            value={url}
            onChange={(event) => onUrlChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canConfirm) {
                event.preventDefault();
                onConfirm?.();
              }
            }}
            placeholder="https://..."
          />
        </label>
        <label className="ember-note-link-dialog__field">
          <span>Linktekst</span>
          <input
            className="cf-input"
            value={label}
            onChange={(event) => onLabelChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canConfirm) {
                event.preventDefault();
                onConfirm?.();
              }
            }}
            placeholder="Tekst die zichtbaar wordt"
          />
        </label>
        <div className="ember-note-link-dialog__actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Annuleren
          </button>
          <button type="button" className="btn" disabled={!canConfirm} onClick={onConfirm}>
            Link invoegen
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export function NoteEditorToolbar({
  disabled = false,
  onInsertLink,
  onInsertEmoji,
  customEmojis = [],
  emojiButtonLabel = "Emoji invoegen",
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPanelPosition, setEmojiPanelPosition] = useState(null);
  const rootRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const preparedCustomEmojis = useMemo(
    () =>
      (customEmojis || [])
        .map((item) => ({
          key: String(item?.key || item?.id || item?.shortcode || "").trim(),
          label: String(item?.label || item?.name || item?.shortcode || "").trim(),
          value: String(item?.value || item?.emoji || "").trim(),
        }))
        .filter((item) => item.key && item.value),
    [customEmojis]
  );

  useEffect(() => {
    if (!emojiOpen) return undefined;

    function handlePointer(event) {
      if (!rootRef.current?.contains(event.target) && !emojiPanelRef.current?.contains(event.target)) {
        setEmojiOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") setEmojiOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (!emojiOpen) return undefined;

    function updatePosition() {
      const anchor = emojiButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const panelWidth = Math.min(390, window.innerWidth - 24);
      const spaceBelow = window.innerHeight - anchor.bottom;
      const openAbove = spaceBelow < 420 && anchor.top > spaceBelow;
      const left = Math.min(Math.max(12, anchor.left), window.innerWidth - panelWidth - 12);
      const top = openAbove ? Math.max(12, anchor.top - 10) : anchor.bottom + 10;
      const availableHeight = openAbove ? anchor.top - 22 : spaceBelow - 22;

      setEmojiPanelPosition({
        left,
        top,
        openAbove,
        maxHeight: Math.max(240, availableHeight),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [emojiOpen]);

  return (
    <div className="ember-toolbar ember-note-toolbar" style={{ justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }} ref={rootRef}>
        <button
          ref={emojiButtonRef}
          type="button"
          className="btn btn-secondary ember-note-toolbar-button"
          disabled={disabled}
          onClick={onInsertLink}
          title="Voeg een hyperlink toe"
          aria-label="Hyperlink invoegen"
        >
          <Link2 size={16} />
        </button>

        <button
          ref={emojiButtonRef}
          type="button"
          className="btn btn-secondary ember-note-toolbar-button"
          disabled={disabled || !onInsertEmoji}
          onClick={() => setEmojiOpen((prev) => !prev)}
          title={emojiButtonLabel}
          aria-label={emojiButtonLabel}
        >
          <SmilePlus size={16} />
        </button>

        {emojiOpen && emojiPanelPosition && typeof document !== "undefined"
          ? createPortal(
          <div
            ref={emojiPanelRef}
            className={`card ember-note-emoji-panel${emojiPanelPosition.openAbove ? " ember-note-emoji-panel--above" : ""}`}
            style={{
              left: emojiPanelPosition.left,
              top: emojiPanelPosition.top,
              maxHeight: emojiPanelPosition.maxHeight,
            }}
          >
            {preparedCustomEmojis.length ? (
              <div className="ember-note-emoji-custom-row">
                {preparedCustomEmojis.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="monitor-tag monitor-tag--muted"
                    onClick={() => {
                      onInsertEmoji?.(item.value);
                      setEmojiOpen(false);
                    }}
                    title={item.label || item.value}
                  >
                    <span className="ember-inline-emoji" aria-hidden="true">
                      <FluentEmoji emoji={item.value} size={18} type="flat" />
                    </span>
                    {item.label || item.value}
                  </button>
                ))}
              </div>
            ) : null}
            <EmojiPickerSurface
              onSelect={(value) => {
                onInsertEmoji?.(value);
                setEmojiOpen(false);
              }}
            />
          </div>
          ,
          document.body
        )
          : null}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Selecteer tekst en druk op Ctrl+K ; links openen standaard in een nieuw tabblad.
      </div>
    </div>
  );
}
