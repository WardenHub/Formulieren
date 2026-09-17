import test from 'node:test';
import assert from 'node:assert/strict';
// Presentatielaag; de API en database blijven de echte poort.
import {inspectionStepQuestions} from '../../src/lib/inspectionQuestions.js';

const pve={document_id:'doc-pve',stored_file_id:'file-pve',document_type_key:'pve',title:'PvE 2026'};
const checklist=[
  {inspection_case_document_requirement_id:'req-pve',requirement_key:'PROGRAM_OF_REQUIREMENTS',document_type_key:'pve',requirement_level:'REQUIRED',status:'MISSING',installation_document_id:null},
  {inspection_case_document_requirement_id:'req-nva',requirement_key:'NOTICE_OF_ADDITION',document_type_key:'nva',requirement_level:'OPTIONAL',status:'MISSING',installation_document_id:null},
];

function planStep(overrides:any={}) {
  return inspectionStepQuestions({
    caseItem:{status:'PLANNING_REQUIRED',atrium_work_order_key:null,atrium_work_order_code:null},
    editor:{status:'PLANNING_REQUIRED',planned_date:'',inspection_body:''},
    checklist,documentChoices:[pve],workOrders:[],
    editableStatuses:['CANCELLED','PLANNED_CONFIRMED','PLANNED_UNCONFIRMED'],
    ...overrides,
  });
}

test('de planningsstap stelt de vragen van die stap en niets meer',()=>{
  const step=planStep();
  assert.equal(step.phaseId,'plan');
  assert.equal(step.stepNumber,2);
  const ids=step.questions.map((question:any)=>question.id);
  assert.deepEqual(ids.slice(0,3),['inspection-body','planned-date','appointment-confirmed']);
  assert.ok(ids.includes('work-order'));
  assert.ok(ids.includes('checklist-req-pve'));
  assert.ok(!ids.includes('report-file'),'rapportvragen horen bij de uitvoeringsstap');
  assert.equal(step.primary.action,'save-case');
});

test('alleen overgangen die de database toestaat worden aangeboden',()=>{
  const offered=planStep().questions.find((question:any)=>question.id==='appointment-confirmed').control.options.map((option:any)=>option.value);
  assert.deepEqual(offered,['PLANNED_CONFIRMED','PLANNED_UNCONFIRMED']);
  const locked=planStep({editableStatuses:[]}).questions.find((question:any)=>question.id==='appointment-confirmed');
  assert.equal(locked,undefined);
});

test('een enkel actief document wordt als antwoord voorgesteld, niet stil ingevuld',()=>{
  const question=planStep().questions.find((q:any)=>q.id==='checklist-req-pve');
  assert.equal(question.answered,false);
  assert.equal(question.control.suggestion.documentId,'doc-pve');
  assert.equal(question.control.documentId,'');
});

test('wat Ember al heeft wordt samengevat en niet meer gevraagd',()=>{
  const linked=planStep({checklist:[
    {...checklist[0],status:'AVAILABLE',installation_document_id:'doc-pve',document_title:'PvE 2026'},
    {...checklist[1],status:'WAIVED'},
  ]});
  assert.equal(linked.questions.find((q:any)=>q.id==='checklist-req-pve'),undefined,'geen losse vraag meer');
  assert.equal(linked.questions.find((q:any)=>q.id==='checklist-req-nva'),undefined);
  const summary=linked.questions.find((q:any)=>q.id==='checklist-ready');
  assert.equal(summary.answered,true);
  assert.equal(summary.control.lines.length,2);
  assert.ok(summary.control.lines[0].includes('PvE 2026'));
  assert.ok(summary.control.lines[1].includes('Niet van toepassing'));
});

test('alleen ontbrekende documenten blijven een vraag, naast de samenvatting',()=>{
  const mixed=planStep({checklist:[
    {...checklist[0],status:'AVAILABLE',installation_document_id:'doc-pve',document_title:'PvE 2026'},
    checklist[1],
  ]});
  const ids=mixed.questions.map((q:any)=>q.id);
  assert.ok(ids.includes('checklist-ready'));
  assert.ok(ids.includes('checklist-req-nva'));
  assert.ok(!ids.includes('checklist-req-pve'));
  assert.ok(mixed.questions.find((q:any)=>q.id==='checklist-ready').answer.includes('1 gereed'));
});

test('open verplichte vragen worden geteld zodat de gebruiker weet wat er nog moet',()=>{
  assert.ok(planStep().openQuestionCount>0);
  const complete=planStep({
    caseItem:{status:'PLANNED_CONFIRMED',atrium_work_order_key:'wb-1',atrium_work_order_code:'WB100'},
    editor:{status:'PLANNED_CONFIRMED',planned_date:'2026-10-01',inspection_body:'Kiwa'},
    checklist:[{...checklist[0],status:'CHECKED',installation_document_id:'doc-pve'},{...checklist[1],status:'WAIVED'}],
    editableStatuses:['CANCELLED','EXECUTED_AWAITING_REPORT'],
  });
  assert.equal(complete.openQuestionCount,0);
});

