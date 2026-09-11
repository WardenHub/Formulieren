// src/pages/Kam/KamFormReviewPage.jsx
//
// Het beoordelen en afronden van één veiligheidsformulier, in één rustig scherm. De Monitor
// kan dit ook, maar doet er veel meer naast; de KAM-coördinator heeft twee handelingen nodig
// en die staan hier op volgorde.
//
// Alle regels komen van dezelfde routes als de Monitor gebruikt. Er wordt hier niets
// nagebouwd aan afrondpoort, afrondrol of beoordelingsronde; dit scherm laat alleen zien wat
// de server zegt en stuurt terug wat de gebruiker kiest.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import {
  getFormsMonitorDetail,
  getFormsMonitorFollowUpReview,
  postFormsMonitorFollowUpReview,
  postFormsMonitorStatusAction,
} from "../../api/emberApi.js";

const DECISIONS = [
  ["APPROVED", "Akkoord", "Het punt staat goed zoals het is vastgelegd."],
  ["UPDATED", "Aangepast", "Je hebt de inhoud of de toewijzing bijgesteld."],
  ["DEFERRED", "Later", "Blijft staan, maar hoeft nu niet te worden opgelost."],
  ["NOT_APPLICABLE", "Niet van toepassing", "Geldt hier niet; leg uit waarom."],
];

