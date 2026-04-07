export const OVERVIEW_LS_KEY = "forms-monitor-overview-state-v5";
export const DETAIL_UI_LS_KEY = "forms-monitor-detail-ui-state-v5";
export const DETAIL_NOTES_LS_KEY = "forms-monitor-detail-notes-v5";

export const AUTO_REFRESH_MS = 30000;
export const COPY_FEEDBACK_MS = 1500;

export const STATUS_FILTER_OPTIONS = [
  { key: "INGEDIEND", label: "Ingediend" },
  { key: "IN_BEHANDELING", label: "In behandeling" },
  { key: "AFGEHANDELD", label: "Definitief" },
  { key: "CONCEPT", label: "Concept" },
  { key: "INGETROKKEN", label: "Ingetrokken" },
];

export const DEFAULT_SELECTED_STATUSES = ["INGEDIEND", "IN_BEHANDELING"];

export const FOLLOW_UP_STATUS_ORDER = [
  "OPEN",
  "WACHTENOPDERDEN",
  "AFGEHANDELD",
  "AFGEWEZEN",
  "VERVALLEN",
  "INFORMATIEF",
];

export function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("nl-NL");
}

export function statusLabel(status) {
  if (status === "CONCEPT") return "Concept";
  if (status === "INGEDIEND") return "Ingediend";
  if (status === "IN_BEHANDELING") return "In behandeling";
  if (status === "AFGEHANDELD") return "Definitief";
  if (status === "INGETROKKEN") return "Ingetrokken";
  if (status === "OPEN") return "Open";
  if (status === "WACHTENOPDERDEN") return "Wachten op derden";
  if (status === "AFGEWEZEN") return "Afgewezen";
  if (status === "VERVALLEN") return "Vervallen";
  if (status === "INFORMATIEF") return "Informatief";
  return status || "Onbekend";
}

export function getStatusTone(status) {
  if (status === "IN_BEHANDELING") return "active";
  if (status === "INGEDIEND") return "neutral";
  if (status === "AFGEHANDELD") return "success";
  if (status === "INGETROKKEN") return "muted";
  if (status === "CONCEPT") return "muted";
  if (status === "OPEN") return "active";
  if (status === "WACHTENOPDERDEN") return "warning";
  if (status === "AFGEWEZEN") return "danger";
  if (status === "VERVALLEN") return "muted";
  if (status === "INFORMATIEF") return "neutral";
  return "neutral";
}

export function getToneClass(tone) {
  if (tone === "active") return "monitor-tag monitor-tag--active";
  if (tone === "neutral") return "monitor-tag monitor-tag--neutral";
  if (tone === "success") return "monitor-tag monitor-tag--success";
  if (tone === "warning") return "monitor-tag monitor-tag--warning";
  if (tone === "danger") return "monitor-tag monitor-tag--danger";
  return "monitor-tag monitor-tag--muted";
}

export function getCardToneClass(status) {
  const tone = getStatusTone(status);
  if (tone === "active") return "monitor-surface monitor-surface--active";
  if (tone === "neutral") return "monitor-surface monitor-surface--neutral";
  if (tone === "success") return "monitor-surface monitor-surface--success";
  if (tone === "warning") return "monitor-surface monitor-surface--warning";
  if (tone === "danger") return "monitor-surface monitor-surface--danger";
  return "monitor-surface monitor-surface--muted";
}

export function getFollowUpCardClass(status) {
  const tone = getStatusTone(status);
  if (tone === "active") return "monitor-followup-card monitor-followup-card--active";
  if (tone === "neutral") return "monitor-followup-card monitor-followup-card--neutral";
  if (tone === "success") return "monitor-followup-card monitor-followup-card--success";
  if (tone === "warning") return "monitor-followup-card monitor-followup-card--warning";
  if (tone === "danger") return "monitor-followup-card monitor-followup-card--danger";
  return "monitor-followup-card monitor-followup-card--muted";
}

export function getLastModifiedBy(source) {
  if (!source) return "-";
  return (
    source.updated_by ||
    source.last_modified_by ||
    source.modified_by ||
    source.submitted_by ||
    source.created_by ||
    "-"
  );
}

export function compactInstallationLine(item) {
  const code = item?.installatie_code || item?.atrium_installation_code || "";
  const name = item?.installatie_naam || "";
  return [code, name].filter(Boolean).join(" ");
}