function executeStep(report:any={}) {
  return inspectionStepQuestions({
    caseItem:{status:'EXECUTED_AWAITING_REPORT',inspection_body:'Kiwa'},editor:{status:'EXECUTED_AWAITING_REPORT'},
    documentChoices:[{document_id:'doc-rap',document_type_key:'inspectierapport',title:'Rapport'}],
    report:{document_id:'',conclusion:'PENDING',inspection_date:'',inspection_body:'',report_reference:'',...report},
  });
}

test('de uitvoeringsstap vraagt om het rapport en registreert dat apart',()=>{
  const step=executeStep();
  assert.equal(step.phaseId,'execute');
  assert.equal(step.primary.action,'register-report');
  assert.deepEqual(step.questions.map((question:any)=>question.id),['report-file','report-date','report-reference','report-conclusion']);
});

test('de keuringsinstantie wordt per ronde gevraagd en daarna niet opnieuw',()=>{
  const open=planStep().questions.map((question:any)=>question.id);
  assert.ok(open.includes('inspection-body'),'zolang de ronde er geen heeft blijft het een vraag');
  const known=planStep({caseItem:{status:'PLANNING_REQUIRED',inspection_body:'Kiwa'}}).questions.map((question:any)=>question.id);
  assert.ok(!known.includes('inspection-body'));
  assert.ok(!executeStep().questions.some((question:any)=>question.id==='report-body'));
  const facts=planStep({caseItem:{status:'PLANNING_REQUIRED',inspection_body:'Kiwa',atrium_work_order_code:'WB100'}}).roundFacts;
  assert.deepEqual(facts.map((fact:any)=>`${fact.label}=${fact.value}`),['Ronde=Eerste inspectieronde','Keuringsinstantie=Kiwa','Werkbon=WB100']);
});

test('de stapknop draagt de naam van de stap waar hij naartoe brengt',()=>{
  const staying=planStep();
  assert.equal(staying.primary.label,'Gegevens van deze stap opslaan');
  const moving=planStep({editor:{status:'PLANNED_CONFIRMED',planned_date:'2026-10-01',inspection_body:'Kiwa'}});
  assert.equal(moving.primary.label,'Volgende: gepland; bevestigd');
  assert.equal(executeStep().primary.label,'Volgende: rapport beoordelen');
});

test('de stapknop gaat pas open wanneer de gegevens die hij wegschrijft compleet zijn',()=>{
  const missing=planStep({editor:{status:'PLANNED_CONFIRMED',planned_date:'',inspection_body:''}});
  assert.match(missing.primary.blockedReason,/keuringsinstantie/i);
  const ready=planStep({editor:{status:'PLANNED_CONFIRMED',planned_date:'2026-10-01',inspection_body:'Kiwa'}});
  assert.equal(ready.primary.blockedReason,null);
  assert.equal(executeStep().primary.blockedReason!==null,true);
  assert.equal(executeStep({document_id:'doc-rap',inspection_date:'2026-09-08'}).primary.blockedReason,null);
});

test('een ontbrekend checklistdocument blokkeert de stapknop niet; dat slaat zichzelf op',()=>{
  const ready=planStep({editor:{status:'PLANNED_CONFIRMED',planned_date:'2026-10-01',inspection_body:'Kiwa'}});
  assert.equal(ready.questions.find((question:any)=>question.id==='checklist-req-pve').answered,false);
  assert.equal(ready.primary.blockedReason,null);
});

test('de herstelstap benoemt de offerteroute en de volgende ronde',()=>{
  const step=inspectionStepQuestions({
    caseItem:{status:'REPAIR_REQUIRED',conclusion:'FAIL',inspection_type:'REINSPECTION'},
    editor:{status:'REPAIR_REQUIRED'},actions:[{workflow_title:'Herstel melder 12',status:'OPEN'}],
  });
  const ids=step.questions.map((question:any)=>question.id);
  assert.deepEqual(ids,['open-actions','repair-route','reinspection']);
  assert.equal(step.roundFacts[0].value,'Herinspectieronde');
  assert.equal(step.primary,null,'herstel kent geen stapknop; de acties zijn expliciet');
});

test('goedkeuren blijft geblokkeerd zolang er geen dekkend certificaat is gekozen',()=>{
  const build=(ids:string[])=>inspectionStepQuestions({
    caseItem:{status:'REPORT_RECEIVED'},editor:{status:'REPORT_RECEIVED'},
    certificateChoices:[{installation_certificate_id:'cert-1',certificate_number:'NIM-1'}],certificateIds:ids,
  }).questions.find((question:any)=>question.id==='verdict').control.options[0];
  assert.equal(build([]).disabled,true);
  assert.equal(build(['cert-1']).disabled,false);
  assert.equal(build(['cert-1']).action,'conclude-pass');
});

test('een afgerond dossier krijgt geen knoppen meer',()=>{
  const step=inspectionStepQuestions({caseItem:{status:'COMPLETED'},editor:{status:'COMPLETED'}});
  assert.equal(step.phaseId,'close');
  assert.equal(step.primary,null);
  assert.deepEqual(step.questions.map((question:any)=>question.id),['closed']);
});
