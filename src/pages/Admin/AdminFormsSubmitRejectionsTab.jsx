import { Fragment, useCallback, useEffect, useState } from "react";

import { getAdminSubmitRejections, getAdminSubmitRejectionSummary } from "../../api/emberApi.js";
import AnimatedIconButton from "../../components/AnimatedIconButton.jsx";
import { ChevronDownIcon } from "../../components/ui/chevron-down.jsx";
import { ChevronUpIcon } from "../../components/ui/chevron-up.jsx";
import { formatDateTime } from "../Monitor/formsMonitorShared.jsx";

const PERIODS = [
  { value: 7, label: "Laatste 7 dagen" },
  { value: 30, label: "Laatste 30 dagen" },
  { value: 90, label: "Laatste 90 dagen" },
  { value: 365, label: "Laatste jaar" },
];

const SOURCES = [
  { value: "", label: "Alle momenten" },
  { value: "CLIENT_VALIDATION", label: "Controle in het formulier" },
  { value: "SERVER_PREVIEW", label: "Controle op de server" },
  { value: "SERVER_SUBMIT", label: "Fout bij indienen" },
];

const SOURCE_LABELS = {
  CLIENT_VALIDATION: "Controle in het formulier",
  SERVER_PREVIEW: "Controle op de server",
  SERVER_SUBMIT: "Fout bij indienen",
};

