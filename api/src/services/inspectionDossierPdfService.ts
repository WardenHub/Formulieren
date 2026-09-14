import { renderHtmlToPdf } from "./formReportHtmlRendererService.js";
import { getInspectionCase, getInspectionCaseEvents } from "./inspectionService.js";

// Het dossier als pdf. Alles komt uit de opgeslagen inspectiegegevens; er wordt
// hier niets afgeleid of aangevuld. Wat niet is vastgelegd blijft leeg.

const STATUS_LABELS: Record<string, string> = {
  ATTENTION_REQUIRED: "Aandacht nodig", OFFER_REQUIRED: "Offerte nodig", ORDERED: "Opdracht ontvangen",
  PLANNING_REQUIRED: "Planning nodig", PLANNED_UNCONFIRMED: "Gepland; onbevestigd",
  PLANNED_CONFIRMED: "Gepland; bevestigd", EXECUTED_AWAITING_REPORT: "Uitgevoerd; rapport verwacht",
  REPORT_RECEIVED: "Rapport beoordelen", REPAIR_REQUIRED: "Herstel nodig",
  REINSPECTION_REQUIRED: "Herinspectie nodig", CERTIFICATE_RECEIVED: "Administratief afronden",
  COMPLETED: "Afgerond", CANCELLED: "Geannuleerd",
};

const CHECKLIST_LABELS: Record<string, string> = {
  CURRENT_DRAWINGS: "Actuele tekeningen", LAST_MAINTENANCE_REPORT: "Laatste onderhoudsrapport",
  MAINTENANCE_CERTIFICATE: "Onderhoudscertificaat", PROGRAM_OF_REQUIREMENTS: "Programma van Eisen",
  CURRENT_INSPECTION_CERTIFICATE: "Huidig inspectiecertificaat", NOTICE_OF_ADDITION: "Nota van Aanvulling",
  OTHER_INSPECTION_DOCUMENT: "Overig inspectiedocument", RELEVANT_INSPECTION_REPORT: "Relevant inspectierapport",
};

const CHECKLIST_STATUS_LABELS: Record<string, string> = {
  MISSING: "Ontbreekt", AVAILABLE: "Beschikbaar", CHECKED: "Gecontroleerd",
  SENT: "Verzonden", WAIVED: "Niet van toepassing",
};

const CONCLUSION_LABELS: Record<string, string> = { PASS: "Goedgekeurd", FAIL: "Tekortkomingen", PENDING: "Nog te beoordelen" };
const TYPE_LABELS: Record<string, string> = { INITIAL: "Eerste inspectie", FOLLOW_UP: "Vervolg", REINSPECTION: "Herinspectie" };
const REQUIREMENT_LABELS: Record<string, string> = { REQUIRED: "Vereist", NOT_REQUIRED: "Niet vereist", UNKNOWN: "Onbekend" };
const PACKAGE_STATUS_LABELS: Record<string, string> = { DRAFT: "Concept", SENT: "Verzonden", CANCELLED: "Geannuleerd" };
const RESPONSIBILITY_LABELS: Record<string, string> = { INTERN: "Intern", KLANT: "Klant", INSPECTIE_INSTELLING: "Keuringsinstantie", DERDE: "Derde partij" };
const EVENT_LABELS: Record<string, string> = {
  CASE_CREATED: "Dossier aangemaakt", STATUS_CHANGED: "Status gewijzigd", DUE_DATE_CHANGED: "Vervaldatum gewijzigd",
  INSPECTION_BODY_CHANGED: "Keuringsinstantie gewijzigd", WORK_ORDER_REFRESHED: "Werkbon ververst",
  CHECKLIST_CHANGED: "Checklist bijgewerkt", DOCUMENT_PACKAGE_PREPARED: "Documentpakket voorbereid",
  DOCUMENT_PACKAGE_SENT: "Documentpakket verzonden", REPORT_RECEIVED: "Inspectierapport geregistreerd",
  CONCLUSION_PASS: "Goedgekeurd", CONCLUSION_FAIL: "Tekortkomingen vastgelegd",
  REPAIR_ACTION_CREATED: "Herstelactie aangemaakt", REINSPECTION_CREATED: "Herinspectie aangemaakt",
  CASE_COMPLETED: "Dossier afgerond", CASE_CANCELLED: "Dossier geannuleerd", ASSIGNMENT_CHANGED: "Toewijzing gewijzigd",
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] as string
  ));
}

