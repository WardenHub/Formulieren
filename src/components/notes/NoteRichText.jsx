import { useEffect, useMemo, useRef, useState } from "react";
import { Picker } from "emoji-mart";
import emojiData from "@emoji-mart/data";
import emojiRegex from "emoji-regex";
import { FluentEmoji } from "@lobehub/fluent-emoji";
import { Link2, SmilePlus } from "lucide-react";

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

export function NoteEditorToolbar({
  disabled = false,
  onInsertLink,
  onInsertEmoji,
  customEmojis = [],
  emojiButtonLabel = "Emoji invoegen",
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const rootRef = useRef(null);
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
      if (!rootRef.current?.contains(event.target)) {
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

  return (
    <div className="ember-toolbar ember-note-toolbar" style={{ justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }} ref={rootRef}>
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

        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled || !onInsertEmoji}
          onClick={() => setEmojiOpen((prev) => !prev)}
          title={emojiButtonLabel}
        >
          <SmilePlus size={16} />
          Emoji
        </button>

        {emojiOpen ? (
          <div className="card ember-note-emoji-panel">
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
            <Picker
              data={emojiData}
              theme="light"
              previewPosition="none"
              skinTonePosition="none"
              autoFocus
              onEmojiSelect={(emoji) => {
                const value = String(emoji?.native || "").trim();
                if (!value) return;
                onInsertEmoji?.(value);
                setEmojiOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Selecteer tekst en druk op Ctrl+K ; links openen standaard in een nieuw tabblad.
      </div>
    </div>
  );
}
