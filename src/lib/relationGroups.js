/* Hoe een installatie aan een relatiegroep hangt, in gewone woorden.

   De API geeft per groep de objectrollen terug waarmee de koppeling loopt: GEBRUIKER,
   EIGENAAR, BEHEERDER of DEBITEUR. Dat is precies het antwoord op de vraag die een tag oproept;
   "waarom staat RUG hier?" is "de gebruiker van dit object zit in die groep". Zonder dat is een
   tag een bewering zonder onderbouwing.

   De volgorde is die van de rollen zelf en niet die van de API, zodat dezelfde koppeling er
   overal hetzelfde uitziet. Een onbekende code valt niet weg maar wordt getoond zoals hij
   binnenkwam; dat is beter dan stilzwijgend informatie verliezen als Atrium er een rol bij
   krijgt. */

export const RELATION_GROUP_ROLE_LABELS = [
  { code: "GEBRUIKER", label: "gebruiker" },
  { code: "EIGENAAR", label: "eigenaar" },
  { code: "BEHEERDER", label: "beheerder" },
  { code: "DEBITEUR", label: "debiteur" },
];

export function relationGroupRoleLabels(roles) {
  const codes = (Array.isArray(roles) ? roles : [])
    .map((role) => String(role || "").trim().toUpperCase())
    .filter(Boolean);

  const known = RELATION_GROUP_ROLE_LABELS.filter((entry) => codes.includes(entry.code)).map(
    (entry) => entry.label
  );

  const onbekend = codes.filter(
    (code) => !RELATION_GROUP_ROLE_LABELS.some((entry) => entry.code === code)
  );

  return [...known, ...onbekend.map((code) => code.toLowerCase())];
}

/* "gebruiker, eigenaar"; kort genoeg om achter de naam van de groep te passen. */
export function formatRelationGroupRoles(roles) {
  return relationGroupRoleLabels(roles).join(", ");
}

/* "via de gebruiker en de eigenaar"; de zin voor een tooltip of voorleessoftware. */
export function describeRelationGroupRoles(roles) {
  const labels = relationGroupRoleLabels(roles).map((label) => `de ${label}`);
  if (!labels.length) return "";
  if (labels.length === 1) return `via ${labels[0]}`;

  return `via ${labels.slice(0, -1).join(", ")} en ${labels[labels.length - 1]}`;
}
