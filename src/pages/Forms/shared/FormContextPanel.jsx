//src/pages/Forms/shared/FormContextPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { PlusIcon } from "@/components/ui/plus";
import { UploadIcon } from "@/components/ui/upload";
import { DownloadIcon } from "@/components/ui/download";
import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { RotateCCWIcon } from "@/components/ui/rotate-ccw";
import { SquarePenIcon } from "@/components/ui/square-pen";
import { DeleteIcon } from "@/components/ui/delete";
import { AttachFileIcon } from "@/components/ui/attach-file";

import {
  getDocuments,
  getInstallationDocumentDownloadUrl,
  downloadInstallationDocumentFile,
  getFormInstanceDocuments,
  putFormInstanceDocuments,
  uploadFormInstanceDocumentFile,
  getFormInstanceDocumentDownloadUrl,
  downloadFormInstanceDocumentFile,
  putFormInstanceDocumentLabels,
  deleteFormInstanceDocument,
} from "@/api/emberApi.js";

const LABEL_OPTIONS = [
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

const LABEL_STYLES = {
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

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("nl-NL");
}

function isImageMime(mime) {
  const m = String(mime || "").toLowerCase();
  return m.startsWith("image/");
}

function isProbablyMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "").toLowerCase();
  return /android|iphone|ipad|ipod|mobile|tablet/.test(ua);
}

function normalizeSelectedLabels(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

function buildLabelPayload(selected) {
  const arr = normalizeSelectedLabels(selected);
  return arr.map((labelKey, index) => ({
    label_key: labelKey,
    is_primary: index === 0,
  }));
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

function flattenInstallationTreeDocuments(items) {
  const out = [];
  const seen = new Set();

  function pushDoc(doc) {
    if (!doc) return;

    const id = String(doc.document_id || doc.id || "");
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }

    out.push(doc);

    for (const child of doc.attachments || []) pushDoc(child);
    for (const child of doc.history || []) pushDoc(child);
    for (const child of doc.documents || []) pushDoc(child);
  }

  for (const item of items || []) pushDoc(item);
  return out;
}

function normalizeInstallationDocsResponse(data) {
  if (Array.isArray(data)) return flattenInstallationTreeDocuments(data);
  if (Array.isArray(data?.items)) return flattenInstallationTreeDocuments(data.items);
  if (Array.isArray(data?.documents)) return flattenInstallationTreeDocuments(data.documents);
  if (Array.isArray(data?.rows)) return flattenInstallationTreeDocuments(data.rows);

  if (Array.isArray(data?.documentTypes)) {
    const fromTypes = data.documentTypes.flatMap((dt) => dt?.documents || []);
    return flattenInstallationTreeDocuments(fromTypes);
  }

  if (Array.isArray(data?.sections)) {
    const fromSections = data.sections.flatMap((section) =>
      Array.isArray(section?.documentTypes)
        ? section.documentTypes.flatMap((dt) => dt?.documents || [])
        : []
    );
    return flattenInstallationTreeDocuments(fromSections);
  }

  return [];
}

function normalizeFormDocsResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.documents)) return data.documents;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function groupInstallationDocsByType(items) {
  const map = new Map();

  for (const doc of items || []) {
    const key = String(doc.document_type_key || "OVERIG");

    if (!map.has(key)) {
      map.set(key, {
        key,
        title: doc.document_type_name || key,
        sortOrder: Number.isFinite(Number(doc?.document_type_sort_order))
          ? Number(doc.document_type_sort_order)
          : 9999,
        items: [],
      });
    }

    map.get(key).items.push(doc);
  }

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        const sortA = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 9999;
        const sortB = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 9999;
        if (sortA !== sortB) return sortA - sortB;

        const ad = new Date(a?.document_date || a?.updated_at || a?.created_at || 0).getTime();
        const bd = new Date(b?.document_date || b?.updated_at || b?.created_at || 0).getTime();
        return bd - ad;
      }),
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.title.localeCompare(b.title, "nl");
    });
}

