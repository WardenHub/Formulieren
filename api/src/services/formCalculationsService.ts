/* Berekende waarden op de server.

   Tot nu toe rekende alleen de browser en werd het resultaat klakkeloos opgeslagen. Een oude
   of kapotte client schreef dan een verkeerd getal weg zonder dat iets het merkte, terwijl
   juist die getallen op het certificaat belanden. De server rekent nu zelf en is de bron van
   calculated_json; wat de client meestuurt wordt genegeerd.

   De rekenregels zijn dezelfde als in src/pages/Forms/shared/calculations.jsx. Ze staan hier
   opnieuw omdat de API niets uit de frontendbundel kan importeren; wijzig ze nooit aan een
   kant alleen. */

import {
  resolveCalculationFields,
  type CalculationFields,
} from "./formCalculationFields.js";

export function toNumberOrNull(value: any): number | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim().replace(",", ".");
  if (!text) return null;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundTo(value: any, digits = 3): number | null {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return null;
  return Number(parsed.toFixed(digits));
}

export function computeEffectiveAh(capacityAh: any, quantity: any, configuration: any) {
  const capacity = toNumberOrNull(capacityAh);
  const count = toNumberOrNull(quantity);

  if (capacity === null || count === null || count <= 0) return null;

  const mode = String(configuration || "").trim().toLowerCase();
  if (mode === "parallel") return capacity * count;

  return capacity;
}

export function computeRequiredAh(
  rustMa: any,
  alarmMa: any,
  bridgingHours: any,
  agingFactor: any
) {
  const rust = toNumberOrNull(rustMa);
  const alarm = toNumberOrNull(alarmMa);
  const hours = toNumberOrNull(bridgingHours);
  const aging = toNumberOrNull(agingFactor);

  if (rust === null || alarm === null || hours === null || aging === null) return null;
  if (hours < 0.5) return null;

  return roundTo(((rust / 1000) * (hours - 0.5) + (alarm / 1000) * 0.5) * aging, 3);
}

function parseTimeToMinutes(value: any): number | null {
  const text = String(value || "").trim();
  if (!text) return null;

  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function computeHoursBetween(startTime: any, endTime: any) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (start === null || end === null) return null;
  if (end < start) return null;

  return roundTo((end - start) / 60, 3);
}

export function computeMeldurenNietBeschikbaar(
  urenPerDag: any,
  meldersNietBeschikbaar: any,
  tijdsduurDagen: any
) {
  const uren = toNumberOrNull(urenPerDag);
  const melders = toNumberOrNull(meldersNietBeschikbaar);
  const dagen = toNumberOrNull(tijdsduurDagen);

  if (uren === null || melders === null || dagen === null) return null;
  if (uren < 0 || melders < 0 || dagen < 0) return null;

  return roundTo(uren * melders * dagen, 3);
}

export function computeGeconstateerdeSysteembeschikbaarheid(
  aantalMelders: any,
  meldurenBuitenWerking: any
) {
  const melders = toNumberOrNull(aantalMelders);
  const melduren = toNumberOrNull(meldurenBuitenWerking);

  if (melders === null || melduren === null) return null;
  if (melders <= 0) return 0;

  const maximum = 8760 * melders;
  if (maximum <= 0) return 0;

  return roundTo(((maximum - melduren) / maximum) * 100, 2);
}

