//src/pages/Forms/shared/FollowUpPointsSheet.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trapFocus } from "./focusTrap.js";

import { CircleHelpIcon } from "@/components/ui/circle-help";

import { hasPointLocation, isOpenPoint, missingPointParts } from "./followUpPoints.js";

// Opvolgacties zijn het vehikel waarmee een probleempunt wordt vastgelegd; een pin, foto
// of bestand is een eigenschap van zo'n punt en geen losse workflow. Deze sheet toont de
// punten van het formulier waar je in zit, zodat je tijdens het invullen ziet wat je
// achterlaat voor de organisatie. Dezelfde component wordt hergebruikt bij indienen en
// in de installatietab, zodat er één interactiemodel is.

function statusToneClass(status) {
  const key = String(status || "").trim().toUpperCase();

  if (key === "AFGEHANDELD") return "ember-point__status--done";
  if (key === "AFGEWEZEN" || key === "VERVALLEN") return "ember-point__status--dropped";
  if (key === "INFORMATIEF") return "ember-point__status--info";
  return "ember-point__status--open";
}

function formatKind(kind) {
  return String(kind || "").trim() === "report-only" ? "Rapportopmerking" : "Actiepunt";
}

export default function FollowUpPointsSheet({
  open,
  onClose,
  points,
  currentFormInstanceId,
  loading,
  error,
  notice,
  onRefresh,
  installationCode,
  canAdd = false,
  onAddPoint,
  canSetLocation = false,
  onSetLocation,
  onAttachFile,
  documents = [],
  onLinkDocument,
  onViewPin,
  onOpenAttachment,
  actionBusy = false,
  onBusyChange,
  // "inline" rendert dezelfde inhoud zonder eigen paneel, voor gebruik in een dialoog.
  variant = "drawer",
}) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open || variant === "inline") return undefined;
    return trapFocus(dialogRef.current, { initialFocus: () => closeRef.current });
  }, [open, variant]);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape" && !actionBusy && variant !== "inline") onClose?.();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, actionBusy, variant]);

  const groepen = useMemo(() => {
    const lijst = Array.isArray(points) ? points : [];
    return {
      open: lijst.filter(isOpenPoint),
      informatie: lijst.filter((point) => point.status === "INFORMATIEF"),
      afgerond: lijst.filter((point) => !isOpenPoint(point) && point.status !== "INFORMATIEF"),
    };
  }, [points]);

  if (!open) return null;

  const inline = variant === "inline";

  const body = (
    <div className="ember-points-sheet__body">
        {error ? <div className="ember-points-sheet__error">{error}</div> : null}
        {notice ? <div role="status" className="ember-alert ember-alert--info">{notice}</div> : null}

        {canAdd ? <AddPointForm onAdd={onAddPoint} disabled={actionBusy || loading} onBusyChange={onBusyChange} /> : null}

        {!loading && groepen.open.length === 0 && groepen.afgerond.length === 0 && groepen.informatie.length === 0 ? (
          <div className="muted ember-points-sheet__empty">
            Dit formulier levert nog geen opvolgacties op. Ze ontstaan zodra je een
            bevinding op Nee zet, en verschijnen hier meteen.
          </div>
        ) : null}

        {[...groepen.open, ...groepen.informatie].map((point) => (
          <PointCard
            key={point.follow_up_action_id}
            point={point}
            installationCode={installationCode}
            canSetLocation={canSetLocation && (!currentFormInstanceId || String(point.form_instance_id) === String(currentFormInstanceId))}
            onSetLocation={onSetLocation}
            onAttachFile={!currentFormInstanceId || String(point.form_instance_id) === String(currentFormInstanceId) ? onAttachFile : undefined}
            documents={documents}
            onLinkDocument={!currentFormInstanceId || String(point.form_instance_id) === String(currentFormInstanceId) ? onLinkDocument : undefined}
            inherited={Boolean(currentFormInstanceId && String(point.form_instance_id) !== String(currentFormInstanceId))}
            onViewPin={onViewPin}
            onOpenAttachment={onOpenAttachment}
            disabled={actionBusy || loading}
            onBusyChange={onBusyChange}
          />
        ))}

        {groepen.afgerond.length > 0 ? (
          <div className="ember-points-sheet__section muted">Afgerond of vervallen</div>
        ) : null}

        {groepen.afgerond.map((point) => (
          <PointCard key={point.follow_up_action_id} point={point} installationCode={installationCode} dimmed onViewPin={onViewPin} onOpenAttachment={onOpenAttachment} />
        ))}
    </div>
  );

  if (inline) return body;

  return createPortal(
    <div ref={dialogRef} className="ember-points-sheet" role="dialog" aria-modal="true" aria-label="Opvolgacties">
      <div className="ember-points-sheet__head">
        <div>
          <div className="ember-points-sheet__title">Opvolgacties</div>
          <div className="ember-points-sheet__subtitle muted">
            {loading
              ? "Bezig met ophalen..."
              : `${groepen.open.length} open, ${groepen.informatie.length} rapportopmerking(en), ${groepen.afgerond.length} afgerond`}
          </div>
        </div>

        <div className="ember-points-sheet__head-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onRefresh?.()} disabled={loading || actionBusy}>
            Verversen
          </button>
          <button type="button" className="btn" ref={closeRef} disabled={actionBusy} onClick={onClose}>
            Sluiten
          </button>
        </div>
      </div>

      {body}
    </div>, document.body
  );
}

