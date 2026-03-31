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

const STATUS_FILTER_OPTIONS = [
  { key: "INGEDIEND", label: "Ingediend" },
  { key: "IN_BEHANDELING", label: "In behandeling" },
  { key: "AFGEHANDELD", label: "Definitief" },
  { key: "CONCEPT", label: "Concept" },
  { key: "INGETROKKEN", label: "Ingetrokken" },
];

const DEFAULT_SELECTED_STATUSES = STATUS_FILTER_OPTIONS.map((x) => x.key);

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
  if (tone === "active") return "monitor-tag monitor-tag--active";
  if (tone === "neutral") return "monitor-tag monitor-tag--neutral";
  if (tone === "success") return "monitor-tag monitor-tag--success";
  return "monitor-tag monitor-tag--muted";
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

function TypeFilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={active ? "monitor-tag monitor-tag--neutral" : "monitor-tag monitor-tag--muted"}
      style={{
        cursor: "pointer",
        opacity: active ? 1 : 0.78,
      }}
    >
      {label}
    </button>
  );
}

function SummaryTag({ children, title }) {
  return (
    <span className="monitor-tag monitor-tag--muted" title={title}>
      {children}
    </span>
  );
}

function getLastModifiedBy(item) {
  if (!item) return "-";
  return item.updated_by || item.submitted_by || item.created_by || "-";
}