function formatDate(value: unknown) {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

function formatDateTime(value: unknown) {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function facts(rows: Array<[string, unknown]>) {
  const filled = rows.map(([label, value]) => `
    <div class="fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value) || "<span class=\"empty\">Niet vastgelegd</span>"}</dd></div>
  `);
  return `<dl class="facts">${filled.join("")}</dl>`;
}

function table(caption: string, headers: string[], rows: string[][], emptyText: string) {
  if (!rows.length) return `<section class="block"><h2>${escapeHtml(caption)}</h2><p class="empty">${escapeHtml(emptyText)}</p></section>`;
  return `
    <section class="block">
      <h2>${escapeHtml(caption)}</h2>
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </section>
  `;
}

export function buildInspectionDossierHtml(detail: any, events: any[], exportedAt: Date) {
  const item = detail.case;
  const scopes = (detail.scopes || []).map((scope: any) => String(scope.scope).replace("_", "-")).join(", ");
  const requirements = (detail.certification_requirements || [])
    .map((row: any) => `${String(row.scope).replace("_", "-")}: ${REQUIREMENT_LABELS[row.requirement_status] || row.requirement_status}`)
    .join("; ");
  const title = `Inspectiedossier ${item.atrium_installation_code}`;
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #16202c; }
  h1 { font-size: 17pt; margin: 0 0 2mm; }
  h2 { font-size: 11.5pt; margin: 0 0 2mm; padding-bottom: 1.5mm; border-bottom: 1px solid #d7dee7; }
  .lead { color: #52627a; margin: 0 0 6mm; }
  .block { margin: 0 0 6mm; page-break-inside: avoid; }
  .facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm 6mm; margin: 0; }
  .fact { border-bottom: 1px solid #eef2f6; padding-bottom: 1.2mm; }
  .fact dt { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #6b7a8d; margin: 0; }
  .fact dd { margin: 0; font-weight: 600; }
  .empty { color: #93a0b0; font-style: italic; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 1.6mm 2mm; border-bottom: 1px solid #eef2f6; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #6b7a8d; background: #f7f9fb; }
  td { font-size: 9.5pt; }
  .status { display: inline-block; padding: 0.6mm 2.4mm; border: 1px solid #d7dee7; border-radius: 10mm; font-size: 8.5pt; font-weight: 700; }
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p class="lead">
    ${escapeHtml(item.installation_name || item.atrium_installation_code)}
    ${item.object_name ? `; ${escapeHtml(item.object_name)}` : ""}
    ${item.relation_name ? `; ${escapeHtml(item.relation_name)}` : ""}
    <br><span class="status">${escapeHtml(STATUS_LABELS[item.status] || item.status)}</span>
  </p>

  <section class="block"><h2>Kerngegevens</h2>${facts([
    ["Installatiecode", item.atrium_installation_code],
    ["Adres", item.formatted_address],
    ["Inspectiescopes", scopes],
    ["Soort dossier", TYPE_LABELS[item.inspection_type] || item.inspection_type],
    ["Vervaldatum", formatDate(item.due_date)],
    ["Geplande inspectiedatum", formatDate(item.planned_date)],
    ["Uitgevoerd op", formatDate(item.execution_date)],
    ["Keuringsinstantie", item.inspection_body],
    ["Werkbon", item.atrium_work_order_code],
    ["Conclusie", CONCLUSION_LABELS[item.conclusion] || item.conclusion],
    ["Certificaateis", requirements],
    ["Toegewezen aan", item.assigned_user_id || item.assigned_role_display_name || item.assigned_role_code],
  ])}</section>

  ${table("Voorbereidingschecklist", ["Onderdeel", "Verplicht", "Status", "Gekoppeld document"],
    (detail.checklist || []).map((row: any) => [
      CHECKLIST_LABELS[row.requirement_key] || String(row.requirement_key).replaceAll("_", " "),
      row.requirement_level === "REQUIRED" ? "Ja" : "Nee",
      CHECKLIST_STATUS_LABELS[row.status] || row.status,
      row.document_title || row.file_name || "",
    ]), "Geen checklistregels vastgelegd.")}

  ${table("Inspectierapport", ["Document", "Conclusie", "Ontvangen", "Kenmerk"],
    (detail.reports || []).map((row: any) => [
      row.document_title || row.file_name || "",
      CONCLUSION_LABELS[row.conclusion] || row.conclusion || "",
      formatDate(row.received_at),
      row.report_reference || "",
    ]), "Nog geen inspectierapport geregistreerd.")}

  ${table("Certificaten", ["Nummer", "Omschrijving", "Geldig tot", "Status"],
    (detail.current_certificates || []).map((row: any) => [
      row.certificate_number || "",
      row.description || "",
      formatDate(row.valid_until),
      row.record_status || "",
    ]), "Nog geen inspectiecertificaat geregistreerd.")}

  ${table("Documentpakket", ["Versie", "Status", "Aantal bestanden", "Verzonden"],
    (detail.packages || []).map((row: any) => [
      `v${row.package_version}`,
      PACKAGE_STATUS_LABELS[row.package_status] || row.package_status || "",
      String((row.items || []).length),
      formatDateTime(row.sent_at),
    ]), "Nog geen documentpakket voorbereid.")}

  ${table("Acties", ["Actie", "Status", "Verantwoordelijkheid"],
    (detail.actions || []).map((row: any) => [
      row.workflow_title || "",
      row.status_display_name || row.status || "",
      RESPONSIBILITY_LABELS[row.responsibility_type] || row.responsibility_type || "",
    ]), "Geen acties bij dit dossier.")}

  ${table("Vastgelegde historie", ["Moment", "Gebeurtenis", "Door"],
    (events || []).map((row: any) => [
      formatDateTime(row.event_at),
      EVENT_LABELS[row.event_type] || String(row.event_type || "").replaceAll("_", " "),
      row.event_by || "systeem",
    ]), "Geen historie vastgelegd.")}

  <p class="empty">Geexporteerd uit Ember op ${escapeHtml(formatDateTime(exportedAt))}. Dossier ${escapeHtml(item.inspection_case_id)}.</p>
</body></html>`;
}

export async function buildInspectionDossierPdf(caseId: string) {
  const detail: any = await getInspectionCase(caseId);
  const events = await getInspectionCaseEvents(caseId).then((result: any) => result?.items || []).catch(() => []);
  const exportedAt = new Date();
  const html = buildInspectionDossierHtml(detail, events, exportedAt);
  const buffer = await renderHtmlToPdf(html, {
    margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
    footerTemplate: `
      <div style="width:100%;padding:0 12mm;font-size:8pt;color:#52627a;font-family:Calibri,Arial,sans-serif;box-sizing:border-box;">
        <div style="width:100%;display:flex;justify-content:space-between;align-items:center;">
          <span>Inspectiedossier ${escapeHtml(detail.case.atrium_installation_code)}</span>
          <span>Pagina <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>
      </div>
    `,
  });
  // Alleen ASCII in de bestandsnaam; installatiecodes bevatten geen diakrieten.
  const safeCode = String(detail.case.atrium_installation_code || "dossier").replace(/[^A-Za-z0-9._-]+/g, "-");
  const fileName = `Inspectiedossier-${safeCode}-${exportedAt.toISOString().slice(0, 10)}.pdf`;
  return {
    buffer,
    contentType: "application/pdf",
    contentLength: buffer.length,
    contentDisposition: `attachment; filename="${fileName}"`,
  };
}
