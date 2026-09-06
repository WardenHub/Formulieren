// De sleutelcontrole tegen de gebonden formulierversie. Getest tegen de echte
// MAINT_BMI-fixture, want een test op een verzonnen vragenlijst zegt niets over de
// vormen die in deze definities werkelijk voorkomen.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkAnswerKeys, shouldRejectUnknownAnswerKeys } from "../src/services/formAnswerKeyService.js";

const fixturePath = fileURLToPath(
  new URL("../../docs/fixtures/forms/MAINT_BMI.v3.0.json", import.meta.url)
);

async function loadSurvey() {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  return fixture.version.survey_json;
}

test("bekende vraagnamen en kolomnamen komen door", async () => {
  const survey = await loadSurvey();

  const result = checkAnswerKeys(survey, {
    datum_onderhoud: "2026-09-06",
    bouwwerk_naam: "Proefinstallatie 01",
    melders_items: [{ item_code: "M1", onderwerp: "Melder 1", voldoet: "Ja", opmerking: "" }],
  });

  assert.equal(result.checked, true);
  assert.deepEqual(result.unknownKeys, []);
  assert.deepEqual(result.unknownRowKeys, []);
  assert.equal(result.knownKeyCount, 3);
});

test("een sleutel die niet in de versie voorkomt wordt gemeld", async () => {
  const survey = await loadSurvey();

  const result = checkAnswerKeys(survey, {
    datum_onderhoud: "2026-09-06",
    verzonnen_veld: "wat dan ook",
  });

  assert.deepEqual(result.unknownKeys, ["verzonnen_veld"]);
  assert.equal(result.knownKeyCount, 1);
});

test("een onbekende kolom binnen een matrixrij wordt gemeld met vraag en kolom", async () => {
  const survey = await loadSurvey();

  const result = checkAnswerKeys(survey, {
    melders_items: [
      { item_code: "M1", voldoet: "Ja" },
      { item_code: "M2", stiekem: "waarde" },
    ],
  });

  assert.deepEqual(result.unknownKeys, []);
  assert.deepEqual(result.unknownRowKeys, ["melders_items.stiekem"]);
});

test("dezelfde onbekende kolom in meerdere rijen levert een melding, niet twintig", async () => {
  const survey = await loadSurvey();

  const result = checkAnswerKeys(survey, {
    melders_items: [{ stiekem: 1 }, { stiekem: 2 }, { stiekem: 3 }],
  });

  assert.deepEqual(result.unknownRowKeys, ["melders_items.stiekem"]);
});

test("een vraag die door prefill wordt gevuld ontsnapt aan de rijcontrole", async () => {
  const survey = await loadSurvey();

  // es_regels krijgt zijn rijen van de server, met velden die de definitie niet als kolom
  // noemt. Dat is geen fout van de invuller en hoort dus niet gemeld te worden.
  const result = checkAnswerKeys(survey, {
    es_regels: [{ es_locatie: "kast 1", es_soort: "accu", es_aantal: 2 }],
  });

  assert.deepEqual(result.unknownKeys, []);
  assert.deepEqual(result.unknownRowKeys, []);
});

test("zonder bruikbare definitie beweert de controle niets", () => {
  assert.equal(checkAnswerKeys(null, { wat: 1 }).checked, false);
  assert.equal(checkAnswerKeys({ pages: [] }, { wat: 1 }).checked, false);
  assert.equal(checkAnswerKeys({ pages: [{ elements: [] }] }, null).checked, false);
});

test("weigeren staat standaard uit; het is bewust een vlag", () => {
  const before = process.env.EMBER_REJECT_UNKNOWN_ANSWER_KEYS;

  delete process.env.EMBER_REJECT_UNKNOWN_ANSWER_KEYS;
  assert.equal(shouldRejectUnknownAnswerKeys(), false);

  process.env.EMBER_REJECT_UNKNOWN_ANSWER_KEYS = "1";
  assert.equal(shouldRejectUnknownAnswerKeys(), true);

  if (before === undefined) delete process.env.EMBER_REJECT_UNKNOWN_ANSWER_KEYS;
  else process.env.EMBER_REJECT_UNKNOWN_ANSWER_KEYS = before;
});
