// /src/pages/Installations/DocumentsTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { putDocuments } from "../../api/emberApi.js";

import { ArchiveIcon } from "@/components/ui/archive";
import { HistoryIcon } from "@/components/ui/history";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";

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
  { code, docs, catalog, onDirtyChange, onSavingChange, onSaveOk, onSaved, onAnyOpenChange },
  ref
) {
  const [rowsByType, setRowsByType] = useState({});
  const [dirtyRows, setDirtyRows] = useState({});
  const [dirtyFields, setDirtyFields] = useState({});
  const [collapsedArchived, setCollapsedArchived] = useState({});
  const [sectionOpenMap, setSectionOpenMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const sectionToggleIconRefs = useRef({}); // section_key -> iconRef

  const sectionsByKey = useMemo(() => {
    const map = new Map();
    for (const s of catalog?.sections || []) map.set(s.section_key, s);
    return map;
  }, [catalog]);

  // section_key -> sort_order (dbo.FormulierSectie.sort_order)
  const sectionOrderByKey = useMemo(() => {
    const map = new Map();
    for (const s of catalog?.sections || []) {
      const so = Number.isFinite(Number(s.sort_order)) ? Number(s.sort_order) : 999999;
      map.set(s.section_key, so);
    }
    return map;
  }, [catalog]);

  // document types from catalog (filtered by active + sorted using section sort_order)
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

        // type-level sort order (dbo.DocumentType.sort_order)
        const oa = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 999999;
        const ob = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 999999;
        if (oa !== ob) return oa - ob;

        const la = String(a.document_type_name || a.document_type_key || "");
        const lb = String(b.document_type_name || b.document_type_key || "");
        return la.localeCompare(lb);
      });
  }, [catalog, sectionOrderByKey]);

  // grouped by section, also sorted by section sort_order
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

  // init defaults: alle secties dicht
  useEffect(() => {
    setSectionOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) {
        if (next[g.section_key] === undefined) next[g.section_key] = false;
      }
      return next;
    });
  }, [grouped]);

  // notify parent: staat er iets open? (voor "Alles inklappen/uitklappen")
  useEffect(() => {
    const anyOpen = Object.values(sectionOpenMap).some(Boolean);
    onAnyOpenChange?.(anyOpen);
  }, [sectionOpenMap, onAnyOpenChange]);

  // rowsByType bouwen: catalog bepaalt welke types zichtbaar zijn; docs levert de bestaande documenten
  useEffect(() => {
    if (!catalog) return;

    const docsByType = new Map();
    for (const dt of docs?.documentTypes || []) {
      docsByType.set(dt.document_type_key, dt);
    }

    const next = {};
    const collapsed = {};

    for (const dt of documentTypes) {
      const typeKey = dt.document_type_key;

      const fromDocs = docsByType.get(typeKey);
      const docRows = (fromDocs?.documents || []).map((d) => ({
        document_id: d.document_id,
        document_type_key: d.document_type_key || typeKey,
        title: d.title ?? "",
        document_number: d.document_number ?? "",
        document_date: d.document_date ?? null,
        revision: d.revision ?? "",
        document_is_active: d.document_is_active ?? true,
      }));

      next[typeKey] = docRows;
      collapsed[typeKey] = true; // archived per type standaard dicht
    }

    setRowsByType(next);
    setDirtyRows({});
    setDirtyFields({});
    setCollapsedArchived((prev) => ({ ...collapsed, ...prev }));
    setError(null);
  }, [catalog, docs, documentTypes]);

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

    const dt = documentTypes.find((x) => x.document_type_key === typeKey);
    const sk = dt?.section_key || "overig";
    setSectionOpenMap((m) => ({ ...m, [sk]: true }));
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

  function expandAll() {
    setSectionOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) next[g.section_key] = true;
      return next;
    });
  }

  function collapseAll() {
    setSectionOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) next[g.section_key] = false;
      return next;
    });
  }

  useImperativeHandle(ref, () => ({ save, expandAll, collapseAll }), [rowsByType, dirtyRows, grouped]);

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

  function AnimatedActionButton({ title, onClick, Icon, children, className = "btn-ghost" }) {
    const iconRef = useRef(null);

    return (
      <button
        type="button"
        className={className}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
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

  if (!catalog) return <div className="muted">laden; catalog</div>;
  if (!docs) return <div className="muted">laden; documenten</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && <p style={{ color: "salmon", margin: 0 }}>{error}</p>}

      {grouped.map((g) => {
        const isOpen = Boolean(sectionOpenMap[g.section_key]);

        const totals = g.types.reduce(
          (acc, dt) => {
            const typeKey = dt.document_type_key;
            const all = rowsByType[typeKey] || [];
            acc.active += all.filter((r) => r.document_is_active).length;
            acc.archived += all.filter((r) => !r.document_is_active).length;
            return acc;
          },
          { active: 0, archived: 0 }
        );

        const ToggleIcon = isOpen ? ChevronDownIcon : ChevronRightIcon;

        return (
          <div
            key={g.section_key}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              overflow: "hidden",
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
                padding: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
              title={isOpen ? "inklappen" : "uitklappen"}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600 }}>{g.section?.section_name || g.section_key}</div>
                <div className="muted" style={{ whiteSpace: "nowrap" }}>
                  {totals.active} actief
                </div>
                <div className="muted" style={{ whiteSpace: "nowrap" }}>
                  {totals.archived} gearchiveerd
                </div>
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
              <div style={{ padding: 12, paddingTop: 0, display: "grid", gap: 12 }}>
                {g.types.map((dt) => {
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

                        <AnimatedActionButton title="document toevoegen" Icon={PlusIcon} onClick={() => addRow(typeKey)}>
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
                                        setRow(
                                          typeKey,
                                          r.document_id,
                                          { document_number: e.target.value },
                                          "document_number"
                                        )
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
                                        setRow(
                                          typeKey,
                                          r.document_id,
                                          { document_date: e.target.value || null },
                                          "document_date"
                                        )
                                      }
                                    />
                                  </div>

                                  <div>
                                    {fieldLabel("revisie/versie", Boolean(df.revision))}
                                    <input
                                      className="cf-input"
                                      value={r.revision}
                                      onChange={(e) =>
                                        setRow(typeKey, r.document_id, { revision: e.target.value }, "revision")
                                      }
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
                                            setRow(
                                              typeKey,
                                              r.document_id,
                                              { document_number: e.target.value },
                                              "document_number"
                                            )
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
                                            setRow(
                                              typeKey,
                                              r.document_id,
                                              { document_date: e.target.value || null },
                                              "document_date"
                                            )
                                          }
                                        />
                                      </div>

                                      <div>
                                        {fieldLabel("revisie/versie", Boolean(df.revision))}
                                        <input
                                          className="cf-input"
                                          value={r.revision}
                                          onChange={(e) =>
                                            setRow(typeKey, r.document_id, { revision: e.target.value }, "revision")
                                          }
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
            )}
          </div>
        );
      })}
    </div>
  );
});

export default DocumentsTab;
