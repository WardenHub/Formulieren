// src/pages/Monitor/FormsMonitorPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getFormsMonitorList } from "../../api/emberApi.js";

import { SearchIcon } from "@/components/ui/search";
import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { RefreshCWOffIcon } from "@/components/ui/refresh-cw-off";
import { BadgeAlertIcon } from "@/components/ui/badge-alert";

import {
  OVERVIEW_LS_KEY,
  AUTO_REFRESH_MS,
  STATUS_FILTER_OPTIONS,
  DEFAULT_SELECTED_STATUSES,
  formatDateTime,
  statusLabel,
  getStatusTone,
  getToneClass,
  getCardToneClass,
  getLastModifiedBy,
  compactInstallationLine,
  buildMonitorRowActionCounts,
  buildMonitorVisibleTotals,
  rowHasMonitorActionFilter,
  readStateFromStorage,
  saveStateToStorage,
} from "./formsMonitorShared.jsx";

function getRowFollowUpSummary(row) {
  return row?.follow_up_counts || row?.follow_up_summary || {};
}

function getOpenCount(row) {
  const s = getRowFollowUpSummary(row);
  return Number(s?.open_count ?? 0);
}

function getWaitingCount(row) {
  const s = getRowFollowUpSummary(row);
  return Number(s?.waiting_count ?? 0);
}

function getDoneCount(row) {
  const s = getRowFollowUpSummary(row);
  const explicitDone = s?.done_count;
  if (explicitDone != null) return Number(explicitDone || 0);

  const terminal = Number(s?.terminal_count ?? 0);
  return terminal;
}

function getRemainingOpenActionCount(row) {
  return getOpenCount(row) + getWaitingCount(row);
}

function hasNoRemainingOpenActionPoints(row) {
  const status = String(row?.status || "").trim();
  return (
    (status === "INGEDIEND" || status === "IN_BEHANDELING") &&
    getRemainingOpenActionCount(row) === 0
  );
}

function getMonitorRowSurfaceClass(row) {
  if (hasNoRemainingOpenActionPoints(row)) {
    return "monitor-surface monitor-surface--ready";
  }
  return getCardToneClass(row?.status);
}

function getOverviewStatusChipClass(status, active) {
  if (!active) return "monitor-tag monitor-tag--muted";

  const st = String(status || "").trim().toUpperCase();

  if (st === "CONCEPT") return "monitor-tag monitor-tag--warning";
  if (st === "INGEDIEND") return "monitor-tag monitor-tag--active";
  if (st === "IN_BEHANDELING") return "monitor-tag monitor-tag--warning";
  if (st === "INGETROKKEN") return "monitor-tag monitor-tag--danger";
  if (st === "AFGEHANDELD") return "monitor-tag monitor-tag--success";

  return getToneClass(getStatusTone(status));
}

function StatusTag({ status }) {
  return (
    <span className={getToneClass(getStatusTone(status))}>
      {statusLabel(status)}
    </span>
  );
}

