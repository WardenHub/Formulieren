import test from "node:test";
import assert from "node:assert/strict";
import { certificationDate, certificationIdentifier, CertificationValidationError } from "../src/utils/certificationValidation.js";
import { requireRole } from "../src/middleware/roleMiddleware.js";

test("SQL sequential identifiers and random UUIDs are accepted without truncation", () => {
  for (const id of ["5FF26647-92AE-F111-9B33-7CED8D030A33","3179AD6D-0DE7-484D-874C-4370FB11ABE1"]) {
    assert.equal(certificationIdentifier(id), id);
  }
  for (const id of ["", "not-a-key", "3179AD6D-0DE7-484D-874C-4370FB11ABE1extra"]) {
    assert.throws(() => certificationIdentifier(id), CertificationValidationError);
  }
  assert.equal(certificationIdentifier(null, false), null);
});

test("inspection dates preserve real dates and optional absence", () => {
  for (const value of [undefined, null, ""]) assert.equal(certificationDate(value), null);
  for (const value of ["2024-02-29", "2026-09-12"]) assert.equal(certificationDate(value), value);
});
test("impossible dates are user errors, not silently normalized", () => {
  for (const value of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "12-09-2026"]) {
    assert.throws(() => certificationDate(value), CertificationValidationError);
  }
  assert.equal(new CertificationValidationError("test").status, 400);
});
test("actual role middleware limits certification writes to coordinator and admin", () => {
  for (const role of ["gebruiker", "documentbeheerder", "kam_coordinator", "certificering_coordinator", "admin"]) {
    let passed = false;
    let status = 0;
    const res: any = { status(code: number) { status = code; return this; }, json() {} };
    requireRole("admin", "certificering_coordinator")({ roles: [role] }, res, () => { passed = true; });
    assert.equal(passed, ["admin", "certificering_coordinator"].includes(role));
    assert.equal(status, passed ? 0 : 403);
  }
});
