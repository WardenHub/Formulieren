// De terugweg van Ember Offline.
//
// Hier wordt vastgelegd wat er met offline werk mag gebeuren zodra het thuiskomt. De reden
// dat dit een eigen testbestand heeft: de oude importroute liet precies deze regels lopen.
// Hij vergeleek revisies met > in plaats van <>, accepteerde een lege revisie waarmee de
// controle wegviel, en kon zonder instance-id nieuwe instances aanmaken. Zulke fouten zijn
// stil; ze leveren geen foutmelding op maar overschreven werk.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  OFFLINE_RETURN_SCHEMA,
  buildOfflinePointFingerprint,
  parseOfflineReturnDocument,
} from "../src/services/offlineSyncService.js";
import {
  MANUAL_POINT_SOURCE_QUESTION,
  resolveSourceQuestionName,
} from "../src/services/followUpService.js";
import { insertRunnerFollowUpPointSql } from "../src/db/queries/formFollowUps.sql.js";

const contractPad = fileURLToPath(
  new URL("../src/contracts/answerfile.v2.json", import.meta.url)
);

function geldigDocument(extra: any = {}) {
  return {
    schema: OFFLINE_RETURN_SCHEMA,
    installation: { atrium_installation_code: "001065" },
    instance: { form_instance_id: 42, expected_draft_rev: 7 },
    payload: { answers_json: { q1: "ja" } },
    sync: { client_sync_id: "sync-1", local_saved_at: "2026-09-11T13:00:00Z" },
    ...extra,
  };
}

test("het voorbeeldcontract is leesbaar voor de parser", async () => {
  // Het voorbeeld in api/src/contracts en de parser horen bij elkaar; drift hoort te falen.
  const voorbeeld = JSON.parse(await readFile(contractPad, "utf8"));
  const uitkomst = parseOfflineReturnDocument(voorbeeld);

  assert.equal(uitkomst.ok, true, uitkomst.ok ? "" : uitkomst.error);
  assert.equal(uitkomst.document?.atrium_installation_code, "001065");
  assert.equal(uitkomst.document?.form_instance_id, 42);
  assert.equal(uitkomst.document?.expected_draft_rev, 7);
  assert.equal(uitkomst.document?.manual_points.length, 1);
  assert.equal(uitkomst.document?.manual_points[0].local_id, "p1");
});

test("een geldig document komt door", () => {
  const uitkomst = parseOfflineReturnDocument(geldigDocument());

  assert.equal(uitkomst.ok, true);
  assert.deepEqual(uitkomst.document?.answers_json, { q1: "ja" });
  assert.equal(uitkomst.document?.manual_points.length, 0);
});

test("een ander schema wordt niet geaccepteerd", () => {
  // De oude v1 heeft geen expected_draft_rev en geen veldwerk; stil doorlaten zou de
  // revisiecontrole betekenisloos maken.
  const uitkomst = parseOfflineReturnDocument(
    geldigDocument({ schema: "ember.form.answerfile.v1" })
  );

  assert.equal(uitkomst.ok, false);
  assert.match(String(uitkomst.error), /verwacht schema/i);
});

test("expected_draft_rev is verplicht en mag niet worden verzonnen", () => {
  for (const revisie of [undefined, null, "", "abc", -1, 1.5]) {
    const uitkomst = parseOfflineReturnDocument(
      geldigDocument({ instance: { form_instance_id: 42, expected_draft_rev: revisie } })
    );

    assert.equal(uitkomst.ok, false, `revisie ${String(revisie)} had geweigerd moeten worden`);
    assert.match(String(uitkomst.error), /expected_draft_rev/i);
  }

  // Nul is een geldige verwachting; een nieuw concept staat op 0.
  const nul = parseOfflineReturnDocument(
    geldigDocument({ instance: { form_instance_id: 42, expected_draft_rev: 0 } })
  );
  assert.equal(nul.ok, true);
});

test("zonder bruikbare instance-id gebeurt er niets", () => {
  for (const id of [undefined, null, 0, -3, "abc"]) {
    const uitkomst = parseOfflineReturnDocument(
      geldigDocument({ instance: { form_instance_id: id, expected_draft_rev: 1 } })
    );

    assert.equal(uitkomst.ok, false, `id ${String(id)} had geweigerd moeten worden`);
    assert.match(String(uitkomst.error), /form_instance_id/i);
  }
});

