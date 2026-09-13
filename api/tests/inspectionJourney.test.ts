import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Shared browser guidance; server validation remains authoritative.
import { inspectionSaveProblem } from "../../src/lib/inspectionJourney.js";

test("planning explains missing date and inspection body before saving", () => {
  assert.match(inspectionSaveProblem({status:"PLANNED_CONFIRMED"}, null), /inspectiedatum/);
  assert.match(inspectionSaveProblem({status:"PLANNED_CONFIRMED",planned_date:"2026-09-13",inspection_body:"  "}, null), /keuringsinstantie/);
});
test("execution explains required workorder without blocking preparation", () => {
  const editor={status:"EXECUTED_AWAITING_REPORT",planned_date:"2026-09-13",inspection_body:"POC"};
  assert.match(inspectionSaveProblem(editor,null), /Koppel eerst de werkbon/);
  assert.equal(inspectionSaveProblem(editor,"existing-key"),null);
  assert.equal(inspectionSaveProblem({...editor,status:"PLANNED_CONFIRMED"},null),null);
  assert.equal(inspectionSaveProblem({status:"ORDERED"},null),null);
});
