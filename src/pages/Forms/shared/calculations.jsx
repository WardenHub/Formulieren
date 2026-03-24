// src/pages/Forms/shared/calculations.jsx

export function toNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatMaybeNumber(v, digits = 3) {
  const n = toNumberOrNull(v);
  if (n === null) return null;
  return Number(n.toFixed(digits));
}

export function valuesEqualLoose(a, b) {
  const na = toNumberOrNull(a);
  const nb = toNumberOrNull(b);

  if (na !== null && nb !== null) return na === nb;
  return String(a ?? "").trim() === String(b ?? "").trim();
}

export function computeEffectiveAh(capacityAh, quantity, configuration) {
  const cap = toNumberOrNull(capacityAh);
  const qty = toNumberOrNull(quantity);

  if (cap === null || qty === null || qty <= 0) return null;

  const cfg = String(configuration || "").trim().toLowerCase();

  if (!cfg || cfg === "single" || cfg === "unknown") return cap;
  if (cfg === "series") return cap;
  if (cfg === "parallel") return cap * qty;

  return cap;
}

export function computeRequiredAh(rustMa, alarmMa, bridgingHours, agingFactor) {
  const ir = toNumberOrNull(rustMa);
  const ia = toNumberOrNull(alarmMa);
  const t = toNumberOrNull(bridgingHours);
  const vf = toNumberOrNull(agingFactor);

  if (ir === null || ia === null || t === null || vf === null) return null;
  if (t < 0.5) return null;

  const calc = (((ir / 1000) * (t - 0.5)) + ((ia / 1000) * 0.5)) * vf;
  return formatMaybeNumber(calc, 3);
}

export function buildBrandTypeMap(prefillPayload) {
  const raw =
    prefillPayload?.choices?.k_energy_brand_types ||
    prefillPayload?.prefill?.choices?.k_energy_brand_types ||
    [];

  const map = new Map();

  for (const item of raw) {
    if (!item) continue;

    const key = item.value ?? item.key ?? item.brand_type_key ?? null;
    if (key === null || key === undefined) continue;

    map.set(String(key), {
      value: String(key),
      text: item.text ?? item.label ?? item.display_name ?? String(key),
      default_capacity_ah: toNumberOrNull(item.default_capacity_ah),
    });
  }

  return map;
}

export function parseTimeToMinutes(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;

  return hh * 60 + mm;
}

export function computeHoursBetween(startTime, endTime) {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);

  if (startMin === null || endMin === null) return null;
  if (endMin < startMin) return null;

  const diffMinutes = endMin - startMin;
  return formatMaybeNumber(diffMinutes / 60, 3);
}

export function computeMeldurenNietBeschikbaar(
  urenPerDag,
  meldersNietBeschikbaar,
  tijdsduurDagen
) {
  const uren = toNumberOrNull(urenPerDag);
  const melders = toNumberOrNull(meldersNietBeschikbaar);
  const dagen = toNumberOrNull(tijdsduurDagen);

  if (uren === null || melders === null || dagen === null) return null;
  if (uren < 0 || melders < 0 || dagen < 0) return null;

  return formatMaybeNumber(uren * melders * dagen, 3);
}

export function sumAvailabilityMelduren(rows) {
  if (!Array.isArray(rows)) return 0;

  let total = 0;
  for (const row of rows) {
    const n = toNumberOrNull(row?.melduren_niet_beschikbaar);
    if (n !== null) total += n;
  }

  return formatMaybeNumber(total, 3) ?? 0;
}

export function sumAantalMeldersFromPerformanceRows(rows) {
  if (!Array.isArray(rows)) return 0;

  let total = 0;
  for (const row of rows) {
    total += toNumberOrNull(row?.pr_aantal_auto) ?? 0;
    total += toNumberOrNull(row?.pr_aantal_hand) ?? 0;
    total += toNumberOrNull(row?.pr_aantal_vlam) ?? 0;
    total += toNumberOrNull(row?.pr_aantal_lijn) ?? 0;
    total += toNumberOrNull(row?.pr_aantal_asp) ?? 0;
  }

  return formatMaybeNumber(total, 3) ?? 0;
}

export function computeGeconstateerdeSysteembeschikbaarheid(
  aantalMelders,
  meldurenBuitenWerking
) {
  const melders = toNumberOrNull(aantalMelders);
  const melduren = toNumberOrNull(meldurenBuitenWerking);

  if (melders === null || melduren === null) return null;
  if (melders <= 0) return 0;

  const maxMelduren = 8760 * melders;
  if (maxMelduren <= 0) return 0;

  const pct = ((maxMelduren - melduren) / maxMelduren) * 100;
  return formatMaybeNumber(pct, 2);
}