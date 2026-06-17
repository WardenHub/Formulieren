// src/pages/Monitor/FormsMonitorPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getFormsMonitorList } from "../../api/emberApi.js";
import { getUserDirectory } from "../../api/emberApi.js";

import { SearchIcon } from "@/components/ui/search";
import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { RefreshCWOffIcon } from "@/components/ui/refresh-cw-off";
import { BadgeAlertIcon } from "@/components/ui/badge-alert";

import {
  OVERVIEW_LS_KEY,
  AUTO_REFRESH_MS,
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

const STATUS_GROUP_OPTIONS = [
  { key: "TODO", label: "Nog te verwerken", statuses: ["INGEDIEND", "IN_BEHANDELING"] },
  { key: "CONCEPT", label: "Concept", statuses: ["CONCEPT"] },
  { key: "INGETROKKEN", label: "Ingetrokken", statuses: ["INGETROKKEN"] },
  { key: "AFGEHANDELD", label: "Definitief", statuses: ["AFGEHANDELD"] },
];

const DEFAULT_SELECTED_STATUS_GROUPS = ["TODO"];

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

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
  return Number(s?.terminal_count ?? 0);
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
  if (hasNoRemainingOpenActionPoints(row)) return "monitor-surface monitor-surface--ready";
  return getCardToneClass(row?.status);
}

function getStatusGroupChipClass(groupKey, active) {
  if (!active) return "monitor-tag monitor-tag--muted";
  if (groupKey === "TODO") return "monitor-tag monitor-tag--active";
  if (groupKey === "CONCEPT") return "monitor-tag monitor-tag--warning";
  if (groupKey === "INGETROKKEN") return "monitor-tag monitor-tag--danger";
  if (groupKey === "AFGEHANDELD") return "monitor-tag monitor-tag--success";
  return "monitor-tag monitor-tag--neutral";
}

