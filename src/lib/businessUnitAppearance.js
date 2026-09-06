// De twee bedrijfsonderdelen in dezelfde database, en hoe ze eruitzien.
//
// Wardenburg en Hefas zijn de Nederlandse takken; ze staan in één Atrium-database en worden
// in Ember onderscheiden op BedrijfUnit. Hefas leest vandaag nul rijen en gaat naar
// verwachting rond maart 2027 live. Het filter bestaat daarom nu al: dan hoeft er straks
// niets aan de keten te veranderen en is het meteen zichtbaar zodra er data is.
//
// De beeldmerken zijn de favicons van wardenburg.nl en hefas.nl, met goedkeuring van
// Jesse overgenomen. De naam blijft naast het logo staan; een beeldmerk van zestien pixels
// is herkenbaar voor wie het kent en onleesbaar voor wie nieuw is.

import hefasLogo from "@/assets/business-units/hefas.png";
import wardenburgLogo from "@/assets/business-units/wardenburg.ico";

export const BUSINESS_UNITS = [
  {
    key: "Wardenburg",
    label: "Wardenburg",
    logo: wardenburgLogo,
    color: "#c8102e",
    note: null,
  },
  {
    key: "Hefas",
    label: "Hefas",
    logo: hefasLogo,
    color: "#0057a4",
    note: "Hefas staat klaar in Ember; er zijn nog geen installaties ingelezen.",
  },
];

export function getBusinessUnitAppearance(key) {
  const clean = String(key || "").trim().toLowerCase();
  return (
    BUSINESS_UNITS.find((unit) => unit.key.toLowerCase() === clean) || {
      key: String(key || ""),
      label: String(key || "Onbekend"),
      logo: null,
      color: "#475569",
      note: null,
    }
  );
}
