import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Shared presentation rules; no replacement for server gates.
import {inspectionSections,inspectionPhaseStates} from '../../src/lib/inspectionProcess.js';
test('only relevant process sections appear',()=>{
  assert.deepEqual(inspectionSections('EXECUTED_AWAITING_REPORT'),['report']);
  assert.deepEqual(inspectionSections('REPORT_RECEIVED'),['report','conclusion']);
  assert.deepEqual(inspectionSections('COMPLETED'),['history']);
  assert.ok(!inspectionSections('PLANNED_CONFIRMED').includes('conclusion'));
});
test('green phases require evidence and cancellation does not imply completion',()=>{
  const phases=inspectionPhaseStates('PLANNED_CONFIRMED',[{before_json:'{"status":"OFFER_REQUIRED"}',after_json:'{"status":"ORDERED"}'}]);
  assert.equal(phases[0].state,'done');assert.equal(phases[1].state,'current');assert.equal(phases[2].state,'pending');
  assert.equal(inspectionPhaseStates('PLANNED_CONFIRMED',[])[0].state,'pending');
  assert.ok(inspectionPhaseStates('CANCELLED',[]).every((p:any)=>p.state==='cancelled'));
});
