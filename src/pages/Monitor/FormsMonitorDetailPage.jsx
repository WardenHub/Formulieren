// src/pages/Monitor/FormsMonitorDetailPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  getFormsMonitorDetail,
  getFormsMonitorFollowUps,
  postFormsMonitorStatusAction,
  putFormsMonitorAssignment,
  putFormsMonitorComplimentPoint,
  postFormsMonitorFollowUpStatusAction,
  putFormsMonitorFollowUpNote,
  putFormsMonitorFollowUpCertificateImpact,
  downloadFormsMonitorPdf,
  getFormInstanceDocuments,
  putFormInstanceDocuments,
  uploadFormInstanceDocumentFile,
  getFormInstanceDocumentDownloadUrl,
  downloadFormInstanceDocumentFile,
  putFormInstanceDocumentLabels,
  putFormInstanceDocumentFollowUps,
  deleteFormInstanceDocument,
  getUserDirectory,
} from "../../api/emberApi.js";

import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { FolderInputIcon } from "@/components/ui/folder-input";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";
import { DownloadIcon } from "@/components/ui/download";
import { UploadIcon } from "@/components/ui/upload";
import { SquarePenIcon } from "@/components/ui/square-pen";
import { DeleteIcon } from "@/components/ui/delete";
import { HistoryIcon } from "@/components/ui/history";
import { MessageCircleMoreIcon } from "@/components/ui/message-circle-more";
import { CheckIcon } from "@/components/ui/check";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { ArchiveIcon } from "@/components/ui/archive";
import { ChevronLeftIcon } from "@/components/ui/chevron-left";
import { BadgeAlertIcon } from "@/components/ui/badge-alert";
import { PartyPopperIcon } from "@/components/ui/party-popper";
import { GavelIcon } from "@/components/ui/gavel";
import { MenuIcon } from "@/components/ui/menu";
import { pushRecentHomeItem } from "../../lib/recentHomeItems.js";
import Tabs from "../../components/Tabs.jsx";
import UserAvatar from "../../components/UserAvatar.jsx";
import {
  buildInitials,
  buildDirectoryActorLookup,
  getDirectoryDisplayName as getAvatarDirectoryDisplayName,
  resolveDirectoryAvatarPath,
} from "../../lib/avatar.js";
import teamsLogo from "../../assets/teams-logo.png";

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
  getCreatedByDisplay,
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

function AssignedOwnerChip({ label, email, ownerEntry, onClick }) {
  if (!label) return null;

  return (
    <button
      type="button"
      className="ember-label ember-label--info monitor-assignee-chip"
      title="Open eigenaar"
      onClick={onClick}
    >
      <UserAvatar
        path={resolveDirectoryAvatarPath(ownerEntry)}
        fallback={buildInitials(label, email, "E")}
        alt={label}
        className="avatar-badge monitor-assignee-avatar"
      />
      <span className="monitor-assignee-chip__text">Toegewezen aan {label}</span>
    </button>
  );
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

function getDirectoryDisplayName(item) {
  return getAvatarDirectoryDisplayName(item);
}

function getFollowUpKindLabel(kind) {
  return String(kind || "").trim().toLowerCase() === "report-only"
    ? "Rapportopmerking"
    : "Workflowactie";
}

function getCertificateImpactChoiceLabel(value) {
  const token = String(value || "").trim().toLowerCase();
  if (token === "yes") return "Blokkeert certificaat";
  if (token === "no") return "Blokkeert niet";
  return "Normale workflow";
}

function getFollowUpSourceLabel(row, currentFormInstanceId) {
  const sourceId = row?.source_form_instance_id ?? row?.form_instance_id;
  const relation = String(row?.source_form_relation || "").trim().toLowerCase();
  const idText = sourceId ? ` #${sourceId}` : "";

  if (!sourceId || String(sourceId) === String(currentFormInstanceId)) {
    return `Dit formulier${idText}`;
  }

  if (relation === "parent") return `Hoofdformulier${idText}`;
  if (relation === "child") return `Vervolgformulier${idText}`;
  return `Bronformulier${idText}`;
}

function getFollowUpStatusButtonClass(currentStatus, buttonStatus) {
  const current = String(currentStatus || "").trim().toUpperCase();
  const isActive = current === buttonStatus;
  const baseClass = "btn btn-secondary monitor-followup-status-btn";

  if (!isActive) return baseClass;

  if (buttonStatus === "AFGEHANDELD") {
    return `${baseClass} monitor-followup-status-btn--active monitor-followup-status-btn--success`;
  }

  if (buttonStatus === "WACHTENOPDERDEN") {
    return `${baseClass} monitor-followup-status-btn--active monitor-followup-status-btn--warning`;
  }

  if (buttonStatus === "PLANNING_NODIG") {
    return `${baseClass} monitor-followup-status-btn--active monitor-followup-status-btn--warning`;
  }

  if (buttonStatus === "GEPLAND") {
    return `${baseClass} monitor-followup-status-btn--active monitor-followup-status-btn--info`;
  }

  if (buttonStatus === "AFGEWEZEN") {
    return `${baseClass} monitor-followup-status-btn--active monitor-followup-status-btn--danger`;
  }

  if (buttonStatus === "VERVALLEN") {
    return `${baseClass} monitor-followup-status-btn--active monitor-followup-status-btn--muted`;
  }

  return `${baseClass} monitor-followup-status-btn--active monitor-followup-status-btn--info`;
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

const FORM_DOCUMENT_LABEL_OPTIONS = [
  { key: "INSTALLATIEFOTO", label: "Installatiefoto" },
  { key: "OVERZICHT", label: "Overzicht" },
  { key: "DETAIL", label: "Detail" },
  { key: "BEWIJS", label: "Bewijs" },
  { key: "SELFIE", label: "Selfie" },
  { key: "TEKENING", label: "Tekening" },
  { key: "TYPEPLAAT", label: "Typeplaat" },
  { key: "METERWAARDE", label: "Meterwaarde" },
  { key: "SCHADE", label: "Schade" },
  { key: "VOOR_HERSTEL", label: "Voor herstel" },
  { key: "NA_HERSTEL", label: "Na herstel" },
  { key: "RAPPORT", label: "Rapport" },
  { key: "CERTIFICAAT", label: "Certificaat" },
  { key: "OVERIG", label: "Overig" },
];

const FORM_DOCUMENT_LABEL_STYLES = {
  INSTALLATIEFOTO: { background: "rgba(59,130,246,0.16)", border: "1px solid rgba(59,130,246,0.34)" },
  OVERZICHT: { background: "rgba(14,165,233,0.16)", border: "1px solid rgba(14,165,233,0.34)" },
  DETAIL: { background: "rgba(168,85,247,0.16)", border: "1px solid rgba(168,85,247,0.34)" },
  BEWIJS: { background: "rgba(245,158,11,0.16)", border: "1px solid rgba(245,158,11,0.34)" },
  SELFIE: { background: "rgba(236,72,153,0.16)", border: "1px solid rgba(236,72,153,0.34)" },
  TEKENING: { background: "rgba(99,102,241,0.16)", border: "1px solid rgba(99,102,241,0.34)" },
  TYPEPLAAT: { background: "rgba(34,197,94,0.16)", border: "1px solid rgba(34,197,94,0.34)" },
  METERWAARDE: { background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.34)" },
  SCHADE: { background: "rgba(239,68,68,0.16)", border: "1px solid rgba(239,68,68,0.34)" },
  VOOR_HERSTEL: { background: "rgba(234,88,12,0.16)", border: "1px solid rgba(234,88,12,0.34)" },
  NA_HERSTEL: { background: "rgba(22,163,74,0.16)", border: "1px solid rgba(22,163,74,0.34)" },
  RAPPORT: { background: "rgba(71,85,105,0.20)", border: "1px solid rgba(148,163,184,0.30)" },
  CERTIFICAAT: { background: "rgba(250,204,21,0.16)", border: "1px solid rgba(250,204,21,0.34)" },
  OVERIG: { background: "rgba(148,163,184,0.16)", border: "1px solid rgba(148,163,184,0.28)" },
};

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerBrowserDownload(blob, fallbackFileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackFileName || "download";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeFormDocsResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.documents)) return data.documents;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function normalizeLabelKeys(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

function buildLabelPayload(selected) {
  return normalizeLabelKeys(selected).map((labelKey, index) => ({
    label_key: labelKey,
    is_primary: index === 0,
  }));
}

function normalizeFollowUpOptions(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      follow_up_action_id: String(item?.follow_up_action_id || "").trim(),
      workflow_title: String(item?.workflow_title || item?.title || "Actiepunt").trim(),
      workflow_description: item?.workflow_description || null,
      category: item?.category || null,
      status: item?.status || null,
      source_item_code: item?.source_item_code || null,
      source_row_index: item?.source_row_index ?? null,
    }))
    .filter((item) => item.follow_up_action_id);
}

