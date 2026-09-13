import clsx from "clsx";
import { ArrowRight, FileClock, Files, Search, ShieldCheck, Trash2 } from "lucide-react";
import { getOfflineStatusMeta } from "../lib/packageParser.js";
import StatusBadge from "./StatusBadge.jsx";

function formatDateTime(value) {
  if (!value) return "nog niet opgeslagen";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function OfflineWorklist({
  items,
  totalItems,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  onClearAll,
}) {
  return (
    <section className="eo-card">
      <div className="eo-card__header">
        <div>
          <div className="eo-section-title">Offline werkvoorraad</div>
          <div className="eo-section-subtitle">Formulieren die lokaal klaarstaan of al deels offline zijn ingevuld.</div>
        </div>
        <StatusBadge label={`${items.length} van ${totalItems} formulier(en)`} tone="neutral" />
      </div>

      <div className="eo-worklist-toolbar">
        <label className="eo-search-field">
          <Search size={16} />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Zoek op installatie, formulier of code"
          />
        </label>
      </div>

      {items.length === 0 ? (
        <div className="eo-empty-state">
          <FileClock size={28} />
          <div className="eo-empty-state__title">
            {totalItems === 0 ? "Nog geen offline formulieren" : "Geen formulieren voor deze filter"}
          </div>
          <div className="eo-empty-state__copy">
            {totalItems === 0
              ? "Importeer eerst een formulier vanuit Ember; daarna verschijnt het hier in de werkvoorraad."
              : "Pas zoektekst of statusfilter aan; dan tonen we hier weer formulieren."}
          </div>
        </div>
      ) : (
        <div className="eo-worklist">
          {items.map((item) => {
            const statusMeta = getOfflineStatusMeta(item?.local_status);
            return (
              <button
                key={item.id}
                type="button"
                className={clsx("eo-worklist-item", item.id === selectedId && "eo-worklist-item--selected")}
                onClick={() => onSelect(item.id)}
              >
                <div className="eo-worklist-item__header">
                  <div className="eo-worklist-item__title">{item.summary?.title}</div>
                  <ArrowRight size={18} />
                </div>
                <div className="eo-worklist-item__meta">
                  <span>{item.summary?.installation_code}</span>
                  <span>{item.summary?.installation_name}</span>
                </div>
                <div className="eo-worklist-item__row">
                  <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                  <StatusBadge label={`#${item.summary?.form_instance_id}`} tone="neutral" compact />
                  {item.summary?.bedrijf_unit ? (
                    <StatusBadge label={item.summary.bedrijf_unit} tone="neutral" compact />
                  ) : null}
                </div>
                <div className="eo-worklist-item__row eo-worklist-item__row--soft">
                  <span className="eo-inline-icon">
                    <Files size={14} />
                    {item.summary?.selected_document_count || 0} bestanden gekozen
                  </span>
                  <span className="eo-inline-icon">
                    <ShieldCheck size={14} />
                    laatste lokale wijziging; {formatDateTime(item.local_updated_at)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {onClearAll ? <div className="eo-worklist__footer"><button type="button" className="eo-btn eo-btn--ghost eo-worklist-toolbar__clear" onClick={onClearAll}><Trash2 size={16} />Alle werkvoorraad wissen</button></div> : null}
    </section>
  );
}
