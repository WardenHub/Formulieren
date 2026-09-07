// De kaart zonder aanmelden, met een handvol markers, om de laagkeuze en het diepste
// zoomniveau te kunnen bekijken. Openen op /tests/map-layers-harness.html.

import { useState } from "react";
import ReactDOM from "react-dom/client";

import InstallationsMap from "../src/pages/Installations/InstallationsMap.jsx";
import "../src/styles/layout.css";

// Een paar plekken die het punt maken; stad, bedrijventerrein en landelijk gebied.
const MARKERS = [
  { marker_group_key: "a", latitude: 52.3676, longitude: 4.9041, object_name: "Amsterdam centrum", installation_count: 3, installation_type_key: "BMI", installations: [] },
  { marker_group_key: "b", latitude: 52.95, longitude: 6.6, object_name: "Landelijk Drenthe", installation_count: 1, installation_type_key: "BMI", installations: [] },
  { marker_group_key: "c", latitude: 51.91, longitude: 4.2, object_name: "Rotterdam haven", installation_count: 12, installation_type_key: "OAI_TYPE_A", installations: [] },
];

function Harness() {
  const [error, setError] = useState(null);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0, fontSize: 18 }}>Kaartlagen</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 760, lineHeight: 1.6 }}>
        Zoom helemaal in op een van de drie markers en wissel tussen Kaart en Luchtfoto. Op
        de gewone kaart heeft het diepste niveau bijna niets te tekenen; op de luchtfoto zie
        je het gebouw.
      </p>

      {/* De foutmelding hoort over de kaart te liggen en de kaart niet te verplaatsen; met
          deze knop is dat te meten in plaats van aan te nemen. Het knopje "i" naast de
          laagkeuze hoort de bronvermelding te tonen; rechtsonder hoort niets te staan. */}
      <p>
        <button type="button" id="harness-toggle-error" onClick={() => setError((huidig) => (huidig ? null : "Ember is nog aan het opstarten; dit probeert automatisch opnieuw."))}>
          Foutmelding {error ? "uit" : "aan"}
        </button>
      </p>

      <div style={{ height: "70vh" }} id="harness-map-wrap">
        <InstallationsMap
          markers={MARKERS}
          showLegend
          showUserLocation={false}
          error={error}
          onRetry={() => setError(null)}
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
