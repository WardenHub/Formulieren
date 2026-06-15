import { useEffect, useMemo, useRef, useState } from "react";
import { Survey } from "survey-react-ui";
import { Model } from "survey-core";
import "survey-core/survey-core.min.css";
import "../../styles/surveyjs-overrides.css";
import Tabs from "../../components/Tabs.jsx";
import SaveButton from "../../components/SaveButton.jsx";
import {
  activateAdminGuidanceMedia,
  archiveAdminGuidanceMedia,
  createAdminGuidanceItem,
  getAdminGuidanceCatalog,
  getMe,
  saveAdminGuidanceLinks,
  updateAdminGuidanceMedia,
  updateAdminGuidanceItem,
  uploadAdminGuidanceMedia,
} from "../../api/emberApi.js";
import { PlusIcon } from "@/components/ui/plus";
import { UploadIcon } from "@/components/ui/upload";
import { CameraIcon } from "@/components/ui/camera";
import { HistoryIcon } from "@/components/ui/history";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";
import { SearchIcon } from "@/components/ui/search";
import { ArchiveIcon } from "@/components/ui/archive";
import { CheckIcon } from "@/components/ui/check";
import { FileTextIcon } from "@/components/ui/file-text";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { buildPreparedSurveyJson } from "../Forms/shared/runtimeBuilder.jsx";
import { attachRuntimeBehaviors } from "../Forms/shared/runtimeBehaviors.jsx";

