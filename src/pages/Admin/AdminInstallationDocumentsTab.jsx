// src/pages/Admin/AdminInstallationDocumentsTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Tabs from "../../components/Tabs.jsx";
import { FileStackIcon } from "@/components/ui/file-stack";
import { TornadoIcon } from "@/components/ui/tornado";
import { ArrowUpIcon } from "@/components/ui/arrow-up";
import { ArrowDownIcon } from "@/components/ui/arrow-down";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";

function buildDraft(catalog) {
  const applicabilityByDocType = new Map();
  for (const link of catalog?.documentTypeLinks || []) {
    const arr = applicabilityByDocType.get(link.document_type_key) || [];
    arr.push(link.installation_type_key);
    applicabilityByDocType.set(link.document_type_key, arr);
  }

  const requiredByDocType = new Map();
  for (const link of catalog?.documentTypeRequirements || []) {
    const arr = requiredByDocType.get(link.document_type_key) || [];
    if (link.is_required) arr.push(link.installation_type_key);
    requiredByDocType.set(link.document_type_key, arr);
  }

  return Array.isArray(catalog?.documentTypes)
    ? catalog.documentTypes
        .map((x, index) => ({
          document_type_key: x.document_type_key ?? "",
          document_type_name: x.document_type_name ?? "",
          section_key: x.section_key ?? "",
          sort_order: x.sort_order ?? (index + 1) * 10,
          is_active: x.is_active ?? true,
          applicability_type_keys: applicabilityByDocType.get(x.document_type_key) || [],
          required_type_keys: requiredByDocType.get(x.document_type_key) || [],
        }))
        .sort((a, b) => {
          const sa = Number(a?.sort_order ?? 0);
          const sb = Number(b?.sort_order ?? 0);
          if (sa !== sb) return sa - sb;
          return String(a?.document_type_name || "").localeCompare(
            String(b?.document_type_name || "")
          );
        })
    : [];
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

function activeLabel(isActive) {
  return isActive ? "Actief" : "Niet actief";
}

function activeTone(isActive) {
  return isActive ? "success" : "muted";
}

function AdminPanel({ title, subtitle, actions, children }) {
  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        <div className="admin-toolbar-title">
          <div className="admin-panel-title">{title}</div>
          {subtitle ? <div className="admin-panel-subtitle">{subtitle}</div> : null}
        </div>

        {actions ? <div className="admin-toolbar-actions">{actions}</div> : null}
      </div>

      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="admin-toolbar">
      <div className="admin-toolbar-title">
        <div className="admin-subcard-title">{title}</div>
        {subtitle ? <div className="admin-panel-subtitle">{subtitle}</div> : null}
      </div>

      {actions ? <div className="admin-toolbar-actions">{actions}</div> : null}
    </div>
  );
}

