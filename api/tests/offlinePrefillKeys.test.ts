// Het offline pakket moet dezelfde prefill meenemen als de online runner ophaalt.
//
// Online loopt collectRequestedPrefillKeys over een survey-core model; het pakket wordt
// gebouwd in de API, waar die bibliotheek niet hoort. Twee lezers van dezelfde JSON dus, en
// als ze niet dezelfde sleutels vinden, mist offline een keuzelijst of een gebonden waarde
// en valt het formulier anders uit dan online. Daarom leggen deze tests de wandelaar vast op
// de plekken waar zo'n sleutel echt staat: diep in pagina's, panelen en matrixkolommen.

import assert from "node:assert/strict";
import test from "node:test";

import { collectPrefillKeysFromSurveyJson } from "../src/services/formsOfflineService.js";

test("sleutels uit bindings en keuzelijsten komen allebei mee", () => {
  const surveyJson = {
    pages: [
      {
        elements: [
          { name: "installatie", ember: { bind: { kind: "prefill", key: "installatie_basis" } } },
          { name: "type", ember: { choices: { key: "k_document_types" } } },
        ],
      },
    ],
  };

  const keys = collectPrefillKeysFromSurveyJson(surveyJson).sort();
  assert.deepEqual(keys, ["installatie_basis", "k_document_types"]);
});

test("een sleutel diep in een paneel of matrixkolom wordt ook gevonden", () => {
  const surveyJson = {
    pages: [
      {
        elements: [
          {
            type: "panel",
            elements: [
              {
                type: "matrixdynamic",
                name: "regels",
                columns: [
                  { name: "groep", ember: { choices: { key: "doc_groepen" } } },
                  { name: "eis", ember: { bind: { kind: "prefill", key: "doc_regels" } } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const keys = collectPrefillKeysFromSurveyJson(surveyJson).sort();
  assert.deepEqual(keys, ["doc_groepen", "doc_regels"]);
});

test("alleen bindings van soort prefill tellen mee", () => {
  // Er zijn meer soorten bindings; die horen niet bij de prefill-aanvraag.
  const surveyJson = {
    elements: [
      { name: "a", ember: { bind: { kind: "instance", key: "form_instance_id" } } },
      { name: "b", ember: { bind: { kind: "prefill", key: "wel_deze" } } },
    ],
  };

  assert.deepEqual(collectPrefillKeysFromSurveyJson(surveyJson), ["wel_deze"]);
});

test("dezelfde sleutel op twee vragen levert er één op", () => {
  const surveyJson = {
    elements: [
      { name: "a", ember: { bind: { kind: "prefill", key: "zelfde" } } },
      { name: "b", ember: { bind: { kind: "prefill", key: "zelfde" } } },
    ],
  };

  assert.deepEqual(collectPrefillKeysFromSurveyJson(surveyJson), ["zelfde"]);
});

test("een lege of stukke definitie geeft een lege lijst en geen fout", () => {
  assert.deepEqual(collectPrefillKeysFromSurveyJson(null), []);
  assert.deepEqual(collectPrefillKeysFromSurveyJson({}), []);
  assert.deepEqual(collectPrefillKeysFromSurveyJson({ elements: [{ ember: { bind: { kind: "prefill" } } }] }), []);
});
