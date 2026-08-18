import { useEffect, useMemo, useState } from "react";
import {
  getInstallationLogbook,
  previewInstallationLogbookSync,
  putInstallationLogbook,
  synchronizeInstallationLogbook,
} from "../../api/emberApi.js";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";

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

function SyncModal({ preview, documentTypes, busy, onChange, onClose, onConfirm }) {
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
      </div>
    </div>
  );
}

export default function LogbookTab({ code, catalog, isAdmin = false, readOnly = false }) {
  const [data, setData] = useState({ logbook: null, history: [] });
  const [digiLogId, setDigiLogId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [editingLink, setEditingLink] = useState(false);

  const documentTypes = useMemo(() => (catalog?.documentTypes || [])
    .filter((type) => type.is_active !== false && !type.is_attachment_only), [catalog]);

  async function reload() {
    const next = await getInstallationLogbook(code);
    setData(next || { logbook: null, history: [] });
    setDigiLogId(next?.logbook?.digilog_id || "");
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    getInstallationLogbook(code)
      .then((next) => {
        if (!active) return;
        setData(next || { logbook: null, history: [] });
        setDigiLogId(next?.logbook?.digilog_id || "");
      })
      .catch((err) => active && setError(err?.message || "Logboek kon niet worden geladen."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [code]);

  async function saveLink() {
    setBusy(true); setError("");
    try {
      await putInstallationLogbook(code, digiLogId);
      await reload();
      setEditingLink(false);
    } catch (err) {
      setError(err?.message || "Koppeling kon niet worden opgeslagen.");
    } finally { setBusy(false); }
  }

  async function openSync() {
    setBusy(true); setError("");
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
    } finally { setBusy(false); }
  }

  function updateDecision(id, patch) {
    setPreview((current) => ({
      ...current,
      decisions: { ...current.decisions, [id]: { ...current.decisions[id], ...patch } },
    }));
  }

  async function confirmSync() {
    setBusy(true); setError("");
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
      await reload();
      if (result?.failed_count) setError(`${result.failed_count} document(en) konden niet worden verwerkt.`);
    } catch (err) {
      setError(err?.message || "Synchronisatie is mislukt.");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="muted">Logboek laden...</div>;
  const logbook = data.logbook;

  return (
    <div className="logbook-tab">
      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      <div className="card logbook-summary-card">
        <div className="logbook-summary-card__main">
          <label className="admin-field logbook-id-field">
            <span>Digitaal Logboek-ID</span>
            <input
              className="input"
              value={digiLogId}
              readOnly={!isAdmin || (Boolean(logbook) && !editingLink) || readOnly}
              placeholder="00000000-0000-0000-0000-000000000000"
              onChange={(event) => setDigiLogId(event.target.value)}
            />
          </label>
          <div className="logbook-last-sync">
            <span className="label">Laatste synchronisatie</span>
            <strong>{relativeTime(logbook?.last_checked_at)}</strong>
          </div>
        </div>
        <div className="doc-inline-actions">
          {isAdmin && (!logbook || editingLink) ? (
            <button type="button" className="btn" onClick={saveLink} disabled={busy || readOnly || !digiLogId.trim()}>
              {logbook ? "Wijziging opslaan" : "Logboek koppelen"}
            </button>
          ) : null}
          {isAdmin && logbook && !editingLink ? (
            <button type="button" className="btn btn-secondary" onClick={() => setEditingLink(true)} disabled={busy || readOnly}>
              Koppeling wijzigen
            </button>
          ) : null}
          {editingLink ? (
            <button type="button" className="btn btn-secondary" onClick={() => { setEditingLink(false); setDigiLogId(logbook?.digilog_id || ""); }} disabled={busy}>
              Annuleren
            </button>
          ) : null}
          <button type="button" className="btn" onClick={openSync} disabled={busy || readOnly || !logbook}>
            <RefreshCWIcon size={16} />
            {busy ? "Bezig..." : "Documenten synchroniseren"}
          </button>
        </div>
      </div>

      <div className="admin-table-wrap logbook-history">
        <table className="admin-table">
          <thead><tr><th>Datum</th><th>Status</th><th>Gevonden</th><th>Geïmporteerd</th><th>Overgeslagen</th><th>Mislukt</th></tr></thead>
          <tbody>
            {(data.history || []).length === 0 ? (
              <tr><td colSpan="6" className="muted">Nog geen synchronisaties.</td></tr>
            ) : data.history.map((row) => (
              <tr key={row.installation_logbook_sync_id}>
                <td>{formatDateTime(row.completed_at || row.started_at)}</td>
                <td>{statusLabel(row.status)}</td>
                <td>{row.remote_document_count}</td>
                <td>{row.imported_document_count}</td>
                <td>{row.skipped_document_count}</td>
                <td>{row.failed_document_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SyncModal
        preview={preview}
        documentTypes={documentTypes}
        busy={busy}
        onChange={updateDecision}
        onClose={() => !busy && setPreview(null)}
        onConfirm={confirmSync}
      />
    </div>
  );
}
