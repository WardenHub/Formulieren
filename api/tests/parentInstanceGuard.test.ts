// Ouder en kind horen bij hetzelfde onderwerp. Deze test legt vast dat die regel op één
// plek staat en dat alle drie de routes hem werkelijk gebruiken; het punt van de bevinding
// was juist dat dezelfde kolom drie verschillende regels had.

import assert from "node:assert/strict";
import test from "node:test";

import {
  CHILD_INSTANCE_WITHOUT_PRIMARY_CONTEXT,
  PARENT_INSTANCE_CONTEXT_MISMATCH,
  PARENT_INSTANCE_INVALID,
  PARENT_INSTANCE_NOT_FOUND,
  buildParentInstanceGuardForNewChildSql,
  buildParentInstanceGuardSql,
  describeParentInstanceProblem,
} from "../src/db/queries/parentInstanceGuard.sql.js";
import { updateFormsHubInstanceMetadataSql } from "../src/db/queries/formsHub.sql.js";
import {
  startChildFormInstanceSql,
  updateFormInstanceMetadataSql,
} from "../src/db/queries/forms.sql.js";

test("de poort controleert zichzelf, bestaan, een primaire context en de gelijkheid daarvan", () => {
  const sql = buildParentInstanceGuardSql("@instanceId", "@parentInstanceId");

  assert.match(sql, /@parentInstanceId = @instanceId/);
  assert.ok(sql.includes(PARENT_INSTANCE_INVALID));
  assert.ok(sql.includes(PARENT_INSTANCE_NOT_FOUND));
  assert.ok(sql.includes(CHILD_INSTANCE_WITHOUT_PRIMARY_CONTEXT));
  assert.ok(sql.includes(PARENT_INSTANCE_CONTEXT_MISMATCH));

  // Alle drie de velden van de primaire context, niet alleen het type.
  assert.match(sql, /parent_context\.context_type = child_context\.context_type/);
  assert.match(sql, /parent_context\.source_system = child_context\.source_system/);
  assert.match(sql, /parent_context\.source_key = child_context\.source_key/);
});

test("alle drie de routes gebruiken dezelfde regel", () => {
  for (const [naam, sql] of [
    ["hub-metadata", updateFormsHubInstanceMetadataSql],
    ["installatie-metadata", updateFormInstanceMetadataSql],
    ["kind starten", startChildFormInstanceSql],
  ] as const) {
    assert.ok(
      sql.includes(PARENT_INSTANCE_CONTEXT_MISMATCH),
      `${naam} controleert de primaire context niet`
    );
  }
});

test("geen route valt terug op zijn eigen oude vangnet", () => {
  // De hub eiste een installatieloze ouder, de installatieroute dezelfde installatiecode.
  // Beide zijn vervangen door de contextregel; komt zo'n eigen controle terug, dan lopen de
  // regels weer uit elkaar.
  for (const [naam, sql] of [
    ["hub-metadata", updateFormsHubInstanceMetadataSql],
    ["installatie-metadata", updateFormInstanceMetadataSql],
    ["kind starten", startChildFormInstanceSql],
  ] as const) {
    assert.doesNotMatch(
      sql,
      /parent_fi\.atrium_installation_code (is null|= @code)/,
      `${naam} heeft weer een eigen ouderregel`
    );
  }
});

test("een nieuw kind wordt tegen de context gehouden die het straks krijgt", () => {
  const sql = buildParentInstanceGuardForNewChildSql({
    parentExpr: "@parentInstanceId",
    contextTypeExpr: "N'INSTALLATION'",
    sourceSystemExpr: "N'FABRIC_GOLD'",
    sourceKeyExpr: "@code",
  });

  assert.match(sql, /parent_context\.context_type = N'INSTALLATION'/);
  assert.match(sql, /parent_context\.source_system = N'FABRIC_GOLD'/);
  assert.match(sql, /parent_context\.source_key = @code/);
  assert.ok(sql.includes(PARENT_INSTANCE_CONTEXT_MISMATCH));
});

test("de uitleg naar buiten kiest het specifieke geval boven het generieke", () => {
  // "parent form instance not found in same primary context" bevat ook
  // "parent form instance not found"; de uitleg mag daar niet op vallen.
  const mismatch = describeParentInstanceProblem(PARENT_INSTANCE_CONTEXT_MISMATCH);
  assert.equal(mismatch?.status, 409);
  assert.match(String(mismatch?.error), /hetzelfde onderwerp/);

  const missing = describeParentInstanceProblem(PARENT_INSTANCE_NOT_FOUND);
  assert.equal(missing?.status, 404);
  assert.equal(missing?.error, PARENT_INSTANCE_NOT_FOUND);

  const zelf = describeParentInstanceProblem(PARENT_INSTANCE_INVALID);
  assert.equal(zelf?.status, 400);

  const geenContext = describeParentInstanceProblem(CHILD_INSTANCE_WITHOUT_PRIMARY_CONTEXT);
  assert.equal(geenContext?.status, 409);
  assert.match(String(geenContext?.error), /vastgelegd onderwerp/);

  assert.equal(describeParentInstanceProblem("draft_rev conflict"), null);
  assert.equal(describeParentInstanceProblem(""), null);
});
