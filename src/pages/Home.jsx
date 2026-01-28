// /src/pages/Home.jsx

import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="home-title">Ember</h1>
        <p className="home-subtitle muted">Kies wat je wilt doen:</p>
      </div>

      <div className="home-grid">
        <Link to="/installaties" className="home-card">
          <div className="home-card-title">Installatiegegevens</div>
          <div className="home-card-text muted">Zoek en bekijk installatie-informatie.</div>
        </Link>

        <Link to="/formulieren" className="home-card">
          <div className="home-card-title">Formulier invullen</div>
          <div className="home-card-text muted">Start of vervolg een formulier.</div>
        </Link>
      </div>
    </div>
  );
}