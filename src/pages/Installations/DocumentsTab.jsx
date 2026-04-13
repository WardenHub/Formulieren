// src/pages/Installations/DocumentsTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
  putDocuments,
  getDocuments,
  uploadInstallationDocumentFile,
  getInstallationDocumentDownloadUrl,
  downloadInstallationDocumentFile,
  createInstallationDocumentReplacement,
  createInstallationDocumentAttachment,
} from "../../api/emberApi.js";

import { buildApiUrl } from "@/api/http.js";

import { ArchiveIcon } from "@/components/ui/archive";
import { HistoryIcon } from "@/components/ui/history";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";
import { DownloadIcon } from "@/components/ui/download";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { UploadIcon } from "@/components/ui/upload";
import { FileTextIcon } from "@/components/ui/file-text";

function isoDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fileBaseName(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  const i = s.lastIndexOf(".");
  if (i <= 0) return s;
  return s.slice(0, i);
}

function fileExtension(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  const i = s.lastIndexOf(".");
  if (i <= 0 || i === s.length - 1) return "";
  return s.slice(i);
}

function withPreservedExtension(existingFileName, nextTitle) {
  const cleanTitle = String(nextTitle || "").trim();
  if (!cleanTitle) return existingFileName || null;
  const ext = fileExtension(existingFileName);
  return `${cleanTitle}${ext}`;
}

function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function isFileDragEvent(e) {
  const types = Array.from(e?.dataTransfer?.types || []);
  return types.includes("Files");
}

function openNativeFilePicker(inputEl) {
  if (!inputEl) return;
  try {
    if (typeof inputEl.showPicker === "function") {
      inputEl.showPicker();
      return;
    }
  } catch {
    // ignore; fallback to click
  }
  inputEl.click();
}

function newDraft(typeKey, overrides = {}) {
  return {
    document_id: `new:${crypto.randomUUID()}`,
    document_type_key: typeKey,
    parent_document_id: null,
    relation_type: null,

    title: "",
    note: "",
    document_number: "",
    document_date: null,
    revision: "",

    has_file: false,
    file_name: null,
    mime_type: null,
    file_size_bytes: null,
    uploaded_at: null,
    uploaded_by: null,
    file_last_modified_at: null,
    file_last_modified_by: null,
    storage_provider: null,
    storage_key: null,

    document_is_active: true,
    created_at: null,
    created_by: null,
    updated_at: null,
    updated_by: null,

    ...overrides,
  };
}

function flattenTypeDocuments(items) {
  const out = [];
  const seen = new Set();

  function pushDoc(doc) {
    if (!doc || !doc.document_id) return;
    const key = String(doc.document_id);
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      document_id: doc.document_id,
      document_type_key: doc.document_type_key,
      parent_document_id: doc.parent_document_id ?? null,
      relation_type: doc.relation_type ?? null,

      title: doc.title ?? "",
      note: doc.note ?? "",
      document_number: doc.document_number ?? "",
      document_date: doc.document_date ?? null,
      revision: doc.revision ?? "",

      has_file: Boolean(doc.has_file || doc.storage_key),
      file_name: doc.file_name ?? null,
      mime_type: doc.mime_type ?? null,
      file_size_bytes: doc.file_size_bytes ?? null,
      uploaded_at: doc.uploaded_at ?? null,
      uploaded_by: doc.uploaded_by ?? null,
      file_last_modified_at: doc.file_last_modified_at ?? null,
      file_last_modified_by: doc.file_last_modified_by ?? null,
      storage_provider: doc.storage_provider ?? null,
      storage_key: doc.storage_key ?? null,

      document_is_active: doc.document_is_active ?? true,
      created_at: doc.created_at ?? null,
      created_by: doc.created_by ?? null,
      updated_at: doc.updated_at ?? null,
      updated_by: doc.updated_by ?? null,
    });

    for (const a of doc.attachments || []) pushDoc(a);
    for (const h of doc.history || []) pushDoc(h);
  }

  for (const doc of items || []) pushDoc(doc);
  return out;
}

function buildRowsByTypeFromDocs(documentTypes, docs) {
  const docsByType = new Map();
  for (const dt of docs?.documentTypes || []) {
    docsByType.set(dt.document_type_key, dt);
  }

  const next = {};
  const collapsed = {};

  for (const dt of documentTypes) {
    const typeKey = dt.document_type_key;
    const fromDocs = docsByType.get(typeKey);
    next[typeKey] = flattenTypeDocuments(fromDocs?.documents || []);
    collapsed[typeKey] = true;
  }

  return { rowsByType: next, collapsedArchivedByType: collapsed };
}

function buildDisplayModel(allRows) {
  const rows = Array.isArray(allRows) ? allRows.slice() : [];
  const byId = new Map(rows.map((r) => [String(r.document_id), r]));

  const replacedParentIds = new Set();
  for (const r of rows) {
    if (String(r.relation_type || "").toUpperCase() === "VERVANGING" && r.parent_document_id) {
      replacedParentIds.add(String(r.parent_document_id));
    }
  }

  const mainDocs = rows.filter((r) => {
    if (String(r.relation_type || "").toUpperCase() === "BIJLAGE") return false;
    return !replacedParentIds.has(String(r.document_id));
  });

  function resolveHistory(head) {
    const history = [];
    const seen = new Set();
    let current = head;

    while (current?.parent_document_id) {
      const parent = byId.get(String(current.parent_document_id));
      if (!parent) break;
      const key = String(parent.document_id);
      if (seen.has(key)) break;
      seen.add(key);
      history.push(parent);
      current = parent;
    }

    return history;
  }

  function resolveAttachments(main, history) {
    const validParentIds = new Set([
      String(main.document_id),
      ...history.map((x) => String(x.document_id)),
    ]);

    return rows.filter((r) => {
      return (
        String(r.relation_type || "").toUpperCase() === "BIJLAGE" &&
        r.parent_document_id &&
        validParentIds.has(String(r.parent_document_id))
      );
    });
  }

  const decorated = mainDocs.map((main) => {
    const history = resolveHistory(main);
    const attachments = resolveAttachments(main, history);
    return { main, history, attachments };
  });

  decorated.sort((a, b) => {
    const da = a.main.created_at ? new Date(a.main.created_at).getTime() : 0;
    const db = b.main.created_at ? new Date(b.main.created_at).getTime() : 0;
    return db - da;
  });

  return {
    active: decorated.filter((x) => x.main.document_is_active),
    archived: decorated.filter((x) => !x.main.document_is_active),
  };
}

function TabLoadingCard({ title = "Laden...", label = "Bezig met gegevens laden." }) {
  return (
    <div
      className="card"
      style={{
        minHeight: 180,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 24,
          display: "grid",
          gap: 10,
          justifyItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.08)",
            boxShadow: "0 0 0 8px rgba(255,255,255,0.04)",
          }}
        >
          <ArchiveIcon size={26} className="doc-anim-icon" />
        </div>

        <div style={{ fontWeight: 800, fontSize: 20 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      </div>
    </div>
  );
}

function StatusChip({ children, tone = "neutral" }) {
  const toneMap = {
    neutral: {
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.05)",
      color: "rgba(255,255,255,0.88)",
    },
    success: {
      border: "1px solid rgba(34,197,94,0.28)",
      background: "rgba(34,197,94,0.14)",
      color: "rgba(220,252,231,0.98)",
    },
    info: {
      border: "1px solid rgba(59,130,246,0.28)",
      background: "rgba(59,130,246,0.16)",
      color: "rgba(219,234,254,0.98)",
    },
    warning: {
      border: "1px solid rgba(245,158,11,0.28)",
      background: "rgba(245,158,11,0.14)",
      color: "rgba(254,243,199,0.98)",
    },
    danger: {
      border: "1px solid rgba(239,68,68,0.28)",
      background: "rgba(239,68,68,0.14)",
      color: "rgba(254,226,226,0.98)",
    },
    accent: {
      border: "1px solid rgba(16,185,129,0.32)",
      background: "rgba(16,185,129,0.18)",
      color: "rgba(209,250,229,0.98)",
    },
  };

  const style = toneMap[tone] || toneMap.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function AnimatedActionButton({
  title,
  onClick,
  Icon,
  children,
  className = "btn-ghost",
  disabled = false,
}) {
  const iconRef = useRef(null);

  return (
    <button
      type="button"
      className={className}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.();
      }}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
    >
      <Icon ref={iconRef} size={16} className="doc-anim-icon" />
      {children}
    </button>
  );
}

