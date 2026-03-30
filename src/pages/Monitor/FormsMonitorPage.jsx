// src/pages/Monitor/FormsMonitorPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";

import {
  getFormsMonitorList,
  getFormsMonitorDetail,
  getFormsMonitorFollowUps,
  postFormsMonitorStatusAction,
  postFormsMonitorFollowUpStatusAction,
  putFormsMonitorFollowUpNote,
} from "../../api/emberApi.js";

import { SearchIcon } from "@/components/ui/search";
import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { FolderInputIcon } from "@/components/ui/folder-input";
import { ArchiveIcon } from "@/components/ui/archive";
import { MessageCircleMoreIcon } from "@/components/ui/message-circle-more";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { RefreshCWOffIcon } from "@/components/ui/refresh-cw-off";

const LS_KEY = "forms-monitor-state-v5";
const AUTO_REFRESH_MS = 30000;

const STATUS_FILTER_OPTIONS = [
  { key: "INGEDIEND", label: "Ingediend" },
  { key: "IN_BEHANDELING", label: "In behandeling" },
  { key: "AFGEHANDELD", label: "Definitief" },
  { key: "CONCEPT", label: "Concept" },
  { key: "INGETROKKEN", label: "Ingetrokken" },
];

const DEFAULT_SELECTED_STATUSES = ["INGEDIEND", "IN_BEHANDELING"];

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("nl-NL");
}

function statusLabel(status) {
  if (status === "CONCEPT") return "Concept";
  if (status === "INGEDIEND") return "Ingediend";
  if (status === "IN_BEHANDELING") return "In behandeling";
  if (status === "AFGEHANDELD") return "Definitief";
  if (status === "INGETROKKEN") return "Ingetrokken";
  if (status === "OPEN") return "Open";
  if (status === "WACHTENOPDERDEN") return "Wachten op derden";
  if (status === "AFGEWEZEN") return "Afgewezen";
  if (status === "VERVALLEN") return "Vervallen";
  if (status === "INFORMATIEF") return "Informatief";
  return status || "Onbekend";
}

function getStatusTone(status) {
  if (status === "IN_BEHANDELING") return "active";
  if (status === "INGEDIEND") return "neutral";
  if (status === "AFGEHANDELD") return "success";
  if (status === "INGETROKKEN") return "muted";
  if (status === "CONCEPT") return "muted";
  if (status === "OPEN") return "active";
  if (status === "WACHTENOPDERDEN") return "warning";
  if (status === "AFGEWEZEN") return "danger";
  if (status === "VERVALLEN") return "muted";
  if (status === "INFORMATIEF") return "muted";
  return "neutral";
}

function getToneClass(tone) {
  if (tone === "active") return "monitor-tag monitor-tag--active";
  if (tone === "neutral") return "monitor-tag monitor-tag--neutral";
  if (tone === "success") return "monitor-tag monitor-tag--success";
  if (tone === "warning") return "monitor-tag monitor-tag--warning";
  if (tone === "danger") return "monitor-tag monitor-tag--danger";
  return "monitor-tag monitor-tag--muted";
}

function StatusTag({ status }) {
  return (
    <span className={getToneClass(getStatusTone(status))}>
      {statusLabel(status)}
    </span>
  );
}

function SummaryTag({ children, title, tone = "default" }) {
  const cls =
    tone === "subtle"
      ? "monitor-tag monitor-tag--muted"
      : "monitor-tag monitor-tag--neutral";

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
      style={{
        cursor: "pointer",
        opacity: active ? 1 : 0.9,
      }}
    >
      {label}
    </button>
  );
}