function buildPreviewUrl(file) {
  if (!file || !isImageMime(file.type)) return null;
  return URL.createObjectURL(file);
}

function LabelBadge({ labelKey, fallback }) {
  const style = LABEL_STYLES[labelKey] || LABEL_STYLES.OVERIG;
  return (
    <span
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {fallback || labelKey}
    </span>
  );
}

function SectionToggle({ title, subtitle, count, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        appearance: "none",
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        color: "inherit",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        textAlign: "left",
        width: "100%",
      }}
    >
      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>{title}</div>
          {typeof count === "number" ? (
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
                fontWeight: 700,
              }}
            >
              {count}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <div className="muted" style={{ fontSize: 12 }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      {open ? <ChevronUpIcon size={18} /> : <PlusIcon size={18} />}
    </button>
  );
}

function FileActions({
  onOpen,
  onDownload,
  onEdit,
  disableOpen,
  disableDownload,
  disableEdit,
  canEditLabels,
  isEditing,
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onOpen}
        disabled={disableOpen}
        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
      >
        <ArrowBigRightIcon size={16} />
        Openen
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={onDownload}
        disabled={disableDownload}
        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
      >
        <DownloadIcon size={16} />
        Downloaden
      </button>

      {canEditLabels ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onEdit}
          disabled={disableEdit}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <SquarePenIcon size={16} />
          {isEditing ? "Sluiten" : "Aanpassen"}
        </button>
      ) : null}
    </div>
  );
}

