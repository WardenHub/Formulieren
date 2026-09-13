import { useRef, useState } from "react";
import { Camera, MapPin, Plus, Trash2 } from "lucide-react";
import OfflinePinPicker from "./OfflinePinPicker.jsx";

/* Punten die de monteur in het veld zelf ziet.
 *
 * Online kan dat al met de puntensheet in de runner; offline kon het niet, en dan blijft er
 * niets over dan het op een briefje zetten. De server kent deze punten al: ze reizen mee in
 * field_work.manual_points en worden daar per stuk idempotent aangemaakt, met dezelfde
 * functie als de online sheet gebruikt.
 *
 * Bewust dezelfde woorden en dezelfde prioriteiten als online. Iemand die het ene scherm
 * kent, hoeft het andere niet opnieuw te leren.
 */

const PRIORITEITEN = [
  { value: "LOW", label: "Laag" },
  { value: "NORMAL", label: "Normaal" },
  { value: "HIGH", label: "Hoog" },
  { value: "CRITICAL", label: "Kritiek" },
];

function nieuwLokaalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `punt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function OfflineFieldPoints({
  points = [],
  onChange,
  photos = [],
  onAddPhoto,
  onRemovePhoto,
  documents = [],
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [error, setError] = useState("");
  const titleRef = useRef(null);

  const lijst = Array.isArray(points) ? points : [];
  const fotos = Array.isArray(photos) ? photos : [];
  const camerasRef = useRef({});
  const [pinVoorPunt, setPinVoorPunt] = useState(null);

  function fotosVanPunt(localId) {
    return fotos.filter((foto) => foto.point_local_id === localId);
  }

  async function kiesFoto(localId, event) {
    const bestand = event?.target?.files?.[0];
    event.target.value = "";
    if (!bestand) return;

    await onAddPhoto?.(localId, bestand);
  }

  function voegToe() {
    const schoon = title.trim();

    if (!schoon) {
      setError("Geef aan wat er aan de hand is.");
      titleRef.current?.focus();
      return;
    }

    /* Het lokale id wordt hier één keer bedacht en verandert daarna nooit meer. Daarop rust
       de idempotentie aan de serverkant: een tweede poging om terug te sturen maakt hetzelfde
       punt niet nog een keer aan. */
    const punt = {
      local_id: nieuwLokaalId(),
      title: schoon.slice(0, 300),
      description: description.trim() || null,
      priority,
      created_at: new Date().toISOString(),
    };

    onChange?.([...lijst, punt]);

    setTitle("");
    setDescription("");
    setPriority("NORMAL");
    setError("");
    setOpen(false);
  }

  function verwijder(localId) {
    /* Foto's horen bij hun punt; blijft er een los bestand achter, dan staat er straks een
       foto op kantoor zonder te vertellen waar hij over gaat. */
    for (const foto of fotosVanPunt(localId)) onRemovePhoto?.(foto.id);
    onChange?.(lijst.filter((punt) => punt.local_id !== localId));
  }

  return (
    <div className="eo-points">
      {lijst.length ? (
        <ul className="eo-points__list">
          {lijst.map((punt) => (
            <li key={punt.local_id} className="eo-points__item">
              <div className="eo-points__item-text">
                <span className="eo-points__item-title">{punt.title}</span>
                {punt.description ? <span className="eo-points__item-note">{punt.description}</span> : null}
                <span className="eo-points__item-priority">
                  {PRIORITEITEN.find((p) => p.value === punt.priority)?.label || "Normaal"}
                  {punt.pin ? ` ; op ${punt.pin.document_title || "tekening"}` : ""}
                </span>

                {/* Foto's gaan pas mee zodra het punt op kantoor bestaat; tot die tijd staan
                    ze hier, bij het punt waar ze over gaan. */}
                <div className="eo-points__photos">
                  {fotosVanPunt(punt.local_id).map((foto) => (
                    <span key={foto.id} className="eo-points__photo">
                      <span className="eo-points__photo-name">{foto.file_name}</span>
                      <button
                        type="button"
                        className="eo-points__photo-remove"
                        title="Foto verwijderen"
                        disabled={disabled}
                        onClick={() => onRemovePhoto?.(foto.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  ))}

                  {/* De plek op de tekening; hetzelfde idee als "Toon op tekening" online,
                      maar dan andersom, want de pin bestaat pas wanneer het punt bestaat. */}
                  <button
                    type="button"
                    className="eo-points__photo-add"
                    disabled={disabled}
                    onClick={() => setPinVoorPunt(punt.local_id)}
                  >
                    <MapPin size={14} />
                    {punt.pin ? "Plek wijzigen" : "Plek op tekening"}
                  </button>

                  {onAddPhoto ? (
                    <>
                      <button
                        type="button"
                        className="eo-points__photo-add"
                        disabled={disabled}
                        onClick={() => camerasRef.current[punt.local_id]?.click()}
                      >
                        <Camera size={14} />Foto toevoegen
                      </button>
                      <input
                        ref={(element) => {
                          camerasRef.current[punt.local_id] = element;
                        }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        onChange={(event) => kiesFoto(punt.local_id, event)}
                      />
                    </>
                  ) : null}
                </div>
              </div>

              {/* Weghalen kan zolang het werk nog hier staat; na het terugsturen hoort een
                  punt thuis in Ember en niet meer op dit apparaat. */}
              <button
                type="button"
                className="eo-points__remove"
                title="Punt verwijderen"
                disabled={disabled}
                onClick={() => verwijder(punt.local_id)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="eo-muted">Nog geen punten. Zie je iets dat kantoor moet oppakken, zet het hier.</p>
      )}

      {pinVoorPunt ? (
        <OfflinePinPicker
          documents={documents}
          huidigePin={lijst.find((punt) => punt.local_id === pinVoorPunt)?.pin || null}
          onCancel={() => setPinVoorPunt(null)}
          onConfirm={(pin) => {
            onChange?.(lijst.map((punt) => (punt.local_id === pinVoorPunt ? { ...punt, pin } : punt)));
            setPinVoorPunt(null);
          }}
        />
      ) : null}

      {open ? (
        <div className="eo-points__form">
          <label className="eo-points__field">
            <span>Wat is er aan de hand</span>
            <input
              ref={titleRef}
              value={title}
              maxLength={300}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Bijvoorbeeld; melder in ruimte 12 reageert niet"
            />
          </label>

          <label className="eo-points__field">
            <span>Toelichting</span>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optioneel; wat is er precies aan de hand en wat is er nodig."
            />
          </label>

          <label className="eo-points__field">
            <span>Prioriteit</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              {PRIORITEITEN.map((optie) => (
                <option key={optie.value} value={optie.value}>
                  {optie.label}
                </option>
              ))}
            </select>
          </label>

          {error ? <p className="eo-points__error">{error}</p> : null}

          <div className="eo-points__actions">
            <button type="button" className="eo-btn eo-btn--secondary" onClick={() => setOpen(false)}>
              Annuleren
            </button>
            <button type="button" className="eo-btn eo-btn--primary" onClick={voegToe} disabled={disabled}>
              Toevoegen
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="eo-btn eo-btn--secondary eo-points__toggle"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            setTimeout(() => titleRef.current?.focus(), 0);
          }}
        >
          <Plus size={16} />Punt toevoegen
        </button>
      )}
    </div>
  );
}
