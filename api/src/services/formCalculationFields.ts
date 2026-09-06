/* /api/src/services/formCalculationFields.ts

   Welke vragen en kolommen een berekening voedt.

   Tegenhanger van src/pages/Forms/shared/calculationFields.js. De lijst staat twee keer
   omdat de API niets uit de frontendbundel kan importeren; api/tests/calculationFieldParity
   .test.ts vergelijkt de twee en faalt zodra ze uit elkaar lopen. Wijzig ze nooit aan een
   kant alleen.

   Wat een definitie niet noemt, valt terug op de namen hieronder. MAINT_BMI v3.0 declareert
   niets en werkt daardoor onveranderd. */

export type CalculationFields = Record<string, string | string[]>;

export const CALCULATION_FIELD_DEFAULTS: Record<string, CalculationFields> = {
  "energy-supply-capacity": {
    rows: "es_regels",
    agingFactor: "es_verouderingsfactor",

    brandType: "es_merk_type",
    capacityAh: "es_capaciteit_ah",
    count: "es_aantal",
    wiring: "es_schakeling",
    effectiveAh: "es_effectieve_ah",
    standbyCurrentMa: "es_ruststroom_ma",
    alarmCurrentMa: "es_alarmstroom_ma",
    bridgingHours: "es_overbrugging_uren",
    requiredAh: "es_benodigd_ah",
  },

  "system-availability": {
    rows: "a2_buitenbedrijfstellingen",
    detectorRows: "performance_data_view",
    requiredAvailability: "a2_systeembeschikbaarheid_pve",

    fullDay: "hele_dag",
    startTime: "tijd_begin",
    endTime: "tijd_einde",
    unavailableDetectors: "melders_niet_beschikbaar",
    durationDays: "tijdsduur_dagen",
    hoursPerDay: "uren_pd_niet_beschikbaar",
    detectorHours: "melduren_niet_beschikbaar",

    // De vragen waarin de uitkomst wordt geschreven.
    totalDetectorHours: "a2_melduren_buiten_werking",
    detectorCount: "a2_aantal_melders",
    observedAvailability: "a2_systeembeschikbaarheid_geconstateerd",

    detectorCountColumns: [
      "pr_aantal_auto",
      "pr_aantal_hand",
      "pr_aantal_vlam",
      "pr_aantal_lijn",
      "pr_aantal_asp",
    ],
  },
};

/* De declaratie van het formulier boven de standaard. Een onbekende sleutel wordt
   genegeerd; hier zonder console-melding, want de publicatiecontrole in adminFormsService
   weigert zo'n definitie al voordat hij bestaat. */
export function resolveCalculationFields(
  calculationId: string,
  declaredFields: any
): CalculationFields | null {
  const defaults = CALCULATION_FIELD_DEFAULTS[String(calculationId || "").trim()];
  if (!defaults) return null;

  const resolved: CalculationFields = { ...defaults };

  if (declaredFields && typeof declaredFields === "object" && !Array.isArray(declaredFields)) {
    for (const [key, value] of Object.entries(declaredFields)) {
      if (!(key in defaults)) continue;

      if (Array.isArray(defaults[key])) {
        const list = (Array.isArray(value) ? value : [])
          .map((entry) => String(entry || "").trim())
          .filter(Boolean);
        if (list.length) resolved[key] = list;
        continue;
      }

      const name = String(value || "").trim();
      if (name) resolved[key] = name;
    }
  }

  return resolved;
}

/* Voor de publicatiecontrole; welke veldsleutels een berekening kent. */
export function getCalculationFieldKeys(calculationId: string) {
  const defaults = CALCULATION_FIELD_DEFAULTS[String(calculationId || "").trim()];
  return defaults ? Object.keys(defaults) : [];
}

export function getKnownCalculationIds() {
  return Object.keys(CALCULATION_FIELD_DEFAULTS);
}
