import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  getAvailableForms,
  getMyForms,
  resolveFormContext,
  searchFormContext,
  startFormFromHub,
} from "../../api/emberApi.js";
import {
  MINIMUM_CONTEXT_SEARCH_LENGTH,
  applyUnambiguousDerivedContexts,
  groupDerivedContexts,
  resetForPrimaryContext,
} from "./formsHubContextState.js";

const CONTEXT_LABELS = {
  RELATION: "Relatie",
  PROJECT: "Project",
  WORK_ORDER: "Werkbon",
  INSTALLATION: "Installatie",
  EMPLOYEE: "Medewerker",
};

const STATUS_LABELS = {
  CONCEPT: "Concept",
  INGEDIEND: "Ingediend",
  IN_BEHANDELING: "In behandeling",
  AFGEHANDELD: "Definitief",
  INGETROKKEN: "Ingetrokken",
};

const REVIEW_LABELS = {
  NIET_VAN_TOEPASSING: "Niet van toepassing",
  CONTEXT_ONTBREEKT: "Installatie ontbreekt",
  ONTBREEKT: "Review ontbreekt",
  VEROUDERD: "Review verouderd",
  VOLTOOID: "Review voltooid",
};

const EMPTY_INSTANCE_FILTERS = {
  q: "",
  contextQ: "",
  formCode: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  reviewStatus: "",
  hasOpenPoints: "",
};

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(date);
}

function contextLabel(type) {
  return CONTEXT_LABELS[String(type || "").toUpperCase()] || type || "Context";
}

