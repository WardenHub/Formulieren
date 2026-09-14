// Visuele controle van de tijdlijn en de vragen per processtap, zonder API of login.
// De gegevens hieronder hebben dezelfde vorm als de detailrespons van /inspections/cases/:id.
import React, { useState, useSyncExternalStore } from "react";
import ReactDOM from "react-dom/client";

import InspectionProcessTrack from "../src/pages/Inspections/InspectionProcessTrack.jsx";
import InspectionStepPanel from "../src/pages/Inspections/InspectionStepPanel.jsx";
import { inspectionPhaseStates } from "../src/lib/inspectionProcess.js";
import { inspectionStepQuestions } from "../src/lib/inspectionQuestions.js";
import { INSPECTION_BODIES } from "../src/lib/inspectionBodies.js";
import { applyAppearancePreference, getResolvedAppearance, subscribeAppearance } from "../src/theme/appearance.js";
import "../src/styles/layout.css";

const documentChoices = [
  { document_id: "doc-pve", stored_file_id: "file-pve", document_type_key: "pve", title: "PvE Brandmeldinstallatie 2024" },
  { document_id: "doc-teken", stored_file_id: "file-teken", document_type_key: "revisietekening", title: "Revisietekening begane grond" },
  { document_id: "doc-oh", stored_file_id: "file-oh", document_type_key: "onderhoudsrapport", title: "Onderhoud BMI 2026-04-12" },
  { document_id: "doc-cert", stored_file_id: "file-cert", document_type_key: "onderhoudscertificaat", title: "Onderhoudscertificaat 2026" },
  { document_id: "doc-rap", stored_file_id: "file-rap", document_type_key: "inspectierapport", title: "Inspectierapport NIM 2026" },
];

const checklist = [
  { inspection_case_document_requirement_id: "r1", requirement_key: "LAST_MAINTENANCE_REPORT", document_type_key: "onderhoudsrapport", requirement_level: "REQUIRED", status: "CHECKED", installation_document_id: "doc-oh", document_title: "Onderhoud BMI 2026-04-12" },
  { inspection_case_document_requirement_id: "r2", requirement_key: "MAINTENANCE_CERTIFICATE", document_type_key: "onderhoudscertificaat", requirement_level: "REQUIRED", status: "AVAILABLE", installation_document_id: "doc-cert", document_title: "Onderhoudscertificaat 2026" },
  { inspection_case_document_requirement_id: "r3", requirement_key: "PROGRAM_OF_REQUIREMENTS", document_type_key: "pve", requirement_level: "REQUIRED", status: "MISSING", installation_document_id: null },
  { inspection_case_document_requirement_id: "r4", requirement_key: "NOTICE_OF_ADDITION", document_type_key: "nva", requirement_level: "OPTIONAL", status: "MISSING", installation_document_id: null },
  { inspection_case_document_requirement_id: "r5", requirement_key: "CURRENT_DRAWINGS", document_type_key: "revisietekening", requirement_level: "REQUIRED", status: "MISSING", installation_document_id: null },
];

