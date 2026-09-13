import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* De offline app rendert met de echte Ember-runtime; die bestanden staan in de webapp en
   worden hier met een relatief pad ingeladen. Daardoor loste `survey-core` twee keer op: de
   ingeladen webapp-bestanden pakten de kopie uit Formulieren/node_modules, en de eigen
   offline bestanden die uit ember-offline/node_modules. Er zaten dus twee survey-cores in
   één bundel, met twee aparte registers.

   Dat was geen theoretisch probleem. `registerEmberSurveyFunctions` schrijft Embers eigen
   expressiefuncties (toNumber en de rest) in het register van de ene kopie, terwijl het
   model door de andere kopie werd gemaakt; offline vond een expressie die functie dus niet.
   Eén kopie voor de hele bundel, en bewust die van de webapp, zodat offline exact rendert
   en rekent zoals online. Zodra beide projecten in één repository staan lost dit zichzelf
   op en kan deze alias eruit. Sinds de verhuizing naar deze repository staan beide
   projecten bij elkaar, maar `offline/` houdt voorlopig zijn eigen node_modules; pas met npm
   workspaces verdwijnt de tweede kopie vanzelf, en dat raakt de build van de Static Web App,
   dus dat is een eigen stap. */
const SURVEY_CORE = path.resolve(__dirname, "../node_modules/survey-core");

/* Een alias naar de map omzeilt de exports-map van het pakket. Daardoor kwam
   `survey-core/i18n/dutch` uit op de CommonJS-variant, en die sleept de hele bibliotheek een
   tweede keer mee; uit dezelfde map, dus de bewaker hieronder zag dat niet als twee kopieen.
   Deze aliassen wijzen daarom rechtstreeks naar de esm-bestanden. */
const SURVEY_CORE_ESM = path.join(SURVEY_CORE, "fesm/survey-core.mjs");

/* pdfjs staat alleen bij de webapp. De offline tekeningweergave gebruikt dezelfde
   bibliotheek als DrawingPinsTab, zodat een pin offline op precies dezelfde plek uitkomt als
   online; een tweede kopie in offline/node_modules zou dat alleen maar uit elkaar laten
   lopen. Net als bij survey-core verdwijnt deze alias zodra beide projecten één
   node_modules delen. */
const PDFJS = path.resolve(__dirname, "../node_modules/pdfjs-dist");

/* Bewaakt wat hierboven is rechtgezet. Deze bundel moet precies één kopie van survey-core
   bevatten; twee kopieën betekent twee registers en dan rekent offline anders dan online.
   De controle kijkt naar de echte modulegraaf van de build en niet naar een tekstpatroon in
   het resultaat, zodat hij niet meeverandert met de minifier. */
/* Rollup levert module-ids niet in één vorm. Zonder deze opschoning telde de bewaker
   hetzelfde pakket twee keer en viel de build om op een probleem dat er niet was. Windows
   vergelijkt paden bovendien hoofdletterongevoelig. */
function normaliseerPakketWortel(waarde) {
  // Rollup zet een NUL-teken voor virtuele modules, zoals de helpers van de commonjs-plugin.
  const zonderPrefix = String(waarde).replace(/^\0/, "").replace(/^\.[\\/]+/, "");
  return path.resolve(zonderPrefix).toLowerCase();
}

function eenSurveyCorePlugin() {
  return {
    name: "ember-offline-een-survey-core",
    generateBundle() {
      const wortels = new Set();

      for (const id of this.getModuleIds()) {
        const match = /^(.*node_modules[\\/]survey-core)[\\/]/.exec(id);
        if (match) wortels.add(normaliseerPakketWortel(match[1]));
      }

      if (wortels.size > 1) {
        this.error(
          `Er zitten ${wortels.size} kopieën van survey-core in de bundel: ` +
            `${[...wortels].join(" en ")}. ` +
            "Zie de toelichting bij SURVEY_CORE in vite.config.js."
        );
        return;
      }

      /* Twee builds van hetzelfde pakket zijn net zo erg als twee kopieen, en ze wonen in
         dezelfde map; de telling hierboven ziet ze dus niet. De CommonJS-bundel hoort hier
         nooit in te zitten, want alles loopt via esm. */
      for (const id of this.getModuleIds()) {
        if (/node_modules[\\/]survey-core[\\/]survey\.core\.js/.test(id)) {
          this.error(
            "De CommonJS-build van survey-core zit in de bundel. Dat gebeurt zodra een " +
              "alias de exports-map van het pakket omzeilt; laat de aliassen naar fesm wijzen."
          );
          return;
        }
      }

      /* Eén kopie is niet genoeg; het moet de kopie van de webapp zijn. Alleen dedupe zonder
         alias haalt de versie uit offline/node_modules, en dan rendert offline met een andere
         survey-core dan online. */
      const [wortel] = [...wortels];
      if (wortel && wortel !== normaliseerPakketWortel(SURVEY_CORE)) {
        this.error(
          `survey-core komt uit ${wortel} en niet uit de webapp (${path.normalize(SURVEY_CORE)}). ` +
            "Offline hoort met dezelfde survey-core te renderen als online."
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), eenSurveyCorePlugin()],
  /* pdfjs komt via een alias uit de map van de webapp en valt dus buiten deze projectwortel.
     De dev-server probeert zo'n pakket voor te bundelen, en dan gaat het mis op de worker,
     die als los bestand met ?url wordt opgehaald: die url belandt in het depsregister en
     levert daarna 504 Outdated Optimize Dep op. Uitsluiten dus; in de build verandert er
     niets, want daar wordt alles toch gebundeld. */
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },
  resolve: {
    dedupe: ["survey-core", "react", "react-dom"],
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "../src") },
      { find: /^survey-core$/, replacement: SURVEY_CORE_ESM },
      { find: /^survey-core\/i18n\/([^/]+)$/, replacement: path.join(SURVEY_CORE, "fesm/i18n/$1.mjs") },
      // Al het overige, zoals de stylesheets, komt gewoon uit dezelfde map.
      { find: /^survey-core\/(.*)$/, replacement: path.join(SURVEY_CORE, "$1") },
      { find: /^pdfjs-dist$/, replacement: path.join(PDFJS, "build/pdf.mjs") },
      { find: /^pdfjs-dist\/(.*)$/, replacement: path.join(PDFJS, "$1") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 1430,
    strictPort: true,
    fs: {
      allow: [".."],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
});
