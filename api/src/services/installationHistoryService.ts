import { sqlQuery } from "../db/index.js";
import { getInstallationHistorySql } from "../db/queries/installationHistory.sql.js";

/* De Historie van een installatie.

   De bronnen leveren een gebeurteniscode; het scherm hoort een zin te tonen. Die vertaling
   staat hier en niet in de database, want een nieuwe formulering is dan geen migratie. Een
   onbekende code valt terug op de code zelf; dat is lelijk maar eerlijk, en beter dan een
   regel die stilletjes verdwijnt. */

const SOURCE_LABELS: Record<string, string> = {
  FORMULIER: "Formulier",
  ACTIEPUNT: "Actiepunt",
  TEKENING: "Tekening",
  CERTIFICAAT: "Certificaat",
  INSPECTIE: "Inspectie",
  LOGBOEK: "Digitaal Logboek",
};

const STATUS_LABELS: Record<string, string> = {
  CONCEPT: "concept",
  INGEDIEND: "ingediend",
  IN_BEHANDELING: "in behandeling",
  AFGEHANDELD: "definitief",
  INGETROKKEN: "ingetrokken",
};

function statusLabel(value: any) {
  const key = String(value || "").trim().toUpperCase();
  if (!key) return null;
  return STATUS_LABELS[key] || key.toLowerCase().replace(/_/g, " ");
}

/* Wat er gebeurde, in gewone taal. Per bron, want dezelfde code betekent elders iets anders. */
function describe(row: any): string {
  const source = String(row?.source || "").trim();
  const type = String(row?.event_type || "").trim().toUpperCase();
  const subject = String(row?.subject || "").trim();

  if (source === "FORMULIER") {
    const vorige = statusLabel(row?.previous_status);
    const volgende = statusLabel(row?.next_status);

    if (type === "OPGEPAKT") return `${subject} opgepakt`;
    if (type === "ASSIGNED") return `${subject} toegewezen`;
    if (type === "ASSIGNMENT_CLEARED") return `Toewijzing van ${subject.toLowerCase()} vrijgegeven`;
    if (type === "STATUS_CHANGED" && vorige && volgende) {
      return `${subject} van ${vorige} naar ${volgende}`;
    }
    if (type === "STATUS_CHANGED" && volgende) return `${subject} op ${volgende} gezet`;
    return `${subject}; ${type.toLowerCase().replace(/_/g, " ")}`;
  }

  if (source === "ACTIEPUNT") {
    const titel = subject || "actiepunt";
    if (type === "CREATED") return `Actiepunt aangemaakt; ${titel}`;
    if (type === "STATUS_CHANGED") return `Status van actiepunt gewijzigd; ${titel}`;
    if (type === "NOTE_UPDATED") return `Notitie bij actiepunt bijgewerkt; ${titel}`;
    if (type === "CERTIFICATE_IMPACT_CHANGED") return `Certificaatoordeel gewijzigd; ${titel}`;
    if (type === "CONTENT_UPDATED") return `Actiepunt bijgewerkt; ${titel}`;
    return `Actiepunt; ${type.toLowerCase().replace(/_/g, " ")}`;
  }

  if (source === "TEKENING") {
    const label = subject || "markering";
    if (type === "CREATED") return `Markering geplaatst; ${label}`;
    if (type === "UPDATED" || type === "MOVED") return `Markering gewijzigd; ${label}`;
    if (type === "DELETED") return `Markering verwijderd; ${label}`;
    if (type === "ACTION_LINKED") return `Markering aan een opvolgpunt gekoppeld; ${label}`;
    if (type === "ACTION_UNLINKED") return `Koppeling met een opvolgpunt verbroken; ${label}`;
    return `Tekening; ${type.toLowerCase().replace(/_/g, " ")}`;
  }

  if (source === "CERTIFICAAT") {
    const soort = subject === "INSPECTION" ? "inspectiecertificaat" : subject === "MAINTENANCE" ? "onderhoudscertificaat" : "certificaat";
    if (type === "CREATED" || type === "UPLOADED") return `${soort} toegevoegd`;
    if (type === "VERIFIED") return `${soort} geverifieerd`;
    if (type === "REPLACED") return `${soort} vervangen`;
    if (type === "WITHDRAWN" || type === "ARCHIVED") return `${soort} ingetrokken`;
    return `${soort}; ${type.toLowerCase().replace(/_/g, " ")}`;
  }

  if (source === "INSPECTIE") {
    const inspectie: Record<string, string> = {
      CASE_CREATED: "Inspectiedossier aangemaakt",
      CASE_COMPLETED: "Inspectiedossier afgerond",
      CASE_CANCELLED: "Inspectiedossier geannuleerd",
      CANCELLED: "Inspectiedossier geannuleerd",
      STATUS_CHANGED: "Status van het inspectiedossier gewijzigd",
      CHECKLIST_CHANGED: "Checklist van het inspectiedossier bijgewerkt",
      DOCUMENT_LINKED: "Document aan het inspectiedossier gekoppeld",
      DOCUMENT_PACKAGE_PREPARED: "Documentpakket voor de inspecteur klaargezet",
      DOCUMENT_PACKAGE_SENT: "Documentpakket naar de inspecteur verstuurd",
      REPORT_RECEIVED: "Inspectierapport ontvangen",
      CONCLUSION_PASS: "Inspectie goedgekeurd",
      CONCLUSION_FAIL: "Inspectie afgekeurd",
      PASS: "Inspectie goedgekeurd",
      REINSPECTION_CREATED: "Herinspectie aangemaakt",
      REPAIR_ACTION_CREATED: "Herstelactie aangemaakt",
      ASSIGNMENT_CHANGED: "Behandelaar van het inspectiedossier gewijzigd",
      INSPECTION_BODY_CHANGED: "Keuringsinstantie gewijzigd",
      DUE_DATE_CHANGED: "Inspectiedatum gewijzigd",
      WORK_ORDER_REFRESHED: "Werkbonnen opnieuw opgehaald",
      NO_PLANNING: "Geen planning voor deze inspectie",
    };

    return inspectie[type] || `Inspectiedossier; ${type.toLowerCase().replace(/_/g, " ")}`;
  }

  if (source === "LOGBOEK") {
    if (type.startsWith("SYNC_")) {
      const status = type.slice(5).toLowerCase();
      if (status === "completed") return "Synchronisatie met het Digitaal Logboek afgerond";
      if (status === "failed") return "Synchronisatie met het Digitaal Logboek mislukt";
      return `Synchronisatie met het Digitaal Logboek; ${status}`;
    }
    return "Digitaal Logboek";
  }

  return type ? type.toLowerCase().replace(/_/g, " ") : "Onbekende handeling";
}

