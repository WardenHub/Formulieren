// src/pages/Installations/FormsTab.jsx
import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { RocketIcon } from "@/components/ui/rocket";
import { BookmarkCheckIcon } from "@/components/ui/bookmark-check";
import { BookmarkXIcon } from "@/components/ui/bookmark-x";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";
import { SearchIcon } from "@/components/ui/search";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";

import {
  getFormsCatalog,
  getInstallationFormInstances,
} from "../../api/emberApi.js";
import { isHistoricalInstallation } from "../../lib/installationStatus.js";

const STATUS_FILTER_OPTIONS = [
  { key: "INGEDIEND", label: "Ingediend" },
  { key: "IN_BEHANDELING", label: "In behandeling" },
  { key: "AFGEHANDELD", label: "Definitief" },
  { key: "CONCEPT", label: "Concept" },
  { key: "INGETROKKEN", label: "Ingetrokken" },
];

const DEFAULT_SELECTED_STATUSES = STATUS_FILTER_OPTIONS.map((x) => x.key);

function getStorageKey(code) {
  return `forms-tab-state-v2::${String(code || "")}`;
}

function readStoredState(code) {
  try {
    if (!code) return null;
    const raw = window.localStorage.getItem(getStorageKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredState(code, state) {
  try {
    if (!code) return;
    window.localStorage.setItem(getStorageKey(code), JSON.stringify(state));
  } catch {
    // ignore
  }
}

function formatCompactDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("nl-NL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status) {
  if (status === "CONCEPT") return "Concept";
  if (status === "INGEDIEND") return "Ingediend";
  if (status === "IN_BEHANDELING") return "In behandeling";
  if (status === "AFGEHANDELD") return "Definitief";
  if (status === "INGETROKKEN") return "Ingetrokken";
  return status || "Onbekend";
}

function getStatusTone(status) {
  if (status === "IN_BEHANDELING") return "active";
  if (status === "INGEDIEND") return "neutral";
  if (status === "AFGEHANDELD") return "success";
  if (status === "INGETROKKEN") return "muted";
  if (status === "CONCEPT") return "muted";
  return "neutral";
}

function getToneClass(tone) {
  if (tone === "active") return "ember-label ember-label--active";
  if (tone === "neutral") return "ember-label ember-label--neutral";
  if (tone === "success") return "ember-label ember-label--success";
  if (tone === "warning") return "ember-label ember-label--warning";
  if (tone === "danger") return "ember-label ember-label--danger";
  if (tone === "accent") return "ember-label ember-label--accent";
  return "ember-label ember-label--muted";
}

function StatusTag({ status }) {
  return <span className={getToneClass(getStatusTone(status))}>{statusLabel(status)}</span>;
}

function StatusFilterChip({ status, active, onClick }) {
  return (
    <button
      type="button"
      title={statusLabel(status)}
      onClick={onClick}
      className={`${active ? getToneClass(getStatusTone(status)) : getToneClass("muted")} ember-label--button`}
    >
      {statusLabel(status)}
    </button>
  );
}

function TypeFilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`${active ? getToneClass("neutral") : getToneClass("muted")} ember-label--button`}
    >
      {label}
    </button>
  );
}

function SummaryTag({ children, title }) {
  return (
    <span className="ember-label ember-label--muted" title={title}>
      {children}
    </span>
  );
}

function RelationTag({ children, title }) {
  return (
    <span className="ember-label ember-label--active" title={title}>
      {children}
    </span>
  );
}

