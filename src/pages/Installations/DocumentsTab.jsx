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

import { ArchiveIcon } from "@/components/ui/archive";
import { HistoryIcon } from "@/components/ui/history";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";
import { DownloadIcon } from "@/components/ui/download";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { UploadIcon } from "@/components/ui/upload";
import { FileTextIcon } from "@/components/ui/file-text";
import { FileStackIcon } from "@/components/ui/file-stack";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function isoDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayIsoDate() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
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
    // fallback
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
      document_type_name: doc.document_type_name ?? null,
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

    return rows.filter((r) => (
      String(r.relation_type || "").toUpperCase() === "BIJLAGE" &&
      r.parent_document_id &&
      validParentIds.has(String(r.parent_document_id))
    ));
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
    <div className="card doc-loading-card">
      <div className="doc-loading-card__inner">
        <div className="doc-loading-card__icon">
          <ArchiveIcon size={26} className="doc-anim-icon" />
        </div>

        <div className="doc-loading-card__title">{title}</div>
        <div className="muted doc-text-sm">{label}</div>
      </div>
    </div>
  );
}

function StatusChip({ children, tone = "neutral" }) {
  return <span className={`ember-label ember-label--${tone}`}>{children}</span>;
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
      className={cx(
        "icon-btn",
        "doc-file-open-btn",
        hasFile ? "doc-file-open-btn--has-file" : "doc-file-open-btn--empty"
      )}
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
      className={cx(
        "doc-dropbar",
        compact && "doc-dropbar--compact",
        isDragOver && "doc-dropbar--active"
      )}
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
    >
      <span className="doc-dropbar__text">
        <span className="doc-dropbar__title">{title}</span>
        {subtitle ? <span className="muted doc-dropbar__subtitle">{subtitle}</span> : null}
      </span>

      <span className="doc-dropbar__icon">
        <UploadIcon ref={iconRef} size={18} className="doc-anim-icon" />
      </span>
    </button>
  );
}

function buildDocumentRequirementState(documentTypes, rowsByType, pendingFilesByRowId) {
  const items = (Array.isArray(documentTypes) ? documentTypes : [])
    .filter((dt) => dt?.is_attachment_only !== true)
    .map((dt) => {
    const allRows = rowsByType?.[dt.document_type_key] || [];
    const model = buildDisplayModel(allRows);
    const hasQueuedFile = allRows.some((row) => Boolean(pendingFilesByRowId?.[row.document_id]));
    const hasActiveFile = model.active.some(({ main }) => Boolean(main?.has_file));
    const present = hasActiveFile || hasQueuedFile;

    return {
      document_type_key: dt.document_type_key,
      document_type_name: dt.document_type_name,
      section_key: dt.section_key || "overig",
      is_required: dt.is_required === true,
      is_missing_required: dt.is_required === true && !present,
      is_present_required: dt.is_required === true && present,
      present,
      active_count: model.active.length,
      archived_count: model.archived.length,
      queued_count: allRows.filter((row) => pendingFilesByRowId?.[row.document_id]).length,
    };
  });

  const requiredItems = items.filter((item) => item.is_required);
  const missingRequiredItems = requiredItems.filter((item) => item.is_missing_required);
  const queuedCount = items.reduce((sum, item) => sum + Number(item.queued_count || 0), 0);

  return {
    items,
    requiredItems,
    missingRequiredItems,
    requiredCount: requiredItems.length,
    missingRequiredCount: missingRequiredItems.length,
    queuedCount,
    allRequiredPresent: requiredItems.length > 0 && missingRequiredItems.length === 0,
  };
}

