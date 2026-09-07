import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireSqlTruth } from "./sqlTruth.mjs";

// De databasewaarheid staat buiten deze checkout; ontbreekt hij, dan slaat deze
// validator zichzelf netjes over in plaats van te klappen. Zie scripts/sqlTruth.mjs.
const sqlTruth = requireSqlTruth("roles:validate");

/* De rolkaart staat op twee plekken.

   In de API staan `ROLE_GROUPS` en `APP_ROLE_MAP` als constanten; die moeten daar staan,
   want de authenticatie mag niet van een databaseverbinding afhangen. Een koude database
   zou anders betekenen dat niemand rollen heeft, en dat is precies de storing die we niet
   meer willen.

   In de database staat `dbo.ApplicationRoleDefinition` met dezelfde gegevens, want het
   beheerscherm en de rechtenkaart lezen daaruit.

   Twee plekken met dezelfde waarheid lopen uiteen; dat is een keer gebeurd, waardoor de rol
   certificering_coordinator onbereikbaar was zolang de app-rol niet in het token meekwam.
   Deze validator laat dat bij het publiceren stuklopen in plaats van in productie. */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HIER, "..");
const middlewarePad = path.join(root, "api/src/middleware/authMiddleware.ts");

function leesBlok(tekst, naam) {
  const start = tekst.indexOf(`const ${naam}`);
  if (start < 0) throw new Error(`${naam} niet gevonden in authMiddleware.ts`);

  const open = tekst.indexOf("{", start);
  const sluit = tekst.indexOf("};", open);
  if (open < 0 || sluit < 0) throw new Error(`${naam} heeft geen leesbaar blok`);

  return tekst.slice(open + 1, sluit);
}

// Regels als `admin: "b0b4..."` of `"Ember.Admin": "admin"`; commentaarregels vallen weg.
function leesPaar(blok) {
  const kaart = new Map();

  for (const regel of blok.split("\n")) {
    const schoon = regel.trim();
    if (!schoon || schoon.startsWith("//")) continue;

    const match = schoon.match(/^"?([A-Za-z0-9_.]+)"?\s*:\s*"([^"]+)"/);
    if (match) kaart.set(match[1], match[2]);
  }

  return kaart;
}

function leesSeed() {
  const tekst = sqlTruth.readText("Eigenschappen.sql");
  const insert = tekst.match(/INSERT INTO dbo\.ApplicationRoleDefinition(.*?);/is);
  if (!insert) throw new Error("de seed van ApplicationRoleDefinition is niet gevonden");

  const rijen = [];
  const patroon = /\(\s*N'([^']+)'\s*,\s*N'[^']*'\s*,\s*N'([^']*)'\s*,\s*'([^']*)'/g;
  let match;

  while ((match = patroon.exec(insert[0])) !== null) {
    rijen.push({ rol: match[1], appRol: match[2], groep: match[3].toLowerCase() });
  }

  if (!rijen.length) throw new Error("de seed leverde geen rollen op");
  return rijen;
}

const middleware = fs.readFileSync(middlewarePad, "utf8");
const roleGroups = leesPaar(leesBlok(middleware, "ROLE_GROUPS"));
const appRoleMap = leesPaar(leesBlok(middleware, "APP_ROLE_MAP"));
const seed = leesSeed();

const problemen = [];

const seedRollen = new Set(seed.map((rij) => rij.rol));
for (const rol of roleGroups.keys()) {
  if (!seedRollen.has(rol)) {
    problemen.push(`ROLE_GROUPS kent de rol ${rol}, de database niet`);
  }
}

for (const rij of seed) {
  const groep = roleGroups.get(rij.rol);

  if (!groep) {
    problemen.push(`de database kent de rol ${rij.rol}, ROLE_GROUPS niet`);
  } else if (groep.toLowerCase() !== rij.groep) {
    problemen.push(
      `de groep van ${rij.rol} verschilt; API ${groep}, database ${rij.groep}`
    );
  }

  if (!rij.appRol) continue;

  const gemapt = appRoleMap.get(rij.appRol);
  if (!gemapt) {
    problemen.push(`APP_ROLE_MAP mist de app-rol ${rij.appRol} van ${rij.rol}`);
  } else if (gemapt !== rij.rol) {
    problemen.push(
      `APP_ROLE_MAP wijst ${rij.appRol} naar ${gemapt}, de database naar ${rij.rol}`
    );
  }
}

const seedAppRollen = new Set(seed.map((rij) => rij.appRol).filter(Boolean));
for (const appRol of appRoleMap.keys()) {
  if (!seedAppRollen.has(appRol)) {
    problemen.push(`APP_ROLE_MAP kent de app-rol ${appRol}, de database niet`);
  }
}

if (problemen.length) {
  console.error("Rolkaartvalidatie mislukt:");
  for (const probleem of problemen) console.error(`  - ${probleem}`);
  console.error(
    "\nPas beide plekken aan: api/src/middleware/authMiddleware.ts en de seed van " +
      "dbo.ApplicationRoleDefinition in SQL DB/Eigenschappen.sql, met een script onder " +
      "SQL DB/alter/ voor de bestaande database."
  );
  process.exit(1);
}

console.log(
  `Rolkaart geldig; ${seed.length} rollen, groepen en app-rollen gelijk in de API en de database.`
);
