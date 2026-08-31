import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";
import { previewFormFollowUps } from "../src/services/followUpService.js";
import { buildFormReportFileName } from "../src/services/formReportExportModelService.js";

const surveyPath = fileURLToPath(
  new URL("../../docs/poc/KAM_SCL_inspectie_V3_9.formdev.json", import.meta.url)
);

async function loadSurvey() {
  return JSON.parse(await readFile(surveyPath, "utf8"));
}

function buildValidAnswers(surveyJson: any) {
  const matrices = surveyJson.pages
    .flatMap((page: any) => page.elements || [])
    .flatMap((element: any) => element.elements || [])
    .filter((element: any) => element.type === "matrixdynamic");
  const preparation = matrices.find((element: any) => element.name === "voorbereiding_items");
  const transport = matrices.find((element: any) => element.name === "vervoer_items");

  const rows = preparation.defaultValue.map((row: any, index: number) => ({
    ...row,
    voldoet: index === 0 ? "Nee" : "Ja",
    opmerking: index === 0 ? "Noodnummer ontbreekt op de werklocatie." : "",
  }));

  return {
    projectnaam: "POC project KAM",
    projectnummer: "WB-POC-001",
    datum_inspectie: "2026-08-30",
    naam_inspecteur: "Projectleider POC",
    omschrijving_werkzaamheden: "Functionele ketentest van het algemene KAM-formulier.",
    lmra_toegepast: "Ja",
    situatie_verplaatsen: false,
    situatie_alleen_gebouw: false,
    situatie_gereedschap: false,
    situatie_kabelwerk: false,
    situatie_nauwe_ruimte: false,
    situatie_hoogte: false,
    toon_alle_categorieen: false,
    voorbereiding_items: rows,
    vervoer_items: transport.defaultValue.map((row: any) => ({ ...row, voldoet: "Ja", opmerking: "" })),
    scl_gesprekspunten: [
      {
        vraag: "Wat heb je nodig om dit werk veiliger te doen?",
        ontwikkelpunt: "Duidelijkere locatie-informatie vooraf.",
      },
      {
        vraag: "Wat had in de voorbereiding anders gekund?",
        ontwikkelpunt: "Noodnummers vooraf controleren.",
      },
    ],
    signalering_kam: "Controleer de ontbrekende locatie-informatie.",
    ondertekening_inspecteur: "Projectleider POC",
    datum_ondertekening_inspecteur: "2026-08-30",
  };
}

test("KAM/SCL POC is een geldig invulbaar SurveyJS-formulier", async () => {
  const surveyJson = await loadSurvey();
  const model = new Model(surveyJson);
  model.data = buildValidAnswers(surveyJson);

  assert.equal(model.validate(true, false), true);
  assert.equal(model.pageCount, 5);
  assert.equal(model.getQuestionByName("projectnaam")?.isRequired, true);
  assert.equal(model.getQuestionByName("ondertekening_inspecteur")?.isRequired, true);
  assert.equal(
    surveyJson.pages.find((page: any) => page.name === "situatieschets")?.ember?.report?.layout,
    "single-column-fields"
  );
});

test("één Nee-regel levert precies één generieke workflowactie op", async () => {
  const surveyJson = await loadSurvey();
  const preview = await previewFormFollowUps({
    surveyJson,
    answers: buildValidAnswers(surveyJson),
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.count, 1);
  assert.equal(preview.items[0]?.kind, "workflow");
  assert.equal(preview.items[0]?.itemCode, "VA-01");
  assert.equal(preview.items[0]?.category, "KAM-SCL afwijking");
});

test("algemeen KAM-rapport gebruikt projectnummer en inspectiedatum in de bestandsnaam", () => {
  const fileName = buildFormReportFileName({
    form: { name: "KAM / SCL-inspectie", atrium_installation_code: null },
    answers: { projectnummer: "WB114329", datum_inspectie: "2026-08-30" },
  });

  assert.equal(fileName, "KAM_SCL-inspectie_WB114329_2026-08-30.pdf");
});
