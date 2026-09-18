// Wie deed wat, wanneer.
//
// De database legt bij elke mutatie de hele inspectiecase vast in before_json en
// after_json. Dat is bruikbaar bewijs maar onleesbaar; hier vertalen we het naar
// gewone zinnen plus de velden die werkelijk veranderden. Puur, dus testbaar.

import { INSPECTION_STATUS_LABELS, INSPECTION_APPOINTMENT_LABELS } from "./inspectionJourney.js";

export const INSPECTION_EVENT_LABELS = {
  CASE_CREATED: "Dossier aangemaakt",
  STATUS_CHANGED: "Status gewijzigd",
  DUE_DATE_CHANGED: "Vervaldatum gewijzigd",
  INSPECTION_BODY_CHANGED: "Keuringsinstantie gewijzigd",
  ASSIGNMENT_CHANGED: "Toewijzing gewijzigd",
  WORK_ORDER_LINKED: "Werkbon gekoppeld",
  WORK_ORDER_REFRESHED: "Werkbon live opgehaald",
  APPOINTMENT_STATUS_CHANGED: "Afspraakstatus gewijzigd",
  CHECKLIST_CHANGED: "Voorbereidingschecklist bijgewerkt",
  DOCUMENT_LINKED: "Document gekoppeld",
  DOCUMENT_PACKAGE_PREPARED: "Documentpakket voorbereid",
  DOCUMENT_PACKAGE_SENT: "Documentpakket verzonden",
  REPORT_RECEIVED: "Inspectierapport geregistreerd",
  CONCLUSION_PASS: "Goedgekeurd vastgelegd",
  CONCLUSION_FAIL: "Tekortkomingen vastgelegd",
  REPAIR_ACTION_CREATED: "Herstelactie aangemaakt",
  REINSPECTION_CREATED: "Herinspectie aangemaakt",
  CERTIFICATE_RECEIVED: "Certificaat verwerkt",
  CASE_COMPLETED: "Dossier afgerond",
  CASE_CANCELLED: "Dossier geannuleerd",
};

// Alleen velden waar een wijziging iets betekent voor het traject. De rest van de
// momentopname laten we bewust weg; anders verdrinkt de lezer in ruis.
const TRACKED_FIELDS = [
  { key: "status", label: "Status", format: (value) => INSPECTION_STATUS_LABELS[value] || value },
  { key: "due_date", label: "Vervaldatum", format: formatDate },
  { key: "planned_date", label: "Inspectiedatum", format: formatDate },
  { key: "execution_date", label: "Uitgevoerd op", format: formatDate },
  { key: "inspection_body", label: "Keuringsinstantie" },
  { key: "atrium_work_order_code", label: "Werkbon" },
  { key: "appointment_status", label: "Afspraakstatus", format: (value) => INSPECTION_APPOINTMENT_LABELS[value] || value },
  { key: "conclusion", label: "Conclusie", format: (value) => ({ PASS: "Goedgekeurd", FAIL: "Tekortkomingen", PENDING: "Nog te beoordelen" }[value] || value) },
  { key: "assigned_user_id", label: "Toegewezen aan" },
  { key: "assigned_role_code", label: "Toegewezen rol" },
  { key: "reinspection_required", label: "Herinspectie nodig", format: formatBoolean },
  { key: "logbook_linked", label: "Digitaal logboek gekoppeld", format: formatBoolean },
  { key: "inspection_body_has_logbook_access", label: "Keuringsinstantie heeft logboektoegang", format: formatBoolean },
  { key: "document_package_available_in_logbook", label: "Documentpakket in logboek", format: formatBoolean },
  { key: "report_uploaded_to_logbook", label: "Rapport in logboek", format: formatBoolean },
];

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

function formatBoolean(value) {
  if (value === true || value === 1) return "ja";
  if (value === false || value === 0) return "nee";
  return "";
}

function snapshot(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return Array.isArray(raw) ? raw[0] || null : raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed[0] || null : parsed;
  } catch {
    // Onleesbare historie is geen bewijs; we tonen dan alleen de gebeurtenis zelf.
    return null;
  }
}

function present(value, format) {
  if (value === null || value === undefined || value === "") return "leeg";
  const shown = format ? format(value) : String(value);
  return shown === "" ? "leeg" : shown;
}

/** Welke gevolgde velden verschillen tussen de twee momentopnamen. */
export function inspectionEventChanges(event) {
  const before = snapshot(event?.before_json ?? event?.before);
  const after = snapshot(event?.after_json ?? event?.after);
  if (!before || !after) return [];
  const changes = [];
  for (const field of TRACKED_FIELDS) {
    const from = before[field.key] ?? null;
    const to = after[field.key] ?? null;
    if (String(from ?? "") === String(to ?? "")) continue;
    changes.push({
      field: field.key,
      label: field.label,
      from: present(from, field.format),
      to: present(to, field.format),
    });
  }
  return changes;
}

/** Eén regel in de tijdlijn; wie, wanneer, wat en wat er precies veranderde. */
export function inspectionAuditEntry(event) {
  const moment = event?.event_at ? new Date(String(event.event_at)) : null;
  return {
    id: event?.inspection_case_event_id || `${event?.event_type}:${event?.event_at}`,
    at: moment && !Number.isNaN(moment.getTime())
      ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(moment)
      : String(event?.event_at || ""),
    by: String(event?.event_by || "").trim() || "Ember zelf",
    what: INSPECTION_EVENT_LABELS[event?.event_type] || String(event?.event_type || "").replaceAll("_", " "),
    changes: inspectionEventChanges(event),
  };
}

/** De hele tijdlijn, nieuwste eerst; de API levert al in die volgorde. */
export function inspectionAuditTrail(events) {
  return (Array.isArray(events) ? events : []).map(inspectionAuditEntry);
}
