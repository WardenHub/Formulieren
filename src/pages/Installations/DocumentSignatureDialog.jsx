// /src/pages/Installations/DocumentSignatureDialog.jsx
//
// Het ondertekenscherm bij een document. De gebruiker kiest wie er tekent en waar de
// handtekening komt; Ember maakt het pakket aan en verstuurt het. De designer van
// ValidSign wordt alleen gebruikt om de vakken te plaatsen, in een eigen venster.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getDocumentSignature,
  createDocumentSignatureRequest,
  createDocumentSignatureDesignerSession,
  sendDocumentSignatureRequest,
  cancelDocumentSignatureRequest,
  downloadDocumentSignatureFile,
  getMe,
  getUserDirectory,
} from "../../api/emberApi.js";

import { SignatureIcon } from "@/components/ui/signature";
import { PlusIcon } from "@/components/ui/plus";
import { DeleteIcon } from "@/components/ui/delete";
import { DownloadIcon } from "@/components/ui/download";
import { CheckIcon } from "@/components/ui/check";
import { HourglassIcon } from "@/components/ui/hourglass";
import { BadgeAlertIcon } from "@/components/ui/badge-alert";

const STATUS_LABELS = {
  DRAFT: "Concept",
  SENT: "Verstuurd",
  COMPLETED: "Ondertekend",
  DECLINED: "Geweigerd",
  EXPIRED: "Verlopen",
  CANCELLED: "Geannuleerd",
  FAILED: "Mislukt",
};

const SIGNER_STATUS_LABELS = {
  PENDING: "Wacht op handtekening",
  SIGNED: "Ondertekend",
  DECLINED: "Geweigerd",
  BOUNCED: "E-mail kwam niet aan",
};

const STATUS_TONE = {
  DRAFT: "neutral",
  SENT: "info",
  COMPLETED: "success",
  DECLINED: "danger",
  EXPIRED: "warning",
  CANCELLED: "neutral",
  FAILED: "danger",
};

const ERROR_TEXTS = {
  "signature provider not configured": "ValidSign is nog niet ingesteld op de server.",
  "signature provider unavailable": "ValidSign is nu niet bereikbaar; probeer het straks opnieuw.",
  "document type not signable": "Dit documenttype mag nog niet digitaal ondertekend worden.",
  "document has no file": "Er hangt nog geen bestand aan dit document.",
  "document is not a pdf": "Alleen een pdf kan digitaal ondertekend worden.",
  "pdf unreadable": "Dit pdf-bestand is beveiligd of beschadigd; ValidSign kan er niets mee.",
  "document already signed": "Dit document staat al als ondertekend geregistreerd.",
  "signature request already open": "Er loopt al een ondertekenronde op dit document.",
  "signature request not editable": "Deze ronde is al verstuurd en kan niet meer aangepast worden.",
  "signer email invalid": "Een van de e-mailadressen klopt niet.",
  "signer name required": "Vul bij elke ondertekenaar een naam in.",
  "duplicate signer email": "Hetzelfde e-mailadres staat er twee keer in.",
  "no signers": "Voeg minstens een ondertekenaar toe.",
  "historical installation read-only": "Deze installatie is historisch en mag niet gewijzigd worden.",
};

function foutTekst(err) {
  const raw = String(err?.message || err || "").trim();

  if (raw === "signature fields missing") {
    const namen = err?.payload?.signers || [];
    return namen.length
      ? `Er staat nog geen handtekeningvak voor ${namen.join(", ")}. Open eerst "handtekeningen plaatsen".`
      : "Er staat nog geen handtekeningvak in het document.";
  }

  return ERROR_TEXTS[raw] || raw || "Er ging iets mis.";
}

function leegteOndertekenaar() {
  return { full_name: "", email: "", capacity: "", user_object_id: null };
}

