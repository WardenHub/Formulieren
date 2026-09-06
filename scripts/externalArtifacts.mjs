import fs from "node:fs";
import path from "node:path";

// Een aantal validators controleert contracten die buiten deze checkout liggen; de Atrium
// Reader in C# en de Fabric-copyjobs. Die artefacten horen bij een andere deployment en
// komen hier nooit in de repository terecht.
//
// Tot nu toe stond het pad ernaartoe hard in drie scripts, inclusief een persoonlijke
// gebruikersnaam als terugval, en klapte een validator met een kale ENOENT zodra ze
// ontbraken. Nu is het pad instelbaar en zeggen de validators netjes wat ze hebben
// overgeslagen; de controles binnen de repository blijven altijd draaien.
//
//   EMBER_EXTERNAL_ARTIFACTS  wijst naar de map met reader/ en copyjob/
//   EMBER_EXTERNAL_STRICT=1   maakt ontbrekende externe artefacten een fout

const DEFAULT_RELATIVE_ROOT = ".codex/projects/atrium-semantic-model-nl/deployment/ember-revamp";

function resolveRoot() {
  const configured = String(process.env.EMBER_EXTERNAL_ARTIFACTS || "").trim();
  if (configured) return path.resolve(configured);

  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;

  return path.resolve(home, DEFAULT_RELATIVE_ROOT);
}

export function createExternalArtifactReader(label) {
  const root = resolveRoot();
  const strict = String(process.env.EMBER_EXTERNAL_STRICT || "") === "1";
  const available = Boolean(root && fs.existsSync(root));
  const missing = [];

  function readText(relative) {
    if (!available) {
      missing.push(relative);
      return null;
    }

    try {
      return fs.readFileSync(path.join(root, relative), "utf8");
    } catch {
      missing.push(relative);
      return null;
    }
  }

  function readJson(relative) {
    const text = readText(relative);
    if (text == null) return null;

    try {
      return JSON.parse(text);
    } catch {
      missing.push(`${relative} (geen geldige JSON)`);
      return null;
    }
  }

  function exists(relative) {
    return available && fs.existsSync(path.join(root, relative));
  }

  // Geeft de regels terug die het script aan zijn eigen failures moet toevoegen, plus de
  // mededeling die het hoe dan ook moet tonen.
  function report() {
    if (!missing.length) return { failures: [], notice: null };

    const where = root || "geen USERPROFILE of HOME in de omgeving";
    const notice = `${label}; externe artefacten niet gelezen uit ${where}; overgeslagen: ${missing.join(", ")}. Zet EMBER_EXTERNAL_ARTIFACTS om ze wel te controleren.`;

    return { failures: strict ? [notice] : [], notice };
  }

  return { root, available, strict, readText, readJson, exists, report };
}
