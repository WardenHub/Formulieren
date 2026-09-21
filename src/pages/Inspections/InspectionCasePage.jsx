import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inspectionSections, inspectionPhaseStates } from "../../lib/inspectionProcess.js";
import { inspectionStepQuestions } from "../../lib/inspectionQuestions.js";
import { inspectionAuditTrail } from "../../lib/inspectionAudit.js";
import InspectionStepPanel from "./InspectionStepPanel.jsx";
import InspectionProcessTrack from "./InspectionProcessTrack.jsx";
import { mergeInspectionEditor } from "../../lib/inspectionEditor.js";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import CertificationDocumentUpload from "../Installations/CertificationDocumentUpload.jsx";
import CertificatesTab from "../Installations/CertificatesTab.jsx";
import { INSPECTION_BODIES, inspectionBodyWebsite } from "@/lib/inspectionBodies.js";
import { INSPECTION_STATUS_LABELS, INSPECTION_CHECKLIST_LABELS, INSPECTION_APPOINTMENT_LABELS, inspectionNextStep, inspectionSaveProblem } from "@/lib/inspectionJourney.js";
import {
  completeInspectionCase, createInspectionReinspection, getInspectionCase,
  prepareInspectionPackage, processInspectionConclusion, refreshInspectionWorkOrders,
  registerInspectionReport, sendInspectionPackage, updateInspectionCase,
  updateInspectionAssignment, updateInspectionChecklistItem,
  getInspectionCaseEvents, downloadInspectionDossierPdf, resolveInspectionChecklist,
} from "../../api/emberApi.js";

function formatDate(value){if(!value)return "-";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat("nl-NL",{dateStyle:"medium"}).format(d)}
function cleanDate(value){return value?String(value).slice(0,10):""}

export default function InspectionCasePage(){
  const {caseId}=useParams();
  return <InspectionCaseDetail key={caseId} caseId={caseId}/>;
}

