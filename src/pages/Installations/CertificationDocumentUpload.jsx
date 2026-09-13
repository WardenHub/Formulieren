import { useRef, useState } from "react";
import { putDocuments, uploadInstallationDocumentFile, getInstallationCertification } from "@/api/emberApi.js";

/** Each upload creates a new document/version; never overwrites an audited file. */
export default function CertificationDocumentUpload({ code, documentType, label, disabled, onUploaded }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);
  async function upload() {
    if (!file || busy || disabled) return;
    setBusy(true); setError("");
    try {
      const attempt = pending.current || { id: crypto.randomUUID(), created: false, uploaded: false, document: null };
      pending.current = attempt;
      const { id } = attempt;
      // SQL uniqueidentifier may serialize in uppercase; UUID identity is case-insensitive.
      const isDocument = (row) => String(row.document_id).toLowerCase() === id.toLowerCase();
      if (!attempt.created) {
        await putDocuments(code, [{ document_id: id, document_type_key: documentType, title: file.name,
          document_number: null, document_date: null, revision: null, is_active: true }]);
        attempt.created = true;
      }
      // Reconcile first, including an upload whose response was lost. A confirmed file
      // is never replaced when only registration or the parent refresh needs retrying.
      if (!attempt.uploaded) {
        const existing = await getInstallationCertification(code);
        attempt.document = existing.documents.find((row) => isDocument(row) && row.stored_file_id) || null;
        if (!attempt.document) await uploadInstallationDocumentFile(code, id, file);
        attempt.uploaded = true;
      }
      const overview = await getInstallationCertification(code);
      const document = overview.documents.find(isDocument);
      if (!document?.stored_file_id) throw new Error("Bestand is nog niet bevestigd; probeer de registratie opnieuw.");
      await onUploaded(document);
      pending.current = null; setFile(null);
    } catch (cause) { setError(cause?.message || "Upload mislukt"); }
    finally { setBusy(false); }
  }
  return <div className="card certification-send-editor">
    <label className="ui-stack-sm"><span>{label}</span>
      <input type="file" accept="application/pdf,image/png,image/jpeg" disabled={disabled || busy}
        onChange={(e) => { pending.current = null; setFile(e.target.files?.[0] || null); setError(""); }} />
    </label>
    <button type="button" className="btn btn-secondary" disabled={disabled || busy || !file} onClick={() => void upload()}>
      {busy ? "Uploaden..." : "Nieuw bestand uploaden"}
    </button>
    {error ? <p role="alert" className="ember-error-text">{error}</p> : null}
    <p className="muted">Het bestand wordt apart bewaard. Rond daarna de registratie in deze stap af.</p>
  </div>;
}
