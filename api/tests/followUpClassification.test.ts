// Prioriteit, verantwoordelijkheid en dueInDays komen uit ember.followUp in de
// formulierdefinitie en niet van de invuller. Een onbekende waarde valt terug op null, zodat
// de tabeldefault geldt in plaats van een gok; het publiceren weigert die waarde apart.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { extractFollowUps } from "../src/services/followUpExtractor.js";

const fixturePath = path.resolve(
  import.meta.dirname,
  "../../docs/fixtures/forms/MAINT_BMI.v3.0.json"
);

function loadSurvey() {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")).version.survey_json;
}

function annotate(node: any, questionName: string, extra: Record<string, unknown>) {
  if (Array.isArray(node)) {
    node.forEach((entry) => annotate(entry, questionName, extra));
    return;
  }

  if (!node || typeof node !== "object") return;
  if (node.name === questionName && node.ember?.followUp) {
    Object.assign(node.ember.followUp, extra);
  }

  Object.values(node).forEach((value) => annotate(value, questionName, extra));
}

const answers = {
  a1_items: [
    { item_code: "A1", onderwerp: "Prestatie-eis niet gehaald", voldoet: "Nee", opmerking: "Test" },
  ],
  bmc_items: [{ item_code: "B1", onderwerp: "BMC-bevinding", voldoet: "Nee", opmerking: "Test" }],
};

test("classificatie uit de definitie komt mee op de kandidaat", () => {
  const survey = loadSurvey();
  annotate(survey, "a1_items", { priority: "HIGH", responsibility: "KLANT", dueInDays: 14 });

  const candidate = extractFollowUps({ surveyJson: survey, answers }).find(
    (entry) => entry.questionName === "a1_items"
  );

  assert.ok(candidate, "er hoort een kandidaat uit a1_items te komen");
  assert.equal(candidate.priority, "HIGH");
  assert.equal(candidate.responsibilityType, "KLANT");
  assert.equal(candidate.dueInDays, 14);
});

test("een onbekende waarde valt terug op null in plaats van een gok", () => {
  const survey = loadSurvey();
  annotate(survey, "bmc_items", {
    priority: "onzin",
    responsibility: "WARDENBURG",
    dueInDays: 9999,
  });

  const candidate = extractFollowUps({ surveyJson: survey, answers }).find(
    (entry) => entry.questionName === "bmc_items"
  );

  assert.ok(candidate, "er hoort een kandidaat uit bmc_items te komen");
  assert.equal(candidate.priority, null);
  assert.equal(candidate.responsibilityType, null);
  assert.equal(candidate.dueInDays, null);
});

test("zonder classificatie blijft alles leeg en geldt de tabeldefault", () => {
  const candidate = extractFollowUps({ surveyJson: loadSurvey(), answers }).find(
    (entry) => entry.questionName === "a1_items"
  );

  assert.ok(candidate);
  assert.equal(candidate.priority, null);
  assert.equal(candidate.responsibilityType, null);
  assert.equal(candidate.dueInDays, null);
});
