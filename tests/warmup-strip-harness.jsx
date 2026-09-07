// De strook die zegt dat de API nog niet warm is. De echte layout zit achter een aanmelding,
// dus dit zet dezelfde schil na: een topbar van 56px en .content eronder. Openen op
// /tests/warmup-strip-harness.html.
//
// Waar naar te kijken: de strook staat onder de topbar en niet erover, hij duwt de inhoud
// een stukje omlaag in plaats van eroverheen te liggen, en hij blijft staan tijdens
// scrollen. De knop "Stand" loopt langs opwarmen (spinner, geen knop), opgegeven na vijf
// minuten (rood, opnieuw proberen en een melding naar IT), verlopen sessie (rood, opnieuw
// inloggen) en klaar (geen strook). In het donkere thema hoort alles leesbaar te blijven.

import { useState } from "react";
import ReactDOM from "react-dom/client";

import BrandHomeButton from "../src/layout/BrandHomeButton.jsx";
import "../src/styles/layout.css";

const STANDEN = ["warming", "failed", "session", "ready"];

const TEKSTEN = {
  warming:
    "Ember is aan het opstarten en je rechten zijn nog niet bekend. Wacht tot de gegevens zijn opgehaald.",
  failed:
    "Je rechten konden niet worden opgehaald. Menu-items en gegevens ontbreken daardoor. Probeer het opnieuw, en laat IT weten dat er een probleem is als het blijft staan.",
  session:
    "Je sessie is verlopen, daarom zijn je rechten niet bekend. Log opnieuw in om verder te gaan.",
};

function Harness() {
  const [stand, setStand] = useState("warming");
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
        {/* Dezelfde knop als in de topbar; hover of tab erheen en de letters horen op te
            veren met het huisje dat uitschuift. */}
        <BrandHomeButton onNavigate={() => undefined} />
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
            className={`ember-warmup-strip${stand === "warming" ? "" : " ember-warmup-strip--failed"}`}
            role="status"
            aria-live="polite"
          >
            {stand === "warming" ? (
              <span className="ember-warmup-strip__spinner" aria-hidden="true" />
            ) : null}

            <span className="ember-warmup-strip__text">
              {TEKSTEN[stand]}

              {stand !== "warming" ? (
                <span className="ember-warmup-strip__detail">
                  HTTP 401; /me; unauthorized; geen token meegestuurd
                </span>
              ) : null}
            </span>

            {stand === "session" ? (
              <button type="button" className="ember-warmup-strip__button">
                Opnieuw inloggen
              </button>
            ) : null}

            {stand === "failed" ? (
              <>
                <button
                  type="button"
                  className="ember-warmup-strip__button"
                  onClick={() => setPogingen((n) => n + 1)}
                >
                  Opnieuw proberen
                </button>
                <a className="ember-warmup-strip__button" href="mailto:iemand@wardenburg.nl">
                  IT laten weten
                </a>
              </>
            ) : null}
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
