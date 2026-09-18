import { useMemo, useState } from "react";

import UserAvatar from "./UserAvatar.jsx";
import { buildInitials } from "../lib/avatar.js";

/* Wanneer, wie, wat. Eén weergave voor de Historie van een formulier en die van een
   installatie, zodat beide schermen hetzelfde lezen.

   Een tabel en geen tekstregels: bij een dossier van jaren zoek je naar een moment of naar
   een persoon, en dan helpt een vaste kolom meer dan een lopende zin. Op een smal scherm
   klapt elke regel om naar een blokje, want drie kolommen naast elkaar passen daar niet.

   De component rekent niets uit; hij toont wat de server aanlevert. Sorteren en begrenzen
   gebeuren daar, zodat de tabel niet iets anders laat zien dan wat er is opgeslagen. */

function formatMoment(value) {
  if (!value) return { date: "-", time: "" };

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: String(value), time: "" };

  return {
    date: new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(parsed),
    time: new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(parsed),
  };
}

function actorLabel(item) {
  const label = String(item?.actor_name || item?.actor_email || "").trim();
  if (label) return label;
  // Een handeling van het systeem heeft geen mens; dat hoort zo te staan en niet als leeg vak.
  return item?.is_system ? "Ember" : "Onbekend";
}

export default function HistoryTable({
  items = [],
  loading = false,
  error = "",
  emptyLabel = "Er is nog niets vastgelegd.",
  sources = [],
  showSystemToggle = false,
  onRefresh = null,
  directoryByUserObjectId = null,
}) {
  const [activeSources, setActiveSources] = useState([]);
  const [showSystem, setShowSystem] = useState(false);

  const zichtbaar = useMemo(() => {
    const lijst = Array.isArray(items) ? items : [];
    return lijst.filter((item) => {
      if (!showSystem && showSystemToggle && item?.is_system) return false;
      if (activeSources.length && !activeSources.includes(String(item?.source || ""))) return false;
      return true;
    });
  }, [items, activeSources, showSystem, showSystemToggle]);

  function toggleSource(key) {
    setActiveSources((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    );
  }

  return (
    <div className="history-table">
      {(sources.length > 0 || showSystemToggle || onRefresh) ? (
        <div className="history-table__controls">
          {sources.map((source) => (
            <button
              key={source.key}
              type="button"
              className={`monitor-tag ${activeSources.length === 0 || activeSources.includes(source.key) ? "monitor-tag--active" : "monitor-tag--muted"}`}
              aria-pressed={activeSources.includes(source.key)}
              title={source.title || `Alleen ${source.label}`}
              onClick={() => toggleSource(source.key)}
            >
              {source.label}
              {typeof source.count === "number" ? ` ${source.count}` : ""}
            </button>
          ))}

          {showSystemToggle ? (
            <button
              type="button"
              className={`monitor-tag ${showSystem ? "monitor-tag--active" : "monitor-tag--muted"}`}
              aria-pressed={showSystem}
              title="Verversingen en andere handelingen van Ember zelf meetonen"
              onClick={() => setShowSystem((current) => !current)}
            >
              Systeemregels
            </button>
          ) : null}

          {onRefresh ? (
            <button type="button" className="btn btn-secondary btn-compact" disabled={loading} onClick={onRefresh}>
              Verversen
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="ember-alert ember-alert--warning">{error}</div> : null}

      {loading && !zichtbaar.length ? (
        <div role="status" className="muted history-table__state">De historie wordt opgehaald.</div>
      ) : null}

      {!loading && !zichtbaar.length && !error ? (
        <div className="muted history-table__state">{emptyLabel}</div>
      ) : null}

      {zichtbaar.length ? (
        <div className="history-table__scroll">
          <table className="history-table__grid">
            <thead>
              <tr>
                <th scope="col">Wanneer</th>
                <th scope="col">Wie</th>
                <th scope="col">Wat</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((item) => {
                const moment = formatMoment(item?.occurred_at);
                const wie = actorLabel(item);
                const entry = directoryByUserObjectId?.get?.(String(item?.actor_user_object_id || "")) || null;

                return (
                  <tr key={item?.id || `${item?.source}-${item?.occurred_at}-${item?.what}`}>
                    <td data-label="Wanneer" className="history-table__when">
                      <span className="history-table__date">{moment.date}</span>
                      {moment.time ? <span className="history-table__time">{moment.time}</span> : null}
                    </td>

                    <td data-label="Wie" className="history-table__who">
                      <UserAvatar
                        path={entry?.avatar_path || null}
                        fallback={buildInitials(wie, item?.actor_email, item?.is_system ? "E" : "?")}
                        alt={wie}
                        className="avatar-badge history-table__avatar"
                      />
                      <span>{wie}</span>
                    </td>

                    <td data-label="Wat" className="history-table__what">
                      <span>{item?.what || item?.event_type || "Onbekende handeling"}</span>
                      {item?.detail_label ? (
                        <span className="history-table__detail">{item.detail_label}</span>
                      ) : null}
                      {item?.source_label ? (
                        <span className="history-table__source">{item.source_label}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
