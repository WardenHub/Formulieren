import { Routes, Route, Link } from "react-router-dom";
import Layout from "./layout.jsx";

function Home() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Ember</h1>
      <p className="muted" style={{ margin: 0 }}>
        Kies wat je wilt doen:
      </p>

      <div className="home-grid">
        <Link className="home-card" to="/installaties">
          <div className="home-card-title">Installatiegegevens</div>
          <div className="home-card-sub">Zoek en bekijk installatie-informatie.</div>
        </Link>

        <Link className="home-card" to="/formulieren">
          <div className="home-card-title">Formulier invullen</div>
          <div className="home-card-sub">Start of vervolg een formulier.</div>
        </Link>
      </div>
    </div>
  );
}

function Installaties() {
  return (
    <div>
      <h1>Installatiegegevens</h1>
      <p>placeholder (later: installatie zoeken + details)</p>
    </div>
  );
}

function Formulieren() {
  return (
    <div>
      <h1>Formulier invullen</h1>
      <p>placeholder (later: kies installatie → start formulier)</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/installaties" element={<Installaties />} />
        <Route path="/formulieren" element={<Formulieren />} />
      </Route>
    </Routes>
  );
}