function makeFollowUpLabel(item) {
  const title = item?.workflow_title || "Actiepunt";
  const question = item?.source_item_code || item?.source_row_index;
  return question != null && question !== "" ? `${title} ; vraag ${question}` : title;
}

function buildFollowUpPayload(selected) {
  return Array.from(
    new Set(
      (Array.isArray(selected) ? selected : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  ).map((followUpActionId, index) => ({
    follow_up_action_id: followUpActionId,
    is_primary: index === 0,
  }));
}

function getDocumentFollowUpIds(doc) {
  return Array.from(
    new Set(
      (Array.isArray(doc?.follow_ups) ? doc.follow_ups : [])
        .map((item) => String(item?.follow_up_action_id || "").trim())
        .filter(Boolean)
    )
  );
}

function isImageMime(mime) {
  return String(mime || "").toLowerCase().startsWith("image/");
}

function isImageDocument(doc) {
  const mime = String(doc?.mime_type || doc?.content_type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(doc?.file_name || doc?.title || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

function buildPreviewUrl(file) {
  if (!file || !isImageMime(file.type)) return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function FormDocumentLabel({ labelKey, fallback }) {
  const option = FORM_DOCUMENT_LABEL_OPTIONS.find((item) => item.key === labelKey);
  const style = FORM_DOCUMENT_LABEL_STYLES[labelKey] || FORM_DOCUMENT_LABEL_STYLES.OVERIG;

  return (
    <span className="ember-label ember-label--neutral" style={style}>
      {option?.label || fallback || labelKey || "Label"}
    </span>
  );
}

function FormDocumentPreview({ code, instanceId, doc, compact = false }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);

    if (!code || !instanceId || !doc?.form_instance_document_id || !isImageDocument(doc)) {
      return undefined;
    }

    getFormInstanceDocumentDownloadUrl(code, instanceId, doc.form_instance_document_id)
      .then((res) => {
        if (alive) setUrl(res?.url || null);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [code, instanceId, doc?.form_instance_document_id, doc?.mime_type, doc?.file_name]);

  if (!isImageDocument(doc) || failed || !url) return null;

  return (
    <div
      style={{
        width: compact ? 92 : "100%",
        height: compact ? 64 : 180,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid var(--border-soft)",
        background: "var(--row-bg)",
        flex: compact ? "0 0 auto" : undefined,
      }}
    >
      <img
        src={url}
        alt={doc.file_name || doc.title || "Bijlage"}
        loading="lazy"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: compact ? "cover" : "contain",
        }}
      />
    </div>
  );
}

function SelectedUploadCard({ item, onRemove }) {
  return (
    <div className="doc-card doc-card--compact">
      {item.previewUrl ? (
        <div
          style={{
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid var(--border-soft)",
            background: "var(--row-bg)",
            marginBottom: 10,
          }}
        >
          <img
            src={item.previewUrl}
            alt={item.file.name}
            style={{ width: "100%", maxHeight: 180, objectFit: "contain", display: "block" }}
          />
        </div>
      ) : null}

      <div className="ui-row-between">
        <div className="ui-stack-sm ui-min-0">
          <div className="monitor-dossier-row__title">{item.file.name}</div>
          <div className="ember-page-subtitle">{formatBytes(item.file.size) || "-"}</div>
        </div>

        <button type="button" className="btn btn-secondary" onClick={onRemove}>
          Verwijderen
        </button>
      </div>
    </div>
  );
}

function MonitorEvidencePanel({
  code,
  instanceId,
  followUps,
  canEdit,
  canDeleteDocuments,
  onDocumentsChange,
}) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [openDocMap, setOpenDocMap] = useState({});
  const [selectedUploads, setSelectedUploads] = useState([]);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [selectedFollowUps, setSelectedFollowUps] = useState([]);
  const [note, setNote] = useState("");
  const [imageVariant, setImageVariant] = useState("ORIGINAL");
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyDocId, setBusyDocId] = useState(null);
  const [error, setError] = useState(null);

  const followUpOptions = useMemo(() => normalizeFollowUpOptions(followUps), [followUps]);

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      const ad = new Date(a?.created_at || a?.updated_at || 0).getTime();
      const bd = new Date(b?.created_at || b?.updated_at || 0).getTime();
      return bd - ad;
    });
  }, [documents]);

  const hasUploads = selectedUploads.length > 0;
  const hasLabels = selectedLabels.length > 0;
  const canSubmitUpload = canEdit && hasUploads && hasLabels && !busy;

  useEffect(() => {
    return () => {
      for (const item of selectedUploads) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [selectedUploads]);

  useEffect(() => {
    onDocumentsChange?.(documents);
  }, [documents, onDocumentsChange]);

  async function loadDocuments() {
    if (!code || !instanceId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await getFormInstanceDocuments(code, instanceId);
      const rows = normalizeFormDocsResponse(res);
      setDocuments(rows);
    } catch (e) {
      setError(String(e?.message || e || "Bijlagen laden mislukt."));
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [code, instanceId]);

  function addFilesToSelection(inputFiles) {
    const files = Array.from(inputFiles || []).filter(Boolean);
    if (files.length === 0) return;

    setError(null);
    setSelectedUploads((prev) => {
      const next = [...prev];
      const existingKeys = new Set(prev.map((item) => `${item.file.name}__${item.file.size}__${item.file.lastModified}`));

      for (const file of files) {
        const key = `${file.name}__${file.size}__${file.lastModified}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        next.push({
          id: `${key}__${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: buildPreviewUrl(file),
        });
      }

      return next;
    });
  }

  function removeSelectedUpload(id) {
    setSelectedUploads((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function toggleUploadLabel(labelKey) {
    setSelectedLabels((prev) => {
      const set = new Set(prev);
      if (set.has(labelKey)) set.delete(labelKey);
      else set.add(labelKey);
      return Array.from(set);
    });
  }

  function toggleUploadFollowUp(followUpActionId) {
    setSelectedFollowUps((prev) => {
      const set = new Set(prev);
      if (set.has(followUpActionId)) set.delete(followUpActionId);
      else set.add(followUpActionId);
      return Array.from(set);
    });
  }

  async function handleCreateAndUpload() {
    if (!canEdit) {
      setError("Bijlagen toevoegen kan alleen zolang de afhandeling nog niet definitief of ingetrokken is.");
      return;
    }

    const labelsPayload = buildLabelPayload(selectedLabels);
    const followUpsPayload = buildFollowUpPayload(selectedFollowUps);

    if (selectedUploads.length === 0) {
      setError("Kies eerst een bestand of foto.");
      return;
    }

    if (labelsPayload.length === 0) {
      setError("Kies minimaal 1 label.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      for (const uploadItem of selectedUploads) {
        const file = uploadItem.file;
        const createRes = await putFormInstanceDocuments(code, instanceId, [
          {
            title: null,
            note: note || null,
            image_variant: isImageMime(file.type) ? imageVariant : null,
            relation_type: null,
            is_active: true,
          },
        ]);

        const createdItems = Array.isArray(createRes?.items) ? createRes.items : [];
        const created =
          createdItems.find((x) => x?.file_name == null && x?.uploaded_at == null) ||
          createdItems[0] ||
          null;

        const documentId = created?.form_instance_document_id || created?.document_id || created?.id;
        if (!documentId) throw new Error("Documentregel kon niet worden aangemaakt.");

        await uploadFormInstanceDocumentFile(code, instanceId, documentId, file);
        await putFormInstanceDocumentLabels(code, instanceId, documentId, labelsPayload);

        if (followUpsPayload.length > 0) {
          await putFormInstanceDocumentFollowUps(code, instanceId, documentId, followUpsPayload);
        }
      }

      for (const item of selectedUploads) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }

      setSelectedUploads([]);
      setSelectedLabels([]);
      setSelectedFollowUps([]);
      setNote("");
      setImageVariant("ORIGINAL");
      setUploadOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";

      await loadDocuments();
    } catch (e) {
      setError(String(e?.message || e || "Uploaden mislukt."));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenDocument(doc) {
    try {
      const res = await getFormInstanceDocumentDownloadUrl(code, instanceId, doc.form_instance_document_id);
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(String(e?.message || e || "Openen mislukt."));
    }
  }

  async function handleDownloadDocument(doc) {
    try {
      const result = await downloadFormInstanceDocumentFile(code, instanceId, doc.form_instance_document_id);
      triggerBrowserDownload(result.blob, result.fileName || doc.file_name || doc.title || "bijlage");
    } catch (e) {
      setError(String(e?.message || e || "Downloaden mislukt."));
    }
  }

  async function handleDeleteDocument(doc) {
    if (!canDeleteDocuments) {
      setError("Bijlagen verwijderen kan alleen in status Concept.");
      return;
    }

    const ok = window.confirm("Weet je zeker dat je deze bijlage wilt weggooien?");
    if (!ok) return;

    setBusyDocId(doc.form_instance_document_id);
    setError(null);

    try {
      await deleteFormInstanceDocument(code, instanceId, doc.form_instance_document_id);
      setDocuments((prev) => prev.filter((item) => item.form_instance_document_id !== doc.form_instance_document_id));
    } catch (e) {
      setError(String(e?.message || e || "Bijlage verwijderen mislukt."));
    } finally {
      setBusyDocId(null);
    }
  }

  async function updateDocumentLabels(doc, nextSelected) {
    if (!canEdit) return;

    const payload = buildLabelPayload(nextSelected);
    const previous = documents;
    const selectedSet = new Set(payload.map((item) => item.label_key));

    setBusyDocId(doc.form_instance_document_id);
    setError(null);

    try {
      setDocuments((prev) =>
        prev.map((item) =>
          item.form_instance_document_id === doc.form_instance_document_id
            ? {
                ...item,
                labels: FORM_DOCUMENT_LABEL_OPTIONS
                  .filter((option) => selectedSet.has(option.key))
                  .map((option, index) => ({
                    label_key: option.key,
                    display_name: option.label,
                    is_primary: index === 0,
                  })),
              }
            : item
        )
      );

      await putFormInstanceDocumentLabels(code, instanceId, doc.form_instance_document_id, payload);
    } catch (e) {
      setDocuments(previous);
      setError(String(e?.message || e || "Labels opslaan mislukt."));
    } finally {
      setBusyDocId(null);
    }
  }

  async function updateDocumentFollowUps(doc, nextSelected) {
    if (!canEdit) return;

    const payload = buildFollowUpPayload(nextSelected);
    const selectedSet = new Set(payload.map((item) => item.follow_up_action_id));
    const previous = documents;

    setBusyDocId(doc.form_instance_document_id);
    setError(null);

    try {
      setDocuments((prev) =>
        prev.map((item) =>
          item.form_instance_document_id === doc.form_instance_document_id
            ? {
                ...item,
                follow_ups: followUpOptions
                  .filter((option) => selectedSet.has(option.follow_up_action_id))
                  .map((option, index) => ({ ...option, is_primary: index === 0 })),
              }
            : item
        )
      );

      await putFormInstanceDocumentFollowUps(code, instanceId, doc.form_instance_document_id, payload);
    } catch (e) {
      setDocuments(previous);
      setError(String(e?.message || e || "Actiepunten koppelen mislukt."));
    } finally {
      setBusyDocId(null);
    }
  }

  return (
    <div className="ui-stack">
      <div className="ember-page-subtitle">
        Toon hier alleen formulierbijlagen die als bewijs bij actiepunten horen. Installatiebestanden blijven bewust buiten deze monitorweergave.
      </div>

      {error ? <div className="ember-error-text">{error}</div> : null}

      <div className="monitor-detail-section is-open">
        <button
          type="button"
          className="monitor-section-toggle"
          onClick={() => setUploadOpen((prev) => !prev)}
          title={uploadOpen ? "Nieuwe bijlage inklappen" : "Nieuwe bijlage toevoegen"}
        >
          <div className="ember-label-row">
            <div className="monitor-detail-section__title">Nieuwe bijlage toevoegen</div>
            <SummaryTag title="Beschikbare actiepunten" tone={followUpOptions.length > 0 ? "info" : "muted"}>
              {followUpOptions.length} actiepunt(en)
            </SummaryTag>
          </div>

          {uploadOpen ? <ChevronUpIcon size={18} /> : <PlusIcon size={18} />}
        </button>

        {uploadOpen ? (
          <div className="monitor-detail-status-block__body">
            {!canEdit ? (
              <div className="monitor-info-box">
                Bijlagen toevoegen of koppelen kan alleen zolang de formulierafhandeling nog niet definitief of ingetrokken is.
              </div>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={!canEdit || busy}
              onChange={(e) => addFilesToSelection(e.target.files)}
              className="ember-hidden-file-input"
            />

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              disabled={!canEdit || busy}
              onChange={(e) => addFilesToSelection(e.target.files)}
              className="ember-hidden-file-input"
            />

            <div
              role="button"
              tabIndex={0}
              className={`ember-dropzone ${dragActive ? "ember-dropzone--active" : ""}`}
              onClick={() => canEdit && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (!canEdit) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (canEdit) setDragActive(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (canEdit) setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (canEdit) addFilesToSelection(e.dataTransfer.files);
              }}
              style={{ padding: 12, borderRadius: 14, display: "grid", gap: 10, cursor: canEdit ? "pointer" : "default" }}
            >
              <div className="ui-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!canEdit || busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Bestanden kiezen
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!canEdit || busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraInputRef.current?.click();
                  }}
                >
                  <UploadIcon size={16} />
                  Neem foto
                </button>

                <span className="ember-page-subtitle">
                  Sleep bestanden hierheen of kies direct meerdere bestanden.
                </span>
              </div>
            </div>

            {selectedUploads.length > 0 ? (
              <div className="ui-stack-sm">
                <div className="ember-page-subtitle">Geselecteerde bestanden</div>
                {selectedUploads.map((item) => (
                  <SelectedUploadCard key={item.id} item={item} onRemove={() => removeSelectedUpload(item.id)} />
                ))}
              </div>
            ) : null}

            <textarea
              className="cf-textarea"
              value={note}
              disabled={!canEdit || busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optionele notitie"
              rows={2}
            />

            {selectedUploads.some((item) => isImageMime(item.file.type)) ? (
              <div className="ui-stack-sm">
                <div className="ember-page-subtitle">Resolutievariant voor foto’s</div>
                <select
                  className="input"
                  value={imageVariant}
                  disabled={!canEdit || busy}
                  onChange={(e) => setImageVariant(e.target.value)}
                >
                  <option value="ORIGINAL">Origineel</option>
                  <option value="LARGE">Hoog</option>
                  <option value="MEDIUM">Middel</option>
                  <option value="SMALL">Laag</option>
                </select>
              </div>
            ) : null}

            <div className="ui-stack-sm">
              <div className="ember-page-subtitle">Labels ; minimaal 1 verplicht</div>
              <div className="ember-label-row">
                {FORM_DOCUMENT_LABEL_OPTIONS.map((item) => {
                  const active = selectedLabels.includes(item.key);
                  const style = FORM_DOCUMENT_LABEL_STYLES[item.key] || FORM_DOCUMENT_LABEL_STYLES.OVERIG;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={!canEdit || busy}
                      onClick={() => toggleUploadLabel(item.key)}
                      style={{ ...style, opacity: active ? 1 : 0.62, fontWeight: active ? 850 : 650 }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ui-stack-sm">
              <div className="ember-page-subtitle">
                Direct koppelen aan actiepunten
              </div>

              {followUpOptions.length === 0 ? (
                <div className="monitor-info-box">
                  Er zijn nog geen actiepunten. Actiepunten ontstaan pas na succesvol indienen wanneer er negatieve oordelen zijn.
                </div>
              ) : (
                <div className="ui-stack-sm">
                  {followUpOptions.map((item) => {
                    const active = selectedFollowUps.includes(item.follow_up_action_id);

                    return (
                      <label
                        key={item.follow_up_action_id}
                        className={`monitor-surface ${active ? "monitor-surface--active" : ""}`}
                        style={{ padding: 10, borderRadius: 12, display: "flex", alignItems: "flex-start", gap: 10, cursor: canEdit ? "pointer" : "default" }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={!canEdit || busy}
                          onChange={() => toggleUploadFollowUp(item.follow_up_action_id)}
                          style={{ marginTop: 3 }}
                        />
                        <span className="ui-stack-sm ui-min-0">
                          <strong>{makeFollowUpLabel(item)}</strong>
                          {item.workflow_description ? (
                            <span className="ember-page-subtitle">{item.workflow_description}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ui-row-between">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSubmitUpload}
                onClick={handleCreateAndUpload}
              >
                <UploadIcon size={16} />
                {busy ? "Bezig..." : selectedUploads.length > 1 ? `${selectedUploads.length} bijlagen toevoegen` : "Bijlage toevoegen"}
              </button>

              <div className="ember-page-subtitle">
                {!hasUploads
                  ? "Kies eerst bestand(en)."
                  : !hasLabels
                    ? "Kies minimaal 1 label."
                    : selectedFollowUps.length > 0
                      ? `${selectedFollowUps.length} actiepunt(en) geselecteerd.`
                      : "Geen actiepunt geselecteerd."}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="ui-row-between">
        <div className="monitor-detail-section__title">Toegevoegde formulierbijlagen</div>
        <button type="button" className="btn btn-secondary" disabled={loading || busy} onClick={loadDocuments}>
          Verversen
        </button>
      </div>

      {loading ? (
        <div className="muted">laden; bijlagen</div>
      ) : sortedDocuments.length === 0 ? (
        <div className="monitor-detail-empty-state">
          <div className="monitor-detail-section__title">Nog geen formulierbijlagen</div>
          <div className="ember-page-subtitle">
            Voeg alleen bewijsstukken toe die bij deze formulierafhandeling of actiepunten horen.
          </div>
        </div>
      ) : (
        <div className="ui-stack-sm">
          {sortedDocuments.map((doc) => {
            const docId = String(doc.form_instance_document_id);
            const open = Boolean(openDocMap[docId]);
            const docBusy = String(busyDocId || "") === docId;
            const labelKeys = normalizeLabelKeys((Array.isArray(doc.labels) ? doc.labels : []).map((item) => item.label_key || item.key));
            const followUpIds = getDocumentFollowUpIds(doc);
            const linkedFollowUps = followUpOptions.filter((item) => followUpIds.includes(item.follow_up_action_id));
            const subtitleParts = [doc.file_name || null, formatBytes(doc.file_size_bytes), formatDateTime(doc.uploaded_at || doc.created_at)].filter(Boolean);

            return (
              <div key={docId} className={`doc-card ${open ? "doc-card--accent" : ""}`}>
                <button
                  type="button"
                  className="doc-type-head"
                  onClick={() => setOpenDocMap((prev) => ({ ...prev, [docId]: !prev[docId] }))}
                >
                  <div className="doc-type-head__main">
                    <div className="doc-type-head__title-row">
                      <span className="doc-type-head__title">{doc.title || doc.file_name || "Bijlage"}</span>
                      <SummaryTag title="Deze bijlage is toegevoegd aan dit formulier" tone="success">Toegevoegd</SummaryTag>
                      {linkedFollowUps.length > 0 ? (
                        <SummaryTag title="Aantal gekoppelde actiepunten" tone="info">
                          {linkedFollowUps.length} gekoppeld
                        </SummaryTag>
                      ) : null}
                    </div>
                    <div className="doc-type-head__meta">{subtitleParts.join(" ; ")}</div>
                  </div>
                  <div className="doc-type-head__actions">
                    {open ? <ChevronUpIcon size={18} /> : <PlusIcon size={18} />}
                  </div>
                </button>

                {!open ? null : (
                  <div className="doc-type-body" style={{ marginTop: 12 }}>
                    <FormDocumentPreview code={code} instanceId={instanceId} doc={doc} />

                    {doc.note ? <div className="ember-page-subtitle">{doc.note}</div> : null}

                    <div className="ember-label-row">
                      {(Array.isArray(doc.labels) ? doc.labels : []).map((label) => (
                        <FormDocumentLabel
                          key={label.label_key || label.key}
                          labelKey={String(label.label_key || label.key || "")}
                          fallback={label.display_name || label.label_key || label.key}
                        />
                      ))}
                    </div>

                    <div className="ui-row">
                      <button type="button" className="btn btn-secondary" onClick={() => handleOpenDocument(doc)}>
                        <ArrowBigRightIcon size={16} />
                        Openen
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => handleDownloadDocument(doc)}>
                        <DownloadIcon size={16} />
                        Downloaden
                      </button>
                      {canDeleteDocuments ? (
                        <button type="button" className="btn btn-secondary" disabled={docBusy} onClick={() => handleDeleteDocument(doc)}>
                          <DeleteIcon size={16} />
                          Weggooien
                        </button>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <div className="ui-stack-sm">
                        <div className="ember-page-subtitle">Labels aanpassen</div>
                        <div className="ember-label-row">
                          {FORM_DOCUMENT_LABEL_OPTIONS.map((item) => {
                            const active = labelKeys.includes(item.key);
                            const style = FORM_DOCUMENT_LABEL_STYLES[item.key] || FORM_DOCUMENT_LABEL_STYLES.OVERIG;
                            return (
                              <button
                                key={item.key}
                                type="button"
                                className="btn btn-secondary btn-compact"
                                disabled={docBusy}
                                onClick={() => {
                                  const set = new Set(labelKeys);
                                  if (set.has(item.key)) set.delete(item.key);
                                  else set.add(item.key);
                                  updateDocumentLabels(doc, Array.from(set));
                                }}
                                style={{ ...style, opacity: active ? 1 : 0.62, fontWeight: active ? 850 : 650 }}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="ui-stack-sm">
                      <div className="ember-page-subtitle">Gekoppelde actiepunten</div>
                      {followUpOptions.length === 0 ? (
                        <div className="monitor-info-box">
                          Er zijn nog geen actiepunten om aan deze bijlage te koppelen.
                        </div>
                      ) : (
                        <div className="ui-stack-sm">
                          {followUpOptions.map((item) => {
                            const active = followUpIds.includes(item.follow_up_action_id);
                            return (
                              <label
                                key={item.follow_up_action_id}
                                className={`monitor-surface ${active ? "monitor-surface--active" : ""}`}
                                style={{ padding: 10, borderRadius: 12, display: "flex", alignItems: "flex-start", gap: 10, cursor: canEdit ? "pointer" : "default" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={active}
                                  disabled={!canEdit || docBusy}
                                  onChange={() => {
                                    const set = new Set(followUpIds);
                                    if (set.has(item.follow_up_action_id)) set.delete(item.follow_up_action_id);
                                    else set.add(item.follow_up_action_id);
                                    updateDocumentFollowUps(doc, Array.from(set));
                                  }}
                                  style={{ marginTop: 3 }}
                                />
                                <span className="ui-stack-sm ui-min-0">
                                  <strong>{makeFollowUpLabel(item)}</strong>
                                  {item.workflow_description ? <span className="ember-page-subtitle">{item.workflow_description}</span> : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FollowUpLinkedDocuments({ code, instanceId, row, documents }) {
  const linkedDocs = useMemo(() => {
    const actionId = String(row?.follow_up_action_id || "");
    if (!actionId) return [];
    return (Array.isArray(documents) ? documents : []).filter((doc) =>
      getDocumentFollowUpIds(doc).includes(actionId)
    );
  }, [documents, row?.follow_up_action_id]);

  if (linkedDocs.length === 0) return null;

  return (
    <div className="monitor-followup-note-box">
      <div className="ui-row-between">
        <div className="ui-row">
          <SquarePenIcon size={16} />
          <strong>Gekoppelde bijlagen</strong>
        </div>
        <SummaryTag title="Aantal gekoppelde bijlagen" tone="info">
          {linkedDocs.length} bijlage(n)
        </SummaryTag>
      </div>

      <div className="ui-stack-sm">
        {linkedDocs.map((doc) => {
          const subtitleParts = [doc.file_name || null, formatBytes(doc.file_size_bytes)].filter(Boolean);
          return (
            <div key={doc.form_instance_document_id} className="doc-card doc-card--compact">
              <div className="ui-row" style={{ alignItems: "flex-start" }}>
                <FormDocumentPreview code={code} instanceId={instanceId} doc={doc} compact />
                <div className="ui-stack-sm ui-min-0" style={{ flex: 1 }}>
                  <div className="monitor-dossier-row__title">{doc.title || doc.file_name || "Bijlage"}</div>
                  {subtitleParts.length > 0 ? <div className="ember-page-subtitle">{subtitleParts.join(" ; ")}</div> : null}
                  {doc.note ? <div className="ember-page-subtitle">{doc.note}</div> : null}
                  <div className="ember-label-row">
                    {(Array.isArray(doc.labels) ? doc.labels : []).map((label) => (
                      <FormDocumentLabel
                        key={label.label_key || label.key}
                        labelKey={String(label.label_key || label.key || "")}
                        fallback={label.display_name || label.label_key || label.key}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FormsMonitorDetailPage() {
  const { instanceId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
  const filterInfoIconRef = useRef(null);
  const filterInfoBtnRef = useRef(null);
  const filterInfoPopupRef = useRef(null);
  const successPartyRef = useRef(null);
  const actionMenuIconRef = useRef(null);
  const actionMenuBtnRef = useRef(null);
  const actionMenuPopupRef = useRef(null);
  const ownerBtnRef = useRef(null);
  const ownerPopupRef = useRef(null);

  const noteSaveTimersRef = useRef({});
  const copyResetTimersRef = useRef({});
  const successTimerRef = useRef(null);

  const [detailLoading, setDetailLoading] = useState(true);
  const [followUpsLoading, setFollowUpsLoading] = useState(true);
  const [error, setError] = useState(null);

  const initialSectionKey = String(searchParams.get("section") || storedUiState?.activeSectionKey || "action_points");
  const [activeSectionKey, setActiveSectionKey] = useState(initialSectionKey);
  const [activeMetadataTab, setActiveMetadataTab] = useState(
    storedUiState?.activeMetadataTab === "relation" ? "relation" : "form"
  );
  const [statusOpenMap, setStatusOpenMap] = useState(
    storedUiState?.statusOpenMap ?? {
      OPEN: true,
      PLANNING_NODIG: true,
      WACHTENOPDERDEN: true,
      GEPLAND: true,
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
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [ownerPopupOpen, setOwnerPopupOpen] = useState(false);

  const [detail, setDetail] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [followUpSummary, setFollowUpSummary] = useState(null);
  const [evidenceDocuments, setEvidenceDocuments] = useState([]);
  const [directoryItems, setDirectoryItems] = useState([]);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [complimentPointValue, setComplimentPointValue] = useState(0);
  const [complimentReason, setComplimentReason] = useState("");
  const [complimentSaving, setComplimentSaving] = useState(false);

  const [formActionBusy, setFormActionBusy] = useState(false);
  const [followUpBusyId, setFollowUpBusyId] = useState(null);
  const [certificateMenuOpenId, setCertificateMenuOpenId] = useState(null);

  const [noteDrafts, setNoteDrafts] = useState(storedNotesState?.noteDrafts ?? {});
  const [noteSavingById, setNoteSavingById] = useState({});
  const [noteSavedById, setNoteSavedById] = useState({});
  const [copiedById, setCopiedById] = useState({});
  const [showFinishCelebration, setShowFinishCelebration] = useState(false);

  const allowedActions = detail?.allowed_actions || {};
  const permissions = detail?.permissions || {};
  const item = detail?.item || null;
  const canEditEvidence = ["CONCEPT", "INGEDIEND", "IN_BEHANDELING"].includes(
    String(item?.status || "")
  );
  const canDeleteEvidence = String(item?.status || "") === "CONCEPT";

  const relationRows = useMemo(() => buildRelationRows(item), [item]);
  const followUpCounts = useMemo(() => buildFollowUpStatusCounts(followUps), [followUps]);
  const openLikeCount =
    Number(followUpCounts.OPEN ?? 0) +
    Number(followUpCounts.PLANNING_NODIG ?? 0) +
    Number(followUpCounts.WACHTENOPDERDEN ?? 0);
  const viewerUserObjectId = String(detail?.viewer?.user_object_id || "").trim() || null;
  const complimentPoints = Array.isArray(detail?.compliment_points) ? detail.compliment_points : [];
  const currentViewerCompliment = useMemo(() => {
    if (!viewerUserObjectId) return null;
    return complimentPoints.find(
      (row) => String(row?.reviewer_user_object_id || "").trim() === viewerUserObjectId
    ) || null;
  }, [complimentPoints, viewerUserObjectId]);

  const groupedFollowUps = useMemo(() => {
    let groups = groupFollowUpsByStatus(followUps);

    if (activeStatusFilters.length > 0) {
      groups = groups.filter((group) => {
        if (activeStatusFilters.includes("OPEN_GROUP")) {
          if (
            group.status === "OPEN" ||
            group.status === "PLANNING_NODIG" ||
            group.status === "WACHTENOPDERDEN"
          ) return true;
        }

        return activeStatusFilters.includes(group.status);
      });
    }

    return groups;
  }, [followUps, activeStatusFilters]);

  const currentFormFollowUps = useMemo(() => {
    if (!item?.form_instance_id) return followUps;
    return followUps.filter((row) => {
      const sourceId = row?.source_form_instance_id ?? row?.form_instance_id;
      return String(sourceId || "") === String(item.form_instance_id);
    });
  }, [followUps, item?.form_instance_id]);

  const totalFilterActive = activeStatusFilters.length === 0;

  const hasStatusMenuActions = Boolean(allowedActions.set_ingediend || allowedActions.set_concept);
  const ownerDirectoryEntry = useMemo(() => {
    const assignedUserObjectId = String(item?.assigned_user_object_id || "").trim();
    if (!assignedUserObjectId) return null;
    return (
      directoryItems.find(
        (entry) => String(entry?.user_object_id || "").trim() === assignedUserObjectId
      ) || null
    );
  }, [directoryItems, item?.assigned_user_object_id]);

  const actorLookup = useMemo(() => buildDirectoryActorLookup(directoryItems), [directoryItems]);

  const ownerDisplayLabel =
    getDirectoryDisplayName(ownerDirectoryEntry) ||
    String(item?.assigned_display_name_snapshot || item?.assigned_email_snapshot || "").trim();
  const hasFollowFormRelations = Boolean(detail?.parent || (Array.isArray(detail?.children) && detail.children.length > 0));
  const detailSectionTabs = [
    { key: "action_points", label: "Actiepunten", Icon: ClipboardCheckIcon },
    { key: "evidence", label: "Bijlagen en bewijs", Icon: FolderInputIcon },
    { key: "feedback", label: "Feedback", Icon: GavelIcon },
    { key: "relations", label: "Metadata", Icon: ArchiveIcon },
    ...(hasFollowFormRelations ? [{ key: "follow_forms", label: "Vervolgformulieren", Icon: ArrowBigRightIcon }] : []),
  ];
  const metadataTabs = [
    { key: "form", label: "Formulier", Icon: SquarePenIcon },
    { key: "relation", label: "Relatie", Icon: ArchiveIcon },
  ];

  function openSection(nextKey) {
    setActiveSectionKey(nextKey);
    const next = new URLSearchParams(searchParams);
    next.set("section", nextKey);
    setSearchParams(next, { replace: true });
  }

  async function handleDownloadPdf() {
    if (!item?.form_instance_id) return;

    setError(null);

    try {
      const result = await downloadFormsMonitorPdf(item.form_instance_id);
      triggerBrowserDownload(
        result.blob,
        result.fileName || `${item.form_name || item.form_code || "formulier"}_${item.form_instance_id}.pdf`
      );
    } catch (e) {
      setError(String(e?.message || e || "PDF export mislukt."));
    }
  }

  useEffect(() => {
    saveStateToStorage(DETAIL_UI_LS_KEY, {
      activeSectionKey,
      activeMetadataTab,
      statusOpenMap,
      activeStatusFilters,
    });
  }, [activeSectionKey, activeMetadataTab, statusOpenMap, activeStatusFilters]);

  useEffect(() => {
    if (!hasFollowFormRelations && activeSectionKey === "follow_forms") {
      setActiveSectionKey("relations");
    }
  }, [hasFollowFormRelations, activeSectionKey]);

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
      const target = e.target;

      if (
        filterInfoOpen &&
        !filterInfoBtnRef.current?.contains(target) &&
        !filterInfoPopupRef.current?.contains(target)
      ) {
        setFilterInfoOpen(false);
      }

      if (
        actionMenuOpen &&
        !actionMenuBtnRef.current?.contains(target) &&
        !actionMenuPopupRef.current?.contains(target)
      ) {
        setActionMenuOpen(false);
      }

      if (
        ownerPopupOpen &&
        !ownerBtnRef.current?.contains(target) &&
        !ownerPopupRef.current?.contains(target)
      ) {
        setOwnerPopupOpen(false);
      }
    }

    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      setFilterInfoOpen(false);
      setActionMenuOpen(false);
      setOwnerPopupOpen(false);
    }

    if (filterInfoOpen || actionMenuOpen || ownerPopupOpen) {
      document.addEventListener("mousedown", onDocMouseDown);
      document.addEventListener("keydown", onKeyDown);

      return () => {
        document.removeEventListener("mousedown", onDocMouseDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }

    return undefined;
  }, [filterInfoOpen, actionMenuOpen, ownerPopupOpen]);

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
    setComplimentPointValue(
      currentViewerCompliment?.point_value === 1
        ? 1
        : currentViewerCompliment?.point_value === -1
          ? -1
          : 0
    );
    setComplimentReason(String(currentViewerCompliment?.reason || ""));
  }, [currentViewerCompliment]);

  useEffect(() => {
    const assignedLabel = String(
      item?.assigned_display_name_snapshot || item?.assigned_email_snapshot || ""
    ).trim();
    setAssignmentSearch(assignedLabel);
  }, [item?.assigned_user_object_id, item?.assigned_display_name_snapshot, item?.assigned_email_snapshot]);

  async function refreshDetailOnly() {
    await loadDetailPage();
  }

  async function handleAssignmentSave(clear = false) {
    if (!item?.form_instance_id || assignmentSaving) return;

    let selectedUserObjectId = "";
    if (!clear) {
      const hit = directoryItems.find((entry) => {
        const label = getDirectoryDisplayName(entry);
        return label === String(assignmentSearch || "").trim();
      });
      selectedUserObjectId = String(hit?.user_object_id || "").trim();
      if (!selectedUserObjectId) {
        window.alert("Kies eerst een geldige Ember-gebruiker uit de lijst.");
        return;
      }
    }

    setAssignmentSaving(true);
    try {
      const next = await putFormsMonitorAssignment(item.form_instance_id, {
        assigned_user_object_id: clear ? null : selectedUserObjectId,
        clear: clear ? 1 : 0,
      });
      setDetail(next || null);
      if (clear) {
        setAssignmentSearch("");
      } else {
        const hit = directoryItems.find(
          (entry) => String(entry?.user_object_id || "").trim() === selectedUserObjectId
        );
        setAssignmentSearch(getDirectoryDisplayName(hit));
      }
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function handleComplimentSave(nextPointValue) {
    if (!item?.form_instance_id || complimentSaving) return;
    if (nextPointValue === -1 && !String(complimentReason || "").trim()) {
      window.alert("Geef bij een minpunt kort aan waarom dit minpunt wordt toegekend.");
      return;
    }

    setComplimentSaving(true);
    try {
      const next = await putFormsMonitorComplimentPoint(item.form_instance_id, {
        point_value: nextPointValue,
        reason: nextPointValue === 0 ? null : complimentReason,
      });
      setDetail(next || null);
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      setComplimentSaving(false);
    }
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

  async function handleCertificateImpactOverride(followUpActionId, nextValue) {
    if (!followUpActionId || followUpBusyId) return;

    setFollowUpBusyId(followUpActionId);
    setCertificateMenuOpenId(null);
    setError(null);

    try {
      const res = await putFormsMonitorFollowUpCertificateImpact(followUpActionId, {
        certificate_impact_override: nextValue || null,
      });

      const updated = res?.item || null;
      if (!updated) return;

      setFollowUps((prev) =>
        prev.map((row) =>
          String(row.follow_up_action_id) === String(followUpActionId)
            ? {
                ...row,
                certificate_impact_override: updated.certificate_impact_override ?? null,
                effective_certificate_impact:
                  updated.effective_certificate_impact ??
                  row.effective_certificate_impact ??
                  row.certificate_impact,
                updated_at: updated.updated_at ?? row.updated_at,
                updated_by: updated.updated_by ?? row.updated_by,
              }
            : row
        )
      );
    } catch (e) {
      setError(String(e?.message || e || "Certificaateffect opslaan mislukt."));
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
        actorLookup,
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
                  {ownerDisplayLabel ? (
                    <AssignedOwnerChip
                      label={ownerDisplayLabel}
                      email={item.assigned_email_snapshot}
                      ownerEntry={ownerDirectoryEntry}
                      onClick={() => setOwnerPopupOpen((prev) => !prev)}
                    />
                  ) : null}
                  {item.parent_instance_id ? (
                    <button
                      type="button"
                      className="ember-label ember-label--info"
                      title="Open vervolgformulieren"
                      onClick={() => openSection("follow_forms")}
                    >
                      vervolg op formulier #{item.parent_instance_id}
                    </button>
                  ) : null}
                  {Array.isArray(detail?.children) && detail.children.length > 0 ? (
                    <button
                      type="button"
                      className="ember-label ember-label--info"
                      title="Open vervolgformulieren"
                      onClick={() => openSection("follow_forms")}
                    >
                      opgevolgd door formulier{detail.children.length > 1 ? "en" : ""} {detail.children.map((child) => `#${child.form_instance_id}`).join(", ")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="ember-toolbar">
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

                    {ownerDisplayLabel ? (
                      <AssignedOwnerChip
                        label={ownerDisplayLabel}
                        email={item.assigned_email_snapshot}
                        ownerEntry={ownerDirectoryEntry}
                        onClick={() => setOwnerPopupOpen((prev) => !prev)}
                      />
                    ) : null}

                    <SummaryTag title="Documentnummer" tone="muted">
                      {item.form_instance_id ?? "-"}
                    </SummaryTag>

                    <SummaryTag title="Formulierversie" tone="muted">
                      v{item.version_label || "-"}
                    </SummaryTag>

                    <SummaryTag title="Openstaande actiepunten; inclusief wachten op derden" tone="muted">
                      {openLikeCount} open
                    </SummaryTag>

                    {item.parent_instance_id ? (
                      <button
                        type="button"
                        className="ember-label ember-label--info"
                        title="Open vervolgformulieren"
                        onClick={() => openSection("follow_forms")}
                      >
                        vervolg op formulier #{item.parent_instance_id}
                      </button>
                    ) : null}

                    {Array.isArray(detail?.children) && detail.children.length > 0 ? (
                      <button
                        type="button"
                        className="ember-label ember-label--info"
                        title="Open vervolgformulieren"
                        onClick={() => openSection("follow_forms")}
                      >
                        opgevolgd door formulier{detail.children.length > 1 ? "en" : ""} {detail.children.map((child) => `#${child.form_instance_id}`).join(", ")}
                      </button>
                    ) : null}

                  </div>

                  {item.instance_title ? (
                    <div className="ember-page-subtitle">{item.instance_title}</div>
                  ) : null}
                </div>

                <div className="monitor-form-actions monitor-form-actions--detail">
                  <div className="monitor-form-actions__group">
                    <button
                      ref={ownerBtnRef}
                      type="button"
                      className="btn btn-secondary monitor-form-status-btn"
                      onClick={() => {
                        setOwnerPopupOpen((prev) => !prev);
                        setActionMenuOpen(false);
                      }}
                    >
                      <SquarePenIcon size={18} className="nav-anim-icon" />
                      Eigenaar
                    </button>

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

                  {hasStatusMenuActions ? (
                    <div className="monitor-form-actions__menu-wrap">
                      <button
                        ref={actionMenuBtnRef}
                        type="button"
                        className="icon-btn"
                        title="Meer acties"
                        onClick={() => {
                          setActionMenuOpen((prev) => !prev);
                          setOwnerPopupOpen(false);
                        }}
                        onMouseEnter={() => actionMenuIconRef.current?.startAnimation?.()}
                        onMouseLeave={() => actionMenuIconRef.current?.stopAnimation?.()}
                      >
                        <MenuIcon ref={actionMenuIconRef} size={18} className="nav-anim-icon" />
                      </button>

                      {actionMenuOpen ? (
                        <div ref={actionMenuPopupRef} className="card monitor-detail-popup-menu">
                          {allowedActions.set_ingediend ? (
                            <button
                              type="button"
                              className="menu-item"
                              disabled={formActionBusy}
                              onClick={() => {
                                setActionMenuOpen(false);
                                handleFormAction("set_ingediend");
                              }}
                            >
                              <FolderInputIcon ref={setIngediendIconRef} size={18} className="nav-anim-icon" />
                              <span>Terug naar ingediend</span>
                            </button>
                          ) : null}

                          {allowedActions.set_concept ? (
                            <button
                              type="button"
                              className="menu-item"
                              disabled={formActionBusy}
                              onClick={() => {
                                setActionMenuOpen(false);
                                handleFormAction("set_concept");
                              }}
                            >
                              <HistoryIcon ref={setConceptIconRef} size={18} className="nav-anim-icon" />
                              <span>Terug naar concept</span>
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {ownerPopupOpen ? (
                    <div ref={ownerPopupRef} className="card monitor-detail-owner-popup">
                      <div className="ui-stack-sm">
                        <div className="monitor-detail-section__title">Eigenaar</div>

                        <input
                          className="input"
                          list="monitor-assignment-directory"
                          value={assignmentSearch}
                          onChange={(e) => setAssignmentSearch(e.target.value)}
                          placeholder="Kies een Ember-gebruiker"
                          readOnly={!permissions.can_assign_form}
                        />
                        <datalist id="monitor-assignment-directory">
                          {directoryItems.map((entry) => {
                            const label = getDirectoryDisplayName(entry);
                            if (!label) return null;
                            return <option key={entry.user_object_id || label} value={label} />;
                          })}
                        </datalist>

                        <div className="ember-label-row">
                          {ownerDisplayLabel ? (
                            <SummaryTag title="Huidige toewijzing" tone="info">
                              <span className="monitor-assignee-chip">
                                <UserAvatar
                                  path={resolveDirectoryAvatarPath(ownerDirectoryEntry)}
                                  fallback={buildInitials(
                                    ownerDisplayLabel,
                                    item.assigned_email_snapshot,
                                    "E"
                                  )}
                                  alt={ownerDisplayLabel}
                                  className="avatar-badge monitor-assignee-avatar"
                                />
                                <span className="monitor-assignee-chip__text">
                                  {ownerDisplayLabel}
                                </span>
                              </span>
                            </SummaryTag>
                          ) : (
                            <SummaryTag title="Huidige toewijzing" tone="muted">
                              Niet toegewezen
                            </SummaryTag>
                          )}

                          {item.assigned_email_snapshot ? (
                            <button
                              type="button"
                              className="btn btn-secondary monitor-owner-teams-btn"
                              title={`Stuur Teams-bericht naar ${ownerDisplayLabel || item.assigned_email_snapshot}`}
                              onClick={() => {
                                const teamsUrl = buildTeamsChatUrl(
                                  item.assigned_email_snapshot,
                                  item.form_instance_id
                                );
                                if (teamsUrl) {
                                  window.open(teamsUrl, "_blank", "noopener,noreferrer");
                                }
                              }}
                            >
                              <img src={teamsLogo} alt="Teams" className="directory-card-teams-logo" />
                            </button>
                          ) : null}
                        </div>

                        {permissions.can_assign_form ? (
                          <div className="ember-toolbar">
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={assignmentSaving}
                              onClick={() => handleAssignmentSave(false)}
                            >
                              Toewijzen
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={assignmentSaving}
                              onClick={() => handleAssignmentSave(true)}
                            >
                              Toewijzing opheffen
                            </button>
                          </div>
                        ) : null}

                        <div className="ember-page-subtitle">
                          {item.assigned_at
                            ? `Bijgewerkt op ${formatDateTime(item.assigned_at)}${item.assigned_by ? ` door ${item.assigned_by}` : ""}`
                            : "Nog geen behandelaar toegewezen."}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <Tabs tabs={detailSectionTabs} activeKey={activeSectionKey} onChange={openSection} />

            {activeSectionKey === "action_points" ? (
              <>
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
                  title="Filter op openstaande actiepunten; inclusief planning nodig en wachten op derden"
                  tone="active"
                  active={activeStatusFilters.includes("OPEN_GROUP")}
                  onClick={() => toggleStatusFilter("OPEN_GROUP")}
                >
                  Open {openLikeCount}
                </SummaryTag>

                <SummaryTag
                  title="Filter op actiepunten waarvoor planning nodig is"
                  tone="warning"
                  active={activeStatusFilters.includes("PLANNING_NODIG")}
                  onClick={() => toggleStatusFilter("PLANNING_NODIG")}
                >
                  Planning nodig {followUpCounts.PLANNING_NODIG}
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
                  title="Filter op geplande actiepunten"
                  tone="neutral"
                  active={activeStatusFilters.includes("GEPLAND")}
                  onClick={() => toggleStatusFilter("GEPLAND")}
                >
                  Gepland {followUpCounts.GEPLAND}
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

                {filterInfoOpen && filterInfoPopupStyle ? (
                  <div ref={filterInfoPopupRef} className="monitor-info-popup" style={filterInfoPopupStyle}>
                    Klik op Totaal om alle actieregels te tonen. Klik op één of meer andere statusknoppen om de actiepuntenlijst daarop te filteren.
                  </div>
                ) : null}
              </>
            ) : null}

            {activeSectionKey === "feedback" ? (
              <div className="monitor-detail-section is-open">
                <div className="monitor-detail-section__body">
                  <div className="ui-row-between">
                    <div className="monitor-detail-section__title">Feedback</div>
                    <div className="ember-page-subtitle">{complimentPoints.length} beoordeling(en)</div>
                  </div>

                  <div className="ember-label-row">
                    <button
                      type="button"
                      className={
                        complimentPointValue === 1
                          ? "ember-label ember-label--success ember-label--button"
                          : "ember-label ember-label--muted ember-label--button"
                      }
                      disabled={!permissions.can_set_compliment_points || complimentSaving}
                      onClick={() => setComplimentPointValue((prev) => (prev === 1 ? 0 : 1))}
                        >
                          +1
                        </button>
                    <button
                      type="button"
                      className={
                        complimentPointValue === -1
                          ? "ember-label ember-label--danger ember-label--button"
                          : "ember-label ember-label--muted ember-label--button"
                      }
                      disabled={!permissions.can_set_compliment_points || complimentSaving}
                      onClick={() => setComplimentPointValue((prev) => (prev === -1 ? 0 : -1))}
                        >
                          -1
                        </button>
                  </div>

                  <textarea
                    className="cf-textarea"
                    rows={3}
                        placeholder="Voeg een opmerking toe."
                    value={complimentReason}
                    onChange={(e) => setComplimentReason(e.target.value)}
                    readOnly={!permissions.can_set_compliment_points}
                  />

                  {permissions.can_set_compliment_points ? (
                    <div className="ember-toolbar">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={complimentSaving}
                        onClick={() => handleComplimentSave(complimentPointValue)}
                      >
                        Opslaan
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={complimentSaving}
                        onClick={() => handleComplimentSave(0)}
                      >
                        Wissen
                      </button>
                    </div>
                  ) : null}

                  <div className="ui-stack-sm">
                    {complimentPoints.length === 0 ? (
                      <div className="ember-page-subtitle">Nog geen complimentpunten vastgelegd.</div>
                    ) : (
                      complimentPoints.map((point) => (
                        <div
                          key={point.compliment_point_id || `${point.reviewer_user_object_id}-${point.point_value}`}
                          className="ember-label-row"
                        >
                          <SummaryTag
                            title="Beoordelaar"
                            tone={Number(point.point_value) === 1 ? "success" : "danger"}
                          >
                            {Number(point.point_value) === 1 ? "+1" : "-1"} {point.reviewer_display_name_snapshot || point.reviewer_email_snapshot || "Beoordelaar"}
                          </SummaryTag>
                          {point.reason ? <span className="ember-page-subtitle">{point.reason}</span> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {activeSectionKey === "evidence" && item ? (
              <div className="monitor-detail-section is-open">
                <div className="monitor-detail-section__body">
                  <div className="monitor-detail-section__title">Bijlagen en bewijs</div>
                  <div className="ember-page-subtitle">
                    Voeg formulierbijlagen toe en koppel ze direct aan actiepunten. Installatiebestanden worden hier bewust niet getoond.
                  </div>

                  <MonitorEvidencePanel
                    code={item.atrium_installation_code}
                    instanceId={item.form_instance_id}
                    followUps={currentFormFollowUps}
                    canEdit={canEditEvidence}
                    canDeleteDocuments={canDeleteEvidence}
                    onDocumentsChange={setEvidenceDocuments}
                  />
                </div>
              </div>
            ) : null}

            {activeSectionKey === "relations" ? (
              <div className="ui-stack">
                <Tabs tabs={metadataTabs} activeKey={activeMetadataTab} onChange={setActiveMetadataTab} />

                {activeMetadataTab === "relation" ? (
                <div className="monitor-detail-section is-open">
                  <div className="monitor-detail-section__body">
                    <div className="monitor-detail-section__title">Relatie</div>
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
                  </div>
                </div>
                ) : null}

                {activeMetadataTab === "form" ? (
                <div className="monitor-detail-section is-open">
                  <div className="monitor-detail-section__body">
                    <div className="monitor-detail-section__title">Formulier</div>
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
                          <input className="input" readOnly value={getCreatedByDisplay(item, actorLookup)} />
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
                          <input className="input" readOnly value={getLastModifiedBy(item, actorLookup)} />
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
                  </div>
                </div>
                ) : null}

                {activeMetadataTab === "form" && item.instance_note ? (
                  <div className="monitor-detail-section is-open">
                    <div className="monitor-detail-section__body">
                      <div className="monitor-detail-section__title">Formulieropmerking</div>
                      <div className="monitor-detail-note">{item.instance_note}</div>
                    </div>
                  </div>
                ) : null}

              </div>
            ) : null}

            {activeSectionKey === "follow_forms" && hasFollowFormRelations ? (
              <div className="monitor-detail-section is-open">
                <div className="monitor-detail-section__body">
                  <div className="monitor-detail-section__title">Vervolgformulieren</div>

                  {detail.parent ? (
                    <button
                      type="button"
                      className="monitor-chain-card"
                      onClick={() => navigate(`/monitor/formulieren/${detail.parent.form_instance_id}?section=follow_forms`)}
                    >
                      <div className="ui-stack-sm">
                        <div className="monitor-dossier-row__title">Vervolg op formulier #{detail.parent.form_instance_id}</div>
                        <div className="ember-page-subtitle">
                          {detail.parent.form_name || detail.parent.form_code || "-"}
                        </div>
                      </div>
                      <StatusTag status={detail.parent.status} />
                    </button>
                  ) : null}

                  {Array.isArray(detail.children) && detail.children.length > 0 ? (
                    <div className="ui-stack-sm">
                      {detail.children.map((child) => (
                        <button
                          key={child.form_instance_id}
                          type="button"
                          className="monitor-chain-card"
                          onClick={() => navigate(`/monitor/formulieren/${child.form_instance_id}?section=follow_forms`)}
                        >
                          <div className="ui-stack-sm">
                            <div className="monitor-dossier-row__title">Opgevolgd door formulier #{child.form_instance_id}</div>
                            <div className="ember-page-subtitle">
                              {child.form_name || child.form_code || "-"}
                            </div>
                          </div>

                          <StatusTag status={child.status} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeSectionKey === "action_points" ? (
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

                              {open ? (
                                <div className="monitor-detail-status-block__body">
                                  {group.items.map((row) => {
                                    const noteKey = String(row.follow_up_action_id);
                                    const noteValue = noteDrafts[noteKey] ?? normalizeNoteValue(row.note);
                                    const noteSaving = Boolean(noteSavingById[noteKey]);
                                    const noteSaved = Boolean(noteSavedById[noteKey]);
                                    const copied = Boolean(copiedById[noteKey]);
                                    const isWorkflow =
                                      String(row.kind || "").trim().toLowerCase() === "workflow";
                                    const effectiveCertificateImpact = String(
                                      row.effective_certificate_impact || row.certificate_impact || ""
                                    )
                                      .trim()
                                      .toLowerCase();
                                    const isOpenFollowUpStatus = [
                                      "OPEN",
                                      "PLANNING_NODIG",
                                      "WACHTENOPDERDEN",
                                    ].includes(String(row.status || "").trim());
                                    const rowStatus = String(row.status || "").trim().toUpperCase();
                                    const rowSourceId = row.source_form_instance_id ?? row.form_instance_id;
                                    const rowSourceIsCurrent =
                                      String(rowSourceId || "") === String(item?.form_instance_id || "");
                                    const rowSourceLabel = getFollowUpSourceLabel(
                                      row,
                                      item?.form_instance_id
                                    );

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
                                            <SummaryTag
                                              title="Type opvolgregistratie"
                                              tone={isWorkflow ? "info" : "muted"}
                                            >
                                              {getFollowUpKindLabel(row.kind)}
                                            </SummaryTag>

                                            {row.category ? (
                                              <SummaryTag title="Categorie" tone="muted">
                                                {row.category}
                                              </SummaryTag>
                                            ) : null}

                                            {hasFollowFormRelations ? (
                                              <SummaryTag title="Herkomst actiepunt" tone={rowSourceIsCurrent ? "muted" : "info"}>
                                                {rowSourceLabel}
                                              </SummaryTag>
                                            ) : null}

                                            {effectiveCertificateImpact === "yes" && isOpenFollowUpStatus ? (
                                              <SummaryTag title="Dit actiepunt blokkeert het certificaat" tone="warning">
                                                Blokkeert certificaat
                                              </SummaryTag>
                                            ) : null}

                                            {effectiveCertificateImpact === "yes" && !isOpenFollowUpStatus ? (
                                              <SummaryTag title="Dit certificaatpunt is afgehandeld of afgesloten" tone="success">
                                                Certificaatpunt afgehandeld
                                              </SummaryTag>
                                            ) : null}

                                            {row.certificate_impact_override ? (
                                              <SummaryTag
                                                title="Dit certificaateffect is handmatig overschreven"
                                                tone="warning"
                                              >
                                                Handmatige override certificaat
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

                                        {isWorkflow ? null : (
                                          <div className="monitor-followup-note-box">
                                            <div className="ui-row">
                                              <GavelIcon size={16} />
                                              <strong>Rapportopmerking</strong>
                                            </div>

                                            <div className="ember-page-subtitle">
                                              Deze rapportopmerking blijft zichtbaar in de rapportage, maar telt niet mee
                                              voor certificering of het definitief oordeel.
                                            </div>
                                          </div>
                                        )}

                                        <FollowUpLinkedDocuments
                                          code={
                                            rowSourceIsCurrent
                                              ? item.atrium_installation_code
                                              : row.source_atrium_installation_code || item.atrium_installation_code
                                          }
                                          instanceId={rowSourceIsCurrent ? item.form_instance_id : rowSourceId}
                                          row={row}
                                          documents={rowSourceIsCurrent ? evidenceDocuments : []}
                                        />

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
                                          <div className="monitor-followup-action-group">
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

                                            {isWorkflow ? (
                                              <div className="monitor-certificate-menu">
                                                <button
                                                  type="button"
                                                  className={`btn btn-secondary ${certificateMenuOpenId === row.follow_up_action_id ? "monitor-certificate-menu__trigger--open" : ""}`}
                                                  disabled={followUpBusyId === row.follow_up_action_id}
                                                  onClick={() =>
                                                    setCertificateMenuOpenId((current) =>
                                                      current === row.follow_up_action_id
                                                        ? null
                                                        : row.follow_up_action_id
                                                    )
                                                  }
                                                >
                                                  <GavelIcon size={18} />
                                                  {row.certificate_impact_override
                                                    ? getCertificateImpactChoiceLabel(row.certificate_impact_override)
                                                    : "Certificaat"}
                                                </button>

                                                {certificateMenuOpenId === row.follow_up_action_id ? (
                                                  <div className="card monitor-certificate-menu__panel">
                                                    <button
                                                      type="button"
                                                      className="monitor-certificate-menu__option"
                                                      onClick={() =>
                                                        handleCertificateImpactOverride(
                                                          row.follow_up_action_id,
                                                          ""
                                                        )
                                                      }
                                                    >
                                                      Normale workflow
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="monitor-certificate-menu__option"
                                                      onClick={() =>
                                                        handleCertificateImpactOverride(
                                                          row.follow_up_action_id,
                                                          "yes"
                                                        )
                                                      }
                                                    >
                                                      Blokkeert certificaat
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="monitor-certificate-menu__option"
                                                      onClick={() =>
                                                        handleCertificateImpactOverride(
                                                          row.follow_up_action_id,
                                                          "no"
                                                        )
                                                      }
                                                    >
                                                      Blokkeert niet
                                                    </button>
                                                  </div>
                                                ) : null}
                                              </div>
                                            ) : null}
                                          </div>

                                          {isWorkflow ? (
                                            <div className="ember-toolbar">
                                              <button
                                                type="button"
                                                className={getFollowUpStatusButtonClass(rowStatus, "OPEN")}
                                                aria-pressed={rowStatus === "OPEN"}
                                                disabled={followUpBusyId === row.follow_up_action_id}
                                                onClick={() => handleFollowUpAction(row.follow_up_action_id, "set_open")}
                                              >
                                                Open
                                              </button>

                                              <button
                                                type="button"
                                                className={getFollowUpStatusButtonClass(rowStatus, "PLANNING_NODIG")}
                                                aria-pressed={rowStatus === "PLANNING_NODIG"}
                                                disabled={followUpBusyId === row.follow_up_action_id}
                                                onClick={() =>
                                                  handleFollowUpAction(
                                                    row.follow_up_action_id,
                                                    "set_planning_needed"
                                                  )
                                                }
                                              >
                                                Planning nodig
                                              </button>

                                              <button
                                                type="button"
                                                className={getFollowUpStatusButtonClass(rowStatus, "WACHTENOPDERDEN")}
                                                aria-pressed={rowStatus === "WACHTENOPDERDEN"}
                                                disabled={followUpBusyId === row.follow_up_action_id}
                                                onClick={() =>
                                                  handleFollowUpAction(
                                                    row.follow_up_action_id,
                                                    "set_waiting_third_party"
                                                  )
                                                }
                                              >
                                                Wachten op derden
                                              </button>

                                              <button
                                                type="button"
                                                className={getFollowUpStatusButtonClass(rowStatus, "GEPLAND")}
                                                aria-pressed={rowStatus === "GEPLAND"}
                                                disabled={followUpBusyId === row.follow_up_action_id}
                                                onClick={() =>
                                                  handleFollowUpAction(row.follow_up_action_id, "set_planned")
                                                }
                                              >
                                                Gepland
                                              </button>

                                              <button
                                                type="button"
                                                className={getFollowUpStatusButtonClass(rowStatus, "AFGEWEZEN")}
                                                aria-pressed={rowStatus === "AFGEWEZEN"}
                                                disabled={followUpBusyId === row.follow_up_action_id}
                                                onClick={() =>
                                                  handleFollowUpAction(row.follow_up_action_id, "set_rejected")
                                                }
                                              >
                                                Afgewezen
                                              </button>

                                              <button
                                                type="button"
                                                className={getFollowUpStatusButtonClass(rowStatus, "VERVALLEN")}
                                                aria-pressed={rowStatus === "VERVALLEN"}
                                                disabled={followUpBusyId === row.follow_up_action_id}
                                                onClick={() =>
                                                  handleFollowUpAction(row.follow_up_action_id, "set_vervallen")
                                                }
                                              >
                                                Vervallen
                                              </button>

                                              <button
                                                type="button"
                                                className={getFollowUpStatusButtonClass(rowStatus, "AFGEHANDELD")}
                                                aria-pressed={rowStatus === "AFGEHANDELD"}
                                                disabled={followUpBusyId === row.follow_up_action_id}
                                                onClick={() => handleFollowUpAction(row.follow_up_action_id, "mark_done")}
                                              >
                                                <CheckIcon size={18} className="nav-anim-icon" />
                                                Klaar
                                              </button>
                                            </div>
                                          ) : (
                                            <SummaryTag
                                              title="Rapportopmerkingen hebben geen workflowafhandeling"
                                              tone="muted"
                                            >
                                              Geen workflowactie
                                            </SummaryTag>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

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
