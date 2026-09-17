// De rollen achter een relatiegroeptag. Wat hier vastligt is de volgorde, de Nederlandse
// woorden en dat een onbekende rol niet stilzwijgend verdwijnt.

import assert from "node:assert/strict";
import test from "node:test";

import {
  describeRelationGroupRoles,
  formatRelationGroupRoles,
  relationGroupRoleLabels,
} from "../src/lib/relationGroups.js";

test("de volgorde is die van de rollen zelf, niet die van de API", () => {
  assert.deepEqual(relationGroupRoleLabels(["DEBITEUR", "GEBRUIKER"]), ["gebruiker", "debiteur"]);
});

test("een lege of ontbrekende lijst levert niets op", () => {
  assert.equal(formatRelationGroupRoles([]), "");
  assert.equal(formatRelationGroupRoles(null), "");
  assert.equal(describeRelationGroupRoles(undefined), "");
});

test("een enkele rol leest als een zin", () => {
  assert.equal(describeRelationGroupRoles(["EIGENAAR"]), "via de eigenaar");
});

test("meerdere rollen krijgen een en, geen komma aan het eind", () => {
  assert.equal(
    describeRelationGroupRoles(["GEBRUIKER", "EIGENAAR", "DEBITEUR"]),
    "via de gebruiker, de eigenaar en de debiteur"
  );
});

test("een onbekende rol verdwijnt niet, maar komt achteraan", () => {
  assert.deepEqual(relationGroupRoleLabels(["HUURDER", "GEBRUIKER"]), ["gebruiker", "huurder"]);
});

test("witruimte en kleine letters uit de bron storen niet", () => {
  assert.equal(formatRelationGroupRoles([" gebruiker ", "beheerder"]), "gebruiker, beheerder");
});
