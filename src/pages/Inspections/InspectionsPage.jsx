import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { createInspectionCase, getInspectionOverview, signalInspectionCases } from "../../api/emberApi.js";

const STATUS_LABELS = {
  ATTENTION_REQUIRED: "Aandacht nodig",
  OFFER_REQUIRED: "Offerte nodig",
  ORDERED: "Opdracht ontvangen",
  PLANNING_REQUIRED: "Planning nodig",
  PLANNED_UNCONFIRMED: "Gepland; onbevestigd",
  PLANNED_CONFIRMED: "Gepland; bevestigd",
  EXECUTED_AWAITING_REPORT: "Uitgevoerd; rapport verwacht",
  REPORT_RECEIVED: "Rapport ontvangen",
  REPAIR_REQUIRED: "Herstel nodig",
  REINSPECTION_REQUIRED: "Herinspectie nodig",
  CERTIFICATE_RECEIVED: "Certificaat ontvangen",
  COMPLETED: "Afgerond",
  CANCELLED: "Geannuleerd",
};
const ACTIVE_STATUSES = Object.keys(STATUS_LABELS).filter((status) => !["COMPLETED", "CANCELLED"].includes(status));
const SCOPES = [["BMI", "BMI"], ["OAI_A", "OAI type A"], ["OAI_B", "OAI type B"], ["OAI_PZI", "OAI PZI"]];

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(date);
}

function statusTone(status) {
  if (["REPAIR_REQUIRED", "REINSPECTION_REQUIRED", "EXPIRED", "MISSING", "REVOKED"].includes(status)) return "danger";
  if (["ATTENTION_REQUIRED", "OFFER_REQUIRED", "PLANNING_REQUIRED", "EXECUTED_AWAITING_REPORT", "EXPIRING"].includes(status)) return "warning";
  if (["CERTIFICATE_RECEIVED", "COMPLETED", "VALID"].includes(status)) return "success";
  return "muted";
}

