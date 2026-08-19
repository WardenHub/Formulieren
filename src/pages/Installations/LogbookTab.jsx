import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  getInstallationLogbook,
  previewInstallationLogbookSync,
  putInstallationLogbook,
  reimportInstallationLogbookDocument,
  synchronizeInstallationLogbook,
  undoInstallationLogbookSync,
} from "../../api/emberApi.js";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { CheckIcon } from "@/components/ui/check";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";
import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";
import { BookTextIcon } from "@/components/ui/book-text";
import { RotateCCWIcon } from "@/components/ui/rotate-ccw";
import { Trash2 } from "lucide-react";

const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function extractDigiLogId(value) {
  const text = String(value || "").trim();
  if (UUID_RE.test(text)) return text.toLowerCase();

  try {
    const url = new URL(text);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const allowedHost = ["digitaallogboek.com", "www.digitaallogboek.com"].includes(url.hostname.toLowerCase());
    if (url.protocol !== "https:" || !allowedHost || pathParts.length !== 2 || pathParts[0].toLowerCase() !== "digilogs") {
      return null;
    }
    return UUID_RE.test(pathParts[1]) ? pathParts[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function logbookReference(logbook) {
  if (logbook?.digilog_url) return logbook.digilog_url;
  return logbook?.digilog_id ? `https://www.digitaallogboek.com/digilogs/${logbook.digilog_id}` : "";
}

function formatDateTime(value) {
  if (!value) return "Nog niet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Onbekend";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function relativeTime(value) {
  if (!value) return "Nog niet gesynchroniseerd";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(seconds)) return "Onbekend";
  const formatter = new Intl.RelativeTimeFormat("nl", { numeric: "auto" });
  const ranges = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [size, unit] of ranges) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, "second");
}

function statusLabel(value) {
  return ({ COMPLETED: "Voltooid", PARTIAL: "Deels voltooid", FAILED: "Mislukt", RUNNING: "Bezig" })[value] || value || "Onbekend";
}

function SyncProgress({ label }) {
  return (
    <div className="logbook-sync-progress" role="status" aria-live="polite">
      <LoaderPinwheelIcon size={22} active aria-label="synchronisatie bezig" />
      <div className="logbook-sync-progress__content">
        <strong>{label}</strong>
        <div className="installations-startup-card__progress" aria-hidden="true">
          <span className="logbook-sync-progress__bar" />
        </div>
      </div>
    </div>
  );
}

function ChangeLogbookModal({ currentUrl, nextUrl, busy, onCancel, onConfirm }) {
  if (!nextUrl) return null;
  return (
    <div className="doc-bulk-modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="card doc-bulk-modal logbook-change-modal" onClick={(event) => event.stopPropagation()}>
        <div className="doc-bulk-modal__head">
          <div>
            <div className="doc-bulk-modal__title">Logboekkoppeling wijzigen?</div>
            <div className="muted doc-bulk-modal__subtitle">
              Eerder geïmporteerde documenten en synchronisatiehistorie blijven in Ember bewaard.
              Er worden geen bestanden automatisch verwijderd.
            </div>
          </div>
        </div>
        <div className="logbook-change-comparison">
          <div><span className="label">Huidige koppeling</span><span>{currentUrl}</span></div>
          <div><span className="label">Nieuwe koppeling</span><span>{nextUrl}</span></div>
        </div>
        <div className="doc-bulk-modal__foot">
          <div className="muted doc-text-sm">Nieuwe synchronisaties gebruiken alleen het nieuwe online logboek.</div>
          <div className="doc-inline-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Annuleren</button>
            <button type="button" className="btn" onClick={onConfirm} disabled={busy}>
              {busy ? "Koppeling controleren..." : "Koppeling wijzigen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UndoSyncModal({ target, busy, onCancel, onConfirm }) {
  if (!target) return null;
  const document = target.document || null;
  const count = Number(target.count || 0);
  const title = document ? "Import van dit bestand ongedaan maken?" : "Synchronisatie ongedaan maken?";
  const subject = document
    ? (document.file_name || document.title || "Dit bestand")
    : `${count} geïmporteerde ${count === 1 ? "bestand" : "bestanden"}`;

  return (
    <div className="doc-bulk-modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="card doc-bulk-modal logbook-undo-modal" onClick={(event) => event.stopPropagation()}>
        <div className="doc-bulk-modal__head">
          <div>
            <div className="doc-bulk-modal__title">{title}</div>
            <div className="muted doc-bulk-modal__subtitle">
              {subject} wordt uit Ember verwijderd. Het online logboek blijft ongewijzigd en de actie blijft zichtbaar in de synchronisatiehistorie.
            </div>
          </div>
        </div>
        <div className="ember-alert ember-alert--warning">
          Na het verwijderen kun je ieder bestand afzonderlijk opnieuw synchroniseren.
        </div>
        <div className="doc-bulk-modal__foot">
          <div className="muted doc-text-sm">Gekoppelde vervangingen of bijlagen worden nooit stilzwijgend verwijderd.</div>
          <div className="doc-inline-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Annuleren</button>
            <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
              <Trash2 size={16} />
              {busy ? "Verwijderen..." : "Verwijderen uit Ember"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncModal({ preview, documentTypes, busy, progressLabel, onChange, onClose, onConfirm }) {
  if (!preview) return null;
  const items = preview.pending_documents || [];
  const decisions = preview.decisions || {};
  const canConfirm = items.every((item) => {
    const decision = decisions[item.remote_document_id] || {};
    return !decision.selected || Boolean(decision.document_type_key);
  });

  return (
    <div className="doc-bulk-modal-backdrop" onClick={onClose}>
      <div className="card doc-bulk-modal logbook-sync-modal" onClick={(event) => event.stopPropagation()}>
        <div className="doc-bulk-modal__head">
          <div>
            <div className="doc-bulk-modal__title">Documenten uit Digitaal Logboek</div>
            <div className="muted doc-bulk-modal__subtitle">
              Alleen nieuwe of gewijzigde bestanden staan hieronder. Kies wat Ember moet downloaden.
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Sluiten</button>
        </div>

        <div className="doc-bulk-list">
          {items.length === 0 ? (
            <div className="muted doc-empty-box">Er zijn geen nieuwe of gewijzigde documenten.</div>
          ) : items.map((item) => {
            const decision = decisions[item.remote_document_id] || {};
            return (
              <div className="doc-bulk-item" key={item.remote_document_id}>
                <div className="logbook-document-choice">
                  <label className="logbook-document-choice__check">
                    <input
                      type="checkbox"
                      checked={Boolean(decision.selected)}
                      disabled={busy}
                      onChange={(event) => onChange(item.remote_document_id, { selected: event.target.checked })}
                    />
                    <span>
                      <strong>{item.remote_name}</strong>
                      <span className="muted logbook-document-choice__meta">
                        {[item.remote_type_title, item.remote_folder_name, formatDateTime(item.remote_time_last_modified)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </label>
                  <select
                    className="input"
                    value={decision.document_type_key || ""}
                    disabled={!decision.selected || busy}
                    onChange={(event) => onChange(item.remote_document_id, { document_type_key: event.target.value })}
                  >
                    <option value="">Kies Ember-documenttype</option>
                    {documentTypes.map((type) => (
                      <option key={type.document_type_key} value={type.document_type_key}>
                        {type.document_type_name || type.naam}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="doc-bulk-modal__foot">
          <div className="muted doc-text-sm">Niet gekozen bestanden worden voor deze versie overgeslagen.</div>
          <div className="doc-inline-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuleren</button>
            <button type="button" className="btn" onClick={onConfirm} disabled={!canConfirm || busy}>
              {busy ? "Synchroniseren..." : "Synchronisatie bevestigen"}
            </button>
          </div>
        </div>
        {busy && progressLabel ? <SyncProgress label={progressLabel} /> : null}
      </div>
    </div>
  );
}

export default function LogbookTab({
  code,
  catalog,
  isAdmin = false,
  readOnly = false,
  onDocumentsChanged,
  onOpenDocument,
}) {
  const [data, setData] = useState({ logbook: null, history: [] });
  const [digiLogReference, setDigiLogReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [editingLink, setEditingLink] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingLinkChange, setPendingLinkChange] = useState("");
  const [syncBusyLabel, setSyncBusyLabel] = useState("");
  const [linkJustSaved, setLinkJustSaved] = useState(false);
  const [openHistory, setOpenHistory] = useState({});
  const [undoTarget, setUndoTarget] = useState(null);
  const [notice, setNotice] = useState("");
  const helpIconRef = useRef(null);
  const helpWrapRef = useRef(null);
  const linkSavedTimerRef = useRef(null);
  const openLogbookIconRef = useRef(null);
  const syncIconRef = useRef(null);
  const reimportIconRefs = useRef({});

  const documentTypes = useMemo(() => (catalog?.documentTypes || [])
    .filter((type) => type.is_active !== false && !type.is_attachment_only), [catalog]);
  const recognizedDigiLogId = useMemo(() => extractDigiLogId(digiLogReference), [digiLogReference]);
  const hasSuccessfulSync = useMemo(() => (data.history || []).some((row) => (
    ["COMPLETED", "PARTIAL"].includes(String(row.status || "").toUpperCase()) && Boolean(row.completed_at)
  )), [data.history]);

  async function reload() {
    const next = await getInstallationLogbook(code);
    setData(next || { logbook: null, history: [] });
    setDigiLogReference(logbookReference(next?.logbook));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    getInstallationLogbook(code)
      .then((next) => {
        if (!active) return;
        setData(next || { logbook: null, history: [] });
        setDigiLogReference(logbookReference(next?.logbook));
      })
      .catch((err) => active && setError(err?.message || "Logboek kon niet worden geladen."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [code]);

  useEffect(() => {
    if (!helpOpen) return undefined;

    function onMouseDown(event) {
      if (helpWrapRef.current && !helpWrapRef.current.contains(event.target)) setHelpOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setHelpOpen(false);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [helpOpen]);

  useEffect(() => () => {
    if (linkSavedTimerRef.current) window.clearTimeout(linkSavedTimerRef.current);
  }, []);

  async function saveLink(reference = digiLogReference) {
    setBusy(true); setError("");
    try {
      await putInstallationLogbook(code, reference);
      await reload();
      setEditingLink(false);
      setPendingLinkChange("");
      setLinkJustSaved(true);
      if (linkSavedTimerRef.current) window.clearTimeout(linkSavedTimerRef.current);
      linkSavedTimerRef.current = window.setTimeout(() => setLinkJustSaved(false), 900);
      return true;
    } catch (err) {
      const message = String(err?.message || "");
      if (message.includes("digilog reference invalid")) {
        setError("Plak een geldige Digitaal Logboek-link of een geldig logboek-ID.");
      } else if (message.includes("digitaal logboek configuration missing")) {
        setError("De lokale Digitaal Logboek-koppeling is nog niet geladen. Herstart de lokale API en probeer opnieuw.");
      } else if (message.includes("digitaal logboek authentication failed")) {
        setError("Aanmelden bij Digitaal Logboek is mislukt. Controleer de backendconfiguratie.");
      } else {
        setError(message || "Koppeling kon niet worden opgeslagen.");
      }
      return false;
    } finally { setBusy(false); }
  }

  function changeReference(value) {
    setDigiLogReference(value);
    const nextId = extractDigiLogId(value);
    const currentId = String(data.logbook?.digilog_id || "").toLowerCase();
    if (editingLink && nextId && currentId && nextId !== currentId) setPendingLinkChange(value.trim());
  }

  function cancelLinkChange() {
    setPendingLinkChange("");
    setEditingLink(false);
    setDigiLogReference(logbookReference(data.logbook));
  }

  async function openSync() {
    setBusy(true); setSyncBusyLabel("Documenten in Digitaal Logboek controleren..."); setError(""); setNotice("");
    try {
      const result = await previewInstallationLogbookSync(code);
      const decisions = {};
      for (const item of result?.pending_documents || []) {
        const suggested = /programma van eisen/i.test(item.remote_type_title || item.remote_name || "")
          && documentTypes.some((type) => type.document_type_key === "pve") ? "pve" : "";
        decisions[item.remote_document_id] = { selected: false, document_type_key: suggested };
      }
      setPreview({ ...result, decisions });
    } catch (err) {
      setError(err?.message || "Documenten konden niet worden opgehaald.");
    } finally { setBusy(false); setSyncBusyLabel(""); }
  }

  function updateDecision(id, patch) {
    setPreview((current) => ({
      ...current,
      decisions: { ...current.decisions, [id]: { ...current.decisions[id], ...patch } },
    }));
  }

  async function confirmSync() {
    setBusy(true); setSyncBusyLabel("Geselecteerde documenten importeren..."); setError(""); setNotice("");
    try {
      const decisions = (preview?.pending_documents || []).map((item) => {
        const choice = preview.decisions[item.remote_document_id] || {};
        return {
          remote_document_id: item.remote_document_id,
          remote_time_last_modified: item.remote_time_last_modified,
          action: choice.selected ? "IMPORT" : "SKIP",
          document_type_key: choice.selected ? choice.document_type_key : null,
        };
      });
      const result = await synchronizeInstallationLogbook(code, decisions);
      setPreview(null);
      await Promise.all([reload(), onDocumentsChanged?.()]);
      if (result?.failed_count) setError(`${result.failed_count} document(en) konden niet worden verwerkt.`);
    } catch (err) {
      setError(err?.message || "Synchronisatie is mislukt.");
    } finally { setBusy(false); setSyncBusyLabel(""); }
  }

  function toggleHistory(syncId) {
    setOpenHistory((current) => ({ ...current, [syncId]: !current[syncId] }));
  }

  async function confirmUndo() {
    if (!undoTarget) return;
    const syncId = String(undoTarget.sync.installation_logbook_sync_id || "");
    const documentIds = undoTarget.document?.document_id ? [undoTarget.document.document_id] : [];
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await undoInstallationLogbookSync(code, syncId, documentIds);
      setUndoTarget(null);
      await Promise.all([reload(), onDocumentsChanged?.()]);
      if (result?.failed_count) {
        setError(`${result.failed_count} bestand(en) konden niet uit Ember worden verwijderd.`);
      } else {
        setNotice(`${result?.removed_count || 0} bestand(en) uit Ember verwijderd. Het online logboek is niet gewijzigd.`);
      }
    } catch (err) {
      const message = String(err?.message || "");
      if (message.includes("active related documents")) {
        setError("Dit bestand heeft nog actieve vervangingen of bijlagen. Verwijder of archiveer die eerst via Documenten.");
      } else {
        setError(message || "De synchronisatie kon niet ongedaan worden gemaakt.");
      }
    } finally { setBusy(false); }
  }

  async function reimportDocument(document) {
    if (!document?.document_id) return;
    setBusy(true); setSyncBusyLabel("Bestand opnieuw synchroniseren..."); setError(""); setNotice("");
    try {
      await reimportInstallationLogbookDocument(code, document.document_id);
      await Promise.all([reload(), onDocumentsChanged?.()]);
      setNotice(`${document.file_name || document.title || "Het bestand"} is opnieuw uit het online logboek geïmporteerd.`);
    } catch (err) {
      setError(err?.message || "Het bestand kon niet opnieuw worden gesynchroniseerd.");
    } finally { setBusy(false); setSyncBusyLabel(""); }
  }

  if (loading) return <div className="muted">Logboek laden...</div>;
  const logbook = data.logbook;

  return (
    <div className="logbook-tab">
      <div className="logbook-heading-row">
        <h2>Logboek</h2>
        <div ref={helpWrapRef} className="logbook-help-wrap">
          <button
            type="button"
            className="icon-btn"
            title="info"
            aria-expanded={helpOpen}
            aria-controls="logbook-help-panel"
            onClick={() => setHelpOpen((value) => !value)}
            onMouseEnter={() => helpIconRef.current?.startAnimation?.()}
            onMouseLeave={() => helpIconRef.current?.stopAnimation?.()}
          >
            <CircleHelpIcon ref={helpIconRef} size={18} className="nav-anim-icon" />
          </button>
          {helpOpen ? (
            <div id="logbook-help-panel" className="panel logbook-help-panel" role="dialog" aria-label="info logboek">
              <div className="muted logbook-help-text">
                Via dit tabblad koppel je Ember aan een online logboek. Op dit moment ondersteunen we alleen Beveiligingslogboek.nl.
                Zodra andere externe platformen beschikbaar zijn, voegen we die toe. Mis je een platform? Tip ons via de feedbackknop.
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {notice ? <div className="ember-alert ember-alert--success">{notice}</div> : null}
      <div className={`card logbook-summary-card${hasSuccessfulSync ? " logbook-summary-card--synced" : ""}`}>
        <div className="logbook-summary-card__main">
          <div className="admin-field logbook-link-field">
            <span>Link naar Digitaal Logboek</span>
            {logbook && !editingLink ? (
              <button
                type="button"
                className={`logbook-linked-field${linkJustSaved ? " logbook-linked-field--confirmed" : ""}`}
                onClick={() => {
                  if (!isAdmin || readOnly || busy) return;
                  setDigiLogReference(logbookReference(logbook));
                  setEditingLink(true);
                }}
                disabled={!isAdmin || readOnly || busy}
                title={isAdmin && !readOnly ? "Klik om de koppeling te wijzigen" : undefined}
              >
                <span className="logbook-linked-field__check"><CheckIcon size={18} /></span>
                <span className="logbook-linked-field__content">
                  <strong>{logbook.digilog_title || "Online logboek gekoppeld"}</strong>
                  <span>{logbook.digilog_url}</span>
                </span>
                {isAdmin && !readOnly ? <span className="muted logbook-linked-field__hint">Klik om te wijzigen</span> : null}
              </button>
            ) : (
              <>
                <div className="logbook-link-control-row">
                  <input
                    id="installation-digilog-reference"
                    className="input"
                    value={digiLogReference}
                    readOnly={!isAdmin || readOnly}
                    autoFocus={editingLink}
                    placeholder="https://www.digitaallogboek.com/digilogs/..."
                    onChange={(event) => changeReference(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && logbook) cancelLinkChange();
                    }}
                  />
                  {isAdmin && !logbook ? (
                    <button
                      type="button"
                      className={`btn logbook-link-action${recognizedDigiLogId ? " logbook-link-action--ready" : ""}`}
                      onClick={() => saveLink()}
                      disabled={busy || readOnly || !recognizedDigiLogId}
                    >
                      Logboek koppelen
                    </button>
                  ) : null}
                </div>
                {isAdmin ? (
                  <span className="muted logbook-link-help">
                    {editingLink
                      ? "Plak een andere geldige link; Ember vraagt daarna om bevestiging. Druk Escape om te annuleren."
                      : recognizedDigiLogId
                        ? "Logboek herkend; de koppeling kan worden opgeslagen."
                        : "Plak de volledige link uit de adresbalk. Een los logboek-ID werkt ook."}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <div className="logbook-last-sync">
            <span className="label">Laatste synchronisatie</span>
            <strong>{relativeTime(logbook?.last_checked_at)}</strong>
          </div>
        </div>
        <div className="doc-inline-actions logbook-summary-actions">
          {logbook?.digilog_url && !editingLink ? (
            <a
              className="btn btn-secondary"
              href={logbook.digilog_url}
              target="_blank"
              rel="noreferrer"
              onMouseEnter={() => openLogbookIconRef.current?.startAnimation?.()}
              onMouseLeave={() => openLogbookIconRef.current?.stopAnimation?.()}
            >
              <BookTextIcon ref={openLogbookIconRef} size={16} />
              Open Digitaal Logboek
            </a>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={openSync}
            disabled={busy || readOnly || !logbook}
            onMouseEnter={() => syncIconRef.current?.startAnimation?.()}
            onMouseLeave={() => syncIconRef.current?.stopAnimation?.()}
          >
            <RefreshCWIcon ref={syncIconRef} size={16} />
            {busy ? "Bezig..." : "Documenten synchroniseren"}
          </button>
        </div>
      </div>

      {syncBusyLabel && !preview ? <SyncProgress label={syncBusyLabel} /> : null}

      <div className="admin-table-wrap logbook-history">
        <table className="admin-table">
          <thead><tr><th>Datum</th><th>Status</th><th>Gevonden</th><th>Geïmporteerd</th><th>Overgeslagen</th><th>Mislukt</th></tr></thead>
          <tbody>
            {(data.history || []).length === 0 ? (
              <tr><td colSpan="6" className="muted">Nog geen synchronisaties.</td></tr>
            ) : data.history.map((row) => {
              const syncId = String(row.installation_logbook_sync_id);
              const importedDocuments = row.imported_documents || [];
              const canExpand = importedDocuments.length > 0;
              const isOpen = Boolean(openHistory[syncId]);
              const removableDocuments = importedDocuments.filter((document) => (
                document.installation_logbook_sync_document_id && document.is_active && !document.undone_at
              ));
              return (
                <Fragment key={syncId}>
                  <tr
                    className={canExpand ? "logbook-history-row logbook-history-row--expandable" : "logbook-history-row"}
                    tabIndex={canExpand ? 0 : undefined}
                    aria-expanded={canExpand ? isOpen : undefined}
                    onClick={() => canExpand && toggleHistory(syncId)}
                    onKeyDown={(event) => {
                      if (!canExpand || !["Enter", " "].includes(event.key)) return;
                      event.preventDefault();
                      toggleHistory(syncId);
                    }}
                  >
                    <td>
                      <span className="logbook-history-toggle">
                        {canExpand ? (isOpen ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />) : null}
                        {formatDateTime(row.completed_at || row.started_at)}
                      </span>
                    </td>
                    <td>{statusLabel(row.status)}</td>
                    <td>{row.remote_document_count}</td>
                    <td>{row.imported_document_count}</td>
                    <td>{row.skipped_document_count}</td>
                    <td>{row.failed_document_count}</td>
                  </tr>
                  {isOpen ? (
                    <tr className="logbook-history-detail-row">
                      <td colSpan="6">
                        <div className="logbook-history-documents">
                          {importedDocuments.map((document) => {
                            const canOpen = Boolean(document.is_active && document.has_file && onOpenDocument);
                            const canReimport = Boolean(
                              document.installation_logbook_sync_document_id && document.undone_at && !document.is_active
                            );
                            const status = document.undone_at
                              ? (document.is_active ? "Later opnieuw gesynchroniseerd" : "Verwijderd uit Ember")
                              : (document.is_active ? "Geïmporteerd" : "Niet beschikbaar");
                            return (
                              <div
                                key={document.installation_logbook_sync_document_id || `${syncId}-${document.document_id}`}
                                className="logbook-history-document"
                              >
                                <button
                                  type="button"
                                  className="logbook-history-document__open"
                                  disabled={!canOpen}
                                  title={canOpen ? "Open dit bestand bij Documenten" : undefined}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (canOpen) onOpenDocument(document);
                                  }}
                                >
                                  <strong>{document.file_name || document.remote_name || document.title || "Document"}</strong>
                                  <span className="muted">{document.document_type_name || document.document_type_key || "Document"}</span>
                                </button>
                                <div className="logbook-history-document__actions">
                                  <span className={`ember-label ${document.is_active && !document.undone_at ? "ember-label--success" : "ember-label--muted"}`}>
                                    {status}
                                  </span>
                                  {!readOnly && document.installation_logbook_sync_document_id && document.is_active && !document.undone_at ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      disabled={busy}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setUndoTarget({ sync: row, document, count: 1 });
                                      }}
                                    >
                                      <Trash2 size={14} /> Verwijderen
                                    </button>
                                  ) : null}
                                  {!readOnly && canReimport ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      disabled={busy}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void reimportDocument(document);
                                      }}
                                      onMouseEnter={() => reimportIconRefs.current[document.document_id]?.startAnimation?.()}
                                      onMouseLeave={() => reimportIconRefs.current[document.document_id]?.stopAnimation?.()}
                                    >
                                      <RotateCCWIcon
                                        ref={(node) => { reimportIconRefs.current[document.document_id] = node; }}
                                        size={14}
                                      />
                                      Opnieuw synchroniseren
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          {!readOnly && removableDocuments.length > 0 ? (
                            <div className="logbook-history-documents__footer">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setUndoTarget({ sync: row, document: null, count: removableDocuments.length });
                                }}
                              >
                                <Trash2 size={14} /> Synchronisatie ongedaan maken
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <SyncModal
        preview={preview}
        documentTypes={documentTypes}
        busy={busy}
        progressLabel={syncBusyLabel}
        onChange={updateDecision}
        onClose={() => !busy && setPreview(null)}
        onConfirm={confirmSync}
      />
      <ChangeLogbookModal
        currentUrl={logbookReference(logbook)}
        nextUrl={pendingLinkChange}
        busy={busy}
        onCancel={cancelLinkChange}
        onConfirm={() => saveLink(pendingLinkChange)}
      />
      <UndoSyncModal
        target={undoTarget}
        busy={busy}
        onCancel={() => !busy && setUndoTarget(null)}
        onConfirm={confirmUndo}
      />
    </div>
  );
}