// "Wat is er aan de hand" is de enige verplichte vraag. Locatie, foto en bestand komen
// daarna aan het punt te hangen; zo blijft de drempel om iets vast te leggen laag.
function AddPointForm({ onAdd, disabled, onBusyChange }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef(null);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button type="button" className="btn ember-points-add-toggle" disabled={disabled} onClick={() => setOpen(true)}>
        Punt toevoegen
      </button>
    );
  }

  async function submit() {
    const schoon = title.trim();

    if (!schoon) {
      setError("Geef aan wat er aan de hand is.");
      titleRef.current?.focus();
      return;
    }

    setBusy(true);
    onBusyChange?.(true);
    setError("");

    try {
      await onAdd?.({ title: schoon, description: description.trim(), priority });
      setTitle("");
      setDescription("");
      setPriority("NORMAL");
      setOpen(false);
    } catch (err) {
      setError(String(err?.message || err || "Toevoegen is niet gelukt."));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="card ember-points-add">
      <div className="ember-points-add__title">Punt toevoegen</div>

      <label className="ember-points-add__field">
        <span>Wat is er aan de hand</span>
        <input
          ref={titleRef}
          className="ember-runtime-input"
          value={title}
          maxLength={300}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Bijvoorbeeld; melder in ruimte 12 reageert niet"
        />
      </label>

      <label className="ember-points-add__field">
        <span>Toelichting</span>
        <textarea
          className="ember-runtime-textarea"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optioneel; wat is er precies aan de hand en wat is er nodig."
        />
      </label>

      <label className="ember-points-add__field">
        <span>Prioriteit</span>
        <select
          className="ember-runtime-select"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="LOW">Laag</option>
          <option value="NORMAL">Normaal</option>
          <option value="HIGH">Hoog</option>
          <option value="CRITICAL">Kritiek</option>
        </select>
      </label>

      {error ? <div className="ember-points-sheet__error">{error}</div> : null}

      <div className="ember-points-add__actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>
          Annuleren
        </button>
        <button type="button" className="btn" disabled={busy || disabled} onClick={submit}>
          {busy ? "Toevoegen..." : "Toevoegen"}
        </button>
      </div>
    </div>
  );
}

