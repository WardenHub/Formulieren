// De strook die zegt dat de API nog niet warm is. De echte layout zit achter een aanmelding,
// dus dit zet dezelfde schil na: een topbar van 56px en .content eronder. Openen op
// /tests/warmup-strip-harness.html.
//
// Waar naar te kijken: de strook staat onder de topbar en niet erover, hij duwt de inhoud
// een stukje omlaag in plaats van eroverheen te liggen, en hij blijft staan tijdens
// scrollen. De knop "Stand" loopt langs opwarmen (met spinner), opgegeven (rood, zonder
// spinner) en klaar (geen strook). In het donkere thema hoort alles leesbaar te blijven.

import { useState } from "react";
import ReactDOM from "react-dom/client";

import "../src/styles/layout.css";

const STANDEN = ["unavailable", "failed", "ready"];

function Harness() {
  const [stand, setStand] = useState("unavailable");
  const [pogingen, setPogingen] = useState(0);
  const zichtbaar = stand !== "ready";

  function wisselThema() {
    const root = document.documentElement;
    const donker = root.getAttribute("data-appearance") === "dark";
    root.setAttribute("data-appearance", donker ? "light" : "dark");
    root.setAttribute("data-appearance-preference", donker ? "light" : "dark");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Ember</div>
        <div className="topbar-spacer" />
        <button type="button" className="btn btn-secondary" onClick={wisselThema}>
          Thema
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          id="harness-stand"
          onClick={() => setStand((huidig) => STANDEN[(STANDEN.indexOf(huidig) + 1) % STANDEN.length])}
        >
          Stand: {stand}
        </button>
      </header>

      <main className="content">
        {zichtbaar ? (
          <div
            className={`ember-warmup-strip${stand === "failed" ? " ember-warmup-strip--failed" : ""}`}
            role="status"
            aria-live="polite"
          >
            {stand === "unavailable" ? (
              <span className="ember-warmup-strip__spinner" aria-hidden="true" />
            ) : null}

            <span className="ember-warmup-strip__text">
              {stand === "unavailable"
                ? "Ember is aan het opstarten en je rollen zijn nog niet bekend. Menu-items, nieuws en installaties kunnen daardoor ontbreken. Dit probeert automatisch opnieuw."
                : "Je rollen zijn niet opgehaald, dus menu-items en gegevens kunnen ontbreken. Probeer het opnieuw; blijft dit staan, log dan opnieuw in."}
            </span>

            <button
              type="button"
              className="ember-warmup-strip__button"
              onClick={() => setPogingen((n) => n + 1)}
            >
              Nu opnieuw proberen
            </button>
          </div>
        ) : null}

        <div className="ui-stack" id="harness-inhoud">
          <div className="ember-card">
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Eerste kaart</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              Handmatig opnieuw geprobeerd: {pogingen}x.
            </p>
          </div>

          {Array.from({ length: 12 }, (_, i) => (
            <div className="ember-card" key={i}>
              Blok {i + 1}; scroll door om te zien of de strook blijft staan.
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
