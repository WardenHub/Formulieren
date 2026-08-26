import { useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Clock3, FileCheck2, History, Plus, Send, ShieldAlert } from "lucide-react";

import {
  createInstallationCertificate,
  getInstallationCertification,
  putInstallationCertificationRequirement,
  recordInstallationCertificateSend,
  updateInstallationCertificate,
} from "@/api/emberApi.js";

const SCOPE_LABELS = {
  BMI: "BMI",
  OAI_A: "OAI type A",
  OAI_B: "OAI type B",
  OAI_PZI: "OAI met PZI",
};

const STATUS_LABELS = {
  REQUIRED: "Verplicht",
  NOT_REQUIRED: "Niet verplicht",
  UNKNOWN: "Nog te bepalen",
  VALID: "Geldig",
  EXPIRING: "Verloopt binnenkort",
  EXPIRED: "Verlopen",
  MISSING: "Ontbreekt",
  REVOKED: "Ingetrokken",
  HISTORICAL: "Historisch",
  VERIFIED: "Gecontroleerd",
  UNVERIFIED: "Niet gecontroleerd",
  REJECTED: "Afgekeurd",
};

function toneForStatus(status) {
  if (["VALID", "NOT_REQUIRED", "VERIFIED"].includes(status)) return "success";
  if (["EXPIRING", "UNKNOWN", "UNVERIFIED"].includes(status)) return "warning";
  if (["EXPIRED", "MISSING", "REVOKED", "REJECTED"].includes(status)) return "danger";
  return "muted";
}

function formatDate(value) {
  if (!value) return "Niet vastgelegd";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(date);
}

