// Het manifest is de enige veranderlijke wijzer naar de actuele versie van Ember Offline.
// Alles eromheen is onveranderlijk: de installers heten naar hun versie en worden nooit
// overschreven. Daarom moet dit bestand streng gelezen worden; een manifest dat ergens
// anders heen wijst bepaalt anders wat er op een laptop terechtkomt.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  OFFLINE_CLIENT_MANIFEST_SCHEMA,
  parseOfflineClientManifest,
} from "../src/services/offlineClientService.js";

const contractPad = fileURLToPath(
  new URL("../src/contracts/offline-client-manifest.v1.json", import.meta.url)
);

function geldig(extra: any = {}) {
  return {
    schema: OFFLINE_CLIENT_MANIFEST_SCHEMA,
    version: "1.4.2",
    released_at: "2026-09-11T14:00:00Z",
    notes: "Losse notitie",
    file_name: "Ember-Offline-1.4.2-x64.msi",
    storage_key: "1.4.2/Ember-Offline-1.4.2-x64.msi",
    size_bytes: 18874368,
    sha256: "a".repeat(64),
    ...extra,
  };
}

test("het voorbeeldcontract wordt gelezen zoals bedoeld", async () => {
  const voorbeeld = JSON.parse(await readFile(contractPad, "utf8"));
  const uitkomst = parseOfflineClientManifest(voorbeeld);

  assert.equal(uitkomst.ok, true, uitkomst.ok ? "" : uitkomst.error);
  assert.equal(uitkomst.manifest?.version, "0.1.0");
  assert.equal(uitkomst.manifest?.storage_key, "0.1.0/Ember-Offline-0.1.0-x64.msi");
});

test("json als tekst mag ook; zo komt hij uit de opslag", () => {
  const uitkomst = parseOfflineClientManifest(JSON.stringify(geldig()));

  assert.equal(uitkomst.ok, true);
  assert.equal(uitkomst.manifest?.version, "1.4.2");
});

test("onleesbare of lege inhoud wordt geweigerd", () => {
  assert.equal(parseOfflineClientManifest("{ dit is geen json").ok, false);
  assert.equal(parseOfflineClientManifest(null).ok, false);
  assert.equal(parseOfflineClientManifest([]).ok, false);
});

test("een ander schema telt niet", () => {
  const uitkomst = parseOfflineClientManifest(geldig({ schema: "iets.anders" }));

  assert.equal(uitkomst.ok, false);
  assert.match(String(uitkomst.error), /verwacht schema/i);
});

test("de versie moet een versienummer zijn", () => {
  for (const versie of ["", "latest", "1.4", "v1.4.2", null]) {
    const uitkomst = parseOfflineClientManifest(geldig({ version: versie }));
    assert.equal(uitkomst.ok, false, `versie ${String(versie)} had geweigerd moeten worden`);
  }

  assert.equal(parseOfflineClientManifest(geldig({ version: "1.4.2-rc.1", storage_key: "1.4.2-rc.1/Ember-Offline.msi" })).ok, true);
});

test("het manifest mag alleen naar de map van zijn eigen versie wijzen", () => {
  // Zonder deze regel kan een manifest naar een willekeurige blob in de container wijzen,
  // en bepaalt het manifest wat er gedownload wordt in plaats van de release.
  const anderePad = parseOfflineClientManifest(
    geldig({ storage_key: "1.4.1/Ember-Offline-1.4.1-x64.msi" })
  );
  assert.equal(anderePad.ok, false);
  assert.match(String(anderePad.error), /hoort niet bij versie/i);

  const omhoog = parseOfflineClientManifest(
    geldig({ storage_key: "1.4.2/../bestanden/geheim.msi" })
  );
  assert.equal(omhoog.ok, false);

  const geenMsi = parseOfflineClientManifest(
    geldig({ storage_key: "1.4.2/Ember-Offline-1.4.2-x64.exe" })
  );
  assert.equal(geenMsi.ok, false);
  assert.match(String(geenMsi.error), /msi/i);
});

test("een ontbrekende bestandsnaam valt terug op de sleutel", () => {
  const uitkomst = parseOfflineClientManifest(geldig({ file_name: "  " }));

  assert.equal(uitkomst.ok, true);
  assert.equal(uitkomst.manifest?.file_name, "Ember-Offline-1.4.2-x64.msi");
});

test("een onzinnige grootte wordt niet doorgegeven", () => {
  assert.equal(parseOfflineClientManifest(geldig({ size_bytes: "veel" })).manifest?.size_bytes, null);
  assert.equal(parseOfflineClientManifest(geldig({ size_bytes: 12.7 })).manifest?.size_bytes, 12);
});