function formatDateTime(value) {
  if (!value) return "onbekend";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function fileSizeLabel(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeItemDraft(item, fallbackTitle = "") {
  return {
    title: item?.title ?? fallbackTitle,
    body_markdown: item?.body_markdown ?? "",
    is_active: item?.is_active !== false,
  };
}

function questionTypeLabel(type) {
  const key = String(type || "").trim().toLowerCase();
  if (key === "matrix_row") return "Matrixregel";
  if (key === "matrixdynamic") return "Matrixvraag";
  if (key === "matrix") return "Matrixvraag";
  if (key === "matrixdropdown") return "Matrixvraag";
  if (key === "multipletext") return "Meerveldsvraag";
  if (key === "paneldynamic") return "Herhalende sectie";
  if (key === "radiogroup") return "Keuzevraag";
  if (key === "checkbox") return "Meerkeuze";
  if (key === "dropdown") return "Keuzelijst";
  if (key === "boolean") return "Ja of nee";
  if (key === "comment") return "Tekstveld";
  if (key === "text") return "Tekstveld";
  return "Vraag";
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeMatrixRowKey(value) {
  return String(value || "").trim();
}

function isMatrixQuestionType(type) {
  const key = String(type || "").trim().toLowerCase();
  return key === "matrixdynamic" || key === "matrix" || key === "matrixdropdown";
}

function buildGuidanceTargetKey(questionName, matrixRowKey = "") {
  const cleanQuestionName = String(questionName || "").trim();
  const cleanMatrixRowKey = normalizeMatrixRowKey(matrixRowKey);
  if (!cleanQuestionName) return "";
  return cleanMatrixRowKey ? `${cleanQuestionName}::${cleanMatrixRowKey}` : cleanQuestionName;
}

function buildPreviewSurveyJson(questionRow) {
  const previewElement = cloneJson(questionRow?.preview_element_json);
  if (!previewElement || typeof previewElement !== "object") return null;

  if (questionRow?.target_kind === "matrix_row") {
    const previewRow = cloneJson(questionRow?.preview_row_json);
    if (previewRow && typeof previewRow === "object") {
      previewElement.defaultValue = [previewRow];
      previewElement.rowCount = 1;
      previewElement.minRowCount = 1;
      previewElement.allowAddRows = false;
      previewElement.allowRemoveRows = false;
      previewElement.allowRowsDragAndDrop = false;
    }
  }

  const pageTitle = String(questionRow?.context_title || questionRow?.page_title || "").trim();
  const surveyTitle = String(questionRow?.title || questionRow?.question_name || "Vraagvoorbeeld").trim();

  return {
    title: surveyTitle,
    showQuestionNumbers: "off",
    showCompletedPage: false,
    showNavigationButtons: false,
    pages: [
      {
        name: "preview_page",
        title: pageTitle || surveyTitle,
        elements: [previewElement],
      },
    ],
  };
}

function buildPreviewData(questionRow) {
  if (questionRow?.target_kind !== "matrix_row") return {};

  const questionName = String(questionRow?.question_name || "").trim();
  const previewRow = cloneJson(questionRow?.preview_row_json);
  if (!questionName || !previewRow || typeof previewRow !== "object") return {};

  return {
    [questionName]: [previewRow],
  };
}

function getGuidanceItemsForTarget(items, formId, questionName, matrixRowKey = "") {
  const cleanMatrixRowKey = normalizeMatrixRowKey(matrixRowKey);
  const filtered = (Array.isArray(items) ? items : []).filter((item) =>
    Array.isArray(item?.links)
      ? item.links.some(
          (link) =>
            link?.form_id === formId &&
            String(link?.question_name || "").trim() === String(questionName || "").trim() &&
            normalizeMatrixRowKey(link?.matrix_row_key) === cleanMatrixRowKey
        )
      : false
  );

  return filtered.sort((a, b) => {
    const aSort = Number(a?.sort_order ?? 0);
    const bSort = Number(b?.sort_order ?? 0);
    if (aSort !== bSort) return aSort - bSort;
    return String(a?.title || "").localeCompare(String(b?.title || ""), "nl");
  });
}

function buildQuestionTargets(questions, items, formId) {
  return (Array.isArray(questions) ? questions : []).flatMap((question, index) => {
    const questionName = String(question?.question_name || "").trim();
    if (!questionName) return [];

    const questionTarget = {
      ...question,
      index,
      target_kind: "question",
      target_key: buildGuidanceTargetKey(questionName),
      matrix_row_key: "",
      matrix_row_label: "",
      linkedItems: getGuidanceItemsForTarget(items, formId, questionName, ""),
      preview_row_json: null,
    };

    questionTarget.guidanceItem = questionTarget.linkedItems[0] || null;

    if (!isMatrixQuestionType(question?.question_type)) {
      return [questionTarget];
    }

    const matrixRows = Array.isArray(question?.matrix_rows) ? question.matrix_rows : [];
    const matrixTargets = matrixRows.map((row, rowIndex) => {
      const rowKey = normalizeMatrixRowKey(row?.matrix_row_key);
      const rowLabel = String(row?.matrix_row_label || row?.row_title || rowKey || `Regel ${rowIndex + 1}`).trim();
      const rowTitle = rowLabel || `${question.title || questionName} ; regel ${rowIndex + 1}`;
      const target = {
        ...question,
        index,
        target_kind: "matrix_row",
        target_key: buildGuidanceTargetKey(questionName, rowKey),
        matrix_row_key: rowKey,
        matrix_row_label: rowLabel,
        title: rowTitle,
        subtitle: question.title || questionName,
        question_title: question.title || questionName,
        question_type: "matrix_row",
        linkedItems: getGuidanceItemsForTarget(items, formId, questionName, rowKey),
        preview_row_json: cloneJson(row?.preview_row_json),
        row_index: row?.row_index ?? rowIndex,
      };

      target.guidanceItem = target.linkedItems[0] || null;
      return target;
    });

    return [questionTarget, ...matrixTargets];
  });
}

function AnimatedActionButton({
  type = "button",
  className = "btn btn-secondary",
  Icon,
  children,
  onClick,
  disabled,
}) {
  const iconRef = useRef(null);

  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
    >
      <Icon ref={iconRef} size={16} className="nav-anim-icon" />
      {children}
    </button>
  );
}

function GuidanceQuestionRow({ row, active, onClick }) {
  const hasGuidance = Boolean(row?.guidanceItem);
  const hasVideo = Array.isArray(row?.guidanceItem?.media_assets)
    ? row.guidanceItem.media_assets.some((media) => media.media_kind === "video" && media.is_active)
    : false;
  const hasImage = Array.isArray(row?.guidanceItem?.media_assets)
    ? row.guidanceItem.media_assets.some((media) => media.media_kind === "image" && media.is_active)
    : false;

  return (
    <button
      type="button"
      className={`admin-compact-row guidance-question-row${active ? " ember-selection-active" : ""}`}
      onClick={onClick}
    >
      <div className="admin-compact-row-main">
        <div className="admin-compact-row-title-wrap">
          <div className="admin-compact-row-title">{row.title}</div>
          <div className="admin-compact-row-sub">
            {row.subtitle || row.question_name}
            {row.matrix_row_label && !row.subtitle ? ` ; ${row.matrix_row_label}` : ""}
          </div>
        </div>

        <div className="ember-label-row admin-inline-labels">
          <span className={`ember-label ember-label--${hasGuidance ? "success" : "muted"}`}>
            {hasGuidance ? "Uitleg ingesteld" : "Nog leeg"}
          </span>

          {hasGuidance ? (
            <span className={`ember-label ember-label--${row.guidanceItem?.is_active === false ? "warning" : "success"}`}>
              {row.guidanceItem?.is_active === false ? "Inactief" : "Actief"}
            </span>
          ) : null}

          {hasGuidance ? (
            <span className="ember-label ember-label--muted">
              {hasVideo ? "Video" : hasImage ? "Afbeelding" : "Geen media"}
            </span>
          ) : null}

          <span className="ember-label ember-label--muted">
            {questionTypeLabel(row?.question_type)}
          </span>
        </div>
      </div>
    </button>
  );
}

function MediaPanel({
  kind,
  mediaItems,
  historyOpen,
  setHistoryOpen,
  busyKey,
  onUploadClick,
  onCaptureClick,
  onActivate,
  onArchive,
  onSaveCaption,
  pendingCaption,
  setPendingCaption,
  captionDirty,
  captionSaved,
}) {
  const activeItem = mediaItems.find((item) => item.is_active) || null;
  const archiveItems = mediaItems.filter((item) => !item.is_active);
  const isVideo = kind === "video";

  return (
    <div className="admin-subcard guidance-media-card">
      <div className="admin-toolbar">
        <div className="admin-toolbar-title">
          <div className="admin-subcard-title">{isVideo ? "Video" : "Afbeelding"}</div>
          <div className="admin-panel-subtitle">
            {isVideo ? "Bestandstypes; mp4, webm, mov." : "Bestandstypes; png, jpg, jpeg, webp."}
          </div>
        </div>

        <div className="admin-toolbar-actions">
          <AnimatedActionButton Icon={UploadIcon} onClick={onUploadClick}>
            {isVideo ? "Video kiezen" : "Afbeelding kiezen"}
          </AnimatedActionButton>

          {isVideo ? (
            <AnimatedActionButton Icon={CameraIcon} onClick={onCaptureClick}>
              Video opnemen
            </AnimatedActionButton>
          ) : null}
        </div>
      </div>

      <label className="admin-field guidance-wide-field">
        <span>Uitleg bij deze media</span>
        <textarea
          rows={4}
          value={pendingCaption}
          onChange={(e) => setPendingCaption(e.target.value)}
          placeholder={
            isVideo
              ? "Schrijf kort wat de invuller in deze video moet zien of begrijpen."
              : "Schrijf kort wat de invuller op deze afbeelding ziet of waar deze op moet letten."
          }
        />
        <small className="admin-panel-subtitle">
          Deze tekst wordt onder de media in de uitlegpopup getoond.
        </small>

        {activeItem ? (
          <div className="guidance-media-caption-actions">
            <AnimatedActionButton
              Icon={CheckIcon}
              onClick={() => onSaveCaption(activeItem.guidance_media_id)}
              disabled={!captionDirty || busyKey === `${kind}:caption:${activeItem.guidance_media_id}`}
            >
              Uitleg opslaan
            </AnimatedActionButton>
            {captionSaved ? (
              <span className="ember-label ember-label--success">Opgeslagen</span>
            ) : null}
          </div>
        ) : null}
      </label>

      {activeItem ? (
        <div className="guidance-media-active-card">
          <div className="ember-label-row admin-inline-labels">
            <span className="ember-label ember-label--success">Actief</span>
            <span className="ember-label ember-label--muted">
              {activeItem.file_name || (isVideo ? "Video" : "Afbeelding")}
            </span>
            {activeItem.file_size_bytes ? (
              <span className="ember-label ember-label--muted">
                {fileSizeLabel(activeItem.file_size_bytes)}
              </span>
            ) : null}
            <span className="ember-label ember-label--muted">
              {formatDateTime(activeItem.created_at)}
            </span>
          </div>

          {isVideo ? (
            <video
              className="guidance-media-preview guidance-media-preview--video"
              controls
              preload="metadata"
              src={activeItem.preview_url}
            />
          ) : (
            <img
              src={activeItem.preview_url}
              alt={activeItem.caption || "Actieve afbeelding"}
              className="guidance-media-preview guidance-media-preview--image"
            />
          )}

          {activeItem.caption ? (
            <div className="guidance-media-explanation">
              <div className="admin-subcard-title">Uitleg bij media</div>
              <div className="admin-panel-subtitle">{activeItem.caption}</div>
            </div>
          ) : null}

          <div className="guidance-media-actions">
            <a
              className="btn btn-secondary"
              href={activeItem.preview_url}
              target="_blank"
              rel="noreferrer"
            >
              Openen
            </a>

            <AnimatedActionButton
              Icon={ArchiveIcon}
              onClick={() => onArchive(activeItem.guidance_media_id)}
              disabled={busyKey === `${kind}:archive:${activeItem.guidance_media_id}`}
            >
              Archiveren
            </AnimatedActionButton>
          </div>
        </div>
      ) : (
        <div className="admin-empty-note">
          Nog geen actieve {isVideo ? "video" : "afbeelding"} ingesteld.
        </div>
      )}

      <button
        type="button"
        className="admin-section-head"
        onClick={() => setHistoryOpen((prev) => !prev)}
      >
        <div className="admin-section-head-main">
          <div className="admin-section-title">
            <HistoryIcon size={16} className="nav-anim-icon" />
            Geschiedenis
          </div>
          <div className="admin-section-sub">{archiveItems.length} gearchiveerd</div>
        </div>

        {historyOpen ? (
          <ChevronDownIcon size={18} className="nav-anim-icon" />
        ) : (
          <ChevronRightIcon size={18} className="nav-anim-icon" />
        )}
      </button>

      {historyOpen ? (
        <div className="admin-section-body">
          {archiveItems.length === 0 ? (
            <div className="admin-empty-note">Nog geen gearchiveerde items.</div>
          ) : (
            <div className="admin-check-grid">
              {archiveItems.map((item) => (
                <div key={item.guidance_media_id} className="admin-subcard">
                  <div className="admin-toolbar">
                    <div className="admin-toolbar-title">
                      <div className="admin-subcard-title">
                        {item.file_name || (isVideo ? "Video" : "Afbeelding")}
                      </div>
                      <div className="ember-label-row admin-inline-labels">
                        <span className="ember-label ember-label--muted">
                          {formatDateTime(item.created_at)}
                        </span>
                        {item.file_size_bytes ? (
                          <span className="ember-label ember-label--muted">
                            {fileSizeLabel(item.file_size_bytes)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="admin-toolbar-actions">
                      <a
                        className="btn btn-secondary"
                        href={item.preview_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Openen
                      </a>

                      <AnimatedActionButton
                        Icon={CheckIcon}
                        onClick={() => onActivate(item.guidance_media_id)}
                        disabled={busyKey === `${kind}:activate:${item.guidance_media_id}`}
                      >
                        Activeren
                      </AnimatedActionButton>
                    </div>
                  </div>

                  {item.caption ? (
                    <div className="admin-panel-subtitle">{item.caption}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GuidanceVideoRecorderModal({ busy, onClose, onRecorded }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function stopStream() {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    let disposed = false;

    async function openCamera() {
      setError("");

      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error("Webcamopname wordt niet ondersteund door deze browser.");
        }

        if (typeof MediaRecorder === "undefined") {
          throw new Error("Video opnemen wordt niet ondersteund door deze browser.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      } catch (e) {
        if (!disposed) {
          setError(e?.message || String(e));
        }
      }
    }

    openCamera();

    return () => {
      disposed = true;
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
      stopStream();
    };
  }, []);

  function pickVideoMimeType() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];

    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || recording || saving) return;

    try {
      chunksRef.current = [];
      const mimeType = pickVideoMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });

        if (!blob.size) {
          setError("Er is geen video-opname gemaakt.");
          setRecording(false);
          return;
        }

        setSaving(true);
        setError("");

        try {
          const file = new File([blob], `uitleg-video-${Date.now()}.webm`, {
            type: blob.type || "video/webm",
          });
          await onRecorded(file);
          stopStream();
          onClose();
        } catch (e) {
          setError(e?.message || String(e));
        } finally {
          setSaving(false);
          setRecording(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Sluit video-opname"
        className="form-guidance-modal-backdrop"
        onClick={() => {
          if (!recording && !saving) onClose();
        }}
      />

      <div className="card form-guidance-modal guidance-video-recorder-modal" role="dialog" aria-modal="true">
        <div className="form-guidance-modal__head">
          <div>
            <div className="form-guidance-modal__title">Video opnemen</div>
            <div className="form-guidance-modal__subtitle muted">
              Neem een korte uitlegvideo op met de webcam. Na stoppen wordt de video direct opgeslagen.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={recording || saving}
          >
            Sluiten
          </button>
        </div>

        <div className="form-guidance-modal__body">
          {error ? <div className="ember-label ember-label--danger">{error}</div> : null}

          <div className="guidance-video-recorder-preview">
            <video ref={videoRef} autoPlay muted playsInline />
          </div>

          <div className="ember-label-row admin-inline-labels">
            <span className={`ember-label ember-label--${recording ? "danger" : ready ? "success" : "muted"}`}>
              {recording ? "Opname loopt" : ready ? "Camera klaar" : "Camera openen"}
            </span>
            {saving || busy ? (
              <span className="ember-label ember-label--info">Opslaan</span>
            ) : null}
          </div>

          <div className="admin-toolbar-actions">
            {!recording ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={startRecording}
                disabled={!ready || saving || busy}
              >
                Start opname
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={stopRecording}
                disabled={saving || busy}
              >
                Stop en opslaan
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function GuidancePreviewModal({ formCode, questionRow, guidanceItem, onClose }) {
  const [previewModel, setPreviewModel] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [guidanceDialog, setGuidanceDialog] = useState(null);

  useEffect(() => {
    let disposed = false;
    let detach = null;

    async function buildPreview() {
      setLoadingPreview(true);
      setPreviewError("");

      try {
        const previewSurveyJson = buildPreviewSurveyJson(questionRow);
        if (!previewSurveyJson) {
          throw new Error("Voorbeeld van deze vraag kon niet worden opgebouwd.");
        }

        const prepared = buildPreparedSurveyJson(previewSurveyJson);
        if (!prepared?.ok) {
          throw new Error(prepared?.error || "Voorbeeld van deze vraag kon niet worden opgebouwd.");
        }

        const suppressDirtyRef = { current: false };
        const canEditRef = { current: true };
        const model = new Model(prepared.preparedSurveyJson);
        model.showTOC = false;
        model.mode = "edit";
        model.data = buildPreviewData(questionRow);

        const guidanceByQuestion = guidanceItem
          && questionRow?.target_kind !== "matrix_row"
          ? {
              [String(questionRow?.question_name || "").trim()]: [guidanceItem],
            }
          : {};
        const guidanceByMatrixRow =
          guidanceItem && questionRow?.target_kind === "matrix_row"
            ? {
                [buildGuidanceTargetKey(questionRow?.question_name, questionRow?.matrix_row_key)]: [
                  guidanceItem,
                ],
              }
            : {};

        detach = attachRuntimeBehaviors({
          model,
          prefillPayload: null,
          energyAutoStateRef: { current: {} },
          availabilityAutoStateRef: { current: {} },
          validationActivatedRef: { current: false },
          suppressDirtyRef,
          onAnswersSnapshotChange: () => {},
          onValidationSummaryChange: () => {},
          guidanceByQuestion,
          guidanceByMatrixRow,
          onOpenQuestionGuidance: setGuidanceDialog,
        });

        if (!disposed) {
          setPreviewModel(model);
        }
      } catch (error) {
        if (!disposed) {
          setPreviewError(error?.message || String(error));
          setPreviewModel(null);
        }
      } finally {
        if (!disposed) {
          setLoadingPreview(false);
        }
      }
    }

    buildPreview();

    return () => {
      disposed = true;
      if (typeof detach === "function") detach();
    };
  }, [questionRow, guidanceItem]);

  return (
    <>
      <button
        type="button"
        aria-label="Sluit vraagvoorbeeld"
        className="form-guidance-modal-backdrop"
        onClick={onClose}
      />

      <div className="card guidance-preview-modal" role="dialog" aria-modal="true" aria-label="Vraagvoorbeeld">
        <div className="form-guidance-modal__head">
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
            <CircleHelpIcon size={18} />
            <div style={{ minWidth: 0 }}>
              <div className="form-guidance-modal__title">
                {questionRow?.title || questionRow?.question_name || "Vraagvoorbeeld"}
              </div>
              <div className="muted form-guidance-modal__subtitle">
                {formCode ? `formulier: ${formCode}` : "formulier onbekend"}
                {" ; "}
                {questionRow?.question_name || "vraag onbekend"}
                {questionRow?.matrix_row_label ? ` ; ${questionRow.matrix_row_label}` : ""}
              </div>
            </div>
          </div>

          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Sluiten
          </button>
        </div>

        <div className="guidance-preview-modal__body">
          <div className="ember-label-row admin-inline-labels">
            <span className="ember-label ember-label--info">
              {questionTypeLabel(questionRow?.question_type)}
            </span>
            <span className={`ember-label ember-label--${guidanceItem ? "success" : "muted"}`}>
              {guidanceItem ? "Uitleg beschikbaar" : "Nog geen uitleg"}
            </span>
          </div>

          <div className="admin-empty-note">
            Dit is een voorbeeldweergave; antwoorden worden hier niet opgeslagen.
          </div>

          {loadingPreview ? (
            <div className="admin-empty-note">Voorbeeld wordt opgebouwd...</div>
          ) : previewError ? (
            <div className="ember-label ember-label--danger">{previewError}</div>
          ) : previewModel ? (
            <div className="card guidance-preview-survey-shell">
              <Survey model={previewModel} />
            </div>
          ) : null}
        </div>
      </div>

      {guidanceDialog ? (
        <>
          <button
            type="button"
            aria-label="Sluit uitleg"
            className="form-guidance-modal-backdrop"
            onClick={() => setGuidanceDialog(null)}
          />

          <div className="card form-guidance-modal" role="dialog" aria-modal="true" aria-label="Uitleg bij vraag">
            <div className="form-guidance-modal__head">
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                <CircleHelpIcon size={18} />
                <div style={{ minWidth: 0 }}>
                  <div className="form-guidance-modal__title">
                    {guidanceDialog.questionTitle || guidanceDialog.questionName || "Uitleg"}
                  </div>
                  <div className="muted form-guidance-modal__subtitle">
                    vraag: {guidanceDialog.questionName || "onbekend"}
                    {guidanceDialog.matrixRowLabel ? ` ; ${guidanceDialog.matrixRowLabel}` : ""}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGuidanceDialog(null)}
              >
                Sluiten
              </button>
            </div>

            <div className="form-guidance-modal__body">
              {(Array.isArray(guidanceDialog.items) ? guidanceDialog.items : []).map((item) => (
                <div key={item.guidance_id || item.title} className="card form-guidance-modal__item">
                  <div className="form-guidance-modal__item-title">{item.title || "Uitleg"}</div>

                  {item.body_markdown ? (
                    <div className="form-guidance-modal__item-body">{item.body_markdown}</div>
                  ) : null}

                  {item.image_url ? (
                    <div className="form-guidance-modal__media">
                      <img
                        src={item.image_url}
                        alt={item.image_caption || item.title || "Uitleg"}
                        className="form-guidance-modal__image"
                      />
                      {item.image_caption ? (
                        <div className="muted form-guidance-modal__caption">{item.image_caption}</div>
                      ) : null}
                    </div>
                  ) : null}

                  {item.video_url ? (
                    <video
                      className="form-guidance-modal__video"
                      controls
                      preload="metadata"
                      src={item.video_url}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

export default function GuidanceAdminPage() {
  const videoUploadInputRef = useRef(null);
  const imageUploadInputRef = useRef(null);

  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedFormId, setSelectedFormId] = useState("");
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [selectedMediaKind, setSelectedMediaKind] = useState("image");
  const [questionSearch, setQuestionSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [videoRecorderOpen, setVideoRecorderOpen] = useState(false);

  const [itemDraft, setItemDraft] = useState({
    title: "",
    body_markdown: "",
    is_active: true,
  });
  const [savingItem, setSavingItem] = useState(false);
  const [itemSaved, setItemSaved] = useState(false);
  const [mediaBusyKey, setMediaBusyKey] = useState("");
  const [mediaCaptionDrafts, setMediaCaptionDrafts] = useState({ video: "", image: "" });
  const [mediaCaptionSavedKind, setMediaCaptionSavedKind] = useState("");
  const [videoHistoryOpen, setVideoHistoryOpen] = useState(false);
  const [imageHistoryOpen, setImageHistoryOpen] = useState(false);

  async function loadPage(preferredFormId = "", preferredTargetKey = "") {
    setLoading(true);
    setError("");

    try {
      const [meRes, catalogRes] = await Promise.all([getMe(), getAdminGuidanceCatalog()]);
      const nextRoles = Array.isArray(meRes?.roles) ? meRes.roles : [];
      const nextCatalog = catalogRes || { items: [], forms: [] };
      const forms = Array.isArray(nextCatalog.forms) ? nextCatalog.forms : [];

      setRoles(nextRoles);
      setCatalog(nextCatalog);

      const nextFormId =
        forms.find((form) => form.form_id === preferredFormId)?.form_id ||
        forms.find((form) => form.form_id === selectedFormId)?.form_id ||
        forms[0]?.form_id ||
        "";

      setSelectedFormId(nextFormId);
      setSelectedTargetKey(preferredTargetKey || "");
    } catch (e) {
      setError(e?.message || String(e));
      setCatalog({ items: [], forms: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  const forms = Array.isArray(catalog?.forms) ? catalog.forms : [];
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const canManage = roles.includes("admin") || roles.includes("uitlegbeheerder");

  const selectedForm = useMemo(
    () => forms.find((form) => form.form_id === selectedFormId) || null,
    [forms, selectedFormId]
  );

  const questionRows = useMemo(() => {
    const needle = String(questionSearch || "").trim().toLowerCase();
    const targets = buildQuestionTargets(selectedForm?.questions, items, selectedForm?.form_id)
      .filter((row) => {
        if (!needle) return true;
        const haystack = [
          row.title,
          row.subtitle,
          row.matrix_row_label,
          row.question_name,
          row.guidanceItem?.title,
          row.guidanceItem?.body_markdown,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });

    return targets;
  }, [selectedForm, items, questionSearch]);

  useEffect(() => {
    if (!questionRows.length) {
      if (selectedTargetKey) setSelectedTargetKey("");
      return;
    }

    if (questionRows.some((row) => row.target_key === selectedTargetKey)) {
      return;
    }

    setSelectedTargetKey(questionRows[0].target_key);
  }, [questionRows, selectedTargetKey]);

  const selectedQuestionRow = useMemo(
    () => questionRows.find((row) => row.target_key === selectedTargetKey) || null,
    [questionRows, selectedTargetKey]
  );

  const selectedGuidanceItem = selectedQuestionRow?.guidanceItem || null;
  const activeVideoMedia = Array.isArray(selectedGuidanceItem?.media_assets)
    ? selectedGuidanceItem.media_assets.find((media) => media.media_kind === "video" && media.is_active)
    : null;
  const activeImageMedia = Array.isArray(selectedGuidanceItem?.media_assets)
    ? selectedGuidanceItem.media_assets.find((media) => media.media_kind === "image" && media.is_active)
    : null;

  useEffect(() => {
    setItemDraft(normalizeItemDraft(selectedGuidanceItem, selectedQuestionRow?.title || ""));
    setMediaCaptionDrafts({
      video: activeVideoMedia?.caption || "",
      image: activeImageMedia?.caption || "",
    });
    setMediaCaptionSavedKind("");
    setPreviewOpen(false);
    setVideoRecorderOpen(false);
    setVideoHistoryOpen(false);
    setImageHistoryOpen(false);
    setItemSaved(false);

    const hasVideo = Array.isArray(selectedGuidanceItem?.media_assets)
      ? selectedGuidanceItem.media_assets.some((media) => media.media_kind === "video")
      : false;
    const hasImage = Array.isArray(selectedGuidanceItem?.media_assets)
      ? selectedGuidanceItem.media_assets.some((media) => media.media_kind === "image")
      : false;

    if (hasImage) {
      setSelectedMediaKind("image");
    } else if (hasVideo) {
      setSelectedMediaKind("video");
    } else {
      setSelectedMediaKind("image");
    }
  }, [selectedGuidanceItem, selectedQuestionRow, activeVideoMedia?.guidance_media_id, activeImageMedia?.guidance_media_id]);

  const selectedActiveMedia = selectedMediaKind === "video" ? activeVideoMedia : activeImageMedia;
  const hasUnsavedItemChanges = Boolean(selectedGuidanceItem) &&
    JSON.stringify(normalizeItemDraft(selectedGuidanceItem, selectedQuestionRow?.title || "")) !==
      JSON.stringify(itemDraft);
  const hasUnsavedMediaCaptionChanges = Boolean(selectedActiveMedia) &&
    String(mediaCaptionDrafts[selectedMediaKind] || "") !== String(selectedActiveMedia?.caption || "");

  async function handleCreateGuidanceForQuestion() {
    if (!selectedForm || !selectedQuestionRow) return;

    setSavingItem(true);
    setError("");

    try {
      const sortOrderBase = (selectedQuestionRow.index + 1) * 100;
      const sortOrder =
        selectedQuestionRow.target_kind === "matrix_row"
          ? sortOrderBase + (Number(selectedQuestionRow.row_index ?? 0) + 1) * 10
          : sortOrderBase;
      const createRes = await createAdminGuidanceItem({
        title: selectedQuestionRow.title || selectedQuestionRow.question_name,
        body_markdown: "",
        sort_order: sortOrder,
        is_active: true,
      });

      const guidanceId = createRes?.created_guidance_id;
      if (!guidanceId) {
        throw new Error("created_guidance_id ontbreekt");
      }

      const linkedRes = await saveAdminGuidanceLinks(guidanceId, [
        {
          form_id: selectedForm.form_id,
          question_name: selectedQuestionRow.question_name,
          matrix_row_key: selectedQuestionRow.matrix_row_key || "",
          matrix_row_label: selectedQuestionRow.matrix_row_label || "",
          sort_order: sortOrder,
        },
      ]);

      setCatalog(linkedRes || { items: [], forms: [] });
      setItemSaved(true);
      window.setTimeout(() => setItemSaved(false), 2000);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavingItem(false);
    }
  }

  async function saveGuidanceItemDraft(nextDraft = itemDraft, options = {}) {
    if (!selectedGuidanceItem) return;

    setSavingItem(true);
    setError("");

    try {
      const res = await updateAdminGuidanceItem(selectedGuidanceItem.guidance_id, {
        ...nextDraft,
        sort_order: selectedGuidanceItem.sort_order ?? 0,
      });
      setCatalog(res || { items: [], forms: [] });
      if (!options.silent) {
        setItemSaved(true);
        window.setTimeout(() => setItemSaved(false), 2000);
      }
      return true;
    } catch (e) {
      setError(e?.message || String(e));
      return false;
    } finally {
      setSavingItem(false);
    }
  }

  async function handleSaveItem() {
    await saveGuidanceItemDraft(itemDraft);
  }

  async function handleToggleItemActive() {
    if (!selectedGuidanceItem) return;

    const previousDraft = itemDraft;
    const nextDraft = {
      ...itemDraft,
      is_active: !itemDraft.is_active,
    };

    setItemDraft(nextDraft);

    const ok = await saveGuidanceItemDraft(nextDraft);
    if (!ok) {
      setItemDraft(previousDraft);
    }
  }

  async function handleMediaUpload(kind, file) {
    if (!selectedGuidanceItem || !file) return;

    setMediaBusyKey(`${kind}:upload`);
    setError("");

    try {
      const res = await uploadAdminGuidanceMedia(selectedGuidanceItem.guidance_id, file, {
        media_kind: kind,
        caption: mediaCaptionDrafts[kind] || "",
        is_active: "1",
      });
      setCatalog(res || { items: [], forms: [] });
      setSelectedMediaKind(kind);
      setMediaCaptionSavedKind(kind);
      window.setTimeout(() => setMediaCaptionSavedKind(""), 2000);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMediaBusyKey("");
      if (videoUploadInputRef.current) videoUploadInputRef.current.value = "";
      if (imageUploadInputRef.current) imageUploadInputRef.current.value = "";
    }
  }

  async function handleSaveMediaCaption(kind, guidanceMediaId, options = {}) {
    if (!selectedGuidanceItem || !guidanceMediaId) return false;

    setMediaBusyKey(`${kind}:caption:${guidanceMediaId}`);
    setError("");

    try {
      const res = await updateAdminGuidanceMedia(selectedGuidanceItem.guidance_id, guidanceMediaId, {
        caption: mediaCaptionDrafts[kind] || "",
      });
      setCatalog(res || { items: [], forms: [] });
      if (!options.silent) {
        setMediaCaptionSavedKind(kind);
        window.setTimeout(() => setMediaCaptionSavedKind(""), 2000);
      }
      return true;
    } catch (e) {
      setError(e?.message || String(e));
      return false;
    } finally {
      setMediaBusyKey("");
    }
  }

  async function handleActivateMedia(kind, guidanceMediaId) {
    if (!selectedGuidanceItem || !guidanceMediaId) return;

    setMediaBusyKey(`${kind}:activate:${guidanceMediaId}`);
    setError("");

    try {
      const res = await activateAdminGuidanceMedia(selectedGuidanceItem.guidance_id, guidanceMediaId);
      setCatalog(res || { items: [], forms: [] });
      setSelectedMediaKind(kind);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMediaBusyKey("");
    }
  }

  async function handleArchiveMedia(kind, guidanceMediaId) {
    if (!selectedGuidanceItem || !guidanceMediaId) return;

    setMediaBusyKey(`${kind}:archive:${guidanceMediaId}`);
    setError("");

    try {
      const res = await archiveAdminGuidanceMedia(selectedGuidanceItem.guidance_id, guidanceMediaId);
      setCatalog(res || { items: [], forms: [] });
      setSelectedMediaKind(kind);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMediaBusyKey("");
    }
  }

  async function confirmLeaveWithUnsavedChanges() {
    if (!hasUnsavedItemChanges && !hasUnsavedMediaCaptionChanges) return true;

    const shouldSave = window.confirm(
      "Je hebt nog niet opgeslagen. Klik op OK om eerst op te slaan; Annuleren gaat verder zonder opslaan."
    );

    if (!shouldSave) return true;

    if (hasUnsavedItemChanges) {
      const itemOk = await saveGuidanceItemDraft(itemDraft, { silent: true });
      if (!itemOk) return false;
    }

    if (hasUnsavedMediaCaptionChanges && selectedActiveMedia?.guidance_media_id) {
      const mediaOk = await handleSaveMediaCaption(
        selectedMediaKind,
        selectedActiveMedia.guidance_media_id,
        { silent: true }
      );
      if (!mediaOk) return false;
    }

    return true;
  }

  async function handleSelectForm(nextFormId) {
    if (nextFormId === selectedFormId) return;
    const canLeave = await confirmLeaveWithUnsavedChanges();
    if (!canLeave) return;

    setSelectedFormId(nextFormId);
    setSelectedTargetKey("");
    setQuestionSearch("");
  }

  async function handleSelectTarget(nextTargetKey) {
    if (nextTargetKey === selectedTargetKey) return;
    const canLeave = await confirmLeaveWithUnsavedChanges();
    if (!canLeave) return;

    setSelectedTargetKey(nextTargetKey);
  }

  if (loading) {
    return <div className="muted">laden; uitleg</div>;
  }

  if (!canManage) {
    return (
      <div className="admin-page">
        <div className="admin-panel">
          <div className="admin-panel-title">Geen toegang</div>
          <div className="admin-panel-subtitle">
            Deze sectie is alleen beschikbaar voor beheerders en uitlegbeheerders.
          </div>
        </div>
      </div>
    );
  }

  const mediaTabs = [
    { key: "image", label: "Afbeelding", Icon: UploadIcon },
    { key: "video", label: "Video", Icon: CameraIcon },
  ];

  const selectedMediaItems = Array.isArray(selectedGuidanceItem?.media_assets)
    ? selectedGuidanceItem.media_assets.filter((media) => media.media_kind === selectedMediaKind)
    : [];

  return (
    <div className="admin-page guidance-admin-page">
      <input
        ref={videoUploadInputRef}
        type="file"
        accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
        hidden
        onChange={(e) => handleMediaUpload("video", e.target.files?.[0] || null)}
      />
      <input
        ref={imageUploadInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => handleMediaUpload("image", e.target.files?.[0] || null)}
      />

      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Uitleg</h1>
              <div className="ember-page-subtitle">
                Kies eerst een formulier; daarna beheer je de uitleg per vraag.
              </div>
            </div>
          </div>

          <div className="ember-toolbar">
            <AnimatedActionButton
              Icon={PlusIcon}
              onClick={handleCreateGuidanceForQuestion}
              disabled={!selectedQuestionRow || Boolean(selectedGuidanceItem) || savingItem}
            >
              Nieuwe toelichting
            </AnimatedActionButton>
          </div>
        </div>

        <div className="guidance-form-chooser">
          <div className="ember-page-subtitle">Formulier selecteren</div>

          {forms.length > 0 ? (
            <Tabs
              tabs={forms.map((form) => ({
                key: form.form_id,
                label: form.name || form.code,
                Icon: FileTextIcon,
              }))}
              activeKey={selectedFormId}
              onChange={handleSelectForm}
            />
          ) : (
            <div className="admin-empty-note">Nog geen formulieren beschikbaar.</div>
          )}
        </div>
      </div>

      {error ? <div className="ember-label ember-label--danger">{error}</div> : null}

      <div className="admin-grid guidance-admin-grid">
        <div className="admin-panel guidance-admin-list">
          <div className="admin-toolbar">
            <div className="admin-toolbar-title">
              <div className="admin-panel-title">Vragen en matrixregels</div>
              <div className="admin-panel-subtitle">
                {selectedForm ? `${selectedForm.name || selectedForm.code}; ${questionRows.length} zichtbare targets` : "Kies een formulier."}
              </div>
            </div>
          </div>

          <label className="admin-field guidance-search-field">
            <span>Zoek in vragen</span>
            <div className="guidance-search-input">
              <div className="guidance-search-input__icon">
                <SearchIcon size={16} className="nav-anim-icon" />
              </div>
              <input
                value={questionSearch}
                onChange={(e) => setQuestionSearch(e.target.value)}
                placeholder="vraagtitel, matrixregel of question_name"
              />
            </div>
          </label>

          {questionRows.length === 0 ? (
            <div className="admin-empty-note">Geen vragen of matrixregels gevonden voor dit formulier.</div>
          ) : (
            <div className="admin-check-grid">
              {questionRows.map((row) => (
                <GuidanceQuestionRow
                  key={row.target_key}
                  row={row}
                  active={row.target_key === selectedTargetKey}
                  onClick={() => handleSelectTarget(row.target_key)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="guidance-admin-detail">
          {!selectedQuestionRow ? (
            <div className="admin-panel">
              <div className="admin-empty-note">Selecteer een vraag om verder te werken.</div>
            </div>
          ) : !selectedGuidanceItem ? (
            <div className="admin-panel">
                <div className="admin-toolbar">
                  <div className="admin-toolbar-title">
                    <div className="admin-panel-title">{selectedQuestionRow.title}</div>
                    <div className="admin-panel-subtitle">
                      {selectedQuestionRow.question_name}
                      {selectedQuestionRow.matrix_row_label ? ` ; ${selectedQuestionRow.matrix_row_label}` : ""}
                    </div>
                  </div>
                </div>

              <div className="admin-empty-note">
                Voor deze vraag is nog geen uitleg ingesteld.
              </div>

              <div className="guidance-empty-actions">
                  <AnimatedActionButton
                    Icon={SearchIcon}
                    onClick={() => setPreviewOpen(true)}
                    disabled={!selectedQuestionRow?.preview_element_json}
                  >
                  Toon voorbeeld
                </AnimatedActionButton>

                <AnimatedActionButton
                  Icon={PlusIcon}
                  onClick={handleCreateGuidanceForQuestion}
                  disabled={savingItem}
                >
                  Toelichting toevoegen
                </AnimatedActionButton>
              </div>
            </div>
          ) : (
            <>
              <div className="admin-panel">
                <div className="admin-toolbar">
                  <div className="admin-toolbar-title">
                    <div className="admin-panel-title">{selectedQuestionRow.title}</div>
                    <div className="admin-panel-subtitle">
                      {selectedQuestionRow.question_name}
                      {selectedQuestionRow.matrix_row_label ? ` ; ${selectedQuestionRow.matrix_row_label}` : ""}
                    </div>
                  </div>

                  <div className="admin-toolbar-actions">
                    <AnimatedActionButton
                      Icon={SearchIcon}
                      onClick={() => setPreviewOpen(true)}
                      disabled={!selectedQuestionRow?.preview_element_json}
                    >
                      Toon voorbeeld
                    </AnimatedActionButton>

                    <SaveButton
                      disabled={savingItem}
                      saving={savingItem}
                      saved={itemSaved}
                      pulse
                      onClick={handleSaveItem}
                    />
                  </div>
                </div>

                <div className="ember-label-row admin-inline-labels">
                  <span className="ember-label ember-label--info">
                    {questionTypeLabel(selectedQuestionRow.question_type)}
                  </span>
                  <span className={`ember-label ember-label--${selectedGuidanceItem.is_active === false ? "warning" : "success"}`}>
                    {selectedGuidanceItem.is_active === false ? "Inactief" : "Actief"}
                  </span>
                  <span className="ember-label ember-label--muted">
                    Formulier; {selectedForm?.code}
                  </span>
                  {selectedQuestionRow.matrix_row_label ? (
                    <span className="ember-label ember-label--muted">
                      Regel; {selectedQuestionRow.matrix_row_label}
                    </span>
                  ) : null}
                </div>

                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Titel van uitleg</span>
                    <input
                      value={itemDraft.title}
                      onChange={(e) => setItemDraft((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  </label>

                  <div className="admin-field">
                    <span>Status in Ember</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={itemDraft.is_active ? "true" : "false"}
                      className={`ember-toggle${itemDraft.is_active ? " is-on" : " is-off"}`}
                      onClick={handleToggleItemActive}
                      disabled={savingItem}
                    >
                      <span className="ember-toggle__track">
                        <span className="ember-toggle__thumb" />
                      </span>
                      <span className="ember-toggle__label">
                        {itemDraft.is_active ? "Actief" : "Inactief"}
                      </span>
                    </button>
                  </div>

                  <label className="admin-field guidance-wide-field">
                    <span>Uitleg voor de invuller</span>
                    <textarea
                      rows={10}
                      value={itemDraft.body_markdown}
                      onChange={(e) =>
                        setItemDraft((prev) => ({ ...prev, body_markdown: e.target.value }))
                      }
                      placeholder="Schrijf hier de tekstuitleg die de invuller in de uitlegpopup te zien krijgt."
                    />
                  </label>
                </div>
              </div>

              <div className="admin-panel">
                <div className="admin-toolbar">
                  <div className="admin-toolbar-title">
                    <div className="admin-panel-title">Media</div>
                    <div className="admin-panel-subtitle">
                      Kies per keer 1 soort media; video of afbeelding.
                    </div>
                  </div>
                </div>

                <Tabs
                  tabs={mediaTabs}
                  activeKey={selectedMediaKind}
                  onChange={setSelectedMediaKind}
                />

                <div className="guidance-media-shell">
                  <MediaPanel
                    kind={selectedMediaKind}
                    mediaItems={selectedMediaItems}
                    historyOpen={selectedMediaKind === "video" ? videoHistoryOpen : imageHistoryOpen}
                    setHistoryOpen={selectedMediaKind === "video" ? setVideoHistoryOpen : setImageHistoryOpen}
                    busyKey={mediaBusyKey}
                    onUploadClick={() =>
                      selectedMediaKind === "video"
                        ? videoUploadInputRef.current?.click()
                        : imageUploadInputRef.current?.click()
                    }
                    onCaptureClick={() =>
                      selectedMediaKind === "video" ? setVideoRecorderOpen(true) : undefined
                    }
                    onActivate={(guidanceMediaId) => handleActivateMedia(selectedMediaKind, guidanceMediaId)}
                    onArchive={(guidanceMediaId) => handleArchiveMedia(selectedMediaKind, guidanceMediaId)}
                    onSaveCaption={(guidanceMediaId) =>
                      handleSaveMediaCaption(selectedMediaKind, guidanceMediaId)
                    }
                    pendingCaption={mediaCaptionDrafts[selectedMediaKind] || ""}
                    setPendingCaption={(value) =>
                      setMediaCaptionDrafts((prev) => ({ ...prev, [selectedMediaKind]: value }))
                    }
                    captionDirty={hasUnsavedMediaCaptionChanges}
                    captionSaved={mediaCaptionSavedKind === selectedMediaKind}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {previewOpen && selectedQuestionRow ? (
        <GuidancePreviewModal
          formCode={selectedForm?.code || ""}
          questionRow={selectedQuestionRow}
          guidanceItem={selectedGuidanceItem}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      {videoRecorderOpen ? (
        <GuidanceVideoRecorderModal
          busy={mediaBusyKey === "video:upload"}
          onClose={() => setVideoRecorderOpen(false)}
          onRecorded={(file) => handleMediaUpload("video", file)}
        />
      ) : null}
    </div>
  );
}
