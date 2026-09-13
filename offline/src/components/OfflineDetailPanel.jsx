import { Globe, PencilLine, Trash2 } from "lucide-react";
import { getOfflineStatusMeta } from "../lib/packageParser.js";
import StatusBadge from "./StatusBadge.jsx";

export default function OfflineDetailPanel({ item, onSetStatus, onDelete, onOpenOnline, onOpenRunner }) {
  if (!item) {
    return <section className="eo-card eo-card--detail"><div className="eo-empty-state"><div className="eo-empty-state__title">Kies een formulier</div><div className="eo-empty-state__copy">Kies links een formulier om het offline in te vullen.</div></div></section>;
  }

  const statusMeta = getOfflineStatusMeta(item.local_status);
  const selectedDocuments = Array.isArray(item?.package_data?.selected_documents) ? item.package_data.selected_documents : [];
  const gekozenBestanden = selectedDocuments.length;
  const bestandenOpApparaat = selectedDocuments.filter((document) => document.has_file).length;

  return (
    <section className="eo-card eo-card--detail eo-detail-simple">
      <div className="eo-card__header eo-card__header--detail">
        <div><div className="eo-detail-title">{item.summary?.title}</div><div className="eo-section-subtitle">{item.summary?.installation_name} ; {item.summary?.installation_code}</div></div>
        <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
      </div>

      <div className="eo-detail-simple__start">
        <button type="button" className="eo-btn eo-btn--primary" onClick={onOpenRunner}><PencilLine size={19} />Formulier invullen</button>
        <div><strong>Direct aan de slag</strong><p>Open het formulier. Je antwoorden worden automatisch lokaal opgeslagen.</p></div>
      </div>

      {/* In het veld is dit de vraag die telt: heb ik de tekening bij me. Er stonden twee
          verschillende aantallen op hetzelfde scherm, hier de bestanden die echt op het
          apparaat staan en in de lijst de bestanden die bij het pakket horen gekozen. Nu
          één zin die allebei benoemt, en die zegt wat het betekent. */}
      <section className="eo-detail-simple__documents">
        <strong>
          {bestandenOpApparaat === gekozenBestanden
            ? `${bestandenOpApparaat} ${bestandenOpApparaat === 1 ? "bestand staat" : "bestanden staan"} op dit apparaat`
            : `${bestandenOpApparaat} van ${gekozenBestanden} bestanden staan op dit apparaat`}
        </strong>
        <span>
          {bestandenOpApparaat === 0
            ? "Zonder internet kun je ze niet openen; haal ze op voordat je vertrekt."
            : "Open ze vanuit het formulier; dat werkt ook zonder internet."}
        </span>
      </section>

      {/* Achter deze uitklap stond de complete statusmachine, met "Gesynchroniseerd" en
          "Conflict" als knop. Wie daarop drukt laat de app iets beweren dat niet waar is.
          Wat er overblijft zijn twee dingen die een monteur echt kan willen: online
          afronden, en een afgerond formulier terugzetten omdat er toch nog iets bij moet. */}
      <details className="eo-advanced-panel">
        <summary>Meer opties</summary>
        <div className="eo-advanced-panel__content">
          <div className="eo-detail-actions">
            <button type="button" className="eo-btn eo-btn--secondary" onClick={() => onOpenOnline(item)}><Globe size={18} />Online afronden</button>

            {item.local_status === "wacht_op_online_afronden" ? (
              <button type="button" className="eo-btn eo-btn--secondary" onClick={() => onSetStatus(item.id, "lokaal_in_bewerking")}>
                <PencilLine size={18} />Toch nog iets aanvullen
              </button>
            ) : null}
          </div>
        </div>
      </details>
      <div className="eo-detail-simple__delete-row"><button type="button" className="eo-btn eo-btn--danger eo-detail-simple__delete" onClick={() => onDelete(item)}><Trash2 size={18} />Verwijderen</button></div>
    </section>
  );
}