function FileOpenIconButton({ onClick, disabled = false, hasFile = false }) {
  const iconRef = useRef(null);

  return (
    <button
      type="button"
      title={hasFile ? "bestand openen" : "geen bestand aanwezig"}
      disabled={disabled || !hasFile}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled || !hasFile) return;
        onClick?.();
      }}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      className="icon-btn"
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        border: hasFile
          ? "1px solid rgba(34,197,94,0.24)"
          : "1px solid rgba(255,255,255,0.10)",
        background: hasFile
          ? "rgba(34,197,94,0.14)"
          : "rgba(255,255,255,0.04)",
        opacity: hasFile ? 1 : 0.65,
        flex: "0 0 auto",
      }}
    >
      <FileTextIcon ref={iconRef} size={18} className="doc-anim-icon" />
    </button>
  );
}

function ClickableDropBar({
  title,
  subtitle,
  isDragOver,
  onClick,
  onDrop,
  onDragEnter,
  onDragLeave,
  onDragOver,
  compact = false,
}) {
  const iconRef = useRef(null);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onDrop={(e) => {
        e.stopPropagation();
        onDrop?.(e);
      }}
      onDragEnter={(e) => {
        e.stopPropagation();
        onDragEnter?.(e);
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        onDragLeave?.(e);
      }}
      onDragOver={(e) => {
        e.stopPropagation();
        onDragOver?.(e);
      }}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        textAlign: "left",
        cursor: "pointer",
        borderRadius: compact ? 12 : 14,
        border: isDragOver
          ? "1px solid rgba(59,130,246,0.30)"
          : "1px dashed rgba(255,255,255,0.14)",
        background: isDragOver ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.02)",
        padding: compact ? 10 : 12,
        transition: "all 180ms ease",
      }}
    >
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        {subtitle ? (
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.3 }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          width: compact ? 34 : 38,
          height: compact ? 34 : 38,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDragOver ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.06)",
          flex: "0 0 auto",
        }}
      >
        <UploadIcon ref={iconRef} size={18} className="doc-anim-icon" />
      </div>
    </button>
  );
}

