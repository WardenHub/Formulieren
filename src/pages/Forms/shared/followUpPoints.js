//src/pages/Forms/shared/followUpPoints.js

// Hulpfuncties rond opvolgpunten, los van de weergave zodat runner, sheet, indien-dialoog
// en installatietab dezelfde definitie van "open" gebruiken.

const TERMINALE_STATUSSEN = new Set(["AFGEHANDELD", "AFGEWEZEN", "VERVALLEN", "INFORMATIEF"]);

export function isOpenPoint(point) {
  return !TERMINALE_STATUSSEN.has(String(point?.status || "").trim().toUpperCase());
}

export function countOpenPoints(points) {
  return (Array.isArray(points) ? points : []).filter(isOpenPoint).length;
}

// Laat zien wat er nog aan een punt ontbreekt. Een locatie staat hier bewust niet bij.
// Lang niet elk punt heeft een plek op de tekening; "er ontbreekt een getekend PVE" gaat over
// de installatie als geheel. Stond geen locatie als tekort in beeld, dan zag zo'n punt er
// altijd onaf uit en ging de invuller pinnen om van de melding af te komen. Een pin is een
// aanbod, geen eis; zie hasPointLocation voor de neutrale weergave daarvan.
export function missingPointParts(point) {
  const missing = [];

  if (!String(point?.workflow_description || "").trim()) {
    missing.push("geen toelichting");
  }

  return missing;
}

export function hasPointLocation(point) {
  return Array.isArray(point?.drawing_pins) && point.drawing_pins.length > 0;
}