function canStartFollowUp(item) {
  const status = String(item?.status || "").trim();
  if (!item?.form_instance_id) return false;
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

export default function FormsTab({
  code,
  installation,
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
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsError, setFormsError] = useState(null);
  const [forms, setForms] = useState([]);

  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesError, setInstancesError] = useState(null);
  const [instances, setInstances] = useState([]);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState(DEFAULT_SELECTED_STATUSES);
  const [selectedFormTypes, setSelectedFormTypes] = useState([]);

  const [expandedFollowUpForId, setExpandedFollowUpForId] = useState(null);
  const [childFormCodeByParentId, setChildFormCodeByParentId] = useState({});
  const [childPreflightByParentId, setChildPreflightByParentId] = useState({});
  const [childPreflightLoadingByParentId, setChildPreflightLoadingByParentId] = useState({});
  const [childPreflightErrorByParentId, setChildPreflightErrorByParentId] = useState({});

  const checklistIconRef = useRef(null);
  const statusIconRef = useRef(null);
  const statusArrowRef = useRef(null);
  const searchIconRef = useRef(null);
  const refreshIconRef = useRef(null);
  const followUpToggleIconRefs = useRef({});
  const followUpActionIconRefs = useRef({});
  const followUpStatusIconRefs = useRef({});
  const followUpStatusArrowRefs = useRef({});
  const openFormIconRefs = useRef({});
  const hasInitializedTypeFiltersRef = useRef(false);

  const lastAutoRefreshKeyRef = useRef("");

  useEffect(() => {
    onAnyOpenChange?.(false);
  }, [onAnyOpenChange]);

  const typeKey = installation?.installation_type_key || null;

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

  const okToStart = Boolean(preflight?.ok_to_start);

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
      setSelectedFormTypes(availableKeys);
      return;
    }

    setSelectedFormTypes((prev) => {
      const prevSet = new Set(prev);
      const hadAllSelected =
        prev.length > 0 &&
        prev.length === availableKeys.filter((key) => prevSet.has(key)).length &&
        prev.length <= availableKeys.length;

      if (hadAllSelected) {
        return availableKeys;
      }

      return availableKeys.filter((key) => prevSet.has(key));
    });
  }, [formTypeOptions]);

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

  function getChildFormCode(parentId) {
    return childFormCodeByParentId[String(parentId)] || "";
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

    setChildFormCodeByParentId((prev) => ({
      ...prev,
      [key]: cleanFormCode || "",
    }));
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
      return <div className="muted" style={{ paddingTop: 6 }}>Status laden…</div>;
    }

    if (preflightError) {
      return <div style={{ color: "salmon", paddingTop: 6 }}>{preflightError}</div>;
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
        className="card"
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
        style={{
          cursor: isClickable ? "pointer" : "default",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
        }}
        title={
          okToStart
            ? (isClickable ? `Start ${selectedLabel}` : "Formulier openen volgt")
            : "Nog niet startklaar"
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <StatusIcon ref={statusIconRef} size={18} />
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {okToStart ? "Startklaar" : "Nog niet startklaar"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {okToStart
                ? "Alle checks zijn in orde. Klik om het formulier te starten."
                : "Los blokkades op en controleer waarschuwingen."}
            </div>
          </div>
        </div>

        {okToStart && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
            <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              Start formulier
            </div>

            <div className="icon-btn" style={{ flex: "0 0 auto" }} aria-hidden="true">
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
      return <div className="muted" style={{ paddingTop: 10 }}>Preflight laden…</div>;
    }

    if (preflightError) {
      return <div style={{ color: "salmon", paddingTop: 10 }}>{preflightError}</div>;
    }

    if (!preflight) return null;

    return (
      <div style={{ display: "grid", gap: 10 }}>
        {blocking.length > 0 && (
          <div className="card" style={{ borderColor: "salmon" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Blokkades</div>

            <div style={{ display: "grid" }}>
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
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Waarschuwingen</div>

            <div style={{ display: "grid" }}>
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
          <div className="card">
            <div className="muted" style={{ fontSize: 13 }}>
              Geen blokkades of waarschuwingen.
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Kies een formulier om te starten.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ minWidth: 360 }}
            value={selectedFormCode || ""}
            onChange={(e) => onSelectForm?.(e.target.value || null)}
            disabled={formsLoading}
          >
            <option value="">
              {formsLoading ? "Formulieren laden…" : "Selecteer formulier"}
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
            className="btn btn-secondary"
            disabled={!selectedFormCode || preflightLoading}
            onClick={() => onStartChecklist?.()}
            title={selectedFormCode ? "Status controleren" : "Kies eerst een formulier"}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
            onMouseEnter={() => checklistIconRef.current?.startAnimation?.()}
            onMouseLeave={() => checklistIconRef.current?.stopAnimation?.()}
          >
            <ClipboardCheckIcon ref={checklistIconRef} size={18} />
            Status controleren
          </button>
        </div>

        {formsError && <div style={{ color: "salmon" }}>{formsError}</div>}

        {!formsLoading && !formsError && typeKey && formOptions.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>
            Geen formulieren beschikbaar voor installatiesoort: {typeKey}
          </div>
        )}
      </div>

      {renderStatusRow()}

      {renderPreflight()}

      {hasPreflight && !okToStart && blocking.length > 0 && (
        <div className="muted" style={{ fontSize: 12 }}>
          Los eerst de blokkades op om te kunnen starten.
        </div>
      )}

      <div
        className="card"
        style={{
          display: "grid",
          gap: 12,
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
          <div style={{ fontWeight: 700 }}>Bestaande formulieren</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {instancesLoading ? "laden..." : `${filteredInstances.length} formulier(en)`}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ minWidth: 320, flex: "1 1 360px" }}
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
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              onMouseEnter={() => refreshIconRef.current?.startAnimation?.()}
              onMouseLeave={() => refreshIconRef.current?.stopAnimation?.()}
            >
              <RefreshCWIcon ref={refreshIconRef} size={18} />
              Verversen
            </button>
          </div>
        </div>

        {instancesError && <div style={{ color: "salmon" }}>{instancesError}</div>}

        {!instancesLoading && !instancesError && selectedStatuses.length === 0 && (
          <div className="muted">Selecteer minimaal één status om formulieren te tonen.</div>
        )}

        {!instancesLoading && !instancesError && selectedStatuses.length > 0 && formTypeOptions.length > 0 && selectedFormTypes.length === 0 && (
          <div className="muted">Selecteer minimaal één formuliertype om formulieren te tonen.</div>
        )}

        {!instancesLoading && !instancesError && selectedStatuses.length > 0 && selectedFormTypes.length > 0 && visibleRows.length === 0 && (
          <div className="muted">Geen formulieren gevonden voor deze filters.</div>
        )}

        {visibleRows.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {visibleRows.map(({ item, depth }) => {
              const itemId = Number(item.form_instance_id);
              const childFormCode = getChildFormCode(itemId);
              const childPreflight = getChildPreflight(itemId);
              const childBlocking = Array.isArray(childPreflight?.blocking) ? childPreflight.blocking : [];
              const childWarnings = Array.isArray(childPreflight?.warnings) ? childPreflight.warnings : [];
              const childOkToStart = Boolean(childPreflight?.ok_to_start);
              const childLoading = getChildPreflightLoading(itemId);
              const childError = getChildPreflightError(itemId);
              const childExpanded = expandedFollowUpForId === itemId;
              const canFollowUp = canStartFollowUp(item);
              const iconKey = String(itemId);
              const openIconKey = `open-${itemId}`;
              const childStartClickable = childOkToStart && typeof onOpenChildForm === "function";

              function openChildForm() {
                if (!childStartClickable) return;
                onOpenChildForm?.(itemId, childFormCode);
              }

              return (
                <div
                  key={item.form_instance_id}
                  style={{
                    marginLeft: depth * 22,
                    padding: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    display: "grid",
                    gap: 10,
                    background: depth > 0 ? "rgba(255,255,255,0.02)" : "transparent",
                  }}
                >
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
                        <div style={{ fontWeight: 700 }}>
                          {item.form_name || item.form_code || `Formulier ${item.form_instance_id}`}
                        </div>
                        <StatusTag status={item.status} />
                        <SummaryTag title="Documentnummer">#{item.form_instance_id}</SummaryTag>
                        <SummaryTag title="Versie">v{item.version_label || "-"}</SummaryTag>
                        {item.parent_instance_id ? (
                          <SummaryTag title="Vervolg op parent">
                            Vervolg op #{item.parent_instance_id}
                          </SummaryTag>
                        ) : null}
                        {item.relations?.has_children ? (
                          <SummaryTag title="Aantal vervolgformulieren">
                            {item.relations.child_count || 0} vervolg
                          </SummaryTag>
                        ) : null}
                      </div>

                      {item.instance_title ? (
                        <div className="muted" style={{ fontSize: 13 }}>
                          {item.instance_title}
                        </div>
                      ) : null}

                      {item.instance_note ? (
                        <div className="muted" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
                          {item.instance_note}
                        </div>
                      ) : null}
                    </div>

                    <div className="muted" style={{ fontSize: 12, display: "grid", gap: 2, textAlign: "right" }}>
                      <div>Laatste wijziging: {formatDateTime(item.updated_at || item.created_at)}</div>
                      <div>Laatst gewijzigd door: {getLastModifiedBy(item)}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onOpenExistingForm?.(item.form_instance_id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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
                        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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
                    <div
                      style={{
                        padding: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 12,
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div className="muted" style={{ fontSize: 13 }}>
                        Start een vervolgformulier op basis van document #{item.form_instance_id}.
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          className="input"
                          style={{ minWidth: 320 }}
                          value={childFormCode}
                          onChange={(e) => {
                            const nextCode = e.target.value || "";
                            setChildFormCodeByParentId((prev) => ({
                              ...prev,
                              [String(itemId)]: nextCode,
                            }));
                            setChildPreflightByParentId((prev) => ({
                              ...prev,
                              [String(itemId)]: null,
                            }));
                            setChildPreflightErrorByParentId((prev) => ({
                              ...prev,
                              [String(itemId)]: null,
                            }));
                          }}
                          disabled={formsLoading}
                        >
                          <option value="">
                            {formsLoading ? "Formulieren laden…" : "Selecteer vervolgformulier"}
                          </option>

                          {formOptions.map((f) => (
                            <option key={`${itemId}-${f.code}`} value={f.code}>
                              {f.name ? `${f.name}` : f.code}
                              {f.is_applicable === false ? " (niet toepasbaar)" : ""}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={!childFormCode || childLoading}
                          onClick={() => runChildPreflight(itemId, childFormCode)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
                        >
                          <ClipboardCheckIcon size={18} />
                          Status controleren
                        </button>
                      </div>

                      {childLoading && <div className="muted">Status laden…</div>}
                      {childError && <div style={{ color: "salmon" }}>{childError}</div>}

                      {childPreflight && (
                        <>
                          <div
                            className="card"
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
                            style={{
                              cursor: childStartClickable ? "pointer" : "default",
                              padding: "12px 14px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              width: "100%",
                            }}
                            title={
                              childOkToStart
                                ? "Start vervolgformulier"
                                : "Nog niet startklaar"
                            }
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
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
                              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>
                                  {childOkToStart ? "Startklaar" : "Nog niet startklaar"}
                                </div>
                                <div className="muted" style={{ fontSize: 12 }}>
                                  {childOkToStart
                                    ? "Alle checks zijn in orde. Start het vervolgformulier."
                                    : "Los blokkades op en controleer waarschuwingen."}
                                </div>
                              </div>
                            </div>

                            {childOkToStart && (
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
                                <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                                  Start vervolgformulier
                                </div>

                                <div className="icon-btn" style={{ flex: "0 0 auto" }} aria-hidden="true">
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
                            <div className="card" style={{ borderColor: "salmon" }}>
                              <div style={{ fontWeight: 600, marginBottom: 8 }}>Blokkades</div>
                              <div style={{ display: "grid" }}>
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
                            <div className="card">
                              <div style={{ fontWeight: 600, marginBottom: 8 }}>Waarschuwingen</div>
                              <div style={{ display: "grid" }}>
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
      style={{
        cursor: canNavigate ? "pointer" : "default",
        paddingTop: showDivider ? 10 : 0,
        marginTop: showDivider ? 10 : 0,
        borderTop: showDivider ? "1px solid rgba(255,255,255,0.08)" : "none",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
      title={canNavigate ? "Open tab" : undefined}
    >
      <div style={{ display: "grid", gap: 3 }}>
        <div style={{ fontSize: 13 }}>{message}</div>

        {item?.key && (
          <div className="muted" style={{ fontSize: 12 }}>
            {kind === "blocking" ? "blocking" : "warning"}: {item.key}
          </div>
        )}
      </div>

      {canNavigate && (
        <div className="icon-btn" title="Open tab" style={{ flex: "0 0 auto" }}>
          <ArrowBigRightIcon ref={navIconRef} size={18} className="nav-anim-icon" />
        </div>
      )}
    </div>
  );
}