function DocumentCard({
  title,
  subtitle,
  labels,
  note,
  actions,
  editArea,
}) {
  return (
    <div
      className="card"
      style={{
        padding: 12,
        display: "grid",
        gap: 8,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontWeight: 800 }}>{title || "Zonder titel"}</div>
        {subtitle ? (
          <div className="muted" style={{ fontSize: 12 }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      {labels?.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {labels.map((item, idx) => (
            <LabelBadge
              key={`${item.label_key || item.key || idx}`}
              labelKey={String(item.label_key || item.key || "")}
              fallback={item.display_name || item.label || item.label_key || item.key}
            />
          ))}
        </div>
      ) : null}

      {note ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {note}
        </div>
      ) : null}

      {actions}
      {editArea}
    </div>
  );
}

function SelectedUploadCard({ item, onRemove }) {
  return (
    <div
      className="card"
      style={{
        padding: 12,
        display: "grid",
        gap: 10,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      {item.previewUrl ? (
        <div
          style={{
            overflow: "hidden",
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <img
            src={item.previewUrl}
            alt={item.file.name}
            style={{
              width: "100%",
              maxHeight: 240,
              objectFit: "cover",
              display: "block",
            }}
          />
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, wordBreak: "break-word" }}>{item.file.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {formatBytes(item.file.size)}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRemove}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}
        >
          Verwijderen
        </button>
      </div>
    </div>
  );
}

export default function FormContextPanel({
  code,
  instanceId,
  canEdit,
  embedded = false,
  documentsTabHref = null,
}) {
  const [installationOpen, setInstallationOpen] = useState(true);
  const [formDocsOpen, setFormDocsOpen] = useState(true);

  const [installationTypeOpenMap, setInstallationTypeOpenMap] = useState({});
  const [installationDocs, setInstallationDocs] = useState([]);
  const [formDocs, setFormDocs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyDocId, setBusyDocId] = useState(null);
  const [error, setError] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const [selectedUploads, setSelectedUploads] = useState([]);
  const [note, setNote] = useState("");
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [imageVariant, setImageVariant] = useState("ORIGINAL");
  const [dragActive, setDragActive] = useState(false);

  const [editingDocId, setEditingDocId] = useState(null);

  const [cameraMode, setCameraMode] = useState("idle");
  const [cameraError, setCameraError] = useState(null);

  const [webcamStream, setWebcamStream] = useState(null);
  const [hasCameraSupport, setHasCameraSupport] = useState(false);

  const fileInputRef = useRef(null);
  const mobileCameraInputRef = useRef(null);
  const webcamVideoRef = useRef(null);

  const labelLookup = useMemo(() => {
    const map = new Map();
    for (const item of LABEL_OPTIONS) {
      map.set(item.key, item.label);
    }
    return map;
  }, []);

  useEffect(() => {
    setHasCameraSupport(
      typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  useEffect(() => {
    if (webcamVideoRef.current && webcamStream) {
      webcamVideoRef.current.srcObject = webcamStream;
    }
  }, [webcamStream]);

  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [webcamStream]);

  useEffect(() => {
    return () => {
      for (const item of selectedUploads) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [selectedUploads]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [instRes, formRes] = await Promise.all([
        getDocuments(code),
        getFormInstanceDocuments(code, instanceId),
      ]);

      setInstallationDocs(normalizeInstallationDocsResponse(instRes));
      setFormDocs(normalizeFormDocsResponse(formRes));
    } catch (e) {
      setError(String(e?.message || e || "Bestanden laden mislukt."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!code || !instanceId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, instanceId]);

  const installationDocItems = useMemo(() => {
    return [...installationDocs].filter((doc) =>
      Boolean(doc?.storage_key || doc?.file_name || doc?.has_file)
    );
  }, [installationDocs]);

  const installationGroups = useMemo(() => {
    return groupInstallationDocsByType(installationDocItems);
  }, [installationDocItems]);

  useEffect(() => {
    setInstallationTypeOpenMap((prev) => {
      const next = { ...prev };
      for (const group of installationGroups) {
        if (next[group.key] === undefined) next[group.key] = false;
      }
      return next;
    });
  }, [installationGroups]);

  const formDocItems = useMemo(() => {
    return [...formDocs].sort((a, b) => {
      const ad = new Date(a?.created_at || a?.updated_at || 0).getTime();
      const bd = new Date(b?.created_at || b?.updated_at || 0).getTime();
      return bd - ad;
    });
  }, [formDocs]);

  const summaryText = useMemo(() => {
    return `${installationDocItems.length} installatiebestand(en) ; ${formDocItems.length} formulierbijlage(n)`;
  }, [installationDocItems.length, formDocItems.length]);

  const hasSelectedLabels = selectedLabels.length > 0;
  const hasUploads = selectedUploads.length > 0;
  const canSubmitUpload = hasUploads && hasSelectedLabels && !uploading;

  const uploadStatus = useMemo(() => {
    if (!hasUploads) {
      return {
        text: "Nog geen bestand gekozen",
        color: "var(--muted-foreground, rgba(255,255,255,0.65))",
      };
    }

    if (!hasSelectedLabels) {
      return {
        text: "Kies minimaal 1 label om door te gaan",
        color: "salmon",
      };
    }

    return {
      text:
        selectedUploads.length === 1
          ? "1 bestand klaar om toe te voegen"
          : `${selectedUploads.length} bestanden klaar om toe te voegen`,
      color: "var(--muted-foreground, rgba(255,255,255,0.8))",
    };
  }, [hasUploads, hasSelectedLabels, selectedUploads.length]);

  const addButtonLabel = useMemo(() => {
    if (uploading) return "Bezig...";
    if (selectedUploads.length <= 1) return "Bijlage toevoegen";
    return `${selectedUploads.length} bijlagen toevoegen`;
  }, [selectedUploads.length, uploading]);

  function toggleSelectedLabel(labelKey) {
    setSelectedLabels((prev) => {
      const set = new Set(prev);
      if (set.has(labelKey)) set.delete(labelKey);
      else set.add(labelKey);
      return Array.from(set);
    });
    setUploadError(null);
  }

  function getDocSelectedLabelKeys(doc) {
    return normalizeSelectedLabels(
      (Array.isArray(doc?.labels) ? doc.labels : []).map((x) => x?.label_key || x?.key)
    );
  }

  function addFilesToSelection(inputFiles) {
    const files = Array.from(inputFiles || []).filter(Boolean);
    if (files.length === 0) return;

    setUploadError(null);

    setSelectedUploads((prev) => {
      const next = [...prev];
      const existingKeys = new Set(
        prev.map((item) => `${item.file.name}__${item.file.size}__${item.file.lastModified}`)
      );

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

  async function updateDocLabelsRealtime(doc, nextSelected) {
    if (!canEdit) return;

    const normalized = normalizeSelectedLabels(nextSelected);
    const payload = buildLabelPayload(normalized);

    setBusyDocId(doc.form_instance_document_id);
    setError(null);

    const previousDocs = formDocs;

    try {
      setFormDocs((prev) =>
        prev.map((item) => {
          if (item.form_instance_document_id !== doc.form_instance_document_id) return item;
          return {
            ...item,
            labels: payload.map((x) => ({
              label_key: x.label_key,
              display_name: labelLookup.get(x.label_key) || x.label_key,
              is_primary: x.is_primary,
            })),
          };
        })
      );

      await putFormInstanceDocumentLabels(
        code,
        instanceId,
        doc.form_instance_document_id,
        payload
      );
    } catch (e) {
      setFormDocs(previousDocs);
      setError(String(e?.message || e || "Labels opslaan mislukt."));
    } finally {
      setBusyDocId(null);
    }
  }

  async function saveDocMetadata(doc, patch) {
    const current = formDocs.find(
      (x) => x.form_instance_document_id === doc.form_instance_document_id
    );
    if (!current) return;

    setBusyDocId(doc.form_instance_document_id);
    setError(null);

    const previousDocs = formDocs;

    try {
      const nextDoc = { ...current, ...patch };

      setFormDocs((prev) =>
        prev.map((x) =>
          x.form_instance_document_id === doc.form_instance_document_id ? nextDoc : x
        )
      );

      await putFormInstanceDocuments(code, instanceId, [
        {
          form_instance_document_id: doc.form_instance_document_id,
          title: nextDoc.title || null,
          note: nextDoc.note || null,
          document_number: nextDoc.document_number || null,
          document_date: nextDoc.document_date || null,
          revision: nextDoc.revision || null,
          image_variant: nextDoc.image_variant || null,
          is_active: nextDoc.is_active ?? true,
        },
      ]);
    } catch (e) {
      setFormDocs(previousDocs);
      setError(String(e?.message || e || "Bijlage opslaan mislukt."));
    } finally {
      setBusyDocId(null);
    }
  }

  async function handleOpenInstallationDocument(doc) {
    try {
      const id = doc.document_id || doc.id;
      const res = await getInstallationDocumentDownloadUrl(code, id);
      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(String(e?.message || e || "Openen mislukt."));
    }
  }

  async function handleDownloadInstallationDocument(doc) {
    try {
      const id = doc.document_id || doc.id;
      const result = await downloadInstallationDocumentFile(code, id);
      triggerBrowserDownload(
        result.blob,
        result.fileName || doc.file_name || doc.title || doc.document_type_name || "bestand"
      );
    } catch (e) {
      setError(String(e?.message || e || "Downloaden mislukt."));
    }
  }

  async function handleOpenFormDocument(doc) {
    try {
      const res = await getFormInstanceDocumentDownloadUrl(
        code,
        instanceId,
        doc.form_instance_document_id
      );

      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(String(e?.message || e || "Openen mislukt."));
    }
  }

  async function handleDownloadFormDocument(doc) {
    try {
      const result = await downloadFormInstanceDocumentFile(
        code,
        instanceId,
        doc.form_instance_document_id
      );

      triggerBrowserDownload(
        result.blob,
        result.fileName || doc.file_name || doc.title || "bijlage"
      );
    } catch (e) {
      setError(String(e?.message || e || "Downloaden mislukt."));
    }
  }

  async function handleDeleteFormDocument(doc) {
    if (!canEdit) {
      setError("Bijlagen verwijderen kan alleen in status Concept.");
      return;
    }

    const ok = window.confirm("Weet je zeker dat je deze bijlage wilt weggooien?");
    if (!ok) return;

    setBusyDocId(doc.form_instance_document_id);
    setError(null);

    try {
      await deleteFormInstanceDocument(code, instanceId, doc.form_instance_document_id);
      setFormDocs((prev) =>
        prev.filter((x) => x.form_instance_document_id !== doc.form_instance_document_id)
      );
      if (editingDocId === doc.form_instance_document_id) {
        setEditingDocId(null);
      }
    } catch (e) {
      setError(String(e?.message || e || "Bijlage verwijderen mislukt."));
    } finally {
      setBusyDocId(null);
    }
  }

  async function openDesktopWebcam() {
    setCameraError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Webcam wordt niet ondersteund door deze browser.");
      }

      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
        setWebcamStream(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
        audio: false,
      });

      setWebcamStream(stream);
      setCameraMode("desktop-webcam");
    } catch (e) {
      setCameraError(String(e?.message || e || "Webcam openen mislukt."));
    }
  }

  function closeDesktopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop());
    }
    setWebcamStream(null);
    setCameraMode("idle");
  }

  function captureDesktopWebcamPhoto() {
    try {
      const video = webcamVideoRef.current;
      if (!video) return;

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context niet beschikbaar.");

      ctx.drawImage(video, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setCameraError("Foto maken mislukt.");
            return;
          }

          const filename = `webcam-foto-${new Date().toISOString().replaceAll(":", "-")}.jpg`;
          const file = new File([blob], filename, { type: "image/jpeg" });
          addFilesToSelection([file]);
          closeDesktopWebcam();
        },
        "image/jpeg",
        0.92
      );
    } catch (e) {
      setCameraError(String(e?.message || e || "Foto maken mislukt."));
    }
  }

  function openCameraOrFallback() {
    setUploadError(null);
    setCameraError(null);

    if (isProbablyMobileDevice()) {
      mobileCameraInputRef.current?.click();
      return;
    }

    if (hasCameraSupport) {
      openDesktopWebcam();
      return;
    }

    setCameraError("Geen camera beschikbaar op dit apparaat.");
  }

  async function handleCreateAndUpload() {
    setUploadError(null);

    if (!canEdit) {
      setUploadError("Bijlagen toevoegen kan alleen in status Concept.");
      return;
    }

    if (selectedUploads.length === 0) {
      setUploadError("Kies eerst een bestand of neem eerst een foto.");
      return;
    }

    const labelsPayload = buildLabelPayload(selectedLabels);
    if (labelsPayload.length === 0) {
      setUploadError("Kies minimaal 1 label.");
      return;
    }

    setUploading(true);

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

        const documentId =
          created?.form_instance_document_id ||
          created?.document_id ||
          created?.id;

        if (!documentId) {
          throw new Error("Documentregel kon niet worden aangemaakt.");
        }

        await uploadFormInstanceDocumentFile(code, instanceId, documentId, file);
        await putFormInstanceDocumentLabels(code, instanceId, documentId, labelsPayload);
      }

      for (const item of selectedUploads) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }

      setSelectedUploads([]);
      setNote("");
      setSelectedLabels([]);
      setImageVariant("ORIGINAL");
      setFormDocsOpen(true);
      setUploadError(null);

      if (fileInputRef.current) fileInputRef.current.value = "";
      if (mobileCameraInputRef.current) mobileCameraInputRef.current.value = "";

      await loadAll();
    } catch (e) {
      setUploadError(String(e?.message || e || "Uploaden mislukt."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 12, display: "grid", gap: 12 }}>
      {!embedded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <AttachFileIcon size={18} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Context en bijlagen</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {summaryText}
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div style={{ color: "salmon", fontSize: 13 }}>{error}</div> : null}

      <div style={{ display: "grid", gap: 12 }}>
        <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <SectionToggle
              title="Installatiebestanden"
              subtitle="Read-only context vanuit de installatie"
              count={installationDocItems.length}
              open={installationOpen}
              onToggle={() => setInstallationOpen((prev) => !prev)}
            />

            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadAll}
              disabled={loading || uploading || busyDocId != null}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <RotateCCWIcon size={16} />
              Vernieuwen
            </button>
          </div>

          {installationOpen ? (
            loading ? (
              <div className="muted" style={{ fontSize: 13 }}>Laden...</div>
            ) : installationGroups.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Geen installatiebestanden gevonden.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {installationGroups.map((group) => {
                  const typeOpen = installationTypeOpenMap[group.key] === true;

                  return (
                    <div
                      key={group.key}
                      className="card"
                      style={{
                        padding: 12,
                        display: "grid",
                        gap: 10,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <SectionToggle
                        title={group.title}
                        count={group.items.length}
                        open={typeOpen}
                        onToggle={() =>
                          setInstallationTypeOpenMap((prev) => ({
                            ...prev,
                            [group.key]: !prev[group.key],
                          }))
                        }
                      />

                      {typeOpen ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          {group.items.map((doc) => {
                            const subtitleParts = [
                              doc.file_name || null,
                              formatBytes(doc.file_size_bytes),
                              formatDateTime(doc.updated_at || doc.created_at),
                            ].filter(Boolean);

                            return (
                              <DocumentCard
                                key={doc.document_id || doc.id}
                                title={
                                  doc.title ||
                                  doc.naam ||
                                  doc.file_name ||
                                  doc.document_type_name ||
                                  "Bestand"
                                }
                                subtitle={subtitleParts.join(" ; ")}
                                note={doc.note || null}
                                actions={
                                  <FileActions
                                    onOpen={() => handleOpenInstallationDocument(doc)}
                                    onDownload={() => handleDownloadInstallationDocument(doc)}
                                    disableOpen={!doc.file_name && !doc.storage_key}
                                    disableDownload={!doc.file_name && !doc.storage_key}
                                    canEditLabels={false}
                                  />
                                }
                              />
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )
          ) : null}
        </div>

        <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
          <SectionToggle
            title="Formulierbijlagen"
            subtitle="Foto’s en andere bestanden toevoegen die bij dit formulier horen"
            count={formDocItems.length}
            open={formDocsOpen}
            onToggle={() => setFormDocsOpen((prev) => !prev)}
          />

          {formDocsOpen ? (
            <>
              <div
                className="muted"
                style={{
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                Officiële documenten en programmeringen horen bij{" "}
                {documentsTabHref ? (
                  <Link
                    to={documentsTabHref}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    Documenten
                  </Link>
                ) : (
                  "Documenten"
                )}{" "}
                in de installatie.
              </div>

              {canEdit ? (
                <div
                  className="card"
                  style={{
                    padding: 12,
                    display: "grid",
                    gap: 10,
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Nieuwe bijlage toevoegen</div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => addFilesToSelection(e.target.files)}
                    style={{ display: "none" }}
                  />

                  <input
                    ref={mobileCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => addFilesToSelection(e.target.files)}
                    style={{ display: "none" }}
                  />

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      const next = e.relatedTarget;
                      if (!e.currentTarget.contains(next)) {
                        setDragActive(false);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      addFilesToSelection(e.dataTransfer.files);
                    }}
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      border: dragActive
                        ? "1px solid rgba(255,255,255,0.22)"
                        : "1px dashed rgba(255,255,255,0.12)",
                      background: dragActive
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.03)",
                      cursor: "pointer",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                      >
                        Bestanden kiezen
                      </button>

                      <span className="muted" style={{ fontSize: 13 }}>
                        Sleep bestanden hierheen, of kies meerdere bestanden tegelijk.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={openCameraOrFallback}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <UploadIcon size={16} />
                      Neem foto
                    </button>
                  </div>

                  {cameraError ? (
                    <div style={{ color: "salmon", fontSize: 13 }}>{cameraError}</div>
                  ) : null}

                  {cameraMode === "desktop-webcam" ? (
                    <div
                      className="card"
                      style={{
                        padding: 12,
                        display: "grid",
                        gap: 10,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>Webcam</div>

                      <div
                        style={{
                          overflow: "hidden",
                          borderRadius: 12,
                          background: "#000",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <video
                          ref={webcamVideoRef}
                          autoPlay
                          playsInline
                          muted
                          style={{
                            width: "100%",
                            maxHeight: 320,
                            display: "block",
                            objectFit: "cover",
                          }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={captureDesktopWebcamPhoto}
                          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                        >
                          <UploadIcon size={16} />
                          Foto maken
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={closeDesktopWebcam}
                        >
                          Annuleren
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {selectedUploads.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Geselecteerde bestanden
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {selectedUploads.map((item) => (
                          <SelectedUploadCard
                            key={item.id}
                            item={item}
                            onRemove={() => removeSelectedUpload(item.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <textarea
                    className="input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optionele notitie"
                    style={{ minHeight: 42, resize: "vertical" }}
                  />

                  {selectedUploads.some((x) => isImageMime(x.file.type)) ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Resolutievariant voor foto’s
                      </div>
                      <select
                        className="input"
                        value={imageVariant}
                        onChange={(e) => setImageVariant(e.target.value)}
                      >
                        <option value="ORIGINAL">Origineel</option>
                        <option value="LARGE">Hoog</option>
                        <option value="MEDIUM">Middel</option>
                        <option value="SMALL">Laag</option>
                      </select>
                    </div>
                  ) : null}

                  <div style={{ display: "grid", gap: 6 }}>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Labels ; minimaal 1 verplicht
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {LABEL_OPTIONS.map((item) => {
                        const active = selectedLabels.includes(item.key);
                        const baseStyle = LABEL_STYLES[item.key] || LABEL_STYLES.OVERIG;

                        return (
                          <button
                            key={item.key}
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => toggleSelectedLabel(item.key)}
                            style={{
                              ...baseStyle,
                              opacity: active ? 1 : 0.65,
                              fontWeight: active ? 800 : 600,
                            }}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 10,
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    {(uploadError || uploadStatus.text) ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: uploadError ? "salmon" : uploadStatus.color,
                          fontWeight: uploadError ? 700 : 500,
                        }}
                      >
                        {uploadError || uploadStatus.text}
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        className="btn"
                        disabled={!canSubmitUpload}
                        onClick={handleCreateAndUpload}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          boxShadow: canSubmitUpload
                            ? "0 0 0 1px rgba(255,255,255,0.08), 0 12px 24px rgba(0,0,0,0.18)"
                            : "none",
                        }}
                        title={
                          !hasUploads
                            ? "Kies eerst een bestand"
                            : !hasSelectedLabels
                              ? "Kies minimaal 1 label"
                              : "Voeg de geselecteerde bijlage(n) toe"
                        }
                      >
                        <UploadIcon size={16} />
                        {addButtonLabel}
                      </button>

                      <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>
                        {selectedUploads.length > 0
                          ? `${selectedUploads.length} bestand(en) geselecteerd`
                          : "Kies bestand(en), labels en voeg daarna toe"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>
                  Bijlagen toevoegen of wijzigen kan alleen in status Concept.
                </div>
              )}

              {loading ? (
                <div className="muted" style={{ fontSize: 13 }}>Laden...</div>
              ) : formDocItems.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  Nog geen formulierbijlagen aanwezig.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {formDocItems.map((doc) => {
                    const subtitleParts = [
                      doc.file_name || null,
                      formatBytes(doc.file_size_bytes),
                      formatDateTime(doc.uploaded_at || doc.created_at),
                    ].filter(Boolean);

                    const labels = Array.isArray(doc.labels)
                      ? doc.labels.map((item) => ({
                          ...item,
                          display_name:
                            item.display_name ||
                            labelLookup.get(String(item.label_key || "")) ||
                            item.label_key,
                        }))
                      : [];

                    const isEditing = editingDocId === doc.form_instance_document_id;
                    const docBusy = busyDocId === doc.form_instance_document_id;
                    const selectedForDoc = getDocSelectedLabelKeys(doc);

                    return (
                      <DocumentCard
                        key={doc.form_instance_document_id}
                        title={doc.title || doc.file_name || "Bijlage"}
                        subtitle={subtitleParts.join(" ; ")}
                        note={doc.note || null}
                        labels={labels}
                        actions={
                          <FileActions
                            onOpen={() => handleOpenFormDocument(doc)}
                            onDownload={() => handleDownloadFormDocument(doc)}
                            onEdit={() =>
                              setEditingDocId((prev) =>
                                prev === doc.form_instance_document_id
                                  ? null
                                  : doc.form_instance_document_id
                              )
                            }
                            disableOpen={!doc.file_name || docBusy}
                            disableDownload={!doc.file_name || docBusy}
                            disableEdit={docBusy || !canEdit}
                            canEditLabels={canEdit}
                            isEditing={isEditing}
                          />
                        }
                        editArea={
                          isEditing ? (
                            <div
                              className="card"
                              style={{
                                padding: 10,
                                display: "grid",
                                gap: 10,
                                background: "rgba(255,255,255,0.03)",
                              }}
                            >
                              <div className="muted" style={{ fontSize: 12 }}>
                                Labels worden direct opgeslagen bij wijzigen. Titel en notitie worden opgeslagen zodra je uit het veld klikt.
                              </div>

                              <div style={{ display: "grid", gap: 6 }}>
                                <div className="muted" style={{ fontSize: 12 }}>
                                  Titel
                                </div>
                                <input
                                  className="input"
                                  value={doc.title || ""}
                                  disabled={docBusy}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setFormDocs((prev) =>
                                      prev.map((x) =>
                                        x.form_instance_document_id === doc.form_instance_document_id
                                          ? { ...x, title: value }
                                          : x
                                      )
                                    );
                                  }}
                                  onBlur={() =>
                                    saveDocMetadata(doc, {
                                      title:
                                        formDocs.find(
                                          (x) =>
                                            x.form_instance_document_id === doc.form_instance_document_id
                                        )?.title || null,
                                    })
                                  }
                                  placeholder="Optionele titel"
                                />
                              </div>

                              <div style={{ display: "grid", gap: 6 }}>
                                <div className="muted" style={{ fontSize: 12 }}>
                                  Notitie
                                </div>
                                <textarea
                                  className="input"
                                  value={doc.note || ""}
                                  disabled={docBusy}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setFormDocs((prev) =>
                                      prev.map((x) =>
                                        x.form_instance_document_id === doc.form_instance_document_id
                                          ? { ...x, note: value }
                                          : x
                                      )
                                    );
                                  }}
                                  onBlur={() =>
                                    saveDocMetadata(doc, {
                                      note:
                                        formDocs.find(
                                          (x) =>
                                            x.form_instance_document_id === doc.form_instance_document_id
                                        )?.note || null,
                                    })
                                  }
                                  placeholder="Optionele notitie"
                                  style={{ minHeight: 64, resize: "vertical" }}
                                />
                              </div>

                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {LABEL_OPTIONS.map((item) => {
                                  const active = selectedForDoc.includes(item.key);
                                  const baseStyle = LABEL_STYLES[item.key] || LABEL_STYLES.OVERIG;

                                  return (
                                    <button
                                      key={item.key}
                                      type="button"
                                      className="btn btn-secondary"
                                      disabled={docBusy}
                                      onClick={() => {
                                        const set = new Set(selectedForDoc);
                                        if (set.has(item.key)) set.delete(item.key);
                                        else set.add(item.key);
                                        updateDocLabelsRealtime(doc, Array.from(set));
                                      }}
                                      style={{
                                        ...baseStyle,
                                        opacity: active ? 1 : 0.65,
                                        fontWeight: active ? 800 : 600,
                                      }}
                                    >
                                      {item.label}
                                    </button>
                                  );
                                })}
                              </div>

                              <div>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={docBusy || !canEdit}
                                  onClick={() => handleDeleteFormDocument(doc)}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                >
                                  <DeleteIcon size={16} />
                                  Weggooien
                                </button>
                              </div>
                            </div>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}