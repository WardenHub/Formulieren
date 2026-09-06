// Gedeelde begrippen voor de Actiepunten-tab. Alles wat hier staat is puur; de tab en de
// kaart delen dezelfde definities zodat een filter, een teller en een label niet uit elkaar
// kunnen lopen.

export const PRIORITIES = [
  { value: "LOW", label: "Laag" },
  { value: "NORMAL", label: "Normaal" },
  { value: "HIGH", label: "Hoog" },
  { value: "CRITICAL", label: "Kritiek" },
];

export const PRIORITY_LABELS = Object.fromEntries(PRIORITIES.map((item) => [item.value, item.label]));

export const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export const RESPONSIBILITIES = [
  { value: "INTERN", label: "Ons bedrijf" },
  { value: "KLANT", label: "Klant" },
  { value: "DERDE", label: "Derde partij" },
  { value: "ONBEPAALD", label: "Nog te bepalen" },
];

export const RESPONSIBILITY_LABELS = Object.fromEntries(
  RESPONSIBILITIES.map((item) => [item.value, item.label])
);

export const SOURCE_LABELS = {
  FORM: "Formulier",
  MANUAL: "Handmatig",
  INSPECTION_CASE: "Inspectie",
  IMPORT: "Import",
};

export const TERMINAL_STATUSES = ["AFGEHANDELD", "VERVALLEN", "AFGEWEZEN", "INFORMATIEF"];
export const OPEN_STATUSES = ["OPEN", "PLANNING_NODIG", "WACHTENOPDERDEN"];

export const ATRIUM_CONTEXT_LABELS = {
  RELATION: "Relatie",
  PROJECT: "Project",
  WORK_ORDER: "Werkbon",
  EMPLOYEE: "Medewerker",
};

export const EVENT_LABELS = {
  CREATED: "Actiepunt aangemaakt",
  UPDATED: "Gegevens gewijzigd",
  STATUS_CHANGED: "Status gewijzigd",
  CLOSED: "Actiepunt gesloten",
  REOPENED: "Actiepunt heropend",
  NOTE_CHANGED: "Notitie gewijzigd",
  CERTIFICATE_IMPACT_CHANGED: "Certificaatimpact gewijzigd",
  ATTACHMENT_ADDED: "Bijlage toegevoegd",
  ATTACHMENT_REMOVED: "Bijlage verwijderd",
  PIN_LINKED: "Aan markering gekoppeld",
  PIN_UNLINKED: "Van markering losgekoppeld",
  REVIEWED: "Beoordeeld",
};

export function eventLabel(event) {
  const type = String(event?.event_type || "").trim().toUpperCase();
  return EVENT_LABELS[type] || type.replace(/_/g, " ").toLowerCase() || "Gebeurtenis";
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(String(status || "").trim().toUpperCase());
}

