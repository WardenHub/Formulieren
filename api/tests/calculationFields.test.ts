// De veldkaart van een berekening. Twee dingen worden hier vastgelegd:
//
//   1. de kaart aan de serverkant is gelijk aan die aan de clientkant; de lijst staat twee
//      keer omdat de API niets uit de frontendbundel kan importeren, en dat is alleen
//      houdbaar als drift meteen faalt;
//   2. een definitie mag de namen zelf noemen, en de uitkomst blijft gelijk als de namen
//      gelijk blijven.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CALCULATION_FIELD_DEFAULTS,
  resolveCalculationFields,
} from "../src/services/formCalculationFields.js";
import { calculateFormValues } from "../src/services/formCalculationsService.js";

// Bewust over de grens van api/ heen; dit is precies het bestand dat gelijk moet blijven.
import { CALCULATION_FIELD_DEFAULTS as CLIENT_DEFAULTS } from "../../src/pages/Forms/shared/calculationFields.js";

const fixturePath = fileURLToPath(
  new URL("../../docs/fixtures/forms/MAINT_BMI.v3.0.json", import.meta.url)
);

async function loadSurvey() {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  return fixture.version.survey_json;
}

test("de veldkaart is aan beide kanten identiek", () => {
  assert.deepEqual(
    CALCULATION_FIELD_DEFAULTS,
    CLIENT_DEFAULTS,
    "api/src/services/formCalculationFields.ts en src/pages/Forms/shared/calculationFields.js lopen uit elkaar"
  );
});

test("zonder declaratie gelden de bekende namen", () => {
  const fields = resolveCalculationFields("energy-supply-capacity", null);
  assert.equal(fields?.rows, "es_regels");
  assert.equal(fields?.capacityAh, "es_capaciteit_ah");
  assert.equal(fields?.requiredAh, "es_benodigd_ah");
});

test("een declaratie overschrijft alleen wat ze noemt", () => {
  const fields = resolveCalculationFields("energy-supply-capacity", {
    rows: "accu_regels",
    capacityAh: "accu_capaciteit",
  });

  assert.equal(fields?.rows, "accu_regels");
  assert.equal(fields?.capacityAh, "accu_capaciteit");
  // Niet genoemd, dus onveranderd.
  assert.equal(fields?.count, "es_aantal");
});

test("een onbekende sleutel wordt genegeerd in plaats van geraden", () => {
  const fields = resolveCalculationFields("energy-supply-capacity", { verzonnen: "x" });
  assert.equal((fields as any)?.verzonnen, undefined);
  assert.equal(fields?.rows, "es_regels");
});

test("een lijstveld accepteert alleen een gevulde lijst", () => {
  const leeg = resolveCalculationFields("system-availability", { detectorCountColumns: [] });
  assert.deepEqual(leeg?.detectorCountColumns, CALCULATION_FIELD_DEFAULTS["system-availability"].detectorCountColumns);

  const eigen = resolveCalculationFields("system-availability", {
    detectorCountColumns: ["aantal_a", "aantal_b"],
  });
  assert.deepEqual(eigen?.detectorCountColumns, ["aantal_a", "aantal_b"]);
});

test("een onbekende berekening levert niets in plaats van een gok", () => {
  assert.equal(resolveCalculationFields("verzonnen-berekening", null), null);
});

test("MAINT_BMI v3.0 declareert geen velden en rekent dus met de bekende namen", async () => {
  const survey = await loadSurvey();

  const answers = {
    es_verouderingsfactor: 1.25,
    es_regels: [
      {
        es_capaciteit_ah: 12,
        es_aantal: 2,
        es_schakeling: "parallel",
        es_ruststroom_ma: 100,
        es_alarmstroom_ma: 500,
        es_overbrugging_uren: 24,
      },
    ],
    a2_buitenbedrijfstellingen: [
      { tijd_begin: "08:00", tijd_einde: "12:00", melders_niet_beschikbaar: 3, tijdsduur_dagen: 2 },
    ],
    performance_data_view: [{ pr_aantal_auto: 10, pr_aantal_hand: 5 }],
    a2_systeembeschikbaarheid_pve: 99.5,
  };

  const result = calculateFormValues(survey, answers);
  const energie: any = result.values["energy-supply-capacity"];
  const beschikbaarheid: any = result.values["system-availability"];

  assert.equal(energie[0].es_effectieve_ah, 24);
  assert.equal(energie[0].es_benodigd_ah, 3.25);
  assert.equal(beschikbaarheid.a2_aantal_melders, 15);
  assert.equal(beschikbaarheid.a2_systeembeschikbaarheid_geconstateerd, 99.98);
  assert.equal(beschikbaarheid.voldoet_aan_pve, true);
  assert.deepEqual(result.unknown_calculations, []);
});

test("een formulier met eigen veldnamen levert dezelfde uitkomst op", async () => {
  const survey = await loadSurvey();

  // Zelfde vragenlijst, maar de berekening wijst naar andere namen; zo zou een tweede
  // onderhoudsformulier het declareren zonder de gedeelde runtime aan te raken.
  const eigenSurvey = {
    ...survey,
    ember: {
      ...survey.ember,
      calculations: [
        {
          id: "energy-supply-capacity",
          watch: ["accu_regels"],
          fields: {
            rows: "accu_regels",
            agingFactor: "accu_veroudering",
            capacityAh: "accu_capaciteit",
            count: "accu_aantal",
            wiring: "accu_schakeling",
            effectiveAh: "accu_effectief",
            standbyCurrentMa: "accu_rust_ma",
            alarmCurrentMa: "accu_alarm_ma",
            bridgingHours: "accu_uren",
            requiredAh: "accu_benodigd",
          },
        },
      ],
    },
  };

  const result = calculateFormValues(eigenSurvey, {
    accu_veroudering: 1.25,
    accu_regels: [
      {
        accu_capaciteit: 12,
        accu_aantal: 2,
        accu_schakeling: "parallel",
        accu_rust_ma: 100,
        accu_alarm_ma: 500,
        accu_uren: 24,
      },
    ],
  });

  const energie: any = result.values["energy-supply-capacity"];

  // Zelfde getallen als in de test hierboven, onder de eigen kolomnamen.
  assert.equal(energie[0].accu_effectief, 24);
  assert.equal(energie[0].accu_benodigd, 3.25);
});
