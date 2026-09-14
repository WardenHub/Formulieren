import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Gedeelde frontendhelper; met opzet uitvoerbaar zonder browser.
import { mergeInspectionEditor } from "../../src/lib/inspectionEditor.js";

test("initial dossier starts with server values", () => {
  assert.deepEqual(mergeInspectionEditor({}, null, {status:"ORDERED"}), {status:"ORDERED"});
});
test("refresh preserves unsaved fields and accepts unrelated server changes", () => {
  assert.deepEqual(mergeInspectionEditor(
    {body:"Draft",status:"ORDERED"}, {body:"Old",status:"ORDERED"},
    {body:"Old",status:"PLANNING_REQUIRED"}
  ), {body:"Draft",status:"PLANNING_REQUIRED"});
});
test("saved draft becomes the baseline for later refreshes", () => {
  const saved = mergeInspectionEditor({body:"Draft"}, {body:"Old"}, {body:"Draft"});
  assert.deepEqual(mergeInspectionEditor(saved, {body:"Draft"}, {body:"Updated"}), {body:"Updated"});
});

// Structural guards complement the pure editor tests; browser race acceptance remains separate.
test("dossier navigation remounts all local selections for the new case", () => {
  const source = readFileSync(new URL("../../src/pages/Inspections/InspectionCasePage.jsx", import.meta.url), "utf8");
  assert.match(source, /<InspectionCaseDetail key=\{caseId\} caseId=\{caseId\}/);
});

test("stale detail and audit responses cannot commit after a newer load", () => {
  const source = readFileSync(new URL("../../src/pages/Inspections/InspectionCasePage.jsx", import.meta.url), "utf8");
  assert.match(source, /await getInspectionCase\(caseId\);\s*if\(request!==loadSequence.current\)return/);
  assert.match(source, /await getInspectionCaseEvents\(caseId\);\s*if\(request!==loadSequence.current\)return/);
  assert.match(source, /return\(\)=>\{loadSequence.current\+=1\}/);
});
