// src/pages/Monitor/FormsMonitorDetailPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getFormsMonitorDetail,
  getFormsMonitorFollowUps,
  postFormsMonitorStatusAction,
  postFormsMonitorFollowUpStatusAction,
  putFormsMonitorFollowUpNote,
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
  return (
    <span className={getToneClass(getStatusTone(status))}>
      {statusLabel(status)}
    </span>
  );
}

function SummaryTag({ children, title, tone = "default", active = false, onClick = null }) {
  let cls = "monitor-tag monitor-tag--neutral";

  if (tone === "active") cls = "monitor-tag monitor-tag--active";
  if (tone === "warning") cls = "monitor-tag monitor-tag--warning";
  if (tone === "success") cls = "monitor-tag monitor-tag--success";
  if (tone === "danger") cls = "monitor-tag monitor-tag--danger";
  if (tone === "muted" || tone === "subtle") cls = "monitor-tag monitor-tag--muted";

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

function ActionFooter({
  canFinish,
  finishBusy,
  onFinish,
  onOpenForm,
  footerOpenIconRef,
  footerPdfIconRef,
  footerFinishIconRef,
}) {
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
        className="btn btn-secondary monitor-form-status-btn"
        onClick={onOpenForm}
        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        onMouseEnter={() => footerOpenIconRef.current?.startAnimation?.()}
        onMouseLeave={() => footerOpenIconRef.current?.stopAnimation?.()}
      >
        <ArrowBigRightIcon ref={footerOpenIconRef} size={18} className="nav-anim-icon" />
        Open formulier
      </button>

      <button
        type="button"
        className="btn btn-secondary monitor-form-status-btn"
        disabled
        title="PDF-export volgt later"
        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        onMouseEnter={() => footerPdfIconRef.current?.startAnimation?.()}
        onMouseLeave={() => footerPdfIconRef.current?.stopAnimation?.()}
      >
        <DownloadIcon ref={footerPdfIconRef} size={18} className="nav-anim-icon" />
        PDF
      </button>

      {canFinish && (
        <button
          type="button"
          className="btn monitor-primary-action monitor-form-status-btn"
          disabled={finishBusy}
          onClick={onFinish}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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
      if (e.key === "Escape") {
        setFilterInfoOpen(false);
      }
    }

    if (filterInfoOpen) {
      document.addEventListener("mousedown", onDocMouseDown);
      document.addEventListener("keydown", onKeyDown);

      return () => {
        document.removeEventListener("mousedown", onDocMouseDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  async function refreshDetailOnly() {
    await loadDetailPage();
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
      const next = await postFormsMonitorStatusAction(item.form_instance_id, action);
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
      await postFormsMonitorFollowUpStatusAction(followUpActionId, {
        action,
      });

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
    const popupWidth = 420;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - popupWidth - 12));

    setFilterInfoPopupStyle({
      position: "fixed",
      top: Math.round(rect.bottom + 8),
      left,
      width: popupWidth,
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

  return (
    <div>
      {showFinishCelebration && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 70,
            background: "rgba(0, 0, 0, 0.10)",
            backdropFilter: "blur(1px)",
          }}
        >
          <div
            className="card"
            style={{
              minWidth: 280,
              maxWidth: 440,
              padding: 24,
              display: "grid",
              gap: 10,
              justifyItems: "center",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.08)",
                boxShadow: "0 0 0 8px rgba(255,255,255,0.04)",
              }}
            >
              <PartyPopperIcon ref={successPartyRef} size={36} />
            </div>

            <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.1 }}>
              Formulier succesvol definitief gemaakt
            </div>

            <div className="muted" style={{ fontSize: 13 }}>
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
                <div
                  className="muted"
                  style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                >
                  <span>{item.form_name || item.form_code}</span>
                  <span>#{item.form_instance_id}</span>
                  <StatusTag status={item.status} />
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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

      <div className="inst-body" style={{ display: "grid", gap: 12 }}>
        {error && <div style={{ color: "salmon" }}>{error}</div>}

        {!instanceId ? (
          <div className="muted">Geen formulierafhandeling geselecteerd.</div>
        ) : detailLoading ? (
          <div className="muted">laden; detail</div>
        ) : !item ? (
          <div className="muted">Detail niet beschikbaar.</div>
        ) : (
          <>
            <div
              className={`${getCardToneClass(item.status)} monitor-detail-hero`}
              style={{
                padding: 14,
                borderRadius: 12,
                display: "grid",
                gap: 14,
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
                    <div style={{ fontWeight: 700, fontSize: 18 }}>
                      {item.form_name || item.form_code}
                    </div>

                    <StatusTag status={item.status} />

                    <SummaryTag title="Documentnummer">
                      {item.form_instance_id ?? "-"}
                    </SummaryTag>

                    <SummaryTag title="Formulierversie">
                      v{item.version_label || "-"}
                    </SummaryTag>

                    <SummaryTag title="Openstaande actiepunten; inclusief wachten op derden">
                      {openLikeCount} open
                    </SummaryTag>
                  </div>

                  {item.instance_title ? (
                    <div className="muted" style={{ fontSize: 13 }}>
                      {item.instance_title}
                    </div>
                  ) : null}
                </div>

                <div className="monitor-form-actions">
                  {allowedActions.set_ingediend && (
                    <button
                      type="button"
                      className="btn btn-secondary monitor-form-status-btn"
                      disabled={formActionBusy}
                      onClick={() => handleFormAction("set_ingediend")}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <ArrowBigRightIcon ref={openIconRef} size={18} className="nav-anim-icon" />
                    Open formulier
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary monitor-form-status-btn"
                    disabled
                    title="PDF-export volgt later"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                    onMouseEnter={() => pdfIconRef.current?.startAnimation?.()}
                    onMouseLeave={() => pdfIconRef.current?.stopAnimation?.()}
                  >
                    <DownloadIcon ref={pdfIconRef} size={18} className="nav-anim-icon" />
                    PDF
                  </button>

                  {allowedActions.set_afgehandeld && (
                    <button
                      type="button"
                      className="btn monitor-primary-action monitor-form-status-btn"
                      disabled={formActionBusy}
                      onClick={() => handleFormAction("set_afgehandeld")}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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

            <div
              className="monitor-detail-filter-panel"
              style={{
                padding: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                display: "grid",
                gap: 10,
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: 700 }}>Statusoverzicht actiepunten</div>

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

              <div className="monitor-inline-totals monitor-inline-totals--prominent monitor-inline-totals--large">
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
              <div
                ref={filterInfoPopupRef}
                className="monitor-info-popup"
                style={filterInfoPopupStyle}
              >
                Klik op Totaal om alle actieregels te tonen. Klik op één of meer andere statusknoppen om de actiepuntenlijst daarop te filteren.
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
                    <PlusIcon ref={propsToggleIconRef} size={18} className="nav-anim-icon" />
                  ) : (
                    <ChevronUpIcon ref={propsToggleIconRef} size={18} className="nav-anim-icon" />
                  )}
                </div>
              </button>

              {propertiesOpen && (
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
                      <input
                        className="input"
                        readOnly
                        value={formatDateTime(item.updated_at || item.created_at)}
                      />
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
                    <PlusIcon ref={relationToggleIconRef} size={18} className="nav-anim-icon" />
                  ) : (
                    <ChevronUpIcon ref={relationToggleIconRef} size={18} className="nav-anim-icon" />
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
                  <button
                    type="button"
                    className="monitor-chain-card"
                    onClick={() => navigate(`/monitor/formulieren/${detail.parent.form_instance_id}`)}
                  >
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 600 }}>
                        Parent #{detail.parent.form_instance_id}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {detail.parent.form_name || detail.parent.form_code || "-"}
                      </div>
                    </div>
                    <StatusTag status={detail.parent.status} />
                  </button>
                )}

                {Array.isArray(detail.children) && detail.children.length > 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {detail.children.map((child) => (
                      <button
                        key={child.form_instance_id}
                        type="button"
                        className="monitor-chain-card"
                        onClick={() => navigate(`/monitor/formulieren/${child.form_instance_id}`)}
                      >
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontWeight: 600 }}>
                            Child #{child.form_instance_id}
                          </div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {child.form_name || child.form_code || "-"}
                          </div>
                        </div>

                        <StatusTag status={child.status} />
                      </button>
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
                <div style={{ fontWeight: 700 }}>Actiepunten</div>

                <div className="muted" style={{ fontSize: 12 }}>
                  {followUpsLoading ? "laden..." : `${followUps.length} regel(s)`}
                </div>
              </div>

              {followUpsLoading ? (
                <div className="muted">laden; actiepunten</div>
              ) : followUps.length === 0 ? (
                <div className="monitor-empty-state monitor-empty-state--success">
                  <div style={{ fontWeight: 700 }}>Geen actiepunten</div>
                  <div className="muted">
                    Voor deze formulierafhandeling zijn momenteel geen actiepunten aanwezig.
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {groupedFollowUps
                    .filter((group) => group.count > 0)
                    .map((group) => {
                      const open = Boolean(statusOpenMap[group.status]);

                      return (
                        <div
                          key={group.status}
                          className={`${getCardToneClass(group.status)} monitor-detail-status-block`}
                          style={{
                            borderRadius: 12,
                            padding: 14,
                            display: "grid",
                            gap: 12,
                          }}
                        >
                          <button
                            type="button"
                            className="monitor-section-toggle"
                            onClick={() => toggleStatusSection(group.status)}
                            title={open ? "Inklappen" : "Uitklappen"}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 700 }}>
                                {group.label}
                              </div>
                              <StatusTag status={group.status} />
                              <SummaryTag title="Aantal actiepunten">
                                {group.count} regel(s)
                              </SummaryTag>
                            </div>

                            <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
                              {!open ? (
                                <PlusIcon size={18} className="nav-anim-icon" />
                              ) : (
                                <ChevronUpIcon size={18} className="nav-anim-icon" />
                              )}
                            </div>
                          </button>

                          {open && (
                            <div style={{ display: "grid", gap: 12 }}>
                              {group.items.map((row) => {
                                const noteKey = String(row.follow_up_action_id);
                                const noteValue = noteDrafts[noteKey] ?? normalizeNoteValue(row.note);
                                const noteSaving = Boolean(noteSavingById[noteKey]);
                                const noteSaved = Boolean(noteSavedById[noteKey]);
                                const copied = Boolean(copiedById[noteKey]);

                                return (
                                  <div
                                    key={row.follow_up_action_id}
                                    className={getFollowUpCardClass(row.status)}
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

                                        {String(row.certificate_impact || "").toLowerCase() === "yes" ? (
                                          <SummaryTag title="Dit actiepunt blokkeert het certificaat">
                                            Blokkeert certificaat
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

                                    <div className="monitor-followup-note-box">
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
                                        {noteSaving
                                          ? "opslaan..."
                                          : noteSaved
                                            ? "opgeslagen"
                                            : "wijzigingen worden automatisch opgeslagen"}
                                      </div>
                                    </div>

                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => handleCopyClipboard(row)}
                                        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                      >
                                        {copied ? (
                                          <CheckIcon size={18} className="nav-anim-icon" />
                                        ) : (
                                          <ArchiveIcon size={18} />
                                        )}
                                        {copied ? "Actietekst gekopieerd" : "Kopieer actietekst"}
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
                                          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
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

            <ActionFooter
              canFinish={allowedActions.set_afgehandeld}
              finishBusy={formActionBusy}
              onFinish={() => handleFormAction("set_afgehandeld")}
              onOpenForm={() => {
                const url = `/installaties/${encodeURIComponent(item.atrium_installation_code)}/formulieren/${encodeURIComponent(item.form_instance_id)}`;
                window.open(url, "_blank", "noopener");
              }}
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