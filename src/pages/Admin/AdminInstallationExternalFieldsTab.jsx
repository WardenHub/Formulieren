// src/pages/Admin/AdminInstallationExternalFieldsTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";
import { ArrowUpIcon } from "@/components/ui/arrow-up";
import { ArrowDownIcon } from "@/components/ui/arrow-down";

function buildDraft(catalog) {
  const externalFields = Array.isArray(catalog?.externalFields)
    ? catalog.externalFields
        .map((x, index) => ({
          field_key: x.field_key ?? "",
          label: x.label ?? "",
          section_key: x.section_key ?? "",
          sort_order: x.sort_order ?? (index + 1) * 10,
          is_active: x.is_active ?? true,
          source_type: x.source_type ?? "fabric",
          fabric_table: x.fabric_table ?? "",
          fabric_column: x.fabric_column ?? "",
          notes: x.notes ?? "",
        }))
        .sort((a, b) => {
          const sa = Number(a?.sort_order ?? 0);
          const sb = Number(b?.sort_order ?? 0);
          if (sa !== sb) return sa - sb;
          return String(a?.label || "").localeCompare(String(b?.label || ""));
        })
    : [];

  return externalFields;
}

function normalizeNumber(value, fallback = null) {
  if (value === "" || value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function reindex(items) {
  return items.map((row, index) => ({
    ...row,
    sort_order: (index + 1) * 10,
  }));
}

function statusBadge(isActive) {
  return isActive ? (
    <span className="admin-status-badge admin-status-badge--active">
      <span className="admin-status-dot admin-status-dot--active" />
      Ja
    </span>
  ) : (
    <span className="admin-status-badge admin-status-badge--inactive">
      <span className="admin-status-dot admin-status-dot--inactive" />
      Nee
    </span>
  );
}

const AdminInstallationExternalFieldsTab = forwardRef(function AdminInstallationExternalFieldsTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSave },
  ref
) {
  const addIconRef = useRef(null);
  const upIconRefs = useRef({});
  const downIconRefs = useRef({});

  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [openSectionKeys, setOpenSectionKeys] = useState({});
  const [openFieldKeys, setOpenFieldKeys] = useState({});

  useEffect(() => {
    const next = buildDraft(catalog);
    setDraft(next);

    setOpenSectionKeys((prev) => {
      const nextMap = { ...prev };
      for (const row of next) {
        const key = row.section_key || "__unassigned__";
        if (nextMap[key] === undefined) nextMap[key] = false;
      }
      return nextMap;
    });

    setOpenFieldKeys((prev) => {
      const nextMap = { ...prev };
      for (const row of next) {
        const key = row.field_key || `__field_${row.label || "new"}`;
        if (nextMap[key] === undefined) nextMap[key] = false;
      }
      return nextMap;
    });
  }, [catalog]);

  const baseSnapshot = useMemo(() => JSON.stringify(buildDraft(catalog)), [catalog]);
  const currentSnapshot = useMemo(() => JSON.stringify(draft), [draft]);
  const isDirty = baseSnapshot !== currentSnapshot;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  const sections = Array.isArray(catalog?.sections) ? catalog.sections : [];

  const groupedSections = useMemo(() => {
    const sectionMap = new Map();

    for (const s of sections) {
      const key = s.section_key || "__unassigned__";
      sectionMap.set(key, {
        section: s,
        fields: [],
      });
    }

    for (const field of draft) {
      const key = field.section_key || "__unassigned__";
      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          section: {
            section_key: "",
            section_name: key === "__unassigned__" ? "Zonder sectie" : key,
            section_description: "",
            sort_order: 999999,
          },
          fields: [],
        });
      }
      sectionMap.get(key).fields.push(field);
    }

    return Array.from(sectionMap.values()).sort((a, b) => {
      const sa = Number(a?.section?.sort_order ?? 999999);
      const sb = Number(b?.section?.sort_order ?? 999999);
      if (sa !== sb) return sa - sb;
      return String(a?.section?.section_name || "").localeCompare(String(b?.section?.section_name || ""));
    });
  }, [sections, draft]);

  function setRow(index, patch) {
    setDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function confirmTechnicalChange(row, fieldLabel, oldValue, nextValue) {
    if (String(oldValue ?? "") === String(nextValue ?? "")) return true;

    return window.confirm(
      `Weet je zeker dat je ${fieldLabel} wilt aanpassen voor "${row.label || row.field_key || "nieuw veld"}"?\n\n` +
      `Huidig: ${oldValue ?? "(leeg)"}\n` +
      `Nieuw: ${nextValue ?? "(leeg)"}`
    );
  }

  function handleTechnicalFieldChange(index, fieldName, nextValue, fieldLabel) {
    const row = draft[index];
    if (!row) return;

    const currentValue = row[fieldName];
    const ok = confirmTechnicalChange(row, fieldLabel, currentValue, nextValue);
    if (!ok) return;

    setRow(index, { [fieldName]: nextValue });
  }

  function handleActiveChange(index, nextValue) {
    const row = draft[index];
    const nextActive = Boolean(nextValue);

    if (row?.is_active && !nextActive) {
      const ok = window.confirm(
        `Weet je zeker dat je Atriumveld "${row.label || row.field_key || "nieuw veld"}" inactief wilt maken?`
      );
      if (!ok) return;
    }

    setRow(index, { is_active: nextActive });
  }

  function moveRow(index, direction) {
    setDraft((prev) => {
      const arr = [...prev];
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= arr.length) return prev;

      const swap = arr[nextIndex];
      arr[nextIndex] = arr[index];
      arr[index] = swap;

      return reindex(arr);
    });
  }

  function addRow() {
    setDraft((prev) => [
      ...prev,
      {
        field_key: "",
        label: "",
        section_key: "",
        sort_order: (prev.length + 1) * 10,
        is_active: true,
        source_type: "fabric",
        fabric_table: "AtriumInstallationBase",
        fabric_column: "",
        notes: "",
      },
    ]);
  }

  async function save() {
    if (saving || !isDirty) return;

    setSaving(true);
    try {
      const payload = draft.map((row, index) => ({
        ...row,
        sort_order: normalizeNumber(row.sort_order, (index + 1) * 10),
      }));

      await onSave?.(payload);
      onSaveOk?.();
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  if (loading && draft.length === 0) {
    return <div className="muted">laden; atriumvelden</div>;
  }

  return (
    <div className="admin-grid">
      <div className="admin-panel">
        <div className="admin-toolbar">
          <div className="admin-toolbar-title">
            <div style={{ fontWeight: 700 }}>Atriumvelden</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Beheer van velden die uit Atrium/Fabric worden opgehaald. Je beheert hier label, sectie, sortering, toelichting en ook de technische bronvelden.
            </div>
          </div>

          <div className="admin-toolbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addRow}
              onMouseEnter={() => addIconRef.current?.startAnimation?.()}
              onMouseLeave={() => addIconRef.current?.stopAnimation?.()}
            >
              <PlusIcon ref={addIconRef} size={16} className="nav-anim-icon" />
              Atriumveld toevoegen
            </button>
          </div>
        </div>

        <div className="admin-chip-row">
          <span className="admin-chip admin-chip--warning">
            Bij twijfel hier GEEN wijzigingen doen (Opmerking/toelichging wijzigen kan prima - overige wijzigingen IN OVERLEG).
          </span>
        </div>

        <div className="admin-grid">
          {groupedSections.map(({ section, fields }) => {
            const sectionKey = section.section_key || "__unassigned__";
            const isOpen = openSectionKeys[sectionKey] === true;

            return (
              <div key={sectionKey} className="admin-section">
                <button
                  type="button"
                  className="admin-section-head"
                  onClick={() =>
                    setOpenSectionKeys((prev) => ({
                      ...prev,
                      [sectionKey]: !isOpen,
                    }))
                  }
                >
                  <div className="admin-section-head-main">
                    <div className="admin-section-title">
                      {section.section_name || "Zonder sectie"}
                    </div>
                    <div className="admin-section-sub">
                      {section.section_description || "Geen omschrijving"} · {fields.length} velden
                    </div>
                  </div>

                  <div className="admin-row-actions">
                    {isOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                  </div>
                </button>

                {isOpen && (
                  <div className="admin-section-body">
                    {fields.length === 0 ? (
                      <div className="admin-empty-note">Nog geen Atriumvelden in deze sectie.</div>
                    ) : (
                      fields.map((row) => {
                        const fieldIndex = draft.findIndex((x) => x === row);
                        if (fieldIndex < 0) return null;

                        const fieldOpenKey = row.field_key || `__field_${fieldIndex}`;
                        const isFieldOpen = openFieldKeys[fieldOpenKey] === true;

                        return (
                          <div key={`${row.field_key || "new"}:${fieldIndex}`} className="admin-subcard">
                            <button
                              type="button"
                              className="admin-section-head admin-section-head--compact"
                              onClick={() =>
                                setOpenFieldKeys((prev) => ({
                                  ...prev,
                                  [fieldOpenKey]: !isFieldOpen,
                                }))
                              }
                            >
                              <div className="admin-row-summary-grid">
                                <div className="admin-row-summary-cell">
                                  <div className="admin-row-summary-label">Label</div>
                                  <div className="admin-row-summary-value">
                                    {row.label || "Nieuw Atriumveld"}
                                  </div>
                                </div>

                                <div className="admin-row-summary-cell">
                                  <div className="admin-row-summary-label">Field key</div>
                                  <div className="admin-row-summary-value admin-row-summary-value--muted">
                                    {row.field_key || "-"}
                                  </div>
                                </div>

                                <div className="admin-row-summary-cell">
                                  <div className="admin-row-summary-label">Bron</div>
                                  <div className="admin-row-summary-value admin-row-summary-value--muted">
                                    {row.fabric_table || "-"} · {row.fabric_column || "-"}
                                  </div>
                                </div>

                                <div className="admin-row-summary-cell">
                                  <div className="admin-row-summary-label">Status</div>
                                  <div className="admin-row-summary-value">
                                    {statusBadge(row.is_active)}
                                  </div>
                                </div>
                              </div>

                              <div className="admin-row-actions">
                                {isFieldOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                              </div>
                            </button>

                            {isFieldOpen && (
                              <div className="admin-section-body admin-section-body--inner">
                                <div className="admin-toolbar">
                                  <div className="admin-toolbar-title">
                                    <div className="admin-subcard-title">Instellingen</div>
                                    <div className="muted" style={{ fontSize: 13 }}>
                                      Presentatie en broninstellingen voor dit Atriumveld.
                                    </div>
                                  </div>

                                  <div className="admin-row-actions">
                                    {statusBadge(row.is_active)}

                                    <div className="admin-sorter">
                                      <button
                                        type="button"
                                        className="admin-mini-icon-btn"
                                        title="Omhoog"
                                        disabled={fieldIndex === 0}
                                        onClick={() => moveRow(fieldIndex, "up")}
                                        onMouseEnter={() => upIconRefs.current[fieldIndex]?.startAnimation?.()}
                                        onMouseLeave={() => upIconRefs.current[fieldIndex]?.stopAnimation?.()}
                                      >
                                        <ArrowUpIcon
                                          ref={(el) => {
                                            upIconRefs.current[fieldIndex] = el;
                                          }}
                                          size={16}
                                          className="nav-anim-icon"
                                        />
                                      </button>

                                      <button
                                        type="button"
                                        className="admin-mini-icon-btn"
                                        title="Omlaag"
                                        disabled={fieldIndex === draft.length - 1}
                                        onClick={() => moveRow(fieldIndex, "down")}
                                        onMouseEnter={() => downIconRefs.current[fieldIndex]?.startAnimation?.()}
                                        onMouseLeave={() => downIconRefs.current[fieldIndex]?.stopAnimation?.()}
                                      >
                                        <ArrowDownIcon
                                          ref={(el) => {
                                            downIconRefs.current[fieldIndex] = el;
                                          }}
                                          size={16}
                                          className="nav-anim-icon"
                                        />
                                      </button>

                                      <input
                                        type="number"
                                        className="input admin-sorter-value"
                                        value={row.sort_order ?? ""}
                                        onChange={(e) => setRow(fieldIndex, { sort_order: e.target.value })}
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="cf-grid">
                                  <div className="cf-row">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Label</div>
                                    </div>
                                    <div className="cf-control">
                                      <input
                                        className="input"
                                        value={row.label}
                                        onChange={(e) => setRow(fieldIndex, { label: e.target.value })}
                                      />
                                    </div>
                                  </div>

                                  <div className="cf-row">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Field key</div>
                                    </div>
                                    <div className="cf-control">
                                      <input
                                        className="input"
                                        value={row.field_key}
                                        onChange={(e) =>
                                          handleTechnicalFieldChange(fieldIndex, "field_key", e.target.value, "field key")
                                        }
                                      />
                                    </div>
                                  </div>

                                  <div className="cf-row">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Sectie</div>
                                    </div>
                                    <div className="cf-control">
                                      <select
                                        className="input"
                                        value={row.section_key ?? ""}
                                        onChange={(e) => setRow(fieldIndex, { section_key: e.target.value || null })}
                                      >
                                        <option value="">— geen —</option>
                                        {sections.map((s) => (
                                          <option key={s.section_key} value={s.section_key}>
                                            {s.section_name || s.section_key}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  <div className="cf-row">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Actief</div>
                                    </div>
                                    <div className="cf-control">
                                      <select
                                        className="input"
                                        value={row.is_active ? "1" : "0"}
                                        onChange={(e) => handleActiveChange(fieldIndex, e.target.value === "1")}
                                      >
                                        <option value="1">Ja</option>
                                        <option value="0">Nee</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="cf-row">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Source type</div>
                                    </div>
                                    <div className="cf-control">
                                      <input
                                        className="input"
                                        value={row.source_type}
                                        onChange={(e) =>
                                          handleTechnicalFieldChange(fieldIndex, "source_type", e.target.value, "source type")
                                        }
                                      />
                                    </div>
                                  </div>

                                  <div className="cf-row">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Fabric tabel</div>
                                    </div>
                                    <div className="cf-control">
                                      <input
                                        className="input"
                                        value={row.fabric_table}
                                        onChange={(e) =>
                                          handleTechnicalFieldChange(fieldIndex, "fabric_table", e.target.value, "Fabric tabel")
                                        }
                                      />
                                    </div>
                                  </div>

                                  <div className="cf-row wide">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Fabric kolom</div>
                                    </div>
                                    <div className="cf-control">
                                      <input
                                        className="input"
                                        value={row.fabric_column}
                                        onChange={(e) =>
                                          handleTechnicalFieldChange(fieldIndex, "fabric_column", e.target.value, "Fabric kolom")
                                        }
                                      />
                                    </div>
                                  </div>

                                  <div className="cf-row wide">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Opmerking / toelichting</div>
                                    </div>
                                    <div className="cf-control">
                                      <textarea
                                        className="cf-textarea"
                                        rows={3}
                                        value={row.notes ?? ""}
                                        onChange={(e) => setRow(fieldIndex, { notes: e.target.value })}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default AdminInstallationExternalFieldsTab;