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

// Laat zien wat er nog aan een punt ontbreekt. Waar en wat zijn de hoofdvragen; een punt
// zonder locatie of onderbouwing is voor de opvolger minder waard.
export function missingPointParts(point) {
  const missing = [];

  if (!Array.isArray(point?.drawing_pins) || point.drawing_pins.length === 0) {
    missing.push("geen locatie");
  }

  if (!String(point?.workflow_description || "").trim()) {
    missing.push("geen toelichting");
  }

  return missing;
}
