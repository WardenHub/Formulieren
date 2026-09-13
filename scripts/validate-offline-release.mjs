import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* De versie van Ember Offline staat op twee plekken en betekent iets naar buiten.

   `offline/package.json` is wat npm ziet, `offline/src-tauri/tauri.conf.json` is wat in de
   MSI en in de app zelf terechtkomt. Lopen ze uiteen, dan publiceer je een installer die
   zichzelf anders noemt dan het manifest zegt; de app vergelijkt die twee en meldt dan
   eeuwig dat hij verouderd is, of juist nooit.

   Bij een release komt daar de tag bij. Zet EMBER_RELEASE_TAG op de tag die gebouwd wordt,
   bijvoorbeeld offline-v1.4.2, en dan moet die exact op dezelfde versie uitkomen. Zo valt
   een release om voordat er iets geupload is, in plaats van erna.

   Los daarvan kijkt deze validator of er wijzigingen in offline/ zitten sinds de laatste
   release. Dat is een mededeling en geen fout; een tag is een besluit, maar je hoort wel te
   weten dat de downloadlink achterloopt op main. */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HIER, "..");
const TAG_PATROON = "offline-v*";

function leesJson(relatiefPad) {
  const volledig = path.join(root, relatiefPad);
  if (!fs.existsSync(volledig)) {
    console.error(`offline:validate: ${relatiefPad} ontbreekt`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(volledig, "utf8"));
}

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const pakket = leesJson("offline/package.json");
const tauri = leesJson("offline/src-tauri/tauri.conf.json");

const pakketVersie = String(pakket.version || "").trim();
const tauriVersie = String(tauri.version || "").trim();
const problemen = [];

if (!pakketVersie) problemen.push("offline/package.json heeft geen version");
if (!tauriVersie) problemen.push("offline/src-tauri/tauri.conf.json heeft geen version");

if (pakketVersie && tauriVersie && pakketVersie !== tauriVersie) {
  problemen.push(
    `de versies lopen uiteen; package.json zegt ${pakketVersie} en tauri.conf.json zegt ${tauriVersie}`
  );
}

// Het bundeldoel bepaalt welk bestand de downloadlink aanbiedt. Met "all" komen er meerdere
// installers uit een build en is "de laatste versie" niet meer één bestand.
const doelen = tauri?.bundle?.targets;
const doelenLijst = Array.isArray(doelen) ? doelen : [doelen].filter(Boolean);

if (doelenLijst.length !== 1 || doelenLijst[0] !== "msi") {
  problemen.push(
    `bundle.targets moet precies ["msi"] zijn; nu ${JSON.stringify(doelen)}. ` +
      "Intune wil een MSI, en de downloadlink moet naar één bestand kunnen wijzen"
  );
}

const tag = String(process.env.EMBER_RELEASE_TAG || "").trim();

if (tag) {
  const verwacht = `offline-v${pakketVersie}`;
  if (tag !== verwacht) {
    problemen.push(`de tag ${tag} hoort bij versie ${pakketVersie}; verwacht ${verwacht}`);
  }
}

if (problemen.length) {
  console.error("Offline releasevalidatie mislukt:");
  for (const probleem of problemen) console.error(`  - ${probleem}`);
  console.error(
    "\nZet beide versies gelijk en laat de tag erop aansluiten voordat er een installer " +
      "wordt gepubliceerd."
  );
  process.exit(1);
}

console.log(`Offline release geldig; versie ${pakketVersie}, bundeldoel msi.`);

/* Vanaf hier alleen mededelingen. In CI staat vaak een ondiepe checkout zonder tags; dan is
   er niets te vergelijken en hoort dat geen rood kruisje te geven. */
const laatsteTag = git("describe", "--tags", "--abbrev=0", "--match", TAG_PATROON);

if (!laatsteTag) {
  console.log("Nog geen offline-release getagd, of de tags ontbreken in deze checkout.");
} else {
  const gecommit = git("diff", "--name-only", `${laatsteTag}..HEAD`, "--", "offline");

  /* Ook werk dat nog niet gecommit is telt mee. Deze melding bestaat om te zeggen dat de
     downloadlink nog de vorige versie aanbiedt, en dat is juist waar op het moment dat de
     wijzigingen nog in de werkmap staan; alleen naar commits kijken zou precies dan zwijgen. */
  const lokaal = git("status", "--porcelain", "--", "offline");

  const bestanden = new Set(
    [
      ...(gecommit ? gecommit.split("\n") : []),
      ...(lokaal ? lokaal.split("\n").map((regel) => regel.slice(3)) : []),
    ]
      .map((regel) => regel.trim())
      .filter(Boolean)
  );

  if (bestanden.size > 0) {
    console.log(
      `Let op; ${bestanden.size} bestand(en) in offline/ gewijzigd sinds ${laatsteTag}` +
        (lokaal ? " (inclusief werk dat nog niet gecommit is)" : "") +
        ". De downloadlink biedt nog de vorige versie aan tot er een nieuwe tag staat."
    );
  } else {
    console.log(`Geen wijzigingen in offline/ sinds ${laatsteTag}.`);
  }
}
