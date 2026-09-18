import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInspectionDossierHtml } from '../src/services/inspectionDossierPdfService.js';

const detail = {
  case: {
    inspection_case_id: '3179AD6D-0DE7-484D-874C-4370FB11ABE1',
    atrium_installation_code: '01',
    installation_name: 'Proefinstallatie 01',
    object_name: 'Testobject',
    relation_name: 'Wardenburg <Test> & Co',
    formatted_address: 'Teststraat 1, Groningen',
    status: 'REPORT_RECEIVED',
    inspection_type: 'REINSPECTION',
    due_date: '2026-12-31',
    planned_date: '2026-09-08',
    execution_date: null,
    inspection_body: 'Nederlandse Inspectie Maatschappij',
    atrium_work_order_code: 'WB2026-0412',
    conclusion: null,
    assigned_user_id: null,
    assigned_role_code: 'INSPECTION_COORDINATOR',
    assigned_role_display_name: 'Inspectiecoordinator',
  },
  scopes: [{ scope: 'BMI' }, { scope: 'OAI_B' }],
  certification_requirements: [{ scope: 'BMI', requirement_status: 'REQUIRED' }],
  checklist: [
    { requirement_key: 'PROGRAM_OF_REQUIREMENTS', requirement_level: 'REQUIRED', status: 'MISSING', document_title: null },
    { requirement_key: 'NOTICE_OF_ADDITION', requirement_level: 'OPTIONAL', status: 'WAIVED', document_title: null },
  ],
  reports: [{ document_title: 'Inspectierapport NIM', conclusion: 'FAIL', received_at: '2026-09-09T10:00:00Z', report_reference: 'NIM-1' }],
  current_certificates: [],
  packages: [{ package_version: 1, package_status: 'SENT', items: [{}, {}], sent_at: '2026-09-01T08:30:00Z' }],
  actions: [{ workflow_title: 'Herstel melder 12', status: 'OPEN', status_display_name: 'Open', responsibility_type: 'INTERN' }],
};

const events = [{
  event_at: '2026-09-09T10:00:00Z', event_type: 'REPORT_RECEIVED', event_by: 'adminwb@wardenburg.nl',
  before_json: JSON.stringify({ status: 'EXECUTED_AWAITING_REPORT', inspection_body: null }),
  after_json: JSON.stringify({ status: 'REPORT_RECEIVED', inspection_body: 'Kiwa' }),
}];

test('het dossier bevat elke sectie, ook wanneer er nog niets is vastgelegd', () => {
  const html = buildInspectionDossierHtml(detail, events, new Date('2026-09-14T09:00:00Z'));
  for (const heading of ['Kerngegevens', 'Voorbereidingschecklist', 'Inspectierapport', 'Certificaten', 'Documentpakket', 'Acties', 'Wie deed wat, wanneer']) {
    assert.ok(html.includes(`<h2>${heading}</h2>`), `sectie ontbreekt: ${heading}`);
  }
  assert.ok(html.includes('Nog geen inspectiecertificaat geregistreerd.'));
  assert.ok(html.includes('Niet vastgelegd'), 'lege velden blijven zichtbaar leeg in plaats van weggelaten');
});

test('gegevens worden getoond zoals ze zijn vastgelegd, met nette Nederlandse labels', () => {
  const html = buildInspectionDossierHtml(detail, events, new Date('2026-09-14T09:00:00Z'));
  assert.ok(html.includes('Inspectiedossier 01'));
  assert.ok(html.includes('Rapport beoordelen'), 'statuscode wordt als label getoond');
  assert.ok(html.includes('Herinspectie'));
  assert.ok(html.includes('BMI, OAI-B'));
  assert.ok(html.includes('Programma van Eisen'));
  assert.ok(html.includes('Niet van toepassing'));
  assert.ok(html.includes('Tekortkomingen'));
  assert.ok(!html.includes('REPORT_RECEIVED<'), 'ruwe statuscodes horen niet in de tekst');
});

test('codes uit de database worden als Nederlandse tekst getoond', () => {
  const html = buildInspectionDossierHtml(detail, events, new Date('2026-09-14T09:00:00Z'));
  assert.ok(html.includes('BMI: Vereist'), 'certificaateis in gewone taal');
  assert.ok(html.includes('Inspectiecoordinator'), 'rolcode wordt als naam getoond');
  assert.ok(html.includes('<td>Verzonden</td>'), 'pakketstatus in gewone taal');
  assert.ok(html.includes('<td>Open</td>') && html.includes('<td>Intern</td>'), 'actiestatus en verantwoordelijkheid in gewone taal');
  assert.ok(html.includes('Inspectierapport geregistreerd'), 'gebeurtenis in gewone taal');
  for (const code of ['REQUIRED<', 'SENT<', 'INTERN<', 'INSPECTION_COORDINATOR<']) {
    assert.ok(!html.includes(code), `ruwe code zichtbaar: ${code}`);
  }
});

test('de historie vertelt wie wat wanneer wijzigde', () => {
  const html = buildInspectionDossierHtml(detail, events, new Date('2026-09-14T09:00:00Z'));
  assert.ok(html.includes('adminwb@wardenburg.nl'));
  assert.ok(html.includes('Status: Uitgevoerd; rapport verwacht naar Rapport beoordelen'));
  assert.ok(html.includes('Keuringsinstantie: leeg naar Kiwa'));
});

test('tekst uit de database wordt ge-escapet', () => {
  const html = buildInspectionDossierHtml(detail, events, new Date('2026-09-14T09:00:00Z'));
  assert.ok(html.includes('Wardenburg &lt;Test&gt; &amp; Co'));
  assert.ok(!html.includes('<Test>'));
});

test('een leeg dossier levert nog steeds een geldig document', () => {
  const html = buildInspectionDossierHtml({ case: { atrium_installation_code: '02', status: 'ATTENTION_REQUIRED' } }, [], new Date());
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('Geen checklistregels vastgelegd.'));
  assert.ok(html.includes('Geen historie vastgelegd.'));
});
