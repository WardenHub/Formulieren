// Het relatiegroepfilter staat op één plek en wordt door twee queries gebruikt. Dit legt vast
// dat die ene plek ook echt de enige is, en dat de regels die de veiligheid dragen erin staan:
// de vier objectrollen als parameter, geen dubbele rijen, en niets filteren zolang er geen
// groep is gekozen.

import assert from "node:assert/strict";
import test from "node:test";

import {
  RELATION_GROUP_FILTER_PLACEHOLDER,
  getRelationGroupsForInstallationSql,
  buildRelationGroupFilterSql,
  getInstallationMapViewportSql,
  getInstallationOperationalRowsSql,
  getInstallationRelationGroupsSql,
  withRelationGroupFilter,
} from "../src/db/queries/installationOperational.sql.js";
import { RELATION_GROUP_ROLES } from "../src/services/installationOperationalService.js";

test("het filter gebruikt het meegegeven alias overal", () => {
  const sql = buildRelationGroupFilterSql("x");

  assert.match(sql, /x\.object_gebruiker_gcid/);
  assert.match(sql, /x\.object_eigenaar_gcid/);
  assert.match(sql, /x\.object_beheerder_gcid/);
  assert.match(sql, /x\.object_debiteur_gcid/);
  assert.match(sql, /m\.business_unit = x\.BedrijfUnit/);

  // geen achtergebleven alias van een eerdere versie
  assert.doesNotMatch(sql, /\bo\.object_/);
  assert.doesNotMatch(sql, /\ba\.object_/);
});

test("zonder gekozen groep filtert het niets weg", () => {
  assert.match(buildRelationGroupFilterSql("o"), /@relationGroupsJson is null\s*\n\s*or exists/);
});

test("de rollen zijn een parameter en geen vaste regel", () => {
  const sql = buildRelationGroupFilterSql("o");

  // De rolcodes staan in de query omdat elke rol een eigen kolom is; welke meetellen komt uit
  // @relationGroupRolesJson. Dat is precies wat externe toegang straks smaller moet zetten.
  assert.match(sql, /rol\.rol_code in \(select value from openjson\(@relationGroupRolesJson\)\)/);

  for (const rol of RELATION_GROUP_ROLES) {
    assert.ok(sql.includes(`N'${rol}'`), `rol ${rol} ontbreekt in de query`);
  }
});

test("het filter is een exists, zodat een installatie niet dubbel kan komen", () => {
  // Een installatie kan via meerdere rollen aan dezelfde groep hangen; met een join zou die
  // twee keer in de lijst staan en twee keer in de telling.
  assert.match(buildRelationGroupFilterSql("o"), /or exists \(/);
});

test("beide queries dragen de plaatshouder en krijgen hun eigen alias ingevuld", () => {
  assert.ok(
    getInstallationOperationalRowsSql.includes(RELATION_GROUP_FILTER_PLACEHOLDER),
    "de lijstquery heeft geen plaatshouder"
  );
  assert.ok(
    getInstallationMapViewportSql.includes(RELATION_GROUP_FILTER_PLACEHOLDER),
    "de kaartquery heeft geen plaatshouder"
  );

  const lijst = withRelationGroupFilter(getInstallationOperationalRowsSql, "o", true);
  const kaart = withRelationGroupFilter(getInstallationMapViewportSql, "a", true);

  assert.ok(lijst.includes(buildRelationGroupFilterSql("o")));
  assert.ok(kaart.includes(buildRelationGroupFilterSql("a")));
  assert.doesNotMatch(lijst, /@@relationGroupFilter@@/);
  assert.doesNotMatch(kaart, /@@relationGroupFilter@@/);
});

test("zonder gekozen groep noemt de query de relatiegroeptabellen niet", () => {
  // Dit is wat de uitrolvolgorde ongevaarlijk maakt. SQL Server bindt tabelnamen bij het
  // compileren, dus een ongebruikte verwijzing naar een tabel die nog niet bestaat laat de
  // hele installatiekaart omvallen.
  // De tabelnaam staat wel in een toelichting boven de kolommen; commentaar bindt niets, dus
  // dat telt hier niet mee.
  const zonderCommentaar = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const sql of [
    zonderCommentaar(withRelationGroupFilter(getInstallationOperationalRowsSql, "o", false)),
    zonderCommentaar(withRelationGroupFilter(getInstallationMapViewportSql, "a", false)),
  ]) {
    assert.doesNotMatch(sql, /AtriumRelationGroup/);
    assert.doesNotMatch(sql, /@@relationGroupFilter@@/);
    assert.match(sql, /and \(1 = 1\)/);
  }
});

test("de gedeelde CTE levert de vier relatiesleutels die het filter nodig heeft", () => {
  for (const kolom of [
    "object_gebruiker_gcid",
    "object_eigenaar_gcid",
    "object_beheerder_gcid",
    "object_debiteur_gcid",
  ]) {
    assert.ok(
      getInstallationOperationalRowsSql.includes(`a.${kolom}`),
      `${kolom} staat niet in de operationele CTE`
    );
  }
});

test("de groepenlijst telt installaties en geen koppelingen", () => {
  // Zonder distinct telt een installatie die via gebruiker en debiteur aan dezelfde groep
  // hangt twee keer, en dan klopt het getal naast de groepsnaam niet met wat je ziet.
  assert.match(getInstallationRelationGroupsSql, /count\(distinct a\.installatie_code\)/);
  assert.match(getInstallationRelationGroupsSql, /having count\(distinct a\.installatie_code\) > 0/);
});

test("de groepenlijst respecteert dezelfde rollen als het filter", () => {
  assert.match(
    getInstallationRelationGroupsSql,
    /rol\.rol_code in \(select value from openjson\(@relationGroupRolesJson\)\)/
  );
});

test("de tags van een installatie gebruiken dezelfde rollen als het filter", () => {
  // Anders zegt de tag op het installatiescherm iets anders dan het filter op de kaart, en
  // dan klopt een van de twee niet.
  assert.match(
    getRelationGroupsForInstallationSql,
    /rol\.rol_code in \(select value from openjson\(@relationGroupRolesJson\)\)/
  );

  for (const kolom of [
    "object_gebruiker_gcid",
    "object_eigenaar_gcid",
    "object_beheerder_gcid",
    "object_debiteur_gcid",
  ]) {
    assert.ok(getRelationGroupsForInstallationSql.includes(`a.${kolom}`), `${kolom} ontbreekt`);
  }
});

test("de tags horen bij één installatie en groeperen per groep", () => {
  assert.match(getRelationGroupsForInstallationSql, /a\.installatie_code = @installationCode/);
  // Zonder group by staat dezelfde groep er vier keer, een keer per objectrol.
  assert.match(getRelationGroupsForInstallationSql, /group by g\.business_unit, g\.relation_group_key/);
});
