// De tekstbewerkingen rond notities staan los van de componenten, zodat
// NoteRichText.jsx alleen componenten exporteert en fast refresh blijft werken.

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