function BulkUploadModal({
  open,
  documentTypes,
  items,
  onAddFiles,
  onUpdateItem,
  onRemoveItem,
  onClose,
  onConfirm,
  saveBusy = false,
  readOnly = false,
}) {
  const inputRef = useRef(null);

  if (!open) return null;

  const canConfirm = items.length > 0 && items.every((item) => String(item.document_type_key || "").trim());
  const hasItems = items.length > 0;

  return (
    <div className="doc-bulk-modal-backdrop" onClick={onClose}>
      <div className="card doc-bulk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="doc-bulk-modal__head">
          <div>
            <div className="doc-bulk-modal__title">Bulk-bestanden toevoegen</div>
            <div className="muted doc-bulk-modal__subtitle">
              Kies per bestand het documenttype; na bevestigen worden de bestanden direct opgeslagen en geüpload.
            </div>
          </div>

          <div className="doc-inline-actions">
            <button type="button" className="btn btn-secondary" onClick={() => openNativeFilePicker(inputRef.current)}>
              Bladeren
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Sluiten
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            if (files.length) onAddFiles?.(files);
          }}
        />

        <ClickableDropBar
          title={hasItems ? "Voeg meer bestanden toe" : "Sleep bestanden hierheen"}
          subtitle="Je kunt hier één of meerdere bestanden tegelijk neerzetten"
          onClick={() => openNativeFilePicker(inputRef.current)}
          onDragOver={(e) => {
            if (!isFileDragEvent(e)) return;
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (!isFileDragEvent(e)) return;
            e.preventDefault();
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length) onAddFiles?.(files);
          }}
        />

        <div className="doc-bulk-list">
          {items.length === 0 ? (
            <div className="muted doc-empty-box">Nog geen bestanden gekozen.</div>
          ) : (
            items.map((item) => {
              const blocked = !String(item.document_type_key || "").trim();

              return (
              <div
                key={item.id}
                className={cx(
                  "doc-bulk-item",
                  blocked && "doc-bulk-item--blocked"
                )}
              >
                <div className="doc-bulk-item__meta">
                  <div className="doc-bulk-item__meta-copy">
                    <div className="doc-bulk-item__name">{item.file?.name || "Bestand"}</div>
                    <div className="muted doc-bulk-item__sub">{formatBytes(item.file?.size)}</div>
                  </div>
                  <div className="doc-bulk-item__badges">
                    {blocked ? <StatusChip tone="warning">Kies documenttype</StatusChip> : null}
                    {item.prefilled_date ? (
                      <span className="ember-label ember-label--muted doc-bulk-prefill-chip">
                        Datum vooringevuld; vandaag
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="doc-bulk-item__fields">
                  <select
                    className="input"
                    value={item.document_type_key}
                    onChange={(e) => onUpdateItem?.(item.id, { document_type_key: e.target.value })}
                    disabled={readOnly}
                  >
                    <option value="">Kies documenttype</option>
                    {documentTypes.map((dt) => (
                      <option key={dt.document_type_key} value={dt.document_type_key}>
                        {dt.document_type_name}
                      </option>
                    ))}
                  </select>

                  <input
                    className="input"
                    value={item.title}
                    onChange={(e) => onUpdateItem?.(item.id, { title: e.target.value })}
                    placeholder="Titel"
                    disabled={readOnly}
                  />

                  <input
                    className="input"
                    value={item.document_number}
                    onChange={(e) => onUpdateItem?.(item.id, { document_number: e.target.value })}
                    placeholder="Nummer"
                    disabled={readOnly}
                  />

                  <input
                    className={cx("input", item.prefilled_date && "doc-bulk-date-input--prefilled")}
                    type="date"
                    value={item.document_date || ""}
                    onChange={(e) =>
                      onUpdateItem?.(item.id, {
                        document_date: e.target.value || null,
                        prefilled_date: false,
                      })
                    }
                    disabled={readOnly}
                  />

                  <input
                    className="input"
                    value={item.revision}
                    onChange={(e) => onUpdateItem?.(item.id, { revision: e.target.value })}
                    placeholder="Revisie"
                    disabled={readOnly}
                  />

                  <button type="button" className="btn btn-secondary" onClick={() => onRemoveItem?.(item.id)}>
                    Verwijderen
                  </button>
                </div>
              </div>
            );
            })
          )}
        </div>

        <div className="doc-bulk-modal__foot">
          <div className="muted doc-text-sm">
            {items.length} bestand(en) klaar; na bevestigen wordt de wachtrij direct opgeslagen.
          </div>
          <div className="doc-inline-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuleren
            </button>
            <button type="button" className="btn" disabled={!canConfirm || readOnly || saveBusy} onClick={onConfirm}>
              Toevoegen en opslaan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DocumentsTab = forwardRef(function DocumentsTab(
  {
    code,
    docs,
    catalog,
    onDirtyChange,
    onSavingChange,
    onSaveOk,
    onSaved,
    onAnyOpenChange,
    readOnly = false,
  },
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
  const [viewFilter, setViewFilter] = useState("all");
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState([]);
  const [bulkAutoSavePending, setBulkAutoSavePending] = useState(false);

  const sectionToggleIconRefs = useRef({});
  const typeFileInputRefs = useRef({});
  const uploadInputRefs = useRef({});
  const replaceInputRefs = useRef({});
  const attachInputRefs = useRef({});
  const rowRefs = useRef({});
  const bulkPickerRef = useRef(null);
  const bulkActionIconRef = useRef(null);

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

  const catalogDocumentTypes = useMemo(() => {
    return Array.isArray(catalog?.documentTypes) ? catalog.documentTypes : [];
  }, [catalog]);

  const documentTypes = useMemo(() => {
    const list = catalogDocumentTypes || [];

    return list
      .filter((dt) => dt && dt.is_active !== false && dt.is_attachment_only !== true)
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
  }, [catalogDocumentTypes, sectionOrderByKey]);

  const attachmentTypeOptionsByParent = useMemo(() => {
    const map = new Map();

    for (const dt of catalogDocumentTypes) {
      if (!dt || dt.is_active === false || dt.is_attachment_only !== true) continue;

      const parentKeys = Array.isArray(dt.attachment_parent_type_keys)
        ? dt.attachment_parent_type_keys.map((x) => String(x || "").trim()).filter(Boolean)
        : [];

      for (const parentTypeKey of parentKeys) {
        const arr = map.get(parentTypeKey) || [];
        arr.push(dt);
        map.set(parentTypeKey, arr);
      }
    }

    return map;
  }, [catalogDocumentTypes]);

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
        if (next[dt.document_type_key] === undefined) next[dt.document_type_key] = false;
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
    setBulkItems([]);
  }, [catalog, docs, documentTypes]);

  useEffect(() => {
    if (!accentRowId) return;

    const timer = window.setTimeout(() => {
      setAccentRowId((cur) => (cur === accentRowId ? null : cur));
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [accentRowId]);

  const anyDirty = useMemo(() => Object.values(dirtyRows).some(Boolean), [dirtyRows]);
  const requirementState = useMemo(() => {
    return buildDocumentRequirementState(documentTypes, rowsByType, pendingFilesByRowId);
  }, [documentTypes, rowsByType, pendingFilesByRowId]);

  useEffect(() => {
    onDirtyChange?.(readOnly ? false : anyDirty);
  }, [anyDirty, onDirtyChange, readOnly]);

  useEffect(() => {
    onSavingChange?.(saving || Boolean(actionBusyKey));
  }, [saving, actionBusyKey, onSavingChange]);

  useEffect(() => {
    if (!bulkAutoSavePending || readOnly || saving) return;
    if (Object.keys(pendingFilesByRowId || {}).length === 0) {
      setBulkAutoSavePending(false);
      return;
    }

    setBulkAutoSavePending(false);
    void save();
  }, [bulkAutoSavePending, pendingFilesByRowId, readOnly, saving]);

  function accentAndScrollRow(rowId, behavior = "smooth") {
    if (!rowId) return;
    setAccentRowId(String(rowId));

    window.setTimeout(() => {
      const el = rowRefs.current[String(rowId)];
      if (!el) return;
      el.scrollIntoView({ behavior, block: "center", inline: "nearest" });
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
    if (readOnly) return;
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
    if (readOnly) return null;
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
    if (readOnly) return [];
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

  function buildBulkItemsFromFiles(files) {
    return Array.from(files || [])
      .filter(Boolean)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        document_type_key: "",
        title: fileBaseName(file.name),
        document_number: "",
        document_date: todayIsoDate(),
        revision: "",
        note: "",
        prefilled_date: true,
      }));
  }

  function appendBulkFiles(files) {
    const nextItems = buildBulkItemsFromFiles(files);
    if (!nextItems.length) return;

    setBulkItems((prev) => [...prev, ...nextItems]);
    setBulkModalOpen(true);
  }

  function updateBulkItem(itemId, patch) {
    setBulkItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          ...patch,
        };
      })
    );
  }

  function removeBulkItem(itemId) {
    setBulkItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  function queueSingleDraft(typeKey, file, overrides = {}) {
    if (readOnly || !file) return null;

    const draft = newDraft(typeKey, {
      title: fileBaseName(file.name),
      file_name: file.name,
      ...overrides,
    });

    setRowsByType((prev) => {
      const arr = prev[typeKey] || [];
      return { ...prev, [typeKey]: [draft, ...arr] };
    });

    setDirtyRows((prev) => ({ ...prev, [draft.document_id]: true }));
    setDirtyFields((prev) => ({
      ...prev,
      [draft.document_id]: {
        title: true,
        ...(overrides.document_number ? { document_number: true } : {}),
        ...(overrides.document_date ? { document_date: true } : {}),
        ...(overrides.revision ? { revision: true } : {}),
        ...(overrides.note ? { note: true } : {}),
      },
    }));

    setPendingFilesByRowId((prev) => ({ ...prev, [draft.document_id]: file }));
    setRowStatus(draft.document_id, "queued", "Wordt geüpload bij opslaan");
    openSectionForType(typeKey);
    setDetailOpenMap((prev) => ({ ...prev, [`editor:${draft.document_id}`]: true }));
    return draft.document_id;
  }

  function applyBulkQueue() {
    if (readOnly) return;

    const readyItems = bulkItems.filter((item) => String(item.document_type_key || "").trim());
    if (!readyItems.length) return;

    let firstRowId = null;

    for (const item of readyItems) {
      const rowId = queueSingleDraft(item.document_type_key, item.file, {
        title: item.title || fileBaseName(item.file?.name),
        document_number: item.document_number || "",
        document_date: item.document_date || null,
        revision: item.revision || "",
        note: item.note || "",
      });

      if (!firstRowId && rowId) firstRowId = rowId;
    }

    setBulkItems([]);
    setBulkModalOpen(false);
    setBulkAutoSavePending(true);

    if (firstRowId) accentAndScrollRow(firstRowId, "smooth");
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
    if (readOnly) return false;
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

      if (!hasMetadataChanges && !hasQueuedFiles) return true;

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
            for (const item of queuedEntries) delete next[item.rowId];
            return next;
          });

          setRowStatusById((prev) => {
            const next = { ...prev };
            for (const item of queuedEntries) delete next[item.rowId];
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

    if (!isNew && !isDirty) return rowId;

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
      const fileName = result.fileName || row.file_name || row.title || "document";

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
    if (readOnly || !file) return;

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
    if (readOnly) return;
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

      if (firstPersistedId) accentAndScrollRow(firstPersistedId, "smooth");
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
    if (readOnly) return;
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
    if (readOnly) return;
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    setError(null);
    setActionBusyKey(`attach:${row.document_id}`);

    try {
      const persistedId = await ensurePersistedRow(typeKey, row);
      if (!persistedId) return;

      let firstAttachmentId = null;

      for (const file of list) {
        const attachmentTypeOptions =
          attachmentTypeOptionsByParent.get(String(row?.document_type_key || "").trim()) || [];

        if (attachmentTypeOptions.length > 1) {
          throw new Error(
            `meerdere bijlage-documenttypes beschikbaar voor ${row?.title || row?.document_type_key || "dit document"}; kies eerst een specifiek bijlagetype in beheer`
          );
        }

        const attachmentTypeKey = attachmentTypeOptions[0]?.document_type_key || null;

        const created = await createInstallationDocumentAttachment(code, persistedId, {
          document_type_key: attachmentTypeKey,
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

  function focusDocumentType(typeKey) {
    const sectionKey = openSectionForType(typeKey);
    setViewFilter("all");

    window.setTimeout(() => {
      const el = document.querySelector(`[data-doc-type-key="${typeKey}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }, sectionKey ? 120 : 80);
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

  useImperativeHandle(ref, () => ({ save, expandAll, collapseAll }), [
    rowsByType,
    dirtyRows,
    grouped,
    documentTypes,
  ]);

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

  const visibleGrouped = useMemo(() => {
    if (viewFilter !== "missing_required") return grouped;

    const missingKeys = new Set(
      requirementState.missingRequiredItems.map((item) => item.document_type_key)
    );

    return grouped
      .map((group) => ({
        ...group,
        types: group.types.filter((type) => missingKeys.has(type.document_type_key)),
      }))
      .filter((group) => group.types.length > 0);
  }, [grouped, requirementState, viewFilter]);

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
    const tone = getCardTone(row);
    const actionDisabled = readOnly || Boolean(actionBusyKey);

    return (
      <div
        key={row.document_id}
        ref={(el) => {
          rowRefs.current[String(row.document_id)] = el;
        }}
        className={cx(
          "doc-card",
          compact && "doc-card--compact",
          `doc-card--${tone}`
        )}
      >
        <div className="doc-card__inner">
          <div className="doc-card__summary-grid">
            <div
              className="doc-card__summary"
              onClick={() =>
                setDetailOpenMap((m) => ({
                  ...m,
                  [editorKey]: !editorOpen,
                }))
              }
              title={editorOpen ? "details inklappen" : "details uitklappen"}
            >
              <FileOpenIconButton
                hasFile={row.has_file}
                disabled={actionDisabled}
                onClick={() => handleOpenDocument(row)}
              />

              <div className="doc-card__main">
                <div className="doc-card__title-row">
                  <div className="doc-card__title">{summary.title}</div>

                  <div className="doc-card__labels">
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
                    {row.document_type_key && row.document_type_key !== typeKey && row.document_type_name ? (
                      <StatusChip tone="neutral">{row.document_type_name}</StatusChip>
                    ) : null}
                    {row.document_number ? <StatusChip tone="neutral">Nr; {row.document_number}</StatusChip> : null}
                    {row.revision ? <StatusChip tone="neutral">Rev; {row.revision}</StatusChip> : null}
                    {row.document_date ? <StatusChip tone="neutral">Datum; {isoDate(row.document_date)}</StatusChip> : null}
                  </div>
                </div>

                <div className={cx("muted", "doc-card__subtitle", compact && "doc-card__subtitle--wrap")}>
                  {summary.sub || " "}
                </div>
              </div>
            </div>

            <div className="doc-card__actions">
              {canOpen && (
                <AnimatedActionButton
                  title="openen"
                  Icon={FileTextIcon}
                  onClick={() => handleOpenDocument(row)}
                  disabled={actionDisabled}
                >
                  openen
                </AnimatedActionButton>
              )}

              {canOpen && (
                <AnimatedActionButton
                  title="downloaden"
                  Icon={DownloadIcon}
                  onClick={() => handleDownloadDocument(row)}
                  disabled={actionDisabled}
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
                disabled={actionDisabled}
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
                  disabled={readOnly}
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
                  disabled={readOnly}
                >
                  actief
                </AnimatedActionButton>
              )}
            </div>
          </div>

          {editorOpen && (
            <div className="doc-card__editor">
              <div className="doc-card__form-grid">
                <div className="doc-field">
                  {fieldLabel("titel", Boolean(df.title))}
                  <input
                    className="cf-input"
                    value={row.title}
                    onChange={(e) => updateTitleAndFileName(typeKey, row, e.target.value)}
                    placeholder="titel"
                    disabled={readOnly}
                  />
                </div>

                <div className="doc-field">
                  {fieldLabel("nummer", Boolean(df.document_number))}
                  <input
                    className="cf-input"
                    value={row.document_number}
                    onChange={(e) =>
                      setRow(typeKey, row.document_id, { document_number: e.target.value }, "document_number")
                    }
                    placeholder="nummer"
                    disabled={readOnly}
                  />
                </div>

                <div className="doc-field">
                  {fieldLabel("datum", Boolean(df.document_date))}
                  <input
                    className="cf-input"
                    type="date"
                    value={isoDate(row.document_date)}
                    onChange={(e) =>
                      setRow(typeKey, row.document_id, { document_date: e.target.value || null }, "document_date")
                    }
                    disabled={readOnly}
                  />
                </div>

                <div className="doc-field">
                  {fieldLabel("revisie/versie", Boolean(df.revision))}
                  <input
                    className="cf-input"
                    value={row.revision}
                    onChange={(e) => setRow(typeKey, row.document_id, { revision: e.target.value }, "revision")}
                    placeholder="bv; A"
                    disabled={readOnly}
                  />
                </div>

                <div className="doc-field doc-field--wide">
                  {fieldLabel("notitie", Boolean(df.note))}
                  <textarea
                    className="cf-input doc-textarea"
                    value={row.note}
                    onChange={(e) => setRow(typeKey, row.document_id, { note: e.target.value }, "note")}
                    placeholder="opmerking / context"
                    rows={2}
                    disabled={readOnly}
                  />
                </div>
              </div>

              {!row.has_file && (
                <div className="doc-action-stack">
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
                    onClick={() => {
                      if (readOnly) return;
                      openNativeFilePicker(uploadInputRefs.current[row.document_id]);
                    }}
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
                      if (!file || readOnly) return;

                      if (String(row.document_id || "").startsWith("new:") || dirtyRows[row.document_id]) {
                        setPendingFilesByRowId((m) => ({ ...m, [row.document_id]: file }));
                        setRowStatus(row.document_id, "queued", "Wordt geüpload bij opslaan");
                        return;
                      }

                      await handleUploadForRow(typeKey, row, file);
                    }}
                  />

                  {canUpload && (
                    <div className="doc-inline-actions">
                      <AnimatedActionButton
                        title="opslaan en uploaden"
                        Icon={RefreshCWIcon}
                        onClick={() => handleUploadForRow(typeKey, row, pendingFile)}
                        disabled={actionDisabled}
                      >
                        uploaden
                      </AnimatedActionButton>
                    </div>
                  )}
                </div>
              )}

              {row.has_file && (
                <div className="doc-action-stack">
                  <div className="doc-subtitle-strong">Bestandsacties</div>

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
                        onClick={() => {
                          if (readOnly) return;
                          openNativeFilePicker(replaceInputRefs.current[row.document_id]);
                        }}
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
                          if (!file || readOnly) return;

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
                        title="Bijlage aan dit document toevoegen"
                        subtitle="Wordt gekoppeld aan dit document; sleep bestanden hierheen of klik om te bladeren"
                        isDragOver={isAttachDragOver}
                        onClick={() => {
                          if (readOnly) return;
                          openNativeFilePicker(attachInputRefs.current[row.document_id]);
                        }}
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
                          if (!files?.length || readOnly) return;

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
      className="documents-tab"
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
        if (readOnly) return;
        appendBulkFiles(e.dataTransfer?.files);
      }}
    >
      <BulkUploadModal
        open={bulkModalOpen}
        documentTypes={documentTypes}
        items={bulkItems}
        onAddFiles={appendBulkFiles}
        onUpdateItem={updateBulkItem}
        onRemoveItem={removeBulkItem}
        onClose={() => {
          setBulkItems([]);
          setBulkModalOpen(false);
          setBulkAutoSavePending(false);
        }}
        onConfirm={applyBulkQueue}
        saveBusy={saving}
        readOnly={readOnly}
      />

      {error ? <p className="ember-error-text doc-error">{error}</p> : null}

      <div className="card doc-status-rail">
        <div className="doc-status-rail__summary">
          <div className="ember-label-row admin-inline-labels">
            {requirementState.requiredCount > 0 ? (
              requirementState.missingRequiredCount === 0 ? (
                <span className="ember-label ember-label--success">Verplichte documenten compleet</span>
              ) : (
                <span className="ember-label ember-label--danger doc-required-status-tag">
                  {requirementState.missingRequiredCount === 1
                    ? "1 verplicht document ontbreekt"
                    : `${requirementState.missingRequiredCount} verplichte documenten ontbreken`}
                </span>
              )
            ) : (
              <span className="ember-label ember-label--muted">Geen verplichte documenten</span>
            )}

            {requirementState.queuedCount > 0 ? (
              <span className="ember-label ember-label--warning">
                {requirementState.queuedCount} bestand(en) in wachtrij
              </span>
            ) : null}
          </div>
        </div>

        <div className="doc-status-rail__actions">
          <button
            type="button"
            className={cx("btn btn-secondary", viewFilter === "all" && "ember-accent-active")}
            onClick={() => setViewFilter("all")}
          >
            Alles
          </button>
          <button
            type="button"
            className={cx("btn btn-secondary", viewFilter === "missing_required" && "ember-accent-active")}
            onClick={() => setViewFilter("missing_required")}
          >
            Ontbrekende verplichte documenten
            {requirementState.missingRequiredCount > 0 ? ` (${requirementState.missingRequiredCount})` : ""}
          </button>
          <button
            type="button"
            className="btn"
            disabled={readOnly}
            onClick={() => {
              setBulkItems([]);
              openNativeFilePicker(bulkPickerRef.current);
            }}
            onMouseEnter={() => bulkActionIconRef.current?.startAnimation?.()}
            onMouseLeave={() => bulkActionIconRef.current?.stopAnimation?.()}
          >
            <FileStackIcon ref={bulkActionIconRef} size={16} className="doc-anim-icon" />
            Bulk-bestanden toevoegen
          </button>
          <input
            ref={bulkPickerRef}
            type="file"
            hidden
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length) appendBulkFiles(files);
            }}
          />
        </div>
      </div>

      {requirementState.missingRequiredCount > 0 && (
        <div className="card doc-required-alert">
          <div className="doc-required-alert__head">
            <div className="doc-required-alert__title">
              Ontbrekende verplichte documenten ({requirementState.missingRequiredCount})
            </div>
            <div className="muted doc-text-sm">
              Klik op een documenttype om direct naar de juiste plek in het dossier te springen.
            </div>
          </div>

          <div className="ember-label-row admin-inline-labels">
            {requirementState.missingRequiredItems.map((item) => (
              <button
                key={item.document_type_key}
                type="button"
                className="btn btn-secondary"
                onClick={() => focusDocumentType(item.document_type_key)}
              >
                {item.document_type_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {visibleGrouped.length === 0 && viewFilter === "missing_required" ? (
        <div className="card doc-help-card">
          <div className="doc-help-card__title">Geen ontbrekende verplichte documenten</div>
          <div className="muted doc-help-card__text">
            Voor deze installatie zijn alle verplichte documenten aanwezig of er zijn geen verplichte documenten ingesteld.
          </div>
        </div>
      ) : null}

      {visibleGrouped.map((g) => {
        const isOpen = Boolean(sectionOpenMap[g.section_key]);
        const sectionIsDragOver = dragOverSectionKey === g.section_key;
        const sectionQueuedFiles = sectionDropQueue[g.section_key] || [];

        const totals = g.types.reduce(
          (acc, dt) => {
            const typeKey = dt.document_type_key;
            const model = buildDisplayModel(rowsByType[typeKey] || []);
            acc.active += model.active.length;
            acc.archived += model.archived.length;
            const requirement = requirementState.items.find((item) => item.document_type_key === typeKey);
            if (requirement?.is_missing_required) acc.missingRequired += 1;
            return acc;
          },
          { active: 0, archived: 0, missingRequired: 0 }
        );

        const ToggleIcon = isOpen ? ChevronDownIcon : ChevronRightIcon;

        return (
          <div
            key={g.section_key}
            className={cx(
              "doc-section-shell",
              isOpen && "doc-section-shell--open",
              sectionIsDragOver && "doc-section-shell--drag"
            )}
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
              className="doc-section-toggle"
              onClick={() => setSectionOpenMap((m) => ({ ...m, [g.section_key]: !m[g.section_key] }))}
              onMouseEnter={() => animateSectionIcon(g.section_key)}
              onMouseLeave={() => stopSectionIcon(g.section_key)}
              title={isOpen ? "inklappen" : "uitklappen"}
            >
              <span className="doc-section-toggle__main">
                <span className="doc-section-toggle__title">{g.section?.section_name || g.section_key}</span>
                <span className="muted doc-section-toggle__meta">{totals.active} actief</span>
                <span className="muted doc-section-toggle__meta">{totals.archived} gearchiveerd</span>
                {totals.missingRequired > 0 ? (
                  <StatusChip tone="danger">
                    {totals.missingRequired === 1
                      ? "1 verplicht document ontbreekt"
                      : `${totals.missingRequired} verplichte documenten ontbreken`}
                  </StatusChip>
                ) : null}
                {sectionIsDragOver ? <StatusChip tone="info">Laat los om toe te voegen</StatusChip> : null}
              </span>

              <span className="doc-section-toggle__icon">
                <ToggleIcon
                  ref={(el) => {
                    sectionToggleIconRefs.current[g.section_key] = el;
                  }}
                  size={18}
                  className="nav-anim-icon"
                />
              </span>
            </button>

            {isOpen && (
              <div className="doc-section-body">
                {sectionQueuedFiles.length > 0 && g.types.length > 1 && (
                  <div className="card doc-queue-card">
                    <div className="doc-queue-card__title">Kies documenttype voor {sectionQueuedFiles.length} bestand(en)</div>
                    <div className="muted doc-text-sm">
                      Je hebt bestanden op de sectiebalk gedropt. Kies hieronder naar welk documenttype ze moeten.
                    </div>

                    <div className="doc-inline-actions">
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
                  const requirement = requirementState.items.find((item) => item.document_type_key === typeKey);
                  const isCollapsed = collapsedArchived[typeKey] !== false;
                  const queuedCount = all.filter((r) => pendingFilesByRowId[r.document_id]).length;
                  const isTypeDragOver = dragOverTypeKey === typeKey;
                  const isTypeOpen = typeOpenMap[typeKey] !== false;
                  const TypeToggleIcon = isTypeOpen ? ChevronDownIcon : ChevronRightIcon;

                  return (
                    <div
                      key={typeKey}
                      data-doc-type-key={typeKey}
                      className={cx(
                        "doc-type-card",
                        isTypeOpen && "doc-type-card--open",
                        isTypeDragOver && "doc-type-card--drag",
                        requirement?.is_missing_required && "doc-type-card--missing"
                      )}
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
                        className={cx("doc-type-head", isTypeOpen && "doc-type-head--open")}
                        onClick={() => setTypeOpenMap((m) => ({ ...m, [typeKey]: !isTypeOpen }))}
                        title={isTypeOpen ? "documenttype inklappen" : "documenttype uitklappen"}
                      >
                        <span className="doc-type-head__main">
                          <span className="doc-type-head__title-row">
                            <span className="doc-type-head__title">{dt.document_type_name}</span>
                            {requirement?.is_required ? (
                              requirement?.is_missing_required ? (
                                <StatusChip tone="danger">Verplicht ontbreekt</StatusChip>
                              ) : (
                                <StatusChip tone="success">Verplicht aanwezig</StatusChip>
                              )
                            ) : null}
                            {queuedCount > 0 ? <StatusChip tone="warning">{queuedCount} in wachtrij</StatusChip> : null}
                            {isTypeDragOver ? <StatusChip tone="info">Laat los om toe te voegen</StatusChip> : null}
                          </span>

                          <span className="muted doc-type-head__meta">
                            {active.length} actief ; {archived.length} gearchiveerd
                          </span>
                        </span>

                        <span className="doc-type-head__actions">
                          {queuedCount > 0 && (
                            <span onClick={(e) => e.stopPropagation()} className="doc-inline-block">
                              <AnimatedActionButton
                                title="wachtrij opslaan en uploaden"
                                Icon={RefreshCWIcon}
                                onClick={() => handleUploadQueuedForType(typeKey)}
                                disabled={readOnly || Boolean(actionBusyKey)}
                              >
                                upload wachtrij
                              </AnimatedActionButton>
                            </span>
                          )}

                          <span onClick={(e) => e.stopPropagation()} className="doc-inline-block">
                              <AnimatedActionButton
                                title="document toevoegen"
                                Icon={PlusIcon}
                                onClick={() => addRow(typeKey)}
                                disabled={readOnly || Boolean(actionBusyKey)}
                              >
                              toevoegen
                            </AnimatedActionButton>
                          </span>

                          <TypeToggleIcon size={18} className="nav-anim-icon" />
                        </span>
                      </button>

                      {isTypeOpen && (
                        <div className="doc-type-body">
                          <div className="doc-type-dropzone">
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
                                if (!files.length || readOnly) return;
                                addFilesAsDrafts(typeKey, files);
                              }}
                            />

                            <ClickableDropBar
                              title={`Sleep bestanden hierheen voor ${dt.document_type_name.toLowerCase()}`}
                              subtitle="Klik ook op deze balk om te bladeren op deze pc"
                              isDragOver={isTypeDragOver}
                              onClick={() => {
                                if (readOnly) return;
                                openNativeFilePicker(typeFileInputRefs.current[typeKey]);
                              }}
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
                                if (readOnly) return;
                                if (files?.length) addFilesAsDrafts(typeKey, files);
                              }}
                            />
                          </div>

                          {active.length > 0 ? (
                            <div className="doc-list">
                              {active.map(({ main, attachments, history }) => {
                                const historyOpenKey = `history:${main.document_id}`;
                                const attachmentsOpenKey = `attachments:${main.document_id}`;
                                const historyOpen = detailOpenMap[historyOpenKey] === true;
                                const attachmentsOpen = detailOpenMap[attachmentsOpenKey] === true;

                                return (
                                  <div key={main.document_id} className="doc-main-item">
                                    {renderDocumentCard(typeKey, main)}

                                    {(history.length > 0 || attachments.length > 0) && (
                                      <div className="doc-related-list">
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
                                              <div className="doc-nested-list">
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
                                              <div className="doc-nested-list">
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
                            <div className="muted doc-empty-box">
                              nog geen actief document
                            </div>
                          )}

                          {archived.length > 0 && (
                            <div className="doc-archive-section">
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
                                <div className="doc-list doc-list--archived">
                                  {archived.map(({ main, attachments, history }) => {
                                    const historyOpenKey = `history:${main.document_id}`;
                                    const attachmentsOpenKey = `attachments:${main.document_id}`;
                                    const historyOpen = detailOpenMap[historyOpenKey] === true;
                                    const attachmentsOpen = detailOpenMap[attachmentsOpenKey] === true;

                                    return (
                                      <div key={main.document_id} className="doc-main-item">
                                        {renderDocumentCard(typeKey, main)}

                                        {(history.length > 0 || attachments.length > 0) && (
                                          <div className="doc-related-list">
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
                                                  <div className="doc-nested-list">
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
                                                  <div className="doc-nested-list">
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
                        </div>
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
