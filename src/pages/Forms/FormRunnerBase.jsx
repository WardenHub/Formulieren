//src/pages/Forms/FormRunnerBase.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Survey } from "survey-react-ui";
import "survey-core/survey-core.min.css";
import "../../styles/surveyjs-overrides.css";
import "../../styles/ember-form-runtime.css";

import { ChevronLeftIcon } from "@/components/ui/chevron-left";
import { FileCogIcon } from "@/components/ui/file-cog";
import { FileCheckIcon } from "@/components/ui/file-check";
import { FileCheck2Icon } from "@/components/ui/file-check-2";
import { FolderInputIcon } from "@/components/ui/folder-input";
import { FolderXIcon } from "@/components/ui/folder-x";
import { HistoryIcon } from "@/components/ui/history";
import { CheckCheckIcon } from "@/components/ui/check-check";
import { PartyPopperIcon } from "@/components/ui/party-popper";
import { RotateCCWIcon } from "@/components/ui/rotate-ccw";
import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { PlusIcon } from "@/components/ui/plus";
import { AttachFileIcon } from "@/components/ui/attach-file";
import { MicIcon } from "@/components/ui/mic";
import { AirVentIcon } from "@/components/ui/air-vent";
import { MenuIcon } from "@/components/ui/menu";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { HomeIcon } from "@/components/ui/home";
import { pushRecentHomeItem } from "../../lib/recentHomeItems.js";

import {
  getFormInstance,
  getFormInstanceDocuments,
  getFormsMonitorFollowUps,
  putFormInstanceMetadata,
  putFormInstanceDocumentFollowUps,
  putFormAnswers,
  submitFormInstance,
  previewSubmitFormInstance,
  withdrawFormInstance,
  reopenFormInstance,
} from "../../api/emberApi.js";

import FormPageNavigator from "./shared/FormPageNavigator.jsx";
import FormContextPanel from "./shared/FormContextPanel";
import FormAssistantPanel from "./shared/FormAssistantPanel.jsx";
import EmberRuntimeSurvey from "./shared/EmberRuntimeSurvey.jsx";

import {
  normalizeInstanceResponse,
  safeJsonParse,
  safeSurveyParse,
  formatNlDateTime,
  statusLabel,
  translateApiError,
  getDraftRev,
  getAnswersObject,
} from "./shared/surveyCore.jsx";

import {
  collectValidationSummary,
  syncAllMatrixQuestionVisualErrors,
} from "./shared/validation.jsx";

import { scrollToQuestionByName } from "./shared/navigation.jsx";

import {
  buildRuntimeModelFromInstance,
  refreshRuntimePrefill,
} from "./shared/runtimeBuilder.jsx";

import {
  attachRuntimeBehaviors,
} from "./shared/runtimeBehaviors.jsx";

const AUTOSAVE_IDLE_MS = 15000;
const AUTOSAVE_SAFETY_MS = 60000;

function isDirectVideoUrl(url) {
  const value = String(url || "").trim().toLowerCase();
  return value.endsWith(".mp4") || value.endsWith(".webm") || value.endsWith(".ogg");
}

function buildReadonlyBanner(status, statusLbl) {
  const st = String(status || "");

  if (st === "INGEDIEND") {
    return {
      title: "Formulier is ingediend",
      text: "Dit formulier is nu alleen-lezen. Bewerken kan pas weer nadat het formulier is teruggezet naar Concept.",
    };
  }

  if (st === "INGETROKKEN") {
    return {
      title: "Formulier is ingetrokken",
      text: "Dit formulier is nu alleen-lezen. Zet het formulier terug naar Concept om weer wijzigingen te kunnen maken.",
    };
  }

  if (st === "AFGEHANDELD") {
    return {
      title: "Formulier is afgehandeld",
      text: "Dit formulier is definitief en alleen-lezen.",
    };
  }

  return {
    title: `Formulier is ${String(statusLbl || "").toLowerCase()}`,
    text: "Dit formulier is alleen-lezen in de huidige status.",
  };
}

function normalizePreviewFollowUps(preview) {
  const items = Array.isArray(preview?.follow_ups?.items) ? preview.follow_ups.items : [];

  const normalizedItems = items.map((item, idx) => ({
    id: item?.fingerprint || `preview-${idx}`,
    questionName: String(item?.questionName || item?.question_name || "").trim(),
    kind: String(item?.kind || "").trim(),
    title: String(item?.workflowTitle || "").trim(),
    description: String(item?.workflowDescription || "").trim(),
    category: String(item?.category || "").trim(),
    certificateImpact: String(item?.certificateImpact || "").trim(),
    itemCode: String(item?.itemCode || "").trim(),
  }));

  const workflowCount = normalizedItems.filter((x) => x.kind === "workflow").length;
  const reportOnlyCount = normalizedItems.filter((x) => x.kind === "report-only").length;

  return {
    items: normalizedItems,
    workflowCount,
    reportOnlyCount,
    totalCount: normalizedItems.length,
  };
}

function normalizeSubmitSyncCounts(submitRes) {
  const counts = submitRes?.follow_up_sync?.counts || {};

  return {
    extracted: Number.isFinite(Number(counts.extracted)) ? Number(counts.extracted) : 0,
    inserted: Number.isFinite(Number(counts.inserted)) ? Number(counts.inserted) : 0,
    updated: Number.isFinite(Number(counts.updated)) ? Number(counts.updated) : 0,
    unchanged: Number.isFinite(Number(counts.unchanged)) ? Number(counts.unchanged) : 0,
    vervallen: Number.isFinite(Number(counts.vervallen)) ? Number(counts.vervallen) : 0,
  };
}

function normalizeFormDocumentsResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.documents)) return data.documents;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function normalizeFormsMonitorFollowUps(data) {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items
    .map((item) => ({
      follow_up_action_id: String(item?.follow_up_action_id || "").trim(),
      source_fingerprint: String(item?.source_fingerprint || "").trim(),
      workflow_title: String(item?.workflow_title || item?.title || "Actiepunt").trim(),
      workflow_description: String(item?.workflow_description || "").trim(),
      source_item_code: String(item?.source_item_code || "").trim(),
      kind: String(item?.kind || "").trim(),
    }))
    .filter((item) => item.follow_up_action_id);
}

function hasStoredFormDocumentFile(doc) {
  if (!doc) return false;

  const active = !(doc?.is_active === false || Number(doc?.is_active) === 0);
  if (!active) return false;

  return Boolean(
    doc?.file_name ||
      doc?.storage_key ||
      doc?.has_file ||
      doc?.uploaded_at ||
      (Number.isFinite(Number(doc?.file_size_bytes)) && Number(doc.file_size_bytes) > 0)
  );
}

async function loadFormAttachmentSummary(code, instanceId) {
  try {
    const res = await getFormInstanceDocuments(code, instanceId);
    const docs = normalizeFormDocumentsResponse(res);
    const storedDocs = docs.filter(hasStoredFormDocumentFile);
    return {
      formAttachmentCount: storedDocs.length,
      documents: storedDocs,
    };
  } catch {
    return {
      formAttachmentCount: null,
      documents: [],
    };
  }
}

function normalizeSubmitDialogDocument(doc) {
  return {
    form_instance_document_id: String(doc?.form_instance_document_id || "").trim(),
    title: String(doc?.title || doc?.file_name || "Bijlage").trim(),
    file_name: String(doc?.file_name || "").trim(),
    note: String(doc?.note || "").trim(),
    file_size_bytes: Number(doc?.file_size_bytes || 0) || 0,
    labels: Array.isArray(doc?.labels) ? doc.labels : [],
    selectedFingerprints: Array.from(
      new Set(
        (Array.isArray(doc?.follow_ups) ? doc.follow_ups : [])
          .map((item) => String(item?.source_fingerprint || "").trim())
          .filter(Boolean)
      )
    ),
  };
}

function normalizeSubmitDialogFollowUpItems(items) {
  return (Array.isArray(items) ? items : []).map((item, idx) => ({
    id: String(item?.id || `follow-up-${idx}`).trim(),
    fingerprint: String(item?.id || "").trim(),
    kind: String(item?.kind || "").trim(),
    title: String(item?.title || "Actiepunt").trim(),
    description: String(item?.description || "").trim(),
    category: String(item?.category || "").trim(),
    itemCode: String(item?.itemCode || "").trim(),
    questionName: String(item?.questionName || "").trim(),
  }));
}

function buildSubmitDialogFollowUpLabel(item) {
  const title = String(item?.title || "Actiepunt").trim();
  const source = String(item?.itemCode || item?.questionName || "").trim();
  return source ? `${title} ; ${source}` : title;
}

function buildDocumentFollowUpPayloadFromFingerprints(selectedFingerprints, actualFollowUps) {
  const byFingerprint = new Map(
    (Array.isArray(actualFollowUps) ? actualFollowUps : [])
      .filter((item) => item?.source_fingerprint && item?.follow_up_action_id)
      .map((item) => [String(item.source_fingerprint), item])
  );

  return Array.from(
    new Set(
      (Array.isArray(selectedFingerprints) ? selectedFingerprints : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  )
    .map((fingerprint, index) => {
      const match = byFingerprint.get(fingerprint);
      if (!match) return null;
      return {
        follow_up_action_id: match.follow_up_action_id,
        is_primary: index === 0,
      };
    })
    .filter(Boolean);
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFollowUpKindLabel(kind) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "workflow") return "Workflow";
  if (k === "report-only") return "Rapportopmerking";
  return kind || "Onbekend";
}

function downloadJsonFile(filename, obj) {
  const text = `${JSON.stringify(obj ?? null, null, 2)}\n`;
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

function buildDebugBundle({
  instance,
  prefillPayload,
  answersPreview,
  lastAppliedMap,
  submitSummary,
  validationSummary,
  surveyModel,
  debugAnswersText,
  instanceMetadata,
  savedInstanceMetadata,
}) {
  return {
    exported_at: new Date().toISOString(),
    instance: instance ?? null,
    instance_metadata_runtime: instanceMetadata ?? null,
    instance_metadata_saved: savedInstanceMetadata ?? null,
    survey_json: instance?.survey_json ?? null,
    answers_json_stored: getAnswersObject(instance) ?? null,
    answers_preview_runtime: answersPreview ?? {},
    answers_debug_editor_text: debugAnswersText ?? null,
    parsed_debug_editor_answers: (() => {
      const parsed = safeJsonParse(debugAnswersText || "");
      return parsed.ok ? parsed.value : null;
    })(),
    prefill_payload: prefillPayload ?? null,
    last_applied_map: lastAppliedMap ?? {},
    validation_summary: validationSummary ?? [],
    submit_summary: submitSummary ?? null,
    runtime_snapshot: surveyModel?.data ?? null,
  };
}

function defaultDebugCards() {
  return {
    instance: false,
    prefill: false,
    answersPreview: false,
    lastApplied: false,
    submitSummary: false,
    validation: false,
  };
}

function themedChip(extra = {}) {
  return {
    padding: "2px 8px",
    borderRadius: 999,
    background: "var(--tag-bg, color-mix(in srgb, var(--text) 8%, transparent))",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontWeight: 700,
    ...extra,
  };
}

function themedSoftBox(extra = {}) {
  return {
    padding: "8px 12px",
    borderRadius: 12,
    background: "var(--surface-2, color-mix(in srgb, var(--text) 6%, transparent))",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 13,
    ...extra,
  };
}

function themedPanel(extra = {}) {
  return {
    background: "var(--card-bg, var(--surface))",
    border: "1px solid var(--border)",
    color: "var(--text)",
    boxShadow: "var(--shadow-soft, var(--shadow))",
    ...extra,
  };
}

function themedErrorStyle(extra = {}) {
  return {
    color: "var(--danger, salmon)",
    ...extra,
  };
}

const EMBER_OWNED_RUNTIME_ENABLED = true;

function walkSurveyElements(node, visit) {
  if (!node || typeof node !== "object") return;

  visit(node);

  ["pages", "elements", "templateElements", "questions"].forEach((key) => {
    const items = node[key];
    if (!Array.isArray(items)) return;
    items.forEach((item) => walkSurveyElements(item, visit));
  });
}

function getEmberOwnedRuntimeCapabilityReport(surveyParsed) {
  if (!surveyParsed?.ok || !surveyParsed?.value) {
    return {
      supported: false,
      unsupportedTypes: ["survey_json"],
    };
  }

  const supportedTypes = new Set([
    "survey",
    "page",
    "panel",
    "html",
    "text",
    "comment",
    "dropdown",
    "radiogroup",
    "matrixdynamic",
    "paneldynamic",
  ]);

  const unsupportedTypes = new Set();

  walkSurveyElements(surveyParsed.value, (node) => {
    const type = String(node?.type || node?.getType?.() || "survey")
      .trim()
      .toLowerCase();

    if (!supportedTypes.has(type)) {
      unsupportedTypes.add(type || "(leeg)");
    }
  });

  return {
    supported: unsupportedTypes.size === 0,
    unsupportedTypes: Array.from(unsupportedTypes),
  };
}

function shouldUseEmberOwnedRuntime(instance, surveyParsed) {
  const capability = getEmberOwnedRuntimeCapabilityReport(surveyParsed);
  if (!capability.supported) return false;

  const formCode = String(instance?.form_code || "").trim().toUpperCase();
  if (!formCode) return false;

  return EMBER_OWNED_RUNTIME_ENABLED;
}

function readStoredPageIndex(pageStorageKey, pageCount = null) {
  if (!pageStorageKey || typeof window === "undefined") return null;

  const stores = [window.sessionStorage, window.localStorage].filter(Boolean);

  for (const store of stores) {
    try {
      const raw = store.getItem(pageStorageKey);
      const pageIndex = Number.parseInt(String(raw || ""), 10);

      if (!Number.isFinite(pageIndex) || pageIndex < 0) continue;
      if (Number.isInteger(Number(pageCount)) && Number(pageCount) > 0 && pageIndex >= Number(pageCount)) {
        continue;
      }

      return pageIndex;
    } catch {
      // Storage kan door browserbeleid geblokkeerd zijn. Dan valt de runner terug naar pagina 1.
    }
  }

  return null;
}

function writeStoredPageIndex(pageStorageKey, pageIndex) {
  if (!pageStorageKey || typeof window === "undefined") return;

  const normalized = String(Math.max(0, Number(pageIndex) || 0));
  const stores = [window.sessionStorage, window.localStorage].filter(Boolean);

  stores.forEach((store) => {
    try {
      store.setItem(pageStorageKey, normalized);
    } catch {
      // Bewaren van de paginastand is comfortgedrag en mag de runner nooit blokkeren.
    }
  });
}

function applyPageIndexToModel(model, pageIndex) {
  const pages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];
  const safeIndex = Number.isInteger(Number(pageIndex)) ? Number(pageIndex) : 0;
  const targetPage = pages[safeIndex] || null;

  if (!model || !targetPage) return null;

  try {
    model.currentPage = targetPage;
  } catch {
    return null;
  }

  return safeIndex;
}

function restoreStoredPageIndexToModel(model, pageStorageKey) {
  const pages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];
  const storedIndex = readStoredPageIndex(pageStorageKey, pages.length);

  if (storedIndex === null) return null;
  return applyPageIndexToModel(model, storedIndex);
}