function StatusFilterChip({ status, active, onClick }) {
  return (
    <button
      type="button"
      title={statusLabel(status)}
      onClick={onClick}
      className={active ? getToneClass(getStatusTone(status)) : "monitor-tag monitor-tag--muted"}
      style={{
        cursor: "pointer",
        opacity: active ? 1 : 0.78,
      }}
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

function compactInstallationLine(item) {
  const code = item?.installatie_code || item?.atrium_installation_code || "";
  const name = item?.installatie_naam || "";
  return [code, name].filter(Boolean).join(" ");
}

function buildClipboardText({ detailItem, row }) {
  const vraagNummer =
    row?.source_item_code ||
    (row?.source_row_index != null ? String(row.source_row_index) : null) ||
    "onbekend";

  const formTitel = detailItem?.form_name || detailItem?.form_code || "formulier";
  const invuller = detailItem?.created_by || detailItem?.submitted_by || "onbekend";
  const categorie = row?.category || "-";
  const omschrijving = row?.workflow_title || "Actiepunt";
  const toelichting = row?.workflow_description || "-";

  const installatieBits = [
    detailItem?.installatie_code || detailItem?.atrium_installation_code || "",
    detailItem?.installatie_naam || "",
    detailItem?.object_code || "",
    detailItem?.obj_naam || "",
    detailItem?.gebruiker_code || "",
    detailItem?.gebruiker_naam || "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    `Actiepunt vanuit formulier ${formTitel}; vraag ${vraagNummer}; beoordeeld door ${invuller}.`,
    `Type; ${categorie}`,
    `Omschrijving; ${omschrijving}`,
    `Toelichting formulier; ${toelichting}`,
    `Installatie; ${installatieBits || "-"}`,
  ].join("\n");
}

function readStateFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStateToStorage(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function normalizeNoteValue(value) {
  if (value == null) return "";
  return String(value);
}

function buildRelationRows(item) {
  if (!item) return [];

  const rows = [];

  const installatieValue = [item.installatie_code || item.atrium_installation_code, item.installatie_naam]
    .filter(Boolean)
    .join(" ");
  if (installatieValue) rows.push({ label: "Installatie", value: installatieValue });

  const objectValue = [item.object_code, item.obj_naam].filter(Boolean).join(" ");
  if (objectValue) rows.push({ label: "Object", value: objectValue });

  const gebruikerValue = [item.gebruiker_code, item.gebruiker_naam].filter(Boolean).join(" ");
  if (gebruikerValue) rows.push({ label: "Gebruiker", value: gebruikerValue });

  const beheerderValue = [item.beheerder_code, item.beheerder_naam].filter(Boolean).join(" ");
  if (beheerderValue) rows.push({ label: "Beheerder", value: beheerderValue });

  const eigenaarValue = [item.eigenaar_code, item.eigenaar_naam].filter(Boolean).join(" ");
  if (eigenaarValue) rows.push({ label: "Eigenaar", value: eigenaarValue });

  return rows;
}

function ActionFooter({ canFinish, finishBusy, onFinish, onOpenForm }) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onOpenForm}
      >
        Open formulier
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        disabled
        title="PDF-export volgt later"
      >
        PDF-export
      </button>

      {canFinish && (
        <button
          type="button"
          className="btn"
          disabled={finishBusy}
          onClick={onFinish}
        >
          Formulier definitief maken
        </button>
      )}
    </div>
  );
}

