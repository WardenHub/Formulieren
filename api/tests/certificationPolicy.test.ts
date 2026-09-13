import test from "node:test";
import assert from "node:assert/strict";
import { assessCertificate, contractState, requirementState, validateCertificateCoverage } from "../src/services/certificationPolicy.js";
import type { CertificateEvidence, RequirementInput } from "../src/services/certificationPolicy.js";

const requirement: RequirementInput = { certificateType: "INSPECTION", scope: "BMI", contract: "ACTIVE", manualRequired: false };
const evidence: CertificateEvidence = { certificate_type: "INSPECTION", scopes: ["BMI", "OAI_B"], record_status: "CURRENT", verification_status: "VERIFIED", stored_file_id: "exact-version", issue_date: "2026-01-01", valid_until: "2027-01-01" };
const evaluate = (r = requirement, docs: CertificateEvidence[] = []) => assessCertificate(r, docs, "2026-09-11");

test("no requirement never reports missing", () => {
  assert.equal(evaluate({ ...requirement, contract: "NONE" }).certificate_status, "NOT_REQUIRED");
});
test("maintenance requires active contract, not manual flag", () => {
  assert.equal(requirementState({ ...requirement, certificateType: "MAINTENANCE", contract: "NONE", manualRequired: true }), "NOT_REQUIRED");
});
test("manual inspection requirement works without a service contract", () => {
  assert.equal(evaluate({ ...requirement, contract: "NONE", manualRequired: true }).certificate_status, "MISSING");
});
test("ended and unknown contracts never turn green", () => {
  assert.equal(evaluate({ ...requirement, contract: "ENDED" }, [evidence]).certificate_status, "CONTRACT_ENDED");
  assert.equal(evaluate({ ...requirement, contract: "UNKNOWN" }, [evidence]).certificate_status, "UNKNOWN");
});
test("maintenance document cannot satisfy inspection", () => {
  assert.equal(evaluate(requirement, [{ ...evidence, certificate_type: "MAINTENANCE" }]).certificate_status, "MISSING");
});
test("one combined document covers both scopes independently", () => {
  assert.equal(evaluate(requirement, [evidence]).certificate_status, "VALID");
  assert.equal(evaluate({ ...requirement, scope: "OAI_B" }, [evidence]).certificate_status, "VALID");
  assert.equal(evaluate({ ...requirement, scope: "OAI_B" }, [{ ...evidence, scopes: ["BMI"] }]).certificate_status, "MISSING");
});
test("historical and revoked evidence cannot satisfy requirement", () => {
  for (const record_status of ["HISTORICAL", "REVOKED"]) assert.equal(evaluate(requirement, [{ ...evidence, record_status }]).certificate_status, "MISSING");
});
test("file, verification and dates are necessary", () => {
  for (const patch of [{ stored_file_id: null }, { verification_status: "UNVERIFIED" }, { valid_until: null }, { issue_date: "2026-12-01" }, { valid_until: "2026-02-30" }]) {
    assert.equal(evaluate(requirement, [{ ...evidence, ...patch }]).certificate_status, "UNKNOWN");
  }
});
test("expiry includes the last valid date", () => {
  assert.equal(evaluate(requirement, [{ ...evidence, valid_until: "2026-09-11" }]).certificate_status, "EXPIRING");
  assert.equal(evaluate(requirement, [{ ...evidence, valid_until: "2026-09-10" }]).certificate_status, "EXPIRED");
});
test("combination must be explicit and applicable", () => {
  assert.doesNotThrow(() => validateCertificateCoverage(["BMI", "OAI_B"], ["BMI", "OAI_B"], true));
  assert.doesNotThrow(() => validateCertificateCoverage(["BMI", "OAI_B"], ["OAI_B"], false));
  assert.throws(() => validateCertificateCoverage(["BMI"], ["BMI", "OAI_B"], true));
  assert.throws(() => validateCertificateCoverage(["BMI", "OAI_B"], ["BMI", "OAI_B"], false));
  assert.throws(() => validateCertificateCoverage([], ["BMI"], false));
});

test("contract and paragraph date bounds cannot hide each other", () => {
  const row = { service_category: "MAINTENANCE", contract_key: "WB|1", contract_historical: "N", paragraph_blocked: "N", document_status_code: "G", contract_end_date: "2026-01-01", paragraph_end_date: "2027-01-01" };
  assert.equal(contractState([row], "MAINTENANCE", "2026-09-11"), "ENDED");
  assert.equal(contractState([{ ...row, contract_end_date: null }], "MAINTENANCE", "2026-09-11"), "ACTIVE");
  assert.equal(contractState([{ ...row, contract_historical: null }], "MAINTENANCE", "2026-09-11"), "UNKNOWN");
  assert.equal(contractState([{ ...row, contract_end_date: null, contract_start_date: "2027-01-01" }], "MAINTENANCE", "2026-09-11"), "FUTURE");
});

test("SQL date objects are accepted", () => {
  assert.equal(evaluate(requirement, [{ ...evidence, issue_date: new Date("2026-01-01") as any, valid_until: new Date("2027-01-01") as any }]).certificate_status, "VALID");
});
