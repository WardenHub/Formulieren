import { Globe, PencilLine, Trash2 } from "lucide-react";
import { getOfflineStatusMeta, statusOptionsForItem } from "../lib/packageParser.js";
import StatusBadge from "./StatusBadge.jsx";

export default function OfflineDetailPanel({ item, onSetStatus, onDelete, onOpenOnline, onOpenRunner }) {
  if (!item) {
    return <section className="eo-card eo-card--detail"><div className="eo-empty-state"><div className="eo-empty-state__title">Kies een formulier</div><div className="eo-empty-state__copy">Kies links een formulier om het offline in te vullen.</div></div></section>;
  }

  const statusMeta = getOfflineStatusMeta(item.local_status);
  const selectedDocuments = Array.isArray(item?.package_data?.selected_documents) ? item.package_data.selected_documents : [];

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

      <section className="eo-detail-simple__documents">
        <strong>{selectedDocuments.filter((document) => document.has_file).length} lokale bestanden</strong>
        <span>Open ze vanuit het formulier.</span>
      </section>

      <details className="eo-advanced-panel">
        <summary>Meer opties voor gevorderde gebruikers</summary>
        <div className="eo-advanced-panel__content">
          <div className="eo-status-options">{statusOptionsForItem(item).map((option) => <button key={option.key} type="button" className={`eo-status-option eo-status-option--${option.tone}${option.current ? " is-current" : ""}`} onClick={() => onSetStatus(item.id, option.key)}>{option.label}</button>)}</div>
          <div className="eo-detail-actions">
            <button type="button" className="eo-btn eo-btn--secondary" onClick={() => onOpenOnline(item)}><Globe size={18} />Online afronden</button>
          </div>
        </div>
      </details>
      <div className="eo-detail-simple__delete-row"><button type="button" className="eo-btn eo-btn--danger eo-detail-simple__delete" onClick={() => onDelete(item)}><Trash2 size={18} />Verwijderen</button></div>
    </section>
  );
}