const SCENARIOS = [
  {
    key: "offer", title: "Stap 1; signalering en offerte",
    input: {
      caseItem: { status: "ATTENTION_REQUIRED" },
      editor: { status: "ATTENTION_REQUIRED", due_date: "2026-12-31", inspection_body: "" },
      checklist, documentChoices, editableStatuses: ["CANCELLED", "OFFER_REQUIRED", "ORDERED"],
    },
    events: [],
  },
  {
    key: "plan", title: "Stap 2; opdracht en planning",
    input: {
      caseItem: { status: "PLANNING_REQUIRED", atrium_work_order_key: null, atrium_work_order_code: null },
      editor: { status: "PLANNING_REQUIRED", due_date: "2026-12-31", planned_date: "", inspection_body: "" },
      checklist, documentChoices, canRefreshWorkOrder: true,
      workOrders: [
        { atrium_work_order_key: "wb-1", atrium_work_order_code: "WB2026-0412", work_order_title: "Inspectie BMI jaarlijks" },
        { atrium_work_order_key: "wb-2", atrium_work_order_code: "WB2026-0518", work_order_title: "Herinspectie BMI" },
      ],
      editableStatuses: ["CANCELLED", "PLANNED_CONFIRMED", "PLANNED_UNCONFIRMED"],
    },
    events: [{ after_json: '{"status":"ORDERED"}' }],
  },
  {
    key: "plan-blocked", title: "Stap 2b; volgende stap gekozen, gegevens nog niet compleet",
    input: {
      caseItem: { status: "PLANNING_REQUIRED", inspection_body: "Kiwa", atrium_work_order_key: "wb-1", atrium_work_order_code: "WB2026-0412" },
      editor: { status: "PLANNED_CONFIRMED", due_date: "2026-12-31", planned_date: "", inspection_body: "Kiwa" },
      checklist, documentChoices, canRefreshWorkOrder: true,
      workOrders: [{ atrium_work_order_key: "wb-1", atrium_work_order_code: "WB2026-0412", work_order_title: "Inspectie BMI jaarlijks" }],
      editableStatuses: ["CANCELLED", "PLANNED_CONFIRMED", "PLANNED_UNCONFIRMED"],
    },
    events: [{ after_json: '{"status":"ORDERED"}' }],
  },
  {
    key: "execute", title: "Stap 3; uitvoering en rapport",
    input: {
      caseItem: { status: "EXECUTED_AWAITING_REPORT", inspection_body: "Nederlandse Inspectie Maatschappij" },
      editor: { status: "EXECUTED_AWAITING_REPORT" },
      checklist, documentChoices,
      report: { document_id: "doc-rap", conclusion: "PENDING", inspection_date: "2026-09-08", inspection_body: "", report_reference: "" },
    },
    events: [{ after_json: '{"status":"ORDERED"}' }, { after_json: '{"status":"PLANNED_CONFIRMED"}' }],
  },
  {
    key: "review", title: "Stap 4; rapport beoordelen",
    input: {
      caseItem: { status: "REPORT_RECEIVED" }, editor: { status: "REPORT_RECEIVED" },
      checklist, documentChoices,
      certificateChoices: [{ installation_certificate_id: "c1", certificate_number: "NIM-2026-0091" }],
      certificateIds: [],
    },
    events: [{ after_json: '{"status":"ORDERED"}' }, { after_json: '{"status":"PLANNED_CONFIRMED"}' }, { after_json: '{"status":"EXECUTED_AWAITING_REPORT"}' }],
  },
  {
    key: "close", title: "Stap 5; certificaat en afronding",
    input: {
      caseItem: { status: "CERTIFICATE_RECEIVED" }, editor: { status: "CERTIFICATE_RECEIVED" },
      checklist: checklist.map((row) => ({ ...row, status: "CHECKED", installation_document_id: row.installation_document_id || "doc-pve" })),
      documentChoices,
    },
    events: [{ after_json: '{"status":"ORDERED"}' }, { after_json: '{"status":"PLANNED_CONFIRMED"}' }, { after_json: '{"status":"EXECUTED_AWAITING_REPORT"}' }, { after_json: '{"status":"REPORT_RECEIVED"}' }],
  },
];

function noop() {}

function Scenario({ scenario }) {
  const step = inspectionStepQuestions(scenario.input);
  const phases = inspectionPhaseStates(scenario.input.caseItem.status, scenario.events);
  return (
    <section style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>{scenario.title}</h2>
      <InspectionProcessTrack phases={phases} />
      <InspectionStepPanel step={step} busy={false} readOnly={false}
        intro="Beantwoord de vragen van deze stap; het volledige dossier staat onder een eigen tab."
        onField={noop} onStatus={noop} onDocument={noop} onDocumentStatus={noop} onCreateAction={noop}
        onWorkOrder={noop} onReportField={noop} onCertificateToggle={noop} onAction={noop} />
    </section>
  );
}

function Harness() {
  const appearance = useSyncExternalStore(subscribeAppearance, getResolvedAppearance, () => "light");
  const [active, setActive] = useState("plan");
  const scenario = SCENARIOS.find((item) => item.key === active) || SCENARIOS[0];
  return (
    <div className="inspection-page" style={{ padding: 24, maxWidth: 1080, margin: "0 auto" }}>
      <div className="tabs-row">
        {SCENARIOS.map((item) => (
          <button key={item.key} className={item.key === active ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setActive(item.key)}>{item.title.split(";")[0]}</button>
        ))}
        <button className="btn btn-secondary" onClick={() => applyAppearancePreference(appearance === "dark" ? "light" : "dark")}>
          {appearance === "dark" ? "Lichte modus" : "Donkere modus"}
        </button>
      </div>
      <Scenario scenario={scenario} />
      <datalist id="inspection-bodies">{INSPECTION_BODIES.map((body) => <option key={body.name} value={body.name} />)}</datalist>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><Harness /></React.StrictMode>);