const DocumentsTab = forwardRef(function DocumentsTab(
  { code, docs, catalog, onDirtyChange, onSavingChange, onSaveOk, onSaved, onAnyOpenChange },
  ref
) {
  const [rowsByType, setRowsByType] = useState({});
  const [dirtyRows, setDirtyRows] = useState({});
  const [dirtyFields, setDirtyFields] = useState({});
  const [collapsedArchived, setCollapsedArchived] = useState({});
  const [sectionOpenMap, setSectionOpenMap] = useState({});
  const [typeOpenMap, setTypeOpenMap] = useState({});
  const [detailOpenMap, setDetailOpenMap] = useState({});
  const [pendingFilesByRowId, setPendingFilesByRowId] = useState({});
  const [rowStatusById, setRowStatusById] = useState({});
  const [saving, setSaving] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState(null);
  const [dragOverSectionKey, setDragOverSectionKey] = useState(null);
  const [dragOverTypeKey, setDragOverTypeKey] = useState(null);
  const [dragOverRowId, setDragOverRowId] = useState(null);
  const [dragOverReplaceId, setDragOverReplaceId] = useState(null);
  const [dragOverAttachId, setDragOverAttachId] = useState(null);
  const [sectionDropQueue, setSectionDropQueue] = useState({});
  const [accentRowId, setAccentRowId] = useState(null);
  const [error, setError] = useState(null);

  const sectionToggleIconRefs = useRef({});
  const typeFileInputRefs = useRef({});
  const uploadInputRefs = useRef({});
  const replaceInputRefs = useRef({});
  const attachInputRefs = useRef({});
  const rowRefs = useRef({});

  const sectionsByKey = useMemo(() => {
    const map = new Map();
    for (const s of catalog?.sections || []) map.set(s.section_key, s);
    return map;
  }, [catalog]);

  const sectionOrderByKey = useMemo(() => {
    const map = new Map();
    for (const s of catalog?.sections || []) {
      const so = Number.isFinite(Number(s.sort_order)) ? Number(s.sort_order) : 999999;
      map.set(s.section_key, so);
    }
    return map;
  }, [catalog]);

  const documentTypes = useMemo(() => {
    const list = catalog?.documentTypes || [];
    return list
      .filter((dt) => dt && dt.is_active !== false)
      .slice()
      .sort((a, b) => {
        const sa = a.section_key || "overig";
        const sb = b.section_key || "overig";

        const soa = sectionOrderByKey.get(sa) ?? 999999;
        const sob = sectionOrderByKey.get(sb) ?? 999999;
        if (soa !== sob) return soa - sob;

        if (sa !== sb) return sa.localeCompare(sb);

        const oa = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 999999;
        const ob = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 999999;
        if (oa !== ob) return oa - ob;

        const la = String(a.document_type_name || a.document_type_key || "");
        const lb = String(b.document_type_name || b.document_type_key || "");
        return la.localeCompare(lb);
      });
  }, [catalog, sectionOrderByKey]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const dt of documentTypes) {
      const k = dt.section_key || "overig";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(dt);
    }

    return Array.from(map.entries())
      .map(([section_key, types]) => ({
        section_key,
        section:
          sectionsByKey.get(section_key) || {
            section_key,
            section_name: section_key,
            sort_order: null,
          },
        types,
      }))
      .sort((a, b) => {
        const oa = Number.isFinite(Number(a.section?.sort_order)) ? Number(a.section.sort_order) : 999999;
        const ob = Number.isFinite(Number(b.section?.sort_order)) ? Number(b.section.sort_order) : 999999;
        if (oa !== ob) return oa - ob;
        return String(a.section_key).localeCompare(String(b.section_key));
      });
  }, [documentTypes, sectionsByKey]);

  useEffect(() => {
    setSectionOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) {
        if (next[g.section_key] === undefined) next[g.section_key] = false;
      }
      return next;
    });

    setTypeOpenMap((prev) => {
      const next = { ...prev };
      for (const dt of documentTypes) {
        if (next[dt.document_type_key] === undefined) next[dt.document_type_key] = true;
      }
      return next;
    });
  }, [grouped, documentTypes]);

  useEffect(() => {
    const anySectionOpen = Object.values(sectionOpenMap).some(Boolean);
    const anyTypeClosedInsideOpenSection = grouped.some(
      (g) => sectionOpenMap[g.section_key] && g.types.some((dt) => typeOpenMap[dt.document_type_key] === false)
    );
    onAnyOpenChange?.(anySectionOpen || anyTypeClosedInsideOpenSection);
  }, [sectionOpenMap, typeOpenMap, grouped, onAnyOpenChange]);

  useEffect(() => {
    if (!catalog) return;

    const { rowsByType: next, collapsedArchivedByType } = buildRowsByTypeFromDocs(documentTypes, docs);

    setRowsByType(next);
    setDirtyRows({});
    setDirtyFields({});
    setCollapsedArchived((prev) => ({ ...collapsedArchivedByType, ...prev }));
    setPendingFilesByRowId({});
    setRowStatusById({});
    setError(null);
  }, [catalog, docs, documentTypes]);

  useEffect(() => {
    if (!accentRowId) return;
    const timer = window.setTimeout(() => {
      setAccentRowId((cur) => (cur === accentRowId ? null : cur));
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [accentRowId]);

  const anyDirty = useMemo(() => Object.values(dirtyRows).some(Boolean), [dirtyRows]);

  useEffect(() => {
    onDirtyChange?.(anyDirty);
  }, [anyDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving || Boolean(actionBusyKey));
  }, [saving, actionBusyKey, onSavingChange]);

  function accentAndScrollRow(rowId, behavior = "smooth") {
    if (!rowId) return;
    setAccentRowId(String(rowId));

    window.setTimeout(() => {
      const el = rowRefs.current[String(rowId)];
      if (!el) return;
      el.scrollIntoView({
        behavior,
        block: "center",
        inline: "nearest",
      });
    }, 120);
  }

  function setRowStatus(rowId, status, message = null) {
    setRowStatusById((prev) => ({
      ...prev,
      [rowId]: { status, message },
    }));
  }

  function clearRowStatus(rowId) {
    setRowStatusById((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }

  function openSectionForType(typeKey) {
    const dt = documentTypes.find((x) => x.document_type_key === typeKey);
    const sk = dt?.section_key || "overig";
    setSectionOpenMap((m) => ({ ...m, [sk]: true }));
    setTypeOpenMap((m) => ({ ...m, [typeKey]: true }));
    return sk;
  }

  function setRow(typeKey, rowId, patch, fieldKey) {
    setRowsByType((prev) => {
      const arr = prev[typeKey] || [];
      return {
        ...prev,
        [typeKey]: arr.map((r) => (r.document_id === rowId ? { ...r, ...patch } : r)),
      };
    });

    setDirtyRows((m) => (m[rowId] ? m : { ...m, [rowId]: true }));

    if (fieldKey) {
      setDirtyFields((m) => {
        const prev = m[rowId] || {};
        if (prev[fieldKey]) return m;
        return { ...m, [rowId]: { ...prev, [fieldKey]: true } };
      });
    }
  }

  function updateTitleAndFileName(typeKey, row, nextTitle) {
    const patch = { title: nextTitle };
    if (row.has_file && row.file_name) {
      patch.file_name = withPreservedExtension(row.file_name, nextTitle);
    }
    setRow(typeKey, row.document_id, patch, "title");
  }

  function getRow(typeKey, rowId) {
    return (rowsByType[typeKey] || []).find((r) => r.document_id === rowId) || null;
  }

  function addRow(typeKey, overrides = {}) {
    const draft = newDraft(typeKey, overrides);

    setRowsByType((prev) => {
      const arr = prev[typeKey] || [];
      return { ...prev, [typeKey]: [draft, ...arr] };
    });

    setDirtyRows((m) => ({ ...m, [draft.document_id]: true }));
    setDirtyFields((m) => ({
      ...m,
      [draft.document_id]: {
        title: true,
        ...(overrides.note ? { note: true } : {}),
      },
    }));

    openSectionForType(typeKey);
    setDetailOpenMap((m) => ({ ...m, [`editor:${draft.document_id}`]: true }));
    accentAndScrollRow(draft.document_id, "smooth");

    return draft;
  }

  function addFilesAsDrafts(typeKey, files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return [];

    const createdRows = [];

    setRowsByType((prev) => {
      const arr = prev[typeKey] || [];
      const drafts = list.map((file) => {
        const draft = newDraft(typeKey, {
          title: fileBaseName(file.name),
          file_name: file.name,
        });
        createdRows.push({ rowId: draft.document_id, file });
        return draft;
      });

      return { ...prev, [typeKey]: [...drafts, ...arr] };
    });

    setDirtyRows((m) => {
      const next = { ...m };
      for (const x of createdRows) next[x.rowId] = true;
      return next;
    });

    setDirtyFields((m) => {
      const next = { ...m };
      for (const x of createdRows) {
        next[x.rowId] = { ...(next[x.rowId] || {}), title: true };
      }
      return next;
    });

    setPendingFilesByRowId((m) => {
      const next = { ...m };
      for (const x of createdRows) next[x.rowId] = x.file;
      return next;
    });

    for (const x of createdRows) {
      setRowStatus(x.rowId, "queued", "Wordt geüpload bij opslaan");
    }

    openSectionForType(typeKey);

    setDetailOpenMap((m) => {
      const next = { ...m };
      for (const x of createdRows) next[`editor:${x.rowId}`] = true;
      return next;
    });

    if (createdRows[0]?.rowId) {
      accentAndScrollRow(createdRows[0].rowId, "smooth");
    }

    return createdRows.map((x) => x.rowId);
  }

  function compileChangedRows() {
    const changed = [];

    for (const typeKey of Object.keys(rowsByType)) {
      for (const r of rowsByType[typeKey] || []) {
        if (!dirtyRows[r.document_id]) continue;

        changed.push({
          document_id: String(r.document_id || "").startsWith("new:") ? null : r.document_id,
          document_type_key: r.document_type_key,
          title: r.title || null,
          note: r.note || null,
          document_number: r.document_number || null,
          document_date: r.document_date || null,
          revision: r.revision || null,
          file_name: r.file_name || null,
          is_active: Boolean(r.document_is_active),
        });
      }
    }

    return changed;
  }

  async function refreshDocsAndRehydrate() {
    const fresh = await getDocuments(code);
    const { rowsByType: next, collapsedArchivedByType } = buildRowsByTypeFromDocs(documentTypes, fresh);

    setRowsByType(next);
    setDirtyRows({});
    setDirtyFields({});
    setCollapsedArchived((prev) => ({ ...collapsedArchivedByType, ...prev }));
    setError(null);

    return { fresh, rowsByType: next };
  }

  async function save() {
    setError(null);
    setSaving(true);

    try {
      const queuedEntries = Object.entries(pendingFilesByRowId)
        .map(([rowId, file]) => {
          const row =
            Object.values(rowsByType)
              .flat()
              .find((r) => String(r.document_id) === String(rowId)) || null;

          return row && file ? { rowId: String(rowId), row, file } : null;
        })
        .filter(Boolean);

      const changed = compileChangedRows();
      const hasMetadataChanges = changed.length > 0;
      const hasQueuedFiles = queuedEntries.length > 0;

      if (!hasMetadataChanges && !hasQueuedFiles) {
        return true;
      }

      if (hasQueuedFiles) {
        for (const item of queuedEntries) {
          setRowStatus(item.rowId, "uploading", "opslaan en uploaden...");
        }
      }

      if (hasMetadataChanges) {
        await putDocuments(code, changed);
      }

      let refreshed = null;
      let refreshedRowsByType = rowsByType;

      if (hasMetadataChanges || hasQueuedFiles) {
        refreshed = await getDocuments(code);
        refreshedRowsByType = buildRowsByTypeFromDocs(documentTypes, refreshed).rowsByType;
      }

      if (hasQueuedFiles) {
        const usedIds = new Set();
        const uploadedPersistedIds = [];

        for (const item of queuedEntries) {
          const isNewRow = String(item.row.document_id || "").startsWith("new:");
          const wasDirty = Boolean(dirtyRows[item.rowId]);

          let persistedId = null;

          if (!isNewRow && !wasDirty) {
            persistedId = String(item.row.document_id);
          } else {
            const match = findPersistedMatch(
              item.row.document_type_key,
              item.row,
              refreshedRowsByType[item.row.document_type_key] || [],
              usedIds
            );

            if (!match?.document_id) {
              throw new Error(`documentregel niet teruggevonden voor bestand ${item.file?.name || ""}`);
            }

            persistedId = String(match.document_id);
            usedIds.add(persistedId);
          }

          await uploadInstallationDocumentFile(code, persistedId, item.file);
          uploadedPersistedIds.push(persistedId);
        }

        if (uploadedPersistedIds.length > 0) {
          refreshed = await getDocuments(code);
          refreshedRowsByType = buildRowsByTypeFromDocs(documentTypes, refreshed).rowsByType;

          const firstUploadedId = uploadedPersistedIds[0];

          setPendingFilesByRowId((prev) => {
            const next = { ...prev };
            for (const item of queuedEntries) {
              delete next[item.rowId];
            }
            return next;
          });

          setRowStatusById((prev) => {
            const next = { ...prev };
            for (const item of queuedEntries) {
              delete next[item.rowId];
            }
            return next;
          });

          setRowsByType(refreshedRowsByType);
          setDirtyRows({});
          setDirtyFields({});
          setError(null);

          onSaveOk?.();
          await onSaved?.();

          accentAndScrollRow(firstUploadedId, "smooth");
          return true;
        }
      }

      if (refreshed) {
        const { rowsByType: next, collapsedArchivedByType } = buildRowsByTypeFromDocs(documentTypes, refreshed);
        setRowsByType(next);
        setDirtyRows({});
        setDirtyFields({});
        setCollapsedArchived((prev) => ({ ...collapsedArchivedByType, ...prev }));
        setError(null);
      } else if (hasMetadataChanges) {
        await refreshDocsAndRehydrate();
      }

      onSaveOk?.();
      await onSaved?.();
      return true;
    } catch (e) {
      setError(e?.message || String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function findPersistedMatch(typeKey, localRow, refreshedRowsForType, usedIds = new Set()) {
    const candidates = (refreshedRowsForType || []).filter((r) => {
      if (!r?.document_id) return false;
      if (usedIds.has(String(r.document_id))) return false;
      if (String(r.document_type_key || "") !== String(typeKey || "")) return false;
      if (String(r.relation_type || "").toUpperCase() === "BIJLAGE") return false;

      return (
        String(r.title || "") === String(localRow.title || "") &&
        String(r.note || "") === String(localRow.note || "") &&
        String(r.document_number || "") === String(localRow.document_number || "") &&
        String(isoDate(r.document_date) || "") === String(isoDate(localRow.document_date) || "") &&
        String(r.revision || "") === String(localRow.revision || "") &&
        Boolean(r.document_is_active) === Boolean(localRow.document_is_active)
      );
    });

    candidates.sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });

    return candidates[0] || null;
  }

  async function ensurePersistedRow(typeKey, row) {
    const rowId = String(row?.document_id || "");
    const isNew = rowId.startsWith("new:");
    const isDirty = Boolean(dirtyRows[rowId]);

    if (!isNew && !isDirty) {
      return rowId;
    }

    const localSnapshot = {
      ...row,
      document_date: row.document_date || null,
    };

    const ok = await save();
    if (!ok) return null;

    const fresh = await getDocuments(code);
    const freshRowsByType = buildRowsByTypeFromDocs(documentTypes, fresh).rowsByType;
    const match = findPersistedMatch(typeKey, localSnapshot, freshRowsByType[typeKey] || []);

    if (!match?.document_id) {
      throw new Error("opgeslagen documentregel niet teruggevonden");
    }

    return String(match.document_id);
  }

  async function getDocumentUrl(row) {
    const res = await getInstallationDocumentDownloadUrl(code, row.document_id);
    if (!res?.url) throw new Error("download-url ontbreekt");
    return res.url;
  }

  async function handleOpenDocument(row) {
    setError(null);
    setActionBusyKey(`open:${row.document_id}`);

    try {
      const url = await getDocumentUrl(row);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setActionBusyKey(null);
    }
  }

async function handleDownloadDocument(row) {
  setError(null);
  setActionBusyKey(`download:${row.document_id}`);

  try {
    const result = await downloadInstallationDocumentFile(code, row.document_id);

    const blobUrl = window.URL.createObjectURL(result.blob);
    const fileName =
      result.fileName ||
      row.file_name ||
      row.title ||
      "document";

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    a.rel = "noopener";
    a.style.display = "none";

    document.body.appendChild(a);
    a.click();
    a.remove();

    window.setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 1000);
  } catch (e) {
    setError(e?.message || String(e));
  } finally {
    setActionBusyKey(null);
  }
}

  async function handleUploadForRow(typeKey, row, file) {
    if (!file) return;

    setError(null);
    setActionBusyKey(`upload:${row.document_id}`);
    setRowStatus(row.document_id, "uploading", "bestand uploaden...");

    try {
      const persistedId = await ensurePersistedRow(typeKey, row);
      if (!persistedId) {
        setRowStatus(row.document_id, "error", "opslaan mislukt");
        return;
      }

      await uploadInstallationDocumentFile(code, persistedId, file);

      setPendingFilesByRowId((m) => {
        const next = { ...m };
        delete next[row.document_id];
        return next;
      });

      clearRowStatus(row.document_id);

      await refreshDocsAndRehydrate();
      await onSaved?.();
      onSaveOk?.();

      setDetailOpenMap((m) => ({ ...m, [`editor:${persistedId}`]: false }));
      accentAndScrollRow(persistedId, "smooth");
    } catch (e) {
      setRowStatus(row.document_id, "error", e?.message || String(e));
      setError(e?.message || String(e));
    } finally {
      setActionBusyKey(null);
    }
  }

  async function handleUploadQueuedForType(typeKey) {
    const queuedRows = (rowsByType[typeKey] || []).filter((r) => pendingFilesByRowId[r.document_id]);
    if (!queuedRows.length) return;

    setError(null);
    setActionBusyKey(`queue:${typeKey}`);

    try {
      const localSnapshots = queuedRows.map((r) => ({
        row: { ...r },
        file: pendingFilesByRowId[r.document_id],
      }));

      for (const item of localSnapshots) {
        setRowStatus(item.row.document_id, "uploading", "opslaan en uploaden...");
      }

      const ok = await save();
      if (!ok) {
        for (const item of localSnapshots) {
          setRowStatus(item.row.document_id, "error", "opslaan mislukt");
        }
        return;
      }

      const fresh = await getDocuments(code);
      const freshRowsByType = buildRowsByTypeFromDocs(documentTypes, fresh).rowsByType;
      const usedIds = new Set();
      let firstPersistedId = null;

      for (const item of localSnapshots) {
        const match = findPersistedMatch(typeKey, item.row, freshRowsByType[typeKey] || [], usedIds);
        if (!match?.document_id) {
          throw new Error(`documentregel niet teruggevonden voor bestand ${item.file?.name || ""}`);
        }

        usedIds.add(String(match.document_id));
        if (!firstPersistedId) firstPersistedId = String(match.document_id);
        await uploadInstallationDocumentFile(code, String(match.document_id), item.file);
      }

      setPendingFilesByRowId((m) => {
        const next = { ...m };
        for (const item of localSnapshots) delete next[item.row.document_id];
        return next;
      });

      for (const item of localSnapshots) {
        clearRowStatus(item.row.document_id);
      }

      await refreshDocsAndRehydrate();
      await onSaved?.();
      onSaveOk?.();

      if (firstPersistedId) {
        accentAndScrollRow(firstPersistedId, "smooth");
      }
    } catch (e) {
      for (const item of queuedRows) {
        setRowStatus(item.document_id, "error", e?.message || String(e));
      }
      setError(e?.message || String(e));
    } finally {
      setActionBusyKey(null);
    }
  }

  async function handleReplaceDocument(typeKey, row, file) {
    if (!file) return;

    setError(null);
    setActionBusyKey(`replace:${row.document_id}`);

    try {
      const persistedId = await ensurePersistedRow(typeKey, row);
      if (!persistedId) return;

      const latest = getRow(typeKey, persistedId) || row;

      const replacement = await createInstallationDocumentReplacement(code, persistedId, {
        title: latest.title || fileBaseName(file.name) || null,
        note: latest.note || null,
        document_number: latest.document_number || null,
        document_date: latest.document_date || null,
        revision: latest.revision || null,
      });

      const replacementId = replacement?.document?.document_id;
      if (!replacementId) throw new Error("vervangingsdocument niet aangemaakt");

      await uploadInstallationDocumentFile(code, replacementId, file);

      await refreshDocsAndRehydrate();
      await onSaved?.();
      onSaveOk?.();

      accentAndScrollRow(replacementId, "smooth");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setActionBusyKey(null);
    }
  }

  async function handleAddAttachments(typeKey, row, files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    setError(null);
    setActionBusyKey(`attach:${row.document_id}`);

    try {
      const persistedId = await ensurePersistedRow(typeKey, row);
      if (!persistedId) return;

      let firstAttachmentId = null;

      for (const file of list) {
        const created = await createInstallationDocumentAttachment(code, persistedId, {
          title: fileBaseName(file.name) || "Bijlage",
          note: null,
          document_number: null,
          document_date: null,
          revision: null,
        });

        const attachmentId = created?.document?.document_id;
        if (!attachmentId) throw new Error(`bijlage niet aangemaakt voor ${file.name}`);

        if (!firstAttachmentId) firstAttachmentId = attachmentId;
        await uploadInstallationDocumentFile(code, attachmentId, file);
      }

      await refreshDocsAndRehydrate();
      await onSaved?.();
      onSaveOk?.();

      setDetailOpenMap((m) => ({ ...m, [`attachments:${persistedId}`]: true }));
      accentAndScrollRow(firstAttachmentId || persistedId, "smooth");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setActionBusyKey(null);
    }
  }

  function handleSectionDrop(sectionKey, types, files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    setSectionOpenMap((m) => ({ ...m, [sectionKey]: true }));

    if ((types || []).length === 1) {
      addFilesAsDrafts(types[0].document_type_key, list);
      return;
    }

    setSectionDropQueue((prev) => ({
      ...prev,
      [sectionKey]: list,
    }));
  }

  function applySectionDropQueue(sectionKey, typeKey) {
    const files = sectionDropQueue[sectionKey] || [];
    if (!files.length) return;

    addFilesAsDrafts(typeKey, files);
    setSectionDropQueue((prev) => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
  }

  function clearSectionDropQueue(sectionKey) {
    setSectionDropQueue((prev) => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
  }

  function expandAll() {
    setSectionOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) next[g.section_key] = true;
      return next;
    });

    setTypeOpenMap((prev) => {
      const next = { ...prev };
      for (const dt of documentTypes) next[dt.document_type_key] = true;
      return next;
    });
  }

  function collapseAll() {
    setSectionOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) next[g.section_key] = false;
      return next;
    });

    setTypeOpenMap((prev) => {
      const next = { ...prev };
      for (const dt of documentTypes) next[dt.document_type_key] = false;
      return next;
    });
  }

  useImperativeHandle(
    ref,
    () => ({ save, expandAll, collapseAll }),
    [rowsByType, dirtyRows, grouped, documentTypes]
  );

  function animateSectionIcon(sectionKey) {
    sectionToggleIconRefs.current[sectionKey]?.startAnimation?.();
  }

  function stopSectionIcon(sectionKey) {
    sectionToggleIconRefs.current[sectionKey]?.stopAnimation?.();
  }

  function fieldLabel(text, isDirty) {
    return (
      <div className="cf-label">
        <span className="cf-label-text">{text}</span>
        <span className={`dot ${isDirty ? "dirty" : ""}`} />
      </div>
    );
  }

  function renderQueuedBadge(rowId) {
    const file = pendingFilesByRowId[rowId];
    if (!file) return null;
    return <StatusChip tone="warning">Wordt geüpload bij opslaan; {file.name}</StatusChip>;
  }

  function renderRowStatus(rowId) {
    const s = rowStatusById[rowId];
    if (!s) return null;
    const tone = s.status === "error" ? "danger" : s.status === "queued" ? "warning" : "info";
    return <StatusChip tone={tone}>{s.message || (s.status === "error" ? "Fout" : "Bezig")}</StatusChip>;
  }

  function getCardTone(row) {
    const pendingFile = pendingFilesByRowId[row.document_id];
    if (accentRowId === row.document_id) return "accent";
    if (!row.document_is_active) return "archived";
    if (pendingFile) return "warning";
    if (!row.has_file) return "metadata";
    return "normal";
  }

  function getCardStyle(row, compact = false) {
    const tone = getCardTone(row);

    const base = {
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: compact ? 14 : 16,
      background: "rgba(255,255,255,0.02)",
      padding: compact ? 12 : 14,
      transition: "all 220ms ease",
    };

    if (tone === "accent") {
      return {
        ...base,
        border: "1px solid rgba(16,185,129,0.34)",
        background: "linear-gradient(180deg, rgba(16,185,129,0.14), rgba(255,255,255,0.03))",
        boxShadow: "0 0 0 1px rgba(16,185,129,0.18), 0 0 28px rgba(16,185,129,0.12)",
      };
    }

    if (tone === "warning") {
      return {
        ...base,
        border: "1px solid rgba(245,158,11,0.26)",
        background: "linear-gradient(180deg, rgba(245,158,11,0.10), rgba(255,255,255,0.03))",
      };
    }

    if (tone === "metadata") {
      return {
        ...base,
        border: "1px solid rgba(59,130,246,0.24)",
        background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(255,255,255,0.03))",
      };
    }

    if (tone === "archived") {
      return {
        ...base,
        opacity: 0.78,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.015)",
      };
    }

    return base;
  }

  function renderFileSummary(row) {
    const queued = pendingFilesByRowId[row.document_id];
    if (queued) {
      return {
        title: queued.name,
        sub: "Wordt geüpload bij opslaan",
      };
    }

    if (!row.has_file) {
      return {
        title: row.title || "Geen bestand aanwezig",
        sub: "Nog geen bestand gekoppeld",
      };
    }

    return {
      title: row.file_name || row.title || "Document",
      sub: [
        row.title && row.file_name && row.title !== fileBaseName(row.file_name) ? row.title : null,
        row.file_size_bytes ? formatBytes(row.file_size_bytes) : null,
        row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : null,
      ].filter(Boolean).join(" ; "),
    };
  }

  function renderDocumentCard(typeKey, row, options = {}) {
    const compact = options.compact === true;
    const summary = renderFileSummary(row);
    const df = dirtyFields[row.document_id] || {};
    const pendingFile = pendingFilesByRowId[row.document_id];
    const canOpen = Boolean(row.has_file);
    const canUpload = !row.has_file && pendingFile;
    const canReplace = Boolean(row.has_file);
    const canAttach = !String(row.document_id || "").startsWith("new:");
    const isRowDragOver = dragOverRowId === row.document_id;
    const isReplaceDragOver = dragOverReplaceId === row.document_id;
    const isAttachDragOver = dragOverAttachId === row.document_id;
    const editorKey = `editor:${row.document_id}`;
    const isNewTemp = String(row.document_id || "").startsWith("new:");
    const editorOpen = detailOpenMap[editorKey] ?? false;

    return (
      <div
        key={row.document_id}
        ref={(el) => {
          rowRefs.current[String(row.document_id)] = el;
        }}
        style={getCardStyle(row, compact)}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div
              onClick={() =>
                setDetailOpenMap((m) => ({
                  ...m,
                  [editorKey]: !editorOpen,
                }))
              }
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                minWidth: 0,
                cursor: "pointer",
              }}
              title={editorOpen ? "details inklappen" : "details uitklappen"}
            >
              <FileOpenIconButton
                hasFile={row.has_file}
                disabled={Boolean(actionBusyKey)}
                onClick={() => handleOpenDocument(row)}
              />

              <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: compact ? 14 : 15,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                      flex: "1 1 260px",
                    }}
                  >
                    {summary.title}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      flex: "0 1 auto",
                    }}
                  >
                    {row.has_file ? (
                      <StatusChip tone="success">Bestand gekoppeld</StatusChip>
                    ) : (
                      <StatusChip tone="info">Geen bestand aanwezig</StatusChip>
                    )}

                    {renderQueuedBadge(row.document_id)}
                    {renderRowStatus(row.document_id)}
                    {accentRowId === row.document_id ? <StatusChip tone="accent">Zojuist toegevoegd</StatusChip> : null}
                    {isNewTemp ? <StatusChip tone="warning">Nieuw concept</StatusChip> : null}
                    {!row.document_is_active ? <StatusChip tone="neutral">Gearchiveerd</StatusChip> : null}
                    {row.document_number ? <StatusChip tone="neutral">Nr; {row.document_number}</StatusChip> : null}
                    {row.revision ? <StatusChip tone="neutral">Rev; {row.revision}</StatusChip> : null}
                    {row.document_date ? <StatusChip tone="neutral">Datum; {isoDate(row.document_date)}</StatusChip> : null}
                  </div>
                </div>

                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.35,
                    whiteSpace: compact ? "normal" : "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {summary.sub || " "}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {canOpen && (
                <AnimatedActionButton
                  title="downloaden"
                  Icon={DownloadIcon}
                  onClick={() => handleDownloadDocument(row)}
                  disabled={Boolean(actionBusyKey)}
                >
                  downloaden
                </AnimatedActionButton>
              )}

              <AnimatedActionButton
                title={editorOpen ? "details inklappen" : "details uitklappen"}
                Icon={editorOpen ? ChevronDownIcon : ChevronRightIcon}
                onClick={() =>
                  setDetailOpenMap((m) => ({
                    ...m,
                    [editorKey]: !editorOpen,
                  }))
                }
                disabled={Boolean(actionBusyKey)}
              >
                {editorOpen ? "minder" : "details"}
              </AnimatedActionButton>

              {row.document_is_active ? (
                <AnimatedActionButton
                  title="archiveren"
                  Icon={ArchiveIcon}
                  onClick={() => {
                    setRow(typeKey, row.document_id, { document_is_active: false }, "document_is_active");
                  }}
                >
                  archiveren
                </AnimatedActionButton>
              ) : (
                <AnimatedActionButton
                  title="actief maken"
                  Icon={HistoryIcon}
                  onClick={() => {
                    setRow(typeKey, row.document_id, { document_is_active: true }, "document_is_active");
                  }}
                >
                  actief
                </AnimatedActionButton>
              )}
            </div>
          </div>

          {editorOpen && (
            <div
              style={{
                display: "grid",
                gap: 12,
                paddingTop: 4,
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {fieldLabel("titel", Boolean(df.title))}
                  <input
                    className="cf-input"
                    value={row.title}
                    onChange={(e) => updateTitleAndFileName(typeKey, row, e.target.value)}
                    placeholder="titel"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  {fieldLabel("nummer", Boolean(df.document_number))}
                  <input
                    className="cf-input"
                    value={row.document_number}
                    onChange={(e) =>
                      setRow(typeKey, row.document_id, { document_number: e.target.value }, "document_number")
                    }
                    placeholder="nummer"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  {fieldLabel("datum", Boolean(df.document_date))}
                  <input
                    className="cf-input"
                    type="date"
                    value={isoDate(row.document_date)}
                    onChange={(e) =>
                      setRow(typeKey, row.document_id, { document_date: e.target.value || null }, "document_date")
                    }
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  {fieldLabel("revisie/versie", Boolean(df.revision))}
                  <input
                    className="cf-input"
                    value={row.revision}
                    onChange={(e) => setRow(typeKey, row.document_id, { revision: e.target.value }, "revision")}
                    placeholder="bv; A"
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  {fieldLabel("notitie", Boolean(df.note))}
                  <textarea
                    className="cf-input"
                    value={row.note}
                    onChange={(e) => setRow(typeKey, row.document_id, { note: e.target.value }, "note")}
                    placeholder="opmerking / context"
                    rows={2}
                    style={{ resize: "vertical", minHeight: 68 }}
                  />
                </div>
              </div>

              {!row.has_file && (
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    ref={(el) => {
                      uploadInputRefs.current[row.document_id] = el;
                    }}
                    type="file"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;

                      if (String(row.document_id || "").startsWith("new:") || dirtyRows[row.document_id]) {
                        setPendingFilesByRowId((m) => ({ ...m, [row.document_id]: file }));
                        setRowStatus(row.document_id, "queued", "Wordt geüpload bij opslaan");
                        return;
                      }

                      await handleUploadForRow(typeKey, row, file);
                    }}
                  />

                  <ClickableDropBar
                    compact
                    title={canUpload ? "Opslaan en uploaden" : "Sleep bestand hierheen of klik om te bladeren"}
                    subtitle={
                      canUpload
                        ? `Wordt geüpload bij opslaan; ${pendingFile?.name || ""}`
                        : "Deze documentregel heeft nog geen bestand"
                    }
                    isDragOver={isRowDragOver}
                    onClick={() => openNativeFilePicker(uploadInputRefs.current[row.document_id])}
                    onDragOver={(e) => {
                      if (!isFileDragEvent(e)) return;
                      e.preventDefault();
                      setDragOverRowId(row.document_id);
                    }}
                    onDragEnter={(e) => {
                      if (!isFileDragEvent(e)) return;
                      e.preventDefault();
                      setDragOverRowId(row.document_id);
                    }}
                    onDragLeave={(e) => {
                      if (!isFileDragEvent(e)) return;
                      e.preventDefault();
                      if (!e.currentTarget.contains(e.relatedTarget)) {
                        setDragOverRowId((cur) => (cur === row.document_id ? null : cur));
                      }
                    }}
                    onDrop={async (e) => {
                      if (!isFileDragEvent(e)) return;
                      e.preventDefault();
                      setDragOverRowId(null);
                      const file = e.dataTransfer?.files?.[0];
                      if (!file) return;

                      if (String(row.document_id || "").startsWith("new:") || dirtyRows[row.document_id]) {
                        setPendingFilesByRowId((m) => ({ ...m, [row.document_id]: file }));
                        setRowStatus(row.document_id, "queued", "Wordt geüpload bij opslaan");
                        return;
                      }

                      await handleUploadForRow(typeKey, row, file);
                    }}
                  />

                  {canUpload && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <AnimatedActionButton
                        title="opslaan en uploaden"
                        Icon={RefreshCWIcon}
                        onClick={() => handleUploadForRow(typeKey, row, pendingFile)}
                        disabled={Boolean(actionBusyKey)}
                      >
                        uploaden
                      </AnimatedActionButton>
                    </div>
                  )}
                </div>
              )}

              {row.has_file && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Bestandsacties</div>

                  {canReplace && (
                    <>
                      <input
                        ref={(el) => {
                          replaceInputRefs.current[row.document_id] = el;
                        }}
                        type="file"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          await handleReplaceDocument(typeKey, row, file);
                        }}
                      />

                      <ClickableDropBar
                        compact
                        title="Vervangen"
                        subtitle="Sleep een nieuw bestand hierheen of klik om te bladeren"
                        isDragOver={isReplaceDragOver}
                        onClick={() => openNativeFilePicker(replaceInputRefs.current[row.document_id])}
                        onDragOver={(e) => {
                          if (!isFileDragEvent(e)) return;
                          e.preventDefault();
                          setDragOverReplaceId(row.document_id);
                        }}
                        onDragEnter={(e) => {
                          if (!isFileDragEvent(e)) return;
                          e.preventDefault();
                          setDragOverReplaceId(row.document_id);
                        }}
                        onDragLeave={(e) => {
                          if (!isFileDragEvent(e)) return;
                          e.preventDefault();
                          if (!e.currentTarget.contains(e.relatedTarget)) {
                            setDragOverReplaceId((cur) => (cur === row.document_id ? null : cur));
                          }
                        }}
                        onDrop={async (e) => {
                          if (!isFileDragEvent(e)) return;
                          e.preventDefault();
                          setDragOverReplaceId(null);
                          const file = e.dataTransfer?.files?.[0];
                          if (!file) return;
                          await handleReplaceDocument(typeKey, row, file);
                        }}
                      />
                    </>
                  )}

                  {canAttach && (
                    <>
                      <input
                        ref={(el) => {
                          attachInputRefs.current[row.document_id] = el;
                        }}
                        type="file"
                        hidden
                        multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = "";
                          if (!files.length) return;
                          await handleAddAttachments(typeKey, row, files);
                        }}
                      />

                      <ClickableDropBar
                        compact
                        title="Bijlage toevoegen"
                        subtitle="Sleep één of meer bestanden hierheen of klik om te bladeren"
                        isDragOver={isAttachDragOver}
                        onClick={() => openNativeFilePicker(attachInputRefs.current[row.document_id])}
                        onDragOver={(e) => {
                          if (!isFileDragEvent(e)) return;
                          e.preventDefault();
                          setDragOverAttachId(row.document_id);
                        }}
                        onDragEnter={(e) => {
                          if (!isFileDragEvent(e)) return;
                          e.preventDefault();
                          setDragOverAttachId(row.document_id);
                        }}
                        onDragLeave={(e) => {
                          if (!isFileDragEvent(e)) return;
                          e.preventDefault();
                          if (!e.currentTarget.contains(e.relatedTarget)) {
                            setDragOverAttachId((cur) => (cur === row.document_id ? null : cur));
                          }
                        }}
                        onDrop={async (e) => {
                          if (!isFileDragEvent(e)) return;
                          e.preventDefault();
                          setDragOverAttachId(null);
                          const files = e.dataTransfer?.files;
                          if (!files?.length) return;
                          await handleAddAttachments(typeKey, row, files);
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <TabLoadingCard
        title="Documentcatalogus laden..."
        label="Bezig met documenttypes ophalen."
      />
    );
  }

  if (!docs) {
    return (
      <TabLoadingCard
        title="Documenten laden..."
        label="Bezig met documentregels ophalen."
      />
    );
  }

  return (
    <div
      style={{ display: "grid", gap: 12 }}
      onDragEnter={(e) => {
        if (!isFileDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragOver={(e) => {
        if (!isFileDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        if (!isFileDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {error && <p style={{ color: "salmon", margin: 0 }}>{error}</p>}

      <div
        className="card"
        style={{
          padding: 14,
          display: "grid",
          gap: 8,
          border: "1px solid rgba(59,130,246,0.16)",
          background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(255,255,255,0.02))",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>Bestanden toevoegen</div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.35 }}>
          Sleep bestanden op een sectiebalk, op een documenttype, op een documentregel zonder bestand, of op de balken voor vervangen en bijlage. Nieuwe items worden automatisch in beeld gebracht.
        </div>
      </div>

      {grouped.map((g) => {
        const isOpen = Boolean(sectionOpenMap[g.section_key]);
        const sectionIsDragOver = dragOverSectionKey === g.section_key;
        const sectionQueuedFiles = sectionDropQueue[g.section_key] || [];

        const totals = g.types.reduce(
          (acc, dt) => {
            const typeKey = dt.document_type_key;
            const model = buildDisplayModel(rowsByType[typeKey] || []);
            acc.active += model.active.length;
            acc.archived += model.archived.length;
            return acc;
          },
          { active: 0, archived: 0 }
        );

        const ToggleIcon = isOpen ? ChevronDownIcon : ChevronRightIcon;

        return (
          <div
            key={g.section_key}
            style={{
              border: sectionIsDragOver
                ? "1px solid rgba(59,130,246,0.24)"
                : "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              overflow: "hidden",
              background: sectionIsDragOver ? "rgba(59,130,246,0.06)" : "transparent",
              transition: "all 180ms ease",
            }}
            onDragOver={(e) => {
              if (!isFileDragEvent(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverSectionKey(g.section_key);
            }}
            onDragEnter={(e) => {
              if (!isFileDragEvent(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverSectionKey(g.section_key);
            }}
            onDragLeave={(e) => {
              if (!isFileDragEvent(e)) return;
              e.preventDefault();
              e.stopPropagation();
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setDragOverSectionKey((cur) => (cur === g.section_key ? null : cur));
              }
            }}
            onDrop={(e) => {
              if (!isFileDragEvent(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverSectionKey(null);
              handleSectionDrop(g.section_key, g.types, e.dataTransfer?.files);
            }}
          >
            <button
              type="button"
              onClick={() => setSectionOpenMap((m) => ({ ...m, [g.section_key]: !m[g.section_key] }))}
              onMouseEnter={() => animateSectionIcon(g.section_key)}
              onMouseLeave={() => stopSectionIcon(g.section_key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "transparent",
                border: "none",
                padding: 14,
                cursor: "pointer",
                textAlign: "left",
              }}
              title={isOpen ? "inklappen" : "uitklappen"}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700 }}>{g.section?.section_name || g.section_key}</div>
                <div className="muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                  {totals.active} actief
                </div>
                <div className="muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                  {totals.archived} gearchiveerd
                </div>
                {sectionIsDragOver ? <StatusChip tone="info">Laat los om toe te voegen</StatusChip> : null}
              </div>

              <div style={{ flex: "0 0 auto" }}>
                <ToggleIcon
                  ref={(el) => {
                    sectionToggleIconRefs.current[g.section_key] = el;
                  }}
                  size={18}
                  className="nav-anim-icon"
                />
              </div>
            </button>

            {isOpen && (
              <div style={{ padding: 14, paddingTop: 0, display: "grid", gap: 14 }}>
                {sectionQueuedFiles.length > 0 && g.types.length > 1 && (
                  <div
                    className="card"
                    style={{
                      padding: 12,
                      display: "grid",
                      gap: 10,
                      border: "1px solid rgba(245,158,11,0.22)",
                      background: "linear-gradient(180deg, rgba(245,158,11,0.10), rgba(255,255,255,0.02))",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>Kies documenttype voor {sectionQueuedFiles.length} bestand(en)</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      Je hebt bestanden op de sectiebalk gedropt. Kies hieronder naar welk documenttype ze moeten.
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {g.types.map((dt) => (
                        <button
                          key={dt.document_type_key}
                          type="button"
                          className="btn-secondary"
                          onClick={() => applySectionDropQueue(g.section_key, dt.document_type_key)}
                        >
                          <PlusIcon size={16} />
                          {dt.document_type_name}
                        </button>
                      ))}

                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => clearSectionDropQueue(g.section_key)}
                      >
                        annuleren
                      </button>
                    </div>
                  </div>
                )}

                {g.types.map((dt) => {
                  const typeKey = dt.document_type_key;
                  const all = rowsByType[typeKey] || [];
                  const model = buildDisplayModel(all);
                  const active = model.active;
                  const archived = model.archived;
                  const isCollapsed = collapsedArchived[typeKey] !== false;
                  const queuedCount = all.filter((r) => pendingFilesByRowId[r.document_id]).length;
                  const isTypeDragOver = dragOverTypeKey === typeKey;
                  const isTypeOpen = typeOpenMap[typeKey] !== false;
                  const TypeToggleIcon = isTypeOpen ? ChevronDownIcon : ChevronRightIcon;

                  return (
                    <div
                      key={typeKey}
                      className="doc-type"
                      style={{
                        borderRadius: 16,
                        padding: 14,
                        border: isTypeDragOver
                          ? "1px solid rgba(59,130,246,0.24)"
                          : "1px solid rgba(255,255,255,0.08)",
                        background: isTypeDragOver
                          ? "linear-gradient(180deg, rgba(59,130,246,0.10), rgba(255,255,255,0.02))"
                          : "rgba(255,255,255,0.02)",
                        transition: "all 180ms ease",
                      }}
                      onDragOver={(e) => {
                        if (!isFileDragEvent(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverTypeKey(typeKey);
                      }}
                      onDragEnter={(e) => {
                        if (!isFileDragEvent(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverTypeKey(typeKey);
                      }}
                      onDragLeave={(e) => {
                        if (!isFileDragEvent(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                          setDragOverTypeKey((cur) => (cur === typeKey ? null : cur));
                        }
                      }}
                      onDrop={(e) => {
                        if (!isFileDragEvent(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverTypeKey(null);
                        const files = e.dataTransfer?.files;
                        if (files?.length) addFilesAsDrafts(typeKey, files);
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setTypeOpenMap((m) => ({ ...m, [typeKey]: !isTypeOpen }))}
                        style={{
                          width: "100%",
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1fr) auto",
                          gap: 12,
                          alignItems: "center",
                          marginBottom: isTypeOpen ? 12 : 0,
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          color: "inherit",
                        }}
                        title={isTypeOpen ? "documenttype inklappen" : "documenttype uitklappen"}
                      >
                        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 800 }}>{dt.document_type_name}</div>
                            {queuedCount > 0 ? <StatusChip tone="warning">{queuedCount} in wachtrij</StatusChip> : null}
                            {isTypeDragOver ? <StatusChip tone="info">Laat los om toe te voegen</StatusChip> : null}
                          </div>

                          <div className="muted" style={{ fontSize: 13 }}>
                            {active.length} actief ; {archived.length} gearchiveerd
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {queuedCount > 0 && (
                            <span
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: "inline-flex" }}
                            >
                              <AnimatedActionButton
                                title="wachtrij opslaan en uploaden"
                                Icon={RefreshCWIcon}
                                onClick={() => handleUploadQueuedForType(typeKey)}
                                disabled={Boolean(actionBusyKey)}
                              >
                                upload wachtrij
                              </AnimatedActionButton>
                            </span>
                          )}

                          <span
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: "inline-flex" }}
                          >
                            <AnimatedActionButton
                              title="document toevoegen"
                              Icon={PlusIcon}
                              onClick={() => addRow(typeKey)}
                              disabled={Boolean(actionBusyKey)}
                            >
                              toevoegen
                            </AnimatedActionButton>
                          </span>

                          <TypeToggleIcon size={18} className="nav-anim-icon" />
                        </div>
                      </button>

                      {isTypeOpen && (
                        <>
                          <div style={{ marginBottom: 12 }}>
                            <input
                              ref={(el) => {
                                typeFileInputRefs.current[typeKey] = el;
                              }}
                              type="file"
                              hidden
                              multiple
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                e.target.value = "";
                                if (!files.length) return;
                                addFilesAsDrafts(typeKey, files);
                              }}
                            />

                            <ClickableDropBar
                              title={`Sleep bestanden hierheen voor ${dt.document_type_name.toLowerCase()}`}
                              subtitle="Klik ook op deze balk om te bladeren op deze pc"
                              isDragOver={isTypeDragOver}
                              onClick={() => openNativeFilePicker(typeFileInputRefs.current[typeKey])}
                              onDragOver={(e) => {
                                if (!isFileDragEvent(e)) return;
                                e.preventDefault();
                                setDragOverTypeKey(typeKey);
                              }}
                              onDragEnter={(e) => {
                                if (!isFileDragEvent(e)) return;
                                e.preventDefault();
                                setDragOverTypeKey(typeKey);
                              }}
                              onDragLeave={(e) => {
                                if (!isFileDragEvent(e)) return;
                                e.preventDefault();
                                if (!e.currentTarget.contains(e.relatedTarget)) {
                                  setDragOverTypeKey((cur) => (cur === typeKey ? null : cur));
                                }
                              }}
                              onDrop={(e) => {
                                if (!isFileDragEvent(e)) return;
                                e.preventDefault();
                                setDragOverTypeKey(null);
                                const files = e.dataTransfer?.files;
                                if (files?.length) addFilesAsDrafts(typeKey, files);
                              }}
                            />
                          </div>

                          {active.length > 0 ? (
                            <div className="doc-list" style={{ display: "grid", gap: 10 }}>
                              {active.map(({ main, attachments, history }) => {
                                const historyOpenKey = `history:${main.document_id}`;
                                const attachmentsOpenKey = `attachments:${main.document_id}`;
                                const historyOpen = detailOpenMap[historyOpenKey] === true;
                                const attachmentsOpen = detailOpenMap[attachmentsOpenKey] === true;

                                return (
                                  <div key={main.document_id} style={{ display: "grid", gap: 10 }}>
                                    {renderDocumentCard(typeKey, main)}

                                    {(history.length > 0 || attachments.length > 0) && (
                                      <div style={{ display: "grid", gap: 8, paddingLeft: 10 }}>
                                        {history.length > 0 && (
                                          <div>
                                            <button
                                              type="button"
                                              className="doc-archive-toggle"
                                              onClick={() =>
                                                setDetailOpenMap((m) => ({ ...m, [historyOpenKey]: !m[historyOpenKey] }))
                                              }
                                              title={historyOpen ? "verberg historie" : "toon historie"}
                                            >
                                              {historyOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                                              historie ({history.length})
                                            </button>

                                            {historyOpen && (
                                              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                                                {history.map((h) => renderDocumentCard(typeKey, h, { compact: true }))}
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {attachments.length > 0 && (
                                          <div>
                                            <button
                                              type="button"
                                              className="doc-archive-toggle"
                                              onClick={() =>
                                                setDetailOpenMap((m) => ({ ...m, [attachmentsOpenKey]: !m[attachmentsOpenKey] }))
                                              }
                                              title={attachmentsOpen ? "verberg bijlagen" : "toon bijlagen"}
                                            >
                                              {attachmentsOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                                              bijlagen ({attachments.length})
                                            </button>

                                            {attachmentsOpen && (
                                              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                                                {attachments.map((a) => renderDocumentCard(typeKey, a, { compact: true }))}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div
                              className="muted"
                              style={{
                                fontSize: 13,
                                padding: 12,
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.02)",
                                border: "1px dashed rgba(255,255,255,0.08)",
                              }}
                            >
                              nog geen actief document
                            </div>
                          )}

                          {archived.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                className="doc-archive-toggle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCollapsedArchived((m) => ({ ...m, [typeKey]: !m[typeKey] }));
                                }}
                                title={isCollapsed ? "toon gearchiveerd" : "verberg gearchiveerd"}
                              >
                                {isCollapsed ? <ChevronRightIcon size={18} /> : <ChevronDownIcon size={18} />}
                                gearchiveerd ({archived.length})
                              </button>

                              {!isCollapsed && (
                                <div className="doc-list" style={{ marginTop: 8, display: "grid", gap: 10 }}>
                                  {archived.map(({ main, attachments, history }) => {
                                    const historyOpenKey = `history:${main.document_id}`;
                                    const attachmentsOpenKey = `attachments:${main.document_id}`;
                                    const historyOpen = detailOpenMap[historyOpenKey] === true;
                                    const attachmentsOpen = detailOpenMap[attachmentsOpenKey] === true;

                                    return (
                                      <div key={main.document_id} style={{ display: "grid", gap: 10 }}>
                                        {renderDocumentCard(typeKey, main)}

                                        {(history.length > 0 || attachments.length > 0) && (
                                          <div style={{ display: "grid", gap: 8, paddingLeft: 10 }}>
                                            {history.length > 0 && (
                                              <div>
                                                <button
                                                  type="button"
                                                  className="doc-archive-toggle"
                                                  onClick={() =>
                                                    setDetailOpenMap((m) => ({ ...m, [historyOpenKey]: !m[historyOpenKey] }))
                                                  }
                                                  title={historyOpen ? "verberg historie" : "toon historie"}
                                                >
                                                  {historyOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                                                  historie ({history.length})
                                                </button>

                                                {historyOpen && (
                                                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                                                    {history.map((h) => renderDocumentCard(typeKey, h, { compact: true }))}
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {attachments.length > 0 && (
                                              <div>
                                                <button
                                                  type="button"
                                                  className="doc-archive-toggle"
                                                  onClick={() =>
                                                    setDetailOpenMap((m) => ({ ...m, [attachmentsOpenKey]: !m[attachmentsOpenKey] }))
                                                  }
                                                  title={attachmentsOpen ? "verberg bijlagen" : "toon bijlagen"}
                                                >
                                                  {attachmentsOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                                                  bijlagen ({attachments.length})
                                                </button>

                                                {attachmentsOpen && (
                                                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                                                    {attachments.map((a) => renderDocumentCard(typeKey, a, { compact: true }))}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default DocumentsTab;