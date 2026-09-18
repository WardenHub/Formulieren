import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectionAuditEntry, inspectionAuditTrail, inspectionEventChanges} from '../../src/lib/inspectionAudit.js';

const before = {status:'PLANNING_REQUIRED', planned_date:null, inspection_body:null, due_date:'2026-12-31', logbook_linked:false};
const after  = {status:'PLANNED_CONFIRMED', planned_date:'2026-10-01', inspection_body:'Kiwa', due_date:'2026-12-31', logbook_linked:true};

test('een gebeurtenis wordt een gewone zin met wie en wanneer',()=>{
  const entry = inspectionAuditEntry({
    inspection_case_event_id:'e1', event_type:'STATUS_CHANGED', event_at:'2026-09-17T08:30:00Z',
    event_by:'adminwb@wardenburg.nl', before_json:JSON.stringify(before), after_json:JSON.stringify(after),
  });
  assert.equal(entry.what,'Status gewijzigd');
  assert.equal(entry.by,'adminwb@wardenburg.nl');
  assert.match(entry.at,/2026/);
});

test('alleen de velden die werkelijk veranderden komen terug, met labels',()=>{
  const changes = inspectionEventChanges({before_json:JSON.stringify(before), after_json:JSON.stringify(after)});
  assert.deepEqual(changes.map((c:any)=>c.field),['status','planned_date','inspection_body','logbook_linked']);
  assert.deepEqual(changes[0],{field:'status',label:'Status',from:'Planning nodig',to:'Gepland; bevestigd'});
  assert.equal(changes[1].from,'leeg');
  assert.match(changes[1].to,/2026/);
  assert.deepEqual(changes[3],{field:'logbook_linked',label:'Digitaal logboek gekoppeld',from:'nee',to:'ja'});
});

test('een gebeurtenis zonder bruikbare momentopname toont alleen zichzelf',()=>{
  assert.deepEqual(inspectionEventChanges({event_type:'CASE_CREATED', after_json:'{'}),[]);
  const entry = inspectionAuditEntry({event_type:'CASE_CREATED', event_at:'2026-09-17T08:00:00Z', event_by:null});
  assert.equal(entry.what,'Dossier aangemaakt');
  assert.equal(entry.by,'Ember zelf','zonder actor is Ember de bron, niet een lege naam');
  assert.deepEqual(entry.changes,[]);
});

test('een onbekende gebeurtenis blijft leesbaar in plaats van een code',()=>{
  assert.equal(inspectionAuditEntry({event_type:'IETS_NIEUWS'}).what,'IETS NIEUWS');
  assert.equal(inspectionAuditTrail(null).length,0);
  assert.equal(inspectionAuditTrail([{event_type:'CASE_COMPLETED'}])[0].what,'Dossier afgerond');
});