export function buildClipboardText({ detailItem, row }) {
  const vraagNummer =
    row?.source_item_code ||
    (row?.source_row_index != null ? String(row.source_row_index) : null) ||
    "onbekend";

  const formTitel = detailItem?.form_name || detailItem?.form_code || "formulier";
  const invuller = detailItem?.created_by || detailItem?.submitted_by || "onbekend";
  const categorie = row?.category || "-";
  const omschrijving = row?.workflow_title || "Actiepunt";
  const toelichting = row?.workflow_description || "-";

  const installatieBits = [
    detailItem?.installatie_code || detailItem?.atrium_installation_code || "",
    detailItem?.installatie_naam || "",
    detailItem?.object_code || "",
    detailItem?.obj_naam || "",
    detailItem?.gebruiker_code || "",
    detailItem?.gebruiker_naam || "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    `Actiepunt vanuit formulier ${formTitel}; vraag ${vraagNummer}; beoordeeld door ${invuller}.`,
    `Type; ${categorie}`,
    `Omschrijving; ${omschrijving}`,
    `Toelichting formulier; ${toelichting}`,
    `Installatie; ${installatieBits || "-"}`,
  ].join("\n");
}

export function normalizeNoteValue(value) {
  if (value == null) return "";
  return String(value);
}

export function buildRelationRows(item) {
  if (!item) return [];

  const rows = [];

  const installatieValue = [item.installatie_code || item.atrium_installation_code, item.installatie_naam]
    .filter(Boolean)
    .join(" ");
  if (installatieValue) rows.push({ label: "Installatie", value: installatieValue });

  const objectValue = [item.object_code, item.obj_naam].filter(Boolean).join(" ");
  if (objectValue) rows.push({ label: "Object", value: objectValue });

  const gebruikerValue = [item.gebruiker_code, item.gebruiker_naam].filter(Boolean).join(" ");
  if (gebruikerValue) rows.push({ label: "Gebruiker", value: gebruikerValue });

  const beheerderValue = [item.beheerder_code, item.beheerder_naam].filter(Boolean).join(" ");
  if (beheerderValue) rows.push({ label: "Beheerder", value: beheerderValue });

  const eigenaarValue = [item.eigenaar_code, item.eigenaar_naam].filter(Boolean).join(" ");
  if (eigenaarValue) rows.push({ label: "Eigenaar", value: eigenaarValue });

  return rows;
}

export function groupFollowUpsByStatus(rows) {
  const map = new Map();

  for (const status of FOLLOW_UP_STATUS_ORDER) {
    map.set(status, []);
  }

  for (const row of rows || []) {
    const status = String(row?.status || "").trim() || "OPEN";
    if (!map.has(status)) map.set(status, []);
    map.get(status).push(row);
  }

  return Array.from(map.entries()).map(([status, items]) => ({
    status,
    label: statusLabel(status),
    tone: getStatusTone(status),
    items,
    count: items.length,
  }));
}

export function buildFollowUpStatusCounts(rows) {
  const counts = {
    total: 0,
    OPEN: 0,
    WACHTENOPDERDEN: 0,
    AFGEHANDELD: 0,
    AFGEWEZEN: 0,
    VERVALLEN: 0,
    INFORMATIEF: 0,
  };

  for (const row of rows || []) {
    const status = String(row?.status || "").trim();
    counts.total += 1;
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }

  return counts;
}

export function buildMonitorRowActionCounts(row) {
  const open = Number(row?.follow_up_counts?.open_count ?? 0);
  const waiting = Number(row?.follow_up_counts?.waiting_count ?? 0);
  const done =
    Number(row?.follow_up_counts?.done_count ?? 0) +
    Number(row?.follow_up_counts?.rejected_count ?? 0) +
    Number(row?.follow_up_counts?.expired_count ?? 0);

  return { open, waiting, done };
}

export function buildMonitorVisibleTotals(rows) {
  const totals = {
    open: 0,
    waiting: 0,
    done: 0,
  };

  for (const row of rows || []) {
    const counts = buildMonitorRowActionCounts(row);
    totals.open += counts.open;
    totals.waiting += counts.waiting;
    totals.done += counts.done;
  }

  return totals;
}

export function getRemainingOpenActionCount(row) {
  const open = Number(row?.follow_up_counts?.open_count ?? row?.follow_up_summary?.open_count ?? 0);
  const waiting = Number(row?.follow_up_counts?.waiting_count ?? 0);
  return open + waiting;
}

export function matchesNoRemainingOpenActionPoints(row) {
  const status = String(row?.status || "").trim();
  return (status === "INGEDIEND" || status === "IN_BEHANDELING") && getRemainingOpenActionCount(row) === 0;
}

export function rowHasMonitorActionFilter(row, actionFilterKey) {
  const counts = buildMonitorRowActionCounts(row);
  if (actionFilterKey === "OPEN") return counts.open > 0;
  if (actionFilterKey === "WACHTENOPDERDEN") return counts.waiting > 0;
  if (actionFilterKey === "DONE") return counts.done > 0;
  return true;
}

export function getMonitorRowSurfaceClass(row) {
  if (matchesNoRemainingOpenActionPoints(row)) {
    return "monitor-surface monitor-surface--ready";
  }
  return getCardToneClass(row?.status);
}

export function readStateFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveStateToStorage(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore
  }
}