export default function FormsMonitorPage() {
  const storedState = useMemo(() => readStateFromStorage(), []);

  const searchIconRef = useRef(null);
  const refreshIconRef = useRef(null);
  const refreshOffIconRef = useRef(null);
  const openIconRef = useRef(null);
  const propsToggleIconRef = useRef(null);
  const relationToggleIconRef = useRef(null);

  const noteSaveTimersRef = useRef({});

  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    q: storedState?.filters?.q ?? "",
    mine: storedState?.filters?.mine ?? true,
    onlyActionable: storedState?.filters?.onlyActionable ?? false,
    selectedStatuses:
      Array.isArray(storedState?.filters?.selectedStatuses) &&
      storedState.filters.selectedStatuses.length > 0
        ? storedState.filters.selectedStatuses
        : DEFAULT_SELECTED_STATUSES,
    take: 200,
    skip: 0,
  });

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(storedState?.selectedId ?? null);
  const [propertiesOpen, setPropertiesOpen] = useState(storedState?.propertiesOpen ?? false);
  const [relationsOpen, setRelationsOpen] = useState(storedState?.relationsOpen ?? false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    storedState?.autoRefreshEnabled ?? true
  );

  const [detail, setDetail] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [followUpSummary, setFollowUpSummary] = useState(null);

  const [formActionBusy, setFormActionBusy] = useState(false);
  const [followUpBusyId, setFollowUpBusyId] = useState(null);

  const [noteDrafts, setNoteDrafts] = useState(storedState?.noteDrafts ?? {});
  const [noteSavingById, setNoteSavingById] = useState({});
  const [noteSavedById, setNoteSavedById] = useState({});

  const visibleItems = useMemo(() => {
    const selectedStatusesSet = new Set(filters.selectedStatuses || []);
    return (items || []).filter((x) => selectedStatusesSet.has(x.status));
  }, [items, filters.selectedStatuses]);

  useEffect(() => {
    saveStateToStorage({
      filters,
      selectedId,
      propertiesOpen,
      relationsOpen,
      autoRefreshEnabled,
      noteDrafts,
    });
  }, [filters, selectedId, propertiesOpen, relationsOpen, autoRefreshEnabled, noteDrafts]);

  useEffect(() => {
    return () => {
      Object.values(noteSaveTimersRef.current).forEach((timerId) => {
        if (timerId) window.clearTimeout(timerId);
      });
    };
  }, []);

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

  async function loadList(preferredId = null) {
    setListLoading(true);
    setError(null);

    try {
      const res = await getFormsMonitorList({
        q: filters.q,
        mine: filters.mine,
        onlyActionable: filters.onlyActionable,
        includeWithdrawn: true,
        take: filters.take,
        skip: filters.skip,
      });

      const nextItems = Array.isArray(res?.items) ? res.items : [];
      setItems(nextItems);

      const selectedStatusesSet = new Set(filters.selectedStatuses || []);
      const visibleNextItems = nextItems.filter((x) => selectedStatusesSet.has(x.status));

      const preferred =
        preferredId != null && Number.isInteger(Number(preferredId))
          ? Number(preferredId)
          : null;

      const currentStillExists = visibleNextItems.some(
        (x) => Number(x.form_instance_id) === Number(selectedId)
      );

      const nextSelectedId =
        (preferred != null &&
          visibleNextItems.some((x) => Number(x.form_instance_id) === preferred) &&
          preferred) ||
        (currentStillExists ? selectedId : null) ||
        visibleNextItems[0]?.form_instance_id ||
        null;

      setSelectedId(nextSelectedId != null ? Number(nextSelectedId) : null);
    } catch (e) {
      setError(e?.message || String(e));
      setItems([]);
      setSelectedId(null);
    } finally {
      setListLoading(false);
    }
  }

  async function loadDetail(instanceId) {
    const cleanId = Number(instanceId);
    if (!Number.isInteger(cleanId) || cleanId <= 0) {
      setDetail(null);
      setFollowUps([]);
      setFollowUpSummary(null);
      return;
    }

    setDetailLoading(true);
    setFollowUpsLoading(true);
    setError(null);

    try {
      const [detailRes, followUpsRes] = await Promise.all([
        getFormsMonitorDetail(cleanId, { autoClaim: true }),
        getFormsMonitorFollowUps(cleanId),
      ]);

      setDetail(detailRes || null);

      const rows = Array.isArray(followUpsRes?.items) ? followUpsRes.items : [];
      setFollowUps(rows);
      setFollowUpSummary(followUpsRes?.summary || detailRes?.follow_up_summary || null);

      setNoteDrafts((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          const key = String(row.follow_up_action_id);
          if (document.activeElement?.dataset?.noteId === key) continue;
          next[key] = normalizeNoteValue(row.note);
        }
        return next;
      });
    } catch (e) {
      setError(e?.message || String(e));
      setDetail(null);
      setFollowUps([]);
      setFollowUpSummary(null);
    } finally {
      setDetailLoading(false);
      setFollowUpsLoading(false);
    }
  }

  async function refreshDetailAndList(preferredId = null) {
    const targetId = preferredId ?? selectedId;
    await loadList(targetId);
    if (targetId != null) {
      await loadDetail(targetId);
    }
  }

  useEffect(() => {
    loadList(storedState?.selectedId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const selectedStillVisible = visibleItems.some(
      (x) => Number(x.form_instance_id) === Number(selectedId)
    );

    if (!selectedStillVisible) {
      setSelectedId(visibleItems[0]?.form_instance_id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      setFollowUps([]);
      setFollowUpSummary(null);
      return;
    }

    loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      refreshDetailAndList();
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.mine, filters.onlyActionable, filters.selectedStatuses, selectedId, autoRefreshEnabled]);

  async function applySearch() {
    await loadList(null);
  }

  async function handleFormAction(action) {
    const item = detail?.item;
    if (!item?.form_instance_id || !action || formActionBusy) return;

    const needsConfirm = action === "set_ingediend" || action === "set_concept";
    if (needsConfirm) {
      const ok = window.confirm(
        `Weet je zeker dat je deze statusactie wilt uitvoeren?\n\n${action === "set_ingediend" ? "Terug naar ingediend" : "Terug naar concept"}`
      );
      if (!ok) return;
    }

    setFormActionBusy(true);

    try {
      await postFormsMonitorStatusAction(item.form_instance_id, action);
      await refreshDetailAndList(item.form_instance_id);
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      setFormActionBusy(false);
    }
  }

  async function handleFollowUpAction(followUpActionId, action) {
    if (!followUpActionId || !action || followUpBusyId) return;

    setFollowUpBusyId(followUpActionId);

    try {
      await postFormsMonitorFollowUpStatusAction(followUpActionId, {
        action,
      });

      await refreshDetailAndList(detail?.item?.form_instance_id || null);
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      setFollowUpBusyId(null);
    }
  }

  async function handleCopyClipboard(row) {
    try {
      const text = buildClipboardText({
        detailItem: detail?.item || {},
        row,
      });

      await navigator.clipboard.writeText(text);
    } catch (e) {
      window.alert(e?.message || String(e));
    }
  }

  async function saveNoteNow(followUpActionId, noteValue) {
    if (!followUpActionId) return;

    setNoteSavingById((prev) => ({
      ...prev,
      [followUpActionId]: true,
    }));
    setNoteSavedById((prev) => ({
      ...prev,
      [followUpActionId]: false,
    }));

    try {
      await putFormsMonitorFollowUpNote(followUpActionId, {
        note: noteValue,
      });

      setFollowUps((prev) =>
        prev.map((row) =>
          String(row.follow_up_action_id) === String(followUpActionId)
            ? { ...row, note: noteValue }
            : row
        )
      );

      setNoteSavedById((prev) => ({
        ...prev,
        [followUpActionId]: true,
      }));

      window.setTimeout(() => {
        setNoteSavedById((prev) => ({
          ...prev,
          [followUpActionId]: false,
        }));
      }, 1800);
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      setNoteSavingById((prev) => ({
        ...prev,
        [followUpActionId]: false,
      }));
    }
  }

  function scheduleNoteSave(followUpActionId, nextValue) {
    const existingTimer = noteSaveTimersRef.current[followUpActionId];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    noteSaveTimersRef.current[followUpActionId] = window.setTimeout(() => {
      saveNoteNow(followUpActionId, nextValue);
    }, 700);
  }

  function handleNoteChange(followUpActionId, nextValue) {
    setNoteDrafts((prev) => ({
      ...prev,
      [followUpActionId]: nextValue,
    }));
    scheduleNoteSave(followUpActionId, nextValue);
  }

  const allowedActions = detail?.allowed_actions || {};
  const item = detail?.item || null;
  const relationRows = useMemo(() => buildRelationRows(item), [item]);

  return (
    <div>
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Monitor formulieren</h1>
              <div className="muted" style={{ fontSize: 13 }}>
                Overzicht, opvolging en afhandeling van formulierdossiers
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
          <div
            style={{
              display: "grid",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "stretch",
                flexWrap: "wrap",
              }}
            >
              <FilterGroup label="Filters" minWidth={260}>
                <FilterChip
                  active={Boolean(filters.mine)}
                  label="Eigen"
                  title="Toon standaard alleen eigen formulieren"
                  onClick={() => setFilters((prev) => ({ ...prev, mine: !prev.mine }))}
                />

                <FilterChip
                  active={Boolean(filters.onlyActionable)}
                  label="Open actiepunten"
                  title="Met openstaande actiepunten"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      onlyActionable: !prev.onlyActionable,
                    }))
                  }
                />
              </FilterGroup>

              <FilterGroup label="Status" minWidth={360} grow>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <StatusFilterChip
                    key={opt.key}
                    status={opt.key}
                    active={filters.selectedStatuses.includes(opt.key)}
                    onClick={() => toggleStatusFilter(opt.key)}
                  />
                ))}
              </FilterGroup>
            </div>

            <input
              className="input"
              style={{ width: "100%" }}
              placeholder="Zoek op installatie, object, relatie, formulier of gebruiker"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />

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
                onClick={() => refreshDetailAndList()}
                onMouseEnter={() => refreshIconRef.current?.startAnimation?.()}
                onMouseLeave={() => refreshIconRef.current?.stopAnimation?.()}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <RefreshCWIcon ref={refreshIconRef} size={18} />
                Verversen
              </button>
            </div>
          </div>
        </div>

        {error && <div style={{ color: "salmon" }}>{error}</div>}

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "minmax(360px, 460px) minmax(0, 1fr)",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>Formulierdossiers</div>

              {listLoading ? (
                <div className="muted">laden; monitorlijst</div>
              ) : visibleItems.length === 0 ? (
                <div className="muted">Geen dossiers gevonden.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {visibleItems.map((row) => {
                    const selected = Number(row.form_instance_id) === Number(selectedId);

                    return (
                      <div
                        key={row.form_instance_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(Number(row.form_instance_id))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(Number(row.form_instance_id));
                          }
                        }}
                        style={{
                          padding: 12,
                          border: selected
                            ? "1px solid rgba(255,255,255,0.32)"
                            : "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 12,
                          background: selected ? "rgba(255,255,255,0.04)" : "transparent",
                          display: "grid",
                          gap: 8,
                          cursor: "pointer",
                          outline: "none",
                        }}
                        title="Selecteer dossier"
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>
                              {row.form_name || row.form_code || `Formulier ${row.form_instance_id}`}
                            </div>
                            <div className="muted" style={{ fontSize: 13 }}>
                              {compactInstallationLine(row) || "-"}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <StatusTag status={row.status} />
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <SummaryTag title="Formulierversie">
                              v{row.version_label || "-"}
                            </SummaryTag>

                            <SummaryTag title="Openstaande actiepunten">
                              {row.follow_up_summary?.open_count ?? 0} open
                            </SummaryTag>

                            {(row.relations?.has_children || row.parent_instance_id) && (
                              <SummaryTag title="Onderdeel van keten">
                                keten
                              </SummaryTag>
                            )}
                          </div>

                          <div className="muted" style={{ fontSize: 12 }}>
                            Laatste wijziging; {formatDateTime(row.updated_at || row.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              display: "grid",
              gap: 12,
            }}
          >
            {!selectedId ? (
              <div className="muted">Geen dossier geselecteerd.</div>
            ) : detailLoading ? (
              <div className="muted">laden; detail</div>
            ) : !item ? (
              <div className="muted">Detail niet beschikbaar.</div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {item.form_name || item.form_code}
                      </div>

                      <StatusTag status={item.status} />

                      <SummaryTag title="Formulierversie">
                        v{item.version_label || "-"}
                      </SummaryTag>

                      <SummaryTag title="Openstaande actiepunten">
                        {followUpSummary?.open_count ?? detail.follow_up_summary?.open_count ?? 0} open
                      </SummaryTag>
                    </div>

                    {item.instance_title ? (
                      <div className="muted" style={{ fontSize: 13 }}>
                        {item.instance_title}
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {allowedActions.set_ingediend && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={formActionBusy}
                        onClick={() => handleFormAction("set_ingediend")}
                      >
                        Terug naar ingediend
                      </button>
                    )}

                    {allowedActions.set_concept && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={formActionBusy}
                        onClick={() => handleFormAction("set_concept")}
                      >
                        Terug naar concept
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        const url = `/installaties/${encodeURIComponent(item.atrium_installation_code)}/formulieren/${encodeURIComponent(item.form_instance_id)}`;
                        window.open(url, "_blank", "noopener");
                      }}
                      onMouseEnter={() => openIconRef.current?.startAnimation?.()}
                      onMouseLeave={() => openIconRef.current?.stopAnimation?.()}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <ArrowBigRightIcon ref={openIconRef} size={18} className="nav-anim-icon" />
                      Open formulier
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled
                      title="PDF-export volgt later"
                    >
                      PDF-export
                    </button>

                    {allowedActions.set_afgehandeld && (
                      <button
                        type="button"
                        className="btn"
                        disabled={formActionBusy}
                        onClick={() => handleFormAction("set_afgehandeld")}
                      >
                        Formulier definitief maken
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPropertiesOpen((prev) => !prev)}
                    onMouseEnter={() => propsToggleIconRef.current?.startAnimation?.()}
                    onMouseLeave={() => propsToggleIconRef.current?.stopAnimation?.()}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    title={propertiesOpen ? "Inklappen" : "Uitklappen"}
                  >
                    <div style={{ fontWeight: 600 }}>Formuliereigenschappen</div>

                    <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
                      {!propertiesOpen ? (
                        <PlusIcon
                          ref={propsToggleIconRef}
                          size={18}
                          className="nav-anim-icon"
                        />
                      ) : (
                        <ChevronUpIcon
                          ref={propsToggleIconRef}
                          size={18}
                          className="nav-anim-icon"
                        />
                      )}
                    </div>
                  </button>

                  {propertiesOpen && (
                    <div className="cf-grid">
                      <div className="cf-row">
                        <div className="cf-label">
                          <div className="cf-label-text cf-label-text--accent">Documentnummer</div>
                        </div>
                        <div className="cf-control">
                          <input className="input" readOnly value={item.form_instance_id ?? ""} />
                        </div>
                      </div>

                      <div className="cf-row">
                        <div className="cf-label">
                          <div className="cf-label-text cf-label-text--accent">Aangemaakt door</div>
                        </div>
                        <div className="cf-control">
                          <input className="input" readOnly value={item.created_by ?? ""} />
                        </div>
                      </div>

                      <div className="cf-row">
                        <div className="cf-label">
                          <div className="cf-label-text cf-label-text--accent">Aangemaakt op</div>
                        </div>
                        <div className="cf-control">
                          <input className="input" readOnly value={formatDateTime(item.created_at)} />
                        </div>
                      </div>

                      <div className="cf-row">
                        <div className="cf-label">
                          <div className="cf-label-text cf-label-text--accent">Laatste wijziging</div>
                        </div>
                        <div className="cf-control">
                          <input
                            className="input"
                            readOnly
                            value={formatDateTime(item.updated_at || item.created_at)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setRelationsOpen((prev) => !prev)}
                    onMouseEnter={() => relationToggleIconRef.current?.startAnimation?.()}
                    onMouseLeave={() => relationToggleIconRef.current?.stopAnimation?.()}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    title={relationsOpen ? "Inklappen" : "Uitklappen"}
                  >
                    <div style={{ fontWeight: 600 }}>Relatiedata</div>

                    <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
                      {!relationsOpen ? (
                        <PlusIcon
                          ref={relationToggleIconRef}
                          size={18}
                          className="nav-anim-icon"
                        />
                      ) : (
                        <ChevronUpIcon
                          ref={relationToggleIconRef}
                          size={18}
                          className="nav-anim-icon"
                        />
                      )}
                    </div>
                  </button>

                  {relationsOpen && (
                    <div className="cf-grid">
                      {relationRows.map((row) => (
                        <div className="cf-row" key={row.label}>
                          <div className="cf-label">
                            <div className="cf-label-text cf-label-text--accent">
                              {row.label}
                            </div>
                          </div>
                          <div className="cf-control">
                            <input className="input" readOnly value={row.value} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {item.instance_note ? (
                  <div
                    style={{
                      padding: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>Formulieropmerking</div>
                    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      {item.instance_note}
                    </div>
                  </div>
                ) : null}

                {(detail.parent || (Array.isArray(detail.children) && detail.children.length > 0)) && (
                  <div
                    style={{
                      padding: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>Keten</div>

                    {detail.parent && (
                      <div
                        style={{
                          padding: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 10,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          Parent #{detail.parent.form_instance_id}
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {detail.parent.form_name || detail.parent.form_code || "-"}
                        </div>
                        <div>
                          <StatusTag status={detail.parent.status} />
                        </div>
                      </div>
                    )}

                    {Array.isArray(detail.children) && detail.children.length > 0 && (
                      <div style={{ display: "grid", gap: 8 }}>
                        {detail.children.map((child) => (
                          <div
                            key={child.form_instance_id}
                            style={{
                              padding: 10,
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 10,
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600 }}>
                                Child #{child.form_instance_id}
                              </div>
                              <div className="muted" style={{ fontSize: 13 }}>
                                {child.form_name || child.form_code || "-"}
                              </div>
                            </div>

                            <StatusTag status={child.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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
                    <div style={{ fontWeight: 600 }}>Actiepunten</div>

                    <div className="muted" style={{ fontSize: 12 }}>
                      {followUpsLoading ? "laden..." : `${followUps.length} regel(s)`}
                    </div>
                  </div>

                  {followUpsLoading ? (
                    <div className="muted">laden; actiepunten</div>
                  ) : followUps.length === 0 ? (
                    <div className="muted">Geen actiepunten gevonden.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {followUps.map((row) => {
                        const noteKey = String(row.follow_up_action_id);
                        const noteValue = noteDrafts[noteKey] ?? normalizeNoteValue(row.note);
                        const noteSaving = Boolean(noteSavingById[noteKey]);
                        const noteSaved = Boolean(noteSavedById[noteKey]);

                        return (
                          <div
                            key={row.follow_up_action_id}
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
                                alignItems: "flex-start",
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <div style={{ fontWeight: 600 }}>
                                    {row.workflow_title || "Actiepunt"}
                                  </div>
                                  <StatusTag status={row.status} />
                                </div>

                                {row.workflow_description ? (
                                  <div className="muted" style={{ fontSize: 13 }}>
                                    {row.workflow_description}
                                  </div>
                                ) : null}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  flexWrap: "wrap",
                                  marginLeft: "auto",
                                }}
                              >
                                {row.category ? (
                                  <SummaryTag title="Categorie">
                                    {row.category}
                                  </SummaryTag>
                                ) : null}

                                {row.certificate_impact ? (
                                  <SummaryTag title="Certificaatimpact">
                                    certificaat; {row.certificate_impact}
                                  </SummaryTag>
                                ) : null}

                                {row.source_item_code || row.source_row_index != null ? (
                                  <SummaryTag title="Vraagnummer">
                                    vraag {row.source_item_code || row.source_row_index}
                                  </SummaryTag>
                                ) : null}
                              </div>
                            </div>

                            <div className="muted" style={{ fontSize: 12 }}>
                              Laatste wijziging; {formatDateTime(row.updated_at || row.created_at)}
                            </div>

                            <div
                              style={{
                                padding: 10,
                                border: "1px solid rgba(255,255,255,0.10)",
                                borderRadius: 10,
                                display: "grid",
                                gap: 6,
                              }}
                            >
                              <div style={{ fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}>
                                <MessageCircleMoreIcon size={16} />
                                Notitie
                              </div>

                              <textarea
                                className="cf-textarea"
                                rows={3}
                                data-note-id={noteKey}
                                placeholder="Werknotitie of interne toelichting"
                                value={noteValue}
                                onChange={(e) => handleNoteChange(noteKey, e.target.value)}
                              />

                              <div className="muted" style={{ fontSize: 12 }}>
                                {noteSaving ? "opslaan..." : noteSaved ? "opgeslagen" : "wijzigingen worden automatisch opgeslagen"}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleCopyClipboard(row)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                              >
                                <ArchiveIcon size={18} />
                                Kopieer ERP-tekst
                              </button>

                              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={followUpBusyId === row.follow_up_action_id}
                                  onClick={() => handleFollowUpAction(row.follow_up_action_id, "set_open")}
                                >
                                  Open
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={followUpBusyId === row.follow_up_action_id}
                                  onClick={() => handleFollowUpAction(row.follow_up_action_id, "set_waiting_third_party")}
                                >
                                  Wachten op derden
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={followUpBusyId === row.follow_up_action_id}
                                  onClick={() => handleFollowUpAction(row.follow_up_action_id, "set_rejected")}
                                >
                                  Afgewezen
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={followUpBusyId === row.follow_up_action_id}
                                  onClick={() => handleFollowUpAction(row.follow_up_action_id, "set_vervallen")}
                                >
                                  Vervallen
                                </button>

                                <button
                                  type="button"
                                  className="btn"
                                  disabled={followUpBusyId === row.follow_up_action_id}
                                  onClick={() => handleFollowUpAction(row.follow_up_action_id, "mark_done")}
                                >
                                  <FolderInputIcon size={18} style={{ marginRight: 6 }} />
                                  Actiepunt afronden
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <ActionFooter
                  canFinish={allowedActions.set_afgehandeld}
                  finishBusy={formActionBusy}
                  onFinish={() => handleFormAction("set_afgehandeld")}
                  onOpenForm={() => {
                    const url = `/installaties/${encodeURIComponent(item.atrium_installation_code)}/formulieren/${encodeURIComponent(item.form_instance_id)}`;
                    window.open(url, "_blank", "noopener");
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}