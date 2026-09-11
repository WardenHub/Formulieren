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

/* Bewaakt wat hierboven is rechtgezet. Deze bundel moet precies één kopie van survey-core
   bevatten; twee kopieën betekent twee registers en dan rekent offline anders dan online.
   De controle kijkt naar de echte modulegraaf van de build en niet naar een tekstpatroon in
   het resultaat, zodat hij niet meeverandert met de minifier. */
function eenSurveyCorePlugin() {
  return {
    name: "ember-offline-een-survey-core",
    generateBundle() {
      const wortels = new Set();

      for (const id of this.getModuleIds()) {
        const match = /^(.*node_modules[\\/]survey-core)[\\/]/.exec(id);
        if (match) wortels.add(path.normalize(match[1]));
      }

      if (wortels.size > 1) {
        this.error(
          `Er zitten ${wortels.size} kopieën van survey-core in de bundel: ` +
            `${[...wortels].join(" en ")}. ` +
            "Zie de toelichting bij SURVEY_CORE in vite.config.js."
        );
        return;
      }

      /* Eén kopie is niet genoeg; het moet de kopie van de webapp zijn. Alleen dedupe
         zonder alias haalt de versie uit ember-offline/node_modules, en dan rendert offline
         met een andere survey-core dan online. */
      const [wortel] = [...wortels];
      if (wortel && wortel !== path.normalize(SURVEY_CORE)) {
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
  resolve: {
    dedupe: ["survey-core", "react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "../src"),
      "survey-core": SURVEY_CORE,
    },
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
