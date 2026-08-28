import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, Plus, RotateCcw } from "lucide-react";
import {
  createInstallationFollowUp,
  getInstallationFollowUpCatalog,
  getInstallationDrawings,
  getInstallationWorkflowItems,
  getUserDirectory,
  historicalizeAllComponentPins,
  updateDrawingPin,
  updateInstallationFollowUpStatus,
} from "../../api/emberApi.js";
import DateInput from "../../components/DateInput.jsx";
import { ArrowBigRightIcon } from "../../components/ui/arrow-big-right.jsx";
import { BadgeAlertIcon } from "../../components/ui/badge-alert.jsx";
import { MapPinPlusInsideIcon } from "../../components/ui/map-pin-plus-inside.jsx";
import { MessageSquareMoreIcon } from "../../components/ui/message-square-more.jsx";
import { formatDateTime, getCardToneClass, getStatusTone, getToneClass, statusLabel } from "../Monitor/formsMonitorShared.jsx";

const PRIORITIES = [
  { value: "LOW", label: "Laag" },
  { value: "NORMAL", label: "Normaal" },
  { value: "HIGH", label: "Hoog" },
  { value: "CRITICAL", label: "Kritiek" },
];

const RESPONSIBILITIES = [
  { value: "WARDENBURG", label: "Ons bedrijf" },
  { value: "CUSTOMER", label: "Relatie / externe partij" },
  { value: "UNSPECIFIED", label: "Nog te bepalen" },
];

const RESPONSIBILITY_LABELS = {
  WARDENBURG: "Ons bedrijf",
  CUSTOMER: "Relatie / externe partij",
  THIRD_PARTY: "Relatie / externe partij",
  UNSPECIFIED: "Nog te bepalen",
};

const PIN_FILTERS = [
  { value: "ALL", label: "Alle markeringen" },
  { value: "COMPONENT_PLACED", label: "Component geplaatst" },
  { value: "DEFICIENCY", label: "Tekortkomingen" },
  { value: "NOTE", label: "Opmerkingen" },
];

const PIN_META = {
  COMPONENT_PLACED: { label: "Component geplaatst", Icon: MapPinPlusInsideIcon, tone: "primary" },
  DEFICIENCY: { label: "Tekortkoming", Icon: BadgeAlertIcon, tone: "danger" },
  NOTE: { label: "Opmerking", Icon: MessageSquareMoreIcon, tone: "note" },
};

function eventLabel(event) {
  const labels = {
    CREATED: "Opvolgactie aangemaakt",
    STATUS_CHANGED: "Status gewijzigd",
    CLOSED: "Opvolgactie gesloten",
    REOPENED: "Opvolgactie heropend",
    TITLE_CHANGED: "Titel gewijzigd",
    DESCRIPTION_CHANGED: "Omschrijving gewijzigd",
    DUE_DATE_CHANGED: "Deadline gewijzigd",
    RESPONSIBILITY_CHANGED: "Verantwoordelijkheid gewijzigd",
    ASSIGNMENT_CHANGED: "Toewijzing gewijzigd",
    ATTACHMENT_ADDED: "Bijlage toegevoegd",
    ATTACHMENT_REMOVED: "Bijlage verwijderd",
    DRAWING_PIN_LINKED: "Tekeningpin gekoppeld",
    DRAWING_PIN_UNLINKED: "Tekeningpin ontkoppeld",
  };
  const code = String(event?.event_type || "").trim().toUpperCase();
  let suffix = "";
  if (["STATUS_CHANGED", "CLOSED", "REOPENED"].includes(code)) {
    try {
      const next = JSON.parse(event?.new_values_json || "{}");
      if (next?.status) suffix = ` naar ${statusLabel(next.status)}`;
    } catch {
      suffix = "";
    }
  }
  return `${labels[code] || code.replaceAll("_", " ") || "Wijziging"}${suffix}`;
}

function Tag({ tone = "muted", title, children }) {
  return <span className={`monitor-tag monitor-tag--${tone}`} title={title}>{children}</span>;
}