export default function InspectionsPage() {
  const navigate = useNavigate();
  const { permissions = [] } = useOutletContext() || {};
  const canCreate = permissions.includes("inspection.create");
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ q: "", status: "", scope: "", attention: "ALL", inspection_body: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signalling, setSignalling] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ atrium_installation_code: "", scopes: ["BMI"], due_date: "", inspection_body: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await getInspectionOverview(filters);
      setItems(result?.items || []);
    } catch (nextError) {
      setError(nextError?.message || "Inspecties laden is mislukt.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(id);
  }, [filters.q, filters.status, filters.scope, filters.attention, filters.inspection_body]);

  const summary = useMemo(() => ({
    total: items.length,
    certificateMissing: items.filter((item) => ["MISSING", "EXPIRED", "REVOKED"].includes(item.certificate_status)).length,
    noCase: items.filter((item) => !item.inspection_case_id).length,
    attention: items.filter((item) => item.attention_status === "CRITICAL").length,
  }), [items]);

  async function signal() {
    setSignalling(true);
    setError("");
    try {
      await signalInspectionCases();
      await load();
    } catch (nextError) {
      setError(nextError?.message || "Signalering is mislukt.");
    } finally {
      setSignalling(false);
    }
  }

  async function create() {
    setSignalling(true);
    setError("");
    try {
      const result = await createInspectionCase({ ...draft, inspection_type: "INITIAL", status: "ATTENTION_REQUIRED" });
      setCreating(false);
      if (result?.inspection_case_id) navigate(`/inspecties/${result.inspection_case_id}`);
      else await load();
    } catch (nextError) {
      setError(nextError?.message || "Inspectiecase aanmaken is mislukt.");
    } finally {
      setSignalling(false);
    }
  }

  function openItem(item) {
    if (item.inspection_case_id) navigate(`/inspecties/${encodeURIComponent(item.inspection_case_id)}`);
    else navigate(`/installaties/${encodeURIComponent(item.atrium_installation_code)}?tab=inspections`);
  }

  return <div className="inspection-page">
    <section className="card inspection-hero">
      <div className="inspection-hero__icon"><ClipboardCheck size={28}/></div>
      <div><h1>Inspecties</h1><p className="ember-page-subtitle">Certificeringsplichtige installaties en actieve BMI- en OAI-inspecties.</p></div>
      {canCreate ? <div className="guidance-media-actions"><button className="btn" onClick={() => setCreating((value) => !value)}>Nieuwe case</button><button className="btn btn-secondary" disabled={signalling} onClick={() => void signal()}><RefreshCw size={16}/>{signalling ? "Signaleren..." : "Signalen bijwerken"}</button></div> : null}
    </section>

    {canCreate && creating ? <section className="card inspection-section">
      <div className="inspection-section__head"><div><h2>Nieuwe inspectiecase</h2><p className="ember-page-subtitle">Gebruik de stabiele Atrium-installatiecode.</p></div></div>
      <div className="inspection-editor-grid">
        <label><span>Installatiecode</span><input value={draft.atrium_installation_code} onChange={(event) => setDraft((value) => ({ ...value, atrium_installation_code: event.target.value }))}/></label>
        <label><span>Vervaldatum</span><input type="date" value={draft.due_date} onChange={(event) => setDraft((value) => ({ ...value, due_date: event.target.value }))}/></label>
        <fieldset className="inspection-scope-picker"><legend>Scopes</legend>{SCOPES.map(([scope, label]) => <label key={scope}><input type="checkbox" checked={draft.scopes.includes(scope)} onChange={(event) => setDraft((value) => ({ ...value, scopes: event.target.checked ? [...value.scopes, scope] : value.scopes.filter((item) => item !== scope) }))}/><span>{label}</span></label>)}</fieldset>
        <label><span>Keuringsinstantie</span><input value={draft.inspection_body} onChange={(event) => setDraft((value) => ({ ...value, inspection_body: event.target.value }))}/></label>
      </div>
      <div className="guidance-media-actions"><button className="btn" disabled={signalling || !draft.atrium_installation_code || !draft.scopes.length} onClick={() => void create()}>Case aanmaken</button><button className="btn btn-secondary" onClick={() => setCreating(false)}>Annuleren</button></div>
    </section> : null}

    <section className="inspection-kpis"><div className="card"><span>Installaties</span><strong>{summary.total}</strong></div><div className="card"><span>Certificaat ontbreekt of ongeldig</span><strong>{summary.certificateMissing}</strong></div><div className="card"><span>Inspectieplicht zonder case</span><strong>{summary.noCase}</strong></div><div className="card"><span>Kritieke aandacht</span><strong>{summary.attention}</strong></div></section>

    <section className="card inspection-filters inspection-filters--overview">
      <label><span>Zoeken</span><div className="inspection-search"><Search size={16}/><input value={filters.q} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} placeholder="Installatie, relatie, object of werkbon"/></div></label>
      <label><span>Aandacht</span><select value={filters.attention} onChange={(event) => setFilters((value) => ({ ...value, attention: event.target.value }))}><option value="ALL">Alle signalen</option><option value="CERTIFICATE_MISSING">Certificaat ontbreekt</option><option value="CERTIFICATE_EXPIRING">Certificaat verloopt</option><option value="CERTIFICATE_EXPIRED">Certificaat ongeldig</option><option value="NO_ACTIVE_CASE">Geen actieve case</option><option value="PLANNING_MISSING">Planning ontbreekt</option><option value="APPOINTMENT_UNCONFIRMED">Afspraak onbevestigd</option><option value="DOCUMENTS_MISSING">Documenten ontbreken</option><option value="REPORT_MISSING">Rapport ontbreekt</option><option value="REINSPECTION_REQUIRED">Herinspectie vereist</option><option value="OPEN_ACTIONS">Open inspectieacties</option></select></label>
      <label><span>Status</span><select value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}><option value="">Alle statussen</option>{ACTIVE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
      <label><span>Scope</span><select value={filters.scope} onChange={(event) => setFilters((value) => ({ ...value, scope: event.target.value }))}><option value="">Alle scopes</option>{SCOPES.map(([scope, label]) => <option key={scope} value={scope}>{label}</option>)}</select></label>
      <label><span>Keuringsinstantie</span><input value={filters.inspection_body} onChange={(event) => setFilters((value) => ({ ...value, inspection_body: event.target.value }))} placeholder="Exacte naam"/></label>
    </section>

    {error ? <div className="ember-error-text">{error}</div> : null}
    <section className="card inspection-grid-card">{loading ? <div className="inspection-empty">Inspecties laden...</div> : items.length ? <div className="inspection-grid inspection-grid--overview">
      <div className="inspection-grid__head"><span>Installatie</span><span>Relatie en object</span><span>Scope en certificaat</span><span>Case</span><span>Planning</span><span>Documenten en acties</span><span>Verantwoordelijke</span></div>
      {items.map((item) => <button type="button" className="inspection-grid__row" key={item.atrium_installation_code} onClick={() => openItem(item)}>
        <span><strong>{item.installation_name || item.atrium_installation_code}</strong><small>{item.atrium_installation_code}</small><b className={`ember-label ember-label--${statusTone(item.attention_status === "CRITICAL" ? "MISSING" : item.attention_status)}`}>{item.attention_reason || "Geen aandacht"}</b></span>
        <span><strong>{item.relation_name || "Geen relatie"}</strong><small>{item.object_name || item.formatted_address || "Geen object"}</small></span>
        <span><span className="inspection-scope-list">{(item.scopes || []).map((scope) => <i key={scope}>{scope.replace("_", "-")}</i>)}</span><b className={`ember-label ember-label--${statusTone(item.certificate_status)}`}>{item.certificate_number || item.certificate_status}</b><small>{formatDate(item.certificate_valid_until || item.nearest_certificate_valid_until)}{item.certificate_days_remaining != null ? ` ; ${item.certificate_days_remaining} dagen` : ""}</small></span>
        <span><strong>{item.inspection_case_id ? STATUS_LABELS[item.status] || item.status : "Geen actieve case"}</strong><small>{item.inspection_type || "Inspectieplicht"} ; {formatDate(item.due_date || item.inspection_due_date)}</small></span>
        <span><strong>{item.atrium_work_order_code || "Geen werkbon"}</strong><small>{item.appointment_status?.replaceAll("_", " ") || "Geen planning"} ; {formatDate(item.planned_date)}</small></span>
        <span><strong>{item.missing_required_document_count} ontbrekende documenten</strong><small>{item.open_action_count} open acties{item.inspection_report_missing ? " ; rapport ontbreekt" : ""}</small></span>
        <span><strong>{item.assigned_user_id || item.assigned_role_code || "Niet toegewezen"}</strong><small>{item.inspection_body || "Geen keuringsinstantie"}</small></span>
      </button>)}
    </div> : <div className="inspection-empty">Geen inspectieplichtige installaties binnen deze selectie.</div>}</section>
  </div>;
}