function ContextPicker({ rule, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    const clean = String(query || "").trim();
    if (clean.length < MINIMUM_CONTEXT_SEARCH_LENGTH) {
      setError(`Vul minimaal ${MINIMUM_CONTEXT_SEARCH_LENGTH} tekens in.`);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await searchFormContext(rule.context_type, clean);
      setItems(Array.isArray(result?.items) ? result.items : []);
    } catch (err) {
      setError(String(err?.message || "Context zoeken is mislukt."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card card--subtle forms-hub-context-card">
      <div className="ui-row-between forms-hub-context-head">
        <div>
          <strong>{contextLabel(rule.context_type)}</strong>
          <div className="ember-page-subtitle">
            {rule.is_required ? "Verplicht" : "Optioneel"}
            {rule.is_primary ? " ; hoofdcontext" : ""}
          </div>
        </div>
        {selected ? (
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => onSelect(null)}>
            Wijzigen
          </button>
        ) : null}
      </div>

      {selected ? (
        <div className="forms-hub-selected-context">
          <span className={`ember-label ${selected.derivation_type === "DERIVED" ? "ember-label--info" : "ember-label--success"}`}>
            {selected.derivation_type === "DERIVED" ? "Live afgeleid" : "Geselecteerd"}
          </span>
          <strong>{selected.display_label || selected.display_code || selected.source_key}</strong>
          {selected.display_code ? <span className="ember-page-subtitle">{selected.display_code}</span> : null}
        </div>
      ) : (
        <>
          <div className="ui-row forms-hub-context-search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
              placeholder={`Zoek ${contextLabel(rule.context_type).toLowerCase()}`}
            />
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void search()}>
              {loading ? "Zoeken..." : "Zoeken"}
            </button>
          </div>
          {error ? <div className="ember-error-text">{error}</div> : null}
          {items.length > 0 ? (
            <div className="forms-hub-context-results">
              {items.map((item) => (
                <button
                  type="button"
                  className="forms-hub-context-result"
                  key={`${item.context_type}:${item.source_system}:${item.source_key}`}
                  onClick={() => onSelect(item)}
                >
                  <strong>{item.display_label || item.display_code || item.source_key}</strong>
                  <span>{item.display_code || item.source_key}</span>
                  {item.business_unit ? <span>{item.business_unit}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function StartFormDialog({ form, onClose, onStarted }) {
  const rules = useMemo(
    () => [...(Array.isArray(form?.context_rules) ? form.context_rules : [])].sort(
      (a, b) => Number(a.selection_order || 0) - Number(b.selection_order || 0)
    ),
    [form]
  );
  const [selected, setSelected] = useState({});
  const [derivedCandidates, setDerivedCandidates] = useState({});
  const [instanceTitle, setInstanceTitle] = useState("");
  const [instanceNote, setInstanceNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allowedTypes = useMemo(() => new Set(rules.map((rule) => rule.context_type)), [rules]);
  const canStart = rules.every((rule) => !rule.is_required || selected[rule.context_type]);

  async function selectContext(rule, item) {
    if (rule.is_primary) {
      setSelected((current) => resetForPrimaryContext(current, rule.context_type, item));
      setDerivedCandidates({});
    } else {
      setSelected((current) => ({
        ...current,
        [rule.context_type]: item ? { ...item, derivation_type: item.derivation_type || "SELECTED" } : undefined,
      }));
    }
    setError("");
    if (!rule.is_primary || !item || !["RELATION", "PROJECT", "WORK_ORDER"].includes(rule.context_type)) return;

    try {
      const result = await resolveFormContext(
        item.context_type,
        item.source_system,
        item.source_key
      );
      const byType = groupDerivedContexts(
        result?.items,
        allowedTypes,
        item.context_type,
        item.source_key,
      );

      setDerivedCandidates(byType);
      setSelected((current) => applyUnambiguousDerivedContexts(current, byType));
    } catch (err) {
      setError(String(err?.message || "Afgeleide context kon niet worden bepaald."));
    }
  }

  async function start() {
    if (!canStart || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await startFormFromHub(form.code, {
        instance_title: instanceTitle || null,
        instance_note: instanceNote || null,
        contexts: Object.values(selected)
          .filter(Boolean)
          .map((item) => ({
            context_type: item.context_type,
            source_system: item.source_system,
            source_key: item.source_key,
          })),
      });
      if (!result?.ok || !result?.item?.route) {
        throw new Error(result?.error || "Formulier kon niet worden gestart.");
      }
      onStarted(result.item);
    } catch (err) {
      setError(String(err?.message || "Formulier starten is mislukt."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-guidance-modal-backdrop" onClick={onClose}>
      <div className="card form-guidance-modal forms-hub-start-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="ui-row-between">
          <div>
            <h2>{form.name}</h2>
            <div className="ember-page-subtitle">Kies de context voordat het formulier wordt gestart.</div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Sluiten</button>
        </div>

        <div className="ui-stack">
          {rules.map((rule) => (
            <div key={rule.context_type}>
              <ContextPicker
                rule={rule}
                selected={selected[rule.context_type]}
                onSelect={(item) => void selectContext(rule, item)}
              />
              {!selected[rule.context_type] && (derivedCandidates[rule.context_type]?.length || 0) > 1 ? (
                <div className="forms-hub-derived-list">
                  <div className="ember-page-subtitle">Kies één afgeleide {contextLabel(rule.context_type).toLowerCase()}:</div>
                  {derivedCandidates[rule.context_type].map((candidate) => (
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      key={`${candidate.source_system}:${candidate.source_key}`}
                      onClick={() => void selectContext(rule, candidate)}
                    >
                      {candidate.display_label || candidate.display_code || candidate.source_key}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          <label className="ui-stack-sm">
            <strong>Titel</strong>
            <input value={instanceTitle} maxLength={200} onChange={(event) => setInstanceTitle(event.target.value)} placeholder="Optionele herkenbare titel" />
          </label>
          <label className="ui-stack-sm">
            <strong>Notitie</strong>
            <textarea value={instanceNote} rows={3} onChange={(event) => setInstanceNote(event.target.value)} placeholder="Optionele interne notitie" />
          </label>
          {error ? <div className="ember-error-text">{error}</div> : null}
          <div className="ui-row forms-hub-dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annuleren</button>
            <button type="button" className="btn btn-primary" disabled={!canStart || busy} onClick={() => void start()}>
              {busy ? "Starten..." : "Formulier starten"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FormsHubPage() {
  const navigate = useNavigate();
  const { roles = [] } = useOutletContext() || {};
  const [tab, setTab] = useState("available");
  const [forms, setForms] = useState([]);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedForm, setSelectedForm] = useState(null);
  const [instanceFilters, setInstanceFilters] = useState(EMPTY_INSTANCE_FILTERS);
  const [instanceLoading, setInstanceLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [formResult, instanceResult] = await Promise.all([
        getAvailableForms(),
        getMyForms(),
      ]);
      setForms(Array.isArray(formResult?.items) ? formResult.items : []);
      setInstances(Array.isArray(instanceResult?.items) ? instanceResult.items : []);
    } catch (err) {
      setError(String(err?.message || "Formulieren laden is mislukt."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function applyInstanceFilters(nextFilters = instanceFilters) {
    setInstanceLoading(true);
    setError("");
    try {
      const result = await getMyForms({
        ...nextFilters,
        hasOpenPoints: nextFilters.hasOpenPoints === "1"
          ? true
          : nextFilters.hasOpenPoints === "0"
            ? false
            : undefined,
      });
      setInstances(Array.isArray(result?.items) ? result.items : []);
    } catch (err) {
      setError(String(err?.message || "Formulieren laden is mislukt."));
    } finally {
      setInstanceLoading(false);
    }
  }

  function updateInstanceFilter(key, value) {
    setInstanceFilters((current) => ({ ...current, [key]: value }));
  }

  function openInstance(item) {
    const code = String(item?.atrium_installation_code || "").trim();
    const id = item?.form_instance_id;
    navigate(code ? `/installaties/${encodeURIComponent(code)}/formulieren/${encodeURIComponent(id)}` : `/formulieren/${encodeURIComponent(id)}`);
  }

  return (
    <div className="forms-hub-page">
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-title">
            <h1>Formulieren</h1>
            <div className="ember-page-subtitle">Start gericht een formulier of ga verder met je eigen werk.</div>
          </div>
        </div>
      </div>

      <div className="inst-body ui-stack">
        <div className="forms-hub-tabs" role="tablist" aria-label="Formulieren">
          <button type="button" className={`btn ${tab === "available" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("available")}>Beschikbare formulieren</button>
          <button type="button" className={`btn ${tab === "mine" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("mine")}>Mijn formulieren</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/monitor/formulieren")}>Formulierenmonitor</button>
          {roles.includes("admin") ? <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin")}>Formulierbeheer</button> : null}
        </div>

        {loading ? <div className="card">Formulieren laden...</div> : null}
        {error ? <div className="ember-error-text">{error}</div> : null}

        {!loading && !error && tab === "available" ? (
          <div className="forms-hub-grid">
            {forms.map((form) => (
              <article className="card forms-hub-card" key={form.form_id || form.code}>
                <div className="ui-row-between">
                  <div>
                    <h2>{form.name}</h2>
                    <div className="ember-page-subtitle">{form.code} ; versie {form.version_label}</div>
                  </div>
                  {form.official_document_number ? <span className="ember-label ember-label--neutral">Nr. {form.official_document_number}</span> : null}
                </div>
                <p>{form.description || "Geen aanvullende beschrijving."}</p>
                <div className="ember-label-row">
                  {form.context_rules.map((rule) => (
                    <span className={`ember-label ${rule.is_required ? "ember-label--info" : "ember-label--muted"}`} key={rule.context_type}>
                      {contextLabel(rule.context_type)}{rule.is_required ? " verplicht" : ""}
                    </span>
                  ))}
                </div>
                <div className="forms-hub-card-meta">
                  <span>Gepubliceerd: {formatDate(form.published_at)}</span>
                  {form.owner_department ? <span>Eigenaar: {form.owner_department}</span> : null}
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setSelectedForm(form)}>Starten</button>
              </article>
            ))}
            {forms.length === 0 ? <div className="card">Er zijn geen actieve gepubliceerde formulieren.</div> : null}
          </div>
        ) : null}

        {!loading && !error && tab === "mine" ? (
          <div className="ui-stack">
            <section className="card card--subtle forms-hub-instance-filters" aria-label="Formulierfilters">
              <div className="admin-form-grid">
                <label className="ui-stack-sm"><strong>Zoeken</strong><input value={instanceFilters.q} onChange={(event) => updateInstanceFilter("q", event.target.value)} placeholder="Titel, nummer of hoofdcontext" /></label>
                <label className="ui-stack-sm"><strong>Context</strong><input value={instanceFilters.contextQ} onChange={(event) => updateInstanceFilter("contextQ", event.target.value)} placeholder="Relatie, project, werkbon, installatie of medewerker" /></label>
                <label className="ui-stack-sm"><strong>Formuliertype</strong><select value={instanceFilters.formCode} onChange={(event) => updateInstanceFilter("formCode", event.target.value)}><option value="">Alle formulieren</option>{forms.map((form) => <option value={form.code} key={form.code}>{form.name}</option>)}</select></label>
                <label className="ui-stack-sm"><strong>Status</strong><select value={instanceFilters.status} onChange={(event) => updateInstanceFilter("status", event.target.value)}><option value="">Alle statussen</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label className="ui-stack-sm"><strong>Vanaf</strong><input type="date" value={instanceFilters.dateFrom} onChange={(event) => updateInstanceFilter("dateFrom", event.target.value)} /></label>
                <label className="ui-stack-sm"><strong>Tot en met</strong><input type="date" value={instanceFilters.dateTo} onChange={(event) => updateInstanceFilter("dateTo", event.target.value)} /></label>
                <label className="ui-stack-sm"><strong>Opvolgreview</strong><select value={instanceFilters.reviewStatus} onChange={(event) => updateInstanceFilter("reviewStatus", event.target.value)}><option value="">Alle reviewstatussen</option>{Object.entries(REVIEW_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label className="ui-stack-sm"><strong>Open punten</strong><select value={instanceFilters.hasOpenPoints} onChange={(event) => updateInstanceFilter("hasOpenPoints", event.target.value)}><option value="">Alle</option><option value="1">Met open punten</option><option value="0">Zonder open punten</option></select></label>
              </div>
              <div className="ui-row forms-hub-dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setInstanceFilters(EMPTY_INSTANCE_FILTERS); void applyInstanceFilters(EMPTY_INSTANCE_FILTERS); }}>Wissen</button>
                <button type="button" className="btn btn-primary" disabled={instanceLoading} onClick={() => void applyInstanceFilters()}>{instanceLoading ? "Filteren..." : "Filters toepassen"}</button>
              </div>
            </section>

            <div className="ember-runtime-table-shell forms-hub-instance-table-shell">
              <table className="ember-runtime-table forms-hub-instance-table">
                <thead><tr><th>Document</th><th>Formulier</th><th>Status</th><th>Relatie</th><th>Project</th><th>Werkbon</th><th>Installatie</th><th>Medewerker</th><th>Aangemaakt</th><th>Gewijzigd</th><th>Nieuwe punten</th><th>Open installatie</th><th>Review</th></tr></thead>
                <tbody>
                  {instances.map((item) => (
                    <tr key={item.form_instance_id} tabIndex={0} role="button" onClick={() => openInstance(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openInstance(item); } }}>
                      <td><strong>{item.official_document_number || `#${item.form_instance_id}`}</strong><div className="ember-page-subtitle">{item.instance_title || `#${item.form_instance_id}`}</div></td>
                      <td>{item.form_name}<div className="ember-page-subtitle">{item.form_code} ; {item.version_label}</div></td>
                      <td><span className="ember-label ember-label--neutral">{STATUS_LABELS[item.status] || item.status}</span></td>
                      <td>{item.relation_label || item.relation_code || "-"}<div className="ember-page-subtitle">{item.relation_code || ""}</div></td>
                      <td>{item.project_label || item.project_code || "-"}<div className="ember-page-subtitle">{item.project_code || ""}</div></td>
                      <td>{item.work_order_label || item.work_order_code || "-"}<div className="ember-page-subtitle">{item.work_order_code || ""}</div></td>
                      <td>{item.installation_label || item.installation_code || "-"}<div className="ember-page-subtitle">{item.installation_code || ""}</div></td>
                      <td>{item.employee_label || item.employee_code || "-"}</td>
                      <td>{formatDate(item.created_at)}<div className="ember-page-subtitle">{item.created_by || "-"}</div></td>
                      <td>{formatDate(item.updated_at || item.created_at)}</td>
                      <td>{Number(item.new_follow_up_count || 0)}</td>
                      <td>{Number(item.open_installation_point_count || 0)}</td>
                      <td>{REVIEW_LABELS[item.follow_up_review_status] || item.follow_up_review_status || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {instances.length === 0 ? <div className="card">Geen formulieren gevonden voor deze filters.</div> : null}
          </div>
        ) : null}
      </div>

      {selectedForm ? (
        <StartFormDialog
          form={selectedForm}
          onClose={() => setSelectedForm(null)}
          onStarted={(item) => navigate(item.route)}
        />
      ) : null}
    </div>
  );
}