function ActionCard({ item, busy, onStatus, onOpenDrawing, historical = false }) {
  const [eventsOpen, setEventsOpen] = useState(false);
  const pins = item.drawing_pins || [];
  const attachments = item.attachments || [];
  const categoryTags = String(item.category || "").split(/[,;|]/).map((value) => value.trim()).filter(Boolean).slice(0, 3);
  return (
    <article className={`${getCardToneClass(item.status)} follow-up-card`}>
      <div className="follow-up-card__head">
        <div>
          <div className="follow-up-card__title">
            {item.form_instance_id ? <ArrowBigRightIcon size={18} className="nav-anim-icon" /> : null}
            <span>{item.source_item_code ? `${item.source_item_code}; ` : ""}{item.workflow_title || "Opvolgactie"}</span>
          </div>
          {item.workflow_description ? <div className="follow-up-card__description">{item.workflow_description}</div> : null}
        </div>
        <span className={getToneClass(getStatusTone(item.status))}>{statusLabel(item.status)}</span>
      </div>

      <div className="follow-up-tags" aria-label="Kenmerken van opvolgactie">
        <Tag tone="active" title="Bron van deze opvolgactie">Bron; {item.source_type === "MANUAL" ? "Handmatig" : item.form_title || item.source_type}</Tag>
        <Tag title="Verantwoordelijke partij">Verantwoordelijkheid; {RESPONSIBILITY_LABELS[item.responsibility_type] || item.responsibility_type}</Tag>
        <Tag tone={item.priority === "CRITICAL" || item.priority === "HIGH" ? "warning" : "muted"}>Prioriteit; {PRIORITIES.find((entry) => entry.value === item.priority)?.label || item.priority}</Tag>
        {item.assigned_to ? <Tag>Toegewezen; {item.assigned_to}</Tag> : null}
        {item.form_instance_id ? <Tag tone="active">Formulier; {item.form_title}</Tag> : null}
        {item.instance_number != null ? <Tag>Formulier #{item.instance_number}</Tag> : null}
        {pins.length ? <Tag tone="active">Tekening; {pins.length} pin{pins.length === 1 ? "" : "nen"}</Tag> : null}
        {categoryTags.map((tag) => <Tag key={tag}>Onderwerp; {tag}</Tag>)}
      </div>

      <div className="follow-up-card__meta">
        <span>{item.due_date ? `Deadline; ${String(item.due_date).slice(0, 10)}` : "Geen deadline"}</span>
        <span>{attachments.length} bijlage{attachments.length === 1 ? "" : "n"}</span>
        <span>Laatst gewijzigd; {formatDateTime(item.updated_at || item.created_at)}</span>
      </div>

      {pins.length ? <div className="follow-up-card__links">{pins.map((pin) => (
        <button key={pin.drawing_pin_id} type="button" className="btn btn-secondary btn-compact" onClick={() => onOpenDrawing(pin)}>
          Toon op tekening; {pin.pin_label || `pagina ${pin.page_number}`}
        </button>
      ))}</div> : null}

      {item.form_instance_id ? (
        <div className="follow-up-card__links">
          <Link className="btn btn-secondary btn-compact" to={`/monitor/formulieren/${encodeURIComponent(item.form_instance_id)}`}>
            Open formulierafhandeling
          </Link>
        </div>
      ) : null}

      <div className="follow-up-card__actions">
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => setEventsOpen((value) => !value)} aria-expanded={eventsOpen}>
          <History size={16} /> Logboek {(item.events || []).length} {eventsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {!historical ? (
          <button type="button" className="btn btn-compact" disabled={busy} onClick={() => onStatus(item, "AFGEHANDELD")}>
            <CheckCircle2 size={16} /> {busy ? "Opslaan..." : "Afhandelen"}
          </button>
        ) : item.status === "AFGEHANDELD" ? (
          <button type="button" className="btn btn-secondary btn-compact" disabled={busy} onClick={() => onStatus(item, "OPEN")}>
            <RotateCcw size={16} /> {busy ? "Opslaan..." : "Heropenen"}
          </button>
        ) : null}
      </div>

      {eventsOpen ? (
        <ol className="follow-up-timeline">
          {(item.events || []).map((event) => (
            <li key={event.follow_up_action_event_id}>
              <time>{formatDateTime(event.created_at)}</time>
              <span>{event.actor_display_name_snapshot || event.actor_email_snapshot || "Systeem"}</span>
              <strong>{eventLabel(event)}</strong>
            </li>
          ))}
          {!(item.events || []).length ? <li className="muted">Nog geen logboekregels.</li> : null}
        </ol>
      ) : null}
    </article>
  );
}

function DrawingPinCard({ pin, busy, readOnly, selected = false, onOpenDrawing, onStatusChange }) {
  const meta = PIN_META[pin.pin_kind] || PIN_META.NOTE;
  const Icon = meta.Icon;
  const isHistorical = String(pin.pin_status || "").toUpperCase() === "HISTORICAL";
  const needsDrawingRevision = pin.pin_kind === "COMPONENT_PLACED" && !isHistorical;
  return (
    <article className={`follow-up-pin-card follow-up-pin-card--${meta.tone}${isHistorical ? " is-historical" : ""}${selected ? " is-selected" : ""}`}>
      <div className="follow-up-pin-card__icon"><Icon size={22} className="nav-anim-icon" /></div>
      <div className="follow-up-pin-card__body">
        <div className="follow-up-pin-card__head">
          <strong>{pin.label || meta.label}</strong>
          <Tag tone={needsDrawingRevision ? "warning" : isHistorical ? "muted" : "active"}>
            {needsDrawingRevision ? "Nog verwerken in tekenrevisie" : isHistorical ? "Historisch / verwerkt" : "Actief"}
          </Tag>
        </div>
        {pin.description ? <div className="follow-up-pin-card__description">{pin.description}</div> : null}
        <div className="follow-up-card__meta">
          <span>{meta.label}</span>
          <span>{pin.drawing_title || pin.drawing_file_name || "Tekening"}; pagina {pin.page_number}</span>
          <span>{pin.follow_up_count || 0} gekoppelde opvolging{Number(pin.follow_up_count || 0) === 1 ? "" : "en"}</span>
        </div>
      </div>
      <div className="follow-up-pin-card__actions">
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => onOpenDrawing(pin)}>Toon op tekening</button>
        <button type="button" className="btn btn-secondary btn-compact" disabled={readOnly || busy} onClick={() => onStatusChange(pin, isHistorical ? "ACTIVE" : "HISTORICAL")}>
          {isHistorical ? <RotateCcw size={15} /> : <Archive size={15} />}
          {busy ? "Opslaan..." : isHistorical ? "Opnieuw actief" : "Historisch zetten"}
        </button>
      </div>
    </article>
  );
}

