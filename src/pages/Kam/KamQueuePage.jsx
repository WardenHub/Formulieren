// src/pages/Kam/KamQueuePage.jsx
//
// De werklijst van de KAM-coördinator. Veiligheidsformulieren hangen aan een project en
// worden per relatie beoordeeld, dus deze lijst begint bij de klant en niet bij de
// installatie. Bewust smal gehouden; de Monitor is het brede scherm voor de
// formulierbeheerders en gaat over de installatieformulieren.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, RefreshCw } from "lucide-react";

import { getKamQueue } from "../../api/emberApi.js";

const STATUS_LABELS = {
  CONCEPT: "Concept",
  INGEDIEND: "Ingediend",
  IN_BEHANDELING: "In behandeling",
  AFGEHANDELD: "Definitief",
};

function statusLabel(status) {
  return STATUS_LABELS[String(status || "").trim()] || String(status || "Onbekend");
}

function statusTone(status) {
  const key = String(status || "").trim();
  if (key === "INGEDIEND") return "warning";
  if (key === "IN_BEHANDELING") return "active";
  if (key === "AFGEHANDELD") return "success";
  return "muted";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function KamQueuePage() {
  const navigate = useNavigate();

  const [relations, setRelations] = useState([]);
  const [forms, setForms] = useState([]);
  const [totals, setTotals] = useState(null);
  const [selectedRelation, setSelectedRelation] = useState(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(relationSourceKey, nextOnlyOpen) {
    setLoading(true);
    setError("");

    try {
      const result = await getKamQueue({
        relationSourceKey: relationSourceKey || undefined,
        onlyOpen: nextOnlyOpen,
      });

      setRelations(Array.isArray(result?.relations) ? result.relations : []);
      setForms(Array.isArray(result?.forms) ? result.forms : []);
      setTotals(result?.meta?.totals || null);
    } catch (nextError) {
      setError(nextError?.message || "De KAM-werklijst laden is mislukt.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(selectedRelation, onlyOpen);
  }, [selectedRelation, onlyOpen]);

  const selected = useMemo(
    () => relations.find((item) => item.relation_source_key === selectedRelation) || null,
    [relations, selectedRelation]
  );

  function openForm(form) {
    // Het beoordelen en definitief maken gebeurt op het formulierdetail; die route kent de
    // afrondrol, de beoordelingsronde en de afrondpoort al. Hier wordt niets van dat werk
    // nagebouwd, alleen de weg erheen kort gehouden.
    navigate(`/monitor/formulieren/${encodeURIComponent(form.form_instance_id)}`);
  }

  return (
    <div className="kam-page">
      <section className="card kam-hero">
        <div className="kam-hero__icon">
          <ShieldCheck size={28} />
        </div>

        <div>
          <h1>KAM-werklijst</h1>
          <p className="ember-page-subtitle">
            Veiligheidsformulieren per klant. Beoordeel de opvolgpunten en maak het formulier
            daarna definitief; dat laatste is jouw ondertekening.
          </p>
        </div>

        <div className="guidance-media-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => void load(selectedRelation, onlyOpen)}
          >
            <RefreshCw size={16} />
            {loading ? "Laden..." : "Vernieuwen"}
          </button>
        </div>
      </section>

      {totals ? (
        <section className="kam-kpis">
          <div className="card">
            <span>Klanten die wachten</span>
            <strong>{totals.awaiting_relation_count}</strong>
          </div>
          <div className="card">
            <span>Formulieren te beoordelen</span>
            <strong>{totals.awaiting_form_count}</strong>
          </div>
          <div className="card">
            <span>Openstaande punten</span>
            <strong>{totals.open_point_count}</strong>
          </div>
          <div className="card">
            <span>Punten over datum</span>
            <strong>{totals.overdue_point_count}</strong>
          </div>
        </section>
      ) : null}

      {error ? <div className="ember-error-text">{error}</div> : null}

      <div className="kam-layout">
        <section className="card kam-relations">
          <div className="kam-section__head">
            <h2>Klanten</h2>
            <label className="kam-toggle">
              <input
                type="checkbox"
                checked={onlyOpen}
                onChange={(event) => setOnlyOpen(event.target.checked)}
              />
              <span>Alleen wat nog werk vraagt</span>
            </label>
          </div>

          {relations.length ? (
            <ul className="kam-relation-list">
              <li>
                <button
                  type="button"
                  className={`kam-relation${selectedRelation === null ? " kam-relation--selected" : ""}`}
                  onClick={() => setSelectedRelation(null)}
                >
                  <strong>Alle klanten</strong>
                  <small>{relations.length} klanten met veiligheidsformulieren</small>
                </button>
              </li>

              {relations.map((relation) => (
                <li key={relation.relation_source_key || "zonder-relatie"}>
                  <button
                    type="button"
                    className={`kam-relation${
                      selectedRelation === relation.relation_source_key ? " kam-relation--selected" : ""
                    }`}
                    onClick={() => setSelectedRelation(relation.relation_source_key)}
                  >
                    <strong>{relation.relation_label || relation.relation_source_key || "Zonder relatie"}</strong>

                    <small>
                      {relation.form_count} formulier{relation.form_count === 1 ? "" : "en"}
                      {relation.open_point_count > 0
                        ? ` ; ${relation.open_point_count} open punt${relation.open_point_count === 1 ? "" : "en"}`
                        : " ; geen open punten"}
                    </small>

                    <span className="kam-relation__tags">
                      {relation.awaiting_kam ? (
                        <b className="ember-label ember-label--warning">
                          {relation.ingediend_count + relation.in_behandeling_count} te beoordelen
                        </b>
                      ) : (
                        <b className="ember-label ember-label--success">Bij</b>
                      )}

                      {relation.overdue_point_count > 0 ? (
                        <b className="ember-label ember-label--danger">
                          {relation.overdue_point_count} over datum
                        </b>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="kam-empty">
              {loading ? "Werklijst laden..." : "Er zijn geen veiligheidsformulieren."}
            </div>
          )}
        </section>

        <section className="card kam-forms">
          <div className="kam-section__head">
            <h2>{selected ? selected.relation_label || selected.relation_source_key : "Alle formulieren"}</h2>
            {selected ? (
              <p className="ember-page-subtitle">
                Alle openstaande veiligheidspunten van deze klant, over projecten heen;{" "}
                {selected.open_point_count} van {selected.total_point_count}.
              </p>
            ) : null}
          </div>

          {forms.length ? (
            <ul className="kam-form-list">
              {forms.map((form) => (
                <li key={form.form_instance_id}>
                  <button type="button" className="kam-form" onClick={() => openForm(form)}>
                    <span className="kam-form__main">
                      <strong>{form.project_label || form.instance_title || form.form_name}</strong>
                      <small>
                        {form.form_name}
                        {form.project_source_key ? ` ; ${form.project_source_key}` : ""}
                      </small>
                    </span>

                    <span className="kam-form__meta">
                      <b className={`ember-label ember-label--${statusTone(form.status)}`}>
                        {statusLabel(form.status)}
                      </b>
                      <small>
                        {form.status === "AFGEHANDELD"
                          ? `Definitief op ${formatDate(form.finalized_at)}`
                          : `Ingediend op ${formatDateTime(form.submitted_at)}`}
                      </small>
                    </span>

                    <span className="kam-form__points">
                      <strong>
                        {form.open_point_count} open
                      </strong>
                      <small>van {form.total_point_count} punten</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="kam-empty">
              {loading
                ? "Formulieren laden..."
                : onlyOpen
                  ? "Niets te beoordelen binnen deze selectie."
                  : "Geen formulieren binnen deze selectie."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
