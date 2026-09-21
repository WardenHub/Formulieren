import test from "node:test";
import assert from "node:assert/strict";
import { maintenanceEvidence } from "../src/services/inspectionMaintenanceEvidence.js";

const candidate = (source: "FORM_RUNNER" | "ATTACHMENT", date: string | null, id = "1") => ({source, maintenance_date: date, source_id: id, title: source, form_status: "AFGEHANDELD"});
const now = new Date("2026-09-21T12:00:00Z");
test("only definitive forms qualify, even when a draft is newer", () => {
  for (const status of ["CONCEPT", "INGEDIEND", "IN_BEHANDELING", "INGETROKKEN", ""]) {
    const result = maintenanceEvidence([{...candidate("FORM_RUNNER", "2026-09-20"), form_status: status}, candidate("ATTACHMENT", "2026-09-01")], now);
    assert.equal(result.latest?.source, "ATTACHMENT");
  }
});
test("action counts distinguish certificate blockers and do not infer issuance", () => {
  const result = maintenanceEvidence([{...candidate("FORM_RUNNER", "2026-09-01"), open_count: 3, certificate_blocking_count: 1}], now);
  assert.equal(result.certificate_assessment?.open_count, 3);
  assert.equal(result.certificate_assessment?.label, "Certificaatblokkerende punten aanwezig");
  assert.equal(maintenanceEvidence([candidate("FORM_RUNNER", "2026-09-01")], now).certificate_assessment?.label, "Certificaatresultaat onbekend");
  assert.equal(maintenanceEvidence([candidate("ATTACHMENT", "2026-09-01")], now).certificate_assessment, null);
});
test("newest maintenance date wins regardless of source", () => {
  assert.equal(maintenanceEvidence([candidate("FORM_RUNNER", "2026-08-01"), candidate("ATTACHMENT", "2026-09-01")], now).latest?.source, "ATTACHMENT");
  assert.equal(maintenanceEvidence([candidate("FORM_RUNNER", "2026-09-01"), candidate("ATTACHMENT", "2026-08-01")], now).latest?.source, "FORM_RUNNER");
});
test("warning starts after calendar anniversary, not on it", () => {
  assert.equal(maintenanceEvidence([candidate("ATTACHMENT", "2025-09-21")], now).older_than_year, false);
  assert.equal(maintenanceEvidence([candidate("ATTACHMENT", "2025-09-20")], now).older_than_year, true);
  assert.equal(maintenanceEvidence([candidate("FORM_RUNNER", "2024-02-29")], new Date("2025-02-28T12:00:00Z")).older_than_year, false);
  assert.equal(maintenanceEvidence([candidate("FORM_RUNNER", "2024-02-29")], new Date("2025-03-01T12:00:00Z")).older_than_year, true);
});
test("missing, invalid and future dates do not masquerade as latest maintenance", () => {
  const result = maintenanceEvidence([candidate("FORM_RUNNER", null), candidate("FORM_RUNNER", "2026-02-30"), candidate("ATTACHMENT", "2027-01-01")], now);
  assert.equal(result.latest, null);
  assert.equal(result.undated_count, 2);
  assert.equal(result.future_dated_count, 1);
  assert.equal(result.warning, null);
});
test("SQL Date values and ties remain explicit and deterministic", () => {
  const a = candidate("ATTACHMENT", "2026-09-01");
  const b = {...candidate("FORM_RUNNER", null), maintenance_date: new Date("2026-09-01T00:00:00Z")};
  assert.deepEqual(maintenanceEvidence([a,b], now), maintenanceEvidence([b,a], now));
  assert.equal(maintenanceEvidence([a,b], now).same_date_count, 2);
});
