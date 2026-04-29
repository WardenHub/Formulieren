// src/pages/Monitor/FormsMonitorDetailPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getFormsMonitorDetail,
  getFormsMonitorFollowUps,
  postFormsMonitorStatusAction,
  postFormsMonitorFollowUpStatusAction,
  putFormsMonitorFollowUpNote,
  getFormsMonitorPdfUrl,
} from "../../api/emberApi.js";

import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { FolderInputIcon } from "@/components/ui/folder-input";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";
import { DownloadIcon } from "@/components/ui/download";
import { HistoryIcon } from "@/components/ui/history";
import { MessageCircleMoreIcon } from "@/components/ui/message-circle-more";
import { CheckIcon } from "@/components/ui/check";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { ArchiveIcon } from "@/components/ui/archive";
import { ChevronLeftIcon } from "@/components/ui/chevron-left";
import { BadgeAlertIcon } from "@/components/ui/badge-alert";
import { PartyPopperIcon } from "@/components/ui/party-popper";
import { ChevronsDownUpIcon } from "@/components/ui/chevrons-down-up";
import { ChevronsUpDownIcon } from "@/components/ui/chevrons-up-down";
import { pushRecentHomeItem } from "../../lib/recentHomeItems.js";

import {
  DETAIL_UI_LS_KEY,
  DETAIL_NOTES_LS_KEY,
  COPY_FEEDBACK_MS,
  formatDateTime,
  statusLabel,
  getStatusTone,
  getToneClass,
  getFollowUpCardClass,
  getCardToneClass,
  getLastModifiedBy,
  buildClipboardText,
  normalizeNoteValue,
  buildRelationRows,
  groupFollowUpsByStatus,
  buildFollowUpStatusCounts,
  readStateFromStorage,
  saveStateToStorage,
} from "./formsMonitorShared.jsx";

function StatusTag({ status }) {
  return <span className={getToneClass(getStatusTone(status))}>{statusLabel(status)}</span>;
}

