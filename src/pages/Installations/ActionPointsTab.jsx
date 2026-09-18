import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import {
  createInstallationFollowUp,
  getInstallationDrawings,
  getInstallationFollowUpCatalog,
  getInstallationWorkflowItems,
  getUserDirectory,
  historicalizeAllComponentPins,
  updateDrawingPin,
  updateInstallationFollowUp,
  updateInstallationFollowUpStatus,
} from "../../api/emberApi.js";
import AnimatedIconButton from "../../components/AnimatedIconButton.jsx";
import DateInput from "../../components/DateInput.jsx";
import { ArchiveIcon } from "../../components/ui/archive.jsx";
import { ChevronLeftIcon } from "../../components/ui/chevron-left.jsx";
import { ChevronRightIcon } from "../../components/ui/chevron-right.jsx";
import { HistoryIcon } from "../../components/ui/history.jsx";
import { MapPinIcon } from "../../components/ui/map-pin.jsx";
import { PlusIcon } from "../../components/ui/plus.jsx";
import { RotateCCWIcon } from "../../components/ui/rotate-ccw.jsx";
import { BadgeAlertIcon } from "../../components/ui/badge-alert.jsx";
import { MapPinPlusInsideIcon } from "../../components/ui/map-pin-plus-inside.jsx";
import { MessageSquareMoreIcon } from "../../components/ui/message-square-more.jsx";
import { statusLabel } from "../Monitor/formsMonitorShared.jsx";
import ActionPointCard from "./actionPoints/ActionPointCard.jsx";
import {
  EMPTY_FILTERS,
  GROUP_OPTIONS,
  PRIORITIES,
  RESPONSIBILITIES,
  SORT_OPTIONS,
  SOURCE_LABELS,
  groupActionPoints,
  hasActiveFilters,
  isTerminalStatus,
  matchesFilters,
  sortActionPoints,
  summarize,
} from "./actionPoints/actionPointsShared.js";

const PIN_FILTERS = [
  { value: "ALL", label: "Alle markeringen" },
  { value: "COMPONENT_PLACED", label: "Component geplaatst" },
  { value: "DEFICIENCY", label: "Tekortkomingen" },
  { value: "NOTE", label: "Opmerkingen" },
];

const PIN_META = {
  COMPONENT_PLACED: { label: "Component geplaatst", Icon: MapPinPlusInsideIcon, tone: "primary" },
  DEFICIENCY: { label: "Tekortkoming", Icon: BadgeAlertIcon, tone: "danger" },
  NOTE: { label: "Opmerking", Icon: MessageSquareMoreIcon, tone: "note" },
};

const EMPTY_DRAFT = {
  title: "",
  description: "",
  status: "OPEN",
  priority: "NORMAL",
  responsibility_type: "INTERN",
  assigned_user_object_id: "",
  assigned_role_code: "",
  due_date: null,
  tags: "",
  drawing_pin_id: "",
  attachment_stored_file_ids: [],
};

function Tag({ tone = "muted", title, children }) {
  return (
    <span className={`monitor-tag monitor-tag--${tone}`} title={title}>
      {children}
    </span>
  );
}

function SummaryTile({ label, value, tone = "muted", active = false, onClick, hint }) {
  const className = `action-point-summary__tile action-point-summary__tile--${tone}${
    active ? " is-active" : ""
  }`;

  if (!onClick) {
    return (
      <div className={className} title={hint}>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick} aria-pressed={active} title={hint}>
      <strong>{value}</strong>
      <span>{label}</span>
    </button>
  );
}