function formatMoment(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusChip({ status }) {
  const tone = STATUS_TONE[status] || "neutral";
  return <span className={`ember-label ember-label--${tone}`}>{STATUS_LABELS[status] || status}</span>;
}

function SignerRow({ signer }) {
  const status = String(signer.status || "PENDING");
  const Icon = status === "SIGNED" ? CheckIcon : status === "PENDING" ? HourglassIcon : BadgeAlertIcon;

  return (
    <li className="doc-sign-progress__row">
      <span className={`doc-sign-progress__icon doc-sign-progress__icon--${status.toLowerCase()}`}>
        <Icon size={16} />
      </span>
      <span className="doc-sign-progress__who">
        <strong>{signer.full_name}</strong>
        <span className="muted">{signer.email}{signer.capacity ? `; ${signer.capacity}` : ""}</span>
      </span>
      <span className="muted doc-sign-progress__status">
        {SIGNER_STATUS_LABELS[status] || status}
        {signer.signed_at ? ` op ${formatMoment(signer.signed_at)}` : ""}
      </span>
    </li>
  );
}

export default function DocumentSignatureDialog({ code, documentId, documentTitle, onClose, onChanged }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [designerUrl, setDesignerUrl] = useState("");

  const [placementMethod, setPlacementMethod] = useState("IN_DOCUMENT");
  const [enforceOrder, setEnforceOrder] = useState(false);
  const [message, setMessage] = useState("");
  const [signers, setSigners] = useState([leegteOndertekenaar()]);

  const [directory, setDirectory] = useState([]);
  const selfApplied = useRef(false);

  const laden = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getDocumentSignature(code, documentId);
      setState(data || null);
    } catch (err) {
      setError(foutTekst(err));
    } finally {
      setLoading(false);
    }
  }, [code, documentId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // De eerste ondertekenaar is bijna altijd degene die de ronde start; die vullen we voor.
  useEffect(() => {
    if (selfApplied.current) return;
    selfApplied.current = true;

    void (async () => {
      try {
        const [me, dir] = await Promise.all([getMe(), getUserDirectory()]);
        const items = Array.isArray(dir?.items) ? dir.items : [];
        setDirectory(items);

        const naam = me?.profile?.display_name || me?.user?.name || "";
        const email = me?.user?.email || me?.user?.preferred_username || "";
        if (!naam && !email) return;

        setSigners((huidig) => {
          const eerste = huidig[0];
          if (!eerste || eerste.full_name || eerste.email) return huidig;
          const kopie = huidig.slice();
          kopie[0] = { ...eerste, full_name: naam, email, capacity: "Namens Wardenburg" };
          return kopie;
        });
      } catch {
        // Voorvullen is een gemak, geen voorwaarde; zonder profiel vult de gebruiker zelf.
      }
    })();
  }, []);

  const request = state?.request || null;
  const serverSigners = state?.signers || [];
  const status = request ? String(request.status) : null;
  const openRonde = status === "DRAFT" || status === "SENT";
  const toonFormulier = !openRonde && status !== "COMPLETED";

  const directoryOpties = useMemo(
    () =>
      directory
        .map((item) => ({
          key: item.user_object_id,
          naam: item.preferred_display_name || item.display_name_snapshot || item.email_snapshot || "",
          email: item.email_snapshot || "",
        }))
        .filter((item) => item.naam && item.email),
    [directory]
  );

  function pasSignerAan(index, veld, waarde) {
    setSigners((huidig) => {
      const kopie = huidig.slice();
      kopie[index] = { ...kopie[index], [veld]: waarde };
      return kopie;
    });
  }

  function kiesUitLijst(index, key) {
    const gevonden = directoryOpties.find((item) => item.key === key);
    if (!gevonden) return;
    setSigners((huidig) => {
      const kopie = huidig.slice();
      kopie[index] = {
        ...kopie[index],
        full_name: gevonden.naam,
        email: gevonden.email,
        user_object_id: gevonden.key,
      };
      return kopie;
    });
  }

  const magAanmaken = useMemo(
    () => signers.length > 0 && signers.every((s) => s.full_name.trim() && s.email.trim()),
    [signers]
  );

  async function voerUit(naam, actie) {
    setBusy(naam);
    setError("");
    try {
      const data = await actie();
      if (data) setState(data);
      onChanged?.();
      return true;
    } catch (err) {
      setError(foutTekst(err));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function maakRonde() {
    await voerUit("create", () =>
      createDocumentSignatureRequest(code, documentId, {
        placement_method: placementMethod,
        enforce_order: enforceOrder,
        message: message.trim() || null,
        signers: signers.map((s) => ({
          full_name: s.full_name.trim(),
          email: s.email.trim(),
          capacity: s.capacity.trim() || null,
          user_object_id: s.user_object_id || null,
        })),
      })
    );
  }

  async function openDesigner() {
    setBusy("designer");
    setError("");
    try {
      const data = await createDocumentSignatureDesignerSession(code, documentId, request.signature_request_id);
      setDesignerUrl(String(data?.url || ""));
    } catch (err) {
      setError(foutTekst(err));
    } finally {
      setBusy("");
    }
  }

  async function haalBestand(kind) {
    setBusy(`download:${kind}`);
    setError("");
    try {
      const result = await downloadDocumentSignatureFile(code, documentId, request.signature_request_id, kind);
      const blobUrl = window.URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = result.fileName || (kind === "EVIDENCE" ? "ondertekenbewijs.pdf" : "ondertekend-document.pdf");
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      setError(foutTekst(err));
    } finally {
      setBusy("");
    }
  }

  if (designerUrl) {
    return (
      <div className="form-evidence-overlay" role="dialog" aria-modal="true">
        <div className="form-evidence-dialog form-evidence-dialog--wide doc-sign-designer">
          <div className="form-evidence-dialog__head">
            <div>
              <h2>Plaats de handtekeningen</h2>
              <p className="muted">
                Sleep per ondertekenaar een handtekeningvak naar de juiste plek in het document.
                Sluit dit venster als u klaar bent; versturen doet u daarna in Ember.
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setDesignerUrl("")}>
              klaar met plaatsen
            </button>
          </div>
          <div className="doc-sign-designer__frame">
            <iframe title="Handtekeningen plaatsen" src={designerUrl} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-evidence-overlay" role="dialog" aria-modal="true">
      <div className="form-evidence-dialog doc-sign">
        <div className="form-evidence-dialog__head">
          <div>
            <h2>Onderteken</h2>
            <p className="muted">{documentTitle || "Document"}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            sluiten
          </button>
        </div>

        <div className="form-evidence-dialog__body doc-sign__body">
          {loading && <p className="muted">Bezig met laden...</p>}

          {!loading && state && !state.provider_configured && (
            <p className="doc-sign__melding doc-sign__melding--fout">
              ValidSign is nog niet ingesteld op de server; ondertekenen kan nog niet.
            </p>
          )}

          {error && <p className="doc-sign__melding doc-sign__melding--fout">{error}</p>}

          {!loading && request && (
            <div className="doc-sign__balk">
              <StatusChip status={status} />
              <span className="muted">
                {request.placement_method === "SIGNATURE_PAGE" ? "met ondertekenpagina" : "in het document"}
                {request.sent_at ? `; verstuurd ${formatMoment(request.sent_at)}` : ""}
                {request.completed_at ? `; afgerond ${formatMoment(request.completed_at)}` : ""}
              </span>
            </div>
          )}

          {!loading && request && request.closed_reason && (
            <p className="muted doc-sign__reden">{request.closed_reason}</p>
          )}

          {!loading && serverSigners.length > 0 && (
            <ul className="doc-sign-progress">
              {serverSigners.map((signer) => (
                <SignerRow key={signer.signature_signer_id} signer={signer} />
              ))}
            </ul>
          )}

          {!loading && status === "COMPLETED" && (
            <div className="doc-sign__downloads">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy !== "" || !request.signed_file_name}
                onClick={() => haalBestand("SIGNED")}
              >
                <DownloadIcon size={16} /> ondertekend document
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy !== "" || !request.evidence_file_name}
                onClick={() => haalBestand("EVIDENCE")}
              >
                <DownloadIcon size={16} /> ondertekenbewijs
              </button>
            </div>
          )}

          {!loading && toonFormulier && state?.document?.supports_esignature && (
            <>
              <section className="doc-sign__sectie">
                <h3>Wie tekent er?</h3>
                <ul className="doc-sign-signers">
                  {signers.map((signer, index) => (
                    <li key={index} className="doc-sign-signers__row">
                      <div className="doc-sign-signers__nr">{index + 1}</div>
                      <div className="doc-sign-signers__velden">
                        {directoryOpties.length > 0 && (
                          <select
                            className="cf-input"
                            value={signer.user_object_id || ""}
                            onChange={(e) => kiesUitLijst(index, e.target.value)}
                          >
                            <option value="">collega kiezen of zelf invullen</option>
                            {directoryOpties.map((item) => (
                              <option key={item.key} value={item.key}>
                                {item.naam}
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          className="cf-input"
                          placeholder="naam"
                          value={signer.full_name}
                          onChange={(e) => pasSignerAan(index, "full_name", e.target.value)}
                        />
                        <input
                          className="cf-input"
                          placeholder="e-mailadres"
                          type="email"
                          value={signer.email}
                          onChange={(e) => pasSignerAan(index, "email", e.target.value)}
                        />
                        <input
                          className="cf-input"
                          placeholder="hoedanigheid; bv namens de opdrachtgever"
                          value={signer.capacity}
                          onChange={(e) => pasSignerAan(index, "capacity", e.target.value)}
                        />
                      </div>
                      {signers.length > 1 && (
                        <button
                          type="button"
                          className="btn-ghost doc-sign-signers__weg"
                          title="verwijderen"
                          onClick={() => setSigners((huidig) => huidig.filter((_, i) => i !== index))}
                        >
                          <DeleteIcon size={16} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="doc-sign__acties-links">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setSigners((huidig) => [...huidig, leegteOndertekenaar()])}
                  >
                    <PlusIcon size={16} /> ondertekenaar toevoegen
                  </button>

                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={enforceOrder}
                      onChange={(e) => setEnforceOrder(e.target.checked)}
                    />
                    <span>in deze volgorde laten tekenen</span>
                  </label>
                </div>
              </section>

              <section className="doc-sign__sectie">
                <h3>Waar komt de handtekening?</h3>
                <label className="doc-sign__keuze">
                  <input
                    type="radio"
                    name="plaatsing"
                    checked={placementMethod === "IN_DOCUMENT"}
                    onChange={() => setPlacementMethod("IN_DOCUMENT")}
                  />
                  <span>
                    <strong>In het document zelf</strong>
                    <span className="muted">
                      U plaatst de vakken zelf op de bestaande ondertekenregels. Geschikt voor sjablonen
                      die al een handtekeningvak hebben.
                    </span>
                  </span>
                </label>
                <label className="doc-sign__keuze">
                  <input
                    type="radio"
                    name="plaatsing"
                    checked={placementMethod === "SIGNATURE_PAGE"}
                    onChange={() => setPlacementMethod("SIGNATURE_PAGE")}
                  />
                  <span>
                    <strong>Ondertekenpagina toevoegen</strong>
                    <span className="muted">
                      Ember plakt een eigen blad achter het document, met een controlegetal van het
                      bestand. U hoeft dan niets te plaatsen.
                    </span>
                  </span>
                </label>
              </section>

              <section className="doc-sign__sectie">
                <h3>Begeleidend bericht</h3>
                <textarea
                  className="cf-input doc-textarea"
                  rows={3}
                  placeholder="optioneel; wordt meegestuurd in de uitnodiging"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </section>
            </>
          )}
        </div>

        <div className="doc-sign__voet">
          {toonFormulier && state?.document?.supports_esignature && (
            <button
              type="button"
              className="btn-primary"
              disabled={!magAanmaken || busy !== "" || !state?.provider_configured}
              onClick={maakRonde}
            >
              <SignatureIcon size={16} />
              {busy === "create" ? "bezig..." : "ondertekenronde aanmaken"}
            </button>
          )}

          {status === "DRAFT" && (
            <>
              {request.placement_method === "IN_DOCUMENT" && (
                <button type="button" className="btn-ghost" disabled={busy !== ""} onClick={openDesigner}>
                  {busy === "designer" ? "bezig..." : "handtekeningen plaatsen"}
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                disabled={busy !== ""}
                onClick={() =>
                  voerUit("send", () =>
                    sendDocumentSignatureRequest(code, documentId, request.signature_request_id)
                  )
                }
              >
                {busy === "send" ? "bezig..." : "versturen"}
              </button>
            </>
          )}

          {openRonde && (
            <button
              type="button"
              className="btn-ghost"
              disabled={busy !== ""}
              onClick={() =>
                voerUit("cancel", () =>
                  cancelDocumentSignatureRequest(code, documentId, request.signature_request_id, {
                    reason: "geannuleerd vanuit Ember",
                  })
                )
              }
            >
              {busy === "cancel" ? "bezig..." : "ronde annuleren"}
            </button>
          )}

          <button type="button" className="btn-ghost" onClick={onClose}>
            sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
