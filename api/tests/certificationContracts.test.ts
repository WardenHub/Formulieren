import test from "node:test";
import assert from "node:assert/strict";
import { listInspectionOverviewSql } from "../src/db/queries/inspections.sql.js";
import { resolveInspectionChecklistFromDocumentsSql } from "../src/db/queries/inspections.sql.js";
import { completeInspectionCaseSql, getInspectionCaseSql, processInspectionConclusionSql, signalInspectionCasesSql, refreshInspectionWorkOrdersSql, updateInspectionCaseSql, updateInspectionAssignmentSql, updateInspectionChecklistItemSql } from "../src/db/queries/inspections.sql.js";
import { getCertificationContextSql } from "../src/db/queries/certificationContext.sql.js";
import { getInstallationOperationalRowsSql } from "../src/db/queries/installationOperational.sql.js";
import { certificationPolicyCtes } from "../src/db/queries/certificationPolicy.sql.js";

// Structural regression checks supplement the live read-only SQL scenarios.
// They do not replace transactional API tests with uploaded files.
test("automatic checklist resolution preserves closed cases and requires a surviving exact file", () => {
  const sql = resolveInspectionChecklistFromDocumentsSql;
  assert.match(sql, /InspectionCase with \(updlock, holdlock\)/);
  assert.match(sql, /@caseStatus in \(N'COMPLETED', N'CANCELLED'\)/);
  assert.ok(sql.indexOf("select 0 as linked_count") < sql.indexOf("update r"));
  assert.match(sql, /join dbo\.StoredFile sf on sf\.stored_file_id = d\.stored_file_id and sf\.is_deleted = 0/);
  assert.match(sql, /d\.is_active = 1/);
  assert.match(sql, /d\.document_type_key = r\.document_type_key/);
  assert.match(sql, /r\.status = N'MISSING'/);
  assert.match(sql, /r\.installation_document_id is null/);
  assert.match(sql, /d\.created_at desc, d\.document_id desc/);
  assert.match(sql, /md\.maintenance_date>pick\.document_date/);
  assert.match(sql, /fi\.status=N'AFGEHANDELD'/);
  assert.match(sql, /fd\.code=N'MAINT_BMI'/);
});
test("monitor planning signals follow Ember planning rather than the Atrium snapshot", () => {
  assert.match(listInspectionOverviewSql, /@attentionFilter<>N'PLANNING_MISSING' or c\.inspection_case_id is not null and c\.planned_date is null/);
  assert.match(listInspectionOverviewSql, /@attentionFilter<>N'APPOINTMENT_UNCONFIRMED' or c\.status=N'PLANNED_UNCONFIRMED'/);
  assert.doesNotMatch(listInspectionOverviewSql, /@attentionFilter<>N'PLANNING_MISSING'[^\n]*c\.appointment_status/);
});

test("details and map embed exactly the shared requirement policy", () => {
  assert.ok(getCertificationContextSql.includes(certificationPolicyCtes));
  assert.ok(getInstallationOperationalRowsSql.includes(certificationPolicyCtes));
});
test("signal generation uses only inspection requirements and excludes archives", () => {
  assert.match(signalInspectionCasesSql, /cs\.certificate_type=N'INSPECTION'/);
  assert.match(signalInspectionCasesSql, /a\.installation_status/);
  assert.match(signalInspectionCasesSql, /join @created newcase/);
});
test("inspection conclusion verifies combined selection and stores all IDs in audit", () => {
  assert.match(processInspectionConclusionSql, /openjson\(@certificateIdsJson\)/);
  assert.match(processInspectionConclusionSql, /cert\.record_status=N'CURRENT'/);
  assert.match(processInspectionConclusionSql, /cert\.verification_status=N'VERIFIED'/);
  assert.match(processInspectionConclusionSql, /sf\.is_deleted=0/);
  assert.match(processInspectionConclusionSql, /'certificateIds':json_query\(@certificateIdsJson\)/);
});
test("completion rechecks scope coverage and is gated by received certificate", () => {
  assert.match(completeInspectionCaseSql, /status=N'CERTIFICATE_RECEIVED'/);
  assert.match(completeInspectionCaseSql, /from dbo\.InspectionCaseScope cs/);
  assert.match(completeInspectionCaseSql, /cert\.source_inspection_case_id=@caseId/);
});
test("workorder refresh requires explicit choice when multiple candidates exist", () => {
  assert.match(refreshInspectionWorkOrdersSql, /atrium_work_order_key=@selectedKey/);
  assert.match(refreshInspectionWorkOrdersSql, /count\(\*\) from openjson\(@rowsJson\)\)=1/);
  assert.doesNotMatch(refreshInspectionWorkOrdersSql, /set\s+status=/i);
});
test("document choices use the confirmed StoredFile MIME column", () => {
  assert.match(getInspectionCaseSql, /sf\.mime_type as content_type/);
  assert.doesNotMatch(getInspectionCaseSql, /sf\.content_type/);
});

test("inspection detail uses distinct hex aliases beside binary row versions", () => {
  for (const alias of ["c", "r", "p"]) {
    assert.ok(getInspectionCaseSql.includes(`convert(varchar(18), convert(binary(8), ${alias}.row_version), 1) as row_version_hex`));
  }
  assert.doesNotMatch(getInspectionCaseSql, /convert\(varchar\(18\), [crp]\.row_version, 1\) as row_version[,\s]/);
});

test("inspection write responses serialize rowversion through explicit binary conversion", () => {
  for (const sql of [updateInspectionCaseSql, updateInspectionAssignmentSql, updateInspectionChecklistItemSql]) {
    assert.ok(sql.includes("convert(varchar(18), convert(binary(8), row_version), 1) as row_version"));
    assert.match(sql, /row_version=convert\(binary\(8\),@rowVersion,1\)/);
  }
});

test("editable phases come from active transitions and exclude dedicated workflow gates", () => {
  assert.match(getInspectionCaseSql, /c\.status=t\.source_status/);
  assert.match(getInspectionCaseSql, /t\.is_active=1/);
  assert.match(getInspectionCaseSql, /t\.target_status not in\(N'REPORT_RECEIVED',N'REPAIR_REQUIRED',N'REINSPECTION_REQUIRED',N'CERTIFICATE_RECEIVED',N'COMPLETED'\)/);
});