export function isOpenStatus(status) {
  return OPEN_STATUSES.includes(String(status || "").trim().toUpperCase());
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// Een deadline in het verleden telt alleen als te laat zolang het punt nog loopt; een
// afgehandeld punt met een oude deadline is geen werkvoorraad meer.
export function isOverdue(item) {
  if (!item?.due_date) return false;
  if (isTerminalStatus(item.status)) return false;
  return String(item.due_date).slice(0, 10) < todayIso();
}

export function daysUntilDue(item) {
  if (!item?.due_date) return null;
  const due = new Date(`${String(item.due_date).slice(0, 10)}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function dueLabel(item) {
  if (!item?.due_date) return "Geen deadline";

  const date = String(item.due_date).slice(0, 10);
  if (isTerminalStatus(item.status)) return `Deadline ${date}`;

  const days = daysUntilDue(item);
  if (days == null) return `Deadline ${date}`;
  if (days < 0) return `${Math.abs(days)} dag${Math.abs(days) === 1 ? "" : "en"} te laat; ${date}`;
  if (days === 0) return `Vandaag; ${date}`;
  if (days === 1) return `Morgen; ${date}`;
  return `Over ${days} dagen; ${date}`;
}

export function hasLocation(item) {
  return Boolean((item?.drawing_pins || []).length);
}

function isImage(file) {
  return String(file?.mime_type || "").toLowerCase().startsWith("image/");
}

export function photoAttachments(item) {
  return (item?.attachments || []).filter(isImage);
}

export function otherAttachments(item) {
  return (item?.attachments || []).filter((file) => !isImage(file));
}

export function sourceLabel(item) {
  const type = String(item?.source_type || "").trim().toUpperCase();
  if (type === "FORM") return item?.form_title || "Formulier";
  if (type === "INSPECTION_CASE") {
    return item?.inspection_type ? `Inspectie ${item.inspection_type}` : "Inspectie";
  }
  return SOURCE_LABELS[type] || type || "Onbekende bron";
}

export function certificateImpactValue(item) {
  const override = String(item?.certificate_impact_override || "").trim().toLowerCase();
  if (override === "yes" || override === "no") return override;

  const impact = String(item?.certificate_impact || "").trim().toLowerCase();
  return impact === "yes" || impact === "no" ? impact : null;
}

export function categoryTags(item) {
  return String(item?.category || "")
    .split(/[,;|]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export const EMPTY_FILTERS = {
  search: "",
  status: "ALL",
  priority: "ALL",
  responsibility: "ALL",
  source: "ALL",
  location: "ALL",
  overdueOnly: false,
  certificateOnly: false,
};

// Zoeken gaat over alles wat een monteur of coordinator zou intypen; titel, omschrijving,
// het puntnummer uit het formulier, de tags, de toegewezen persoon en de bron.
function searchHaystack(item) {
  return [
    item.workflow_title,
    item.workflow_description,
    item.source_item_code,
    item.source_question_name,
    item.category,
    item.assigned_to,
    item.note,
    item.resolution_note,
    sourceLabel(item),
    ...(item.drawing_pins || []).map((pin) => `${pin.pin_label || ""} ${pin.drawing_title || ""}`),
    ...(item.atrium_contexts || []).map(
      (context) => context.context_display_snapshot || context.context_key
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesFilters(item, filters) {
  const search = String(filters.search || "").trim().toLowerCase();
  if (search && !searchHaystack(item).includes(search)) return false;

  if (filters.status !== "ALL" && String(item.status || "").toUpperCase() !== filters.status) return false;
  if (filters.priority !== "ALL" && String(item.priority || "").toUpperCase() !== filters.priority) {
    return false;
  }
  if (
    filters.responsibility !== "ALL" &&
    String(item.responsibility_type || "").toUpperCase() !== filters.responsibility
  ) {
    return false;
  }
  if (filters.source !== "ALL" && String(item.source_type || "").toUpperCase() !== filters.source) {
    return false;
  }

  if (filters.location === "WITH" && !hasLocation(item)) return false;
  if (filters.location === "WITHOUT" && hasLocation(item)) return false;
  if (filters.overdueOnly && !isOverdue(item)) return false;
  if (filters.certificateOnly && certificateImpactValue(item) !== "yes") return false;

  return true;
}

export function hasActiveFilters(filters) {
  return (
    String(filters.search || "").trim().length > 0 ||
    filters.status !== "ALL" ||
    filters.priority !== "ALL" ||
    filters.responsibility !== "ALL" ||
    filters.source !== "ALL" ||
    filters.location !== "ALL" ||
    filters.overdueOnly ||
    filters.certificateOnly
  );
}

export const SORT_OPTIONS = [
  { value: "PRIORITY", label: "Prioriteit en deadline" },
  { value: "DUE", label: "Deadline" },
  { value: "UPDATED", label: "Laatst gewijzigd" },
  { value: "SOURCE", label: "Bron en puntnummer" },
];

function timeValue(value) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dueSortKey(item) {
  return item.due_date ? String(item.due_date).slice(0, 10) : "9999-99-99";
}

export function sortActionPoints(items, sortKey) {
  const list = [...items];

  if (sortKey === "DUE") {
    return list.sort((left, right) => {
      if (dueSortKey(left) !== dueSortKey(right)) return dueSortKey(left) < dueSortKey(right) ? -1 : 1;
      return timeValue(right.updated_at || right.created_at) - timeValue(left.updated_at || left.created_at);
    });
  }

  if (sortKey === "UPDATED") {
    return list.sort(
      (left, right) =>
        timeValue(right.updated_at || right.created_at) - timeValue(left.updated_at || left.created_at)
    );
  }

  if (sortKey === "SOURCE") {
    return list.sort((left, right) => {
      const leftSource = sourceLabel(left).toLowerCase();
      const rightSource = sourceLabel(right).toLowerCase();
      if (leftSource !== rightSource) return leftSource < rightSource ? -1 : 1;
      return String(left.source_item_code || "").localeCompare(
        String(right.source_item_code || ""),
        "nl",
        { numeric: true }
      );
    });
  }

  return list.sort((left, right) => {
    const leftOverdue = isOverdue(left) ? 0 : 1;
    const rightOverdue = isOverdue(right) ? 0 : 1;
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;

    const leftPriority = PRIORITY_ORDER[String(left.priority || "NORMAL").toUpperCase()] ?? 2;
    const rightPriority = PRIORITY_ORDER[String(right.priority || "NORMAL").toUpperCase()] ?? 2;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    if (dueSortKey(left) !== dueSortKey(right)) return dueSortKey(left) < dueSortKey(right) ? -1 : 1;

    return timeValue(right.updated_at || right.created_at) - timeValue(left.updated_at || left.created_at);
  });
}

export const GROUP_OPTIONS = [
  { value: "SOURCE", label: "Per bron" },
  { value: "STATUS", label: "Per status" },
  { value: "RESPONSIBILITY", label: "Per verantwoordelijke" },
  { value: "NONE", label: "Geen groepering" },
];

// Groepeert zonder opnieuw te sorteren; binnen een groep blijft de sorteervolgorde staan die
// de tab al heeft bepaald, en de groepen volgen de volgorde waarin ze voorkomen.
export function groupActionPoints(items, groupKey, statusDisplayName) {
  if (groupKey === "NONE") {
    return [{ key: "ALL", label: "", items }];
  }

  const groups = new Map();

  for (const item of items) {
    let key = "";
    let label = "";

    if (groupKey === "STATUS") {
      key = String(item.status || "OPEN").toUpperCase();
      label = statusDisplayName(key);
    } else if (groupKey === "RESPONSIBILITY") {
      key = String(item.responsibility_type || "INTERN").toUpperCase();
      label = RESPONSIBILITY_LABELS[key] || key;
    } else if (item.form_instance_id) {
      key = `FORM:${item.form_instance_id}`;
      label = `${sourceLabel(item)} #${item.instance_number ?? item.form_instance_id}`;
    } else if (item.inspection_case_id) {
      key = `INSPECTION:${item.inspection_case_id}`;
      label = sourceLabel(item);
    } else {
      key = `SOURCE:${String(item.source_type || "MANUAL").toUpperCase()}`;
      label = sourceLabel(item);
    }

    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(item);
  }

  return [...groups.values()];
}

export function summarize(items) {
  return {
    total: items.length,
    open: items.filter((item) => isOpenStatus(item.status)).length,
    overdue: items.filter(isOverdue).length,
    planned: items.filter((item) => String(item.status || "").toUpperCase() === "GEPLAND").length,
    waiting: items.filter((item) => String(item.status || "").toUpperCase() === "WACHTENOPDERDEN").length,
    critical: items.filter(
      (item) =>
        !isTerminalStatus(item.status) &&
        ["CRITICAL", "HIGH"].includes(String(item.priority || "").toUpperCase())
    ).length,
    certificate: items.filter(
      (item) => !isTerminalStatus(item.status) && certificateImpactValue(item) === "yes"
    ).length,
    withoutLocation: items.filter((item) => !isTerminalStatus(item.status) && !hasLocation(item)).length,
    done: items.filter((item) => String(item.status || "").toUpperCase() === "AFGEHANDELD").length,
  };
}