const EMPTY_DRAFT = {
  title: "",
  description: "",
  status: "OPEN",
  priority: "NORMAL",
  responsibility_type: "WARDENBURG",
  assigned_user_object_id: "",
  assigned_role_code: "",
  due_date: null,
  tags: "",
  drawing_pin_id: "",
  attachment_stored_file_ids: [],
};

export default function FollowUpsTab({ code, readOnly = false, initialDrawingPinId = "", initialView = "actions", onCountChange, onOpenDrawing }) {
  const [data, setData] = useState({ activeItems: [], historicalItems: [], counts: {} });
  const [catalog, setCatalog] = useState({ statuses: [], workflow_roles: [], attachments: [] });
  const [drawingData, setDrawingData] = useState({ drawings: [], pins: [] });
  const [directory, setDirectory] = useState([]);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT, drawing_pin_id: initialDrawingPinId || "" });
  const [showCreate, setShowCreate] = useState(Boolean(initialDrawingPinId));
  const [showHistory, setShowHistory] = useState(false);
  const [pinFilter, setPinFilter] = useState("ALL");
  const [showHistoricalPins, setShowHistoricalPins] = useState(false);
  const [activeView, setActiveView] = useState(initialView === "drawings" ? "drawings" : "actions");
  const [reviewPinId, setReviewPinId] = useState("");
  const [pinBusy, setPinBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [items, nextCatalog, userDirectory, drawings] = await Promise.all([
      getInstallationWorkflowItems(code),
      getInstallationFollowUpCatalog(code),
      getUserDirectory().catch(() => ({ items: [] })),
      getInstallationDrawings(code).catch(() => ({ drawings: [], pins: [] })),
    ]);
    setData(items || { activeItems: [], historicalItems: [], counts: {} });
    setCatalog(nextCatalog || { statuses: [], workflow_roles: [], attachments: [] });
    setDirectory(userDirectory?.items || userDirectory?.users || []);
    setDrawingData(drawings || { drawings: [], pins: [] });
    onCountChange?.(Number(items?.counts?.open || 0));
  }, [code, onCountChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().catch((err) => active && setError(err?.message || "Opvolgingen laden is mislukt.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (!initialDrawingPinId) return;
    setDraft((value) => ({ ...value, drawing_pin_id: initialDrawingPinId }));
    setShowCreate(true);
    setActiveView("actions");
  }, [initialDrawingPinId]);

  useEffect(() => {
    if (initialView === "drawings") setActiveView("drawings");
  }, [initialView]);

  const activeStatuses = useMemo(() => (catalog.statuses || []).filter((item) => !item.is_terminal), [catalog.statuses]);
  const visiblePins = useMemo(() => (drawingData.pins || []).filter((pin) => {
    if (!showHistoricalPins && String(pin.pin_status || "").toUpperCase() === "HISTORICAL") return false;
    return pinFilter === "ALL" || pin.pin_kind === pinFilter;
  }), [drawingData.pins, pinFilter, showHistoricalPins]);
  const activeComponentCount = useMemo(() => (drawingData.pins || []).filter((pin) => pin.pin_kind === "COMPONENT_PLACED" && String(pin.pin_status || "").toUpperCase() === "ACTIVE").length, [drawingData.pins]);
  const activeComponentPins = useMemo(() => (drawingData.pins || []).filter((pin) => pin.pin_kind === "COMPONENT_PLACED" && String(pin.pin_status || "").toUpperCase() === "ACTIVE"), [drawingData.pins]);
  const reviewIndex = Math.max(0, activeComponentPins.findIndex((pin) => String(pin.drawing_pin_id) === reviewPinId));
  const reviewPin = activeComponentPins[reviewIndex] || null;

  async function reloadDrawingData() {
    const drawings = await getInstallationDrawings(code);
    setDrawingData(drawings || { drawings: [], pins: [] });
    return drawings;
  }

  function openDrawing(pin, options = {}) {
    onOpenDrawing?.(pin, options);
  }

  async function changePinStatus(pin, pinStatus) {
    const pinId = String(pin?.drawing_pin_id || "");
    if (!pinId || readOnly) return;
    setPinBusy(pinId);
    setError("");
    try {
      await updateDrawingPin(code, pinId, { ...pin, pin_status: pinStatus });
      const previousComponents = activeComponentPins;
      const previousIndex = previousComponents.findIndex((item) => String(item.drawing_pin_id) === pinId);
      const drawings = await reloadDrawingData();
      const nextComponents = (drawings?.pins || []).filter((item) => item.pin_kind === "COMPONENT_PLACED" && String(item.pin_status || "").toUpperCase() === "ACTIVE");
      if (pinStatus === "HISTORICAL" && pin.pin_kind === "COMPONENT_PLACED") {
        const nextPin = nextComponents[Math.min(Math.max(0, previousIndex), Math.max(0, nextComponents.length - 1))];
        setReviewPinId(String(nextPin?.drawing_pin_id || ""));
      }
    } catch (requestError) {
      setError(requestError?.status === 409 ? "De markering is intussen gewijzigd. De actuele gegevens worden opnieuw geladen." : requestError?.message || "Markering bijwerken is mislukt.");
      await reloadDrawingData().catch(() => undefined);
    } finally {
      setPinBusy("");
    }
  }

  async function historicalizeAllComponents() {
    if (readOnly || !activeComponentCount) return;
    if (!window.confirm(`Alle ${activeComponentCount} actieve componentmarkeringen van deze installatie historisch zetten? Gebruik dit pas nadat ze in de nieuwe tekenrevisie zijn verwerkt.`)) return;
    setPinBusy("ALL_COMPONENTS");
    setError("");
    try {
      await historicalizeAllComponentPins(code);
      setReviewPinId("");
      setShowHistoricalPins(true);
      await reloadDrawingData();
    } catch (requestError) {
      setError(requestError?.message || "Componentmarkeringen historisch zetten is mislukt.");
    } finally {
      setPinBusy("");
    }
  }

  function startComponentReview() {
    setPinFilter("COMPONENT_PLACED");
    setShowHistoricalPins(false);
    setReviewPinId(String(activeComponentPins[0]?.drawing_pin_id || ""));
  }

  function moveReview(offset) {
    if (!activeComponentPins.length) return;
    const nextIndex = (reviewIndex + offset + activeComponentPins.length) % activeComponentPins.length;
    setReviewPinId(String(activeComponentPins[nextIndex].drawing_pin_id));
  }

  function setField(key, value) {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "assigned_user_object_id" && value ? { assigned_role_code: "" } : {}),
      ...(key === "assigned_role_code" && value ? { assigned_user_object_id: "" } : {}),
    }));
  }

  async function createAction(event) {
    event.preventDefault();
    if (!String(draft.title || "").trim()) { setError("Vul een titel in."); return; }
    setSaving(true);
    setError("");
    try {
      const selectedUser = directory.find((item) => String(item.user_object_id) === String(draft.assigned_user_object_id));
      await createInstallationFollowUp(code, {
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        category: draft.tags.trim() || null,
        assigned_display_name_snapshot: selectedUser?.display_name || selectedUser?.name || null,
        assigned_email_snapshot: selectedUser?.email || null,
      });
      setDraft({ ...EMPTY_DRAFT });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err?.status === 409 ? "De installatie is intussen gewijzigd. Vernieuw en probeer opnieuw." : err?.message || "Opvolgactie aanmaken is mislukt.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item, status) {
    const id = String(item.follow_up_action_id);
    setRowBusy(id);
    setError("");
    try {
      await updateInstallationFollowUpStatus(code, id, status);
      setData((current) => {
        const all = [...(current.activeItems || []), ...(current.historicalItems || [])].map((row) => row.follow_up_action_id === id ? { ...row, status, updated_at: new Date().toISOString() } : row);
        const active = all.filter((row) => !["AFGEHANDELD", "VERVALLEN", "AFGEWEZEN", "INFORMATIEF"].includes(row.status));
        const historical = all.filter((row) => ["AFGEHANDELD", "VERVALLEN", "AFGEWEZEN", "INFORMATIEF"].includes(row.status));
        onCountChange?.(active.filter((row) => ["OPEN", "PLANNING_NODIG", "WACHTENOPDERDEN"].includes(row.status)).length);
        return { ...current, activeItems: active, historicalItems: historical, counts: { ...current.counts, active: active.length, historical: historical.length } };
      });
      void load();
    } catch (err) {
      setError(err?.status === 409 ? "De actie is intussen gewijzigd. De actuele gegevens worden opnieuw geladen." : err?.message || "Status wijzigen is mislukt.");
      await load().catch(() => undefined);
    } finally {
      setRowBusy("");
    }
  }

  return (
    <div className="follow-ups-page">
      <div className="follow-ups-toolbar">
        <div>
          <h2>Opvolgingen</h2>
          <p className="ember-page-subtitle">Acties voor deze installatie; vanuit formulieren, inspecties of handmatig aangemaakt.</p>
        </div>
        <button type="button" className="btn" disabled={readOnly} onClick={() => { setActiveView("actions"); setShowCreate((value) => !value); }}>
          <Plus size={17} /> Nieuwe opvolgactie
        </button>
      </div>

      <div className="forms-hub-tabs follow-ups-subtabs" role="tablist" aria-label="Opvolgingen">
        <button type="button" role="tab" aria-selected={activeView === "actions"} className={`btn ${activeView === "actions" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveView("actions")}>Opvolgacties; {data.activeItems?.length || 0}</button>
        <button type="button" role="tab" aria-selected={activeView === "drawings"} className={`btn ${activeView === "drawings" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveView("drawings")}>Tekenwerk en markeringen; {activeComponentCount}</button>
      </div>

      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {loading ? <div className="muted">Opvolgingen laden...</div> : null}

      {activeView === "actions" && showCreate ? (
        <form className="card follow-up-create" onSubmit={createAction}>
          <div className="follow-up-create__head"><strong>Nieuwe opvolgactie</strong><button type="button" className="icon-btn" onClick={() => setShowCreate(false)} aria-label="Sluiten">×</button></div>
          <label className="follow-up-field follow-up-field--wide"><span>Titel</span><input className="cf-input" value={draft.title} onChange={(event) => setField("title", event.target.value)} maxLength={300} required /></label>
          <label className="follow-up-field follow-up-field--wide"><span>Omschrijving</span><textarea className="cf-textarea" rows={4} value={draft.description} onChange={(event) => setField("description", event.target.value)} /></label>
          <div className="follow-up-create__grid">
            <label className="follow-up-field"><span>Status</span><select className="cf-input" value={draft.status} onChange={(event) => setField("status", event.target.value)}>{activeStatuses.map((item) => <option key={item.status_code} value={item.status_code}>{item.display_name || statusLabel(item.status_code)}</option>)}</select></label>
            <label className="follow-up-field"><span>Prioriteit</span><select className="cf-input" value={draft.priority} onChange={(event) => setField("priority", event.target.value)}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="follow-up-field"><span>Verantwoordelijkheid</span><select className="cf-input" value={draft.responsibility_type} onChange={(event) => setField("responsibility_type", event.target.value)}>{RESPONSIBILITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="follow-up-field"><span>Deadline</span><DateInput value={draft.due_date} onChange={(value) => setField("due_date", value)} allowEmpty /></label>
            <label className="follow-up-field"><span>Interne gebruiker</span><select className="cf-input" value={draft.assigned_user_object_id} onChange={(event) => setField("assigned_user_object_id", event.target.value)}><option value="">Niet toegewezen</option>{directory.map((item) => <option key={item.user_object_id} value={item.user_object_id}>{item.display_name || item.name || item.email}</option>)}</select></label>
            <label className="follow-up-field"><span>Workflowrol</span><select className="cf-input" value={draft.assigned_role_code} onChange={(event) => setField("assigned_role_code", event.target.value)}><option value="">Niet toegewezen</option>{(catalog.workflow_roles || []).map((item) => <option key={item.role_code} value={item.role_code}>{item.display_name || item.role_code}</option>)}</select></label>
            <label className="follow-up-field follow-up-field--wide"><span>Tags of onderwerp</span><input className="cf-input" value={draft.tags} onChange={(event) => setField("tags", event.target.value)} placeholder="Bijvoorbeeld BMI; storing; norm 4.5" /></label>
            <label className="follow-up-field follow-up-field--wide"><span>Bijlagen</span><select className="cf-input" multiple value={draft.attachment_stored_file_ids} onChange={(event) => setField("attachment_stored_file_ids", Array.from(event.target.selectedOptions).map((option) => option.value))}>{(catalog.attachments || []).map((item) => <option key={item.stored_file_id} value={item.stored_file_id}>{item.title || item.file_name}</option>)}</select><small className="muted">Kies nul of meer bestaande installatiedocumenten; gebruik Ctrl of Cmd voor meerdere keuzes.</small></label>
            {draft.drawing_pin_id ? <div className="ember-alert ember-alert--info follow-up-field--wide">De geselecteerde tekeningpin wordt automatisch gekoppeld.</div> : null}
          </div>
          <div className="follow-up-create__actions"><button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Annuleren</button><button type="submit" className="btn" disabled={saving}>{saving ? "Opslaan..." : "Opvolgactie aanmaken"}</button></div>
        </form>
      ) : null}

      {activeView === "drawings" ? <section className="card follow-up-drawing-board">
        <div className="follow-up-drawing-board__head">
          <div>
            <h3>Tekenwerk en markeringen</h3>
            <p className="ember-page-subtitle">Actieve componentmarkeringen vormen de werkvoorraad voor een volgende tekenrevisie. Open de exacte PDF en werk de pin daarna historisch af zodra de revisie is verwerkt.</p>
          </div>
          <Tag tone={activeComponentCount > 0 ? "warning" : "active"}>{activeComponentCount} component{activeComponentCount === 1 ? "" : "en"} te verwerken</Tag>
        </div>
        <div className="follow-up-pin-filters" aria-label="Markeringen filteren">
          {PIN_FILTERS.map((filter) => (
            <button key={filter.value} type="button" className={pinFilter === filter.value ? "monitor-tag monitor-tag--active monitor-tag--selected" : "monitor-tag monitor-tag--muted"} onClick={() => setPinFilter(filter.value)}>
              {filter.label}
            </button>
          ))}
          <label className={`ember-toggle ${showHistoricalPins ? "is-on" : "is-off"}`}>
            <input type="checkbox" checked={showHistoricalPins} onChange={(event) => setShowHistoricalPins(event.target.checked)} />
            <span className="ember-toggle__track"><span className="ember-toggle__thumb" /></span>
            <span className="ember-toggle__label">Historische markeringen</span>
          </label>
        </div>
        {pinFilter === "COMPONENT_PLACED" ? (
          <div className="follow-up-pin-review" aria-label="Componentmarkeringen nalopen">
            <div>
              <strong>Begeleide tekencontrole</strong>
              <span className="muted">Loop de actieve componenten één voor één langs; open de exacte positie en zet de pin verwerkt nadat de tekening is bijgewerkt.</span>
            </div>
            {reviewPin ? (
              <div className="follow-up-pin-review__controls">
                <button type="button" className="icon-btn" onClick={() => moveReview(-1)} aria-label="Vorige component"><ChevronLeft size={18} /></button>
                <span>{reviewIndex + 1} van {activeComponentPins.length}</span>
                <button type="button" className="icon-btn" onClick={() => moveReview(1)} aria-label="Volgende component"><ChevronRight size={18} /></button>
                <button type="button" className="btn btn-secondary btn-compact" onClick={() => openDrawing(reviewPin, { componentReview: true })}>Toon huidige op tekening</button>
                <button type="button" className="btn btn-compact" disabled={Boolean(pinBusy)} onClick={() => changePinStatus(reviewPin, "HISTORICAL")}><Archive size={15} /> Verwerkt; volgende</button>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary btn-compact" disabled={!activeComponentPins.length} onClick={startComponentReview}>{activeComponentPins.length ? "Start controle" : "Geen actieve componenten"}</button>
            )}
            <button type="button" className="btn btn-danger btn-compact" disabled={readOnly || !activeComponentCount || Boolean(pinBusy)} onClick={historicalizeAllComponents}><Archive size={15} /> Alle componenten verwerkt</button>
          </div>
        ) : null}
        <div className="follow-up-pin-grid">
          {visiblePins.map((pin) => <DrawingPinCard key={pin.drawing_pin_id} pin={pin} readOnly={readOnly} busy={pinBusy === pin.drawing_pin_id} selected={String(pin.drawing_pin_id) === reviewPinId} onOpenDrawing={openDrawing} onStatusChange={changePinStatus} />)}
          {!visiblePins.length ? <div className="muted">Geen markeringen binnen dit filter.</div> : null}
        </div>
      </section> : null}

      {activeView === "actions" && !loading && !(data.activeItems || []).length ? <div className="card follow-up-empty">Er zijn geen actieve opvolgingen voor deze installatie.</div> : null}
      {activeView === "actions" ? <div className="follow-up-grid">{(data.activeItems || []).map((item) => <ActionCard key={item.follow_up_action_id} item={item} busy={rowBusy === item.follow_up_action_id} onStatus={changeStatus} onOpenDrawing={openDrawing} />)}</div> : null}

      {activeView === "actions" ? <section className="follow-up-history">
        <button type="button" className="btn btn-secondary" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory}>
          <History size={16} /> Historie {data.historicalItems?.length || 0} {showHistory ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {showHistory ? <div className="follow-up-grid">{(data.historicalItems || []).map((item) => <ActionCard key={item.follow_up_action_id} item={item} busy={rowBusy === item.follow_up_action_id} onStatus={changeStatus} onOpenDrawing={openDrawing} historical />)}</div> : null}
      </section> : null}
    </div>
  );
}
