import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// De databasewaarheid staat bewust buiten deze checkout, in de map "SQL DB" naast de
// repository. Dat is een afspraak: het schema hoort bij de database en niet bij de
// applicatiecode.
//
// Alle negen validators lezen die map. Op de machine van een ontwikkelaar staat hij er, op
// een CI-runner niet, en dan klapte de validator met een kale ENOENT. Dat is geen regressie
// maar een omgeving, en zo hoort het zich ook te gedragen: netjes overslaan met een
// mededeling, zodat een rood kruisje in CI altijd een echt probleem betekent.
//
//   EMBER_SQL_DB              wijst naar de map met tabel-definities.sql
//   EMBER_EXTERNAL_STRICT=1   maakt een ontbrekende map alsnog een fout

const HIER = path.dirname(fileURLToPath(import.meta.url));
const STANDAARD_ROOT = path.resolve(HIER, "..", "..", "..", "SQL DB");

export function resolveSqlTruthRoot() {
  const ingesteld = String(process.env.EMBER_SQL_DB || "").trim();
  return ingesteld ? path.resolve(ingesteld) : STANDAARD_ROOT;
}

export function sqlTruthAvailable() {
  return fs.existsSync(resolveSqlTruthRoot());
}

/* Roep dit bovenaan een validator aan. Ontbreekt de map, dan stopt het script met een
   mededeling en exitcode 0; met EMBER_EXTERNAL_STRICT=1 met exitcode 1. Staat hij er wel,
   dan krijg je een lezer terug. */
export function requireSqlTruth(label) {
  const root = resolveSqlTruthRoot();
  const strict = String(process.env.EMBER_EXTERNAL_STRICT || "") === "1";

  if (!fs.existsSync(root)) {
    const melding =
      `${label}: overgeslagen; de databasewaarheid staat buiten deze checkout en is hier niet ` +
      `gevonden (${root}). Zet EMBER_SQL_DB om de map aan te wijzen, of EMBER_EXTERNAL_STRICT=1 ` +
      `om dit als fout te behandelen.`;

    if (strict) {
      console.error(melding);
      process.exit(1);
    }

    console.log(melding);
    process.exit(0);
  }

  return {
    root,
    file(...delen) {
      return path.join(root, ...delen);
    },
    readText(...delen) {
      return fs.readFileSync(path.join(root, ...delen), "utf8");
    },
    exists(...delen) {
      return fs.existsSync(path.join(root, ...delen));
    },
  };
}
