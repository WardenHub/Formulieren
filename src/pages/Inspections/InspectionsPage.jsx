import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { INSPECTION_STATUS_LABELS, INSPECTION_APPOINTMENT_LABELS } from "@/lib/inspectionJourney.js";
import { createInspectionCase, getInspectionOverview, signalInspectionCases } from "../../api/emberApi.js";
import InstallationsMap from "../Installations/InstallationsMap.jsx";
import { CERTIFICATION_APPEARANCE, certificationAppearance } from "@/lib/certificationAppearance.js";

const STATUS_LABELS = INSPECTION_STATUS_LABELS;
const ACTIVE_STATUSES = Object.keys(STATUS_LABELS).filter((status) => !["COMPLETED", "CANCELLED"].includes(status));
const SCOPES = [["BMI", "BMI"], ["OAI_B", "OAI type B"]];

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
  const [filters, setFilters] = useState({ q: "", status: "", scope: "", attention: "ALL", inspection_body: "", certificate_type: "INSPECTION", certificate_status: "", include_historical: false, planning_window: "NEXT90" });
  const [view, setView] = useState("overview");
  const [resultMeta, setResultMeta] = useState({ summary: {}, truncated: false, total_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signalling, setSignalling] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ atrium_installation_code: "", scopes: ["BMI"], due_date: "", inspection_body: "" });
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await getInspectionOverview({ ...filters, planning_window: view === "map" || filters.certificate_type === "MAINTENANCE" ? "ALL" : filters.planning_window });
      if (sequence !== requestSequence.current) return;
      setItems(result?.items || []);
      setResultMeta({ summary: result?.summary || {}, truncated: Boolean(result?.truncated), total_count: result?.total_count || 0 });
    } catch (nextError) {
      if (sequence === requestSequence.current) setError(nextError?.message === "Failed to fetch" ? "De Ember API is niet bereikbaar; gegevens en totalen zijn niet beschikbaar." : nextError?.message || "Inspecties laden is mislukt.");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [filters, view]);

  useEffect(() => {
    const requests = requestSequence;
    const id = window.setTimeout(() => void load(), 200);
    return () => { window.clearTimeout(id); requests.current++; };
  }, [load]);

  const summary = useMemo(() => ({
    total: resultMeta.summary.total || 0,
    certificateMissing: resultMeta.summary.certificateMissing || 0,
    noCase: resultMeta.summary.noCase || 0,
    attention: resultMeta.summary.attention || 0,
  }), [resultMeta]);
  const markers = useMemo(() => {
    const groups = new Map();
    for (const item of items) {
      if (item.latitude == null || item.longitude == null || !Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude))) continue;
      const key = `${item.latitude}|${item.longitude}`;
      let group = groups.get(key);
      if (!group) { group = { ...item, marker_group_key: key, installation_count: 0, installations: [] }; groups.set(key, group); }
      group.installation_count++; group.installations.push(item);
      if (certificationAppearance(item.certificate_status).rank > certificationAppearance(group.certificate_status).rank) group.certificate_status = item.certificate_status;
    }
    return [...groups.values()];
  }, [items]);

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
      <div><h1>Certificeringsmonitor</h1><p className="ember-page-subtitle">Plan komende inspecties, bewaak achterstanden en bekijk certificaatstatussen.</p></div>
      {canCreate ? <div className="guidance-media-actions"><button className="btn" onClick={() => setCreating((value) => !value)}>Nieuwe case</button><button className="btn btn-secondary" disabled={signalling} onClick={() => void signal()}><RefreshCw size={16}/>{signalling ? "Signaleren..." : "Signalen bijwerken"}</button></div> : null}
    </section>

    <div className="ember-segmented" role="group" aria-label="Monitorweergave">
      <button className={view === "overview" ? "is-active" : ""} aria-pressed={view === "overview"} onClick={() => setView("overview")}>Inspectieplanning</button>
      <button className={view === "map" ? "is-active" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}>Certificatenkaart</button>
    </div>
    <section className="card inspection-filters">
      <label><span>Zoeken</span><div className="inspection-search"><Search size={16}/><input className="input" value={filters.q} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} placeholder="Installatie, relatie, object of werkbon"/></div></label>
      <label><span>Certificaattype</span><select className="input" value={filters.certificate_type} onChange={(e) => setFilters((f) => ({ ...f, certificate_type: e.target.value }))}><option value="INSPECTION">Inspectiecertificaat</option><option value="MAINTENANCE">Onderhoudscertificaat</option></select></label>
      <label><span>Certificaatstatus</span><select className="input" value={filters.certificate_status} onChange={(e) => setFilters((f) => ({ ...f, certificate_status: e.target.value }))}><option value="">Alle statussen</option>{Object.entries(CERTIFICATION_APPEARANCE).filter(([key]) => key !== "NOT_REQUIRED").map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      {view === "overview" && filters.certificate_type === "INSPECTION" ? <label><span>Inspectieperiode</span><select className="input" value={filters.planning_window} onChange={(e) => setFilters((f) => ({ ...f, planning_window: e.target.value }))}><option value="NEXT90">Komende 90 dagen</option><option value="OVERDUE">Datum verstreken</option><option value="UNDATED">Nog geen datum</option><option value="ALL">Alle dossiers en eisen</option></select></label> : null}
      <button type="button" role="switch" aria-checked={filters.include_historical} className={`ember-toggle ${filters.include_historical ? "is-on" : "is-off"}`} onClick={() => setFilters((f) => ({ ...f, include_historical: !f.include_historical }))}><span className="ember-toggle__track" aria-hidden="true"><span className="ember-toggle__thumb"/></span><span className="ember-toggle__label">Ook gearchiveerde installaties</span></button>
    </section>

    {canCreate && creating ? <section className="card inspection-section">
      <div className="inspection-section__head"><div><h2>Nieuwe inspectiecase</h2><p className="ember-page-subtitle">Gebruik de stabiele Atrium-installatiecode.</p></div></div>
      <div className="inspection-editor-grid">
        <label><span>Installatiecode</span><input className="input" value={draft.atrium_installation_code} onChange={(event) => setDraft((value) => ({ ...value, atrium_installation_code: event.target.value }))}/></label>
        <label><span>Vervaldatum</span><input className="input" type="date" value={draft.due_date} onChange={(event) => setDraft((value) => ({ ...value, due_date: event.target.value }))}/></label>
        <fieldset className="inspection-scope-picker"><legend>Scopes</legend>{SCOPES.map(([scope, label]) => <label key={scope}><input type="checkbox" checked={draft.scopes.includes(scope)} onChange={(event) => setDraft((value) => ({ ...value, scopes: event.target.checked ? [...value.scopes, scope] : value.scopes.filter((item) => item !== scope) }))}/><span>{label}</span></label>)}</fieldset>
        <label><span>Keuringsinstantie</span><input className="input" value={draft.inspection_body} onChange={(event) => setDraft((value) => ({ ...value, inspection_body: event.target.value }))}/></label>
      </div>
      <div className="guidance-media-actions"><button className="btn" disabled={signalling || !draft.atrium_installation_code || !draft.scopes.length} onClick={() => void create()}>Case aanmaken</button><button className="btn btn-secondary" onClick={() => setCreating(false)}>Annuleren</button></div>
    </section> : null}

    {view === "overview" ? <section className="inspection-kpis"><div className="card"><span>Installaties binnen selectie</span><strong>{loading ? "..." : error ? "Niet beschikbaar" : summary.total}</strong></div><div className="card"><span>Certificaat ontbreekt of ongeldig</span><strong>{loading ? "..." : error ? "Niet beschikbaar" : summary.certificateMissing}</strong></div><div className="card"><span>Inspectieplicht zonder dossier</span><strong>{loading ? "..." : error ? "Niet beschikbaar" : summary.noCase}</strong></div><div className="card"><span>Kritieke aandacht</span><strong>{loading ? "..." : error ? "Niet beschikbaar" : summary.attention}</strong></div></section> : null}

    <details className="card inspection-section"><summary>Meer filters{[filters.attention !== "ALL", Boolean(filters.status), Boolean(filters.scope), Boolean(filters.inspection_body)].filter(Boolean).length ? " (actief)" : ""}</summary><div className="inspection-filters inspection-filters--overview">
      <label><span>Aandacht</span><select className="input" value={filters.attention} onChange={(event) => setFilters((value) => ({ ...value, attention: event.target.value }))}><option value="ALL">Alle signalen</option><option value="CERTIFICATE_MISSING">Certificaat ontbreekt</option><option value="CERTIFICATE_EXPIRING">Certificaat verloopt</option><option value="CERTIFICATE_EXPIRED">Certificaat ongeldig</option><option value="NO_ACTIVE_CASE">Geen actieve case</option><option value="PLANNING_MISSING">Planning ontbreekt</option><option value="APPOINTMENT_UNCONFIRMED">Afspraak onbevestigd</option><option value="DOCUMENTS_MISSING">Documenten ontbreken</option><option value="REPORT_MISSING">Rapport ontbreekt</option><option value="REINSPECTION_REQUIRED">Herinspectie vereist</option><option value="OPEN_ACTIONS">Open inspectieacties</option></select></label>
      <label><span>Status</span><select className="input" value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}><option value="">Alle statussen</option>{ACTIVE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
      <label><span>Scope</span><select className="input" value={filters.scope} onChange={(event) => setFilters((value) => ({ ...value, scope: event.target.value }))}><option value="">Alle scopes</option>{SCOPES.map(([scope, label]) => <option key={scope} value={scope}>{label}</option>)}</select></label>
      <label><span>Keuringsinstantie</span><input className="input" value={filters.inspection_body} onChange={(event) => setFilters((value) => ({ ...value, inspection_body: event.target.value }))} placeholder="Exacte naam"/></label>
    </div></details>

    {error ? <div className="ember-error-text">{error}</div> : null}
    {resultMeta.truncated ? <p role="status">De totalen gelden voor alle {resultMeta.total_count} resultaten. Lijst en kaart tonen de eerste {items.length}; verfijn de filters voor de overige installaties.</p> : null}
    {view === "map" ? <section className="card inspection-section">
      <h2>Certificatenkaart</h2><p className="muted">Alle inspectieperiodes; de overige filters blijven van toepassing. Kleur toont de meest urgente certificaatstatus op de locatie; beëindigde contracten zijn grijs. {items.filter((item) => item.latitude == null || item.longitude == null).length} geladen installaties hebben geen coördinaten.</p>
      <InstallationsMap markers={error ? [] : markers} certificationMode showLegend loading={loading} error={error} onRetry={load} fitRequestKey={JSON.stringify(filters)}/>
    </section> : null}
    {view === "overview" ? <>
    <p className="muted">Per installatie het actieve dossier; gesorteerd op inspectiedatum, of de uiterste datum als nog niet gepland. Datum verstreken en Nog geen datum zijn apart te kiezen.</p>
    <section className="card inspection-grid-card">{loading ? <div className="inspection-empty">Inspecties laden...</div> : items.length ? <div className="inspection-grid inspection-grid--overview">
      <div className="inspection-grid__head"><span>Installatie</span><span>Relatie en object</span><span>Scope en certificaat</span><span>Case</span><span>Planning</span><span>Documenten en acties</span><span>Verantwoordelijke</span></div>
      {items.map((item) => <button type="button" className="inspection-grid__row" key={item.atrium_installation_code} onClick={() => openItem(item)}>
        <span><strong>{item.installation_name || item.atrium_installation_code}</strong><small>{item.atrium_installation_code}</small><strong>{formatDate(item.next_inspection_date)}</strong><small>{item.planned_date ? "Inspectie gepland" : "Uiterste inspectiedatum"}</small><b className={`ember-label ember-label--${statusTone(item.attention_status === "CRITICAL" ? "MISSING" : item.attention_status)}`}>{item.attention_reason || "Geen aandacht"}</b></span>
        <span><strong>{item.relation_name || "Geen relatie"}</strong><small>Relatie {item.relation_code || "onbekend"}</small><span>{item.object_name || item.formatted_address || "Geen object"}</span><small>Object {item.object_code || "onbekend"}</small></span>
        <span><span className="inspection-scope-list">{(item.scopes || []).map((scope) => <i key={scope}>{scope.replace("_", "-")}</i>)}</span><b className={`ember-label ember-label--${statusTone(item.certificate_status)}`}>{certificationAppearance(item.certificate_status).label}</b><small>{item.certificate_number || ""} {formatDate(item.nearest_certificate_valid_until)}{item.certificate_days_remaining != null ? ` ; ${item.certificate_days_remaining} dagen` : ""}</small></span>
        <span><strong>{item.inspection_case_id ? STATUS_LABELS[item.status] || item.status : "Geen actieve case"}</strong><small>{item.inspection_type || "Inspectieplicht"} ; {formatDate(item.due_date || item.inspection_due_date)}</small></span>
        <span><strong>{item.atrium_work_order_code || "Geen werkbon"}</strong><small>Inspectie: {formatDate(item.planned_date)}</small><small>Atrium: {INSPECTION_APPOINTMENT_LABELS[item.appointment_status] || item.appointment_status || "Geen planning"}</small></span>
        <span><strong>{item.missing_required_document_count} ontbrekende documenten</strong><small>{item.open_action_count} open acties{item.inspection_report_missing ? " ; rapport ontbreekt" : ""}</small></span>
        <span><strong>{item.assigned_user_id || item.assigned_role_code || "Niet toegewezen"}</strong><small>{item.inspection_body || "Geen keuringsinstantie"}</small></span>
      </button>)}
    </div> : <div className="inspection-empty">{error ? "Gegevens konden niet worden geladen." : "Geen installaties met een certificaateis of dossier binnen deze selectie."}</div>}</section>
    </> : null}
  </div>;
}
