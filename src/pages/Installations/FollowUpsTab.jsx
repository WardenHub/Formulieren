import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronUp, History, Plus, RotateCcw } from "lucide-react";
import {
  createInstallationFollowUp,
  getInstallationFollowUpCatalog,
  getInstallationWorkflowItems,
  getUserDirectory,
  updateInstallationFollowUpStatus,
} from "../../api/emberApi.js";
import DateInput from "../../components/DateInput.jsx";
import { formatDateTime, getCardToneClass, getStatusTone, getToneClass, statusLabel } from "../Monitor/formsMonitorShared.jsx";

const PRIORITIES = [
  { value: "LOW", label: "Laag" },
  { value: "NORMAL", label: "Normaal" },
  { value: "HIGH", label: "Hoog" },
  { value: "CRITICAL", label: "Kritiek" },
];

const RESPONSIBILITIES = [
  { value: "WARDENBURG", label: "Wardenburg / Hefas" },
  { value: "CUSTOMER", label: "Klant" },
  { value: "THIRD_PARTY", label: "Derde partij" },
  { value: "UNSPECIFIED", label: "Nog te bepalen" },
];

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

function ActionCard({ code, item, busy, onStatus, historical = false }) {
  const [eventsOpen, setEventsOpen] = useState(false);
  const pins = item.drawing_pins || [];
  const attachments = item.attachments || [];
  const categoryTags = String(item.category || "").split(/[,;|]/).map((value) => value.trim()).filter(Boolean).slice(0, 3);
  return (
    <article className={`${getCardToneClass(item.status)} follow-up-card`}>
      <div className="follow-up-card__head">
        <div>
          <div className="follow-up-card__title">{item.workflow_title || "Opvolgactie"}</div>
          {item.workflow_description ? <div className="follow-up-card__description">{item.workflow_description}</div> : null}
        </div>
        <span className={getToneClass(getStatusTone(item.status))}>{statusLabel(item.status)}</span>
      </div>

      <div className="follow-up-tags" aria-label="Kenmerken van opvolgactie">
        <Tag tone="active" title="Bron van deze opvolgactie">Bron; {item.source_type === "MANUAL" ? "Handmatig" : item.form_title || item.source_type}</Tag>
        <Tag title="Verantwoordelijke partij">Verantwoordelijkheid; {RESPONSIBILITIES.find((entry) => entry.value === item.responsibility_type)?.label || item.responsibility_type}</Tag>
        <Tag tone={item.priority === "CRITICAL" || item.priority === "HIGH" ? "warning" : "muted"}>Prioriteit; {PRIORITIES.find((entry) => entry.value === item.priority)?.label || item.priority}</Tag>
        {item.assigned_to ? <Tag>Toegewezen; {item.assigned_to}</Tag> : null}
        {item.form_instance_id ? <Tag tone="active">Formulier; {item.form_title}</Tag> : null}
        {pins.length ? <Tag tone="active">Tekening; {pins.length} pin{pins.length === 1 ? "" : "nen"}</Tag> : null}
        {categoryTags.map((tag) => <Tag key={tag}>Onderwerp; {tag}</Tag>)}
      </div>

      <div className="follow-up-card__meta">
        <span>{item.due_date ? `Deadline; ${String(item.due_date).slice(0, 10)}` : "Geen deadline"}</span>
        <span>{attachments.length} bijlage{attachments.length === 1 ? "" : "n"}</span>
        <span>Laatst gewijzigd; {formatDateTime(item.updated_at || item.created_at)}</span>
      </div>

      {pins.length ? <div className="follow-up-card__links">{pins.map((pin) => (
        <Link key={pin.drawing_pin_id} className="btn btn-secondary btn-compact" to={`/installaties/${encodeURIComponent(code)}?tab=drawings&drawing=${encodeURIComponent(pin.installation_document_id)}&page=${encodeURIComponent(pin.page_number)}&pin=${encodeURIComponent(pin.drawing_pin_id)}`}>
          Toon op tekening; {pin.pin_label || `pagina ${pin.page_number}`}
        </Link>
      ))}</div> : null}

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

export default function FollowUpsTab({ code, readOnly = false, initialDrawingPinId = "", onCountChange }) {
  const [data, setData] = useState({ activeItems: [], historicalItems: [], counts: {} });
  const [catalog, setCatalog] = useState({ statuses: [], workflow_roles: [], attachments: [] });
  const [directory, setDirectory] = useState([]);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT, drawing_pin_id: initialDrawingPinId || "" });
  const [showCreate, setShowCreate] = useState(Boolean(initialDrawingPinId));
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [items, nextCatalog, userDirectory] = await Promise.all([
      getInstallationWorkflowItems(code),
      getInstallationFollowUpCatalog(code),
      getUserDirectory().catch(() => ({ items: [] })),
    ]);
    setData(items || { activeItems: [], historicalItems: [], counts: {} });
    setCatalog(nextCatalog || { statuses: [], workflow_roles: [], attachments: [] });
    setDirectory(userDirectory?.items || userDirectory?.users || []);
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
  }, [initialDrawingPinId]);

  const activeStatuses = useMemo(() => (catalog.statuses || []).filter((item) => !item.is_terminal), [catalog.statuses]);

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
        <button type="button" className="btn" disabled={readOnly} onClick={() => setShowCreate((value) => !value)}>
          <Plus size={17} /> Nieuwe opvolgactie
        </button>
      </div>

      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {loading ? <div className="muted">Opvolgingen laden...</div> : null}

      {showCreate ? (
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

      {!loading && !(data.activeItems || []).length ? <div className="card follow-up-empty">Er zijn geen actieve opvolgingen voor deze installatie.</div> : null}
      <div className="follow-up-grid">{(data.activeItems || []).map((item) => <ActionCard key={item.follow_up_action_id} code={code} item={item} busy={rowBusy === item.follow_up_action_id} onStatus={changeStatus} />)}</div>

      <section className="follow-up-history">
        <button type="button" className="btn btn-secondary" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory}>
          <History size={16} /> Historie {data.historicalItems?.length || 0} {showHistory ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {showHistory ? <div className="follow-up-grid">{(data.historicalItems || []).map((item) => <ActionCard key={item.follow_up_action_id} code={code} item={item} busy={rowBusy === item.follow_up_action_id} onStatus={changeStatus} historical />)}</div> : null}
      </section>
    </div>
  );
}