function DrawingPinCard({ pin, busy, readOnly, selected = false, onOpenDrawing, onStatusChange }) {
  const meta = PIN_META[pin.pin_kind] || PIN_META.NOTE;
  const Icon = meta.Icon;
  const isHistorical = String(pin.pin_status || "").toUpperCase() === "HISTORICAL";
  const needsDrawingRevision = pin.pin_kind === "COMPONENT_PLACED" && !isHistorical;

  return (
    <article
      className={`follow-up-pin-card follow-up-pin-card--${meta.tone}${isHistorical ? " is-historical" : ""}${
        selected ? " is-selected" : ""
      }`}
    >
      <div className="follow-up-pin-card__icon">
        <Icon size={22} className="nav-anim-icon" />
      </div>
      <div className="follow-up-pin-card__body">
        <div className="follow-up-pin-card__head">
          <strong>{pin.label || meta.label}</strong>
          <Tag tone={needsDrawingRevision ? "warning" : isHistorical ? "muted" : "active"}>
            {needsDrawingRevision
              ? "Nog verwerken in tekenrevisie"
              : isHistorical
                ? "Historisch / verwerkt"
                : "Actief"}
          </Tag>
        </div>
        {pin.description ? <div className="follow-up-pin-card__description">{pin.description}</div> : null}
        <div className="follow-up-card__meta">
          <span>{meta.label}</span>
          <span>
            {pin.drawing_title || pin.drawing_file_name || "Tekening"}; pagina {pin.page_number}
          </span>
          <span>
            {pin.follow_up_count || 0} gekoppeld actiepunt
            {Number(pin.follow_up_count || 0) === 1 ? "" : "en"}
          </span>
        </div>
      </div>
      <div className="follow-up-pin-card__actions">
        <AnimatedIconButton Icon={MapPinIcon} iconSize={16} onClick={() => onOpenDrawing(pin)}>
          Toon op tekening
        </AnimatedIconButton>
        <AnimatedIconButton
          Icon={isHistorical ? RotateCCWIcon : ArchiveIcon}
          iconSize={16}
          disabled={readOnly || busy}
          onClick={() => onStatusChange(pin, isHistorical ? "ACTIVE" : "HISTORICAL")}
        >
          {busy ? "Opslaan..." : isHistorical ? "Opnieuw actief" : "Historisch zetten"}
        </AnimatedIconButton>
      </div>
    </article>
  );
}

