// /src/pages/Installations/DocumentsTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {  ChevronDown, ChevronRight } from "lucide-react";
import { putDocuments } from "../../api/emberApi.js";
import { ArchiveIcon } from "@/components/ui/archive";
import { HistoryIcon } from "@/components/ui/history";
import { PlusIcon } from "@/components/ui/plus";



function isoDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function newDraft(typeKey) {
  return {
    document_id: `new:${crypto.randomUUID()}`,
    document_type_key: typeKey,
    title: "",
    document_number: "",
    document_date: null,
    revision: "",
    document_is_active: true,
  };
}

const DocumentsTab = forwardRef(function DocumentsTab(
  { code, docs, onDirtyChange, onSavingChange, onSaveOk, onSaved },
  ref
) {
  const [rowsByType, setRowsByType] = useState({});
  const [dirtyRows, setDirtyRows] = useState({});
  const [dirtyFields, setDirtyFields] = useState({});
  const [collapsedArchived, setCollapsedArchived] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const documentTypes = docs?.documentTypes || [];

  useEffect(() => {
    if (!docs) return;

    const next = {};
    const collapsed = {};

    for (const dt of documentTypes) {
      const typeKey = dt.document_type_key;

      next[typeKey] = (dt.documents || []).map((d) => ({
        document_id: d.document_id,
        document_type_key: d.document_type_key || typeKey,
        title: d.title ?? "",
        document_number: d.document_number ?? "",
        document_date: d.document_date ?? null,
        revision: d.revision ?? "",
        document_is_active: d.document_is_active ?? true,
      }));

      collapsed[typeKey] = true;
    }

    setRowsByType(next);
    setDirtyRows({});
    setDirtyFields({});
    setCollapsedArchived((prev) => ({ ...collapsed, ...prev }));
    setError(null);
  }, [docs, documentTypes]);

  const anyDirty = useMemo(() => Object.values(dirtyRows).some(Boolean), [dirtyRows]);

  useEffect(() => {
    onDirtyChange?.(anyDirty);
  }, [anyDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

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


  function addRow(typeKey) {
    const draft = newDraft(typeKey);
    setRowsByType((prev) => {
      const arr = prev[typeKey] || [];
      return { ...prev, [typeKey]: [draft, ...arr] };
    });
    setDirtyRows((m) => ({ ...m, [draft.document_id]: true }));
    setDirtyFields((m) => ({ ...m, [draft.document_id]: { title: true } }));
  }

  async function save() {
    setError(null);
    setSaving(true);

    try {
      const changed = [];
      for (const typeKey of Object.keys(rowsByType)) {
        for (const r of rowsByType[typeKey] || []) {
          if (!dirtyRows[r.document_id]) continue;

          changed.push({
            document_id: r.document_id?.startsWith("new:") ? null : r.document_id,
            document_type_key: r.document_type_key,
            title: r.title || null,
            document_number: r.document_number || null,
            document_date: r.document_date || null,
            revision: r.revision || null,
            is_active: Boolean(r.document_is_active),
          });
        }
      }

      if (changed.length === 0) return;

      await putDocuments(code, changed);

      setDirtyRows({});
      setDirtyFields({});
      onSaveOk?.();
      await onSaved?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }), [rowsByType, dirtyRows]);

  function fieldLabel(text, isDirty) {
    return (
      <div className="cf-label">
        <span className="cf-label-text">{text}</span>
        <span className={`dot ${isDirty ? "dirty" : ""}`} />
      </div>
    );
  }

  function AnimatedActionButton({ title, onClick, Icon, children, className = "btn-ghost" }) {
    const iconRef = useRef(null);

    return (
      <button
        type="button"
        className={className}
        title={title}
        onClick={onClick}
        onMouseEnter={() => iconRef.current?.startAnimation?.()}
        onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      >
        <Icon ref={iconRef} size={16} className="doc-anim-icon" />
        {children}
      </button>
    );
  }


  if (!docs) return null;

  return (
    <div className="doc-list">
      {error && <p style={{ color: "salmon", margin: 0 }}>{error}</p>}

      {documentTypes.map((dt) => {
        const typeKey = dt.document_type_key;
        const all = rowsByType[typeKey] || [];

        const active = all.filter((r) => r.document_is_active);
        const archived = all.filter((r) => !r.document_is_active);

        const isCollapsed = collapsedArchived[typeKey] !== false;

        return (
          <div key={typeKey} className="doc-type">
            <div className="doc-type-head">
              <div className="doc-type-title">
                <div className="doc-type-name">{dt.document_type_name}</div>
                <div className="doc-type-meta">
                  {active.length} actief; {archived.length} gearchiveerd
                </div>
              </div>

              <AnimatedActionButton
                title="document toevoegen"
                Icon={PlusIcon}
                onClick={() => addRow(typeKey)}
              >
                toevoegen
              </AnimatedActionButton>

            </div>

            {active.length > 0 && (
              <div className="doc-list">
                {active.map((r) => {
                  const df = dirtyFields[r.document_id] || {};

                  return (
                    <div key={r.document_id} className="doc-row">
                      <div className="doc-row-grid">
                        <div>
                          {fieldLabel("titel", Boolean(df.title))}
                          <input
                            className="cf-input"
                            value={r.title}
                            onChange={(e) => setRow(typeKey, r.document_id, { title: e.target.value }, "title")}
                            placeholder="titel"
                          />
                        </div>

                        <div>
                          {fieldLabel("nummer", Boolean(df.document_number))}
                          <input
                            className="cf-input"
                            value={r.document_number}
                            onChange={(e) =>
                              setRow(typeKey, r.document_id, { document_number: e.target.value }, "document_number")
                            }
                            placeholder="nummer"
                          />
                        </div>

                        <div>
                          {fieldLabel("datum", Boolean(df.document_date))}
                          <input
                            className="cf-input"
                            type="date"
                            value={isoDate(r.document_date)}
                            onChange={(e) =>
                              setRow(typeKey, r.document_id, { document_date: e.target.value || null }, "document_date")
                            }
                          />
                        </div>

                        <div>
                          {fieldLabel("revisie/versie", Boolean(df.revision))}
                          <input
                            className="cf-input"
                            value={r.revision}
                            onChange={(e) => setRow(typeKey, r.document_id, { revision: e.target.value }, "revision")}
                            placeholder="bv; A"
                          />
                        </div>

                        <div>
                          {fieldLabel("status", Boolean(df.document_is_active))}
                          <AnimatedActionButton
                            title="archiveren"
                            Icon={ArchiveIcon}
                            onClick={() => {
                              setRow(typeKey, r.document_id, { document_is_active: false }, "document_is_active");
                              setCollapsedArchived((m) => ({ ...m, [typeKey]: false }));
                            }}
                          >
                            archiveren
                          </AnimatedActionButton>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {active.length === 0 && (
              <div className="muted" style={{ fontSize: 13 }}>
                nog geen actief document
              </div>
            )}

            {archived.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="doc-archive-toggle"
                  onClick={() => setCollapsedArchived((m) => ({ ...m, [typeKey]: !m[typeKey] }))}
                  title={isCollapsed ? "toon gearchiveerd" : "verberg gearchiveerd"}
                >
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  gearchiveerd ({archived.length})
                </button>

                {!isCollapsed && (
                  <div className="doc-list" style={{ marginTop: 8 }}>
                    {archived.map((r) => {
                      const df = dirtyFields[r.document_id] || {};

                      return (
                        <div key={r.document_id} className="doc-row doc-archived">
                          <div className="doc-row-grid">
                            <div>
                              {fieldLabel("titel", Boolean(df.title))}
                              <input
                                className="cf-input"
                                value={r.title}
                                onChange={(e) => setRow(typeKey, r.document_id, { title: e.target.value }, "title")}
                                placeholder="titel"
                              />
                            </div>

                            <div>
                              {fieldLabel("nummer", Boolean(df.document_number))}
                              <input
                                className="cf-input"
                                value={r.document_number}
                                onChange={(e) =>
                                  setRow(typeKey, r.document_id, { document_number: e.target.value }, "document_number")
                                }
                                placeholder="nummer"
                              />
                            </div>

                            <div>
                              {fieldLabel("datum", Boolean(df.document_date))}
                              <input
                                className="cf-input"
                                type="date"
                                value={isoDate(r.document_date)}
                                onChange={(e) =>
                                  setRow(typeKey, r.document_id, { document_date: e.target.value || null }, "document_date")
                                }
                              />
                            </div>

                            <div>
                              {fieldLabel("revisie/versie", Boolean(df.revision))}
                              <input
                                className="cf-input"
                                value={r.revision}
                                onChange={(e) => setRow(typeKey, r.document_id, { revision: e.target.value }, "revision")}
                                placeholder="bv; A"
                              />
                            </div>

                            <div>
                              {fieldLabel("status", Boolean(df.document_is_active))}
                              <AnimatedActionButton
                                title="actief maken"
                                Icon={HistoryIcon}
                                onClick={() => {
                                  setRow(typeKey, r.document_id, { document_is_active: true }, "document_is_active");
                                }}
                              >
                                actief maken
                              </AnimatedActionButton>

                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default DocumentsTab;