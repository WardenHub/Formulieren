export const INSPECTION_STATUS_LABELS = {
  ATTENTION_REQUIRED: 'Aandacht nodig', OFFER_REQUIRED: 'Offerte nodig', ORDERED: 'Opdracht ontvangen',
  PLANNING_REQUIRED: 'Planning nodig', PLANNED_UNCONFIRMED: 'Gepland; onbevestigd',
  PLANNED_CONFIRMED: 'Gepland; bevestigd', EXECUTED_AWAITING_REPORT: 'Uitgevoerd; rapport verwacht',
  REPORT_RECEIVED: 'Rapport beoordelen', REPAIR_REQUIRED: 'Herstel nodig',
  REINSPECTION_REQUIRED: 'Herinspectie nodig', CERTIFICATE_RECEIVED: 'Administratief afronden',
  COMPLETED: 'Afgerond', CANCELLED: 'Geannuleerd',
};

export const INSPECTION_CHECKLIST_LABELS = {
  CURRENT_DRAWINGS: 'Actuele tekeningen',
  LAST_MAINTENANCE_REPORT: 'Laatste onderhoudsrapport',
  MAINTENANCE_CERTIFICATE: 'Onderhoudscertificaat',
  PROGRAM_OF_REQUIREMENTS: 'Programma van eisen',
  CURRENT_INSPECTION_CERTIFICATE: 'Huidig inspectiecertificaat',
  NOTICE_OF_ADDITION: 'Nota van aanvulling',
  OTHER_INSPECTION_DOCUMENT: 'Overige inspectiedocumenten',
  RELEVANT_INSPECTION_REPORT: 'Relevant inspectierapport',
};

export const INSPECTION_APPOINTMENT_LABELS = {
  NO_PLANNING: 'Nog niet gepland',
  PLANNED_UNCONFIRMED: 'Gepland; nog te bevestigen',
  PLANNED_CONFIRMED: 'Afspraak bevestigd',
  EXECUTED: 'Uitgevoerd',
  CANCELLED_OR_HISTORICAL: 'Geannuleerd of historisch',
};

// Navigation guidance only; the API/database remain authoritative for transitions.
export function inspectionSaveProblem(editor, workOrderKey) {
  if (['PLANNED_UNCONFIRMED', 'PLANNED_CONFIRMED', 'EXECUTED_AWAITING_REPORT'].includes(editor.status)) {
    if (!editor.planned_date) return 'Vul eerst de inspectiedatum in bij Dossiergegevens.';
    if (!String(editor.inspection_body || '').trim()) return 'Kies of vul eerst de keuringsinstantie in.';
  }
  if (editor.status === 'EXECUTED_AWAITING_REPORT' && !workOrderKey) {
    return 'Koppel eerst de werkbon bij Werkbon en planning. Daarna kun je de inspectie als uitgevoerd vastleggen.';
  }
  return null;
}

export function inspectionNextStep(status) {
  if (['COMPLETED', 'CANCELLED'].includes(status)) return { title: 'Dossier alleen-lezen', text: 'Bekijk de rapporten, certificaten en vastgelegde historie.', target: 'inspection-history' };
  if (status === 'REPORT_RECEIVED') return { title: 'Beoordeel het rapport', text: 'Leg bij tekortkomingen herstel vast. Bij goedkeuring koppel je de inspectiecertificaten die alle onderdelen dekken.', target: 'inspection-conclusion' };
  if (status === 'EXECUTED_AWAITING_REPORT') return { title: 'Upload en registreer het inspectierapport', text: 'Kies het exacte rapportbestand en leg inspectiedatum en keuringsinstantie vast. Daarna volgt de beoordeling.', target: 'inspection-report' };
  if (['REPAIR_REQUIRED', 'REINSPECTION_REQUIRED'].includes(status)) return { title: 'Volg herstel en herinspectie op', text: 'Controleer de open acties en bereid zo nodig de herinspectie voor. Het oorspronkelijke rapport blijft bewaard.', target: 'inspection-actions' };
  if (status === 'CERTIFICATE_RECEIVED') return { title: 'Controleer en rond het dossier af', text: 'Controleer de checklist en open acties. Afronden kan alleen met complete bewijsstukken en certificaten.', target: 'inspection-conclusion' };
  if (['PLANNED_UNCONFIRMED', 'PLANNED_CONFIRMED'].includes(status)) return { title: 'Bereid de inspectie voor', text: 'Controleer de werkbon, afspraak en documenten. Leg uitvoering pas vast nadat de inspectie heeft plaatsgevonden.', target: 'inspection-checklist' };
  return { title: 'Leg opdracht en planning vast', text: 'Werk het dossier bij, kies de keuringsinstantie en koppel de juiste werkbon. De checklist helpt bij de voorbereiding.', target: 'inspection-control' };
}