/* Een korte toelichting onder de zin, als de bron er een heeft. Ruwe json hoort niet op het
   scherm; alleen wat een mens iets zegt. */
function detailLabel(row: any): string | null {
  const raw = row?.detail_json;
  if (raw == null || raw === "") return null;

  let parsed: any = null;
  try {
    parsed = typeof raw === "object" ? raw : JSON.parse(String(raw));
  } catch {
    // Geen json maar een vrije reden, bijvoorbeeld bij een certificaat of een inspectie.
    const text = String(raw).trim();
    return text.length > 200 ? `${text.slice(0, 197)}...` : text || null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  if (typeof parsed.geimporteerd === "number") {
    return `${parsed.geimporteerd} geïmporteerd, ${parsed.overgeslagen ?? 0} overgeslagen, ${parsed.mislukt ?? 0} mislukt`;
  }

  if (parsed.toegewezen_aan) return `Aan ${parsed.toegewezen_aan}`;
  if (parsed.bron === "openen") return "Bij het openen";

  return null;
}

function normalizeSources(raw: any): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const known = new Set(Object.keys(SOURCE_LABELS));
  return Array.from(
    new Set(
      list
        .map((value) => String(value ?? "").trim().toUpperCase())
        .filter((value) => known.has(value))
    )
  );
}

export async function getInstallationHistory(code: string, query: any = {}) {
  const installationCode = String(code || "").trim();
  if (!installationCode) return { error: "not found" };

  const includeSystem =
    ["1", "true", "ja", "yes"].includes(String(query?.includeSystem ?? "").trim().toLowerCase());
  const sources = normalizeSources(query?.sources);

  const rows = await sqlQuery(getInstallationHistorySql, {
    installationCode,
    includeSystem: includeSystem ? 1 : 0,
    take: 500,
  });

  const items = (rows || [])
    .filter((row: any) => !sources.length || sources.includes(String(row.source || "")))
    .map((row: any) => ({
      id: String(row.id),
      source: row.source,
      source_label: SOURCE_LABELS[String(row.source || "")] || row.source,
      occurred_at: row.occurred_at,
      event_type: row.event_type,
      what: describe(row),
      detail_label: detailLabel(row),
      actor_user_object_id: row.actor_user_object_id ?? null,
      actor_name: row.actor_name ?? row.actor_fallback ?? null,
      actor_email: row.actor_email ?? null,
      is_system: row.is_system === true || Number(row.is_system) === 1,
    }));

  // Tellingen over alles wat binnenkwam, zodat de filterknoppen niet leeglopen zodra er een
  // filter aanstaat.
  const counts: Record<string, number> = {};
  for (const row of rows || []) {
    const key = String((row as any).source || "");
    counts[key] = (counts[key] || 0) + 1;
  }

  return {
    items,
    sources: Object.entries(SOURCE_LABELS).map(([key, label]) => ({
      key,
      label,
      count: counts[key] || 0,
    })),
  };
}
