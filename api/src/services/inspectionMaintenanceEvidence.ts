type Candidate = {
  source: "FORM_RUNNER" | "ATTACHMENT";
  source_id: string;
  title: string;
  maintenance_date: string | Date | null;
  form_status?: string;
  finalized_at?: string | Date | null;
  open_count?: number;
  certificate_blocking_count?: number;
};

function dateOnly(value: Candidate["maintenance_date"]): string | null {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

// Kalenderjaar, niet 365 dagen. Op de verjaardag zelf is het nog niet ouder dan een jaar.
export function maintenanceEvidence(candidates: Candidate[], now = new Date()) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const dated = candidates.filter((candidate) => candidate.source !== "FORM_RUNNER" || candidate.form_status === "AFGEHANDELD")
    .map((candidate) => ({ ...candidate, maintenance_date: dateOnly(candidate.maintenance_date) }));
  const usable = dated.filter((candidate) => candidate.maintenance_date && candidate.maintenance_date <= today);
  usable.sort((a, b) => b.maintenance_date!.localeCompare(a.maintenance_date!) || a.source.localeCompare(b.source) || a.source_id.localeCompare(b.source_id));
  const latest = usable[0] || null;
  let olderThanYear = false;
  if (latest) {
    const [year, month, day] = latest.maintenance_date!.split("-").map(Number);
    const anniversary = new Date(Date.UTC(year + 1, month - 1, Math.min(day, new Date(Date.UTC(year + 1, month, 0)).getUTCDate()))).toISOString().slice(0, 10);
    olderThanYear = today > anniversary;
  }
  return {
    latest,
    certificate_assessment: latest?.source === "FORM_RUNNER" ? {
      label: latest.certificate_blocking_count == null ? "Certificaatresultaat onbekend" : Number(latest.certificate_blocking_count) > 0
        ? "Certificaatblokkerende punten aanwezig"
        : "Geen certificaatblokkerende punten geregistreerd",
      open_count: latest.open_count ?? null,
      certificate_blocking_count: latest.certificate_blocking_count ?? null,
      finalization_recorded: Boolean(latest.finalized_at),
      note: "Actuele actiepunten bij dit formulier; dit is geen bewijs dat een certificaat is afgegeven. Bekijk het definitieve rapport voor het ondertekende oordeel.",
    } : null,
    older_than_year: olderThanYear,
    undated_count: dated.filter((candidate) => !candidate.maintenance_date).length,
    future_dated_count: dated.filter((candidate) => candidate.maintenance_date && candidate.maintenance_date > today).length,
    same_date_count: latest ? usable.filter((candidate) => candidate.maintenance_date === latest.maintenance_date).length : 0,
    warning: olderThanYear ? "Het laatste onderhoudsdocument is ouder dan één jaar. Controleer of nieuw onderhoud is uitgevoerd." : null,
  };
}