function toDateInput(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function emptyRequirement(scope) {
  return {
    scope,
    requirement_status: "UNKNOWN",
    reason: "",
    effective_from: "",
    first_inspection_due_date: "",
    review_due_date: "",
    row_version: null,
  };
}

function emptyCertificate() {
  return {
    certificate_type: "MAINTENANCE",
    certificate_number: "",
    description: "",
    issue_date: "",
    inspection_date: "",
    valid_until: "",
    issuer_name: "",
    inspection_body: "",
    record_status: "CURRENT",
    verification_status: "VERIFIED",
    supersedes_certificate_id: "",
    installation_document_id: "",
    scopes: ["BMI"],
    change_reason: "",
  };
}

function RequirementCard({ item, summary, readOnly, busy, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...emptyRequirement(item.scope), ...item }));
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setDraft({ ...emptyRequirement(item.scope), ...item });
  }, [item]);

  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <article className="card certification-requirement-card">
      <div className="certification-card-heading">
        <div>
          <div className="certification-card-title">{SCOPE_LABELS[item.scope] || item.scope}</div>
          <div className="muted">Handmatig vastgesteld; niet afgeleid uit Atrium-contracten.</div>
        </div>
        <span className={`ember-label ember-label--${toneForStatus(summary?.certificate_status)}`}>
          {STATUS_LABELS[summary?.certificate_status] || summary?.certificate_status || "Onbekend"}
        </span>
      </div>

      <div className="certification-form-grid">
        <label>
          <span>Certificeringsplicht</span>
          <select
            value={draft.requirement_status}
            disabled={readOnly || busy}
            onChange={(event) => change("requirement_status", event.target.value)}
          >
            <option value="UNKNOWN">Nog te bepalen</option>
            <option value="REQUIRED">Verplicht</option>
            <option value="NOT_REQUIRED">Niet verplicht</option>
          </select>
        </label>
        <label>
          <span>Geldig vanaf</span>
          <input
            type="date"
            value={toDateInput(draft.effective_from)}
            disabled={readOnly || busy}
            onChange={(event) => change("effective_from", event.target.value)}
          />
        </label>
        <label>
          <span>Eerste inspectie uiterlijk</span>
          <input
            type="date"
            value={toDateInput(draft.first_inspection_due_date)}
            disabled={readOnly || busy}
            onChange={(event) => change("first_inspection_due_date", event.target.value)}
          />
        </label>
        <label>
          <span>Herbeoordelen op</span>
          <input
            type="date"
            value={toDateInput(draft.review_due_date)}
            disabled={readOnly || busy}
            onChange={(event) => change("review_due_date", event.target.value)}
          />
        </label>
        <label className="certification-form-grid__wide">
          <span>Reden en onderbouwing</span>
          <textarea
            rows={3}
            value={draft.reason || ""}
            disabled={readOnly || busy}
            onChange={(event) => change("reason", event.target.value)}
            placeholder="Leg vast waarom deze scope wel, niet of nog niet als verplicht geldt."
          />
        </label>
      </div>

      <div className="certification-card-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={readOnly || busy}
          onClick={() => onSave(draft)}
        >
          {busy ? "Opslaan..." : "Plicht opslaan"}
        </button>
        {item.events?.length ? (
          <button type="button" className="btn" onClick={() => setShowHistory((value) => !value)}>
            <History size={16} /> {showHistory ? "Historie sluiten" : `Historie (${item.events.length})`}
          </button>
        ) : null}
      </div>

      {showHistory ? (
        <div className="certification-history-list">
          {item.events.map((event) => (
            <div key={event.requirement_event_id} className="certification-history-row">
              <strong>{event.event_type === "CREATED" ? "Vastgelegd" : "Gewijzigd"}</strong>
              <span>{formatDate(event.event_at)}</span>
              <span>{event.event_by || "Onbekende gebruiker"}</span>
              {event.reason ? <span>{event.reason}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CertificateEditor({ draft, certificates, documents, busy, onChange, onSave, onCancel }) {
  function change(key, value) {
    onChange({ ...draft, [key]: value });
  }

  function toggleScope(scope) {
    const next = draft.scopes.includes(scope)
      ? draft.scopes.filter((item) => item !== scope)
      : [...draft.scopes, scope];
    change("scopes", next);
  }

  const editingId = draft.installation_certificate_id;

  return (
    <section className="card certification-editor">
      <div className="certification-section-heading">
        <div>
          <h3>{editingId ? "Certificaat wijzigen" : "Certificaat registreren"}</h3>
          <p className="muted">Koppel het bewijs aan een bestaand Ember-document en leg de geldigheid controleerbaar vast.</p>
        </div>
      </div>

      <div className="certification-form-grid certification-form-grid--certificate">
        <label>
          <span>Type certificaat</span>
          <select value={draft.certificate_type} disabled={busy} onChange={(e) => change("certificate_type", e.target.value)}>
            <option value="MAINTENANCE">Onderhoudscertificaat</option>
            <option value="INSPECTION">Inspectiecertificaat</option>
          </select>
        </label>
        <label>
          <span>Certificaatnummer</span>
          <input value={draft.certificate_number || ""} disabled={busy} onChange={(e) => change("certificate_number", e.target.value)} />
        </label>
        <label className="certification-form-grid__wide">
          <span>Omschrijving</span>
          <input value={draft.description || ""} disabled={busy} onChange={(e) => change("description", e.target.value)} />
        </label>
        <label>
          <span>Afgiftedatum</span>
          <input type="date" value={toDateInput(draft.issue_date)} disabled={busy} onChange={(e) => change("issue_date", e.target.value)} />
        </label>
        <label>
          <span>Inspectiedatum</span>
          <input type="date" value={toDateInput(draft.inspection_date)} disabled={busy} onChange={(e) => change("inspection_date", e.target.value)} />
        </label>
        <label>
          <span>Geldig tot en met</span>
          <input type="date" value={toDateInput(draft.valid_until)} disabled={busy} onChange={(e) => change("valid_until", e.target.value)} />
        </label>
        <label>
          <span>Uitgevende partij</span>
          <input value={draft.issuer_name || ""} disabled={busy} onChange={(e) => change("issuer_name", e.target.value)} />
        </label>
        <label>
          <span>Inspectie-instelling</span>
          <input value={draft.inspection_body || ""} disabled={busy} onChange={(e) => change("inspection_body", e.target.value)} />
        </label>
        <label>
          <span>Dossierstatus</span>
          <select value={draft.record_status} disabled={busy} onChange={(e) => change("record_status", e.target.value)}>
            <option value="CURRENT">Actueel</option>
            <option value="HISTORICAL">Historisch</option>
            <option value="REVOKED">Ingetrokken</option>
          </select>
        </label>
        <label>
          <span>Verificatie</span>
          <select value={draft.verification_status} disabled={busy} onChange={(e) => change("verification_status", e.target.value)}>
            <option value="VERIFIED">Gecontroleerd</option>
            <option value="UNVERIFIED">Niet gecontroleerd</option>
            <option value="REJECTED">Afgekeurd</option>
          </select>
        </label>
        <label className="certification-form-grid__wide">
          <span>Gekoppeld document</span>
          <select value={draft.installation_document_id || ""} disabled={busy} onChange={(e) => change("installation_document_id", e.target.value)}>
            <option value="">Geen document gekoppeld</option>
            {documents.map((document) => (
              <option key={document.document_id} value={document.document_id}>
                {document.title || document.file_name || document.document_number || document.document_id}
              </option>
            ))}
          </select>
        </label>
        <label className="certification-form-grid__wide">
          <span>Vervangt certificaat</span>
          <select value={draft.supersedes_certificate_id || ""} disabled={busy} onChange={(e) => change("supersedes_certificate_id", e.target.value)}>
            <option value="">Geen</option>
            {certificates
              .filter((item) => item.installation_certificate_id !== editingId)
              .map((item) => (
                <option key={item.installation_certificate_id} value={item.installation_certificate_id}>
                  {item.certificate_number || item.description}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="certification-form-grid__wide certification-scopes">
          <legend>Scopes</legend>
          {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
            <label key={scope} className="certification-check">
              <input type="checkbox" checked={draft.scopes.includes(scope)} disabled={busy} onChange={() => toggleScope(scope)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <label className="certification-form-grid__wide">
          <span>Reden van deze registratie of wijziging</span>
          <textarea rows={2} value={draft.change_reason || ""} disabled={busy} onChange={(e) => change("change_reason", e.target.value)} />
        </label>
      </div>

      <div className="certification-card-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !draft.description.trim() || !draft.scopes.length} onClick={onSave}>
          {busy ? "Opslaan..." : "Certificaat opslaan"}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Annuleren</button>
      </div>
    </section>
  );
}

function SendHistoryEditor({ certificate, busy, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    channel: "EMAIL",
    recipient_type: "CUSTOMER",
    recipient_display_name: "",
    recipient_address: "",
    subject_snapshot: "",
    send_status: "SENT",
    external_reference: "",
    note: "",
  });

  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="certification-send-editor">
      <h4>Verzending registreren</h4>
      {!certificate.installation_document_id ? (
        <p className="ember-alert ember-alert--warning">Koppel eerst het verzonden certificaatdocument.</p>
      ) : null}
      <div className="certification-form-grid">
        <label><span>Kanaal</span><select value={draft.channel} onChange={(e) => change("channel", e.target.value)}><option value="EMAIL">E-mail</option><option value="DIGITAL_LOGBOOK">Digitaal logboek</option><option value="OTHER">Anders</option></select></label>
        <label><span>Ontvangerstype</span><select value={draft.recipient_type} onChange={(e) => change("recipient_type", e.target.value)}><option value="CUSTOMER">Klant</option><option value="INSPECTION_BODY">Inspectie-instelling</option><option value="THIRD_PARTY">Derde</option><option value="INTERNAL">Intern</option></select></label>
        <label><span>Ontvanger</span><input value={draft.recipient_display_name} onChange={(e) => change("recipient_display_name", e.target.value)} /></label>
        <label><span>Adres of referentie</span><input value={draft.recipient_address} onChange={(e) => change("recipient_address", e.target.value)} /></label>
        <label className="certification-form-grid__wide"><span>Onderwerp</span><input value={draft.subject_snapshot} onChange={(e) => change("subject_snapshot", e.target.value)} /></label>
        <label><span>Status</span><select value={draft.send_status} onChange={(e) => change("send_status", e.target.value)}><option value="SENT">Verzonden</option><option value="PLANNED">Gepland</option><option value="FAILED">Mislukt</option><option value="CANCELLED">Geannuleerd</option></select></label>
        <label><span>Externe referentie</span><input value={draft.external_reference} onChange={(e) => change("external_reference", e.target.value)} /></label>
        <label className="certification-form-grid__wide"><span>Notitie</span><textarea rows={2} value={draft.note} onChange={(e) => change("note", e.target.value)} /></label>
      </div>
      <div className="certification-card-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !certificate.installation_document_id} onClick={() => onSave(draft)}><Send size={16} /> Registreren</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Annuleren</button>
      </div>
    </div>
  );
}

function CertificateCard({ certificate, readOnly, busy, onEdit, onSend }) {
  const [showHistory, setShowHistory] = useState(false);
  const [showSend, setShowSend] = useState(false);

  return (
    <article className="card certification-certificate-card">
      <div className="certification-card-heading">
        <div>
          <div className="certification-card-title">{certificate.certificate_number || certificate.description}</div>
          <div className="muted">{certificate.certificate_type === "INSPECTION" ? "Inspectiecertificaat" : "Onderhoudscertificaat"} · {certificate.scopes.map((scope) => SCOPE_LABELS[scope] || scope).join(", ")}</div>
        </div>
        <div className="certification-status-stack">
          <span className={`ember-label ember-label--${toneForStatus(certificate.validity_status)}`}>{STATUS_LABELS[certificate.validity_status] || certificate.validity_status}</span>
          <span className={`ember-label ember-label--${toneForStatus(certificate.verification_status)}`}>{STATUS_LABELS[certificate.verification_status] || certificate.verification_status}</span>
        </div>
      </div>

      <dl className="certification-facts">
        <div><dt>Geldig tot</dt><dd>{formatDate(certificate.valid_until)}</dd></div>
        <div><dt>Uitgever</dt><dd>{certificate.issuer_name || certificate.inspection_body || "Niet vastgelegd"}</dd></div>
        <div><dt>Document</dt><dd>{certificate.document_title || certificate.document_file_name || "Niet gekoppeld"}</dd></div>
        <div><dt>Bron</dt><dd>{certificate.source_type === "LEGACY_IMPORT" ? "Gecontroleerde legacy-import" : "Handmatig in Ember"}</dd></div>
      </dl>

      <div className="certification-card-actions">
        <button type="button" className="btn" disabled={readOnly || busy} onClick={() => onEdit(certificate)}>Wijzigen</button>
        <button type="button" className="btn" disabled={readOnly || busy} onClick={() => setShowSend((value) => !value)}><Send size={16} /> Verzending</button>
        <button type="button" className="btn" onClick={() => setShowHistory((value) => !value)}><History size={16} /> Dossierhistorie</button>
      </div>

      {showSend ? <SendHistoryEditor certificate={certificate} busy={busy} onSave={(payload) => onSend(certificate, payload)} onCancel={() => setShowSend(false)} /> : null}

      {showHistory ? (
        <div className="certification-history-list">
          {certificate.events.map((event) => (
            <div key={event.certificate_event_id} className="certification-history-row">
              <strong>{event.event_type}</strong><span>{formatDate(event.event_at)}</span><span>{event.event_by || "Onbekende gebruiker"}</span>{event.reason ? <span>{event.reason}</span> : null}
            </div>
          ))}
          {certificate.send_history.map((event) => (
            <div key={event.certificate_send_history_id} className="certification-history-row certification-history-row--send">
              <strong>{event.send_status === "SENT" ? "Verzonden" : event.send_status}</strong><span>{formatDate(event.sent_at || event.created_at)}</span><span>{event.recipient_display_name || event.recipient_address || event.recipient_type}</span>{event.note ? <span>{event.note}</span> : null}
            </div>
          ))}
          {!certificate.events.length && !certificate.send_history.length ? <span className="muted">Nog geen historie.</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export default function CertificatesTab({ code, readOnly = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null);

  async function load() {
    setError(null);
    const result = await getInstallationCertification(code);
    setData(result);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInstallationCertification(code)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((cause) => { if (!cancelled) setError(cause?.message || String(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);

  const requirements = useMemo(() => {
    const existing = new Map((data?.requirements || []).map((item) => [item.scope, item]));
    return (data?.scopes || Object.keys(SCOPE_LABELS)).map((scope) => existing.get(scope) || emptyRequirement(scope));
  }, [data]);

  async function saveRequirement(draft) {
    setBusyKey(`requirement:${draft.scope}`);
    setError(null);
    try {
      await putInstallationCertificationRequirement(code, draft.scope, draft);
      await load();
    } catch (cause) {
      setError(cause?.message || String(cause));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveCertificate() {
    if (!editor) return;
    setBusyKey("certificate");
    setError(null);
    try {
      if (editor.installation_certificate_id) {
        await updateInstallationCertificate(code, editor.installation_certificate_id, editor);
      } else {
        await createInstallationCertificate(code, editor);
      }
      setEditor(null);
      await load();
    } catch (cause) {
      setError(cause?.message || String(cause));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveSend(certificate, payload) {
    setBusyKey(`send:${certificate.installation_certificate_id}`);
    setError(null);
    try {
      await recordInstallationCertificateSend(code, certificate.installation_certificate_id, payload);
      await load();
    } catch (cause) {
      setError(cause?.message || String(cause));
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) return <div className="card"><p className="muted">Certificeringsdossier laden...</p></div>;

  return (
    <div className="certification-page">
      <section className="certification-hero card">
        <div className="certification-hero__icon"><Award size={26} /></div>
        <div>
          <h2>Certificeringsdossier</h2>
          <p>Certificeringsplicht wordt handmatig vastgesteld. Certificaten worden als controleerbare dossierstukken vastgelegd; Atrium-data is hooguit een importkandidaat.</p>
        </div>
        <div className="certification-hero__meta">
          <Clock3 size={16} /> Signaaltermijn {data?.expiry_warning_days || 90} dagen
        </div>
      </section>

      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {readOnly ? <div className="ember-alert ember-alert--warning">Dit historische installatiedossier is alleen-lezen.</div> : null}

      <section>
        <div className="certification-section-heading">
          <div><h2>Certificeringsplicht per scope</h2><p className="muted">Iedere wijziging wordt volledig geaudit.</p></div>
          <ShieldAlert size={22} />
        </div>
        <div className="certification-requirement-grid">
          {requirements.map((item) => (
            <RequirementCard
              key={item.scope}
              item={item}
              summary={(data?.scope_summary || []).find((summary) => summary.scope === item.scope)}
              readOnly={readOnly}
              busy={busyKey === `requirement:${item.scope}`}
              onSave={saveRequirement}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="certification-section-heading">
          <div><h2>Certificaten</h2><p className="muted">Actuele, historische en ingetrokken certificaten blijven in één dossier zichtbaar.</p></div>
          <button type="button" className="btn btn-primary" disabled={readOnly || Boolean(editor)} onClick={() => setEditor(emptyCertificate())}><Plus size={16} /> Certificaat registreren</button>
        </div>

        {editor ? (
          <CertificateEditor
            draft={editor}
            certificates={data?.certificates || []}
            documents={data?.documents || []}
            busy={busyKey === "certificate"}
            onChange={setEditor}
            onSave={saveCertificate}
            onCancel={() => setEditor(null)}
          />
        ) : null}

        <div className="certification-certificate-list">
          {(data?.certificates || []).map((certificate) => (
            <CertificateCard
              key={certificate.installation_certificate_id}
              certificate={certificate}
              readOnly={readOnly}
              busy={Boolean(busyKey)}
              onEdit={(item) => setEditor({ ...item, change_reason: "" })}
              onSend={saveSend}
            />
          ))}
          {!data?.certificates?.length ? (
            <div className="card certification-empty"><FileCheck2 size={28} /><strong>Nog geen certificaten geregistreerd</strong><span className="muted">Leg eerst de certificeringsplicht vast en registreer daarna het bewijsdocument.</span></div>
          ) : null}
        </div>
      </section>

      <div className="certification-footnote muted"><CheckCircle2 size={16} /> Geldigheidsstatus wordt bij lezen berekend uit dossierstatus, verificatie en geldigheidsdatum.</div>
    </div>
  );
}