test("antwoorden moeten een object zijn en de installatie moet erbij staan", () => {
  const zonderAntwoorden = parseOfflineReturnDocument(geldigDocument({ payload: {} }));
  assert.equal(zonderAntwoorden.ok, false);
  assert.match(String(zonderAntwoorden.error), /answers_json/i);

  const lijstAlsAntwoorden = parseOfflineReturnDocument(
    geldigDocument({ payload: { answers_json: [] } })
  );
  assert.equal(lijstAlsAntwoorden.ok, false);

  const zonderInstallatie = parseOfflineReturnDocument(geldigDocument({ installation: {} }));
  assert.equal(zonderInstallatie.ok, false);
  assert.match(String(zonderInstallatie.error), /atrium_installation_code/i);
});

test("een synchronisatiesleutel is verplicht", () => {
  const uitkomst = parseOfflineReturnDocument(geldigDocument({ sync: {} }));

  assert.equal(uitkomst.ok, false);
  assert.match(String(uitkomst.error), /client_sync_id/i);
});

test("punten hebben een lokale sleutel en een titel nodig", () => {
  const zonderSleutel = parseOfflineReturnDocument(
    geldigDocument({ field_work: { manual_points: [{ title: "Accu vervangen" }] } })
  );
  assert.equal(zonderSleutel.ok, false);
  assert.match(String(zonderSleutel.error), /local_id/i);

  const zonderTitel = parseOfflineReturnDocument(
    geldigDocument({ field_work: { manual_points: [{ local_id: "p1", title: "  " }] } })
  );
  assert.equal(zonderTitel.ok, false);
  assert.match(String(zonderTitel.error), /title/i);

  const dubbel = parseOfflineReturnDocument(
    geldigDocument({
      field_work: {
        manual_points: [
          { local_id: "p1", title: "Eerste" },
          { local_id: "p1", title: "Tweede" },
        ],
      },
    })
  );
  assert.equal(dubbel.ok, false);
  assert.match(String(dubbel.error), /twee keer/i);
});

test("dezelfde sync met dezelfde punten levert dezelfde sleutel op", () => {
  // Hierop rust de idempotentie; zie insertRunnerFollowUpPointSql.
  const eerste = buildOfflinePointFingerprint("sync-1", "p1");
  const tweede = buildOfflinePointFingerprint("sync-1", "p1");

  assert.equal(eerste, tweede);
  assert.notEqual(eerste, buildOfflinePointFingerprint("sync-1", "p2"));
  assert.notEqual(eerste, buildOfflinePointFingerprint("sync-2", "p1"));
});

test("de insert van een punt herkent een herhaalde sync en maakt niets dubbel", () => {
  // De SQL is de plek waar dit echt gebeurt; deze test houdt de drie onderdelen vast die
  // het idempotent maken.
  assert.match(insertRunnerFollowUpPointSql, /@clientFingerprint/);
  assert.match(insertRunnerFollowUpPointSql, /source_fingerprint = @fingerprint/);
  assert.match(insertRunnerFollowUpPointSql, /cast\(0 as bit\) as created/);
  assert.match(insertRunnerFollowUpPointSql, /cast\(1 as bit\) as created/);

  // En de fingerprint mag niet meer uit het nieuwe actie-id komen wanneer de client er een
  // meestuurt; anders is elke sync weer een nieuw punt.
  assert.doesNotMatch(
    insertRunnerFollowUpPointSql,
    /source_fingerprint[^\n]*\n[^\n]*concat\(N'manual\|', convert\(nvarchar\(36\), @followUpActionId\)\)/
  );
});

test("een punt zonder vraag krijgt toch een herkomst", () => {
  // dbo.FollowUpActionFormSource.source_question_name is NOT NULL zonder default, en de
  // punten-sheet stuurt geen vraagnaam mee; een NULL liep daar vast op een 500.
  assert.equal(resolveSourceQuestionName(undefined), MANUAL_POINT_SOURCE_QUESTION);
  assert.equal(resolveSourceQuestionName(null), MANUAL_POINT_SOURCE_QUESTION);
  assert.equal(resolveSourceQuestionName("   "), MANUAL_POINT_SOURCE_QUESTION);
  assert.equal(resolveSourceQuestionName(" q_accu "), "q_accu");
  assert.equal(resolveSourceQuestionName("x".repeat(300)).length, 200);
});