export default function ActionPointsTab({
  code,
  readOnly = false,
  initialDrawingPinId = "",
  initialView = "actions",
  onCountChange,
  onOpenDrawing,
  onSetLocation,
}) {
  const [data, setData] = useState({ items: [], activeItems: [], historicalItems: [], counts: {} });
  const [catalog, setCatalog] = useState({
    statuses: [],
    workflow_roles: [],
    attachments: [],
    concept_form_points: [],
  });
  const [drawingData, setDrawingData] = useState({ drawings: [], pins: [] });
  const [directory, setDirectory] = useState([]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState("PRIORITY");
  const [groupKey, setGroupKey] = useState("SOURCE");
  const [showHistory, setShowHistory] = useState(false);

  const [draft, setDraft] = useState({ ...EMPTY_DRAFT, drawing_pin_id: initialDrawingPinId || "" });
  const [showCreate, setShowCreate] = useState(Boolean(initialDrawingPinId));
  const [activeView, setActiveView] = useState(initialView === "drawings" ? "drawings" : "actions");

  const [pinFilter, setPinFilter] = useState("ALL");
  const [showHistoricalPins, setShowHistoricalPins] = useState(false);
  const [reviewPinId, setReviewPinId] = useState("");
  const [pinBusy, setPinBusy] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [items, nextCatalog, userDirectory, drawings] = await Promise.all([
      getInstallationWorkflowItems(code),
      getInstallationFollowUpCatalog(code),
      getUserDirectory().catch(() => ({ items: [] })),
      getInstallationDrawings(code).catch(() => ({ drawings: [], pins: [] })),
    ]);

    setData(items || { items: [], activeItems: [], historicalItems: [], counts: {} });
    setCatalog(
      nextCatalog || { statuses: [], workflow_roles: [], attachments: [], concept_form_points: [] }
    );
    setDirectory(userDirectory?.items || userDirectory?.users || []);
    setDrawingData(drawings || { drawings: [], pins: [] });
    onCountChange?.(Number(items?.counts?.open || 0));
  }, [code, onCountChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((err) => active && setError(err?.message || "Actiepunten laden is mislukt."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (!initialDrawingPinId) return;
    setDraft((value) => ({ ...value, drawing_pin_id: initialDrawingPinId }));
    setShowCreate(true);
    setActiveView("actions");
  }, [initialDrawingPinId]);

  useEffect(() => {
    if (initialView === "drawings") setActiveView("drawings");
  }, [initialView]);

  const allItems = useMemo(
    () => data.items || [...(data.activeItems || []), ...(data.historicalItems || [])],
    [data.items, data.activeItems, data.historicalItems]
  );

  const statusDisplayName = useCallback(
    (statusCode) => {
      const match = (catalog.statuses || []).find((entry) => entry.status_code === statusCode);
      return match?.display_name || statusLabel(statusCode);
    },
    [catalog.statuses]
  );

  const summary = useMemo(() => summarize(allItems), [allItems]);

  const conceptPoints = useMemo(() => catalog.concept_form_points || [], [catalog.concept_form_points]);
  const conceptPointTotal = useMemo(
    () => conceptPoints.reduce((total, entry) => total + Number(entry.open_point_count || 0), 0),
    [conceptPoints]
  );

  // De historie staat standaard uit; wie hem aanzet krijgt afgehandelde en vervallen punten
  // in dezelfde lijst en dezelfde groepering, zodat er geen tweede lijst nodig is.
  const visibleItems = useMemo(() => {
    const scoped = showHistory ? allItems : allItems.filter((item) => !isTerminalStatus(item.status));
    return sortActionPoints(
      scoped.filter((item) => matchesFilters(item, filters)),
      sortKey
    );
  }, [allItems, showHistory, filters, sortKey]);

  const groups = useMemo(
    () => groupActionPoints(visibleItems, groupKey, statusDisplayName),
    [visibleItems, groupKey, statusDisplayName]
  );

  const visiblePins = useMemo(
    () =>
      (drawingData.pins || []).filter((pin) => {
        if (!showHistoricalPins && String(pin.pin_status || "").toUpperCase() === "HISTORICAL") return false;
        return pinFilter === "ALL" || pin.pin_kind === pinFilter;
      }),
    [drawingData.pins, pinFilter, showHistoricalPins]
  );

  const activeComponentPins = useMemo(
    () =>
      (drawingData.pins || []).filter(
        (pin) =>
          pin.pin_kind === "COMPONENT_PLACED" && String(pin.pin_status || "").toUpperCase() === "ACTIVE"
      ),
    [drawingData.pins]
  );
  const activeComponentCount = activeComponentPins.length;
  const reviewIndex = Math.max(
    0,
    activeComponentPins.findIndex((pin) => String(pin.drawing_pin_id) === reviewPinId)
  );
  const reviewPin = activeComponentPins[reviewIndex] || null;

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: current[key] === value ? "ALL" : value }));
  }

  async function reloadDrawingData() {
    const drawings = await getInstallationDrawings(code);
    setDrawingData(drawings || { drawings: [], pins: [] });
    return drawings;
  }

  function openDrawing(pin, options = {}) {
    onOpenDrawing?.(pin, options);
  }

  function openPhoto(url) {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function changePinStatus(pin, pinStatus) {
    const pinId = String(pin?.drawing_pin_id || "");
    if (!pinId || readOnly) return;

    setPinBusy(pinId);
    setError("");

    try {
      await updateDrawingPin(code, pinId, { ...pin, pin_status: pinStatus });
      const previousIndex = activeComponentPins.findIndex((item) => String(item.drawing_pin_id) === pinId);
      const drawings = await reloadDrawingData();
      const nextComponents = (drawings?.pins || []).filter(
        (item) =>
          item.pin_kind === "COMPONENT_PLACED" && String(item.pin_status || "").toUpperCase() === "ACTIVE"
      );

      if (pinStatus === "HISTORICAL" && pin.pin_kind === "COMPONENT_PLACED") {
        const nextPin =
          nextComponents[Math.min(Math.max(0, previousIndex), Math.max(0, nextComponents.length - 1))];
        setReviewPinId(String(nextPin?.drawing_pin_id || ""));
      }
    } catch (requestError) {
      setError(
        requestError?.status === 409
          ? "De markering is intussen gewijzigd. De actuele gegevens worden opnieuw geladen."
          : requestError?.message || "Markering bijwerken is mislukt."
      );
      await reloadDrawingData().catch(() => undefined);
    } finally {
      setPinBusy("");
    }
  }

  async function historicalizeAllComponents() {
    if (readOnly || !activeComponentCount) return;
    if (
      !window.confirm(
        `Alle ${activeComponentCount} actieve componentmarkeringen van deze installatie historisch zetten? Gebruik dit pas nadat ze in de nieuwe tekenrevisie zijn verwerkt.`
      )
    ) {
      return;
    }

    setPinBusy("ALL_COMPONENTS");
    setError("");

    try {
      await historicalizeAllComponentPins(code);
      setReviewPinId("");
      setShowHistoricalPins(true);
      await reloadDrawingData();
    } catch (requestError) {
      setError(requestError?.message || "Componentmarkeringen historisch zetten is mislukt.");
    } finally {
      setPinBusy("");
    }
  }

  function startComponentReview() {
    setPinFilter("COMPONENT_PLACED");
    setShowHistoricalPins(false);
    setReviewPinId(String(activeComponentPins[0]?.drawing_pin_id || ""));
  }

  function moveReview(offset) {
    if (!activeComponentPins.length) return;
    const nextIndex = (reviewIndex + offset + activeComponentPins.length) % activeComponentPins.length;
    setReviewPinId(String(activeComponentPins[nextIndex].drawing_pin_id));
  }

  function setDraftField(key, value) {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "assigned_user_object_id" && value ? { assigned_role_code: "" } : {}),
      ...(key === "assigned_role_code" && value ? { assigned_user_object_id: "" } : {}),
    }));
  }

  async function createAction(event) {
    event.preventDefault();
    if (!String(draft.title || "").trim()) {
      setError("Vul een titel in.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const selectedUser = directory.find(
        (entry) => String(entry.user_object_id) === String(draft.assigned_user_object_id)
      );

      await createInstallationFollowUp(code, {
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        category: draft.tags.trim() || null,
        assigned_display_name_snapshot: selectedUser?.display_name || selectedUser?.name || null,
        assigned_email_snapshot: selectedUser?.email || null,
      });

      setDraft({ ...EMPTY_DRAFT });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(
        err?.status === 409
          ? "De installatie is intussen gewijzigd. Vernieuw en probeer opnieuw."
          : err?.message || "Actiepunt aanmaken is mislukt."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item, status) {
    const id = String(item.follow_up_action_id);
    if (String(item.status || "").toUpperCase() === String(status || "").toUpperCase()) return;

    setRowBusy(id);
    setError("");

    try {
      await updateInstallationFollowUpStatus(code, id, status, item.row_version);
      await load();
    } catch (err) {
      setError(
        err?.status === 409
          ? "Het actiepunt is intussen gewijzigd. De actuele gegevens worden opnieuw geladen."
          : err?.message || "Status wijzigen is mislukt."
      );
      await load().catch(() => undefined);
    } finally {
      setRowBusy("");
    }
  }

  async function saveAction(item, payload) {
    const id = String(item.follow_up_action_id);
    setRowBusy(id);
    setError("");

    try {
      await updateInstallationFollowUp(code, id, { ...payload, row_version: item.row_version });
      await load();
    } catch (err) {
      setError(
        err?.status === 409
          ? "Het actiepunt is intussen gewijzigd. De actuele gegevens worden opnieuw geladen."
          : err?.message || "Actiepunt bijwerken is mislukt."
      );
      await load().catch(() => undefined);
    } finally {
      setRowBusy("");
    }
  }

  const filtersActive = hasActiveFilters(filters);

  return (
    <div className="follow-ups-page action-points-page">
      <div className="follow-ups-toolbar">
        <div>
          <h2>Actiepunten</h2>
          <p className="ember-page-subtitle">
            Alles wat nog moet gebeuren op deze installatie; uit formulieren, inspecties en handmatig
            aangemaakt, met de markering op de tekening en de foto's erbij.
          </p>
        </div>
        <AnimatedIconButton
          Icon={PlusIcon}
          iconSize={18}
          className="btn"
          disabled={readOnly}
          onClick={() => {
            setActiveView("actions");
            setShowCreate((value) => !value);
          }}
        >
          Nieuw actiepunt
        </AnimatedIconButton>
      </div>

      <div className="forms-hub-tabs follow-ups-subtabs" role="tablist" aria-label="Actiepunten">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "actions"}
          className={`btn ${activeView === "actions" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveView("actions")}
        >
          Actiepunten; {summary.total - summary.done}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "drawings"}
          className={`btn ${activeView === "drawings" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveView("drawings")}
        >
          Tekenwerk en markeringen; {activeComponentCount}
        </button>
      </div>

      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {loading ? <div className="muted">Actiepunten laden...</div> : null}

      {activeView === "actions" ? (
        <>
          <section className="action-point-summary" aria-label="Samenvatting van de actiepunten">
            <SummaryTile
              label="Openstaand"
              value={summary.open}
              tone="active"
              active={filters.status === "OPEN"}
              onClick={() => toggleFilter("status", "OPEN")}
              hint="Nog niet opgepakt of nog in behandeling"
            />
            <SummaryTile
              label="Te laat"
              value={summary.overdue}
              tone="danger"
              active={filters.overdueOnly}
              onClick={() => setFilter("overdueOnly", !filters.overdueOnly)}
              hint="Deadline verstreken en nog niet afgehandeld"
            />
            <SummaryTile
              label="Gepland"
              value={summary.planned}
              tone="muted"
              active={filters.status === "GEPLAND"}
              onClick={() => toggleFilter("status", "GEPLAND")}
            />
            <SummaryTile
              label="Wacht op derden"
              value={summary.waiting}
              tone="muted"
              active={filters.status === "WACHTENOPDERDEN"}
              onClick={() => toggleFilter("status", "WACHTENOPDERDEN")}
            />
            <SummaryTile
              label="Hoog of kritiek"
              value={summary.critical}
              tone="warning"
              active={filters.priority === "HIGH" || filters.priority === "CRITICAL"}
              onClick={() => toggleFilter("priority", "CRITICAL")}
              hint="Klik voor kritiek; kies hoog in het filter hieronder"
            />
            <SummaryTile
              label="Raakt certificaat"
              value={summary.certificate}
              tone="danger"
              active={filters.certificateOnly}
              onClick={() => setFilter("certificateOnly", !filters.certificateOnly)}
            />
            <SummaryTile
              label="Zonder locatie"
              value={summary.withoutLocation}
              tone="warning"
              active={filters.location === "WITHOUT"}
              onClick={() => toggleFilter("location", "WITHOUT")}
              hint="Nog geen markering op een tekening"
            />
            <SummaryTile label="Afgehandeld" value={summary.done} tone="muted" />
          </section>

          <section className="action-point-filters" aria-label="Actiepunten filteren">
            <label className="action-point-filters__search">
              <Search size={16} aria-hidden="true" />
              <input
                className="cf-input"
                type="search"
                value={filters.search}
                placeholder="Zoek op tekst, puntnummer, tag of persoon"
                onChange={(event) => setFilter("search", event.target.value)}
              />
            </label>

            <select
              className="cf-input"
              value={filters.status}
              aria-label="Status"
              onChange={(event) => setFilter("status", event.target.value)}
            >
              <option value="ALL">Alle statussen</option>
              {(catalog.statuses || []).map((status) => (
                <option key={status.status_code} value={status.status_code}>
                  {status.display_name || statusLabel(status.status_code)}
                </option>
              ))}
            </select>

            <select
              className="cf-input"
              value={filters.priority}
              aria-label="Prioriteit"
              onChange={(event) => setFilter("priority", event.target.value)}
            >
              <option value="ALL">Alle prioriteiten</option>
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="cf-input"
              value={filters.responsibility}
              aria-label="Verantwoordelijkheid"
              onChange={(event) => setFilter("responsibility", event.target.value)}
            >
              <option value="ALL">Alle verantwoordelijken</option>
              {RESPONSIBILITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="cf-input"
              value={filters.source}
              aria-label="Bron"
              onChange={(event) => setFilter("source", event.target.value)}
            >
              <option value="ALL">Alle bronnen</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              className="cf-input"
              value={sortKey}
              aria-label="Sorteren"
              onChange={(event) => setSortKey(event.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Sorteer; {option.label}
                </option>
              ))}
            </select>

            <select
              className="cf-input"
              value={groupKey}
              aria-label="Groeperen"
              onChange={(event) => setGroupKey(event.target.value)}
            >
              {GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Groepeer; {option.label}
                </option>
              ))}
            </select>

            <label className={`ember-toggle ${showHistory ? "is-on" : "is-off"}`}>
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(event) => setShowHistory(event.target.checked)}
              />
              <span className="ember-toggle__track">
                <span className="ember-toggle__thumb" />
              </span>
              <span className="ember-toggle__label">Historie tonen</span>
            </label>

            {filtersActive ? (
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                <X size={15} /> Filters wissen
              </button>
            ) : null}
          </section>

          {showCreate ? (
            <form className="card follow-up-create" onSubmit={createAction}>
              <div className="follow-up-create__head">
                <strong>Nieuw actiepunt</strong>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowCreate(false)}
                  aria-label="Sluiten"
                >
                  ×
                </button>
              </div>

              <label className="follow-up-field follow-up-field--wide">
                <span>Titel</span>
                <input
                  className="cf-input"
                  value={draft.title}
                  onChange={(event) => setDraftField("title", event.target.value)}
                  maxLength={300}
                  required
                />
              </label>

              <label className="follow-up-field follow-up-field--wide">
                <span>Omschrijving</span>
                <textarea
                  className="cf-textarea"
                  rows={4}
                  value={draft.description}
                  onChange={(event) => setDraftField("description", event.target.value)}
                />
              </label>

              <div className="follow-up-create__grid">
                <label className="follow-up-field">
                  <span>Status</span>
                  <select
                    className="cf-input"
                    value={draft.status}
                    onChange={(event) => setDraftField("status", event.target.value)}
                  >
                    {(catalog.statuses || [])
                      .filter((status) => !status.is_terminal)
                      .map((status) => (
                        <option key={status.status_code} value={status.status_code}>
                          {status.display_name || statusLabel(status.status_code)}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="follow-up-field">
                  <span>Prioriteit</span>
                  <select
                    className="cf-input"
                    value={draft.priority}
                    onChange={(event) => setDraftField("priority", event.target.value)}
                  >
                    {PRIORITIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="follow-up-field">
                  <span>Verantwoordelijkheid</span>
                  <select
                    className="cf-input"
                    value={draft.responsibility_type}
                    onChange={(event) => setDraftField("responsibility_type", event.target.value)}
                  >
                    {RESPONSIBILITIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="follow-up-field">
                  <span>Deadline</span>
                  <DateInput
                    value={draft.due_date}
                    onChange={(value) => setDraftField("due_date", value)}
                    allowEmpty
                  />
                </label>

                <label className="follow-up-field">
                  <span>Interne gebruiker</span>
                  <select
                    className="cf-input"
                    value={draft.assigned_user_object_id}
                    onChange={(event) => setDraftField("assigned_user_object_id", event.target.value)}
                  >
                    <option value="">Niet toegewezen</option>
                    {directory.map((entry) => (
                      <option key={entry.user_object_id} value={entry.user_object_id}>
                        {entry.display_name || entry.name || entry.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="follow-up-field">
                  <span>Workflowrol</span>
                  <select
                    className="cf-input"
                    value={draft.assigned_role_code}
                    onChange={(event) => setDraftField("assigned_role_code", event.target.value)}
                  >
                    <option value="">Niet toegewezen</option>
                    {(catalog.workflow_roles || []).map((role) => (
                      <option key={role.role_code} value={role.role_code}>
                        {role.display_name || role.role_code}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="follow-up-field follow-up-field--wide">
                  <span>Tags of onderwerp</span>
                  <input
                    className="cf-input"
                    value={draft.tags}
                    onChange={(event) => setDraftField("tags", event.target.value)}
                    placeholder="Bijvoorbeeld BMI; storing; norm 4.5"
                  />
                </label>

                <label className="follow-up-field follow-up-field--wide">
                  <span>Bijlagen</span>
                  <select
                    className="cf-input"
                    multiple
                    value={draft.attachment_stored_file_ids}
                    onChange={(event) =>
                      setDraftField(
                        "attachment_stored_file_ids",
                        Array.from(event.target.selectedOptions).map((option) => option.value)
                      )
                    }
                  >
                    {(catalog.attachments || []).map((file) => (
                      <option key={file.stored_file_id} value={file.stored_file_id}>
                        {file.title || file.file_name}
                      </option>
                    ))}
                  </select>
                  <small className="muted">
                    Kies nul of meer bestaande installatiedocumenten; gebruik Ctrl of Cmd voor meerdere
                    keuzes.
                  </small>
                </label>

                {draft.drawing_pin_id ? (
                  <div className="ember-alert ember-alert--info follow-up-field--wide">
                    De geselecteerde markering wordt automatisch gekoppeld.
                  </div>
                ) : null}
              </div>

              <div className="follow-up-create__actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Annuleren
                </button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? "Opslaan..." : "Actiepunt aanmaken"}
                </button>
              </div>
            </form>
          ) : null}

          {conceptPoints.length ? (
            <div className="ember-alert ember-alert--info action-point-concept-note">
              <strong>
                {conceptPointTotal} punt{conceptPointTotal === 1 ? "" : "en"} staat nog in een formulier
                dat niet is ingediend.
              </strong>
              <span>
                Die punten horen bij de invuller en komen hier pas te staan zodra het formulier is
                ingediend;{" "}
                {conceptPoints
                  .map(
                    (entry) =>
                      `${entry.instance_title || entry.form_name || entry.form_code || "Formulier"} #${entry.form_instance_id}`
                  )
                  .join("; ")}
                .
              </span>
            </div>
          ) : null}

          {!loading && !visibleItems.length ? (
            <div className="card follow-up-empty">
              {allItems.length
                ? "Geen actiepunten binnen de huidige filters."
                : "Er zijn nog geen actiepunten voor deze installatie."}
            </div>
          ) : null}

          {groups.map((group) => (
            <section key={group.key} className="action-point-group">
              {group.label ? (
                <div className="action-point-group__head">
                  <h3>{group.label}</h3>
                  <Tag>
                    {group.items.length} punt{group.items.length === 1 ? "" : "en"}
                  </Tag>
                </div>
              ) : null}

              <div className="follow-up-grid">
                {group.items.map((item) => (
                  <ActionPointCard
                    key={item.follow_up_action_id}
                    code={code}
                    item={item}
                    busy={rowBusy === item.follow_up_action_id}
                    readOnly={readOnly}
                    statuses={catalog.statuses || []}
                    directory={directory}
                    workflowRoles={catalog.workflow_roles || []}
                    onStatus={changeStatus}
                    onSave={saveAction}
                    onOpenDrawing={openDrawing}
                    onSetLocation={onSetLocation}
                    onOpenPhoto={openPhoto}
                  />
                ))}
              </div>
            </section>
          ))}

          {!showHistory && summary.done > 0 ? (
            <div className="follow-up-history">
              <AnimatedIconButton
                Icon={HistoryIcon}
                iconSize={17}
                className="btn btn-secondary"
                onClick={() => setShowHistory(true)}
              >
                Toon ook de afgehandelde punten (
                {summary.total - summary.open - summary.planned - summary.waiting})
              </AnimatedIconButton>
            </div>
          ) : null}

          {showHistory ? (
            <div className="follow-up-history">
              <AnimatedIconButton
                Icon={HistoryIcon}
                iconSize={17}
                className="btn btn-secondary"
                onClick={() => setShowHistory(false)}
              >
                Verberg de afgehandelde punten
              </AnimatedIconButton>
            </div>
          ) : null}
        </>
      ) : null}

      {activeView === "drawings" ? (
        <section className="card follow-up-drawing-board">
          <div className="follow-up-drawing-board__head">
            <div>
              <h3>Tekenwerk en markeringen</h3>
              <p className="ember-page-subtitle">
                Actieve componentmarkeringen vormen de werkvoorraad voor een volgende tekenrevisie. Open de
                exacte PDF en werk de markering daarna historisch af zodra de revisie is verwerkt.
              </p>
            </div>
            <Tag tone={activeComponentCount > 0 ? "warning" : "active"}>
              {activeComponentCount} component{activeComponentCount === 1 ? "" : "en"} te verwerken
            </Tag>
          </div>

          <div className="follow-up-pin-filters" aria-label="Markeringen filteren">
            {PIN_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={
                  pinFilter === filter.value
                    ? "monitor-tag monitor-tag--active monitor-tag--selected"
                    : "monitor-tag monitor-tag--muted"
                }
                onClick={() => setPinFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
            <label className={`ember-toggle ${showHistoricalPins ? "is-on" : "is-off"}`}>
              <input
                type="checkbox"
                checked={showHistoricalPins}
                onChange={(event) => setShowHistoricalPins(event.target.checked)}
              />
              <span className="ember-toggle__track">
                <span className="ember-toggle__thumb" />
              </span>
              <span className="ember-toggle__label">Historische markeringen</span>
            </label>
          </div>

          {pinFilter === "COMPONENT_PLACED" ? (
            <div className="follow-up-pin-review" aria-label="Componentmarkeringen nalopen">
              <div>
                <strong>Begeleide tekencontrole</strong>
                <span className="muted">
                  Loop de actieve componenten één voor één langs; open de exacte positie en zet de markering
                  verwerkt nadat de tekening is bijgewerkt.
                </span>
              </div>
              {reviewPin ? (
                <div className="follow-up-pin-review__controls">
                  <AnimatedIconButton
                    Icon={ChevronLeftIcon}
                    iconSize={18}
                    className="icon-btn"
                    onClick={() => moveReview(-1)}
                    aria-label="Vorige component"
                  />
                  <span>
                    {reviewIndex + 1} van {activeComponentPins.length}
                  </span>
                  <AnimatedIconButton
                    Icon={ChevronRightIcon}
                    iconSize={18}
                    className="icon-btn"
                    onClick={() => moveReview(1)}
                    aria-label="Volgende component"
                  />
                  <AnimatedIconButton
                    Icon={MapPinIcon}
                    iconSize={16}
                    onClick={() => openDrawing(reviewPin, { componentReview: true })}
                  >
                    Toon huidige op tekening
                  </AnimatedIconButton>
                  <AnimatedIconButton
                    Icon={ArchiveIcon}
                    iconSize={16}
                    className="btn btn-compact"
                    disabled={Boolean(pinBusy)}
                    onClick={() => changePinStatus(reviewPin, "HISTORICAL")}
                  >
                    Verwerkt; volgende
                  </AnimatedIconButton>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  disabled={!activeComponentPins.length}
                  onClick={startComponentReview}
                >
                  {activeComponentPins.length ? "Start controle" : "Geen actieve componenten"}
                </button>
              )}
              <AnimatedIconButton
                Icon={ArchiveIcon}
                iconSize={16}
                className="btn btn-danger btn-compact"
                disabled={readOnly || !activeComponentCount || Boolean(pinBusy)}
                onClick={historicalizeAllComponents}
              >
                Alle componenten verwerkt
              </AnimatedIconButton>
            </div>
          ) : null}

          <div className="follow-up-pin-grid">
            {visiblePins.map((pin) => (
              <DrawingPinCard
                key={pin.drawing_pin_id}
                pin={pin}
                readOnly={readOnly}
                busy={pinBusy === pin.drawing_pin_id}
                selected={String(pin.drawing_pin_id) === reviewPinId}
                onOpenDrawing={openDrawing}
                onStatusChange={changePinStatus}
              />
            ))}
            {!visiblePins.length ? <div className="muted">Geen markeringen binnen dit filter.</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
