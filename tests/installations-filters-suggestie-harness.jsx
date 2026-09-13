// De zoeksuggestie en de filterchips zonder aanmelden. Het echte scherm zit achter een login
// en achter de API, dus dit zet dezelfde markup en dezelfde regels na met een handvol groepen.
// Openen op /tests/installations-filters-suggestie-harness.html.
//
// Waar naar te kijken: typ "ru" of "gem" en er verschijnt een suggestie onder de zoekbalk.
// Klikken zet het filter, de zoektekst verdwijnt en bovenaan komt een chip. Een chip weghalen
// doet precies dat ene filter, niet alles.

import { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";

import "../src/styles/layout.css";

const GROEPEN = [
  { relation_group_key: "Wardenburg|100092", relation_group_name: "RUG", installation_count: 290 },
  { relation_group_key: "Wardenburg|100102", relation_group_name: "Gemeente Midden-Groningen", installation_count: 146 },
  { relation_group_key: "Wardenburg|100253", relation_group_name: "Gemeente Het Hogeland", installation_count: 80 },
  { relation_group_key: "Wardenburg|100112", relation_group_name: "Woonzorg", installation_count: 191 },
];

function Harness() {
  const [q, setQ] = useState("");
  const [gekozen, setGekozen] = useState([]);
  const [soortAan, setSoortAan] = useState(true);

  const searchTerm = useMemo(() => q.trim(), [q]);

  const suggesties = useMemo(() => {
    if (searchTerm.length < 2) return [];
    const needle = searchTerm.toLowerCase();
    return GROEPEN
      .filter((groep) => groep.relation_group_name.toLowerCase().includes(needle))
      .filter((groep) => !gekozen.includes(groep.relation_group_key))
      .slice(0, 3);
  }, [searchTerm, gekozen]);

  const chips = useMemo(() => {
    const lijst = [];
    for (const sleutel of gekozen) {
      const groep = GROEPEN.find((item) => item.relation_group_key === sleutel);
      lijst.push({ id: sleutel, label: `Relatiegroep: ${groep?.relation_group_name}`, clear: () => setGekozen([]) });
    }
    if (soortAan) lijst.push({ id: "soort", label: "Soort: Brandmeldinstallatie", clear: () => setSoortAan(false) });
    if (searchTerm) lijst.push({ id: "zoek", label: `Zoekt op "${searchTerm}"`, clear: () => setQ("") });
    return lijst;
  }, [gekozen, soortAan, searchTerm]);

  return (
    <div style={{ padding: 16, display: "grid", gap: 14, maxWidth: 760 }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>Zoeksuggestie en filterchips</h1>

      <div className="searchbar installations-search">
        <input
          className="searchbar-input"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Zoek op code, naam of adres"
          autoComplete="off"
        />
      </div>

      {suggesties.length ? (
        <div className="installations-search-suggestions">
          <span className="installations-search-suggestions__label">Relatiegroep gevonden</span>
          <div className="installations-search-suggestions__list">
            {suggesties.map((groep) => (
              <button
                key={groep.relation_group_key}
                type="button"
                className="installations-search-suggestion"
                onClick={() => {
                  setGekozen([groep.relation_group_key]);
                  setQ("");
                }}
              >
                {groep.relation_group_name}
                <span>{groep.installation_count} installaties</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {chips.length ? (
        <div className="installations-active-filters" aria-label="Actieve filters">
          {chips.map((chip) => (
            <button key={chip.id} type="button" className="installations-active-filter" onClick={chip.clear}>
              <span>{chip.label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="installations-summary">
        <span className="ember-label ember-label--muted">
          {gekozen.length ? GROEPEN.find((g) => g.relation_group_key === gekozen[0])?.installation_count : 11128} installaties
        </span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
