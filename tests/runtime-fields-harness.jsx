// Harness voor de Ember-runtimevelden. Dezelfde opzet als de radial-menu-harness: een
// eigen Vite-pagina, zodat de renderer te bekijken en met het toetsenbord te bedienen is
// zonder aanmelden en zonder API. Bedoeld om drie dingen te zien werken:
//
//   1. fouten per veld, zichtbaar na invullen en verlaten in plaats van pas na Controleer;
//   2. keuzerijen als radiogroep, dus pijltjestoetsen en aria-checked;
//   3. het toetsenbord op mobiel via inputMode.
//
// Openen met de dev-server op /tests/runtime-fields-harness.html.

import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { Model } from "survey-core";
// Zelfde taalmodule als de runner, anders meet de harness iets anders dan de app.
import "survey-core/i18n/dutch";

import EmberRuntimeSurvey from "../src/pages/Forms/shared/EmberRuntimeSurvey.jsx";
import { trapFocus } from "../src/pages/Forms/shared/focusTrap.js";
import "../src/styles/layout.css";
import "../src/styles/ember-form-runtime.css";

const surveyDefinition = {
  locale: "nl",
  pages: [
    {
      name: "harness",
      title: "Runtime-velden",
      elements: [
        {
          type: "text",
          name: "vrije_tekst",
          title: "Vrije tekst; verplicht",
          isRequired: true,
        },
        {
          type: "text",
          name: "aantal_melders",
          title: "Aantal melders; verplicht getal",
          inputType: "number",
          isRequired: true,
        },
        {
          type: "text",
          name: "meterstand",
          title: "Meterstand; tekstveld met cijfertoetsenbord",
          ember: { inputMode: "decimal" },
        },
        {
          type: "boolean",
          name: "aanwezig",
          title: "Is de installatie aanwezig; verplicht",
          isRequired: true,
        },
        {
          type: "radiogroup",
          name: "beoordeling",
          title: "Beoordeling; verplicht",
          isRequired: true,
          choices: ["Ja", "Nee", "N.v.t."],
        },
        {
          type: "radiogroup",
          name: "vier_keuzes",
          title: "Vier keuzes; valt onder 680 px terug op een kolom",
          choices: ["Laag", "Normaal", "Hoog", "Kritisch"],
        },
        {
          type: "dropdown",
          name: "installatietype",
          title: "Installatietype; verplicht",
          isRequired: true,
          choices: ["Brandmeldinstallatie", "Ontvluchting", "Inbraak"],
        },
        {
          type: "comment",
          name: "opmerking",
          title: "Opmerking",
        },
        {
          type: "matrixdynamic",
          name: "kaartregels",
          title: "Kaartregels; standaardopmaak",
          rowCount: 5,
          columns: [
            { name: "locatie", title: "Locatie", cellType: "text" },
            { name: "aantal", title: "Aantal", cellType: "text", inputType: "number" },
            { name: "opmerking", title: "Opmerking", cellType: "text" },
          ],
          defaultValue: [
            { locatie: "Kast 1", aantal: 2 },
            { locatie: "Kast 2", aantal: 1 },
            { locatie: "Kast 3", aantal: 4 },
            { locatie: "Kast 4", aantal: 3 },
            { locatie: "Kast 5", aantal: 6 },
          ],
        },
        {
          type: "matrixdynamic",
          name: "beoordelingsregels",
          title: "Beoordelingsregels",
          ember: { layout: "assessment" },
          rowCount: 3,
          columns: [
            { name: "code", title: "Code", cellType: "text", readOnly: true },
            { name: "onderwerp", title: "Onderwerp", cellType: "text", readOnly: true },
            {
              name: "beoordeling",
              title: "Beoordeling",
              cellType: "radiogroup",
              choices: ["Ja", "Nee", "N.v.t."],
            },
            { name: "opmerking", title: "Opmerking", cellType: "text" },
          ],
          defaultValue: [
            { code: "C1", onderwerp: "Doormelding brandmeldingen" },
            { code: "C2", onderwerp: "Doormelding storingsmeldingen" },
            { code: "C3", onderwerp: "Sturingen bij brand" },
          ],
        },
      ],
    },
  ],
};

function buildModel() {
  const model = new Model(surveyDefinition);
  model.showNavigationButtons = false;
  return model;
}

// Meetpaneel voor de focus trap. Geen onderdeel van de app; het laat alleen zien dat Tab
// binnen een dialoog blijft en dat de focus bij sluiten teruggaat naar de knop.
function FocusTrapProbe() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    return trapFocus(dialogRef.current);
  }, [open]);

  return (
    <div style={{ margin: "12px 0", padding: 12, border: "1px dashed var(--border)", borderRadius: 10 }}>
      <button type="button" id="probe-open" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Dialoog openen
      </button>

      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Meetdialoog"
          style={{ marginTop: 10, padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}
        >
          <button type="button" id="probe-a" className="btn btn-secondary">Eerste</button>
          <button type="button" id="probe-b" className="btn btn-secondary">Tweede</button>
          <button type="button" id="probe-close" className="btn btn-primary" onClick={() => setOpen(false)}>
            Sluiten
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Harness() {
  const [model] = useState(buildModel);
  const [hasValidatedOnce, setHasValidatedOnce] = useState(false);
  const [validationSummary, setValidationSummary] = useState([]);
  const [renderKey, setRenderKey] = useState(0);

  function runValidation() {
    model.validate(true);
    setHasValidatedOnce(true);

    const summary = model
      .getAllQuestions()
      .filter((question) => (question.errors || []).length > 0)
      .map((question) => ({
        questionName: question.name,
        message: String(question.errors[0]?.text || "onbekende fout"),
      }));

    setValidationSummary(summary);
    setRenderKey((prev) => prev + 1);
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Ember runtime-velden</h1>

      <ol style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
        <li>
          Typ iets in het verplichte tekstveld, maak het weer leeg en tab weg. De fout hoort
          nu bij dat ene veld te staan, zonder dat Controleer is ingedrukt.
        </li>
        <li>
          Tab langs een verplicht veld waar je niets in typt. Dat veld hoort stil te blijven.
        </li>
        <li>
          Zet de focus op een keuzerij en gebruik de pijltjestoetsen. De keuze hoort mee te
          lopen; de hele rij is één tabstop.
        </li>
        <li>
          Zet het venster smaller dan 680 px. Ja/Nee/N.v.t. hoort naast elkaar te blijven;
          de rij met vier keuzes hoort een kolom te worden.
        </li>
      </ol>

      <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
        <button type="button" className="btn btn-primary" onClick={runValidation}>
          Controleer
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setHasValidatedOnce(false);
            setValidationSummary([]);
            setRenderKey((prev) => prev + 1);
          }}
        >
          Markeringen wissen
        </button>
      </div>

      <FocusTrapProbe />

      <div className="form-runner-survey-shell">
        <EmberRuntimeSurvey
          key={renderKey}
          model={model}
          activePageIndex={0}
          surveyDefinition={surveyDefinition}
          canEdit
          hasValidatedOnce={hasValidatedOnce}
          validationSummary={validationSummary}
          guidanceByQuestion={null}
          guidanceByMatrixRow={null}
          onOpenGuidance={() => {}}
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
