// src/pages/Forms/shared/calculationFields.js
//
// Welke vragen en kolommen een berekening voedt.
//
// De rekenregels zelf zijn domeinlogica en laten zich niet zinnig in JSON uitdrukken; die
// blijven code. De veldnamen wél. Die stonden voluit in de berekeningen, waardoor een tweede
// onderhoudsformulier met een eigen accutabel een wijziging in de gedeelde runtime vroeg.
// Nu declareert een definitie ze:
//
//   "ember": { "calculations": [
//     { "id": "energy-supply-capacity", "watch": ["es_regels"],
//       "fields": { "rows": "es_regels", "capacityAh": "es_capaciteit_ah", ... } }
//   ] }
//
// Wat een definitie niet noemt, valt terug op de namen hieronder. MAINT_BMI v3.0 declareert
// niets en werkt daardoor onveranderd; een nieuw formulier declareert alleen wat afwijkt.
//
// Deze lijst staat ook in api/src/services/formCalculationFields.ts, omdat de API niets uit
// de frontendbundel kan importeren. api/tests/calculationFieldParity.test.ts vergelijkt de
// twee en faalt zodra ze uit elkaar lopen.

export const CALCULATION_FIELD_DEFAULTS = {
  "energy-supply-capacity": {
    // De matrix met de accuregels, en de vraag met de verouderingsfactor.
    rows: "es_regels",
    agingFactor: "es_verouderingsfactor",

    // Kolommen binnen die matrix.
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
    // De matrix met de buitenbedrijfstellingen, en de tabel met de meldergegevens.
    rows: "a2_buitenbedrijfstellingen",
    detectorRows: "performance_data_view",
    requiredAvailability: "a2_systeembeschikbaarheid_pve",

    // Kolommen binnen de buitenbedrijfstellingen.
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

    // Kolommen in de meldertabel die bij elkaar het aantal melders vormen.
    detectorCountColumns: [
      "pr_aantal_auto",
      "pr_aantal_hand",
      "pr_aantal_vlam",
      "pr_aantal_lijn",
      "pr_aantal_asp",
    ],
  },
};

// Lost de veldnamen op voor één berekening; de declaratie van het formulier boven de
// standaard. Een onbekende sleutel wordt genegeerd en gemeld, want stil iets anders doen dan
// de definitie zegt is erger dan de standaard gebruiken.
export function resolveCalculationFields(calculationId, declaredFields) {
  const defaults = CALCULATION_FIELD_DEFAULTS[String(calculationId || "").trim()];
  if (!defaults) return null;

  const resolved = { ...defaults };

  if (declaredFields && typeof declaredFields === "object" && !Array.isArray(declaredFields)) {
    for (const [key, value] of Object.entries(declaredFields)) {
      if (!(key in defaults)) {
        console.warn(
          `[ember runtime] berekening ${calculationId} kent geen veld '${key}'; genegeerd`
        );
        continue;
      }

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
