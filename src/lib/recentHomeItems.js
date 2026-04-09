// /src/lib/recentHomeItems.js

const LS_KEY = "ember.home.recent.v1";
const MAX_ITEMS = 8;

function nowIso() {
  return new Date().toISOString();
}

function safeRead() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(items) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function normalizeItem(item) {
  return {
    kind: String(item?.kind || "").trim(),
    key: String(item?.key || "").trim(),
    title: String(item?.title || "").trim(),
    subtitle: String(item?.subtitle || "").trim(),
    to: String(item?.to || "").trim(),
    visited_at: String(item?.visited_at || nowIso()),
  };
}

export function getRecentHomeItems() {
  return safeRead()
    .map(normalizeItem)
    .filter((x) => x.kind && x.key && x.title && x.to)
    .sort((a, b) => String(b.visited_at).localeCompare(String(a.visited_at)));
}

export function pushRecentHomeItem(item) {
  const next = normalizeItem({
    ...item,
    visited_at: nowIso(),
  });

  if (!next.kind || !next.key || !next.title || !next.to) return;

  const items = safeRead()
    .map(normalizeItem)
    .filter((x) => !(x.kind === next.kind && x.key === next.key));

  items.unshift(next);
  safeWrite(items.slice(0, MAX_ITEMS));
}

export function clearRecentHomeItems() {
  safeWrite([]);
}