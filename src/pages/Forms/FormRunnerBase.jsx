// src/pages/Forms/FormRunnerBase.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Survey } from "survey-react-ui";
import "survey-core/survey-core.min.css";
import "../../styles/surveyjs-overrides.css";

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
import { ChevronsDownUpIcon } from "@/components/ui/chevrons-down-up";
import { ChevronsUpDownIcon } from "@/components/ui/chevrons-up-down";

import {
  getFormInstance,
  putFormInstanceMetadata,
  putFormAnswers,
  submitFormInstance,
  previewSubmitFormInstance,
  withdrawFormInstance,
  reopenFormInstance,
} from "../../api/emberApi.js";

import FormPageNavigator from "./shared/FormPageNavigator.jsx";

import {
  normalizeInstanceResponse,
  safeJsonParse,
  safeSurveyParse,
  formatNlDateTime,
  statusLabel,
  translateApiError,
  getDraftRev,
  getAnswersObject,
  buildSubmitConfirmText,
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
  const [answersPreview, setAnswersPreview] = useState({});
  const [lastAppliedMap, setLastAppliedMap] = useState({});

  const [submitSummary, setSubmitSummary] = useState(null);
  const [showSubmitCelebration, setShowSubmitCelebration] = useState(false);
  const [showValidateCelebration, setShowValidateCelebration] = useState(false);
  const [prefillRefreshOk, setPrefillRefreshOk] = useState(false);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [hasValidatedOnce, setHasValidatedOnce] = useState(false);
  const [validationListOpen, setValidationListOpen] = useState(true);
  const [instanceMetaOpen, setInstanceMetaOpen] = useState(false);

  const [debugCards, setDebugCards] = useState(defaultDebugCards);

  const backIconRef = useRef(null);

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
  const validationCollapseIconRef = useRef(null);

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
  const validationCollapseAnimTimerRef = useRef(null);

  const lastLoadedKeyRef = useRef("");

  const surveyModelRef = useRef(null);
  const suppressDirtyRef = useRef(false);
  const canEditRef = useRef(false);

  const runtimeDetachRef = useRef(null);
  const energyAutoStateRef = useRef({});
  const availabilityAutoStateRef = useRef({});
  const validationActivatedRef = useRef(false);

  const status = useMemo(() => String(instance?.status || ""), [instance]);
  const statusLbl = useMemo(() => statusLabel(status), [status]);

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

  const readonlyBanner = useMemo(() => {
    return buildReadonlyBanner(status, statusLbl);
  }, [status, statusLbl]);

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

  const actions = useMemo(() => allowedActions(status), [status]);

  const showValidate = actions.validate;
  const showSave = actions.save;
  const showSubmit = actions.submit;
  const showWithdraw = actions.withdraw;
  const showReopen = actions.reopen;

  const canEditAnswers = actions.save;
  const canEditMetadata = actions.save;

  const hasMetadataChanges = useMemo(() => {
    return !areInstanceMetadataEqual(instanceMetadata, savedInstanceMetadata);
  }, [instanceMetadata, savedInstanceMetadata]);

  const hasUnsavedChanges = dirty || hasMetadataChanges;

  const hasValidationItems = !isDebug && validationSummary.length > 0;
  const validationCollapseBtnTitle = validationListOpen
    ? "Controlelijst inklappen"
    : "Controlelijst uitklappen";
  const ValidationCollapseIcon = validationListOpen
    ? ChevronsDownUpIcon
    : ChevronsUpDownIcon;

  const currentParentInstanceId = useMemo(() => {
    return normalizeMetadataParentId(instanceMetadata?.parent_instance_id);
  }, [instanceMetadata]);

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
      const pages = Array.isArray(model.visiblePages) ? model.visiblePages : [];
      const idx = Math.max(0, pages.indexOf(model.currentPage));
      setCurrentPageIndex(idx >= 0 ? idx : 0);
    };

    syncCurrentPage();

    model.onCurrentPageChanged.add(syncCurrentPage);

    return () => {
      model.onCurrentPageChanged.remove(syncCurrentPage);
    };
  }, [runtimeReady, isDebug, instanceId]);

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
    if (validationSummary.length > 0) {
      setValidationListOpen(true);
    }
  }, [validationSummary]);

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
          syncAllMatrixQuestionVisualErrors(surveyModelRef.current);
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
      syncAllMatrixQuestionVisualErrors(model);

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

  function openValidationItem(item) {
    if (isDebug) return;

    const model = surveyModelRef.current;
    if (!model || !item) return;

    const targetPage = Array.isArray(model.visiblePages) ? model.visiblePages[item.pageIndex] : null;
    if (targetPage) {
      model.currentPage = targetPage;
      setCurrentPageIndex(item.pageIndex);
      setBookmarksOpen(false);
    }

    requestAnimationFrame(() => {
      scrollToQuestionByName(item.questionName);
    });
  }

  function goToPageIndex(pageIndex) {
    if (isDebug) return;

    const model = surveyModelRef.current;
    const pages = Array.isArray(model?.visiblePages) ? model.visiblePages : [];
    const targetPage = pages[pageIndex] || null;

    if (!model || !targetPage) return;

    model.currentPage = targetPage;
    setCurrentPageIndex(pageIndex);
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

  async function persistPendingChanges(curValue, { reloadAfter = true, animateSave = true } = {}) {
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

    if (dirty) {
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

  async function reload({ forceEditor } = {}) {
    setLoading(true);
    setError(null);
    setValidationSummary([]);
    setRuntimeReady(false);
    setCurrentPageIndex(0);
    setHasValidatedOnce(false);

    try {
      const res = await getFormInstance(code, instanceId);
      const inst = normalizeInstanceResponse(res);
      setInstance(inst || null);

      const nextDraftRev = getDraftRev(inst);
      const answersObj = getAnswersObject(inst);

      const key = `${String(instanceId)}::${String(nextDraftRev)}`;
      const alreadyLoaded = lastLoadedKeyRef.current === key;

      const parsedSurvey = safeSurveyParse(inst?.survey_json);

      const shouldOverwriteEditor = forceEditor || (!dirty && !alreadyLoaded);
      const shouldOverwriteMetadata = forceEditor || (!hasMetadataChanges && !alreadyLoaded);

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

        setLoading(false);
        return;
      }

      if (!shouldOverwriteEditor && surveyModelRef.current) {
        setRuntimeReady(true);
        setLoading(false);
        return;
      }

      if (runtimeDetachRef.current) {
        runtimeDetachRef.current();
        runtimeDetachRef.current = null;
      }

      energyAutoStateRef.current = {};
      availabilityAutoStateRef.current = {};
      validationActivatedRef.current = false;

      const runtime = await buildRuntimeModelFromInstance({
        instance: inst,
        code,
        onDirtyChange: setDirty,
        canEditRef,
        suppressDirtyRef,
        lastAppliedMap,
      });

      if (!runtime.ok) {
        surveyModelRef.current = null;
        setPrefillPayload(null);
        setAnswersPreview({});
        setLastAppliedMap({});
        setRuntimeReady(false);
        setError(runtime.error || "Runtime model kon niet worden opgebouwd.");
        setLoading(false);
        return;
      }

      surveyModelRef.current = runtime.model;
      setPrefillPayload(runtime.prefillPayload || null);
      setLastAppliedMap(runtime.lastAppliedMap || {});
      setAnswersPreview({ ...(runtime.model.data || {}) });

      runtimeDetachRef.current = attachRuntimeBehaviors({
        model: runtime.model,
        prefillPayload: runtime.prefillPayload,
        energyAutoStateRef,
        availabilityAutoStateRef,
        validationActivatedRef,
        suppressDirtyRef,
        onAnswersSnapshotChange: setAnswersPreview,
        onValidationSummaryChange: setValidationSummary,
      });

      if (isDebug && shouldOverwriteEditor) {
        setDebugAnswersText(JSON.stringify(answersObj || {}, null, 2));
      }

      setDirty(false);
      setRuntimeReady(true);
      lastLoadedKeyRef.current = key;
    } catch (e) {
      setError(translateApiError(e, status));
      setInstance(null);
      surveyModelRef.current = null;
      setPrefillPayload(null);
      setAnswersPreview({});
      setLastAppliedMap({});
      setRuntimeReady(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!code || !instanceId) return;
      await reload({ forceEditor: true });
      if (cancelled) return;
    }

    boot();

    return () => {
      cancelled = true;
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
      if (validationCollapseAnimTimerRef.current) clearTimeout(validationCollapseAnimTimerRef.current);
    };
  }, []);

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

        validationCollapseIconRef.current?.startAnimation?.();

        if (validationCollapseAnimTimerRef.current) {
          clearTimeout(validationCollapseAnimTimerRef.current);
        }

        validationCollapseAnimTimerRef.current = window.setTimeout(() => {
          validationCollapseIconRef.current?.stopAnimation?.();
        }, 650);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSave, busy, hasUnsavedChanges, hasValidationItems]);

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
      applyValidationResult(result, { showSuccess: true });
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
    setValidationSummary([]);
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
      if (!valid) return;

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

      const confirmed = window.confirm(buildSubmitConfirmText(preview));
      if (!confirmed) return;

      if (hasUnsavedChanges) {
        await persistPendingChanges(cur.value, { reloadAfter: false, animateSave: false });
      }

      const submitRes = await submitFormInstance(code, instanceId);

      const previewSummary = normalizePreviewFollowUps(preview);
      const syncCounts = normalizeSubmitSyncCounts(submitRes);

      setSubmitSummary({
        ...previewSummary,
        syncCounts,
        rawPreview: preview,
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

  if (loading) return <div className="muted">Laden…</div>;

  return (
    <div style={{ display: "grid", gap: 12, position: "relative" }}>
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
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.22)",
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
        className="card"
        style={{
          padding: 12,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0, flex: 1 }}>
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
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.06)",
                      fontWeight: 700,
                    }}
                    title="Deze instantie is gekoppeld aan een bovenliggende formulierinstantie."
                  >
                    vervolg op #{currentParentInstanceId}
                  </span>
                ) : null}

                {lastSavedAt ? <span>laatst opgeslagen: {formatNlDateTime(lastSavedAt)}</span> : null}
                {hasUnsavedChanges ? <span>wijzigingen niet opgeslagen</span> : null}

                {!canEditAnswers && !isDebug ? (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.06)",
                      fontWeight: 700,
                    }}
                  >
                    Klaar
                  </span>
                ) : null}

                {prefillRefreshOk ? (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.06)",
                      fontWeight: 700,
                    }}
                  >
                    Voorinvulling vernieuwd
                  </span>
                ) : null}
              </div>
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {!isDebug && canEditAnswers && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !surveyModelRef.current}
                onClick={handleRefreshPrefill}
                onMouseEnter={() => prefillRefreshIconRef.current?.startAnimation?.()}
                onMouseLeave={() => {
                  if (!prefillRefreshOk) prefillRefreshIconRef.current?.stopAnimation?.();
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                title="Haal de laatste installatiedata op en vul deze in op het formulier."
              >
                <RotateCCWIcon ref={prefillRefreshIconRef} size={18} />
                Voorinvulling vernieuwen
              </button>
            )}

            {!isDebug && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  navigate(
                    `/installaties/${encodeURIComponent(code)}/formulieren/${encodeURIComponent(
                      instanceId
                    )}/debug`
                  )
                }
              >
                Debug JSON
              </button>
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

            {showReopen && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={reopenToConcept}
                onMouseEnter={() => reopenIconRef.current?.startAnimation?.()}
                onMouseLeave={() => reopenIconRef.current?.stopAnimation?.()}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                title="Terug naar concept"
              >
                <HistoryIcon ref={reopenIconRef} size={18} />
                Concept
              </button>
            )}

            {showWithdraw && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={withdraw}
                onMouseEnter={() => withdrawIconRef.current?.startAnimation?.()}
                onMouseLeave={() => withdrawIconRef.current?.stopAnimation?.()}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                title="Intrekken"
              >
                <FolderXIcon ref={withdrawIconRef} size={18} />
                Intrekken
              </button>
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
              borderTop: "1px solid rgba(255,255,255,0.08)",
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
                      style={{
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.06)",
                      }}
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

      {error && <div style={{ color: "salmon" }}>{error}</div>}

      {!isDebug && submitSummary && status === "INGEDIEND" && (
        <div
          className="card"
          style={{
            padding: 14,
            display: "grid",
            gap: 10,
            border: "1px solid rgba(255,255,255,0.12)",
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
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                fontSize: 13,
              }}
            >
              Workflowitems: <strong>{submitSummary.workflowCount}</strong>
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                fontSize: 13,
              }}
            >
              Rapportopmerkingen: <strong>{submitSummary.reportOnlyCount}</strong>
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                fontSize: 13,
              }}
            >
              Totaal preview: <strong>{submitSummary.totalCount}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                fontSize: 13,
              }}
            >
              Ingevoegd: <strong>{submitSummary.syncCounts.inserted}</strong>
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                fontSize: 13,
              }}
            >
              Bijgewerkt: <strong>{submitSummary.syncCounts.updated}</strong>
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                fontSize: 13,
              }}
            >
              Ongewijzigd: <strong>{submitSummary.syncCounts.unchanged}</strong>
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                fontSize: 13,
              }}
            >
              Vervallen: <strong>{submitSummary.syncCounts.vervallen}</strong>
            </div>
          </div>

          {submitSummary.items.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Verwerkte opvolgitems</div>

              <div style={{ display: "grid", gap: 6 }}>
                {submitSummary.items.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.04)",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{item.title || "Zonder titel"}</strong>
                      {item.kind ? (
                        <span
                          className="muted"
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.05)",
                          }}
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
                  </div>
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
          className="card"
          style={{
            padding: 14,
            display: "grid",
            gap: 6,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
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
          onToggleBookmarks={(next) => {
            if (typeof next === "boolean") {
              setBookmarksOpen(next);
              return;
            }
            setBookmarksOpen((prev) => !prev);
          }}
          onNavigateToPage={(pageIndex) => {
            goToPageIndex(pageIndex);
            setBookmarksOpen(false);
          }}
        />
      )}

      {!isDebug && validationSummary.length > 0 && (
        <div
          className="card"
          style={{
            padding: 12,
            display: "grid",
            gap: 8,
            border: "1px solid rgba(250, 128, 114, 0.35)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 800 }}>
                Controleer eerst de volgende velden
              </div>

              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Klik op een regel om naar het betreffende onderdeel te gaan.
              </div>
            </div>

            <button
              type="button"
              className="icon-btn"
              title={validationCollapseBtnTitle}
              onClick={() => setValidationListOpen((prev) => !prev)}
              onMouseEnter={() => validationCollapseIconRef.current?.startAnimation?.()}
              onMouseLeave={() => validationCollapseIconRef.current?.stopAnimation?.()}
            >
              <ValidationCollapseIcon
                ref={validationCollapseIconRef}
                size={18}
                className="nav-anim-icon"
              />
            </button>
          </div>

          {validationListOpen && (
            <div style={{ display: "grid", gap: 6 }}>
              {validationSummary.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openValidationItem(item)}
                  style={{
                    textAlign: "left",
                    justifyContent: "flex-start",
                    whiteSpace: "normal",
                    lineHeight: 1.35,
                  }}
                  title={`${item.pageTitle} · ${item.questionTitle}`}
                >
                  <span>
                    <strong>{item.pageTitle}</strong>
                    {" · "}
                    {item.questionTitle}
                    {" ; "}
                    {item.message}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!isDebug && (
        <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
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
            <div style={{ opacity: canEditAnswers ? 1 : 0.82 }}>
              <Survey model={model} />
            </div>
          )}
        </div>
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
    </div>
  );
}