function SummaryTag({ children, title, tone = "neutral", active = false, onClick = null }) {
  let cls = "ember-label ember-label--neutral";

  if (tone === "active" || tone === "info") cls = "ember-label ember-label--info";
  if (tone === "warning") cls = "ember-label ember-label--warning";
  if (tone === "success") cls = "ember-label ember-label--success";
  if (tone === "danger") cls = "ember-label ember-label--danger";
  if (tone === "muted" || tone === "subtle") cls = "ember-label ember-label--muted";
  if (tone === "ready") cls = "ember-label ember-label--ready";

  if (active) cls = `${cls} ember-label--accent`;

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

function ActionFooter({
  canFinish,
  finishBusy,
  onFinish,
  onOpenForm,
  onDownloadPdf,
  footerOpenIconRef,
  footerPdfIconRef,
  footerFinishIconRef,
}) {
  return (
    <div className="monitor-detail-actions-footer">
      <button
        type="button"
        className="btn btn-secondary monitor-form-status-btn"
        onClick={onOpenForm}
        onMouseEnter={() => footerOpenIconRef.current?.startAnimation?.()}
        onMouseLeave={() => footerOpenIconRef.current?.stopAnimation?.()}
      >
        <ArrowBigRightIcon ref={footerOpenIconRef} size={18} className="nav-anim-icon" />
        Open formulier
      </button>

      <button
        type="button"
        className="btn btn-secondary monitor-form-status-btn"
        onClick={onDownloadPdf}
        onMouseEnter={() => footerPdfIconRef.current?.startAnimation?.()}
        onMouseLeave={() => footerPdfIconRef.current?.stopAnimation?.()}
      >
        <DownloadIcon ref={footerPdfIconRef} size={18} className="nav-anim-icon" />
        PDF
      </button>

      {canFinish && (
        <button
          type="button"
          className="btn btn-primary monitor-form-status-btn"
          disabled={finishBusy}
          onClick={onFinish}
          onMouseEnter={() => footerFinishIconRef.current?.startAnimation?.()}
          onMouseLeave={() => footerFinishIconRef.current?.stopAnimation?.()}
        >
          <ClipboardCheckIcon ref={footerFinishIconRef} size={18} className="nav-anim-icon" />
          Formulier definitief maken
        </button>
      )}
    </div>
  );
}

function CollapseSection({
  open,
  title,
  onToggle,
  iconRef,
  children,
}) {
  return (
    <div className={`monitor-detail-section ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="monitor-detail-section__toggle"
        onClick={onToggle}
        onMouseEnter={() => iconRef.current?.startAnimation?.()}
        onMouseLeave={() => iconRef.current?.stopAnimation?.()}
        title={open ? "Inklappen" : "Uitklappen"}
      >
        <div className="monitor-detail-section__title">{title}</div>

        <div className="monitor-detail-section__icon">
          {!open ? (
            <PlusIcon ref={iconRef} size={18} className="nav-anim-icon" />
          ) : (
            <ChevronUpIcon ref={iconRef} size={18} className="nav-anim-icon" />
          )}
        </div>
      </button>

      {open && <div className="monitor-detail-section__body">{children}</div>}
    </div>
  );
}

export default function FormsMonitorDetailPage() {
  const { instanceId } = useParams();
  const navigate = useNavigate();

  const storedUiState = useMemo(() => readStateFromStorage(DETAIL_UI_LS_KEY), []);
  const storedNotesState = useMemo(() => readStateFromStorage(DETAIL_NOTES_LS_KEY), []);

  const backIconRef = useRef(null);
  const openIconRef = useRef(null);
  const pdfIconRef = useRef(null);
  const finishIconRef = useRef(null);
  const footerOpenIconRef = useRef(null);
  const footerPdfIconRef = useRef(null);
  const footerFinishIconRef = useRef(null);
  const setIngediendIconRef = useRef(null);
  const setConceptIconRef = useRef(null);
  const propsToggleIconRef = useRef(null);
  const relationToggleIconRef = useRef(null);
  const filterInfoIconRef = useRef(null);
  const filterInfoBtnRef = useRef(null);
  const filterInfoPopupRef = useRef(null);
  const collapseAllIconRef = useRef(null);
  const successPartyRef = useRef(null);

  const noteSaveTimersRef = useRef({});
  const copyResetTimersRef = useRef({});
  const successTimerRef = useRef(null);

  const [detailLoading, setDetailLoading] = useState(true);
  const [followUpsLoading, setFollowUpsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [propertiesOpen, setPropertiesOpen] = useState(storedUiState?.propertiesOpen ?? false);
  const [relationsOpen, setRelationsOpen] = useState(storedUiState?.relationsOpen ?? false);
  const [statusOpenMap, setStatusOpenMap] = useState(
    storedUiState?.statusOpenMap ?? {
      OPEN: true,
      WACHTENOPDERDEN: true,
      AFGEHANDELD: true,
      AFGEWEZEN: true,
      VERVALLEN: true,
      INFORMATIEF: true,
    }
  );
  const [activeStatusFilters, setActiveStatusFilters] = useState(
    Array.isArray(storedUiState?.activeStatusFilters)
      ? storedUiState.activeStatusFilters
      : []
  );
  const [filterInfoOpen, setFilterInfoOpen] = useState(false);
  const [filterInfoPopupStyle, setFilterInfoPopupStyle] = useState(null);

  const [detail, setDetail] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [followUpSummary, setFollowUpSummary] = useState(null);

  const [formActionBusy, setFormActionBusy] = useState(false);
  const [followUpBusyId, setFollowUpBusyId] = useState(null);

  const [noteDrafts, setNoteDrafts] = useState(storedNotesState?.noteDrafts ?? {});
  const [noteSavingById, setNoteSavingById] = useState({});
  const [noteSavedById, setNoteSavedById] = useState({});
  const [copiedById, setCopiedById] = useState({});
  const [showFinishCelebration, setShowFinishCelebration] = useState(false);

  const allowedActions = detail?.allowed_actions || {};
  const item = detail?.item || null;

  const relationRows = useMemo(() => buildRelationRows(item), [item]);
  const followUpCounts = useMemo(() => buildFollowUpStatusCounts(followUps), [followUps]);
  const openLikeCount = Number(followUpCounts.OPEN ?? 0) + Number(followUpCounts.WACHTENOPDERDEN ?? 0);

  const groupedFollowUps = useMemo(() => {
    let groups = groupFollowUpsByStatus(followUps);

    if (activeStatusFilters.length > 0) {
      groups = groups.filter((group) => {
        if (activeStatusFilters.includes("OPEN_GROUP")) {
          if (group.status === "OPEN" || group.status === "WACHTENOPDERDEN") return true;
        }

        return activeStatusFilters.includes(group.status);
      });
    }

    return groups;
  }, [followUps, activeStatusFilters]);

  const totalFilterActive = activeStatusFilters.length === 0;

  const anyOpenInDetail =
    propertiesOpen ||
    relationsOpen ||
    Object.values(statusOpenMap || {}).some(Boolean);

  const CollapseIcon = anyOpenInDetail ? ChevronsDownUpIcon : ChevronsUpDownIcon;
  const collapseBtnTitle = anyOpenInDetail ? "Alles inklappen" : "Alles uitklappen";

  function handleDownloadPdf() {
    if (!item?.form_instance_id) return;
    window.location.href = getFormsMonitorPdfUrl(item.form_instance_id);
  }

  useEffect(() => {
    saveStateToStorage(DETAIL_UI_LS_KEY, {
      propertiesOpen,
      relationsOpen,
      statusOpenMap,
      activeStatusFilters,
    });
  }, [propertiesOpen, relationsOpen, statusOpenMap, activeStatusFilters]);

  useEffect(() => {
    saveStateToStorage(DETAIL_NOTES_LS_KEY, {
      noteDrafts,
    });
  }, [noteDrafts]);

  useEffect(() => {
    return () => {
      Object.values(noteSaveTimersRef.current).forEach((timerId) => {
        if (timerId) window.clearTimeout(timerId);
      });

      Object.values(copyResetTimersRef.current).forEach((timerId) => {
        if (timerId) window.clearTimeout(timerId);
      });

      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function onDocMouseDown(e) {
      const btn = filterInfoBtnRef.current;
      const popup = filterInfoPopupRef.current;

      if (btn?.contains(e.target)) return;
      if (popup?.contains(e.target)) return;

      setFilterInfoOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") setFilterInfoOpen(false);
    }

    if (filterInfoOpen) {
      document.addEventListener("mousedown", onDocMouseDown);
      document.addEventListener("keydown", onKeyDown);

      return () => {
        document.removeEventListener("mousedown", onDocMouseDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }

    return undefined;
  }, [filterInfoOpen]);

  useEffect(() => {
    if (!showFinishCelebration) return;

    const t = window.setTimeout(() => {
      successPartyRef.current?.startAnimation?.();
    }, 40);

    return () => {
      window.clearTimeout(t);
      successPartyRef.current?.stopAnimation?.();
    };
  }, [showFinishCelebration]);

  async function loadDetailPage() {
    const cleanId = Number(instanceId);

    if (!Number.isInteger(cleanId) || cleanId <= 0) {
      setError("Ongeldige formulierafhandeling.");
      setDetail(null);
      setFollowUps([]);
      setFollowUpSummary(null);
      setDetailLoading(false);
      setFollowUpsLoading(false);
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

  useEffect(() => {
    loadDetailPage();
  }, [instanceId]);

  async function refreshDetailOnly() {
    await loadDetailPage();
  }

  async function handleFormAction(action) {
    const currentItem = detail?.item;
    if (!currentItem?.form_instance_id || !action || formActionBusy) return;

    const needsConfirm = action === "set_ingediend" || action === "set_concept";

    if (needsConfirm) {
      const ok = window.confirm(
        `Weet je zeker dat je deze statusactie wilt uitvoeren?\n\n${
          action === "set_ingediend" ? "Terug naar ingediend" : "Terug naar concept"
        }`
      );

      if (!ok) return;
    }

    setFormActionBusy(true);

    try {
      const next = await postFormsMonitorStatusAction(currentItem.form_instance_id, action);
      setDetail(next || null);
      await refreshDetailOnly();

      if (action === "set_afgehandeld") {
        setShowFinishCelebration(true);

        if (successTimerRef.current) {
          window.clearTimeout(successTimerRef.current);
        }

        successTimerRef.current = window.setTimeout(() => {
          setShowFinishCelebration(false);
        }, 2400);
      }
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
      await postFormsMonitorFollowUpStatusAction(followUpActionId, { action });
      await refreshDetailOnly();
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      setFollowUpBusyId(null);
    }
  }

  async function handleCopyClipboard(row) {
    const key = String(row?.follow_up_action_id || "");
    if (!key) return;

    try {
      const text = buildClipboardText({
        detailItem: detail?.item || {},
        row,
      });

      await navigator.clipboard.writeText(text);

      setCopiedById((prev) => ({
        ...prev,
        [key]: true,
      }));

      if (copyResetTimersRef.current[key]) {
        window.clearTimeout(copyResetTimersRef.current[key]);
      }

      copyResetTimersRef.current[key] = window.setTimeout(() => {
        setCopiedById((prev) => ({
          ...prev,
          [key]: false,
        }));
      }, COPY_FEEDBACK_MS);
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
      await putFormsMonitorFollowUpNote(followUpActionId, { note: noteValue });

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

  function toggleStatusSection(status) {
    setStatusOpenMap((prev) => ({
      ...prev,
      [status]: !prev[status],
    }));
  }

  function toggleStatusFilter(filterKey) {
    if (filterKey === "ALL") {
      setActiveStatusFilters([]);
      return;
    }

    setActiveStatusFilters((prev) => {
      const current = new Set(prev);

      if (current.has(filterKey)) current.delete(filterKey);
      else current.add(filterKey);

      return Array.from(current);
    });
  }

  function toggleFilterInfoPopup() {
    if (filterInfoOpen) {
      setFilterInfoOpen(false);
      return;
    }

    const btn = filterInfoBtnRef.current;

    if (!btn) {
      setFilterInfoOpen(true);
      setFilterInfoPopupStyle(null);
      return;
    }

    const rect = btn.getBoundingClientRect();
    const popupWidth = Math.min(420, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - popupWidth - 12));

    setFilterInfoPopupStyle({
      position: "fixed",
      top: Math.round(rect.bottom + 8),
      left,
      width: popupWidth,
      maxWidth: "calc(100vw - 24px)",
      zIndex: 120,
    });

    setFilterInfoOpen(true);
  }

  function expandAllSections() {
    setPropertiesOpen(true);
    setRelationsOpen(true);
    setStatusOpenMap({
      OPEN: true,
      WACHTENOPDERDEN: true,
      AFGEHANDELD: true,
      AFGEWEZEN: true,
      VERVALLEN: true,
      INFORMATIEF: true,
    });
  }

  function collapseAllSections() {
    setPropertiesOpen(false);
    setRelationsOpen(false);
    setStatusOpenMap({
      OPEN: false,
      WACHTENOPDERDEN: false,
      AFGEHANDELD: false,
      AFGEWEZEN: false,
      VERVALLEN: false,
      INFORMATIEF: false,
    });
  }

  useEffect(() => {
    if (!item?.form_instance_id) return;

    pushRecentHomeItem({
      kind: "monitor",
      key: String(item.form_instance_id),
      title: item.instance_title || item.form_name || item.form_code || `Monitor ${item.form_instance_id}`,
      subtitle: `${item.form_name || item.form_code || "Formulier"} ; #${item.form_instance_id}`,
      to: `/monitor/formulieren/${encodeURIComponent(item.form_instance_id)}`,
    });
  }, [item]);

  return (
    <div className="monitor-detail-page">
      {showFinishCelebration && (
        <div className="monitor-detail-celebration">
          <div className="card monitor-detail-celebration__card">
            <div className="monitor-detail-celebration__icon">
              <PartyPopperIcon ref={successPartyRef} size={36} />
            </div>

            <div className="monitor-detail-celebration__title">
              Formulier succesvol definitief gemaakt
            </div>

            <div className="ember-page-subtitle">
              De formulierafhandeling is succesvol afgerond.
            </div>
          </div>
        </div>
      )}

      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <button
              type="button"
              className="icon-btn"
              title="Terug naar monitor"
              onClick={() => navigate("/monitor/formulieren")}
              onMouseEnter={() => backIconRef.current?.startAnimation?.()}
              onMouseLeave={() => backIconRef.current?.stopAnimation?.()}
            >
              <ChevronLeftIcon ref={backIconRef} size={18} />
            </button>

            <div className="inst-title">
              <h1>Formulierafhandeling</h1>

              {item ? (
                <div className="ember-label-row">
                  <span className="ember-page-subtitle">{item.form_name || item.form_code}</span>
                  <SummaryTag title="Documentnummer" tone="muted">#{item.form_instance_id}</SummaryTag>
                  <StatusTag status={item.status} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="ember-toolbar">
            <button
              type="button"
              className="icon-btn"
              title={collapseBtnTitle}
              onClick={() => {
                if (anyOpenInDetail) collapseAllSections();
                else expandAllSections();
              }}
              onMouseEnter={() => collapseAllIconRef.current?.startAnimation?.()}
              onMouseLeave={() => collapseAllIconRef.current?.stopAnimation?.()}
            >
              <CollapseIcon ref={collapseAllIconRef} size={18} className="nav-anim-icon" />
            </button>

            <button
              type="button"
              className="btn btn-secondary monitor-form-status-btn"
              onClick={() => refreshDetailOnly()}
            >
              Verversen
            </button>
          </div>
        </div>
      </div>

      <div className="inst-body monitor-detail-page__body">
        {error && <div className="ember-error-text">{error}</div>}

        {!instanceId ? (
          <div className="muted">Geen formulierafhandeling geselecteerd.</div>
        ) : detailLoading ? (
          <div className="muted">laden; detail</div>
        ) : !item ? (
          <div className="muted">Detail niet beschikbaar.</div>
        ) : (
          <>
            <div className={`${getCardToneClass(item.status)} monitor-detail-hero`}>
              <div className="ui-row-between">
                <div className="ui-stack-sm ui-min-0">
                  <div className="ember-label-row">
                    <div className="monitor-dossier-row__title">
                      {item.form_name || item.form_code}
                    </div>

                    <StatusTag status={item.status} />

                    <SummaryTag title="Documentnummer" tone="muted">
                      {item.form_instance_id ?? "-"}
                    </SummaryTag>

                    <SummaryTag title="Formulierversie" tone="muted">
                      v{item.version_label || "-"}
                    </SummaryTag>

                    <SummaryTag title="Openstaande actiepunten; inclusief wachten op derden" tone="muted">
                      {openLikeCount} open
                    </SummaryTag>
                  </div>

                  {item.instance_title ? (
                    <div className="ember-page-subtitle">{item.instance_title}</div>
                  ) : null}
                </div>

                <div className="monitor-form-actions">
                  {allowedActions.set_ingediend && (
                    <button
                      type="button"
                      className="btn btn-secondary monitor-form-status-btn"
                      disabled={formActionBusy}
                      onClick={() => handleFormAction("set_ingediend")}
                      onMouseEnter={() => setIngediendIconRef.current?.startAnimation?.()}
                      onMouseLeave={() => setIngediendIconRef.current?.stopAnimation?.()}
                    >
                      <FolderInputIcon ref={setIngediendIconRef} size={18} className="nav-anim-icon" />
                      Terug naar ingediend
                    </button>
                  )}

                  {allowedActions.set_concept && (
                    <button
                      type="button"
                      className="btn btn-secondary monitor-form-status-btn"
                      disabled={formActionBusy}
                      onClick={() => handleFormAction("set_concept")}
                      onMouseEnter={() => setConceptIconRef.current?.startAnimation?.()}
                      onMouseLeave={() => setConceptIconRef.current?.stopAnimation?.()}
                    >
                      <HistoryIcon ref={setConceptIconRef} size={18} className="nav-anim-icon" />
                      Terug naar concept
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-secondary monitor-form-status-btn"
                    onClick={() => {
                      const url = `/installaties/${encodeURIComponent(item.atrium_installation_code)}/formulieren/${encodeURIComponent(item.form_instance_id)}`;
                      window.open(url, "_blank", "noopener");
                    }}
                    onMouseEnter={() => openIconRef.current?.startAnimation?.()}
                    onMouseLeave={() => openIconRef.current?.stopAnimation?.()}
                  >
                    <ArrowBigRightIcon ref={openIconRef} size={18} className="nav-anim-icon" />
                    Open formulier
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary monitor-form-status-btn"
                    onClick={handleDownloadPdf}
                    onMouseEnter={() => pdfIconRef.current?.startAnimation?.()}
                    onMouseLeave={() => pdfIconRef.current?.stopAnimation?.()}
                  >
                    <DownloadIcon ref={pdfIconRef} size={18} className="nav-anim-icon" />
                    PDF
                  </button>

                  {allowedActions.set_afgehandeld && (
                    <button
                      type="button"
                      className="btn btn-primary monitor-form-status-btn"
                      disabled={formActionBusy}
                      onClick={() => handleFormAction("set_afgehandeld")}
                      onMouseEnter={() => finishIconRef.current?.startAnimation?.()}
                      onMouseLeave={() => finishIconRef.current?.stopAnimation?.()}
                    >
                      <ClipboardCheckIcon ref={finishIconRef} size={18} className="nav-anim-icon" />
                      Formulier definitief maken
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="monitor-detail-filter-panel">
              <div className="monitor-detail-filter-head">
                <div className="monitor-detail-section__title">Statusoverzicht actiepunten</div>

                <button
                  ref={filterInfoBtnRef}
                  type="button"
                  className="icon-btn"
                  title="Klik op Totaal om alle actieregels te tonen. Klik op één of meer andere statusknoppen om de actiepuntenlijst daarop te filteren."
                  onClick={toggleFilterInfoPopup}
                  onMouseEnter={() => filterInfoIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => filterInfoIconRef.current?.stopAnimation?.()}
                >
                  <BadgeAlertIcon ref={filterInfoIconRef} size={18} className="nav-anim-icon" />
                </button>
              </div>

              <div className="monitor-inline-totals">
                <SummaryTag
                  title="Filter op openstaande actiepunten; inclusief wachten op derden"
                  tone="active"
                  active={activeStatusFilters.includes("OPEN_GROUP")}
                  onClick={() => toggleStatusFilter("OPEN_GROUP")}
                >
                  Open {openLikeCount}
                </SummaryTag>

                <SummaryTag
                  title="Filter op wachten op derden"
                  tone="warning"
                  active={activeStatusFilters.includes("WACHTENOPDERDEN")}
                  onClick={() => toggleStatusFilter("WACHTENOPDERDEN")}
                >
                  Wachten op derden {followUpCounts.WACHTENOPDERDEN}
                </SummaryTag>

                <SummaryTag
                  title="Filter op definitieve actiepunten"
                  tone="success"
                  active={activeStatusFilters.includes("AFGEHANDELD")}
                  onClick={() => toggleStatusFilter("AFGEHANDELD")}
                >
                  Definitief {followUpCounts.AFGEHANDELD}
                </SummaryTag>

                <SummaryTag
                  title="Filter op afgewezen actiepunten"
                  tone="danger"
                  active={activeStatusFilters.includes("AFGEWEZEN")}
                  onClick={() => toggleStatusFilter("AFGEWEZEN")}
                >
                  Afgewezen {followUpCounts.AFGEWEZEN}
                </SummaryTag>

                <SummaryTag
                  title="Filter op vervallen actiepunten"
                  tone="muted"
                  active={activeStatusFilters.includes("VERVALLEN")}
                  onClick={() => toggleStatusFilter("VERVALLEN")}
                >
                  Vervallen {followUpCounts.VERVALLEN}
                </SummaryTag>

                <SummaryTag
                  title="Filter op informatieve actiepunten"
                  tone="muted"
                  active={activeStatusFilters.includes("INFORMATIEF")}
                  onClick={() => toggleStatusFilter("INFORMATIEF")}
                >
                  Informatief {followUpCounts.INFORMATIEF}
                </SummaryTag>

                <SummaryTag
                  title="Toon alle actiepunten"
                  tone="neutral"
                  active={totalFilterActive}
                  onClick={() => toggleStatusFilter("ALL")}
                >
                  Totaal {followUpCounts.total}
                </SummaryTag>
              </div>
            </div>

            {filterInfoOpen && filterInfoPopupStyle && (
              <div ref={filterInfoPopupRef} className="monitor-info-popup" style={filterInfoPopupStyle}>
                Klik op Totaal om alle actieregels te tonen. Klik op één of meer andere statusknoppen om de actiepuntenlijst daarop te filteren.
              </div>
            )}

            <CollapseSection
              open={propertiesOpen}
              title="Formuliereigenschappen"
              onToggle={() => setPropertiesOpen((prev) => !prev)}
              iconRef={propsToggleIconRef}
            >
              <div className="cf-grid">
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
                    <div className="cf-label-text cf-label-text--accent">Aangemaakt door</div>
                  </div>
                  <div className="cf-control">
                    <input className="input" readOnly value={item.created_by ?? ""} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text cf-label-text--accent">Laatste wijziging</div>
                  </div>
                  <div className="cf-control">
                    <input className="input" readOnly value={formatDateTime(item.updated_at || item.created_at)} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text cf-label-text--accent">Gewijzigd door</div>
                  </div>
                  <div className="cf-control">
                    <input className="input" readOnly value={getLastModifiedBy(item)} />
                  </div>
                </div>

                <div className="cf-row wide">
                  <div className="cf-label">
                    <div className="cf-label-text cf-label-text--accent">Documentnummer</div>
                  </div>
                  <div className="cf-control">
                    <input className="input" readOnly value={item.form_instance_id ?? ""} />
                  </div>
                </div>
              </div>
            </CollapseSection>

            <CollapseSection
              open={relationsOpen}
              title="Relatiedata"
              onToggle={() => setRelationsOpen((prev) => !prev)}
              iconRef={relationToggleIconRef}
            >
              <div className="cf-grid">
                {relationRows.map((row) => (
                  <div className="cf-row" key={row.label}>
                    <div className="cf-label">
                      <div className="cf-label-text cf-label-text--accent">{row.label}</div>
                    </div>
                    <div className="cf-control">
                      <input className="input" readOnly value={row.value} />
                    </div>
                  </div>
                ))}
              </div>
            </CollapseSection>

            {item.instance_note ? (
              <div className="monitor-detail-section is-open">
                <div className="monitor-detail-section__body">
                  <div className="monitor-detail-section__title">Formulieropmerking</div>
                  <div className="monitor-detail-note">{item.instance_note}</div>
                </div>
              </div>
            ) : null}

            {(detail.parent || (Array.isArray(detail.children) && detail.children.length > 0)) && (
              <div className="monitor-detail-section is-open">
                <div className="monitor-detail-section__body">
                  <div className="monitor-detail-section__title">Keten</div>

                  {detail.parent && (
                    <button
                      type="button"
                      className="monitor-chain-card"
                      onClick={() => navigate(`/monitor/formulieren/${detail.parent.form_instance_id}`)}
                    >
                      <div className="ui-stack-sm">
                        <div className="monitor-dossier-row__title">
                          Parent #{detail.parent.form_instance_id}
                        </div>
                        <div className="ember-page-subtitle">
                          {detail.parent.form_name || detail.parent.form_code || "-"}
                        </div>
                      </div>
                      <StatusTag status={detail.parent.status} />
                    </button>
                  )}

                  {Array.isArray(detail.children) && detail.children.length > 0 && (
                    <div className="ui-stack-sm">
                      {detail.children.map((child) => (
                        <button
                          key={child.form_instance_id}
                          type="button"
                          className="monitor-chain-card"
                          onClick={() => navigate(`/monitor/formulieren/${child.form_instance_id}`)}
                        >
                          <div className="ui-stack-sm">
                            <div className="monitor-dossier-row__title">
                              Child #{child.form_instance_id}
                            </div>
                            <div className="ember-page-subtitle">
                              {child.form_name || child.form_code || "-"}
                            </div>
                          </div>

                          <StatusTag status={child.status} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="monitor-detail-section is-open">
              <div className="monitor-detail-section__body">
                <div className="ui-row-between">
                  <div className="monitor-detail-section__title">Actiepunten</div>
                  <div className="ember-page-subtitle">
                    {followUpsLoading ? "laden..." : `${followUps.length} regel(s)`}
                  </div>
                </div>

                {followUpsLoading ? (
                  <div className="muted">laden; actiepunten</div>
                ) : followUps.length === 0 ? (
                  <div className="monitor-detail-empty-state">
                    <div className="monitor-detail-section__title">Geen actiepunten</div>
                    <div className="ember-page-subtitle">
                      Voor deze formulierafhandeling zijn momenteel geen actiepunten aanwezig.
                    </div>
                  </div>
                ) : (
                  <div className="ui-stack">
                    {groupedFollowUps
                      .filter((group) => group.count > 0)
                      .map((group) => {
                        const open = Boolean(statusOpenMap[group.status]);

                        return (
                          <div
                            key={group.status}
                            className={`${getCardToneClass(group.status)} monitor-detail-status-block`}
                          >
                            <button
                              type="button"
                              className="monitor-section-toggle"
                              onClick={() => toggleStatusSection(group.status)}
                              title={open ? "Inklappen" : "Uitklappen"}
                            >
                              <div className="ember-label-row">
                                <div className="monitor-detail-section__title">{group.label}</div>
                                <StatusTag status={group.status} />
                                <SummaryTag title="Aantal actiepunten" tone="muted">
                                  {group.count} regel(s)
                                </SummaryTag>
                              </div>

                              <div className="monitor-detail-section__icon">
                                {!open ? (
                                  <PlusIcon size={18} className="nav-anim-icon" />
                                ) : (
                                  <ChevronUpIcon size={18} className="nav-anim-icon" />
                                )}
                              </div>
                            </button>

                            {open && (
                              <div className="monitor-detail-status-block__body">
                                {group.items.map((row) => {
                                  const noteKey = String(row.follow_up_action_id);
                                  const noteValue = noteDrafts[noteKey] ?? normalizeNoteValue(row.note);
                                  const noteSaving = Boolean(noteSavingById[noteKey]);
                                  const noteSaved = Boolean(noteSavedById[noteKey]);
                                  const copied = Boolean(copiedById[noteKey]);

                                  return (
                                    <div key={row.follow_up_action_id} className={getFollowUpCardClass(row.status)}>
                                      <div className="ui-row-between">
                                        <div className="ui-stack-sm ui-min-0">
                                          <div className="ember-label-row">
                                            <div className="monitor-dossier-row__title">
                                              {row.workflow_title || "Actiepunt"}
                                            </div>
                                            <StatusTag status={row.status} />
                                          </div>

                                          {row.workflow_description ? (
                                            <div className="ember-page-subtitle">
                                              {row.workflow_description}
                                            </div>
                                          ) : null}
                                        </div>

                                        <div className="ember-label-row">
                                          {row.category ? (
                                            <SummaryTag title="Categorie" tone="muted">
                                              {row.category}
                                            </SummaryTag>
                                          ) : null}

                                          {String(row.certificate_impact || "").toLowerCase() === "yes" ? (
                                            <SummaryTag title="Dit actiepunt blokkeert het certificaat" tone="warning">
                                              Blokkeert certificaat
                                            </SummaryTag>
                                          ) : null}

                                          {row.source_item_code || row.source_row_index != null ? (
                                            <SummaryTag title="Vraagnummer" tone="muted">
                                              vraag {row.source_item_code || row.source_row_index}
                                            </SummaryTag>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="ember-page-subtitle">
                                        Laatste wijziging; {formatDateTime(row.updated_at || row.created_at)}
                                      </div>

                                      <div className="monitor-followup-note-box">
                                        <div className="ui-row">
                                          <MessageCircleMoreIcon size={16} />
                                          <strong>Notitie</strong>
                                        </div>

                                        <textarea
                                          className="cf-textarea"
                                          rows={3}
                                          data-note-id={noteKey}
                                          placeholder="Werknotitie of interne toelichting"
                                          value={noteValue}
                                          onChange={(e) => handleNoteChange(noteKey, e.target.value)}
                                        />

                                        <div className="ember-page-subtitle">
                                          {noteSaving
                                            ? "opslaan..."
                                            : noteSaved
                                              ? "opgeslagen"
                                              : "wijzigingen worden automatisch opgeslagen"}
                                        </div>
                                      </div>

                                      <div className="ui-row-between">
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          onClick={() => handleCopyClipboard(row)}
                                        >
                                          {copied ? (
                                            <CheckIcon size={18} className="nav-anim-icon" />
                                          ) : (
                                            <ArchiveIcon size={18} />
                                          )}
                                          {copied ? "Actietekst gekopieerd" : "Kopieer actietekst"}
                                        </button>

                                        <div className="ember-toolbar">
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
                                            className="btn btn-primary"
                                            disabled={followUpBusyId === row.follow_up_action_id}
                                            onClick={() => handleFollowUpAction(row.follow_up_action_id, "mark_done")}
                                          >
                                            <CheckIcon size={18} className="nav-anim-icon" />
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
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            <ActionFooter
              canFinish={allowedActions.set_afgehandeld}
              finishBusy={formActionBusy}
              onFinish={() => handleFormAction("set_afgehandeld")}
              onOpenForm={() => {
                const url = `/installaties/${encodeURIComponent(item.atrium_installation_code)}/formulieren/${encodeURIComponent(item.form_instance_id)}`;
                window.open(url, "_blank", "noopener");
              }}
              onDownloadPdf={handleDownloadPdf}
              footerOpenIconRef={footerOpenIconRef}
              footerPdfIconRef={footerPdfIconRef}
              footerFinishIconRef={footerFinishIconRef}
            />
          </>
        )}
      </div>
    </div>
  );
}