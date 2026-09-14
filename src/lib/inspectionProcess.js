export const INSPECTION_PHASES = [
  { id:'offer', label:'Offerte', short:'Offerte', description:'Calculeren en offreren', statuses:['ATTENTION_REQUIRED','OFFER_REQUIRED'] },
  { id:'plan', label:'Opdracht en planning', short:'Planning', description:'Opdracht verwerken, inplannen en voorbereiden', statuses:['ORDERED','PLANNING_REQUIRED','PLANNED_UNCONFIRMED','PLANNED_CONFIRMED'] },
  { id:'execute', label:'Uitvoering', short:'Uitvoering', description:'Inspectie uitgevoerd; rapport registreren', statuses:['EXECUTED_AWAITING_REPORT'] },
  // Rapport en herstel kan zich herhalen; iedere herinspectie is een eigen dossier
  // met een eigen ronde, gekoppeld via parent_inspection_case_id.
  { id:'review', label:'Rapport en herstel', short:'Beoordeling', description:'Rapport beoordelen en tekortkomingen oppakken', repeatable:true, statuses:['REPORT_RECEIVED','REPAIR_REQUIRED','REINSPECTION_REQUIRED'] },
  { id:'close', label:'Certificaat en afronding', short:'Afronding', description:'Certificaat verwerken en administratief afronden', statuses:['CERTIFICATE_RECEIVED','COMPLETED'] },
];

export function inspectionPhase(status) {
  return INSPECTION_PHASES.find(phase=>phase.statuses.includes(status))?.id || null;
}

export function inspectionSections(status) {
  switch(inspectionPhase(status)) {
    case 'offer': return ['control'];
    case 'plan': return ['control','workorder','checklist','package'];
    case 'execute': return ['report'];
    case 'review': return status==='REPORT_RECEIVED' ? ['report','conclusion'] : ['conclusion','actions'];
    case 'close': return status==='COMPLETED' ? ['history'] : ['control','checklist','conclusion','actions'];
    default: return ['history'];
  }
}

// Green is based on recorded history, not an assumption that every earlier phase occurred.
// `passed` zegt alleen dat de fase achter de huidige stap ligt; dat is navigatie-informatie
// en nadrukkelijk geen bewijs dat de stap ook is doorlopen.
export function inspectionPhaseStates(status, events=[]) {
  const active=inspectionPhase(status);
  const activeIndex=INSPECTION_PHASES.findIndex(phase=>phase.id===active);
  const visited=new Set();
  for(const event of events) {
    for(const raw of [event.before_json,event.after_json,event.before,event.after]) {
      try {const value=typeof raw==='string'?JSON.parse(raw):raw;const phase=inspectionPhase(value?.status);if(phase)visited.add(phase)} catch { /* Incomplete legacy history is not completion evidence. */ }
    }
  }
  return INSPECTION_PHASES.map((phase,index)=>({
    ...phase,
    index,
    passed:status!=='CANCELLED' && activeIndex>=0 && index<activeIndex,
    state:status==='CANCELLED'?'cancelled':phase.id===active?(status==='COMPLETED'?'done':'current'):visited.has(phase.id)?'done':'pending',
  }));
}