const AdminInstallationDocumentsTab = forwardRef(function AdminInstallationDocumentsTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSave },
  ref
) {
  const addIconRef = useRef(null);
  const upIconRefs = useRef({});
  const downIconRefs = useRef({});

  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeInnerTab, setActiveInnerTab] = useState("basis");
  const [openDocTypeKeys, setOpenDocTypeKeys] = useState({});

  useEffect(() => {
    const next = buildDraft(catalog);
    setDraft(next);

    setOpenDocTypeKeys((prev) => {
      const map = { ...prev };

      for (const row of next) {
        const key = row.document_type_key || `__row_${row.document_type_name || "new"}`;
        if (map[key] === undefined) map[key] = false;
      }

      return map;
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
  const installationTypes = Array.isArray(catalog?.installationTypes)
    ? catalog.installationTypes
    : [];

  function setRow(index, patch) {
    setDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
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

  function handleActiveChange(index, nextValue) {
    const row = draft[index];
    const nextActive = Boolean(nextValue);

    if (row?.is_active && !nextActive) {
      const ok = window.confirm(
        `Weet je zeker dat je documenttype "${
          row.document_type_name || row.document_type_key || "nieuw"
        }" inactief wilt maken?`
      );

      if (!ok) return;
    }

    setRow(index, { is_active: nextActive });
  }

  function toggleApplicability(index, typeKey) {
    setDraft((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        const applicability = new Set(row.applicability_type_keys || []);
        const required = new Set(row.required_type_keys || []);

        if (applicability.has(typeKey)) {
          applicability.delete(typeKey);
          required.delete(typeKey);
        } else {
          applicability.add(typeKey);
        }

        return {
          ...row,
          applicability_type_keys: Array.from(applicability),
          required_type_keys: Array.from(required),
        };
      })
    );
  }

  function toggleRequired(index, typeKey) {
    setDraft((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        const applicability = new Set(row.applicability_type_keys || []);
        const required = new Set(row.required_type_keys || []);
        const allTypesImplicit = applicability.size === 0;

        if (!allTypesImplicit && !applicability.has(typeKey)) {
          return row;
        }

        if (required.has(typeKey)) {
          required.delete(typeKey);
        } else {
          required.add(typeKey);
        }

        return {
          ...row,
          required_type_keys: Array.from(required),
        };
      })
    );
  }

  function addRow() {
    setDraft((prev) => [
      ...prev,
      {
        document_type_key: "",
        document_type_name: "",
        section_key: "",
        sort_order: (prev.length + 1) * 10,
        is_active: true,
        applicability_type_keys: [],
        required_type_keys: [],
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

  const innerTabs = useMemo(() => {
    return [
      {
        key: "basis",
        label: "Basis",
        Icon: FileStackIcon,
        content: (
          <AdminPanel
            title="Documenttypes"
            subtitle="Beheer naam, key, sectie, sortering en actieve status van documenttypes."
            actions={
              <>
                {isDirty ? (
                  <span className="ember-label ember-label--warning">Niet opgeslagen</span>
                ) : (
                  <span className="ember-label ember-label--success">Opgeslagen</span>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={addRow}
                  onMouseEnter={() => addIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => addIconRef.current?.stopAnimation?.()}
                >
                  <PlusIcon ref={addIconRef} size={16} className="nav-anim-icon" />
                  Documenttype toevoegen
                </button>
              </>
            }
          >
            {draft.length === 0 ? (
              <div className="admin-empty-note">Nog geen documenttypes gevonden.</div>
            ) : (
              <div className="admin-check-grid">
                {draft.map((row, index) => (
                  <div
                    key={`${row.document_type_key || "new"}:${index}`}
                    className={`admin-subcard ${
                      !row.is_active ? "admin-table-row--inactive" : ""
                    }`}
                  >
                    <div className="admin-toolbar">
                      <div className="admin-toolbar-title">
                        <div className="admin-subcard-title">
                          {index + 1}. {row.document_type_name || "Nieuw documenttype"}
                        </div>

                        <div className="ember-label-row admin-inline-labels">
                          <span
                            className={`ember-label ember-label--${activeTone(row.is_active)}`}
                          >
                            {activeLabel(row.is_active)}
                          </span>

                          <span className="ember-label ember-label--muted">
                            key; {row.document_type_key || "-"}
                          </span>

                          <span className="ember-label ember-label--muted">
                            sectie; {row.section_key || "geen"}
                          </span>

                          <span className="ember-label ember-label--muted">
                            sortering; {row.sort_order || "-"}
                          </span>
                        </div>
                      </div>

                      <div className="admin-toolbar-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Omhoog"
                          disabled={index === 0}
                          onClick={() => moveRow(index, "up")}
                          onMouseEnter={() => upIconRefs.current[index]?.startAnimation?.()}
                          onMouseLeave={() => upIconRefs.current[index]?.stopAnimation?.()}
                        >
                          <ArrowUpIcon
                            ref={(el) => {
                              upIconRefs.current[index] = el;
                            }}
                            size={18}
                            className="nav-anim-icon"
                          />
                        </button>

                        <button
                          type="button"
                          className="icon-btn"
                          title="Omlaag"
                          disabled={index === draft.length - 1}
                          onClick={() => moveRow(index, "down")}
                          onMouseEnter={() => downIconRefs.current[index]?.startAnimation?.()}
                          onMouseLeave={() => downIconRefs.current[index]?.stopAnimation?.()}
                        >
                          <ArrowDownIcon
                            ref={(el) => {
                              downIconRefs.current[index] = el;
                            }}
                            size={18}
                            className="nav-anim-icon"
                          />
                        </button>
                      </div>
                    </div>

                    <div className="cf-grid">
                      <div className="cf-row">
                        <div className="cf-label">
                          <div className="cf-label-text">Naam</div>
                        </div>

                        <div className="cf-control">
                          <input
                            className="input"
                            value={row.document_type_name}
                            onChange={(e) =>
                              setRow(index, { document_type_name: e.target.value })
                            }
                            placeholder="Onderhoudsrapport"
                          />
                        </div>
                      </div>

                      <div className="cf-row">
                        <div className="cf-label">
                          <div className="cf-label-text">Key</div>
                        </div>

                        <div className="cf-control">
                          <input
                            className="input"
                            value={row.document_type_key}
                            onChange={(e) =>
                              setRow(index, { document_type_key: e.target.value })
                            }
                            placeholder="onderhoudsrapport"
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
                            onChange={(e) =>
                              setRow(index, { section_key: e.target.value || null })
                            }
                          >
                            <option value="">geen</option>
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
                          <div className="cf-label-text">Sortering</div>
                        </div>

                        <div className="cf-control">
                          <input
                            type="number"
                            className="input"
                            value={row.sort_order ?? ""}
                            onChange={(e) => setRow(index, { sort_order: e.target.value })}
                          />
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
                            onChange={(e) =>
                              handleActiveChange(index, e.target.value === "1")
                            }
                          >
                            <option value="1">Ja</option>
                            <option value="0">Nee</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminPanel>
        ),
      },
      {
        key: "per_type",
        label: "Per installatiesoort",
        Icon: TornadoIcon,
        content: (
          <AdminPanel
            title="Per installatiesoort"
            subtitle="Stel per documenttype in waar het zichtbaar is en voor welke installatiesoorten het verplicht is."
            actions={
              isDirty ? (
                <span className="ember-label ember-label--warning">Niet opgeslagen</span>
              ) : (
                <span className="ember-label ember-label--success">Opgeslagen</span>
              )
            }
          >
            <div className="admin-subcard">
              <SectionHeader
                title="Uitleg"
                subtitle="Geen gekozen toepasbaarheid betekent; het documenttype is beschikbaar voor alle installatiesoorten."
                actions={<span className="ember-label ember-label--muted">Data driven</span>}
              />
            </div>

            {draft.length === 0 ? (
              <div className="admin-empty-note">Nog geen documenttypes gevonden.</div>
            ) : (
              <div className="admin-check-grid">
                {draft.map((row, index) => {
                  const applicabilitySet = new Set(row.applicability_type_keys || []);
                  const requiredSet = new Set(row.required_type_keys || []);
                  const allTypesImplicit = applicabilitySet.size === 0;
                  const docTypeOpenKey = row.document_type_key || `__row_${index}`;
                  const isOpen = openDocTypeKeys[docTypeOpenKey] === true;

                  return (
                    <div
                      key={`${row.document_type_key || "new"}:${index}`}
                      className={`admin-subcard ${
                        !row.is_active ? "admin-table-row--inactive" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="admin-section-head"
                        onClick={() =>
                          setOpenDocTypeKeys((prev) => ({
                            ...prev,
                            [docTypeOpenKey]: !isOpen,
                          }))
                        }
                      >
                        <div className="admin-section-head-main">
                          <div className="admin-section-title">
                            {row.document_type_name ||
                              row.document_type_key ||
                              "Nieuw documenttype"}
                          </div>

                          <div className="admin-section-sub">
                            {row.section_key || "geen sectie"};{" "}
                            {allTypesImplicit
                              ? "alle installatiesoorten"
                              : `${applicabilitySet.size} gekozen`}{" "}
                            ; {requiredSet.size} verplicht
                          </div>
                        </div>

                        <div className="ember-label-row">
                          <span
                            className={`ember-label ember-label--${activeTone(row.is_active)}`}
                          >
                            {activeLabel(row.is_active)}
                          </span>

                          {allTypesImplicit ? (
                            <span className="ember-label ember-label--success">
                              Alle types
                            </span>
                          ) : (
                            <span className="ember-label ember-label--muted">
                              {applicabilitySet.size} gekozen
                            </span>
                          )}

                          <span
                            className={
                              requiredSet.size > 0
                                ? "ember-label ember-label--warning"
                                : "ember-label ember-label--muted"
                            }
                          >
                            {requiredSet.size} verplicht
                          </span>

                          {isOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="admin-section-body">
                          <div className="admin-check-grid">
                            {installationTypes.map((type) => {
                              const applicable = applicabilitySet.has(type.installation_type_key);
                              const required = requiredSet.has(type.installation_type_key);
                              const canRequire = applicable || allTypesImplicit;

                              return (
                                <div
                                  key={type.installation_type_key}
                                  className={`admin-compact-row ${
                                    applicable || allTypesImplicit ? "ember-accent-active" : ""
                                  }`}
                                >
                                  <div className="admin-compact-row-main">
                                    <div className="admin-compact-row-title-wrap">
                                      <div className="admin-compact-row-title">
                                        {type.display_name}
                                      </div>
                                      <div className="admin-compact-row-sub">
                                        {type.installation_type_key}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="admin-compact-row-right">
                                    <label className="admin-checkbox-label">
                                      <input
                                        type="checkbox"
                                        checked={applicable}
                                        onChange={() =>
                                          toggleApplicability(
                                            index,
                                            type.installation_type_key
                                          )
                                        }
                                      />
                                      <span>van toepassing</span>
                                    </label>

                                    <label className="admin-checkbox-label">
                                      <input
                                        type="checkbox"
                                        checked={required}
                                        disabled={!canRequire}
                                        onChange={() =>
                                          toggleRequired(index, type.installation_type_key)
                                        }
                                      />
                                      <span>verplicht</span>
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AdminPanel>
        ),
      },
    ];
  }, [draft, sections, installationTypes, openDocTypeKeys, isDirty]);

  const activeInnerContent = innerTabs.find((t) => t.key === activeInnerTab)?.content ?? null;

  if (loading && draft.length === 0) {
    return <div className="muted">laden; documenttypes</div>;
  }

  return (
    <div className="admin-grid">
      <Tabs tabs={innerTabs} activeKey={activeInnerTab} onChange={setActiveInnerTab} />
      {activeInnerContent}
    </div>
  );
});

export default AdminInstallationDocumentsTab;