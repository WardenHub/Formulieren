// De marker op je eigen locatie, zonder aanmelden en zonder echte geolocatie.
//
// Het punt van deze harness is de volgorde. De blauwe stip verscheen omdat de kaart de
// profielfoto las voordat de topbar hem had gezet; effecten van kinderen lopen in React
// vóór die van de ouder. Hier is die volgorde met de hand te kiezen, en de marker hoort in
// alle gevallen te kloppen.
//
// Openen op /tests/location-marker-harness.html.

import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import InstallationsMap from "../src/pages/Installations/InstallationsMap.jsx";
import { publishProfileAvatar } from "../src/lib/profileAvatarStore.js";
import "../src/styles/layout.css";

const MARKERS = [
  { marker_group_key: "a", latitude: 52.09, longitude: 5.12, object_name: "Utrecht", installation_count: 1, installation_type_key: "BMI", installations: [] },
];

// Een zichtbaar plaatje zonder netwerk; een rode stip als svg-data-URI.
const NEP_FOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="%23c8102e"/><text x="32" y="41" font-size="26" text-anchor="middle" fill="white" font-family="sans-serif">JV</text></svg>'
  );

function Harness() {
  const [beschrijving, setBeschrijving] = useState("nog niets gepubliceerd");

  // Publiceren gebeurt bewust ná het monteren van de kaart, net als in de app waar de
  // topbar zijn effect later uitvoert dan het kind.
  useEffect(() => {
    publishProfileAvatar({ src: null, initials: null });
  }, []);

  function zetLocatie() {
    // De kaart luistert naar leaflets locationfound; die bootsen we na door de
    // geolocatie-API te vervangen voordat op de knop wordt gedrukt.
    navigator.geolocation.getCurrentPosition = (ok) =>
      ok({ coords: { latitude: 52.09, longitude: 5.12, accuracy: 20 } });
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0, fontSize: 18 }}>Marker op eigen locatie</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <button type="button" className="btn btn-secondary" onClick={() => { publishProfileAvatar({ src: null, initials: null }); setBeschrijving("niets bekend; hoort een blauwe stip te zijn"); }}>
          Niets bekend
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { publishProfileAvatar({ src: null, initials: "JV" }); setBeschrijving("alleen initialen; hoort JV in een ronde marker te zijn"); }}>
          Alleen initialen
        </button>
        <button type="button" className="btn btn-primary" onClick={() => { publishProfileAvatar({ src: NEP_FOTO, initials: "JV" }); setBeschrijving("foto bekend; hoort de foto in de marker te zijn"); }}>
          Foto publiceren
        </button>
        <button type="button" className="btn btn-secondary" onClick={zetLocatie}>
          Geolocatie vastzetten op Utrecht
        </button>
      </div>

      <div className="ember-page-subtitle" style={{ marginBottom: 10 }}>{beschrijving}</div>

      <div style={{ height: "62vh" }}>
        <InstallationsMap markers={MARKERS} showUserLocation />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