function buildTeamsChatUrl(email, formInstanceId) {
  const cleanEmail = String(email || "").trim();
  if (!cleanEmail) return null;
  const monitorUrl = `${window.location.origin}/monitor/formulieren/${encodeURIComponent(formInstanceId)}`;
  const message =
    `Hallo; ik wil het hebben over formulier ${formInstanceId}. ` +
    `Je vindt het formulier hier: ${monitorUrl}`;
  const topic = `Formulier ${formInstanceId}`;
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(cleanEmail)}&topicname=${encodeURIComponent(topic)}&message=${encodeURIComponent(message)}`;
}

function AssignedTag({ item }) {
  const displayName = String(item?.assigned_display_name_snapshot || "").trim();
  const email = String(item?.assigned_email_snapshot || "").trim();
  if (!displayName && !email) return null;

  const label = displayName || email;
  const teamsUrl = buildTeamsChatUrl(email, item?.form_instance_id);

  if (!teamsUrl) {
    return (
      <span className="ember-label ember-label--info" title="Toegewezen aan">
        Toegewezen aan {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="ember-label ember-label--info ember-label--button"
      title={`Stuur Teams-bericht naar ${label}`}
      onClick={() => window.open(teamsUrl, "_blank", "noopener,noreferrer")}
    >
      Toegewezen aan {label}
    </button>
  );
}

function getLastModifiedBy(item) {
  if (!item) return "-";
  return item.updated_by || item.submitted_by || item.created_by || "-";
}

function canStartFollowUp(item) {
  const status = String(item?.status || "").trim();
  if (!item?.form_instance_id) return false;
  if (isHistoricalInstallation(item)) return false;
  if (status === "INGETROKKEN") return false;
  return true;
}

function getFormTypeKey(item) {
  return String(item?.form_code || item?.form_name || "").trim();
}

function getFormTypeLabel(item) {
  return String(item?.form_name || item?.form_code || "").trim();
}

function buildVisibleRows(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const childMap = new Map();
  const byId = new Map();

  for (const item of safeItems) {
    byId.set(Number(item.form_instance_id), item);
  }

  for (const item of safeItems) {
    const parentId = item.parent_instance_id == null ? null : Number(item.parent_instance_id);
    if (parentId == null) continue;
    if (!childMap.has(parentId)) childMap.set(parentId, []);
    childMap.get(parentId).push(item);
  }

  const roots = safeItems.filter((item) => {
    const parentId = item.parent_instance_id == null ? null : Number(item.parent_instance_id);
    if (parentId == null) return true;
    return !byId.has(parentId);
  });

  const result = [];

  function walk(item, depth) {
    result.push({ item, depth });
    const children = childMap.get(Number(item.form_instance_id)) || [];
    for (const child of children) walk(child, depth + 1);
  }

  for (const root of roots) walk(root, 0);
  return result;
}

function SectionBusyOverlay({ iconRef, title, label }) {
  return (
    <div className="ember-busy-overlay ember-busy-overlay--section">
      <div className="card ember-busy-card">
        <div className="ember-busy-icon">
          <RefreshCWIcon ref={iconRef} size={28} />
        </div>

        <div className="ember-busy-title">{title || "Laden..."}</div>

        <div className="muted ember-xs-text">
          {label || "Bezig met gegevens ophalen."}
        </div>
      </div>
    </div>
  );
}

function PreflightRow({ item, kind, onOpenTab, showDivider }) {
  const message = item?.message || "";
  const action = item?.action || null;

  const canNavigate =
    action &&
    action.type === "navigate_tab" &&
    (action.tab_key || action.tab);

  const navIconRef = useRef(null);

  function go() {
    const tabKey = action?.tab_key || action?.tab;
    if (tabKey) onOpenTab?.(tabKey);
  }

  return (
    <div
      role={canNavigate ? "button" : undefined}
      tabIndex={canNavigate ? 0 : -1}
      onClick={() => {
        if (canNavigate) go();
      }}
      onKeyDown={(e) => {
        if (!canNavigate) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      onMouseEnter={() => {
        if (canNavigate) navIconRef.current?.startAnimation?.();
      }}
      onMouseLeave={() => {
        if (canNavigate) navIconRef.current?.stopAnimation?.();
      }}
      className={`forms-preflight-row ${showDivider ? "forms-preflight-row--divider" : ""} ${
        canNavigate ? "forms-preflight-row--clickable" : ""
      }`}
      title={canNavigate ? "Open tab" : undefined}
    >
      <div className="forms-preflight-row-main">
        <div className="forms-preflight-message">{message}</div>

        {item?.key && (
          <div className="muted forms-preflight-key">
            {kind === "blocking" ? "blocking" : "warning"}: {item.key}
          </div>
        )}
      </div>

      {canNavigate && (
        <div className="icon-btn forms-preflight-nav" title="Open tab">
          <ArrowBigRightIcon ref={navIconRef} size={18} className="nav-anim-icon" />
        </div>
      )}
    </div>
  );
}

export default function FormsTab({
  code,
  installation,
  readOnly = false,
  readOnlyReason = "",
  isActive,
  activationToken,
  selectedFormCode,
  preflight,
  preflightLoading,
  preflightError,
  onSelectForm,
  onStartChecklist,
  onOpenTab,
  onOpenForm,
  onOpenExistingForm,
  onOpenChildForm,
  onAnyOpenChange,
}) {
  const storedState = useMemo(() => readStoredState(code), [code]);

  const [formsLoading, setFormsLoading] = useState(false);
  const [formsError, setFormsError] = useState(null);
  const [forms, setForms] = useState([]);

  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesError, setInstancesError] = useState(null);
  const [instances, setInstances] = useState([]);

  const [searchInput, setSearchInput] = useState(storedState?.searchInput ?? "");
  const [appliedSearch, setAppliedSearch] = useState(storedState?.appliedSearch ?? "");
  const [selectedStatuses, setSelectedStatuses] = useState(
    Array.isArray(storedState?.selectedStatuses) && storedState.selectedStatuses.length > 0
      ? storedState.selectedStatuses
      : DEFAULT_SELECTED_STATUSES
  );
  const [selectedFormTypes, setSelectedFormTypes] = useState(
    Array.isArray(storedState?.selectedFormTypes) ? storedState.selectedFormTypes : []
  );

  const [expandedFollowUpForId, setExpandedFollowUpForId] = useState(
    storedState?.expandedFollowUpForId ?? null
  );
  const [childPreflightByParentId, setChildPreflightByParentId] = useState({});
  const [childPreflightLoadingByParentId, setChildPreflightLoadingByParentId] = useState({});
  const [childPreflightErrorByParentId, setChildPreflightErrorByParentId] = useState({});

  const checklistIconRef = useRef(null);
  const statusIconRef = useRef(null);
  const statusArrowRef = useRef(null);
  const searchIconRef = useRef(null);
  const refreshIconRef = useRef(null);
  const instancesBusyIconRef = useRef(null);
  const followUpToggleIconRefs = useRef({});
  const followUpStatusIconRefs = useRef({});
  const followUpStatusArrowRefs = useRef({});
  const openFormIconRefs = useRef({});
  const hasInitializedTypeFiltersRef = useRef(false);
  const lastAutoRefreshKeyRef = useRef("");

  useEffect(() => {
    onAnyOpenChange?.(false);
  }, [onAnyOpenChange]);

  useEffect(() => {
    writeStoredState(code, {
      searchInput,
      appliedSearch,
      selectedStatuses,
      selectedFormTypes,
      expandedFollowUpForId,
    });
  }, [
    code,
    searchInput,
    appliedSearch,
    selectedStatuses,
    selectedFormTypes,
    expandedFollowUpForId,
  ]);

  useEffect(() => {
    if (instancesLoading) {
      instancesBusyIconRef.current?.startAnimation?.();
    } else {
      instancesBusyIconRef.current?.stopAnimation?.();
    }
  }, [instancesLoading]);

  useEffect(() => {
    return () => {
      instancesBusyIconRef.current?.stopAnimation?.();
    };
  }, []);

  const typeKey = installation?.installation_type_key || null;
  const historical = readOnly || isHistoricalInstallation(installation);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!code) return;

      setFormsLoading(true);
      setFormsError(null);

      try {
        const res = await getFormsCatalog(code);
        if (cancelled) return;

        const list =
          res?.items ||
          res?.data?.items ||
          res?.forms ||
          res?.data?.forms ||
          res?.data ||
          [];

        const normalized = Array.isArray(list)
          ? list
              .map((f) => ({
                code: f?.code ?? f?.form_code ?? f?.formCode ?? null,
                name: f?.label ?? f?.name ?? f?.display_name ?? f?.title ?? null,
                is_active: f?.is_active ?? true,
                is_applicable: f?.is_applicable ?? true,
              }))
              .filter((f) => f.code)
          : [];

        setForms(normalized);
      } catch (e) {
        if (cancelled) return;
        setFormsError(e?.message || String(e));
        setForms([]);
      } finally {
        if (!cancelled) setFormsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [code, typeKey]);

  useEffect(() => {
    if (!isActive) return;
    if (!selectedFormCode) return;

    const key = `${selectedFormCode}::${String(activationToken ?? "")}::${String(code ?? "")}`;
    if (lastAutoRefreshKeyRef.current === key) return;

    lastAutoRefreshKeyRef.current = key;
    onStartChecklist?.();
  }, [isActive, activationToken, selectedFormCode, code, onStartChecklist]);

  async function loadInstances({ nextSearch = appliedSearch, nextStatuses = selectedStatuses } = {}) {
    if (!code) return;

    if (!Array.isArray(nextStatuses) || nextStatuses.length === 0) {
      setInstances([]);
      setInstancesError(null);
      setInstancesLoading(false);
      return;
    }

    setInstancesLoading(true);
    setInstancesError(null);

    try {
      const res = await getInstallationFormInstances(code, {
        q: nextSearch,
        statuses: nextStatuses,
      });

      const list =
        res?.items ||
        res?.data?.items ||
        res?.instances ||
        res?.data?.instances ||
        [];

      setInstances(Array.isArray(list) ? list : []);
    } catch (e) {
      setInstancesError(e?.message || String(e));
      setInstances([]);
    } finally {
      setInstancesLoading(false);
    }
  }

  useEffect(() => {
    if (!isActive) return;
    loadInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, activationToken, code]);

  const formOptions = useMemo(() => {
    const active = forms.filter((f) => f.is_active !== false);
    return active.sort((a, b) => Number(Boolean(b.is_applicable)) - Number(Boolean(a.is_applicable)));
  }, [forms]);

  const selectedLabel = useMemo(() => {
    const hit = formOptions.find((f) => String(f.code) === String(selectedFormCode || ""));
    return hit?.name || hit?.code || "";
  }, [formOptions, selectedFormCode]);

  const blocking = Array.isArray(preflight?.blocking) ? preflight.blocking : [];
  const warnings = Array.isArray(preflight?.warnings) ? preflight.warnings : [];

  const hasPreflight =
    Boolean(selectedFormCode) && Boolean(preflight) && !preflightLoading && !preflightError;

  const okToStart = Boolean(preflight?.ok_to_start) && !historical;

  const formTypeOptions = useMemo(() => {
    const seen = new Map();

    for (const item of instances) {
      const key = getFormTypeKey(item);
      const label = getFormTypeLabel(item);
      if (!key || !label) continue;
      if (!seen.has(key)) {
        seen.set(key, { key, label });
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, "nl-NL"));
  }, [instances]);

  useEffect(() => {
    const availableKeys = formTypeOptions.map((x) => x.key);

    if (!hasInitializedTypeFiltersRef.current) {
      hasInitializedTypeFiltersRef.current = true;

      if (Array.isArray(storedState?.selectedFormTypes) && storedState.selectedFormTypes.length > 0) {
        const storedSet = new Set(storedState.selectedFormTypes);
        const restored = availableKeys.filter((key) => storedSet.has(key));
        setSelectedFormTypes(restored.length > 0 ? restored : availableKeys);
      } else {
        setSelectedFormTypes(availableKeys);
      }

      return;
    }

    setSelectedFormTypes((prev) => {
      const prevSet = new Set(prev);
      const intersection = availableKeys.filter((key) => prevSet.has(key));

      if (prev.length === 0) return availableKeys;

      if (intersection.length === prev.length && prev.length <= availableKeys.length) {
        const hadAllAvailableSelected =
          prev.length === availableKeys.length &&
          availableKeys.every((key) => prevSet.has(key));

        if (hadAllAvailableSelected) return availableKeys;
      }

      return intersection.length > 0 ? intersection : availableKeys;
    });
  }, [formTypeOptions, storedState]);

  const filteredInstances = useMemo(() => {
    if (!Array.isArray(instances) || instances.length === 0) return [];
    if (!Array.isArray(selectedFormTypes) || selectedFormTypes.length === 0) return [];

    const selectedSet = new Set(selectedFormTypes);
    return instances.filter((item) => selectedSet.has(getFormTypeKey(item)));
  }, [instances, selectedFormTypes]);

  const visibleRows = useMemo(() => buildVisibleRows(filteredInstances), [filteredInstances]);

  function toggleStatusFilter(statusKey) {
    setSelectedStatuses((prev) => {
      const current = new Set(prev || []);
      if (current.has(statusKey)) current.delete(statusKey);
      else current.add(statusKey);
      return Array.from(current);
    });
  }

  function toggleFormTypeFilter(typeKeyValue) {
    setSelectedFormTypes((prev) => {
      const current = new Set(prev || []);
      if (current.has(typeKeyValue)) current.delete(typeKeyValue);
      else current.add(typeKeyValue);
      return Array.from(current);
    });
  }

  useEffect(() => {
    if (!isActive) return;
    loadInstances({ nextSearch: appliedSearch, nextStatuses: selectedStatuses });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatuses]);

  async function applySearch() {
    const nextSearch = String(searchInput || "").trim();
    setAppliedSearch(nextSearch);
    await loadInstances({ nextSearch, nextStatuses: selectedStatuses });
  }

  async function refreshList() {
    await loadInstances({ nextSearch: appliedSearch, nextStatuses: selectedStatuses });
  }

  function getChildPreflight(parentId) {
    return childPreflightByParentId[String(parentId)] || null;
  }

  function getChildPreflightError(parentId) {
    return childPreflightErrorByParentId[String(parentId)] || null;
  }

  function getChildPreflightLoading(parentId) {
    return Boolean(childPreflightLoadingByParentId[String(parentId)]);
  }

  async function runChildPreflight(parentId, formCode) {
    const cleanParentId = Number(parentId);
    const cleanFormCode = String(formCode || "").trim();
    const key = String(cleanParentId);

    setChildPreflightByParentId((prev) => ({
      ...prev,
      [key]: null,
    }));
    setChildPreflightErrorByParentId((prev) => ({
      ...prev,
      [key]: null,
    }));

    if (!cleanFormCode) return;

    setChildPreflightLoadingByParentId((prev) => ({
      ...prev,
      [key]: true,
    }));

    try {
      const res = await onStartChecklist?.(cleanFormCode, { silent: true });
      setChildPreflightByParentId((prev) => ({
        ...prev,
        [key]: res || null,
      }));
    } catch (e) {
      setChildPreflightErrorByParentId((prev) => ({
        ...prev,
        [key]: e?.message || String(e),
      }));
    } finally {
      setChildPreflightLoadingByParentId((prev) => ({
        ...prev,
        [key]: false,
      }));
    }
  }

  function renderStatusRow() {
    if (!selectedFormCode) return null;

    if (preflightLoading) {
      return <div className="muted forms-inline-state">Status laden...</div>;
    }

    if (preflightError) {
      return <div className="ember-error-text forms-inline-state">{preflightError}</div>;
    }

    if (!preflight) return null;

    const StatusIcon = okToStart ? BookmarkCheckIcon : BookmarkXIcon;
    const isClickable = okToStart && typeof onOpenForm === "function";

    function startOrOpen() {
      if (!isClickable) return;
      onOpenForm(selectedFormCode);
    }

    return (
      <div
        className={`card forms-status-card ${isClickable ? "forms-status-card--clickable" : ""}`}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : -1}
        onClick={() => {
          if (isClickable) startOrOpen();
        }}
        onKeyDown={(e) => {
          if (!isClickable) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startOrOpen();
          }
        }}
        onMouseEnter={() => {
          statusIconRef.current?.startAnimation?.();
          if (okToStart) statusArrowRef.current?.startAnimation?.();
        }}
        onMouseLeave={() => {
          statusIconRef.current?.stopAnimation?.();
          if (okToStart) statusArrowRef.current?.stopAnimation?.();
        }}
        title={
          okToStart
            ? (isClickable ? `Start ${selectedLabel}` : "Formulier openen volgt")
            : "Nog niet startklaar"
        }
      >
        <div className="forms-status-main">
          <StatusIcon ref={statusIconRef} size={18} />
          <div className="forms-status-text">
            <div className="forms-status-title">
              {okToStart ? "Startklaar" : "Nog niet startklaar"}
            </div>
            <div className="muted forms-status-sub">
              {okToStart
                ? "Alle checks zijn in orde. Klik om het formulier te starten."
                : "Los blokkades op en controleer waarschuwingen."}
            </div>
          </div>
        </div>

        {okToStart && (
          <div className="forms-status-action">
            <div className="muted forms-status-action-text">Start formulier</div>

            <div className="icon-btn forms-status-action-icon" aria-hidden="true">
              <RocketIcon ref={statusArrowRef} size={18} />
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderPreflight() {
    if (!selectedFormCode) return null;

    if (preflightLoading) {
      return <div className="muted forms-inline-state">Preflight laden...</div>;
    }

    if (preflightError) {
      return <div className="ember-error-text forms-inline-state">{preflightError}</div>;
    }

    if (!preflight) return null;

    return (
      <div className="forms-preflight-stack">
        {blocking.length > 0 && (
          <div className="card forms-preflight-card forms-preflight-card--blocking">
            <div className="forms-card-title">Blokkades</div>

            <div className="forms-preflight-list">
              {blocking.map((b, idx) => (
                <PreflightRow
                  key={`${b?.key || "b"}-${idx}`}
                  item={b}
                  kind="blocking"
                  onOpenTab={onOpenTab}
                  showDivider={idx > 0}
                />
              ))}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="card forms-preflight-card">
            <div className="forms-card-title">Waarschuwingen</div>

            <div className="forms-preflight-list">
              {warnings.map((w, idx) => (
                <PreflightRow
                  key={`${w?.key || "w"}-${idx}`}
                  item={w}
                  kind="warning"
                  onOpenTab={onOpenTab}
                  showDivider={idx > 0}
                />
              ))}
            </div>
          </div>
        )}

        {blocking.length === 0 && warnings.length === 0 && (
          <div className="card forms-preflight-card">
            <div className="muted ember-small-text">Geen blokkades of waarschuwingen.</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="forms-tab ember-page-stack">
      <div className="forms-start-panel">
        {historical && (
          <div className="ember-label ember-label--danger">
            {readOnlyReason || "Deze installatie is historisch en alleen als dossier beschikbaar."}
          </div>
        )}

        <div className="muted ember-small-text">Kies een formulier om te starten.</div>

        <div className="forms-start-row">
          <select
            className="input forms-start-select"
            value={selectedFormCode || ""}
            onChange={(e) => onSelectForm?.(e.target.value || null)}
            disabled={formsLoading || historical}
          >
            <option value="">
              {formsLoading ? "Formulieren laden..." : "Selecteer formulier"}
            </option>

            {formOptions.map((f) => (
              <option key={f.code} value={f.code}>
                {f.name ? `${f.name}` : f.code}
                {f.is_applicable === false ? " (niet toepasbaar)" : ""}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn-secondary forms-nowrap-action"
            disabled={!selectedFormCode || preflightLoading || historical}
            onClick={() => onStartChecklist?.()}
            title={
              historical
                ? "Historische installatie; alleen dossier"
                : selectedFormCode
                  ? "Status controleren"
                  : "Kies eerst een formulier"
            }
            onMouseEnter={() => checklistIconRef.current?.startAnimation?.()}
            onMouseLeave={() => checklistIconRef.current?.stopAnimation?.()}
          >
            <ClipboardCheckIcon ref={checklistIconRef} size={18} />
            Status controleren
          </button>
        </div>

        {formsError && <div className="ember-error-text">{formsError}</div>}

        {!formsLoading && !formsError && typeKey && formOptions.length === 0 && (
          <div className="muted ember-small-text">
            Geen formulieren beschikbaar voor installatiesoort: {typeKey}
          </div>
        )}
      </div>

      {renderStatusRow()}

      {renderPreflight()}

      {hasPreflight && !okToStart && blocking.length > 0 && (
        <div className="muted ember-xs-text">
          Los eerst de blokkades op om te kunnen starten.
        </div>
      )}

      <div className="card forms-existing-card">
        {instancesLoading && (
          <SectionBusyOverlay
            iconRef={instancesBusyIconRef}
            title="Formulieren laden..."
            label="Bezig met zoeken, filteren of verversen."
          />
        )}

        <div className={`forms-existing-content ${instancesLoading ? "is-loading" : ""}`}>
          <div className="forms-existing-head">
            <div className="forms-card-title">Bestaande formulieren</div>
            <div className="muted ember-xs-text">
              {instancesLoading ? "laden..." : `${filteredInstances.length} formulier(en)`}
            </div>
          </div>

          <div className="forms-filter-stack">
            <div className="forms-chip-row">
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <StatusFilterChip
                  key={opt.key}
                  status={opt.key}
                  active={selectedStatuses.includes(opt.key)}
                  onClick={() => toggleStatusFilter(opt.key)}
                />
              ))}
            </div>

            {formTypeOptions.length > 0 && (
              <div className="forms-chip-row">
                {formTypeOptions.map((opt) => (
                  <TypeFilterChip
                    key={opt.key}
                    label={opt.label}
                    active={selectedFormTypes.includes(opt.key)}
                    onClick={() => toggleFormTypeFilter(opt.key)}
                  />
                ))}
              </div>
            )}

            <div className="forms-search-row">
              <input
                className="input forms-search-input"
                placeholder="Zoek op formulier, titel, opmerking, opsteller of wijziger"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
              />

              <button
                type="button"
                className="btn btn-secondary"
                onClick={applySearch}
                onMouseEnter={() => searchIconRef.current?.startAnimation?.()}
                onMouseLeave={() => searchIconRef.current?.stopAnimation?.()}
              >
                <SearchIcon ref={searchIconRef} size={18} />
                Zoeken
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={refreshList}
                onMouseEnter={() => refreshIconRef.current?.startAnimation?.()}
                onMouseLeave={() => refreshIconRef.current?.stopAnimation?.()}
              >
                <RefreshCWIcon ref={refreshIconRef} size={18} />
                Verversen
              </button>
            </div>
          </div>

          <div className="forms-instance-list-wrap">
            {instancesError && <div className="ember-error-text">{instancesError}</div>}

            {!instancesLoading && !instancesError && selectedStatuses.length === 0 && (
              <div className="muted">Selecteer minimaal één status om formulieren te tonen.</div>
            )}

            {!instancesLoading &&
              !instancesError &&
              selectedStatuses.length > 0 &&
              formTypeOptions.length > 0 &&
              selectedFormTypes.length === 0 && (
                <div className="muted">Selecteer minimaal één formuliertype om formulieren te tonen.</div>
              )}

            {!instancesLoading &&
              !instancesError &&
              selectedStatuses.length > 0 &&
              selectedFormTypes.length > 0 &&
              visibleRows.length === 0 && (
                <div className="muted">Geen formulieren gevonden voor deze filters.</div>
              )}

            {visibleRows.length > 0 && (
              <div className="forms-instance-list">
                {visibleRows.map(({ item, depth }) => {
                  const itemId = Number(item.form_instance_id);
                  const followUpFormCode = String(item.form_code || "").trim();
                  const followUpFormLabel =
                    String(item.form_name || item.form_code || "").trim() || "Onbekend formulier";

                  const childPreflight = getChildPreflight(itemId);
                  const childBlocking = Array.isArray(childPreflight?.blocking) ? childPreflight.blocking : [];
                  const childWarnings = Array.isArray(childPreflight?.warnings) ? childPreflight.warnings : [];
                  const childOkToStart = Boolean(childPreflight?.ok_to_start) && !historical;
                  const childLoading = getChildPreflightLoading(itemId);
                  const childError = getChildPreflightError(itemId);
                  const childExpanded = expandedFollowUpForId === itemId;
                  const canFollowUp = !historical && canStartFollowUp(item);
                  const iconKey = String(itemId);
                  const openIconKey = `open-${itemId}`;
                  const childStartClickable =
                    childOkToStart &&
                    typeof onOpenChildForm === "function" &&
                    Boolean(followUpFormCode);

                  const modifiedAt = item.updated_at || item.created_at;
                  const modifiedBy = getLastModifiedBy(item);

                  function openChildForm() {
                    if (!childStartClickable) return;
                    onOpenChildForm?.(itemId, followUpFormCode);
                  }

                  return (
                    <div
                      key={item.form_instance_id}
                      className={`forms-instance-row ${depth > 0 ? "forms-instance-row--child" : ""}`}
                      style={{ "--forms-row-depth": depth }}
                    >
                      <div className="forms-instance-top">
                        <div className="forms-instance-main">
                          <div className="forms-instance-title-row">
                            <div className="forms-instance-title">
                              {item.form_name || item.form_code || `Formulier ${item.form_instance_id}`}
                            </div>

                            <StatusTag status={item.status} />
                            <SummaryTag title="Formuliernummer">#{item.form_instance_id}</SummaryTag>
                            <SummaryTag title="Versie">v{item.version_label || "-"}</SummaryTag>
                            <AssignedTag item={item} />

                            {item.parent_instance_id ? (
                              <RelationTag title="Vervolgrelatie">
                                Vervolg op formulier #{item.parent_instance_id}
                              </RelationTag>
                            ) : null}

                            {item.relations?.has_children ? (
                              <SummaryTag title="Aantal vervolgformulieren">
                                {item.relations.child_count || 0} vervolg
                              </SummaryTag>
                            ) : null}
                          </div>

                          {item.instance_title ? (
                            <div className="muted forms-instance-sub">
                              {item.instance_title}
                            </div>
                          ) : null}

                          {item.instance_note ? (
                            <div className="muted forms-instance-note">
                              {item.instance_note}
                            </div>
                          ) : null}
                        </div>

                        <div className="forms-instance-audit">
                          <div>Laatste wijziging: {formatCompactDateTime(modifiedAt)}</div>
                          <div className="muted">door {modifiedBy}</div>
                          <div className="muted forms-instance-created">
                            Aangemaakt: {formatCompactDateTime(item.created_at)}
                            {item.created_by ? ` door ${item.created_by}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="forms-instance-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onOpenExistingForm?.(item.form_instance_id)}
                          onMouseEnter={() => openFormIconRefs.current[openIconKey]?.startAnimation?.()}
                          onMouseLeave={() => openFormIconRefs.current[openIconKey]?.stopAnimation?.()}
                        >
                          <ArrowBigRightIcon
                            ref={(el) => {
                              openFormIconRefs.current[openIconKey] = el;
                            }}
                            size={18}
                            className="nav-anim-icon"
                          />
                          Open formulier
                        </button>

                        {canFollowUp && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setExpandedFollowUpForId((prev) => (prev === itemId ? null : itemId));
                            }}
                            onMouseEnter={() => followUpToggleIconRefs.current[iconKey]?.startAnimation?.()}
                            onMouseLeave={() => followUpToggleIconRefs.current[iconKey]?.stopAnimation?.()}
                          >
                            {childExpanded ? (
                              <ChevronUpIcon
                                ref={(el) => {
                                  followUpToggleIconRefs.current[iconKey] = el;
                                }}
                                size={18}
                                className="nav-anim-icon"
                              />
                            ) : (
                              <PlusIcon
                                ref={(el) => {
                                  followUpToggleIconRefs.current[iconKey] = el;
                                }}
                                size={18}
                                className="nav-anim-icon"
                              />
                            )}
                            Vervolgformulier
                          </button>
                        )}
                      </div>

                      {childExpanded && canFollowUp && (
                        <div className="forms-followup-panel">
                          <div className="muted ember-small-text">
                            Start een vervolgformulier op basis van formulier #{item.form_instance_id}.
                          </div>

                          <div className="forms-followup-actions">
                            <RelationTag title="Vervolgtype">
                              {followUpFormLabel}
                            </RelationTag>

                            <button
                              type="button"
                              className="btn btn-secondary forms-nowrap-action"
                              disabled={!followUpFormCode || childLoading || historical}
                              onClick={() => runChildPreflight(itemId, followUpFormCode)}
                            >
                              <ClipboardCheckIcon size={18} />
                              Status controleren
                            </button>
                          </div>

                          {childLoading && <div className="muted">Status laden...</div>}
                          {childError && <div className="ember-error-text">{childError}</div>}

                          {childPreflight && (
                            <>
                              <div
                                className={`card forms-status-card ${
                                  childStartClickable ? "forms-status-card--clickable" : ""
                                }`}
                                role={childStartClickable ? "button" : undefined}
                                tabIndex={childStartClickable ? 0 : -1}
                                onClick={() => {
                                  if (childStartClickable) openChildForm();
                                }}
                                onKeyDown={(e) => {
                                  if (!childStartClickable) return;
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openChildForm();
                                  }
                                }}
                                onMouseEnter={() => {
                                  followUpStatusIconRefs.current[iconKey]?.startAnimation?.();
                                  if (childOkToStart) {
                                    followUpStatusArrowRefs.current[iconKey]?.startAnimation?.();
                                  }
                                }}
                                onMouseLeave={() => {
                                  followUpStatusIconRefs.current[iconKey]?.stopAnimation?.();
                                  if (childOkToStart) {
                                    followUpStatusArrowRefs.current[iconKey]?.stopAnimation?.();
                                  }
                                }}
                                title={
                                  childOkToStart
                                    ? "Start vervolgformulier"
                                    : "Nog niet startklaar"
                                }
                              >
                                <div className="forms-status-main">
                                  {childOkToStart ? (
                                    <BookmarkCheckIcon
                                      ref={(el) => {
                                        followUpStatusIconRefs.current[iconKey] = el;
                                      }}
                                      size={18}
                                    />
                                  ) : (
                                    <BookmarkXIcon
                                      ref={(el) => {
                                        followUpStatusIconRefs.current[iconKey] = el;
                                      }}
                                      size={18}
                                    />
                                  )}

                                  <div className="forms-status-text">
                                    <div className="forms-status-title">
                                      {childOkToStart ? "Startklaar" : "Nog niet startklaar"}
                                    </div>
                                    <div className="muted forms-status-sub">
                                      {childOkToStart
                                        ? "Alle checks zijn in orde. Start het vervolgformulier."
                                        : "Los blokkades op en controleer waarschuwingen."}
                                    </div>
                                  </div>
                                </div>

                                {childOkToStart && (
                                  <div className="forms-status-action">
                                    <div className="muted forms-status-action-text">
                                      Start vervolgformulier
                                    </div>

                                    <div className="icon-btn forms-status-action-icon" aria-hidden="true">
                                      <RocketIcon
                                        ref={(el) => {
                                          followUpStatusArrowRefs.current[iconKey] = el;
                                        }}
                                        size={18}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {childBlocking.length > 0 && (
                                <div className="card forms-preflight-card forms-preflight-card--blocking">
                                  <div className="forms-card-title">Blokkades</div>

                                  <div className="forms-preflight-list">
                                    {childBlocking.map((b, idx) => (
                                      <PreflightRow
                                        key={`${itemId}-${b?.key || "cb"}-${idx}`}
                                        item={b}
                                        kind="blocking"
                                        onOpenTab={onOpenTab}
                                        showDivider={idx > 0}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {childWarnings.length > 0 && (
                                <div className="card forms-preflight-card">
                                  <div className="forms-card-title">Waarschuwingen</div>

                                  <div className="forms-preflight-list">
                                    {childWarnings.map((w, idx) => (
                                      <PreflightRow
                                        key={`${itemId}-${w?.key || "cw"}-${idx}`}
                                        item={w}
                                        kind="warning"
                                        onOpenTab={onOpenTab}
                                        showDivider={idx > 0}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