function asRows(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

/* De accucapaciteit per regel; wat er beschikbaar is en wat er nodig is.

   De veldnamen komen uit de declaratie van het formulier, met de bekende namen als
   standaard. De uitvoersleutels volgen de gedeclareerde kolomnamen, zodat calculated_json
   ook bij een tweede formulier met eigen kolomnamen leesbaar blijft. */
function calculateEnergySupplyCapacity(answers: any, fields: CalculationFields) {
  const rows = asRows(answers?.[fields.rows as string]);
  const agingFactor = answers?.[fields.agingFactor as string];

  const effectiveKey = fields.effectiveAh as string;
  const requiredKey = fields.requiredAh as string;

  return rows.map((row: any, index: number) => ({
    row_index: index,
    [effectiveKey]: computeEffectiveAh(
      row?.[fields.capacityAh as string],
      row?.[fields.count as string],
      row?.[fields.wiring as string]
    ),
    [requiredKey]: computeRequiredAh(
      row?.[fields.standbyCurrentMa as string],
      row?.[fields.alarmCurrentMa as string],
      row?.[fields.bridgingHours as string],
      agingFactor
    ),
  }));
}

/* De systeembeschikbaarheid; per periode de melduren, en daarna het percentage. */
function calculateSystemAvailability(answers: any, fields: CalculationFields) {
  const hoursKey = fields.hoursPerDay as string;
  const detectorHoursKey = fields.detectorHours as string;
  const detectorColumns = Array.isArray(fields.detectorCountColumns)
    ? fields.detectorCountColumns
    : [];

  const periods = asRows(answers?.[fields.rows as string]).map((row: any, index: number) => {
    const fullDayValue = row?.[fields.fullDay as string];
    const isFullDay =
      fullDayValue === true ||
      ["1", "true", "ja", "yes"].includes(String(fullDayValue ?? "").trim().toLowerCase());

    const urenPerDag = isFullDay
      ? 24
      : computeHoursBetween(row?.[fields.startTime as string], row?.[fields.endTime as string]);

    return {
      row_index: index,
      [hoursKey]: urenPerDag,
      [detectorHoursKey]: computeMeldurenNietBeschikbaar(
        urenPerDag,
        row?.[fields.unavailableDetectors as string],
        row?.[fields.durationDays as string]
      ),
    };
  });

  const meldurenTotaal = roundTo(
    periods.reduce(
      (total: number, row: any) => total + (toNumberOrNull(row[detectorHoursKey]) ?? 0),
      0
    ),
    3
  );

  const aantalMelders = roundTo(
    asRows(answers?.[fields.detectorRows as string]).reduce((total: number, row: any) => {
      return (
        total +
        detectorColumns.reduce(
          (perRow: number, column: string) => perRow + (toNumberOrNull(row?.[column]) ?? 0),
          0
        )
      );
    }, 0),
    3
  );

  const geconstateerd = computeGeconstateerdeSysteembeschikbaarheid(aantalMelders, meldurenTotaal);
  const vereist = toNumberOrNull(answers?.[fields.requiredAvailability as string]);

  return {
    periods,
    a2_melduren_buiten_werking: meldurenTotaal ?? 0,
    a2_aantal_melders: aantalMelders ?? 0,
    a2_systeembeschikbaarheid_geconstateerd: geconstateerd,
    a2_systeembeschikbaarheid_pve: vereist,
    voldoet_aan_pve:
      geconstateerd === null || vereist === null ? null : geconstateerd >= vereist,
  };
}

const CALCULATORS: Record<string, (answers: any, fields: CalculationFields) => any> = {
  "energy-supply-capacity": calculateEnergySupplyCapacity,
  "system-availability": calculateSystemAvailability,
};

/* Welke berekeningen een formulier kent staat declaratief in de definitie onder
   ember.calculations; alleen die worden gedraaid. Een definitie die een onbekende id noemt
   levert een nette melding op in plaats van een stille lege uitkomst. */
export function calculateFormValues(surveyJson: any, answers: any) {
  const declared = Array.isArray(surveyJson?.ember?.calculations)
    ? surveyJson.ember.calculations
    : [];

  const values: Record<string, any> = {};
  const unknown: string[] = [];

  for (const entry of declared) {
    const id = String(entry?.id || "").trim();
    if (!id) continue;

    const calculator = CALCULATORS[id];
    if (!calculator) {
      unknown.push(id);
      continue;
    }

    const fields = resolveCalculationFields(id, entry?.fields);
    if (!fields) {
      unknown.push(id);
      continue;
    }

    values[id] = calculator(answers || {}, fields);
  }

  return {
    calculated_at: new Date().toISOString(),
    calculated_by: "ember-api",
    values,
    unknown_calculations: unknown,
  };
}

export function hasDeclaredCalculations(surveyJson: any) {
  return (
    Array.isArray(surveyJson?.ember?.calculations) && surveyJson.ember.calculations.length > 0
  );
}