const STATUS_LABELS = {
  CONCEPT: "Concept",
  INGEDIEND: "Ingediend",
  IN_BEHANDELING: "In behandeling",
  AFGEHANDELD: "Definitief",
  INGETROKKEN: "Ingetrokken",
};

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function KamFormReviewPage() {
  const { instanceId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [items, setItems] = useState([]);
  const [gate, setGate] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // autoClaim zet een ingediend formulier op in behandeling zodra de beoordelaar het
      // opent; zonder dat staat de beoordeling stil op een statusovergang.
      const [detailResult, reviewResult] = await Promise.all([
        getFormsMonitorDetail(instanceId, { autoClaim: true }),
        getFormsMonitorFollowUpReview(instanceId),
      ]);

      setDetail(detailResult || null);
      setGate(reviewResult?.gate || null);
      setCanReview(Boolean(reviewResult?.permissions?.can_review));

      const reviewItems = Array.isArray(reviewResult?.items) ? reviewResult.items : [];
      setItems(reviewItems);

      // Vul het formulier met wat er al staat, zodat de beoordelaar bestaande keuzes ziet in
      // plaats van een leeg vak dat zijn eerdere werk lijkt te ontkennen.
      setDrafts((previous) => {
        const next = { ...previous };
        for (const item of reviewItems) {
          const id = item.follow_up_action_id;
          if (next[id]) continue;
          next[id] = {
            review_decision: "",
            certificate_impact: item.effective_certificate_impact === "yes" ? "yes" : "no",
            customer_visible: Boolean(item.customer_visible),
            customer_discussed: false,
            review_note: "",
          };
        }
        return next;
      });
    } catch (nextError) {
      setError(nextError?.message || "Dit formulier laden is mislukt.");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setDraft(id, field, value) {
    setDrafts((previous) => ({
      ...previous,
      [id]: { ...(previous[id] || {}), [field]: value },
    }));
  }

  const missingDecisions = useMemo(
    () => items.filter((item) => !drafts[item.follow_up_action_id]?.review_decision).length,
    [items, drafts]
  );

  const status = String(detail?.item?.status || "").trim();
  const allowed = detail?.allowed_actions || {};
  const hints = detail?.hints || {};
  const summary = detail?.follow_up_summary || {};

  async function submitReview() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await postFormsMonitorFollowUpReview(instanceId, {
        items: items.map((item) => {
          const draft = drafts[item.follow_up_action_id] || {};
          return {
            follow_up_action_id: item.follow_up_action_id,
            review_decision: draft.review_decision,
            certificate_impact: draft.certificate_impact || "no",
            customer_visible: Boolean(draft.customer_visible),
            customer_discussed: Boolean(draft.customer_discussed),
            review_note: draft.review_note || null,
          };
        }),
      });

      setNotice("De beoordeling is vastgelegd.");
      await load();
    } catch (nextError) {
      setError(nextError?.message || "De beoordeling vastleggen is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await postFormsMonitorStatusAction(instanceId, "set_afgehandeld");
      setNotice("Het formulier is definitief. Jouw ondertekening staat op het rapport.");
      await load();
    } catch (nextError) {
      setError(nextError?.message || "Definitief maken is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kam-page">
      <section className="card kam-hero">
        <div className="kam-hero__icon">
          <ShieldCheck size={28} />
        </div>

        <div>
          <h1>{detail?.item?.instance_title || detail?.item?.form_name || "Veiligheidsformulier"}</h1>
          <p className="ember-page-subtitle">
            {STATUS_LABELS[status] || status || "Onbekend"}
            {detail?.item?.submitted_by ? ` ; ingediend door ${detail.item.submitted_by}` : ""}
            {detail?.item?.submitted_at ? ` op ${formatDateTime(detail.item.submitted_at)}` : ""}
          </p>
        </div>

        <div className="guidance-media-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/kam")}>
            <ArrowLeft size={16} />
            Terug naar de werklijst
          </button>
        </div>
      </section>

      {error ? <div className="ember-error-text">{error}</div> : null}
      {notice ? <div className="kam-notice">{notice}</div> : null}

      {status === "AFGEHANDELD" ? (
        <section className="card kam-forms">
          <div className="kam-section__head">
            <h2>Dit formulier is definitief</h2>
            <p className="ember-page-subtitle">
              Definitief gemaakt op {formatDateTime(detail?.item?.finalized_at)}
              {detail?.item?.finalized_by ? ` door ${detail.item.finalized_by}` : ""}. Er is verder
              niets te doen.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="card kam-forms">
            <div className="kam-section__head">
              <h2>Stap 1; beoordeel de opvolgpunten</h2>
              <p className="ember-page-subtitle">
                {items.length === 0
                  ? "Er zijn geen punten die beoordeeld moeten worden."
                  : `${items.length} punt${items.length === 1 ? "" : "en"} te beoordelen, waarvan ${missingDecisions} nog zonder keuze.`}
              </p>
            </div>

            {items.length ? (
              <ul className="kam-review-list">
                {items.map((item) => {
                  const id = item.follow_up_action_id;
                  const draft = drafts[id] || {};

                  return (
                    <li key={id} className="kam-review">
                      <div className="kam-review__head">
                        <strong>{item.workflow_title}</strong>
                        {item.category ? <b className="ember-label ember-label--muted">{item.category}</b> : null}
                      </div>

                      {item.workflow_description ? (
                        <p className="kam-review__description">{item.workflow_description}</p>
                      ) : null}

                      <div className="kam-review__decisions">
                        {DECISIONS.map(([value, label, help]) => (
                          <button
                            key={value}
                            type="button"
                            className={`kam-choice${draft.review_decision === value ? " kam-choice--selected" : ""}`}
                            title={help}
                            aria-pressed={draft.review_decision === value}
                            onClick={() => setDraft(id, "review_decision", value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="kam-review__fields">
                        <label>
                          <span>Raakt het certificaat</span>
                          <select
                            className="input"
                            value={draft.certificate_impact || "no"}
                            onChange={(event) => setDraft(id, "certificate_impact", event.target.value)}
                          >
                            <option value="no">Nee</option>
                            <option value="yes">Ja</option>
                          </select>
                        </label>

                        <label className="kam-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.customer_visible)}
                            onChange={(event) => setDraft(id, "customer_visible", event.target.checked)}
                          />
                          <span>Zichtbaar voor de klant</span>
                        </label>

                        <label className="kam-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.customer_discussed)}
                            onChange={(event) => setDraft(id, "customer_discussed", event.target.checked)}
                          />
                          <span>Met de klant besproken</span>
                        </label>
                      </div>

                      <label className="kam-review__note">
                        <span>Toelichting</span>
                        <textarea
                          className="input"
                          rows={2}
                          value={draft.review_note || ""}
                          placeholder="Wat je hebt besloten en waarom"
                          onChange={(event) => setDraft(id, "review_note", event.target.value)}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="kam-empty">
                {loading ? "Punten laden..." : "Geen punten in deze ronde."}
              </div>
            )}

            {items.length && canReview ? (
              <div className="guidance-media-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || missingDecisions > 0}
                  onClick={() => void submitReview()}
                >
                  {busy ? "Bezig..." : "Beoordeling vastleggen"}
                </button>
                {missingDecisions > 0 ? (
                  <span className="ember-page-subtitle">
                    Kies eerst bij elk punt een uitkomst.
                  </span>
                ) : null}
              </div>
            ) : null}

            {items.length && !canReview ? (
              <div className="ember-page-subtitle">
                {hints.set_afgehandeld || "Je mag dit formulier niet beoordelen."}
              </div>
            ) : null}
          </section>

          <section className="card kam-forms">
            <div className="kam-section__head">
              <h2>Stap 2; maak het formulier definitief</h2>
              <p className="ember-page-subtitle">
                Definitief maken is jouw ondertekening. Je naam en de datum komen op het rapport,
                met de handtekening uit je profiel als je die hebt.
              </p>
            </div>

            <div className="kam-gate">
              {summary.can_mark_form_done ? (
                <p>Alles is beoordeeld; het formulier kan definitief worden gemaakt.</p>
              ) : (
                <p className="kam-gate__blocked">
                  {summary.finalize_blocked_reason ||
                    gate?.blocked_reason ||
                    "Er zijn nog punten die aandacht vragen."}
                </p>
              )}
            </div>

            <div className="guidance-media-actions">
              <button
                type="button"
                className="btn"
                disabled={busy || !allowed.set_afgehandeld}
                onClick={() => void finalize()}
              >
                {busy ? "Bezig..." : "Definitief maken en ondertekenen"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