function SummaryTag({
  children,
  title,
  tone = "default",
  active = false,
  onClick = null,
}) {
  let cls = "monitor-tag monitor-tag--neutral";

  if (tone === "active") cls = "monitor-tag monitor-tag--active";
  if (tone === "warning") cls = "monitor-tag monitor-tag--warning";
  if (tone === "success") cls = "monitor-tag monitor-tag--success";
  if (tone === "danger") cls = "monitor-tag monitor-tag--danger";
  if (tone === "muted" || tone === "subtle") cls = "monitor-tag monitor-tag--muted";
  if (tone === "ready") cls = "monitor-tag monitor-tag--ready";

  if (active) cls = `${cls} monitor-tag--selected`;

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        title={title}
        onClick={onClick}
        style={{ cursor: "pointer" }}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

function FilterChip({ active, label, title, onClick }) {
  return (
    <button
      type="button"
      className={active ? "monitor-tag monitor-tag--active" : "monitor-tag monitor-tag--muted"}
      title={title}
      onClick={onClick}
      style={{ cursor: "pointer", opacity: active ? 1 : 0.9 }}
    >
      {label}
    </button>
  );
}

function StatusFilterChip({ status, active, onClick }) {
  const cls = getOverviewStatusChipClass(status, active);
  const finalCls = active ? `${cls} monitor-tag--selected` : cls;

  return (
    <button
      type="button"
      title={statusLabel(status)}
      onClick={onClick}
      className={finalCls}
      style={{ cursor: "pointer", opacity: active ? 1 : 0.88 }}
    >
      {statusLabel(status)}
    </button>
  );
}

function FilterGroup({ label, children, minWidth = 0, grow = false }) {
  return (
    <div
      style={{
        minWidth,
        flex: grow ? "1 1 360px" : "0 1 auto",
        display: "grid",
        gap: 8,
        padding: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}

export default function FormsMonitorPage() {
  const storedState = useMemo(() => readStateFromStorage(OVERVIEW_LS_KEY), []);
  const navigate = useNavigate();

  const searchIconRef = useRef(null);
  const refreshIconRef = useRef(null);
  const refreshOffIconRef = useRef(null);
  const openIconRefById = useRef({});
  const infoIconRef = useRef(null);
  const infoBtnRef = useRef(null);
  const infoPopupRef = useRef(null);

  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoPopupStyle, setInfoPopupStyle] = useState(null);

  const [filters, setFilters] = useState({
    q: storedState?.filters?.q ?? "",
    mine: storedState?.filters?.mine ?? true,
    onlyActionable: storedState?.filters?.onlyActionable ?? false,
    noRemainingOpenActionPoints: storedState?.filters?.noRemainingOpenActionPoints ?? false,
    selectedStatuses:
      Array.isArray(storedState?.filters?.selectedStatuses)
        ? storedState.filters.selectedStatuses
        : DEFAULT_SELECTED_STATUSES,
    actionStatusFilter: storedState?.filters?.actionStatusFilter ?? "ALL",
    take: 200,
    skip: 0,
  });

  const [items, setItems] = useState([]);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    storedState?.autoRefreshEnabled ?? false
  );

  const effectiveSelectedStatuses = useMemo(() => {
    if (Array.isArray(filters.selectedStatuses) && filters.selectedStatuses.length > 0) {
      return filters.selectedStatuses;
    }
    return STATUS_FILTER_OPTIONS.map((opt) => opt.key);
  }, [filters.selectedStatuses]);

  const visibleItems = useMemo(() => {
    const selectedStatusesSet = new Set(effectiveSelectedStatuses || []);

    return (items || [])
      .filter((x) => selectedStatusesSet.has(x.status))
      .filter((x) => {
        if (!filters.noRemainingOpenActionPoints) return true;
        return hasNoRemainingOpenActionPoints(x);
      })
      .filter((x) => {
        if (!filters.onlyActionable) return true;
        return getRemainingOpenActionCount(x) > 0;
      })
      .filter((x) => {
        if (!filters.actionStatusFilter || filters.actionStatusFilter === "ALL") return true;

        if (filters.actionStatusFilter === "OPEN") {
          return getRemainingOpenActionCount(x) > 0;
        }

        return rowHasMonitorActionFilter(x, filters.actionStatusFilter);
      });
  }, [items, filters, effectiveSelectedStatuses]);

  const visibleTotals = useMemo(() => {
    const base = buildMonitorVisibleTotals(visibleItems);
    const fallback = visibleItems.reduce(
      (acc, row) => {
        acc.open += getOpenCount(row);
        acc.waiting += getWaitingCount(row);
        acc.done += getDoneCount(row);
        return acc;
      },
      { open: 0, waiting: 0, done: 0 }
    );

    return {
      open: Number(base?.open ?? fallback.open),
      waiting: Number(base?.waiting ?? fallback.waiting),
      done: Number(base?.done ?? fallback.done),
    };
  }, [visibleItems]);

  useEffect(() => {
    saveStateToStorage(OVERVIEW_LS_KEY, {
      filters,
      autoRefreshEnabled,
    });
  }, [filters, autoRefreshEnabled]);

  useEffect(() => {
    function onDocMouseDown(e) {
      const btn = infoBtnRef.current;
      const popup = infoPopupRef.current;

      if (btn?.contains(e.target)) return;
      if (popup?.contains(e.target)) return;

      setInfoOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") setInfoOpen(false);
    }

    if (infoOpen) {
      document.addEventListener("mousedown", onDocMouseDown);
      document.addEventListener("keydown", onKeyDown);

      return () => {
        document.removeEventListener("mousedown", onDocMouseDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }
  }, [infoOpen]);

  function toggleStatusFilter(statusKey) {
    setFilters((prev) => {
      const current = new Set(prev.selectedStatuses || []);
      if (current.has(statusKey)) current.delete(statusKey);
      else current.add(statusKey);

      return {
        ...prev,
        selectedStatuses: Array.from(current),
      };
    });
  }

  async function loadList(nextFilters = filters) {
    setListLoading(true);
    setError(null);

    try {
      const res = await getFormsMonitorList({
        q: nextFilters.q,
        mine: nextFilters.mine,
        onlyActionable: nextFilters.onlyActionable,
        includeWithdrawn: true,
        take: nextFilters.take,
        skip: nextFilters.skip,
      });

      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setError(e?.message || String(e));
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      loadList();
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.q,
    filters.mine,
    filters.onlyActionable,
    filters.noRemainingOpenActionPoints,
    filters.selectedStatuses,
    filters.actionStatusFilter,
    autoRefreshEnabled,
  ]);

  async function applySearch() {
    await loadList();
  }

  function clearSearch() {
    setFilters((prev) => ({ ...prev, q: "" }));
  }

  function openRow(row) {
    navigate(`/monitor/formulieren/${row.form_instance_id}`);
  }

  async function toggleMine() {
    const next = {
      ...filters,
      mine: !filters.mine,
    };
    setFilters(next);
    await loadList(next);
  }

  async function toggleOnlyActionable() {
    const next = {
      ...filters,
      onlyActionable: !filters.onlyActionable,
      noRemainingOpenActionPoints: false,
    };
    setFilters(next);
    await loadList(next);
  }

  async function toggleNoRemainingOpenActionPoints() {
    const next = {
      ...filters,
      noRemainingOpenActionPoints: !filters.noRemainingOpenActionPoints,
      mine: false,
      onlyActionable: false,
    };
    setFilters(next);
    await loadList(next);
  }

  function setActionStatusFilter(nextKey) {
    setFilters((prev) => ({
      ...prev,
      actionStatusFilter: prev.actionStatusFilter === nextKey ? "ALL" : nextKey,
    }));
  }

  function toggleInfoPopup() {
    if (infoOpen) {
      setInfoOpen(false);
      return;
    }

    const btn = infoBtnRef.current;
    if (!btn) {
      setInfoOpen(true);
      setInfoPopupStyle(null);
      return;
    }

    const rect = btn.getBoundingClientRect();
    const popupWidth = 420;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - popupWidth - 12));

    setInfoPopupStyle({
      position: "fixed",
      top: Math.round(rect.bottom + 8),
      left,
      width: popupWidth,
      zIndex: 120,
    });
    setInfoOpen(true);
  }

  return (
    <div>
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Monitor formulieren</h1>
              <div className="muted" style={{ fontSize: 13 }}>
                Overzicht formulieren
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="icon-btn"
              title={autoRefreshEnabled ? "Auto-refresh staat aan" : "Auto-refresh staat uit"}
              onClick={() => setAutoRefreshEnabled((prev) => !prev)}
              onMouseEnter={() => {
                if (autoRefreshEnabled) refreshIconRef.current?.startAnimation?.();
                else refreshOffIconRef.current?.startAnimation?.();
              }}
              onMouseLeave={() => {
                if (autoRefreshEnabled) refreshIconRef.current?.stopAnimation?.();
                else refreshOffIconRef.current?.stopAnimation?.();
              }}
            >
              {autoRefreshEnabled ? (
                <RefreshCWIcon ref={refreshIconRef} size={18} className="nav-anim-icon" />
              ) : (
                <RefreshCWOffIcon ref={refreshOffIconRef} size={18} className="nav-anim-icon" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="inst-body" style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            padding: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "stretch",
                flexWrap: "wrap",
              }}
            >
              <FilterGroup label="Weergave" minWidth={240}>
                <FilterChip
                  active={Boolean(filters.mine)}
                  label="Alleen eigen formulieren"
                  title="Toon alleen formulieren van de huidige gebruiker"
                  onClick={toggleMine}
                />
              </FilterGroup>

              <FilterGroup label="Slimme filters" minWidth={360}>
                <FilterChip
                  active={Boolean(filters.onlyActionable)}
                  label="Open actiepunten"
                  title="Toon alleen formulieren met openstaande actiepunten; inclusief wachten op derden"
                  onClick={toggleOnlyActionable}
                />

                <FilterChip
                  active={Boolean(filters.noRemainingOpenActionPoints)}
                  label="Geen resterende openstaande actiepunten"
                  title="Formulieren zonder open of wachtende actiepunten"
                  onClick={toggleNoRemainingOpenActionPoints}
                />
              </FilterGroup>

              <FilterGroup label="Status" minWidth={360} grow>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <StatusFilterChip
                    key={opt.key}
                    status={opt.key}
                    active={effectiveSelectedStatuses.includes(opt.key)}
                    onClick={() => toggleStatusFilter(opt.key)}
                  />
                ))}
              </FilterGroup>
            </div>

            <div className="searchbar">
              <SearchIcon size={18} className="nav-anim-icon" />
              <input
                className="searchbar-input"
                placeholder="Zoek op installatie, object, relatie, formulier, invuller of opmerking"
                value={filters.q}
                onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={applySearch}
                onMouseEnter={() => searchIconRef.current?.startAnimation?.()}
                onMouseLeave={() => searchIconRef.current?.stopAnimation?.()}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <SearchIcon ref={searchIconRef} size={18} />
                Zoeken
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => loadList()}
                onMouseEnter={() => refreshIconRef.current?.startAnimation?.()}
                onMouseLeave={() => refreshIconRef.current?.stopAnimation?.()}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <RefreshCWIcon ref={refreshIconRef} size={18} />
                Verversen
              </button>

              {filters.q ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={clearSearch}
                >
                  Zoektekst wissen
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {error && <div style={{ color: "salmon" }}>{error}</div>}

        <div
          style={{
            padding: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600 }}>Formulierafhandelingen</div>

              <button
                ref={infoBtnRef}
                type="button"
                className="icon-btn"
                title="Klik op de statuslabels om de zichtbare formulieren te filteren op actiepuntstatus."
                onClick={toggleInfoPopup}
                onMouseEnter={() => infoIconRef.current?.startAnimation?.()}
                onMouseLeave={() => infoIconRef.current?.stopAnimation?.()}
              >
                <BadgeAlertIcon ref={infoIconRef} size={18} className="nav-anim-icon" />
              </button>
            </div>

            <div className="muted" style={{ fontSize: 12 }}>
              {listLoading ? "laden..." : `${visibleItems.length} dossier(s) zichtbaar`}
            </div>
          </div>

          {!listLoading && visibleItems.length > 0 && (
            <div className="monitor-inline-totals monitor-inline-totals--prominent">
              <SummaryTag
                title="Toon formulieren met openstaande actiepunten; inclusief wachten op derden"
                tone="active"
                active={filters.actionStatusFilter === "OPEN"}
                onClick={() => setActionStatusFilter("OPEN")}
              >
                Open {visibleTotals.open + visibleTotals.waiting}
              </SummaryTag>

              <SummaryTag
                title="Toon formulieren met actiepunten die wachten op derden"
                tone="warning"
                active={filters.actionStatusFilter === "WACHTENOPDERDEN"}
                onClick={() => setActionStatusFilter("WACHTENOPDERDEN")}
              >
                Wachten op derden {visibleTotals.waiting}
              </SummaryTag>

              <SummaryTag
                title="Toon formulieren met afgehandelde actiepunten"
                tone="success"
                active={filters.actionStatusFilter === "DONE"}
                onClick={() => setActionStatusFilter("DONE")}
              >
                Afgehandeld {visibleTotals.done}
              </SummaryTag>
            </div>
          )}

          {infoOpen && infoPopupStyle && (
            <div
              ref={infoPopupRef}
              className="monitor-info-popup"
              style={infoPopupStyle}
            >
              Klik op een statuslabel om de zichtbare formulierafhandelingen te filteren op die actiepuntstatus. Klik nogmaals op hetzelfde label om die filter weer uit te zetten.
            </div>
          )}

          {listLoading ? (
            <div className="muted">laden; monitorlijst</div>
          ) : visibleItems.length === 0 ? (
            <div className="muted">Geen formulieren gevonden.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {visibleItems.map((row) => {
                const iconRef =
                  openIconRefById.current[row.form_instance_id] ||
                  (openIconRefById.current[row.form_instance_id] = { current: null });

                const actionCountsRaw = buildMonitorRowActionCounts(row);
                const actionCounts = {
                  open:
                    Number(actionCountsRaw?.open ?? getOpenCount(row)),
                  waiting:
                    Number(actionCountsRaw?.waiting ?? getWaitingCount(row)),
                  done:
                    Number(actionCountsRaw?.done ?? getDoneCount(row)),
                };

                const isReady = hasNoRemainingOpenActionPoints(row);

                return (
                  <button
                    key={row.form_instance_id}
                    type="button"
                    className={`${getMonitorRowSurfaceClass(row)} monitor-dossier-row monitor-dossier-row--compact monitor-dossier-row--button`}
                    onClick={() => openRow(row)}
                    title="Open formulierafhandeling"
                  >
                    <div className="monitor-dossier-row__main">
                      <div className="monitor-dossier-row__title-row">
                        <div className="monitor-dossier-row__title">
                          {row.form_name || row.form_code || `Formulier ${row.form_instance_id}`}
                        </div>

                        <div className="monitor-dossier-row__title-tags">
                          <SummaryTag title="Documentnummer" tone="muted">
                            {row.form_instance_id ?? "-"}
                          </SummaryTag>

                          <SummaryTag title="Formulierversie" tone="muted">
                            v{row.version_label || "-"}
                          </SummaryTag>

                          {row.parent_instance_id ? (
                            <button
                              type="button"
                              className="monitor-tag monitor-tag--active monitor-link-tag"
                              title="Open parent formulier"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/monitor/formulieren/${row.parent_instance_id}`);
                              }}
                            >
                              vervolg op formulier #{row.parent_instance_id}
                            </button>
                          ) : null}

                          {isReady ? (
                            <SummaryTag title="Geen resterende openstaande actiepunten" tone="ready">
                              geen openstaande actiepunten
                            </SummaryTag>
                          ) : null}
                        </div>
                      </div>

                      <div className="monitor-dossier-row__sub">
                        {compactInstallationLine(row) || "-"}
                      </div>

                      {row.instance_title ? (
                        <div className="monitor-dossier-row__meta">
                          {row.instance_title}
                        </div>
                      ) : null}

                      <div className="monitor-inline-totals">
                        <SummaryTag title="Aantal openstaande actiepunten; inclusief wachten op derden" tone="active">
                          Open {actionCounts.open + actionCounts.waiting}
                        </SummaryTag>

                        <SummaryTag title="Aantal wacht op derden" tone="warning">
                          Wachten op derden {actionCounts.waiting}
                        </SummaryTag>

                        <SummaryTag title="Aantal afgehandelde actiepunten" tone="success">
                          Afgehandeld {actionCounts.done}
                        </SummaryTag>
                      </div>
                    </div>

                    <div className="monitor-dossier-row__side">
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <StatusTag status={row.status} />
                      </div>

                      <div className="monitor-dossier-row__audit">
                        <div>
                          Laatste wijziging: {formatDateTime(row.updated_at || row.created_at)}
                        </div>
                        <div>
                          Laatst gewijzigd door: {getLastModifiedBy(row)}
                        </div>
                      </div>

                      <div
                        className="monitor-open-action"
                        onMouseEnter={() => iconRef.current?.startAnimation?.()}
                        onMouseLeave={() => iconRef.current?.stopAnimation?.()}
                      >
                        <span>Open formulierafhandeling</span>
                        <ArrowBigRightIcon ref={iconRef} size={18} className="nav-anim-icon" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}