export default function AdminFormsSubmitRejectionsTab({ forms = [] }) {
  const [sinceDays, setSinceDays] = useState(30);
  const [source, setSource] = useState("");
  const [formCode, setFormCode] = useState("");

  const [summary, setSummary] = useState({ per_form: [], per_reason: [], per_question: [] });
  const [items, setItems] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // De laadstand hoort bij het ophalen zelf; zo staat de hele levenscyclus op een plek.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextSummary, nextList] = await Promise.all([
        getAdminSubmitRejectionSummary(sinceDays),
        getAdminSubmitRejections({ sinceDays, source, formCode, take: 200 }),
      ]);

      return { nextSummary, nextList };
    } finally {
      setLoading(false);
    }
  }, [sinceDays, source, formCode]);

  useEffect(() => {
    let active = true;

    load()
      .then((result) => {
        if (!active || !result) return;
        setSummary(result.nextSummary || { per_form: [], per_reason: [], per_question: [] });
        setItems(result.nextList?.items || []);
      })
      .catch((err) => active && setError(err?.message || "Geweigerde indieningen laden is mislukt."));

    return () => {
      active = false;
    };
  }, [load]);

  const totalRejections = (summary.per_form || []).reduce(
    (total, row) => total + Number(row.rejection_count || 0),
    0
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <h3 style={{ margin: "0 0 4px" }}>Vastgelopen indieningen</h3>
        <p className="ember-page-subtitle">
          Elke keer dat een invuller het formulier niet kon indienen staat hier waarom. Een vraag die
          hier bovenaan staat is meestal onduidelijk gesteld of te streng afgedwongen, niet fout
          ingevuld.
        </p>
      </div>

      <div className="action-point-filters" aria-label="Vastgelopen indieningen filteren">
        <select
          className="cf-input"
          value={sinceDays}
          aria-label="Periode"
          onChange={(event) => setSinceDays(Number(event.target.value))}
        >
          {PERIODS.map((period) => (
            <option key={period.value} value={period.value}>
              {period.label}
            </option>
          ))}
        </select>

        <select
          className="cf-input"
          value={source}
          aria-label="Moment"
          onChange={(event) => setSource(event.target.value)}
        >
          {SOURCES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>

        <select
          className="cf-input"
          value={formCode}
          aria-label="Formulier"
          onChange={(event) => setFormCode(event.target.value)}
        >
          <option value="">Alle formulieren</option>
          {forms.map((form) => (
            <option key={form.form_id || form.code} value={form.code}>
              {form.name || form.code}
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {loading ? <div className="muted">Laden...</div> : null}

      {!loading && !totalRejections ? (
        <div className="card follow-up-empty">
          Niemand is in deze periode vastgelopen bij het indienen.
        </div>
      ) : null}

      {totalRejections ? (
        <div className="admin-rejection-grid">
          <section className="card admin-rejection-panel">
            <h4>Per formulier</h4>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Formulier</th>
                  <th>Keer</th>
                  <th>Formulieren</th>
                  <th>Personen</th>
                  <th>Laatst</th>
                </tr>
              </thead>
              <tbody>
                {(summary.per_form || []).map((row) => (
                  <tr key={row.form_code || "onbekend"}>
                    <td>{row.form_name || row.form_code || "Onbekend formulier"}</td>
                    <td>{row.rejection_count}</td>
                    <td>{row.instance_count}</td>
                    <td>{row.person_count}</td>
                    <td>{formatDateTime(row.last_rejected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card admin-rejection-panel">
            <h4>Per moment en reden</h4>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Moment</th>
                  <th>Reden</th>
                  <th>Keer</th>
                </tr>
              </thead>
              <tbody>
                {(summary.per_reason || []).map((row) => (
                  <tr key={`${row.rejection_source}-${row.reason_code || "leeg"}`}>
                    <td>{SOURCE_LABELS[row.rejection_source] || row.rejection_source}</td>
                    <td>{row.reason_code || "niet vastgelegd"}</td>
                    <td>{row.rejection_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card admin-rejection-panel admin-rejection-panel--wide">
            <h4>Vragen die het vaakst blokkeren</h4>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vraag</th>
                  <th>Pagina</th>
                  <th>Keer</th>
                </tr>
              </thead>
              <tbody>
                {(summary.per_question || []).map((row) => (
                  <tr key={`${row.question_name}-${row.page_name || ""}`}>
                    <td>{row.question_name}</td>
                    <td>{row.page_name || "-"}</td>
                    <td>{row.rejection_count}</td>
                  </tr>
                ))}
                {!(summary.per_question || []).length ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      Geen vraagdetails vastgelegd in deze periode.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      {items.length ? (
        <section className="card admin-rejection-panel">
          <h4>Logboek</h4>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Wanneer</th>
                <th>Formulier</th>
                <th>Invuller</th>
                <th>Moment</th>
                <th>Blokkades</th>
                <th>Melding</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Fragment key={item.form_submit_rejection_id}>
                  <tr>
                    <td>{formatDateTime(item.rejected_at)}</td>
                    <td>
                      {item.form_name || item.form_code || "Onbekend"}
                      {item.version_label ? ` ${item.version_label}` : ""}
                      {` #${item.form_instance_id}`}
                    </td>
                    <td>{item.rejected_display || "Onbekend"}</td>
                    <td>{SOURCE_LABELS[item.rejection_source] || item.rejection_source}</td>
                    <td>{item.blocking_count}</td>
                    <td>{item.reason_message || item.reason_code || "-"}</td>
                    <td>
                      {(item.details || []).length ? (
                        <AnimatedIconButton
                          Icon={
                            expandedId === item.form_submit_rejection_id
                              ? ChevronUpIcon
                              : ChevronDownIcon
                          }
                          iconSize={16}
                          aria-expanded={expandedId === item.form_submit_rejection_id}
                          onClick={() =>
                            setExpandedId(
                              expandedId === item.form_submit_rejection_id
                                ? null
                                : item.form_submit_rejection_id
                            )
                          }
                        >
                          {expandedId === item.form_submit_rejection_id ? "Verberg" : "Details"}
                        </AnimatedIconButton>
                      ) : null}
                    </td>
                  </tr>

                  {expandedId === item.form_submit_rejection_id ? (
                    <tr>
                      <td colSpan={7}>
                        <ul className="admin-rejection-details">
                          {(item.details || []).map((detail, index) => (
                            <li key={`${detail.question_name || "veld"}-${index}`}>
                              <strong>{detail.question_name || "Onbekend veld"}</strong>
                              {detail.page_name ? ` op ${detail.page_name}` : ""}
                              {detail.message ? `; ${detail.message}` : ""}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