function ToggleRow({ title, meta, isOpen, onToggle, iconRef, onIconEnter, onIconLeave }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      onMouseEnter={onIconEnter}
      onMouseLeave={onIconLeave}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        cursor: "pointer",
        userSelect: "none",
      }}
      title={isOpen ? "Inklappen" : "Uitklappen"}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          minWidth: 0,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 600 }}>{title}</div>
        {meta ? (
          <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {meta}
          </div>
        ) : null}
      </div>

      <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
        {!isOpen ? (
          <PlusIcon ref={iconRef} size={18} className="nav-anim-icon" />
        ) : (
          <ChevronUpIcon ref={iconRef} size={18} className="nav-anim-icon" />
        )}
      </div>
    </div>
  );
}

function normalizeMetadataValue(value) {
  if (value == null) return "";
  return String(value);
}

function normalizeMetadataParentId(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function buildInstanceMetadataState(source) {
  return {
    instance_title: normalizeMetadataValue(source?.instance_title),
    instance_note: normalizeMetadataValue(source?.instance_note),
    parent_instance_id: normalizeMetadataParentId(source?.parent_instance_id),
  };
}

function areInstanceMetadataEqual(a, b) {
  return (
    String(a?.instance_title || "") === String(b?.instance_title || "") &&
    String(a?.instance_note || "") === String(b?.instance_note || "") &&
    normalizeMetadataParentId(a?.parent_instance_id) === normalizeMetadataParentId(b?.parent_instance_id)
  );
}

export default function FormRunnerBase({ mode }) {
  const isDebug = mode === "debug";

  const { code, instanceId } = useParams();
  const navigate = useNavigate();

  const [instance, setInstance] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [validationSummary, setValidationSummary] = useState([]);

  const [dirty, setDirty] = useState(false);

  const [instanceMetadata, setInstanceMetadata] = useState(buildInstanceMetadataState(null));
  const [savedInstanceMetadata, setSavedInstanceMetadata] = useState(buildInstanceMetadataState(null));

  const [saveOk, setSaveOk] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  const [validateOk, setValidateOk] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [debugAnswersText, setDebugAnswersText] = useState("{\n  \n}\n");

  const [prefillPayload, setPrefillPayload] = useState(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [surveyRenderKey, setSurveyRenderKey] = useState(1);
  const [answersPreview, setAnswersPreview] = useState({});
  const [lastAppliedMap, setLastAppliedMap] = useState({});

  const [submitSummary, setSubmitSummary] = useState(null);
  const [showSubmitCelebration, setShowSubmitCelebration] = useState(false);
  const [showValidateCelebration, setShowValidateCelebration] = useState(false);
  const [prefillRefreshOk, setPrefillRefreshOk] = useState(false);

  const [currentPageIndex, setCurrentPageIndex] = useState(() => {
    const routePageStorageKey =
      code && instanceId ? `ember-form-page::${String(code)}::${String(instanceId)}` : "";

    return readStoredPageIndex(routePageStorageKey) ?? 0;
  });
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [hasValidatedOnce, setHasValidatedOnce] = useState(false);
  const [validationListOpen, setValidationListOpen] = useState(false);
  const [instanceMetaOpen, setInstanceMetaOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(false);
  const [assistantAutoStartToken, setAssistantAutoStartToken] = useState(0);
  const [submitDialog, setSubmitDialog] = useState(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsDocked, setActionsDocked] = useState(false);
  const [guidanceDialog, setGuidanceDialog] = useState(null);

  const [debugCards, setDebugCards] = useState(defaultDebugCards);

  const backIconRef = useRef(null);
  const contextToggleIconRef = useRef(null);
  const assistantToggleIconRef = useRef(null);
  const assistantHeaderIconRef = useRef(null);
  const actionsMenuRef = useRef(null);
  const headerCardRef = useRef(null);
  const actionsMenuIconRef = useRef(null);
  const debugJsonIconRef = useRef(null);

  const validateIconRef = useRef(null);
  const validateOkIconRef = useRef(null);

  const saveIconRef = useRef(null);
  const saveOkIconRef = useRef(null);

  const submitIconRef = useRef(null);
  const submitOkIconRef = useRef(null);

  const withdrawIconRef = useRef(null);
  const reopenIconRef = useRef(null);
  const partyPopperRef = useRef(null);
  const validateCelebrationIconRef = useRef(null);
  const prefillRefreshIconRef = useRef(null);

  const debugToggleIconRef = useRef({
    instance: null,
    prefill: null,
    answersPreview: null,
    lastApplied: null,
    submitSummary: null,
    validation: null,
  });

  const validateOkTimerRef = useRef(null);
  const saveOkTimerRef = useRef(null);
  const submitOkTimerRef = useRef(null);
  const submitCelebrationTimerRef = useRef(null);
  const validateCelebrationTimerRef = useRef(null);
  const prefillRefreshOkTimerRef = useRef(null);
  const postSubmitReloadTimerRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const autosaveIdleTimerRef = useRef(null);
  const autosaveRunningRef = useRef(false);

  const lastLoadedKeyRef = useRef("");
  const restoredPageStorageKeyRef = useRef("");
  const pageRestoreAttemptedRef = useRef(false);
  const pageRestoreInProgressRef = useRef(false);
  const pageRestoreCompletedRef = useRef(false);

  const surveyModelRef = useRef(null);
  const suppressDirtyRef = useRef(false);
  const canEditRef = useRef(false);

  const runtimeDetachRef = useRef(null);
  const energyAutoStateRef = useRef({});
  const availabilityAutoStateRef = useRef({});
  const validationActivatedRef = useRef(false);

  const bootLoadKeyRef = useRef("");
  const reloadSequenceRef = useRef(0);

  const status = useMemo(() => String(instance?.status || ""), [instance]);
  const statusLbl = useMemo(() => statusLabel(status), [status]);
  const pageStorageKey = useMemo(() => {
    if (!code || !instanceId) return "";
    return `ember-form-page::${String(code)}::${String(instanceId)}`;
  }, [code, instanceId]);

  const surveyParsed = useMemo(() => safeSurveyParse(instance?.survey_json), [instance]);

  const surveyTitle = useMemo(() => {
    if (surveyParsed.ok) {
      const t = surveyParsed.value?.title;
      if (t) return String(t);
    }
    return instance?.form_name || instance?.form_code || "Formulier";
  }, [surveyParsed, instance]);

  const headerTitle = useMemo(() => {
    return surveyTitle || "Formulier";
  }, [surveyTitle]);

  const formVersionLabel = useMemo(() => {
    const label = String(instance?.version_label || "").trim();
    if (label) return label;

    const version = instance?.version;
    if (version === null || version === undefined) return "";
    return String(version).trim();
  }, [instance]);

  function allowedActions(s) {
    const st = String(s || "");

    if (st === "CONCEPT") {
      return { validate: true, save: true, submit: true, withdraw: true, reopen: false };
    }
    if (st === "INGEDIEND") {
      return { validate: false, save: false, submit: false, withdraw: true, reopen: true };
    }
    if (st === "INGETROKKEN") {
      return { validate: false, save: false, submit: false, withdraw: false, reopen: true };
    }

    return { validate: false, save: false, submit: false, withdraw: false, reopen: false };
  }

  const isHistorical = String(instance?.installation_status || "").trim().toUpperCase() === "J";
  const readonlyBanner = useMemo(() => {
    if (isHistorical) {
      return {
        title: "Installatie is historisch",
        text: "Deze installatie is alleen als dossier beschikbaar. Nieuwe wijzigingen zijn uitgeschakeld.",
      };
    }
    return buildReadonlyBanner(status, statusLbl);
  }, [status, statusLbl, isHistorical]);

  const actions = useMemo(() => {
    if (isHistorical) {
      return { validate: false, save: false, submit: false, withdraw: false, reopen: false };
    }
    return allowedActions(status);
  }, [status, isHistorical]);

  const showValidate = actions.validate;
  const showSave = actions.save;
  const showSubmit = actions.submit;
  const showWithdraw = actions.withdraw;
  const showReopen = actions.reopen;

  const canEditAnswers = actions.save;
  const canEditMetadata = actions.save;
  const canEditEvidence = !isHistorical && ["CONCEPT", "INGEDIEND", "IN_BEHANDELING"].includes(status);
  const canDeleteEvidence = !isHistorical && status === "CONCEPT";

  const hasMetadataChanges = useMemo(() => {
    return !areInstanceMetadataEqual(instanceMetadata, savedInstanceMetadata);
  }, [instanceMetadata, savedInstanceMetadata]);

  const hasUnsavedChanges = dirty || hasMetadataChanges;

  const hasValidationItems = !isDebug && validationSummary.length > 0;
  const visibleError =
    error && !(hasValidationItems && error === "Controleer eerst de gemarkeerde velden.")
      ? error
      : null;

  const currentParentInstanceId = useMemo(() => {
    return normalizeMetadataParentId(instanceMetadata?.parent_instance_id);
  }, [instanceMetadata]);

  useEffect(() => {
    if (!code || !instanceId || !instance) return;

    pushRecentHomeItem({
      kind: "form",
      key: String(instanceId),
      title: instance.instance_title || instance.form_name || instance.form_code || `Formulier ${instanceId}`,
      subtitle: `${statusLabel(instance.status)} ; ${instance.form_name || instance.form_code || ""}`.trim(),
      to: `/installaties/${encodeURIComponent(code)}/formulieren/${encodeURIComponent(instanceId)}`,
    });
  }, [code, instanceId, instance]);

  useEffect(() => {
    const hasTitle = String(savedInstanceMetadata?.instance_title || "").trim().length > 0;
    const hasNote = String(savedInstanceMetadata?.instance_note || "").trim().length > 0;
    const hasParent = savedInstanceMetadata?.parent_instance_id != null;

    if (hasTitle || hasNote || hasParent) {
      setInstanceMetaOpen(true);
    }
  }, [savedInstanceMetadata]);

  useEffect(() => {
    canEditRef.current = canEditAnswers;
  }, [canEditAnswers]);

  useEffect(() => {
    const model = surveyModelRef.current;
    if (!model || isDebug) return;

    const syncCurrentPage = () => {
      if (pageRestoreInProgressRef.current) return;

      const pages = Array.isArray(model.visiblePages) ? model.visiblePages : [];
      const idx = pages.indexOf(model.currentPage);
      if (idx < 0) return;

      setCurrentPageIndex(idx);
    };

    syncCurrentPage();

    model.onCurrentPageChanged.add(syncCurrentPage);

    return () => {
      model.onCurrentPageChanged.remove(syncCurrentPage);
    };
  }, [runtimeReady, isDebug, instanceId, surveyRenderKey]);

  useEffect(() => {
    if (isDebug || !runtimeReady || !pageStorageKey) return;

    const model = surveyModelRef.current;
    const pages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];

    if (!model || pages.length === 0) return;

    if (restoredPageStorageKeyRef.current === pageStorageKey) {
      pageRestoreAttemptedRef.current = true;
      pageRestoreCompletedRef.current = true;
      return;
    }

    restoredPageStorageKeyRef.current = pageStorageKey;
    pageRestoreAttemptedRef.current = true;
    pageRestoreCompletedRef.current = false;

    const targetIndex = readStoredPageIndex(pageStorageKey, pages.length);

    if (targetIndex === null) {
      pageRestoreCompletedRef.current = true;
      return;
    }

    const targetPage = pages[targetIndex] || null;
    if (!targetPage) {
      pageRestoreCompletedRef.current = true;
      return;
    }

    pageRestoreInProgressRef.current = true;
    setCurrentPageIndex(targetIndex);

    try {
      model.currentPage = targetPage;
    } catch {
      // React rendering gebruikt currentPageIndex als bron van waarheid.
    }

    requestAnimationFrame(() => {
      const nextModel = surveyModelRef.current;
      const nextPages = Array.isArray(nextModel?.visiblePages) ? nextModel.visiblePages : [];
      const resolvedTargetPage = nextPages[targetIndex] || null;

      if (nextModel && resolvedTargetPage) {
        try {
          nextModel.currentPage = resolvedTargetPage;
          nextModel.render?.();
        } catch {
          try {
            nextModel.currentPage = resolvedTargetPage;
          } catch {
            // React rendering blijft leidend.
          }
        }
      }

      pageRestoreInProgressRef.current = false;
      pageRestoreCompletedRef.current = true;
      setCurrentPageIndex(targetIndex);
    });
  }, [runtimeReady, isDebug, pageStorageKey, surveyRenderKey]);

  useEffect(() => {
    if (isDebug || !runtimeReady || !pageStorageKey || !pageRestoreAttemptedRef.current) return;
    if (!pageRestoreCompletedRef.current || pageRestoreInProgressRef.current) return;

    writeStoredPageIndex(pageStorageKey, currentPageIndex);
  }, [currentPageIndex, runtimeReady, isDebug, pageStorageKey]);

  useEffect(() => {
    if (!showSubmitCelebration) return;

    const t = window.setTimeout(() => {
      partyPopperRef.current?.startAnimation?.();
    }, 40);

    return () => {
      clearTimeout(t);
      partyPopperRef.current?.stopAnimation?.();
    };
  }, [showSubmitCelebration]);

  useEffect(() => {
    if (!showValidateCelebration) return;

    const t = window.setTimeout(() => {
      validateCelebrationIconRef.current?.startAnimation?.();
    }, 40);

    return () => {
      clearTimeout(t);
      validateCelebrationIconRef.current?.stopAnimation?.();
    };
  }, [showValidateCelebration]);

  useEffect(() => {
    if (isDebug) return undefined;

    const originalOverflow = document.body.style.overflow;
    if (contextPanelOpen || assistantPanelOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = originalOverflow || "";
    }

    return () => {
      document.body.style.overflow = originalOverflow || "";
    };
  }, [contextPanelOpen, assistantPanelOpen, isDebug]);

  useEffect(() => {
    if ((!contextPanelOpen && !assistantPanelOpen) || isDebug) return undefined;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setContextPanelOpen(false);
        setAssistantPanelOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contextPanelOpen, assistantPanelOpen, isDebug]);

  useEffect(() => {
    if (canEditAnswers) return;
    setContextPanelOpen(false);
    setAssistantPanelOpen(false);
  }, [canEditAnswers]);

  useEffect(() => {
    if (!actionsMenuOpen) return undefined;

    function onPointerDown(e) {
      if (actionsMenuRef.current?.contains(e.target)) return;
      setActionsMenuOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setActionsMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsMenuOpen]);


  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let frame = 0;

    function updateDockedState() {
      frame = 0;

      const headerNode = headerCardRef.current;
      if (!headerNode) {
        setActionsDocked(false);
        return;
      }

      const rect = headerNode.getBoundingClientRect();
      const shouldDock = window.innerWidth >= 980 && rect.bottom <= 118;
      setActionsDocked((prev) => (prev === shouldDock ? prev : shouldDock));
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateDockedState);
    }

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [loading, runtimeReady, isDebug]);

  function animateDebugToggle(key) {
    debugToggleIconRef.current[key]?.startAnimation?.();
  }

  function stopDebugToggle(key) {
    debugToggleIconRef.current[key]?.stopAnimation?.();
  }

  function toggleDebugCard(key) {
    setDebugCards((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function clearTransientSuccess() {
    setValidateOk(false);
    setSaveOk(false);
    setSubmitOk(false);

    validateOkIconRef.current?.stopAnimation?.();
    saveOkIconRef.current?.stopAnimation?.();
    submitOkIconRef.current?.stopAnimation?.();
  }

  function getCurrentAnswersObject() {
    if (isDebug) {
      const parsed = safeJsonParse(debugAnswersText);
      if (!parsed.ok) return { ok: false, error: `JSON is ongeldig: ${parsed.error}` };
      return { ok: true, value: parsed.value };
    }

    if (!surveyModelRef.current) {
      return { ok: false, error: "Survey model ontbreekt. (survey_json niet geladen?)" };
    }

    return { ok: true, value: surveyModelRef.current.data || {} };
  }

  function runLocalValidation() {
    if (isDebug) {
      const parsed = safeJsonParse(debugAnswersText);
      if (!parsed.ok) {
        return {
          ok: false,
          error: `JSON is ongeldig: ${parsed.error}`,
          summary: [],
        };
      }

      if (surveyModelRef.current && parsed.value && typeof parsed.value === "object") {
        suppressDirtyRef.current = true;
        try {
          surveyModelRef.current.data = parsed.value;
          syncAllMatrixQuestionVisualErrors(surveyModelRef.current, true);
          const summary = collectValidationSummary(surveyModelRef.current);

          return {
            ok: summary.length === 0,
            summary,
            error: summary.length > 0 ? "Controleer eerst de gemarkeerde velden." : null,
          };
        } finally {
          suppressDirtyRef.current = false;
        }
      }

      return { ok: true, summary: [] };
    }

    const model = surveyModelRef.current;
    if (!model) {
      if (!surveyParsed.ok) return { ok: true, summary: [] };
      return {
        ok: false,
        error: "Survey model ontbreekt. (survey_json niet geladen?)",
        summary: [],
      };
    }

    try {
      model.validate(true);
      syncAllMatrixQuestionVisualErrors(model, true);

      const summary = collectValidationSummary(model);
      return {
        ok: summary.length === 0,
        summary,
        error: summary.length > 0 ? "Controleer eerst de gemarkeerde velden." : null,
      };
    } catch (e) {
      return {
        ok: false,
        error: `Validatie mislukt: ${String(e?.message || e || "onbekende fout")}`,
        summary: [],
      };
    }
  }

  function applyValidationResult(result, { showSuccess } = {}) {
    const summary = Array.isArray(result?.summary) ? result.summary : [];
    setValidationSummary(summary);

    if (!result?.ok) {
      setError(result?.error || "Controleer eerst de gemarkeerde velden.");
      setValidateOk(false);
      validateOkIconRef.current?.stopAnimation?.();
      return false;
    }

    setError(null);

    if (showSuccess) {
      setValidateOk(true);
      validateOkIconRef.current?.startAnimation?.();

      setShowValidateCelebration(true);
      if (validateCelebrationTimerRef.current) clearTimeout(validateCelebrationTimerRef.current);
      validateCelebrationTimerRef.current = setTimeout(() => {
        setShowValidateCelebration(false);
      }, 1800);

      if (validateOkTimerRef.current) clearTimeout(validateOkTimerRef.current);
      validateOkTimerRef.current = setTimeout(() => {
        setValidateOk(false);
        validateOkIconRef.current?.stopAnimation?.();
      }, 1500);
    }

    return true;
  }

  function setRuntimePageIndex(pageIndex, { closeBookmarks = true } = {}) {
    if (isDebug) return false;

    const model = surveyModelRef.current;
    const pages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];
    const safeIndex = Number(pageIndex);
    const targetPage = pages[safeIndex] || null;

    if (!model || !targetPage) return false;

    setCurrentPageIndex(safeIndex);

    try {
      model.currentPage = targetPage;
    } catch {
      // EmberRuntimeSurvey gebruikt currentPageIndex als bron van waarheid.
    }

    if (pageStorageKey) {
      writeStoredPageIndex(pageStorageKey, safeIndex);
    }

    if (closeBookmarks) {
      setBookmarksOpen(false);
    }

    return true;
  }

  function openValidationItem(item) {
    if (isDebug || !item) return;

    setRuntimePageIndex(item.pageIndex, { closeBookmarks: true });
    setValidationListOpen(false);

    requestAnimationFrame(() => {
      scrollToQuestionByName(item.questionName);
    });
  }

  function openSubmitSummaryItem(item) {
    if (isDebug || !item?.questionName || !surveyModelRef.current) return;

    const model = surveyModelRef.current;
    const question = model.getQuestionByName?.(item.questionName) || null;
    const targetPage = question?.page || question?.parent?.page || null;

    if (targetPage) {
      const pageIndex = model.visiblePages.indexOf(targetPage);
      if (pageIndex >= 0) {
        setRuntimePageIndex(pageIndex, { closeBookmarks: true });
      }
    }

    requestAnimationFrame(() => {
      scrollToQuestionByName(item.questionName);
    });
  }

  function openAssistantPanelWithRecording() {
    setAssistantAutoStartToken((prev) => prev + 1);
    setAssistantPanelOpen(true);
  }

  function goToPageIndex(pageIndex) {
    setRuntimePageIndex(pageIndex, { closeBookmarks: true });
  }

  function applyMetadataResultLocally(resultRow) {
    const nextDraftRev = Number(resultRow?.draft_rev);
    const safeDraftRev =
      Number.isInteger(nextDraftRev) && nextDraftRev >= 0
        ? nextDraftRev
        : getDraftRev(instance) + 1;

    setInstance((prev) =>
      prev
        ? {
            ...prev,
            instance_title: resultRow?.instance_title ?? instanceMetadata.instance_title,
            instance_note: resultRow?.instance_note ?? instanceMetadata.instance_note,
            parent_instance_id:
              resultRow?.parent_instance_id == null
                ? null
                : Number(resultRow.parent_instance_id),
            draft_rev: safeDraftRev,
            updated_at: resultRow?.updated_at ?? new Date().toISOString(),
            updated_by: resultRow?.updated_by ?? prev.updated_by,
          }
        : prev
    );
  }

  function applyAnswersSaveLocally(nextDraftRev) {
    const safeDraftRev =
      Number.isInteger(Number(nextDraftRev)) && Number(nextDraftRev) >= 0
        ? Number(nextDraftRev)
        : getDraftRev(instance) + 1;

    setInstance((prev) =>
      prev
        ? {
            ...prev,
            draft_rev: safeDraftRev,
            updated_at: new Date().toISOString(),
          }
        : prev
    );
  }

  async function persistPendingChanges(
    curValue,
    { reloadAfter = true, animateSave = true, forceAnswerSave = false } = {}
  ) {
    let workingDraftRev = getDraftRev(instance);
    let didSaveSomething = false;

    if (hasMetadataChanges) {
      const metadataPayload = {
        instance_title: instanceMetadata.instance_title,
        instance_note: instanceMetadata.instance_note,
        parent_instance_id: currentParentInstanceId,
        expected_draft_rev: workingDraftRev,
      };

      const metadataRes = await putFormInstanceMetadata(code, instanceId, metadataPayload);
      const metadataRow = metadataRes?.result ?? metadataRes ?? null;

      didSaveSomething = true;
      applyMetadataResultLocally(metadataRow);

      const savedMeta = {
        instance_title: String(metadataRow?.instance_title ?? instanceMetadata.instance_title ?? ""),
        instance_note: String(metadataRow?.instance_note ?? instanceMetadata.instance_note ?? ""),
        parent_instance_id:
          metadataRow?.parent_instance_id == null
            ? currentParentInstanceId
            : normalizeMetadataParentId(metadataRow.parent_instance_id),
      };

      setSavedInstanceMetadata(savedMeta);
      setInstanceMetadata(savedMeta);

      workingDraftRev =
        Number.isInteger(Number(metadataRow?.draft_rev)) && Number(metadataRow?.draft_rev) >= 0
          ? Number(metadataRow.draft_rev)
          : workingDraftRev + 1;
    }

    if (dirty || forceAnswerSave) {
      await putFormAnswers(code, instanceId, {
        answers_json: curValue,
        expected_draft_rev: workingDraftRev,
      });

      didSaveSomething = true;
      workingDraftRev += 1;
      applyAnswersSaveLocally(workingDraftRev);
      setDirty(false);
    }

    if (didSaveSomething) {
      setLastSavedAt(new Date().toISOString());

      if (animateSave) {
        setSaveOk(true);
        saveOkIconRef.current?.startAnimation?.();
        if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
        saveOkTimerRef.current = setTimeout(() => {
          setSaveOk(false);
          saveOkIconRef.current?.stopAnimation?.();
        }, 1500);
      }
    }

    if (reloadAfter && didSaveSomething) {
      await reload({ forceEditor: false });
    }

    return {
      didSaveSomething,
      nextDraftRev: workingDraftRev,
    };
  }

  async function persistAssistantChangesNow() {
    const cur = getCurrentAnswersObject();
    if (!cur.ok) {
      setError(cur.error);
      return {
        ok: false,
        saved: false,
        message: cur.error,
      };
    }

    try {
      const result = await persistPendingChanges(cur.value, {
        reloadAfter: false,
        animateSave: true,
        forceAnswerSave: true,
      });

      return {
        ok: true,
        saved: Boolean(result?.didSaveSomething),
        message: "Wijzigingen zijn toegepast en opgeslagen.",
      };
    } catch (e) {
      const msg = String(e?.message || e || "").toLowerCase();

      if (msg.includes("draft_rev") || msg.includes("expected_draft_rev")) {
        setError("Automatisch opslaan na assistentbewerking gaf een conflict. Ik heb de nieuwste versie opgehaald; controleer het resultaat.");
        await reload({ forceEditor: true });
      } else {
        setError(translateApiError(e, status));
      }

      return {
        ok: false,
        saved: false,
        message: "Wijzigingen zijn toegepast; automatisch opslaan is niet gelukt.",
      };
    }
  }

  async function runAutosaveNow({ animateSave = true } = {}) {
    if (autosaveRunningRef.current) return false;
    if (busy || loading || !hasUnsavedChanges) return false;

    const cur = getCurrentAnswersObject();
    if (!cur.ok) {
      setError(cur.error);
      return false;
    }

    autosaveRunningRef.current = true;

    try {
      await persistPendingChanges(cur.value, { reloadAfter: false, animateSave });
      return true;
    } catch (e) {
      const msg = String(e?.message || e || "").toLowerCase();

      if (msg.includes("draft_rev") || msg.includes("expected_draft_rev")) {
        setError("Automatisch opslaan conflict. Ik heb de nieuwste versie opgehaald. Controleer je wijzigingen en probeer opnieuw.");
        await reload({ forceEditor: true });
      } else {
        setError(translateApiError(e, status));
      }

      return false;
    } finally {
      autosaveRunningRef.current = false;
    }
  }

  async function reload({ forceEditor } = {}) {
    const reloadSeq = reloadSequenceRef.current + 1;
    reloadSequenceRef.current = reloadSeq;

    const reloadStartedAt = performance.now();
    const reloadScope = `${String(code)}::${String(instanceId)}::${Date.now()}::${reloadSeq}`;

    const isLatestReload = () => reloadSequenceRef.current === reloadSeq;
    const safeSetLoading = (value) => {
      if (isLatestReload()) setLoading(value);
    };

    const logReloadStep = () => {};

    setLoading(true);
    setError(null);

    const preferredPageIndex = readStoredPageIndex(pageStorageKey);

    logReloadStep("start", {
      code,
      instanceId,
      mode,
      forceEditor: Boolean(forceEditor),
      pageStorageKey,
      preferredPageIndex,
    });

    setValidationSummary([]);
    setRuntimeReady(false);
    setCurrentPageIndex(preferredPageIndex ?? 0);
    setHasValidatedOnce(false);
    pageRestoreAttemptedRef.current = false;
    restoredPageStorageKeyRef.current = "";
    pageRestoreInProgressRef.current = false;
    pageRestoreCompletedRef.current = false;

    try {
      logReloadStep("instance-fetch-start");
      const res = await getFormInstance(code, instanceId);
      logReloadStep("instance-fetch-done");
      if (!isLatestReload()) {
        logReloadStep("stale-after-instance-fetch");
        return;
      }

      const inst = normalizeInstanceResponse(res);
      setInstance(inst || null);

      const nextDraftRev = getDraftRev(inst);
      const answersObj = getAnswersObject(inst);

      logReloadStep("instance-normalized", {
        formCode: inst?.form_code || null,
        status: inst?.status || null,
        draftRev: nextDraftRev,
        hasSurveyJson: Boolean(inst?.survey_json),
      });

      const key = `${String(instanceId)}::${String(nextDraftRev)}`;
      const alreadyLoaded = lastLoadedKeyRef.current === key;

      const parsedSurvey = safeSurveyParse(inst?.survey_json);
      const shouldOverwriteEditor = forceEditor || (!dirty && !alreadyLoaded);
      const shouldOverwriteMetadata = forceEditor || (!hasMetadataChanges && !alreadyLoaded);

      logReloadStep("survey-parse-done", {
        ok: parsedSurvey.ok,
        shouldOverwriteEditor,
        shouldOverwriteMetadata,
        alreadyLoaded,
      });

      if (shouldOverwriteMetadata) {
        const nextMetadata = buildInstanceMetadataState(inst);
        setInstanceMetadata(nextMetadata);
        setSavedInstanceMetadata(nextMetadata);
      }

      if (!parsedSurvey.ok) {
        surveyModelRef.current = null;
        setPrefillPayload(null);
        setAnswersPreview({});
        setLastAppliedMap({});
        setRuntimeReady(false);

        if (isDebug && shouldOverwriteEditor) {
          setDebugAnswersText(JSON.stringify(answersObj || {}, null, 2));
          setDirty(false);
          lastLoadedKeyRef.current = key;
        }

        logReloadStep("survey-parse-error", { error: parsedSurvey.error || null });
        safeSetLoading(false);
        return;
      }

      if (!shouldOverwriteEditor && surveyModelRef.current) {
        logReloadStep("reuse-existing-model");
        setRuntimeReady(true);
        safeSetLoading(false);
        return;
      }

      if (runtimeDetachRef.current) {
        logReloadStep("detach-previous-runtime-start");
        runtimeDetachRef.current();
        runtimeDetachRef.current = null;
        logReloadStep("detach-previous-runtime-done");
      }

      energyAutoStateRef.current = {};
      availabilityAutoStateRef.current = {};
      validationActivatedRef.current = false;

      logReloadStep("runtime-build-start");
      let runtimeBuildTimedOut = false;
      const runtime = await Promise.race([
        buildRuntimeModelFromInstance({
          instance: inst,
          code,
          onDirtyChange: setDirty,
          canEditRef,
          suppressDirtyRef,
          lastAppliedMap,
        }),
        new Promise((resolve) => {
          window.setTimeout(() => {
            runtimeBuildTimedOut = true;
            resolve({
              ok: false,
              error:
                "Runtime model kon niet tijdig worden opgebouwd. De instance is geladen, maar buildRuntimeModelFromInstance bleef hangen.",
            });
          }, 12000);
        }),
      ]);
      logReloadStep("runtime-build-done", { ok: runtime?.ok, timedOut: runtimeBuildTimedOut });
      if (!isLatestReload()) {
        logReloadStep("stale-after-runtime-build");
        return;
      }

      if (!runtime.ok) {
        surveyModelRef.current = null;
        setPrefillPayload(null);
        setAnswersPreview({});
        setLastAppliedMap({});
        setRuntimeReady(false);
        setError(runtime.error || "Runtime model kon niet worden opgebouwd.");
        safeSetLoading(false);
        return;
      }

      logReloadStep("page-restore-start");
      const restoredPageIndex = restoreStoredPageIndexToModel(runtime.model, pageStorageKey);
      const visiblePages = Array.isArray(runtime.model?.visiblePages) ? runtime.model.visiblePages : [];
      const currentRuntimePageIndex = visiblePages.indexOf(runtime.model.currentPage);
      const nextPageIndex = restoredPageIndex ?? (currentRuntimePageIndex >= 0 ? currentRuntimePageIndex : 0);
      logReloadStep("page-restore-done", {
        restoredPageIndex,
        currentRuntimePageIndex,
        nextPageIndex,
        visiblePageCount: visiblePages.length,
      });

      surveyModelRef.current = runtime.model;
      setCurrentPageIndex(nextPageIndex);
      pageRestoreAttemptedRef.current = true;
      pageRestoreCompletedRef.current = true;
      restoredPageStorageKeyRef.current = pageStorageKey;
      setPrefillPayload(runtime.prefillPayload || null);
      setLastAppliedMap(runtime.lastAppliedMap || {});
      setAnswersPreview({ ...(runtime.model.data || {}) });

      logReloadStep("runtime-attach-start");
      let runtimeAttachTimedOut = false;
      const attachResult = await Promise.race([
        Promise.resolve().then(() => attachRuntimeBehaviors({
          model: runtime.model,
          prefillPayload: runtime.prefillPayload,
          energyAutoStateRef,
          availabilityAutoStateRef,
          validationActivatedRef,
          suppressDirtyRef,
          onAnswersSnapshotChange: setAnswersPreview,
          onValidationSummaryChange: setValidationSummary,
          guidanceByQuestion: inst?.guidance_by_question || null,
          guidanceByMatrixRow: inst?.guidance_by_matrix_row || null,
          onOpenQuestionGuidance: setGuidanceDialog,
        })),
        new Promise((resolve) => {
          window.setTimeout(() => {
            runtimeAttachTimedOut = true;
            resolve(null);
          }, 8000);
        }),
      ]);
      runtimeDetachRef.current = typeof attachResult === "function" ? attachResult : null;
      logReloadStep("runtime-attach-done", { timedOut: runtimeAttachTimedOut });
      if (!isLatestReload()) {
        logReloadStep("stale-after-runtime-attach");
        return;
      }

      if (runtimeAttachTimedOut) {
        setError("Runtime behaviors konden niet tijdig worden gekoppeld. De formulierdata is geladen, maar de gedraglaag bleef hangen.");
        setRuntimeReady(false);
        safeSetLoading(false);
        return;
      }

      if (isDebug && shouldOverwriteEditor) {
        setDebugAnswersText(JSON.stringify(answersObj || {}, null, 2));
      }

      setDirty(false);
      setRuntimeReady(true);
      setSurveyRenderKey((prev) => prev + 1);
      lastLoadedKeyRef.current = key;
      logReloadStep("done", { nextPageIndex });
    } catch (e) {
      if (!isLatestReload()) {
        logReloadStep("stale-error", { error: String(e?.message || e || "") });
        return;
      }

      logReloadStep("error", { error: String(e?.message || e || "") });
      setError(translateApiError(e, status));
      setInstance(null);
      surveyModelRef.current = null;
      setPrefillPayload(null);
      setAnswersPreview({});
      setLastAppliedMap({});
      setRuntimeReady(false);
    } finally {
      safeSetLoading(false);
    }
  }

  useEffect(() => {
    if (!code || !instanceId) return undefined;

    const bootKey = `${String(code)}::${String(instanceId)}::${String(mode || "normal")}`;
    let cancelled = false;

    const bootTimer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      if (bootLoadKeyRef.current === bootKey) {
        return;
      }

      bootLoadKeyRef.current = bootKey;
      reload({ forceEditor: true });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, instanceId, mode]);

  useEffect(() => {
    return () => {
      if (runtimeDetachRef.current) {
        runtimeDetachRef.current();
        runtimeDetachRef.current = null;
      }

      if (validateOkTimerRef.current) clearTimeout(validateOkTimerRef.current);
      if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
      if (submitOkTimerRef.current) clearTimeout(submitOkTimerRef.current);
      if (submitCelebrationTimerRef.current) clearTimeout(submitCelebrationTimerRef.current);
      if (validateCelebrationTimerRef.current) clearTimeout(validateCelebrationTimerRef.current);
      if (prefillRefreshOkTimerRef.current) clearTimeout(prefillRefreshOkTimerRef.current);
      if (postSubmitReloadTimerRef.current) clearTimeout(postSubmitReloadTimerRef.current);
      if (autosaveIdleTimerRef.current) clearTimeout(autosaveIdleTimerRef.current);
      if (autosaveTimerRef.current) clearInterval(autosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && guidanceDialog) {
        setGuidanceDialog(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [guidanceDialog]);

  useEffect(() => {
    function onKeyDown(e) {
      const key = String(e.key || "");

      if (e.altKey && (key === "s" || key === "S")) {
        if (!showSave) return;
        if (busy) return;
        if (!hasUnsavedChanges) return;

        e.preventDefault();
        save();
        return;
      }

      if (e.altKey && (key === "q" || key === "Q")) {
        if (!hasValidationItems) return;

        e.preventDefault();
        setValidationListOpen((prev) => !prev);

      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSave, busy, hasUnsavedChanges, hasValidationItems]);

  useEffect(() => {
    if (isDebug || !canEditAnswers) return undefined;

    if (autosaveIdleTimerRef.current) {
      clearTimeout(autosaveIdleTimerRef.current);
      autosaveIdleTimerRef.current = null;
    }

    if (busy || loading || !hasUnsavedChanges) return undefined;

    const timer = window.setTimeout(() => {
      runAutosaveNow({ animateSave: true });
    }, AUTOSAVE_IDLE_MS);

    autosaveIdleTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (autosaveIdleTimerRef.current === timer) {
        autosaveIdleTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDebug, canEditAnswers, busy, loading, hasUnsavedChanges, status, instance, instanceMetadata, savedInstanceMetadata, dirty]);

  useEffect(() => {
    if (isDebug || !canEditAnswers) return undefined;

    const timer = window.setInterval(async () => {
      await runAutosaveNow({ animateSave: true });
    }, AUTOSAVE_SAFETY_MS);

    autosaveTimerRef.current = timer;

    return () => {
      window.clearInterval(timer);
      if (autosaveTimerRef.current === timer) {
        autosaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDebug, canEditAnswers, busy, loading, hasUnsavedChanges, status, instance, instanceMetadata, savedInstanceMetadata, dirty]);

  async function handleRefreshPrefill() {
    if (isDebug) return;
    if (!canEditAnswers) return;
    if (!surveyModelRef.current) return;

    setBusy(true);
    setError(null);

    try {
      const result = await refreshRuntimePrefill({
        instance,
        code,
        model: surveyModelRef.current,
        lastAppliedMap,
      });

      if (!result?.ok) {
        setError(result?.error || "Voorinvullen vernieuwen mislukt.");
        return;
      }

      setPrefillPayload(result.prefillPayload || null);
      setLastAppliedMap(result.lastAppliedMap || {});
      setAnswersPreview(result.data || {});

      if (result.changed) {
        setDirty(true);
      }

      setSurveyRenderKey((prev) => prev + 1);

      setPrefillRefreshOk(true);
      prefillRefreshIconRef.current?.startAnimation?.();

      if (prefillRefreshOkTimerRef.current) {
        clearTimeout(prefillRefreshOkTimerRef.current);
      }

      prefillRefreshOkTimerRef.current = setTimeout(() => {
        setPrefillRefreshOk(false);
        prefillRefreshIconRef.current?.stopAnimation?.();
      }, 1800);
    } catch (e) {
      setError(String(e?.message || e || "Voorinvullen vernieuwen mislukt."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssistantApplied(result) {
    if (!result?.changed) {
      return {
        ok: true,
        saved: false,
        message: "Geen nieuwe wijzigingen om op te slaan.",
      };
    }

    setDirty(true);
    setSurveyRenderKey((prev) => prev + 1);

    if (validationActivatedRef.current) {
      const validation = runLocalValidation();
      applyValidationResult(validation, { showSuccess: false });
    }

    return persistAssistantChangesNow();
  }

  async function validateForm() {
    if (!showValidate) {
      setError(`Controleren is niet toegestaan in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    clearTransientSuccess();
    setError(null);
    validationActivatedRef.current = true;
    setHasValidatedOnce(true);

    try {
      const result = runLocalValidation();
      const valid = applyValidationResult(result, { showSuccess: true });

      if (!valid && Array.isArray(result?.summary) && result.summary.length > 0) {
        setValidationListOpen(true);
        setBookmarksOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!showSave) {
      setError(`Opslaan is niet zichtbaar/actief in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    setError(null);

    const cur = getCurrentAnswersObject();
    if (!cur.ok) {
      setBusy(false);
      setError(cur.error);
      return;
    }

    try {
      await persistPendingChanges(cur.value, { reloadAfter: true, animateSave: true });
    } catch (e) {
      const msg = String(e?.message || e || "").toLowerCase();

      if (msg.includes("draft_rev") || msg.includes("expected_draft_rev")) {
        setError("Opslaan conflict. Ik heb de nieuwste versie opgehaald. Probeer opnieuw.");
        await reload({ forceEditor: true });
      } else {
        setError(translateApiError(e, status));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!showSubmit) {
      setError(`Indienen is niet toegestaan in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    clearTransientSuccess();
    setError(null);
    validationActivatedRef.current = true;
    setHasValidatedOnce(true);

    try {
      const cur = getCurrentAnswersObject();
      if (!cur.ok) {
        setError(cur.error);
        return;
      }

      const validation = runLocalValidation();
      const valid = applyValidationResult(validation, { showSuccess: false });
      if (!valid) {
        if (Array.isArray(validation?.summary) && validation.summary.length > 0) {
          setValidationListOpen(true);
          setBookmarksOpen(false);
        }
        return;
      }

      const preview = await previewSubmitFormInstance(code, instanceId, {
        answers_json: cur.value,
      });

      if (preview?.can_submit === false) {
        setError(
          preview?.message ||
            "Indienen is nog niet mogelijk. Controleer het formulier en probeer opnieuw."
        );
        return;
      }

      const previewSummary = normalizePreviewFollowUps(preview);
      const attachmentSummary = await loadFormAttachmentSummary(code, instanceId);

      setSubmitDialog({
        rawPreview: preview,
        previewSummary,
        followUpItems: normalizeSubmitDialogFollowUpItems(previewSummary.items),
        formAttachmentCount: attachmentSummary.formAttachmentCount,
        documents: (attachmentSummary.documents || []).map(normalizeSubmitDialogDocument),
        submitting: false,
      });
    } catch (e) {
      const msg = String(e?.message || e || "").toLowerCase();

      if (msg.includes("draft_rev") || msg.includes("expected_draft_rev")) {
        setError("Opslaan conflict. Ik heb de nieuwste versie opgehaald. Probeer opnieuw.");
        await reload({ forceEditor: true });
      } else {
        setError(translateApiError(e, status));
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleSubmitDialogDocumentFollowUp(documentId, fingerprint) {
    setSubmitDialog((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        documents: prev.documents.map((doc) => {
          if (doc.form_instance_document_id !== documentId) return doc;

          const nextSet = new Set(doc.selectedFingerprints || []);
          if (nextSet.has(fingerprint)) nextSet.delete(fingerprint);
          else nextSet.add(fingerprint);

          return {
            ...doc,
            selectedFingerprints: Array.from(nextSet),
          };
        }),
      };
    });
  }

  async function confirmSubmitDialog() {
    if (!submitDialog) return;

    setBusy(true);
    setError(null);
    setSubmitDialog((prev) => (prev ? { ...prev, submitting: true } : prev));

    try {
      const cur = getCurrentAnswersObject();
      if (!cur.ok) {
        setError(cur.error);
        return;
      }

      if (hasUnsavedChanges) {
        await persistPendingChanges(cur.value, { reloadAfter: false, animateSave: false });
      }

      const submitRes = await submitFormInstance(code, instanceId);
      const syncCounts = normalizeSubmitSyncCounts(submitRes);

      const selectedDocs = (submitDialog.documents || []).filter(
        (doc) => Array.isArray(doc.selectedFingerprints) && doc.selectedFingerprints.length > 0
      );

      if (selectedDocs.length > 0) {
        const followUpsRes = await getFormsMonitorFollowUps(instanceId);
        const actualFollowUps = normalizeFormsMonitorFollowUps(followUpsRes);

        for (const doc of selectedDocs) {
          const payload = buildDocumentFollowUpPayloadFromFingerprints(
            doc.selectedFingerprints,
            actualFollowUps
          );

          await putFormInstanceDocumentFollowUps(
            code,
            instanceId,
            doc.form_instance_document_id,
            payload
          );
        }
      }

      setSubmitSummary({
        ...submitDialog.previewSummary,
        syncCounts,
        rawPreview: submitDialog.rawPreview,
        rawSubmit: submitRes,
      });

      setInstance((prev) =>
        prev
          ? {
              ...prev,
              status: "INGEDIEND",
              submitted_at: new Date().toISOString(),
            }
          : prev
      );

      setDirty(false);
      setSavedInstanceMetadata(buildInstanceMetadataState({
        instance_title: instanceMetadata.instance_title,
        instance_note: instanceMetadata.instance_note,
        parent_instance_id: currentParentInstanceId,
      }));

      setSubmitDialog(null);
      setShowSubmitCelebration(true);

      if (submitCelebrationTimerRef.current) {
        clearTimeout(submitCelebrationTimerRef.current);
      }

      submitCelebrationTimerRef.current = setTimeout(() => {
        setShowSubmitCelebration(false);
      }, 2400);

      if (postSubmitReloadTimerRef.current) {
        clearTimeout(postSubmitReloadTimerRef.current);
      }

      postSubmitReloadTimerRef.current = setTimeout(() => {
        reload({ forceEditor: false });
      }, 2600);

      setSubmitOk(true);
      submitOkIconRef.current?.startAnimation?.();
      if (submitOkTimerRef.current) clearTimeout(submitOkTimerRef.current);
      submitOkTimerRef.current = setTimeout(() => {
        setSubmitOk(false);
        submitOkIconRef.current?.stopAnimation?.();
      }, 5000);
    } catch (e) {
      const msg = String(e?.message || e || "").toLowerCase();

      if (msg.includes("draft_rev") || msg.includes("expected_draft_rev")) {
        setError("Opslaan conflict. Ik heb de nieuwste versie opgehaald. Probeer opnieuw.");
        await reload({ forceEditor: true });
      } else {
        setError(translateApiError(e, status));
      }
    } finally {
      setBusy(false);
      setSubmitDialog((prev) => (prev ? { ...prev, submitting: false } : prev));
    }
  }

  async function withdraw() {
    if (!showWithdraw) {
      setError(`Intrekken is niet toegestaan in status (${statusLbl}).`);
      return;
    }

    const ok = window.confirm("Weet je zeker dat je dit formulier wilt intrekken?");
    if (!ok) return;

    setBusy(true);
    setError(null);

    try {
      await withdrawFormInstance(code, instanceId);
      await reload({ forceEditor: false });
    } catch (e) {
      setError(translateApiError(e, status));
    } finally {
      setBusy(false);
    }
  }

  async function reopenToConcept() {
    if (!showReopen) {
      setError(`Terug naar concept is niet toegestaan in status (${statusLbl}).`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await reopenFormInstance(code, instanceId);
      setSubmitSummary(null);
      await reload({ forceEditor: false });
    } catch (e) {
      setError(translateApiError(e, status));
    } finally {
      setBusy(false);
    }
  }

  function downloadDebugBundle() {
    const bundle = buildDebugBundle({
      instance,
      prefillPayload,
      answersPreview,
      lastAppliedMap,
      submitSummary,
      validationSummary,
      surveyModel: surveyModelRef.current,
      debugAnswersText,
      instanceMetadata,
      savedInstanceMetadata,
    });

    const stamp = new Date().toISOString().replaceAll(":", "-");
    downloadJsonFile(`formrunner_debug_bundle_${stamp}.json`, bundle);
  }

  const model = !isDebug ? surveyModelRef.current : null;
  const useEmberRuntime = !isDebug && shouldUseEmberOwnedRuntime(instance, surveyParsed);
  const canRenderRuntimeWhileLoading = !isDebug && runtimeReady && Boolean(model);


  if (loading && !canRenderRuntimeWhileLoading) return <div className="muted">Laden...</div>;

  return (
    <div
      className={`form-runner-page ember-page-stack form-runner-page--with-sticky-actions${actionsDocked ? " form-runner-page--actions-docked" : ""}`} 
      style={{
        display: "grid",
        gap: 12,
        position: "relative",
        color: "var(--text)",
      }}
    >
      {showSubmitCelebration && !isDebug && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 60,
            background: "color-mix(in srgb, var(--bg) 14%, transparent)",
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
              ...themedPanel({
                boxShadow: "0 20px 60px color-mix(in srgb, var(--shadow-color, #000) 28%, transparent)",
              }),
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
                background: "color-mix(in srgb, var(--text) 8%, transparent)",
                boxShadow: "0 0 0 8px color-mix(in srgb, var(--text) 4%, transparent)",
              }}
            >
              <PartyPopperIcon ref={partyPopperRef} size={36} />
            </div>

            <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.1 }}>
              Super; ingediend
            </div>

            <div className="muted" style={{ fontSize: 13 }}>
              Het formulier is succesvol verwerkt.
            </div>
          </div>
        </div>
      )}

      {showValidateCelebration && !isDebug && (
        <div
          style={{
            position: "fixed",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 55,
            pointerEvents: "none",
          }}
        >
          <div
            className="card"
            style={{
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              ...themedPanel({
                boxShadow: "0 18px 50px color-mix(in srgb, var(--shadow-color, #000) 22%, transparent)",
              }),
            }}
          >
            <CheckCheckIcon ref={validateCelebrationIconRef} size={20} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Controle voltooid</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Formulier is klaar om in te dienen.
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        ref={headerCardRef}
        className="card form-runner-header-card"
        style={{
          padding: 12,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          className="form-runner-header-row"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div className="form-runner-header-main" style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0, flex: 1 }}>
            <button
              type="button"
              className="icon-btn"
              title="Terug"
              onClick={() => navigate(-1)}
              onMouseEnter={() => backIconRef.current?.startAnimation?.()}
              onMouseLeave={() => backIconRef.current?.stopAnimation?.()}
            >
              <ChevronLeftIcon ref={backIconRef} size={18} />
            </button>

            <button
              type="button"
              onClick={() => setInstanceMetaOpen((prev) => !prev)}
              title={instanceMetaOpen ? "Verberg formulierdetails" : "Toon formulierdetails"}
              style={{
                appearance: "none",
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                color: "inherit",
                textAlign: "left",
                cursor: "pointer",
                minWidth: 0,
                display: "grid",
                gap: 2,
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 16,
                  lineHeight: 1.2,
                }}
              >
                {headerTitle}
                {isDebug ? " (debug)" : ""}
              </div>
              <div
                className="muted"
                style={{
                  fontSize: 12,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span>installatie: {code}</span>
                <span>status: {statusLbl}</span>

                {formVersionLabel ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>versie: {formVersionLabel}</span>
                  </span>
                ) : currentParentInstanceId ? (
                  <span
                    style={themedChip({ fontSize: 12 })}
                    title="Deze instantie is gekoppeld aan een bovenliggende formulierinstantie."
                  >
                    vervolg op #{currentParentInstanceId}
                  </span>
                ) : null}

                {lastSavedAt ? <span>laatst opgeslagen: {formatNlDateTime(lastSavedAt)}</span> : null}
                {hasUnsavedChanges ? <span>wijzigingen niet opgeslagen</span> : null}

                {!canEditAnswers && !isDebug ? (
                  <span style={themedChip({ fontSize: 12 })}>
                    Klaar
                  </span>
                ) : null}

                {prefillRefreshOk ? (
                  <span style={themedChip({ fontSize: 12 })}>
                    Voorinvulling vernieuwd
                  </span>
                ) : null}
              </div>
            </button>
          </div>

          <div className="form-runner-header-actions" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {!isDebug && status === "INGEDIEND" ? (
              <button
                type="button"
                className="icon-btn"
                title="Naar home"
                onClick={() => navigate("/")}
              >
                <HomeIcon size={18} />
              </button>
            ) : null}

            {!isDebug && (
              <div ref={actionsMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  onClick={() => setActionsMenuOpen((prev) => !prev)}
                  onMouseEnter={() => actionsMenuIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => actionsMenuIconRef.current?.stopAnimation?.()}
                  title="Meer acties"
                  aria-haspopup="menu"
                  aria-expanded={actionsMenuOpen}
                >
                  <MenuIcon ref={actionsMenuIconRef} size={18} className="nav-anim-icon" />
                </button>

                {actionsMenuOpen && (
                  <div
                    className="card form-runner-actions-menu"
                    role="menu"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      zIndex: 80,
                      minWidth: 260,
                      padding: 8,
                      display: "grid",
                      gap: 6,
                      boxShadow: "var(--shadow-panel, var(--shadow))",
                    }}
                  >
                    {canEditAnswers && (
                      <button
                        type="button"
                        className="menu-item"
                        role="menuitem"
                        disabled={busy || !surveyModelRef.current}
                        onClick={() => {
                          setActionsMenuOpen(false);
                          handleRefreshPrefill();
                        }}
                        onMouseEnter={() => prefillRefreshIconRef.current?.startAnimation?.()}
                        onMouseLeave={() => {
                          if (!prefillRefreshOk) prefillRefreshIconRef.current?.stopAnimation?.();
                        }}
                        title="Haal de laatste installatiedata op en vul deze in op het formulier."
                      >
                        <RotateCCWIcon ref={prefillRefreshIconRef} size={18} />
                        <span>Voorinvulling vernieuwen</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="menu-item"
                      role="menuitem"
                      disabled={busy}
                      onMouseEnter={() => debugJsonIconRef.current?.startAnimation?.()}
                      onMouseLeave={() => debugJsonIconRef.current?.stopAnimation?.()}
                      onClick={() => {
                        setActionsMenuOpen(false);
                        navigate(
                          `/installaties/${encodeURIComponent(code)}/formulieren/${encodeURIComponent(
                            instanceId
                          )}/debug`
                        );
                      }}
                    >
                      <AirVentIcon ref={debugJsonIconRef} size={18} className="nav-anim-icon" />
                      <span>Debug JSON</span>
                    </button>

                    {showReopen && (
                      <button
                        type="button"
                        className="menu-item"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          setActionsMenuOpen(false);
                          reopenToConcept();
                        }}
                        onMouseEnter={() => reopenIconRef.current?.startAnimation?.()}
                        onMouseLeave={() => reopenIconRef.current?.stopAnimation?.()}
                        title="Terug naar concept"
                      >
                        <HistoryIcon ref={reopenIconRef} size={18} />
                        <span>Terug naar concept</span>
                      </button>
                    )}

                    {showWithdraw && (
                      <button
                        type="button"
                        className="menu-item danger"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          setActionsMenuOpen(false);
                          withdraw();
                        }}
                        onMouseEnter={() => withdrawIconRef.current?.startAnimation?.()}
                        onMouseLeave={() => withdrawIconRef.current?.stopAnimation?.()}
                        title="Intrekken"
                      >
                        <FolderXIcon ref={withdrawIconRef} size={18} />
                        <span>Intrekken</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {isDebug && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={downloadDebugBundle}
                >
                  Download debug-bundle
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    navigate(
                      `/installaties/${encodeURIComponent(code)}/formulieren/${encodeURIComponent(
                        instanceId
                      )}`
                    )
                  }
                >
                  Terug naar formulier
                </button>
              </>
            )}

            {showValidate && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={validateForm}
                onMouseEnter={() => {
                  if (!validateOk) validateIconRef.current?.startAnimation?.();
                }}
                onMouseLeave={() => {
                  if (!validateOk) validateIconRef.current?.stopAnimation?.();
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                title="Controleer het formulier zonder op te slaan"
              >
                {validateOk ? (
                  <CheckCheckIcon ref={validateOkIconRef} size={18} />
                ) : (
                  <CheckCheckIcon ref={validateIconRef} size={18} />
                )}
                Controleer
              </button>
            )}

            {showSubmit && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={submit}
                onMouseEnter={() => {
                  if (!submitOk) submitIconRef.current?.startAnimation?.();
                }}
                onMouseLeave={() => {
                  if (!submitOk) submitIconRef.current?.stopAnimation?.();
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                title={
                  hasUnsavedChanges
                    ? "Indienen; controleert, toont opvolgingen en slaat eerst op"
                    : "Indienen"
                }
              >
                {submitOk ? (
                  <FileCheck2Icon ref={submitOkIconRef} size={18} />
                ) : (
                  <FolderInputIcon ref={submitIconRef} size={18} />
                )}
                Indienen
              </button>
            )}

            {showSave && (
              <button
                type="button"
                className="btn"
                disabled={busy || !hasUnsavedChanges}
                onClick={save}
                onMouseEnter={() => {
                  if (!saveOk) saveIconRef.current?.startAnimation?.();
                }}
                onMouseLeave={() => {
                  if (!saveOk) saveIconRef.current?.stopAnimation?.();
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                title={hasUnsavedChanges ? "Opslaan (Alt+S)" : "Geen wijzigingen om op te slaan."}
              >
                {saveOk ? (
                  <FileCheckIcon ref={saveOkIconRef} size={18} />
                ) : (
                  <FileCogIcon ref={saveIconRef} size={18} />
                )}
                Opslaan
              </button>
            )}
          </div>
        </div>

        {instanceMetaOpen && (
          <div
            style={{
              display: "grid",
              gap: 10,
              paddingTop: 2,
              borderTop: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "minmax(260px, 480px) minmax(320px, 1fr)",
                alignItems: "start",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Titel
                </div>
                <input
                  className="input"
                  type="text"
                  maxLength={200}
                  value={instanceMetadata.instance_title}
                  onChange={(e) =>
                    setInstanceMetadata((prev) => ({
                      ...prev,
                      instance_title: e.target.value,
                    }))
                  }
                  disabled={!canEditMetadata}
                  placeholder="Optionele titel voor deze formulierinstantie"
                  title={!canEditMetadata ? "Bewerken kan alleen in status: Concept." : undefined}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div className="muted" style={{ fontSize: 12 }}>
                    Opmerking
                  </div>

                  {currentParentInstanceId ? (
                    <span
                      className="muted"
                      style={themedChip({ fontSize: 12 })}
                      title="Deze instantie is gekoppeld aan een bovenliggende formulierinstantie."
                    >
                      vervolg op #{currentParentInstanceId}
                    </span>
                  ) : null}
                </div>

                <textarea
                  className="input"
                  value={instanceMetadata.instance_note}
                  onChange={(e) =>
                    setInstanceMetadata((prev) => ({
                      ...prev,
                      instance_note: e.target.value,
                    }))
                  }
                  disabled={!canEditMetadata}
                  placeholder="Optionele interne opmerking bij deze formulierinstantie"
                  title={!canEditMetadata ? "Bewerken kan alleen in status: Concept." : undefined}
                  style={{
                    width: "100%",
                    minHeight: 76,
                    resize: "vertical",
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {visibleError && <div style={themedErrorStyle()}>{visibleError}</div>}

      {!isDebug && submitSummary && status === "INGEDIEND" && (
        <div
          className="card"
          style={{
            padding: 14,
            display: "grid",
            gap: 10,
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                Formulier succesvol ingediend
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                De opvolgverwerking is uitgevoerd.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={themedSoftBox()}>
              Workflowitems: <strong>{submitSummary.workflowCount}</strong>
            </div>

            <div style={themedSoftBox()}>
              Rapportopmerkingen: <strong>{submitSummary.reportOnlyCount}</strong>
            </div>

            <div style={themedSoftBox()}>
              Totaal preview: <strong>{submitSummary.totalCount}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={themedSoftBox()}>
              Ingevoegd: <strong>{submitSummary.syncCounts.inserted}</strong>
            </div>

            <div style={themedSoftBox()}>
              Bijgewerkt: <strong>{submitSummary.syncCounts.updated}</strong>
            </div>

            <div style={themedSoftBox()}>
              Ongewijzigd: <strong>{submitSummary.syncCounts.unchanged}</strong>
            </div>

            <div style={themedSoftBox()}>
              Vervallen: <strong>{submitSummary.syncCounts.vervallen}</strong>
            </div>
          </div>

          {submitSummary.items.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Verwerkte opvolgitems</div>

              <div style={{ display: "grid", gap: 6 }}>
                {submitSummary.items.slice(0, 8).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => openSubmitSummaryItem(item)}
                    disabled={!item.questionName}
                    style={themedSoftBox({
                      padding: "10px 12px",
                      display: "grid",
                      gap: 4,
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      cursor: item.questionName ? "pointer" : "default",
                      opacity: item.questionName ? 1 : 0.88,
                    })}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{item.title || "Zonder titel"}</strong>
                      {item.kind ? (
                        <span
                          className="muted"
                          style={themedChip({ fontSize: 12 })}
                        >
                          {formatFollowUpKindLabel(item.kind)}
                        </span>
                      ) : null}
                    </div>

                    {item.description ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {item.description}
                      </div>
                    ) : null}
                  </button>
                ))}

                {submitSummary.items.length > 8 && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    En nog {submitSummary.items.length - 8} item(s).
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!isDebug && !submitSummary && !canEditAnswers && runtimeReady && surveyModelRef.current && (
        <div
          className="card form-runner-readonly-banner"
          style={{
            padding: 14,
            display: "grid",
            gap: 6,
            border: "1px solid var(--border)",
            background: "var(--surface-2, color-mix(in srgb, var(--text) 4%, transparent))",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 17 }}>
            {readonlyBanner.title}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {readonlyBanner.text}
          </div>
        </div>
      )}

      {!isDebug && runtimeReady && surveyModelRef.current && (
        <FormPageNavigator
          model={surveyModelRef.current}
          currentPageIndex={currentPageIndex}
          validationSummary={validationSummary}
          hasValidatedOnce={hasValidatedOnce}
          bookmarksOpen={bookmarksOpen}
          validationOpen={validationListOpen}
          onToggleBookmarks={(next) => {
            const shouldOpen = typeof next === "boolean" ? next : !bookmarksOpen;
            setBookmarksOpen(shouldOpen);
            if (shouldOpen) setValidationListOpen(false);
          }}
          onToggleValidation={(next) => {
            const shouldOpen = typeof next === "boolean" ? next : !validationListOpen;
            setValidationListOpen(shouldOpen);
            if (shouldOpen) setBookmarksOpen(false);
          }}
          onNavigateToPage={(pageIndex) => {
            goToPageIndex(pageIndex);
            setBookmarksOpen(false);
            setValidationListOpen(false);
          }}
          onOpenValidationItem={openValidationItem}
        />
      )}

      {!isDebug && (
        <div
          className="card form-runner-survey-card"
          style={{ padding: 12, display: "grid", gap: 10 }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>{surveyTitle || "Formulier"}</div>

          {!surveyParsed.ok ? (
            <div className="muted" style={{ fontSize: 13 }}>
              survey_json niet beschikbaar: {surveyParsed.error}
            </div>
          ) : !runtimeReady || !model ? (
            <div className="muted" style={{ fontSize: 13 }}>
              Formulierruntime wordt opgebouwd...
            </div>
          ) : (
            <div
              className={`form-runner-survey-shell ${
                hasValidatedOnce ? "form-runner-survey-shell--validated" : ""
              }`}
              style={{
                opacity: canEditAnswers ? 1 : 0.82,
                color: "var(--text)",
              }}
            >
              {useEmberRuntime ? (
                <EmberRuntimeSurvey
                  key={surveyRenderKey}
                  model={model}
                  activePageIndex={currentPageIndex}
                  installationCode={code}
                  canEdit={canEditAnswers}
                  hasValidatedOnce={hasValidatedOnce}
                  validationSummary={validationSummary}
                  guidanceByQuestion={instance?.guidance_by_question || null}
                  guidanceByMatrixRow={instance?.guidance_by_matrix_row || null}
                  onOpenGuidance={setGuidanceDialog}
                />
              ) : (
                <Survey key={surveyRenderKey} model={model} />
              )}
            </div>
          )}
        </div>
      )}

      {!isDebug && (
        <>
          {canEditAnswers && !contextPanelOpen && !assistantPanelOpen && (
            <>
              <div className="form-runner-floating-actions form-runner-floating-actions--middle">
                <button
                  type="button"
                  className="icon-btn form-runner-floating-btn"
                  title="Context en bijlagen openen"
                  onClick={() => setContextPanelOpen(true)}
                  onMouseEnter={() => contextToggleIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => contextToggleIconRef.current?.stopAnimation?.()}
                >
                  <AttachFileIcon ref={contextToggleIconRef} size={20} />
                </button>
              </div>

              <div className="form-runner-floating-actions form-runner-floating-actions--bottom">
                <button
                  type="button"
                  className="icon-btn form-runner-floating-btn"
                  title="Ember assistent openen"
                  onClick={openAssistantPanelWithRecording}
                  onMouseEnter={() => assistantToggleIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => assistantToggleIconRef.current?.stopAnimation?.()}
                >
                  <MicIcon ref={assistantToggleIconRef} size={20} />
                </button>
              </div>
            </>
          )}

          {assistantPanelOpen && (
            <>
              <button
                type="button"
                aria-label="Sluit Ember assistent"
                onClick={() => setAssistantPanelOpen(false)}
                className="form-runner-side-overlay"
              />

              <div className="form-runner-side-panel">
                <button
                  type="button"
                  className="card form-runner-side-panel-head form-runner-side-panel-head--clickable"
                  title="Assistent inklappen"
                  onClick={() => setAssistantPanelOpen(false)}
                  onMouseEnter={() => assistantHeaderIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => assistantHeaderIconRef.current?.stopAnimation?.()}
                >
                  <div className="form-runner-side-panel-title-row">
                    <MicIcon ref={assistantHeaderIconRef} size={18} />
                    <div className="form-runner-side-panel-title-text">
                      <div className="form-runner-side-panel-title">Ember assistent</div>
                      <div className="muted form-runner-side-panel-subtitle">
                        Spreek formulieropdrachten in
                      </div>
                    </div>
                  </div>

                  <span className="icon-btn form-runner-side-panel-close" aria-hidden="true">
                    <ChevronUpIcon size={18} style={{ transform: "rotate(90deg)" }} />
                  </span>
                </button>

                <div className="form-runner-side-panel-body">
                  <div className="card" style={{ padding: 12 }}>
                    <FormAssistantPanel
                      code={code}
                      instanceId={instanceId}
                      surveyModel={surveyModelRef.current}
                      canEdit={canEditAnswers}
                      draftRev={getDraftRev(instance)}
                      activePageName={surveyModelRef.current?.currentPage?.name || null}
                      onApplied={handleAssistantApplied}
                      onClose={() => setAssistantPanelOpen(false)}
                      autoStartToken={assistantAutoStartToken}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {contextPanelOpen && (
            <>
              <button
                type="button"
                aria-label="Sluit context en bijlagen"
                onClick={() => setContextPanelOpen(false)}
                className="form-runner-side-overlay"
              />

              <div className="form-runner-side-panel">
                <button
                  type="button"
                  className="card form-runner-side-panel-head form-runner-side-panel-head--clickable"
                  title="Context en bijlagen inklappen"
                  onClick={() => setContextPanelOpen(false)}
                >
                  <div className="form-runner-side-panel-title-row">
                    <AttachFileIcon size={18} />
                    <div className="form-runner-side-panel-title-text">
                      <div className="form-runner-side-panel-title">Context en bijlagen</div>
                      <div className="muted form-runner-side-panel-subtitle">
                        Installatiebestanden en formulierbijlagen
                      </div>
                    </div>
                  </div>

                  <span className="icon-btn form-runner-side-panel-close" aria-hidden="true">
                    <ChevronUpIcon size={18} style={{ transform: "rotate(90deg)" }} />
                  </span>
                </button>

                <div className="form-runner-side-panel-body">
                  <FormContextPanel
                    code={code}
                    instanceId={instanceId}
                    canEdit={canEditEvidence}
                    canDeleteDocuments={canDeleteEvidence}
                    embedded={true}
                    defaultInstallationOpen={false}
                    defaultFormDocsOpen={false}
                    documentsTabHref={`/installaties/${encodeURIComponent(code)}?tab=documents`}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {isDebug && (
        <>
          <div className="card" style={{ padding: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Titel instantie (debug)
              </div>
              <input
                className="input"
                type="text"
                maxLength={200}
                value={instanceMetadata.instance_title}
                onChange={(e) =>
                  setInstanceMetadata((prev) => ({
                    ...prev,
                    instance_title: e.target.value,
                  }))
                }
                disabled={!canEditMetadata}
                placeholder="Optionele titel voor deze formulierinstantie"
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Opmerking instantie (debug)
              </div>
              <textarea
                className="input"
                style={{ width: "100%", minHeight: 100, resize: "vertical" }}
                value={instanceMetadata.instance_note}
                onChange={(e) =>
                  setInstanceMetadata((prev) => ({
                    ...prev,
                    instance_note: e.target.value,
                  }))
                }
                disabled={!canEditMetadata}
                spellCheck={false}
              />
            </div>

            <div className="muted" style={{ fontSize: 12 }}>
              Parent instance id: {currentParentInstanceId ?? "geen"}
            </div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Antwoorden (debug JSON) ; bewerken alleen in Concept
            </div>

            <textarea
              className="input"
              style={{
                width: "100%",
                minHeight: 360,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 12,
                opacity: canEditAnswers ? 1 : 0.6,
              }}
              value={debugAnswersText}
              onChange={(e) => {
                setDebugAnswersText(e.target.value);
                if (canEditAnswers) setDirty(true);
              }}
              spellCheck={false}
              disabled={!canEditAnswers}
              title={!canEditAnswers ? "Bewerken kan alleen in status: Concept." : undefined}
            />
          </div>

          <div className="card" style={{ padding: 12, display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Debug gegevens</div>

            <div className="card" style={{ padding: 12 }}>
              <ToggleRow
                title="Instance (debug)"
                meta={debugCards.instance ? null : (instance?.form_code || "ingeklapt")}
                isOpen={debugCards.instance}
                onToggle={() => toggleDebugCard("instance")}
                iconRef={(el) => {
                  debugToggleIconRef.current.instance = el;
                }}
                onIconEnter={() => animateDebugToggle("instance")}
                onIconLeave={() => stopDebugToggle("instance")}
              />
              {debugCards.instance && (
                <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(instance, null, 2)}
                </pre>
              )}
            </div>

            <div className="card" style={{ padding: 12 }}>
              <ToggleRow
                title="Prefill payload (debug)"
                meta={
                  debugCards.prefill
                    ? null
                    : prefillPayload
                      ? "geladen"
                      : "null"
                }
                isOpen={debugCards.prefill}
                onToggle={() => toggleDebugCard("prefill")}
                iconRef={(el) => {
                  debugToggleIconRef.current.prefill = el;
                }}
                onIconEnter={() => animateDebugToggle("prefill")}
                onIconLeave={() => stopDebugToggle("prefill")}
              />
              {debugCards.prefill && (
                <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(prefillPayload, null, 2)}
                </pre>
              )}
            </div>

            <div className="card" style={{ padding: 12 }}>
              <ToggleRow
                title="Answers preview (debug)"
                meta={
                  debugCards.answersPreview
                    ? null
                    : `${Object.keys(answersPreview || {}).length} sleutel(s)`
                }
                isOpen={debugCards.answersPreview}
                onToggle={() => toggleDebugCard("answersPreview")}
                iconRef={(el) => {
                  debugToggleIconRef.current.answersPreview = el;
                }}
                onIconEnter={() => animateDebugToggle("answersPreview")}
                onIconLeave={() => stopDebugToggle("answersPreview")}
              />
              {debugCards.answersPreview && (
                <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(answersPreview, null, 2)}
                </pre>
              )}
            </div>

            <div className="card" style={{ padding: 12 }}>
              <ToggleRow
                title="lastAppliedMap (debug)"
                meta={
                  debugCards.lastApplied
                    ? null
                    : `${Object.keys(lastAppliedMap || {}).length} sleutel(s)`
                }
                isOpen={debugCards.lastApplied}
                onToggle={() => toggleDebugCard("lastApplied")}
                iconRef={(el) => {
                  debugToggleIconRef.current.lastApplied = el;
                }}
                onIconEnter={() => animateDebugToggle("lastApplied")}
                onIconLeave={() => stopDebugToggle("lastApplied")}
              />
              {debugCards.lastApplied && (
                <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(lastAppliedMap, null, 2)}
                </pre>
              )}
            </div>

            <div className="card" style={{ padding: 12 }}>
              <ToggleRow
                title="Submit summary (debug)"
                meta={
                  debugCards.submitSummary
                    ? null
                    : submitSummary
                      ? "gevuld"
                      : "null"
                }
                isOpen={debugCards.submitSummary}
                onToggle={() => toggleDebugCard("submitSummary")}
                iconRef={(el) => {
                  debugToggleIconRef.current.submitSummary = el;
                }}
                onIconEnter={() => animateDebugToggle("submitSummary")}
                onIconLeave={() => stopDebugToggle("submitSummary")}
              />
              {debugCards.submitSummary && (
                <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(submitSummary, null, 2)}
                </pre>
              )}
            </div>

            <div className="card" style={{ padding: 12 }}>
              <ToggleRow
                title="Validation summary (debug)"
                meta={
                  debugCards.validation
                    ? null
                    : `${validationSummary.length} issue(s)`
                }
                isOpen={debugCards.validation}
                onToggle={() => toggleDebugCard("validation")}
                iconRef={(el) => {
                  debugToggleIconRef.current.validation = el;
                }}
                onIconEnter={() => animateDebugToggle("validation")}
                onIconLeave={() => stopDebugToggle("validation")}
              />
              {debugCards.validation && (
                <pre style={{ margin: "10px 0 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(validationSummary, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </>
      )}

      {submitDialog ? (
        <>
          <button
            type="button"
            aria-label="Sluit submitvenster"
            className="form-guidance-modal-backdrop"
            onClick={() => {
              if (!submitDialog.submitting) setSubmitDialog(null);
            }}
          />

          <div
            className="card form-guidance-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Formulier indienen"
            style={{ width: "min(980px, calc(100vw - 24px))" }}
          >
            <div className="form-guidance-modal__head">
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                <FileCheck2Icon size={18} />
                <div style={{ minWidth: 0 }}>
                  <div className="form-guidance-modal__title">Formulier indienen</div>
                  <div className="muted form-guidance-modal__subtitle">
                    Controleer opvolgregistraties en koppel formulierbijlagen waar nodig.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={submitDialog.submitting}
                  onClick={() => setSubmitDialog(null)}
                >
                  Annuleren
                </button>

                <button
                  type="button"
                  className="btn"
                  disabled={submitDialog.submitting}
                  onClick={confirmSubmitDialog}
                >
                  {submitDialog.submitting ? "Indienen..." : "Definitief indienen"}
                </button>
              </div>
            </div>

            <div className="form-guidance-modal__body" style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={themedChip({ fontSize: 12 })}>
                  Workflowacties: {submitDialog.previewSummary.workflowCount}
                </span>
                <span style={themedChip({ fontSize: 12 })}>
                  Rapportopmerkingen: {submitDialog.previewSummary.reportOnlyCount}
                </span>
                <span style={themedChip({ fontSize: 12 })}>
                  Formulierbijlagen: {submitDialog.formAttachmentCount ?? 0}
                </span>
              </div>

              {submitDialog.followUpItems.length > 0 ? (
                <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>Opvolgregistraties bij indienen</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {submitDialog.followUpItems.map((item) => (
                      <div
                        key={item.id}
                        style={themedSoftBox({
                          padding: "10px 12px",
                          display: "grid",
                          gap: 4,
                        })}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong>{item.title || "Actiepunt"}</strong>
                          {item.kind ? (
                            <span className="muted" style={themedChip({ fontSize: 12 })}>
                              {formatFollowUpKindLabel(item.kind)}
                            </span>
                          ) : null}
                        </div>

                        {item.description ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {item.description}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: 12, display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>Geen opvolgregistraties gevonden</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Dit formulier levert op dit moment geen opvolgacties of rapportopmerkingen op.
                  </div>
                </div>
              )}

              <div className="card" style={{ padding: 12, display: "grid", gap: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Koppel bestanden aan de opvolgacties</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Per formulierbijlage kun je aangeven of deze bij een opvolgregistratie hoort. Geen selectie betekent; niet koppelen.
                </div>

                {submitDialog.documents.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Er zijn nog geen formulierbijlagen toegevoegd.
                  </div>
                ) : submitDialog.followUpItems.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Er zijn wel formulierbijlagen aanwezig, maar er zijn geen opvolgregistraties om aan te koppelen.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {submitDialog.documents.map((doc) => (
                      <div key={doc.form_instance_document_id} className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ fontWeight: 800 }}>
                            {doc.title || doc.file_name || "Bijlage"}
                          </div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {[doc.file_name || null, formatBytes(doc.file_size_bytes) || null].filter(Boolean).join(" ; ")}
                          </div>
                          {doc.labels?.length ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {doc.labels.map((item, idx) => (
                                <span key={`${item.label_key || idx}`} style={themedChip({ fontSize: 12 })}>
                                  {item.display_name || item.label || item.label_key}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {submitDialog.followUpItems.map((item) => {
                            const active = doc.selectedFingerprints.includes(item.fingerprint);

                            return (
                              <button
                                key={`${doc.form_instance_document_id}-${item.fingerprint}`}
                                type="button"
                                className="btn btn-secondary"
                                onClick={() =>
                                  toggleSubmitDialogDocumentFollowUp(
                                    doc.form_instance_document_id,
                                    item.fingerprint
                                  )
                                }
                                style={{
                                  fontSize: 12,
                                  textAlign: "left",
                                  ...(active
                                    ? themedChip({
                                        fontSize: 12,
                                        fontWeight: 800,
                                        border: "1px solid var(--accent)",
                                      })
                                    : {}),
                                }}
                              >
                                {buildSubmitDialogFollowUpLabel(item)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {guidanceDialog ? (
        <>
          <button
            type="button"
            aria-label="Sluit toelichting"
            className="form-guidance-modal-backdrop"
            onClick={() => setGuidanceDialog(null)}
          />

          <div className="card form-guidance-modal" role="dialog" aria-modal="true" aria-label="Toelichting bij vraag">
            <div className="form-guidance-modal__head">
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                <CircleHelpIcon size={18} />
                <div style={{ minWidth: 0 }}>
                  <div className="form-guidance-modal__title">
                    {guidanceDialog.questionTitle || guidanceDialog.questionName || "Toelichting"}
                  </div>
                  <div className="muted form-guidance-modal__subtitle">
                    vraag: {guidanceDialog.questionName || "onbekend"}
                    {guidanceDialog.matrixRowLabel ? ` ; ${guidanceDialog.matrixRowLabel}` : ""}
                  </div>
                </div>
              </div>

              <button type="button" className="btn btn-secondary" onClick={() => setGuidanceDialog(null)}>
                Sluiten
              </button>
            </div>

            <div className="form-guidance-modal__body">
              {(Array.isArray(guidanceDialog.items) ? guidanceDialog.items : []).map((item) => {
                const items = Array.isArray(guidanceDialog.items) ? guidanceDialog.items : [];
                const itemTitle = String(item.title || "").trim();
                const dialogTitle = String(
                  guidanceDialog.questionTitle || guidanceDialog.questionName || ""
                ).trim();
                const showItemTitle = items.length > 1 && itemTitle && itemTitle !== dialogTitle;

                return (
                  <div key={item.guidance_id || item.title} className="card form-guidance-modal__item">
                    {showItemTitle ? (
                      <div className="form-guidance-modal__item-title">{itemTitle}</div>
                    ) : null}

                    {item.body_markdown ? (
                      <div className="form-guidance-modal__item-body">{item.body_markdown}</div>
                    ) : null}

                    {item.image_url ? (
                      <div className="form-guidance-modal__media">
                        <img
                          src={item.image_url}
                          alt={item.image_caption || item.title || "Toelichting"}
                          className="form-guidance-modal__image"
                        />
                        {item.image_caption ? (
                          <div className="muted form-guidance-modal__caption">{item.image_caption}</div>
                        ) : null}
                      </div>
                    ) : null}

                    {item.video_url ? (
                      isDirectVideoUrl(item.video_url) ? (
                        <video
                          className="form-guidance-modal__video"
                          controls
                          preload="metadata"
                          src={item.video_url}
                        />
                      ) : (
                        <div>
                          <a
                            className="btn btn-secondary"
                            href={item.video_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Video openen
                          </a>
                        </div>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
