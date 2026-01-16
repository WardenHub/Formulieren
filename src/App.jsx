import { Routes, Route } from "react-router-dom";
import Layout from "./Layout.jsx";

function Home() {
  return (
    <div>
      <h1>Ember</h1>
      <p>Kies wat je wilt doen:</p>

      <div className="grid">
        <a className="card-link" href="/installaties">
          <div className="card">
            <h2>Installatiegegevens</h2>
            <p>Zoek en bekijk installatie-informatie.</p>
          </div>
        </a>

        <a className="card-link" href="/formulieren">
          <div className="card">
            <h2>Formulier invullen</h2>
            <p>Start of vervolg een formulier.</p>
          </div>
        </a>
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