function buildTeamsChatUrl(email, formInstanceId) {
  const cleanEmail = String(email || "").trim();
  if (!cleanEmail) return null;
  const monitorUrl = `${window.location.origin}/monitor/formulieren/${encodeURIComponent(formInstanceId)}`;
  const message =
    `Hallo; ik wil het hebben over formulier ${formInstanceId}.\n\n${monitorUrl}`;
  const topic = `Formulier ${formInstanceId}`;
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(cleanEmail)}&topicname=${encodeURIComponent(topic)}&message=${encodeURIComponent(message)}`;
}

function buildEffectiveStatuses(selectedGroupKeys) {
  const keys = Array.isArray(selectedGroupKeys) ? selectedGroupKeys : [];
  if (keys.length === 0) return STATUS_GROUP_OPTIONS.flatMap((opt) => opt.statuses);

  const set = new Set();
  for (const key of keys) {
    const group = STATUS_GROUP_OPTIONS.find((opt) => opt.key === key);
    for (const status of group?.statuses || []) set.add(status);
  }

  return Array.from(set);
}

function StatusTag({ status }) {
  return <span className={getToneClass(getStatusTone(status))}>{statusLabel(status)}</span>;
}

function SummaryTag({ children, title, tone = "default", active = false, onClick = null }) {
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
      <button type="button" className={cls} title={title} onClick={onClick}>
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
      className={active ? "monitor-tag monitor-tag--active monitor-tag--selected" : "monitor-tag monitor-tag--muted"}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function StatusGroupFilterChip({ option, active, onClick }) {
  const cls = getStatusGroupChipClass(option.key, active);

  return (
    <button
      type="button"
      title={option.label}
      onClick={onClick}
      className={active ? `${cls} monitor-tag--selected` : cls}
    >
      {option.label}
    </button>
  );
}

function FilterGroup({ label, children, extra = null, className = "" }) {
  return (
    <section className={cx("monitor-filter-group", className)}>
      <div className="monitor-filter-group__head">
        <div className="monitor-filter-group__label">{label}</div>
        {extra}
      </div>

      <div className="monitor-filter-group__chips">{children}</div>
    </section>
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
  const statusInfoIconRef = useRef(null);
  const statusInfoBtnRef = useRef(null);
  const statusInfoPopupRef = useRef(null);

  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoPopupStyle, setInfoPopupStyle] = useState(null);
  const [statusInfoOpen, setStatusInfoOpen] = useState(false);
  const [statusInfoPopupStyle, setStatusInfoPopupStyle] = useState(null);

  const [filters, setFilters] = useState({
    q: storedState?.filters?.q ?? "",
    mine: storedState?.filters?.mine ?? true,
    assignedUserObjectId: storedState?.filters?.assignedUserObjectId ?? "",
    assignedSearch: storedState?.filters?.assignedSearch ?? "",
    unassignedOnly: storedState?.filters?.unassignedOnly ?? false,
    onlyActionable: storedState?.filters?.onlyActionable ?? false,
    noRemainingOpenActionPoints: storedState?.filters?.noRemainingOpenActionPoints ?? false,
    selectedStatusGroups: Array.isArray(storedState?.filters?.selectedStatusGroups)
      ? storedState.filters.selectedStatusGroups
      : Array.isArray(storedState?.filters?.selectedStatuses) && storedState.filters.selectedStatuses.length > 0
        ? ["TODO"]
        : DEFAULT_SELECTED_STATUS_GROUPS,
    actionStatusFilter: storedState?.filters?.actionStatusFilter ?? "ALL",
    take: 200,
    skip: 0,
  });

  const [items, setItems] = useState([]);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(storedState?.autoRefreshEnabled ?? false);
  const [directoryItems, setDirectoryItems] = useState([]);
  const [viewerUserObjectId, setViewerUserObjectId] = useState(null);

  const effectiveSelectedStatuses = useMemo(() => {
    return buildEffectiveStatuses(filters.selectedStatusGroups);
  }, [filters.selectedStatusGroups]);

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
        if (filters.actionStatusFilter === "OPEN") return getRemainingOpenActionCount(x) > 0;
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
    saveStateToStorage(OVERVIEW_LS_KEY, { filters, autoRefreshEnabled });
  }, [filters, autoRefreshEnabled]);

  useEffect(() => {
    function onDocMouseDown(e) {
      const btn = infoBtnRef.current;
      const popup = infoPopupRef.current;
      const statusBtn = statusInfoBtnRef.current;
      const statusPopup = statusInfoPopupRef.current;

      if (btn?.contains(e.target)) return;
      if (popup?.contains(e.target)) return;
      if (statusBtn?.contains(e.target)) return;
      if (statusPopup?.contains(e.target)) return;

      setInfoOpen(false);
      setStatusInfoOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setInfoOpen(false);
        setStatusInfoOpen(false);
      }
    }

    if (!infoOpen && !statusInfoOpen) return undefined;

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [infoOpen, statusInfoOpen]);

  function toggleStatusGroup(groupKey) {
    setFilters((prev) => {
      const current = new Set(prev.selectedStatusGroups || []);
      if (current.has(groupKey)) current.delete(groupKey);
      else current.add(groupKey);

      return {
        ...prev,
        selectedStatusGroups: Array.from(current),
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
        assignedUserObjectId: nextFilters.assignedUserObjectId,
        assignedSearch: nextFilters.assignedSearch,
        unassignedOnly: nextFilters.unassignedOnly,
        onlyActionable: nextFilters.onlyActionable,
        includeWithdrawn: true,
        take: nextFilters.take,
        skip: nextFilters.skip,
      });

      setItems(Array.isArray(res?.items) ? res.items : []);
      setViewerUserObjectId(String(res?.meta?.viewer?.user_object_id || "").trim() || null);
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
    let cancelled = false;

    getUserDirectory()
      .then((res) => {
        if (cancelled) return;
        setDirectoryItems(Array.isArray(res?.items) ? res.items : []);
      })
      .catch(() => {
        if (cancelled) return;
        setDirectoryItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return undefined;

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      loadList();
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.q,
    filters.mine,
    filters.assignedUserObjectId,
    filters.assignedSearch,
    filters.unassignedOnly,
    filters.onlyActionable,
    filters.noRemainingOpenActionPoints,
    filters.selectedStatusGroups,
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
    const next = { ...filters, mine: !filters.mine };
    setFilters(next);
    await loadList(next);
  }

  async function toggleMyAssignments() {
    if (!viewerUserObjectId) return;
    const nextAssignedUserObjectId =
      filters.assignedUserObjectId === viewerUserObjectId ? "" : viewerUserObjectId;
    const next = {
      ...filters,
      assignedUserObjectId: nextAssignedUserObjectId,
      unassignedOnly: false,
    };
    setFilters(next);
    await loadList(next);
  }

  async function toggleUnassignedOnly() {
    const next = {
      ...filters,
      unassignedOnly: !filters.unassignedOnly,
      assignedUserObjectId: "",
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

  async function applyAssignedUserSelection(userObjectId) {
    const next = {
      ...filters,
      assignedUserObjectId: String(userObjectId || "").trim(),
      unassignedOnly: false,
    };
    setFilters(next);
    await loadList(next);
  }

  function openPopupNearButton(buttonEl, setStyle, width = 420) {
    if (!buttonEl) {
      setStyle(null);
      return;
    }

    const rect = buttonEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const popupWidth = Math.min(width, viewportWidth - 24);
    const left = Math.max(12, Math.min(rect.left, viewportWidth - popupWidth - 12));

    setStyle({
      position: "fixed",
      top: Math.round(rect.bottom + 8),
      left,
      width: popupWidth,
      maxWidth: "calc(100vw - 24px)",
      zIndex: 120,
    });
  }

  function toggleInfoPopup() {
    if (infoOpen) {
      setInfoOpen(false);
      return;
    }

    openPopupNearButton(infoBtnRef.current, setInfoPopupStyle, 420);
    setInfoOpen(true);
  }

  function toggleStatusInfoPopup() {
    if (statusInfoOpen) {
      setStatusInfoOpen(false);
      return;
    }

    openPopupNearButton(statusInfoBtnRef.current, setStatusInfoPopupStyle, 460);
    setStatusInfoOpen(true);
  }

  return (
    <div className="monitor-page">
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Monitor formulieren</h1>
              <div className="ember-page-subtitle">Overzicht formulieren</div>
            </div>
          </div>

          <div className="ember-toolbar">
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

      <div className="inst-body monitor-page__body">
        <section className="card monitor-filter-panel">
          <div className="monitor-filter-grid">
            <FilterGroup label="Weergave">
              <FilterChip
                active={Boolean(filters.mine)}
                label="Alleen eigen formulieren"
                title="Toon alleen formulieren van de huidige gebruiker"
                onClick={toggleMine}
              />
            </FilterGroup>

            <FilterGroup label="Toegewezen aan">
              {viewerUserObjectId ? (
                <FilterChip
                  active={filters.assignedUserObjectId === viewerUserObjectId}
                  label="Mijn toewijzingen"
                  title="Toon formulieren die aan jou zijn toegewezen"
                  onClick={toggleMyAssignments}
                />
              ) : null}

              <FilterChip
                active={Boolean(filters.unassignedOnly)}
                label="Niet toegewezen"
                title="Toon alleen formulieren zonder toegewezen behandelaar"
                onClick={toggleUnassignedOnly}
              />

              <input
                className="input"
                list="forms-monitor-assignees"
                placeholder="Zoek toegewezen collega"
                value={filters.assignedSearch}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    assignedSearch: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const hit = directoryItems.find((item) => {
                    const label = String(
                      item?.effective_display_name ||
                      item?.preferred_display_name ||
                      item?.display_name_snapshot ||
                      item?.email_snapshot ||
                      ""
                    ).trim();
                    return label === String(filters.assignedSearch || "").trim();
                  });
                  applyAssignedUserSelection(hit?.user_object_id || "");
                }}
                style={{ minWidth: 220 }}
              />
              <datalist id="forms-monitor-assignees">
                {directoryItems.map((item) => {
                  const label = String(
                    item?.effective_display_name ||
                    item?.preferred_display_name ||
                    item?.display_name_snapshot ||
                    item?.email_snapshot ||
                    ""
                  ).trim();
                  if (!label) return null;
                  return <option key={item.user_object_id || label} value={label} />;
                })}
              </datalist>
            </FilterGroup>

            <FilterGroup label="Slimme filters">
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

            <FilterGroup
              label="Status"
              className="monitor-filter-group--status"
              extra={
                <button
                  ref={statusInfoBtnRef}
                  type="button"
                  className="icon-btn monitor-filter-info-btn"
                  title="Uitleg statusverloop"
                  onClick={toggleStatusInfoPopup}
                  onMouseEnter={() => statusInfoIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => statusInfoIconRef.current?.stopAnimation?.()}
                >
                  <BadgeAlertIcon ref={statusInfoIconRef} size={18} className="nav-anim-icon" />
                </button>
              }
            >
              {STATUS_GROUP_OPTIONS.map((opt) => (
                <StatusGroupFilterChip
                  key={opt.key}
                  option={opt}
                  active={(filters.selectedStatusGroups || []).includes(opt.key)}
                  onClick={() => toggleStatusGroup(opt.key)}
                />
              ))}
            </FilterGroup>
          </div>

          <div className="monitor-search-row">
            <div
              className="searchbar monitor-searchbar"
              onMouseEnter={() => searchIconRef.current?.startAnimation?.()}
              onMouseLeave={() => searchIconRef.current?.stopAnimation?.()}
            >
              <SearchIcon ref={searchIconRef} size={18} className="nav-anim-icon" />
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

            <div className="monitor-search-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={applySearch}
                onMouseEnter={() => searchIconRef.current?.startAnimation?.()}
                onMouseLeave={() => searchIconRef.current?.stopAnimation?.()}
              >
                <SearchIcon size={18} />
                Zoeken
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => loadList()}
                onMouseEnter={() => refreshIconRef.current?.startAnimation?.()}
                onMouseLeave={() => refreshIconRef.current?.stopAnimation?.()}
              >
                <RefreshCWIcon ref={refreshIconRef} size={18} />
                Verversen
              </button>

              {filters.q ? (
                <button type="button" className="btn btn-secondary" onClick={clearSearch}>
                  Zoektekst wissen
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {error ? <div className="ember-error-text">{error}</div> : null}

        <section className="card monitor-results-panel">
          <div className="monitor-results-head">
            <div className="monitor-results-title-row">
              <div className="monitor-results-title">Formulierafhandelingen</div>

              <button
                ref={infoBtnRef}
                type="button"
                className="icon-btn monitor-filter-info-btn"
                title="Klik op de statuslabels om de zichtbare formulieren te filteren op actiepuntstatus."
                onClick={toggleInfoPopup}
                onMouseEnter={() => infoIconRef.current?.startAnimation?.()}
                onMouseLeave={() => infoIconRef.current?.stopAnimation?.()}
              >
                <BadgeAlertIcon ref={infoIconRef} size={18} className="nav-anim-icon" />
              </button>
            </div>

            <div className="ember-page-subtitle">
              {listLoading ? "laden..." : `${visibleItems.length} dossier(s) zichtbaar`}
            </div>
          </div>

          {!listLoading && visibleItems.length > 0 && (
            <div className="monitor-summary-chips">
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
            <div ref={infoPopupRef} className="monitor-info-popup" style={infoPopupStyle}>
              Klik op een statuslabel om de zichtbare formulierafhandelingen te filteren op die actiepuntstatus. Klik nogmaals op hetzelfde label om die filter weer uit te zetten.
            </div>
          )}

          {statusInfoOpen && statusInfoPopupStyle && (
            <div ref={statusInfoPopupRef} className="monitor-info-popup" style={statusInfoPopupStyle}>
              <div className="ui-stack-sm">
                <div className="monitor-popup-title">Statusverloop formulieren</div>
                <div><strong>Nog te verwerken</strong> bevat <strong>Ingediend</strong> en <strong>In behandeling</strong>.</div>
                <div><strong>Ingediend</strong>; het formulier is aangeleverd en wacht nog op inhoudelijke afhandeling.</div>
                <div><strong>In behandeling</strong>; de formulierafhandeling is gestart en er lopen nog actiepunten of opvolging.</div>
                <div><strong>Concept</strong>; het formulier is nog niet definitief ingediend door de invuller.</div>
                <div><strong>Ingetrokken</strong>; het formulier is teruggetrokken en hoort normaal niet meer in de lopende werkvoorraad.</div>
                <div><strong>Definitief</strong>; de formulierafhandeling is afgerond.</div>
                <div className="ember-page-subtitle">Chronologisch verloopt dit meestal als; Concept, Ingediend, In behandeling, Definitief.</div>
              </div>
            </div>
          )}

          {listLoading ? (
            <div className="muted">laden; monitorlijst</div>
          ) : visibleItems.length === 0 ? (
            <div className="muted">Geen formulieren gevonden.</div>
          ) : (
            <div className="monitor-list">
              {visibleItems.map((row) => {
                const actionCountsRaw = buildMonitorRowActionCounts(row);
                const actionCounts = {
                  open: Number(actionCountsRaw?.open ?? getOpenCount(row)),
                  waiting: Number(actionCountsRaw?.waiting ?? getWaitingCount(row)),
                  done: Number(actionCountsRaw?.done ?? getDoneCount(row)),
                };

                const isReady = hasNoRemainingOpenActionPoints(row);
                const id = String(row.form_instance_id);

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

                          {row.assigned_display_name_snapshot || row.assigned_email_snapshot ? (
                            <button
                              type="button"
                              className="monitor-tag monitor-tag--active"
                              title={
                                row.assigned_email_snapshot
                                  ? `Stuur Teams-bericht naar ${row.assigned_display_name_snapshot || row.assigned_email_snapshot}`
                                  : "Toegewezen behandelaar"
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                const teamsUrl = buildTeamsChatUrl(
                                  row.assigned_email_snapshot,
                                  row.form_instance_id
                                );
                                if (teamsUrl) {
                                  window.open(teamsUrl, "_blank", "noopener,noreferrer");
                                }
                              }}
                            >
                              Toegewezen aan {row.assigned_display_name_snapshot || row.assigned_email_snapshot}
                            </button>
                          ) : null}

                          {row.parent_instance_id ? (
                            <button
                              type="button"
                              className="monitor-tag monitor-tag--active monitor-link-tag"
                              title="Open vervolgformulieren"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/monitor/formulieren/${row.form_instance_id}?section=follow_forms`);
                              }}
                            >
                              vervolg op formulier #{row.parent_instance_id}
                            </button>
                          ) : null}

                          {row.relations?.has_children ? (
                            <button
                              type="button"
                              className="monitor-tag monitor-tag--active monitor-link-tag"
                              title="Open vervolgformulieren"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/monitor/formulieren/${row.form_instance_id}?section=follow_forms`);
                              }}
                            >
                              heeft vervolgformulier
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
                        <div className="monitor-dossier-row__meta">{row.instance_title}</div>
                      ) : null}

                      <div className="monitor-row-action-chips">
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
                      <div className="monitor-row-status">
                        <StatusTag status={row.status} />
                      </div>

                      <div className="monitor-dossier-row__audit">
                        <div>Laatste wijziging: {formatDateTime(row.updated_at || row.created_at)}</div>
                        <div>Laatst gewijzigd door: {getLastModifiedBy(row)}</div>
                      </div>

                      <div
                        className="monitor-open-action"
                        onMouseEnter={() => openIconRefById.current[id]?.startAnimation?.()}
                        onMouseLeave={() => openIconRefById.current[id]?.stopAnimation?.()}
                      >
                        <span>Open formulierafhandeling</span>
                        <ArrowBigRightIcon
                          ref={(el) => {
                            openIconRefById.current[id] = el;
                          }}
                          size={18}
                          className="nav-anim-icon"
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