function PointCard({
  point,
  installationCode,
  dimmed = false,
  canSetLocation = false,
  onSetLocation,
  onAttachFile,
  documents = [],
  onLinkDocument,
  onViewPin,
  onOpenAttachment,
  disabled = false,
  inherited = false,
  onBusyChange,
}) {
  const [openDetails, setOpenDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attachError, setAttachError] = useState("");
  const fotoRef = useRef(null);
  const bestandRef = useRef(null);
  const [documentId, setDocumentId] = useState("");

  async function perform(action) {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    setAttachError("");
    try {
      await action();
    } catch (err) {
      setAttachError(String(err?.message || err || "De handeling is niet gelukt."));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function attach(event) {
    const file = event?.target?.files?.[0];
    event.target.value = "";

    if (!file) return;

    await perform(() => onAttachFile?.(point, file));
  }

  const pins = Array.isArray(point?.drawing_pins) ? point.drawing_pins : [];
  const missing = missingPointParts(point);
  const attachments = Array.isArray(point?.attachments) ? point.attachments : [];
  const availableDocuments = documents.filter((doc) => !(doc.follow_ups || []).some((link) => String(link.follow_up_action_id) === String(point.follow_up_action_id)));

  return (
    <div className={`card ember-point ${dimmed ? "ember-point--dimmed" : ""}`}>
      <div className="ember-point__head">
        <div className="ember-point__title-wrap">
          {point?.source_item_code ? (
            <span className="ember-point__code">{point.source_item_code}</span>
          ) : null}
          <span className="ember-point__title">{point?.workflow_title || "Actiepunt"}</span>
        </div>

        <span className={`ember-point__status ${statusToneClass(point?.status)}`}>
          {point?.status || "OPEN"}
        </span>
      </div>

      <div className="ember-point__meta muted">
        <span>{formatKind(point?.kind)}</span>
        {inherited ? <span>Uit gekoppeld formulier {point.form_instance_id}; hier alleen bekijken</span> : null}
        {point?.category ? <span>{point.category}</span> : null}
        {hasPointLocation(point) ? <span>{pins.length} op tekening</span> : null}
      </div>

      {point?.workflow_description ? (
        <div className="ember-point__description">{point.workflow_description}</div>
      ) : null}

      {missing.length > 0 && !dimmed ? (
        <div className="ember-point__missing">
          <CircleHelpIcon size={14} />
          <span>{missing.join(" ; ")}</span>
        </div>
      ) : null}

      {pins.length > 0 ? (
        <>
          <button
            type="button"
            className="ember-point__toggle"
            onClick={() => setOpenDetails((current) => !current)}
          >
            {openDetails ? "Locaties verbergen" : "Locaties tonen"}
          </button>

          {openDetails ? (
            <div className="ember-point__pins">
              {pins.map((pin) => (
                <div key={pin?.drawing_pin_id || pin?.label} className="ember-point__pin">
                  <span className="ember-point__pin-label">{pin?.pin_label || pin?.label || "Pin"}</span>
                  {pin?.drawing_title || pin?.document_title ? (
                    <span className="muted">{pin.drawing_title || pin.document_title}; pagina {pin.page_number || 1}</span>
                  ) : null}
                  {installationCode && pin?.installation_document_id ? (
                    onViewPin ? <button type="button" className="btn btn-secondary" disabled={busy || disabled} onClick={() => perform(() => onViewPin(point, pin))}>Toon op tekening</button> : <a
                      className="ember-point__pin-link"
                      href={`/installaties/${encodeURIComponent(installationCode)}?tab=drawings&drawing=${encodeURIComponent(
                        pin.installation_document_id
                      )}&pin=${encodeURIComponent(pin.drawing_pin_id || "")}`}
                    >
                      Toon op tekening
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {!dimmed && (onSetLocation || onAttachFile) ? (
        <div className="ember-point__actions">
          {canSetLocation ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || disabled}
              onClick={() => perform(() => onSetLocation?.(point))}
            >
              {pins.length > 0 ? "Pin toevoegen" : "Pin plaatsen"}
            </button>
          ) : null}

          {onAttachFile ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || disabled}
                onClick={() => fotoRef.current?.click()}
              >
                {busy ? "Bezig..." : "Foto"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || disabled}
                onClick={() => bestandRef.current?.click()}
              >
                Bestand
              </button>

              <input
                ref={fotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={attach}
              />
              <input ref={bestandRef} type="file" hidden onChange={attach} />
            </>
          ) : null}
        </div>
      ) : null}

      {attachments.length ? <div className="ember-point__attachments" aria-label="Gekoppelde bestanden">
        <strong>{attachments.length} gekoppeld(e) bestand(en)</strong>
        {attachments.map((attachment, index) => <button type="button" className="btn btn-secondary" key={attachment.stored_file_id || index} disabled={!onOpenAttachment || busy || disabled} onClick={() => perform(() => onOpenAttachment(point, attachment))}>
          {attachment.file_name || attachment.title || "Bestand openen"}
        </button>)}
      </div> : null}

      {!dimmed && onLinkDocument && availableDocuments.length ? <div className="ember-point__existing-file">
        <label className="ember-points-add__field"><span>Bestaande formulierbijlage koppelen</span>
          <select className="ember-runtime-select" value={documentId} disabled={busy || disabled} onChange={(event) => setDocumentId(event.target.value)}>
            <option value="">Kies een bestand</option>
            {availableDocuments.map((doc) => <option key={doc.form_instance_document_id} value={doc.form_instance_document_id}>{doc.title || doc.file_name}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-secondary" disabled={!documentId || busy || disabled} onClick={() => perform(async () => { await onLinkDocument(point, documentId); setDocumentId(""); })}>Bestand koppelen</button>
      </div> : null}

      {attachError ? <div className="ember-points-sheet__error">{attachError}</div> : null}
    </div>
  );
}