function InspectionCaseDetail({caseId}){
  const[data,setData]=useState(null);const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  const {permissions=[]}=useOutletContext()||{};const[auditEvents,setAuditEvents]=useState([]);
  const canViewAudit=permissions.includes("inspection.audit.view");
  const serverEditor=useRef(null);
  const loadSequence=useRef(0);
  const resolvedChecklist=useRef(false);
  const [notice,setNotice]=useState("");
  const [view,setView]=useState("process");
  const [pdfBusy,setPdfBusy]=useState(false);
  const feedbackRef=useRef(null);
  useEffect(()=>{if(error||notice)feedbackRef.current?.focus()},[error,notice]);
  const can=(permission)=>permissions.includes(permission) && (!data || !["COMPLETED","CANCELLED"].includes(data.case.status) || ["inspection.view","inspection.audit.view"].includes(permission));
  const[editor,setEditor]=useState({});const[selectedPackageDocs,setSelectedPackageDocs]=useState([]);const[report,setReport]=useState({document_id:"",conclusion:"PENDING",inspection_date:"",inspection_body:"",report_reference:""});const[certificateIds,setCertificateIds]=useState([]);
  const load=useCallback(async function load(){
    const request=++loadSequence.current;
    setLoading(true);setError("");
    try{
      const next=await getInspectionCase(caseId);
      if(request!==loadSequence.current)return;
      setData(next);
      const nextEditor={status:next.case.status,planned_date:cleanDate(next.case.planned_date),due_date:cleanDate(next.case.due_date),inspection_body:next.case.inspection_body||"",assigned_user_id:next.case.assigned_user_id||"",assigned_role_code:next.case.assigned_role_code||"",logbook_linked:Boolean(next.case.logbook_linked),inspection_body_has_logbook_access:Boolean(next.case.inspection_body_has_logbook_access),document_package_available_in_logbook:Boolean(next.case.document_package_available_in_logbook),report_uploaded_to_logbook:Boolean(next.case.report_uploaded_to_logbook)};
      const previous=serverEditor.current;serverEditor.current=nextEditor;
      setEditor((current)=>mergeInspectionEditor(current,previous,nextEditor));
      if(canViewAudit){
        const audit=await getInspectionCaseEvents(caseId);
        if(request!==loadSequence.current)return;
        setAuditEvents(audit?.items||[]);
      }else setAuditEvents([]);
    }catch(e){if(request===loadSequence.current)setError(e?.message||"Inspectie laden is mislukt.");return false}
    finally{if(request===loadSequence.current)setLoading(false)}
  },[caseId,canViewAudit]);
  useEffect(()=>{void load();return()=>{loadSequence.current+=1}},[load]);
  // Wat Ember al bij de installatie heeft staan hoeft niemand nog een keer aan te wijzen.
  useEffect(()=>{
    if(resolvedChecklist.current||!data||!permissions.includes("inspection.checklist.manage"))return;
    if(["COMPLETED","CANCELLED"].includes(data.case.status))return;
    const open=data.checklist.filter((row)=>row.status==="MISSING"&&!row.installation_document_id);
    if(!open.length)return;
    const hasCandidate=open.some((row)=>data.document_choices.some((doc)=>doc.document_type_key===row.document_type_key));
    if(!hasCandidate)return;
    resolvedChecklist.current=true;
    void resolveInspectionChecklist(caseId).then((result)=>{if(result?.linked_count)void load()}).catch(()=>{});
  },[data,permissions,caseId,load]);
  const chosenReportDocument=useMemo(()=>data?.document_choices?.find((doc)=>String(doc.document_id).toLowerCase()===String(report.document_id).toLowerCase())||null,[data,report.document_id]);
  const step=useMemo(()=>data?inspectionStepQuestions({
    caseItem:data.case,editor,report,checklist:data.checklist,documentChoices:data.document_choices,
    workOrders:data.work_orders,certificateChoices:data.certificate_choices,certificateIds,
    actions:data.actions,editableStatuses:data.editable_statuses,
    canRefreshWorkOrder:permissions.includes("inspection.refresh_workorder"),
  }):null,[data,editor,report,certificateIds,permissions]);
  async function run(action,fallback,success="Wijziging opgeslagen."){setBusy(true);setError("");setNotice("");try{await action();const refreshed=await load();if(refreshed!==false)setNotice(success)}catch(e){setError(e?.message||fallback)}finally{setBusy(false)}}
  async function refresh(workOrderKey){return run(()=>refreshInspectionWorkOrders(caseId, workOrderKey ? { work_order_key: workOrderKey } : {}),"Werkbonverversing is mislukt.")}
  async function saveCase(){const problem=inspectionSaveProblem(editor,data.case.atrium_work_order_key);if(problem){setNotice("");setError(problem);return}const caseFields={status:editor.status,planned_date:editor.planned_date,due_date:editor.due_date,inspection_body:editor.inspection_body,logbook_linked:editor.logbook_linked,inspection_body_has_logbook_access:editor.inspection_body_has_logbook_access,document_package_available_in_logbook:editor.document_package_available_in_logbook,report_uploaded_to_logbook:editor.report_uploaded_to_logbook};return run(()=>updateInspectionCase(caseId,{...caseFields,row_version:data.case.row_version}),"Inspectie bijwerken is mislukt.","Dossier opgeslagen.")}
  async function saveAssignment(){return run(()=>updateInspectionAssignment(caseId,{row_version:data.case.row_version,assigned_user_id:editor.assigned_user_id||null,assigned_role_code:editor.assigned_role_code||null}),"Toewijzing bijwerken is mislukt.")}
  async function setChecklist(item,status,documentId=item.installation_document_id){const doc=data.document_choices.find((candidate)=>candidate.document_id===documentId);return run(()=>updateInspectionChecklistItem(caseId,item.inspection_case_document_requirement_id,{...item,status,row_version:item.row_version,installation_document_id:doc?.document_id||null,stored_file_id:doc?.stored_file_id||null}),"Checklist bijwerken is mislukt.")}
  async function createChecklistAction(item){return run(()=>updateInspectionChecklistItem(caseId,item.inspection_case_document_requirement_id,{...item,row_version:item.row_version,create_action:true,action_title:`Aanleveren: ${(INSPECTION_CHECKLIST_LABELS[item.requirement_key] || item.requirement_key.replaceAll("_"," "))}`}),"Checklistactie aanmaken is mislukt.")}
  async function preparePackageNow(){return run(()=>prepareInspectionPackage(caseId,{installation_document_ids:selectedPackageDocs,inspection_body:data.case.inspection_body,recipient_snapshot:{inspection_body:data.case.inspection_body}}),"Documentpakket voorbereiden is mislukt.")}
  async function sendPackageNow(pkg){const reference=window.prompt("Externe verzendreferentie of e-mailonderwerp",pkg.external_reference||"");if(reference===null)return;return run(()=>sendInspectionPackage(caseId,pkg.inspection_case_document_package_id,{row_version:pkg.row_version,external_reference:reference}),"Documentpakket verzenden is mislukt.")}
  async function registerReportNow(){if(!chosenReportDocument){setError("Kies eerst het exacte rapportbestand.");return}if(!report.inspection_date){setNotice("");setError("Vul de inspectiedatum uit het rapport in voordat je het rapport registreert.");return}return run(()=>registerInspectionReport(caseId,{installation_document_id:chosenReportDocument.document_id,stored_file_id:chosenReportDocument.stored_file_id,conclusion:report.conclusion,inspection_date:report.inspection_date||null,inspection_body:report.inspection_body||data.case.inspection_body,report_reference:report.report_reference||null}),"Inspectierapport registreren is mislukt.")}
  async function conclude(conclusion){return run(()=>processInspectionConclusion(caseId,{row_version:data.case.row_version,conclusion,installation_certificate_ids:conclusion==="PASS"?certificateIds:[],note:conclusion==="FAIL"?"Herstelpunten uit het actuele inspectierapport uitvoeren.":null}),"Inspectieconclusie verwerken is mislukt.")}
  async function reinspection(){return run(()=>createInspectionReinspection(caseId,{due_date:data.case.due_date,inspection_body:data.case.inspection_body,assigned_user_id:data.case.assigned_user_id,assigned_role_code:data.case.assigned_role_code}),"Herinspectie aanmaken is mislukt.")}
  async function complete(){return run(()=>completeInspectionCase(caseId,{row_version:data.case.row_version}),"Inspectie afronden is mislukt.")}
  // Het dossier als pdf; de server bouwt hem uit dezelfde opgeslagen gegevens.
  async function downloadDossierPdf(){
    setPdfBusy(true);setError("");setNotice("");
    try{
      const {blob,fileName}=await downloadInspectionDossierPdf(caseId);
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=url;anchor.download=fileName||`Inspectiedossier-${data.case.atrium_installation_code}.pdf`;
      document.body.appendChild(anchor);anchor.click();document.body.removeChild(anchor);
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice("Het dossier is als pdf gedownload.");
    }catch(e){setError(e?.message||"Dossier als pdf maken is mislukt.")}
    finally{setPdfBusy(false)}
  }
  // De vragen uit de stap sturen dezelfde acties aan als het volledige dossier.
  function checklistRow(requirementId){return data.checklist.find((row)=>row.inspection_case_document_requirement_id===requirementId)}
  function answerDocument(requirementId,documentId){const row=checklistRow(requirementId);if(row)void setChecklist(row,documentId?"AVAILABLE":"MISSING",documentId||null)}
  function answerDocumentStatus(requirementId,status){const row=checklistRow(requirementId);if(row)void setChecklist(row,status)}
  function answerCreateAction(requirementId){const row=checklistRow(requirementId);if(row)void createChecklistAction(row)}
  function performStepAction(action){
    if(action==="save-case")return void saveCase();
    if(action==="register-report")return void registerReportNow();
    if(action==="conclude-pass")return void conclude("PASS");
    if(action==="conclude-fail")return void conclude("FAIL");
    if(action==="reinspection")return void reinspection();
    if(action==="complete")return void complete();
  }
  if(loading&&!data)return <div className="card inspection-empty">Inspectie laden...</div>;if(!data)return <div className="ember-error-text">{error||"Inspectie niet gevonden."}</div>;
  const item=data.case;
  const nextStep=inspectionNextStep(item.status);
  const sections=inspectionSections(item.status);
  // Het procesoverzicht toont alleen de huidige stap; het volledige dossier toont alles.
  const stepSection=(section)=>sections.includes(section)?"yes":undefined;
  const phases=inspectionPhaseStates(item.status,auditEvents);
  const readOnlyCase=["COMPLETED","CANCELLED"].includes(item.status)||!can("inspection.update");
  const reportEditingAllowed=can("inspection.report.register") && ["EXECUTED_AWAITING_REPORT","REPORT_RECEIVED"].includes(item.status);
  return <div className="inspection-page">
    {(error||notice)?<div ref={feedbackRef} tabIndex={-1} role={error?"alert":"status"} className={error?"ember-error-text":"card inspection-section"}>{error||notice}</div>:null}
    <section className="card inspection-case-hero"><div><div className="inspection-scope-list">{data.scopes.map((s)=><i key={s.scope}>{s.scope.replace("_","-")}</i>)}</div><h1>{item.installation_name||item.atrium_installation_code}</h1><p className="ember-page-subtitle">Installatie {item.atrium_installation_code}{item.object_name?` ; ${item.object_name}`:""}{item.relation_name?` ; ${item.relation_name}`:""}</p></div><div className="inspection-case-hero__status"><span className="ember-label ember-label--warning">{item.status_display_name||item.status}</span><strong>{formatDate(item.due_date)}</strong></div></section>
    <div className="tabs-row" aria-label="Inspectieweergave">
      <button className={view==="process"?"btn btn-primary":"btn btn-secondary"} aria-pressed={view==="process"} onClick={()=>setView("process")}>Procesoverzicht</button>
      <button className={view==="dossier"?"btn btn-primary":"btn btn-secondary"} aria-pressed={view==="dossier"} onClick={()=>setView("dossier")}>Volledig dossier</button>
      <button className="btn btn-secondary" disabled={pdfBusy} onClick={()=>void downloadDossierPdf()}><Download size={16}/>{pdfBusy?"Pdf wordt gemaakt...":"Dossier als pdf"}</button>
    </div>
    <InspectionProcessTrack phases={phases}/>
    {(view==="dossier"||sections.includes("checklist"))&&data.maintenance_evidence?<section className="card inspection-section" aria-label="Laatste onderhoudsdocument">
      <h2>Laatste onderhoudsdocument</h2>
      <p className="muted">Vergelijking op onderhoudsdatum tussen definitieve Ember-formulieren en actieve bijlagen ‘onderhoudsrapport’; niet op uploaddatum.</p>
      {data.maintenance_evidence.latest?<>
        <span className={`ember-label ember-label--${data.maintenance_evidence.older_than_year?"warning":"accent"}`}>
          {data.maintenance_evidence.older_than_year?"Ouder dan één jaar":"Binnen één jaar"}
        </span>
        <p><strong>{data.maintenance_evidence.latest.title}</strong> · {formatDate(data.maintenance_evidence.latest.maintenance_date)} · {data.maintenance_evidence.latest.source==="FORM_RUNNER"?"Ember-formulier":"Bijlage onderhoudsrapport"}</p>
        {data.maintenance_evidence.latest.source==="FORM_RUNNER"?<Link className="btn btn-secondary" to={`/monitor/formulieren/${encodeURIComponent(data.maintenance_evidence.latest.source_id)}`}>Onderhoudsformulier bekijken</Link>:null}
      </>:<p>Geen onderhoudsdocument met een bruikbare onderhoudsdatum gevonden.</p>}
      {data.maintenance_evidence.warning?<p role="status" className="ember-label ember-label--warning">{data.maintenance_evidence.warning}</p>:null}
      {data.maintenance_evidence.certificate_assessment?<div>
        <p><strong>{data.maintenance_evidence.certificate_assessment.label}</strong></p>
        <p>Openstaande actiepunten: {data.maintenance_evidence.certificate_assessment.open_count??"Onbekend"} · Certificaatblokkerende punten: {data.maintenance_evidence.certificate_assessment.certificate_blocking_count??"Onbekend"}</p>
        <p className="muted">{data.maintenance_evidence.certificate_assessment.note}</p>
        {!data.maintenance_evidence.certificate_assessment.finalization_recorded?<p className="muted">Het definitief-maakmoment is niet vastgelegd; controleer de ondertekening in het rapport.</p>:null}
      </div>:data.maintenance_evidence.latest?<p className="muted">Certificaatresultaat en openstaande punten: onbekend; de inhoud van deze bijlage is niet automatisch beoordeeld.</p>:null}
      {data.maintenance_evidence.undated_count>0?<p className="muted">Bij {data.maintenance_evidence.undated_count} document(en) ontbreekt een geldige onderhoudsdatum. Controleer deze; de volgorde is niet volledig vast te stellen.</p>:null}
      {data.maintenance_evidence.future_dated_count>0?<p className="muted">Er zijn documenten met een toekomstige onderhoudsdatum. Deze zijn niet als laatste uitgevoerd onderhoud gekozen.</p>:null}
      {data.maintenance_evidence.same_date_count>1?<p className="muted">Meerdere documenten hebben dezelfde laatste onderhoudsdatum; op datum is geen onderscheid mogelijk.</p>:null}
      <p className="muted">Dit is de actuele bronvergelijking. Een eerder vastgelegde dossierbijlage wordt niet automatisch vervangen.</p>
    </section>:null}
    {view==="process"&&step?<InspectionStepPanel step={step} busy={busy} readOnly={readOnlyCase} intro={nextStep.text}
      onField={(field,value)=>setEditor((v)=>({...v,[field]:value}))}
      onStatus={(value)=>setEditor((v)=>({...v,status:value}))}
      onDocument={answerDocument} onDocumentStatus={answerDocumentStatus} onCreateAction={answerCreateAction}
      onWorkOrder={(key)=>void refresh(key)}
      onReportField={(field,value)=>setReport((v)=>({...v,[field]:value}))}
      onCertificateToggle={(id,checked)=>setCertificateIds((ids)=>checked?[...ids,id]:ids.filter((value)=>value!==id))}
      onAction={performStepAction}>
      {step.phaseId==="execute"&&can("inspection.report.register")?
        <CertificationDocumentUpload key={`step-${caseId}`} code={item.atrium_installation_code} documentType="inspectierapport"
          label="Upload het inspectierapport" disabled={busy}
          onUploaded={async (document)=>{await load();setReport((current)=>({...current,document_id:document.document_id}))}}/>:null}
      {item.status==="REPORT_RECEIVED"&&can("inspection.conclusion.process")?
        <details className="inspection-step__aside"><summary>Inspectiecertificaat uploaden en registreren</summary>
          <CertificatesTab code={item.atrium_installation_code} onCertificateSaved={load}/>
        </details>:null}
    </InspectionStepPanel>:null}
    <datalist id="inspection-bodies">{INSPECTION_BODIES.map((body) => <option key={body.name} value={body.name}/>)}</datalist>
    <section hidden={view!=="dossier"} className="card inspection-section">
      <h2>Proces en keuringsinstantie</h2>
      <p className="muted">Offerte → opdracht en planning → uitvoering → rapportbeoordeling → eventueel herstel/herinspectie → certificaat en afronding.</p>
      <label className="ui-stack-sm"><span>Keuringsinstantie kiezen (of zelf invullen)</span>
        <input className="input" list="inspection-bodies" disabled={busy || !can("inspection.update")} value={editor.inspection_body || ""} onChange={(e) => setEditor((value) => ({ ...value, inspection_body: e.target.value }))}/>
      </label>
      <div className="guidance-media-actions">
        <a className="btn btn-secondary" href="https://kennis.wardenburg.nl/Main/Werkwijze/Processen/Inspecties%20BMI%20en%20OAI" target="_blank" rel="noopener noreferrer">Werkwijze inspecties</a>
        {inspectionBodyWebsite(editor.inspection_body) ? <a className="btn btn-secondary" href={inspectionBodyWebsite(editor.inspection_body)} target="_blank" rel="noopener noreferrer">Website keuringsinstantie</a> : null}
      </div>
      <p className="muted">Gewijzigd? Klik hieronder op Dossier opslaan. Je ontvangt daarna een bevestiging.</p>
    </section>
    {view==="dossier" && can("inspection.refresh_workorder") && data.work_orders.length > 1 && !["REPORT_RECEIVED", "REPAIR_REQUIRED", "CERTIFICATE_RECEIVED", "COMPLETED", "CANCELLED"].includes(item.status) ?
      <section className="card inspection-section"><label className="ui-stack-sm"><span>Werkbon voor dit inspectiedossier</span>
        <select className="input" disabled={busy} value={item.atrium_work_order_key || ""} onChange={(e) => { if(e.target.value) void refresh(e.target.value); }}>
          <option value="">Kies een werkbon; meerdere kandidaten gevonden</option>
          {data.work_orders.map((row) => <option key={row.atrium_work_order_key} value={row.atrium_work_order_key}>{row.atrium_work_order_code} ; {row.work_order_title}</option>)}
        </select></label><p className="muted">De keuze wordt vóór opslaan live bij Atrium gecontroleerd.</p></section> : null}
    {view==="dossier" && can("inspection.report.register") && ["EXECUTED_AWAITING_REPORT", "REPORT_RECEIVED"].includes(item.status) ?
      <CertificationDocumentUpload key={caseId} code={item.atrium_installation_code} documentType="inspectierapport"
        label="Rapport beoordelen: upload het inspectierapport" disabled={busy}
        onUploaded={async (document) => { await load(); setReport((current) => ({ ...current, document_id: document.document_id })); }} /> : null}
    <div className="inspection-back"><Link className="btn btn-secondary" to="/inspecties"><ArrowLeft size={16}/>Terug</Link></div>
    <section className="inspection-detail-grid">
      <article hidden={view!=="dossier"} data-current-step={stepSection("control")} id="inspection-control" className="card inspection-section"><div className="inspection-section__head"><div><h2>Dossiergegevens</h2><p className="ember-page-subtitle">Status, termijn, keuringsinstantie en toewijzing.</p></div>{can("inspection.update")?<button className="btn" disabled={busy} onClick={()=>void saveCase()}>Dossier opslaan</button>:null}</div><div className="inspection-editor-grid"><label><span>Status</span><select className="input" disabled={!can("inspection.update")} value={editor.status} onChange={(e)=>setEditor((v)=>({...v,status:e.target.value}))}>{[...new Set([item.status,...(data.editable_statuses || [])])].map((status)=><option key={status} value={status}>{INSPECTION_STATUS_LABELS[status] || status}</option>)}</select></label><label><span>Inspectiedatum</span><input className="input" disabled={!can("inspection.update")} type="date" value={editor.planned_date||""} onChange={(e)=>setEditor((v)=>({...v,planned_date:e.target.value}))}/></label><label><span>Vervaldatum</span><input className="input" disabled={!can("inspection.update")} type="date" value={editor.due_date} onChange={(e)=>setEditor((v)=>({...v,due_date:e.target.value}))}/></label><label><span>Keuringsinstantie</span><input className="input" list="inspection-bodies" disabled={!can("inspection.update")} value={editor.inspection_body} onChange={(e)=>setEditor((v)=>({...v,inspection_body:e.target.value}))}/></label><label hidden={view!=="dossier"}><span>Toegewezen rol</span><input className="input" disabled={!can("inspection.assign")} value={editor.assigned_role_code} onChange={(e)=>setEditor((v)=>({...v,assigned_role_code:e.target.value,assigned_user_id:""}))} placeholder="INSPECTION_COORDINATOR"/></label></div>{view==="dossier" && can("inspection.assign")?<div className="guidance-media-actions"><button className="btn btn-secondary btn-compact" disabled={busy} onClick={()=>void saveAssignment()}>Toewijzing opslaan</button></div>:null}<div className="inspection-logbook-grid">{[["logbook_linked","Digitaal logboek gekoppeld"],["inspection_body_has_logbook_access","Keuringsinstantie heeft toegang"],["document_package_available_in_logbook","Documentpakket staat in logboek"],["report_uploaded_to_logbook","Rapport staat in logboek"]].map(([key,label])=><label key={key}><input disabled={!can("inspection.update")} type="checkbox" checked={Boolean(editor[key])} onChange={(e)=>setEditor((v)=>({...v,[key]:e.target.checked}))}/><span>{label}</span></label>)}</div></article>
      <article hidden={view!=="dossier"} data-current-step={stepSection("workorder")} className="card inspection-section"><div className="inspection-section__head"><div><h2>Werkbon en planning</h2><p className="ember-page-subtitle">Werkbongegevens worden opgehaald uit Syntess Atrium.</p></div>{can("inspection.refresh_workorder")?<button className="btn btn-secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/>{busy?"Verversen...":"Live verversen"}</button>:null}</div><dl className="inspection-facts"><div><dt>Werkbon</dt><dd>{item.atrium_work_order_code||"Nog niet gekoppeld"}</dd></div><div><dt>Werkbonstatus in Atrium</dt><dd>{(INSPECTION_APPOINTMENT_LABELS[item.appointment_status] || item.appointment_status)}</dd></div><div><dt>Inspectie gepland op</dt><dd>{formatDate(item.planned_date)}</dd></div><div><dt>Uitgevoerd</dt><dd>{formatDate(item.execution_date)}</dd></div><div><dt>Certificaateis voor</dt><dd>{data.certification_requirements.length?data.certification_requirements.map((row)=>row.scope.replace("_","-")).join(", "):"Niet vastgelegd"}</dd></div><div><dt>Huidig certificaat</dt><dd>{data.current_certificates.find((row)=>row.record_status==="CURRENT")?.certificate_number||"Geen"}</dd></div></dl>{data.work_orders.map((row)=><div className="inspection-workorder" key={row.atrium_work_order_key}><strong>{row.atrium_work_order_code} ; {row.work_order_title}</strong><span>{row.raw_status} ; {(INSPECTION_APPOINTMENT_LABELS[row.mapped_status] || row.mapped_status)}</span><small>Live gecontroleerd {formatDate(row.last_verified_at)}</small></div>)}</article>
    </section>
    <section hidden={view!=="dossier"} data-current-step={stepSection("checklist")} id="inspection-checklist" className="card inspection-section"><div className="inspection-section__head"><div><h2>Voorbereidingschecklist</h2><p className="ember-page-subtitle">Kies uit de actieve documenten van deze installatie. Beschikbaar betekent dat het document is gekoppeld; Gecontroleerd kies je na inhoudelijke controle.</p></div></div><div className="inspection-checklist">{data.checklist.map((row)=><div className="inspection-checklist__row inspection-checklist__row--wide" key={row.inspection_case_document_requirement_id}><div><strong>{(INSPECTION_CHECKLIST_LABELS[row.requirement_key] || row.requirement_key.replaceAll("_"," "))}</strong><small>{row.document_title||row.file_name||"Nog geen document gekoppeld"}</small><small>{data.document_choices.filter(doc=>doc.document_type_key===row.document_type_key).length} actieve documenten van dit type in Ember</small>{row.requirement_level==="OPTIONAL"?<small>Alleen nodig indien van toepassing; bijvoorbeeld wanneer er een nota van aanvulling is.</small>:null}{can("inspection.checklist.manage")&&!row.follow_up_action_id&&row.status==="MISSING"?<button className="btn btn-secondary btn-compact" disabled={busy} onClick={()=>void createChecklistAction(row)}>Actie aanmaken</button>:null}</div><select className="input" disabled={busy||!can("inspection.checklist.manage")} value={row.installation_document_id||""} onChange={(e)=>void setChecklist(row,e.target.value?"AVAILABLE":"MISSING",e.target.value)}><option value="">Geen document gekoppeld</option>{data.document_choices.filter((doc)=>doc.document_type_key===row.document_type_key || doc.document_id===row.installation_document_id).map((doc)=><option key={doc.document_id} value={doc.document_id}>{doc.title||doc.file_name}</option>)}</select><select className="input" disabled={busy||!can("inspection.checklist.manage")} value={row.status} onChange={(e)=>void setChecklist(row,e.target.value)}><option value="MISSING">Ontbreekt</option><option value="AVAILABLE">Beschikbaar</option><option value="CHECKED">Gecontroleerd</option><option value="SENT">Verzonden</option><option value="WAIVED">Niet van toepassing</option></select></div>)}</div></section>
    <section className="inspection-detail-grid">
      <article hidden={view!=="dossier"} data-current-step={stepSection("package")} className="card inspection-section"><div className="inspection-section__head"><div><h2>Documentpakket</h2><p className="ember-page-subtitle">Selecteer de documenten die de keuringsinstantie nodig heeft. Het pakket bewaart de geselecteerde bestandsversies.</p></div>{can("inspection.package.prepare")?<button className="btn" disabled={busy||!selectedPackageDocs.length} onClick={()=>void preparePackageNow()}>Pakket voorbereiden</button>:null}</div><div className="inspection-document-choice-list">{data.document_choices.map((doc)=><label key={doc.document_id}><input disabled={!can("inspection.package.prepare")} type="checkbox" checked={selectedPackageDocs.includes(doc.document_id)} onChange={(e)=>setSelectedPackageDocs((current)=>e.target.checked?[...current,doc.document_id]:current.filter((id)=>id!==doc.document_id))}/><span><strong>{doc.title||doc.file_name}</strong><small>{doc.document_type_key}</small></span></label>)}</div><div className="inspection-timeline">{data.packages.map((pkg)=><div key={pkg.inspection_case_document_package_id}><strong>Documentpakket v{pkg.package_version}</strong><span>{pkg.package_status} ; {pkg.items.length} bestanden</span>{can("inspection.package.send")&&pkg.package_status==="DRAFT"?<button className="btn btn-secondary btn-compact" disabled={busy} onClick={()=>void sendPackageNow(pkg)}>Verzending registreren</button>:null}</div>)}</div></article>
      <article hidden={view!=="dossier"} data-current-step={stepSection("report")} id="inspection-report" className="card inspection-section"><h2>Inspectierapport</h2><p className="muted">{reportEditingAllowed ? "Upload hierboven het inspectierapport of kies een eerder geüpload rapport. Vul de inspectiedatum in en klik op Rapport registreren." : "Rapport registreren wordt beschikbaar nadat de inspectie als uitgevoerd is vastgelegd. Eerder ontvangen rapporten blijven hieronder zichtbaar."}</p><div className="inspection-editor-grid"><label className="inspection-editor-grid__wide"><span>Exact rapportbestand</span><select className="input" disabled={busy || !can("inspection.report.register") || !["EXECUTED_AWAITING_REPORT","REPORT_RECEIVED"].includes(item.status)} value={report.document_id} onChange={(e)=>setReport((v)=>({...v,document_id:e.target.value}))}><option value="">Kies een inspectierapport</option>{data.document_choices.filter((doc)=>doc.document_type_key==="inspectierapport").map((doc)=><option key={doc.document_id} value={doc.document_id}>{doc.title||doc.file_name}</option>)}</select></label><label><span>Inspectiedatum</span><input className="input" disabled={busy || !reportEditingAllowed} type="date" value={report.inspection_date} onChange={(e)=>setReport((v)=>({...v,inspection_date:e.target.value}))}/></label><label><span>Voorlopige conclusie</span><select className="input" disabled={busy || !reportEditingAllowed} value={report.conclusion} onChange={(e)=>setReport((v)=>({...v,conclusion:e.target.value}))}><option value="PENDING">Nog te beoordelen</option><option value="PASS">Goedgekeurd</option><option value="FAIL">Tekortkomingen</option></select></label><label><span>Keuringsinstantie</span><input className="input" disabled={busy || !reportEditingAllowed} value={report.inspection_body} onChange={(e)=>setReport((v)=>({...v,inspection_body:e.target.value}))}/></label><label><span>Rapportreferentie</span><input className="input" disabled={busy || !reportEditingAllowed} value={report.report_reference} onChange={(e)=>setReport((v)=>({...v,report_reference:e.target.value}))}/></label></div>{can("inspection.report.register")?<button className="btn" disabled={busy||!report.document_id||!["EXECUTED_AWAITING_REPORT","REPORT_RECEIVED"].includes(item.status)} onClick={()=>void registerReportNow()}>Rapport registreren</button>:null}<div className="inspection-timeline">{data.reports.map((row)=><div key={row.inspection_case_report_id}><strong>{row.document_title||row.file_name}</strong><span>{row.conclusion} ; ontvangen {formatDate(row.received_at)}</span></div>)}</div></article>
    </section>
    <section className="inspection-detail-grid">
      <article hidden={view!=="dossier"} data-current-step={stepSection("conclusion")} className="card inspection-section">
        <h2 id="inspection-conclusion">Conclusie en afronding</h2>
        <p className="muted">Kies één combinatiecertificaat of de losse certificaten die samen alle dossierscopes dekken.</p>
        {item.status === "REPORT_RECEIVED" && can("inspection.conclusion.process") ?
          <details><summary>Certificaat uploaden en registreren</summary>
            <CertificatesTab code={item.atrium_installation_code} onCertificateSaved={load}/>
          </details> : null}
        <fieldset disabled={busy || !can("inspection.conclusion.process") || item.status !== "REPORT_RECEIVED"}>
          <legend>Inspectiecertificaten voor goedkeuring</legend>
          {data.certificate_choices.map((cert) => <label className="ui-stack-sm" key={cert.installation_certificate_id}>
            <span><input type="checkbox" checked={certificateIds.includes(cert.installation_certificate_id)}
              onChange={(event) => setCertificateIds((ids) => event.target.checked ? [...ids, cert.installation_certificate_id] : ids.filter((id) => id !== cert.installation_certificate_id))}/>
              {cert.certificate_number || cert.description}</span>
          </label>)}
          {!data.certificate_choices.length ? <p className="muted">Nog geen geldig inspectiecertificaat beschikbaar. Upload en registreer het certificaat hierboven.</p> : null}
        </fieldset>
        <div className="guidance-media-actions">
          {can("inspection.conclusion.process") ? <>
            <button className="btn" disabled={busy || !certificateIds.length || item.status !== "REPORT_RECEIVED"} onClick={() => void conclude("PASS")}>Goedgekeurd vastleggen</button>
            <button className="btn btn-secondary" disabled={busy || item.status !== "REPORT_RECEIVED"} onClick={() => void conclude("FAIL")}>Afgekeurd; herstelactie aanmaken</button>
          </> : null}
          {can("inspection.reinspection.create") ? <button className="btn btn-secondary" disabled={busy || item.conclusion !== "FAIL"} onClick={() => void reinspection()}>Herinspectie aanmaken</button> : null}
          {can("inspection.complete") ? <button className="btn" disabled={busy || item.status !== "CERTIFICATE_RECEIVED"} onClick={() => void complete()}>Dossier afronden</button> : null}
        </div>
      </article>
      <article hidden={view!=="dossier"} data-current-step={stepSection("actions")} className="card inspection-section"><h2 id="inspection-actions">Open acties</h2><div className="inspection-timeline">{data.actions.map((action)=><div key={action.follow_up_action_id}><strong>{action.workflow_title}</strong><span>{action.status_display_name||action.status} ; {action.responsibility_type}</span>{(action.drawing_pins||[]).map((pin)=><Link className="btn btn-secondary btn-compact" key={pin.drawing_pin_id} to={`/installaties/${encodeURIComponent(item.atrium_installation_code)}?tab=drawings&drawing=${encodeURIComponent(pin.installation_document_id)}&page=${encodeURIComponent(pin.page_number)}&pin=${encodeURIComponent(pin.drawing_pin_id)}`}>Toon op tekening ; pagina {pin.page_number}</Link>)}</div>)}{!data.actions.length?<p className="ember-page-subtitle">Geen acties voor deze inspectiecase.</p>:null}</div></article>
    </section>
    {permissions.includes("inspection.audit.view")?<section hidden={view!=="dossier"} className="card inspection-section">
      <div className="inspection-section__head"><div><h2 id="inspection-history">Wie deed wat, wanneer</h2><p className="ember-page-subtitle">Elke wijziging aan dit dossier, nieuwste eerst. Vastgelegd door Ember; niet te bewerken.</p></div></div>
      <ol className="inspection-audit">{inspectionAuditTrail(auditEvents).map((entry)=><li key={entry.id}>
        <div className="inspection-audit__head"><strong>{entry.what}</strong><span>{entry.at}</span></div>
        <div className="inspection-audit__by">door {entry.by}</div>
        {entry.changes.length?<ul className="inspection-audit__changes">{entry.changes.map((change)=><li key={change.field}>
          <span>{change.label}</span><i>{change.from}</i><span aria-hidden="true">&rarr;</span><b>{change.to}</b>
        </li>)}</ul>:null}
      </li>)}{!auditEvents.length?<li className="muted">Nog geen wijzigingen vastgelegd.</li>:null}</ol>
    </section>:null}
  </div>
}
