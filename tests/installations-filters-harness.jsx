// De filterkolom van de installatiepagina, zonder aanmelden en zonder API.
//
// Alleen om de volgorde en de labels te kunnen zien: Opvolging, Installatiesoort, Meer
// filters, Bedrijven, Filters wissen. Openen op /tests/installations-filters-harness.html.

import ReactDOM from "react-dom/client";

import { BUSINESS_UNITS } from "../src/lib/businessUnitAppearance.js";
import { getInstallationTypeAppearance } from "../src/lib/installationTypeAppearance.js";
import "../src/styles/layout.css";

const SOORTEN = [
  { installation_type_key: "BMI", display_name: "BMI" },
  { installation_type_key: "BMI_OAI", display_name: "BMI + OAI" },
  { installation_type_key: "OAI_TYPE_A", display_name: "OAI Type A" },
];

function Harness() {
  return (
    <div className="ember-page" style={{ maxWidth: 460, padding: 24 }}>
      <h1 style={{ marginTop: 0, fontSize: 18 }}>Filterkolom</h1>

      <aside className="installations-filter-panel" aria-label="Installatiefilters">
        <label className="installations-filter-field">
          <span className="installations-filter-field__label">Opvolging</span>
          <select className="input">
            <option>Alle installaties</option>
          </select>
        </label>

        <div className="installations-type-filters" aria-label="Installatiesoort">
          <span className="installations-filter-field__label">Installatiesoort</span>
          <div className="installations-type-filter-buttons">
            <button type="button" className="installations-type-filter-button installations-type-filter-button--all is-active">Alle</button>
            {SOORTEN.map((soort) => (
              <button
                key={soort.installation_type_key}
                type="button"
                className="installations-type-filter-button is-active"
                style={{ "--type-color": getInstallationTypeAppearance(soort.installation_type_key).color }}
              >
                {soort.display_name}
              </button>
            ))}
          </div>
        </div>

        <details className="installations-advanced-filters">
          <summary>Meer filters</summary>
          <div className="installations-advanced-filters__content">
            <div className="ember-page-subtitle">onderhoudscontract, inspectiecertificaat, en zo verder</div>
          </div>
        </details>

        <div className="installations-type-filters" aria-label="Bedrijven">
          <span className="installations-filter-field__label">Bedrijven</span>
          <div className="installations-type-filter-buttons">
            <button type="button" className="installations-type-filter-button installations-type-filter-button--all is-active">Beide</button>
            {BUSINESS_UNITS.map((unit) => (
              <button
                key={unit.key}
                type="button"
                className="installations-type-filter-button installations-bu-filter-button is-active"
                style={{ "--type-color": unit.color }}
                title={unit.note || `Alleen installaties van ${unit.label}`}
              >
                {unit.logo ? <img src={unit.logo} alt="" className="installations-bu-filter-button__logo" /> : null}
                <span>{unit.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="btn btn-secondary">Filters wissen</button>
      </aside>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
