// src/pages/Admin/AdminInstallationFieldsTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowUpIcon } from "@/components/ui/arrow-up";
import { ArrowDownIcon } from "@/components/ui/arrow-down";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";

function buildDraft(catalog) {
  const sections = Array.isArray(catalog?.sections)
    ? catalog.sections
        .map((x, index) => ({
          section_key: x.section_key ?? "",
          section_name: x.section_name ?? "",
          section_description: x.section_description ?? "",
          sort_order: x.sort_order ?? (index + 1) * 10,
        }))
        .sort((a, b) => {
          const sa = Number(a?.sort_order ?? 0);
          const sb = Number(b?.sort_order ?? 0);
          if (sa !== sb) return sa - sb;
          return String(a?.section_name || "").localeCompare(String(b?.section_name || ""));
        })
    : [];

  const optionsByFieldKey = new Map();
  for (const option of catalog?.customFieldOptions || []) {
    const arr = optionsByFieldKey.get(option.field_key) || [];
    arr.push({
      option_value: option.option_value ?? "",
      option_label: option.option_label ?? "",
      sort_order: option.sort_order ?? null,
      is_active: option.is_active ?? true,
    });
    optionsByFieldKey.set(option.field_key, arr);
  }

  const applicabilityByFieldKey = new Map();
  for (const link of catalog?.customFieldTypeLinks || []) {
    const arr = applicabilityByFieldKey.get(link.field_key) || [];
    arr.push(link.installation_type_key);
    applicabilityByFieldKey.set(link.field_key, arr);
  }

  const fields = Array.isArray(catalog?.customFields)
    ? catalog.customFields
        .map((x, index) => ({
          field_key: x.field_key ?? "",
          display_name: x.display_name ?? "",
          data_type: x.data_type ?? "string",
          section_key: x.section_key ?? "",
          sort_order: x.sort_order ?? (index + 1) * 10,
          is_active: x.is_active ?? true,
          options: (optionsByFieldKey.get(x.field_key) || []).sort((a, b) => {
            const sa = Number(a?.sort_order ?? 0);
            const sb = Number(b?.sort_order ?? 0);
            if (sa !== sb) return sa - sb;
            return String(a?.option_label || "").localeCompare(String(b?.option_label || ""));
          }),
          applicability_type_keys: applicabilityByFieldKey.get(x.field_key) || [],
        }))
        .sort((a, b) => {
          const sa = Number(a?.sort_order ?? 0);
          const sb = Number(b?.sort_order ?? 0);
          if (sa !== sb) return sa - sb;
          return String(a?.display_name || "").localeCompare(String(b?.display_name || ""));
        })
    : [];

  return { sections, fields };
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

function compactCountLabel(count, single, plural) {
  return `${count} ${count === 1 ? single : plural}`;
}

function activeLabel(isActive) {
  return isActive ? "Actief" : "Niet actief";
}

function activeTone(isActive) {
  return isActive ? "success" : "muted";
}

function dataTypeLabel(dataType) {
  if (dataType === "string") return "Tekst";
  if (dataType === "number") return "Getal";
  if (dataType === "bool") return "Ja/Nee";
  if (dataType === "date") return "Datum";
  if (dataType === "json") return "JSON";
  return dataType || "-";
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

const AdminInstallationFieldsTab = forwardRef(function AdminInstallationFieldsTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSaveSections, onSaveFields },
  ref
) {
  const addSectionIconRef = useRef(null);
  const addFieldIconRef = useRef(null);
  const addOptionIconRefs = useRef({});
  const upIconRefs = useRef({});
  const downIconRefs = useRef({});

  const [draft, setDraft] = useState({ sections: [], fields: [] });
  const [saving, setSaving] = useState(false);

  const [sectionsPanelOpen, setSectionsPanelOpen] = useState(false);
  const [openSectionKeys, setOpenSectionKeys] = useState({});
  const [openFieldKeys, setOpenFieldKeys] = useState({});

  useEffect(() => {
    const next = buildDraft(catalog);
    setDraft(next);

    setOpenSectionKeys((prev) => {
      const map = {};
      for (const section of next.sections) {
        const key = section.section_key || "__unassigned__";
        map[key] = prev[key] === true;
      }
      return map;
    });

    setOpenFieldKeys((prev) => {
      const map = {};
      next.fields.forEach((field, index) => {
        const key = field.field_key || `__field_${index}`;
        map[key] = prev[key] === true;
      });
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

  const installationTypes = Array.isArray(catalog?.installationTypes)
    ? catalog.installationTypes
    : [];

  const groupedSections = useMemo(() => {
    const sectionMap = new Map(
      (draft.sections || []).map((section) => [
        section.section_key || "__no_key__",
        {
          section,
          fields: [],
        },
      ])
    );

    for (const field of draft.fields || []) {
      const key = field.section_key || "__unassigned__";

      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          section: {
            section_key: "",
            section_name: key === "__unassigned__" ? "Zonder categorie" : key,
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
      return String(a?.section?.section_name || "").localeCompare(
        String(b?.section?.section_name || "")
      );
    });
  }, [draft]);

  function setSection(index, patch) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function setField(index, patch) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function toggleFieldType(index, typeKey) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((row, i) => {
        if (i !== index) return row;

        const set = new Set(row.applicability_type_keys || []);
        if (set.has(typeKey)) {
          set.delete(typeKey);
        } else {
          set.add(typeKey);
        }

        return { ...row, applicability_type_keys: Array.from(set) };
      }),
    }));
  }

  function setFieldOption(fieldIndex, optionIndex, patch) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((field, i) => {
        if (i !== fieldIndex) return field;

        return {
          ...field,
          options: field.options.map((option, oi) =>
            oi === optionIndex ? { ...option, ...patch } : option
          ),
        };
      }),
    }));
  }

  function moveSection(index, direction) {
    setDraft((prev) => {
      const arr = [...prev.sections];
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= arr.length) return prev;

      const swap = arr[nextIndex];
      arr[nextIndex] = arr[index];
      arr[index] = swap;

      return {
        ...prev,
        sections: reindex(arr),
      };
    });
  }

  function moveField(index, direction) {
    setDraft((prev) => {
      const arr = [...prev.fields];
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= arr.length) return prev;

      const swap = arr[nextIndex];
      arr[nextIndex] = arr[index];
      arr[index] = swap;

      return {
        ...prev,
        fields: reindex(arr),
      };
    });
  }

  function moveOption(fieldIndex, optionIndex, direction) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((field, i) => {
        if (i !== fieldIndex) return field;

        const arr = [...(field.options || [])];
        const nextIndex = direction === "up" ? optionIndex - 1 : optionIndex + 1;
        if (nextIndex < 0 || nextIndex >= arr.length) return field;

        const swap = arr[nextIndex];
        arr[nextIndex] = arr[optionIndex];
        arr[optionIndex] = swap;

        return {
          ...field,
          options: reindex(arr),
        };
      }),
    }));
  }

  function handleFieldActiveChange(index, nextValue) {
    const row = draft.fields[index];
    const nextActive = Boolean(nextValue);

    if (row?.is_active && !nextActive) {
      const ok = window.confirm(
        `Weet je zeker dat je eigenschap "${
          row.display_name || row.field_key || "nieuw"
        }" inactief wilt maken?`
      );

      if (!ok) return;
    }

    setField(index, { is_active: nextActive });
  }

  function handleOptionActiveChange(fieldIndex, optionIndex, nextValue) {
    const field = draft.fields[fieldIndex];
    const option = field?.options?.[optionIndex];
    const nextActive = Boolean(nextValue);

    if (option?.is_active && !nextActive) {
      const ok = window.confirm(
        `Weet je zeker dat je keuze "${
          option.option_label || option.option_value || "nieuw"
        }" inactief wilt maken?`
      );

      if (!ok) return;
    }

    setFieldOption(fieldIndex, optionIndex, { is_active: nextActive });
  }

  function addSection() {
    const nextIndex = draft.sections.length;

    setDraft((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          section_key: "",
          section_name: "",
          section_description: "",
          sort_order: (prev.sections.length + 1) * 10,
        },
      ],
    }));

    setSectionsPanelOpen(true);
    setOpenSectionKeys((prev) => ({
      ...prev,
      [`__section_${nextIndex}`]: true,
    }));
  }

  function addField(sectionKey = "") {
    const nextIndex = draft.fields.length;
    const nextFieldOpenKey = `__field_${nextIndex}`;

    setDraft((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          field_key: "",
          display_name: "",
          data_type: "string",
          section_key: sectionKey ?? "",
          sort_order: (prev.fields.length + 1) * 10,
          is_active: true,
          options: [],
          applicability_type_keys: [],
        },
      ],
    }));

    if (sectionKey) {
      setOpenSectionKeys((prev) => ({ ...prev, [sectionKey]: true }));
    }

    setOpenFieldKeys((prev) => ({
      ...prev,
      [nextFieldOpenKey]: true,
    }));
  }

  function addOption(fieldIndex) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((field, i) => {
        if (i !== fieldIndex) return field;

        return {
          ...field,
          options: [
            ...(field.options || []),
            {
              option_value: "",
              option_label: "",
              sort_order: ((field.options || []).length + 1) * 10,
              is_active: true,
            },
          ],
        };
      }),
    }));
  }

  async function save() {
    if (saving || !isDirty) return;

    setSaving(true);

    try {
      const sectionPayload = draft.sections.map((row, index) => ({
        ...row,
        sort_order: normalizeNumber(row.sort_order, (index + 1) * 10),
      }));

      const fieldPayload = draft.fields.map((row, index) => ({
        ...row,
        sort_order: normalizeNumber(row.sort_order, (index + 1) * 10),
        options: (row.options || []).map((option, optionIndex) => ({
          ...option,
          sort_order: normalizeNumber(option.sort_order, (optionIndex + 1) * 10),
        })),
      }));

      await onSaveSections?.(sectionPayload);
      await onSaveFields?.(fieldPayload);
      onSaveOk?.();
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  if (loading && draft.fields.length === 0 && draft.sections.length === 0) {
    return <div className="muted">laden; eigenschappen</div>;
  }

  return (
    <div className="admin-grid">
      <AdminPanel
        title="Categorieën"
        subtitle="Beheer de categorieën waarmee installatie-eigenschappen en documenten worden gegroepeerd."
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
              onClick={addSection}
              onMouseEnter={() => addSectionIconRef.current?.startAnimation?.()}
              onMouseLeave={() => addSectionIconRef.current?.stopAnimation?.()}
            >
              <PlusIcon ref={addSectionIconRef} size={16} className="nav-anim-icon" />
              Categorie toevoegen
            </button>
          </>
        }
      >
        <div className="admin-subcard">
          <button
            type="button"
            className="admin-section-head"
            onClick={() => setSectionsPanelOpen((prev) => !prev)}
          >
            <div className="admin-section-head-main">
              <div className="admin-section-title">Categorieën overzicht</div>
              <div className="admin-section-sub">
                {compactCountLabel(draft.sections.length, "categorie", "categorieën")}
              </div>
            </div>

            <div className="ember-label-row">
              <span className="ember-label ember-label--muted">
                {draft.sections.length} totaal
              </span>
              {sectionsPanelOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
            </div>
          </button>

          {sectionsPanelOpen && (
            <div className="admin-section-body">
              {draft.sections.length === 0 ? (
                <div className="admin-empty-note">Nog geen categorieën gevonden.</div>
              ) : (
                <div className="admin-check-grid">
                  {draft.sections.map((row, index) => (
                    <div key={`${row.section_key || "new"}:${index}`} className="admin-subcard">
                      <div className="admin-toolbar">
                        <div className="admin-toolbar-title">
                          <div className="admin-subcard-title">
                            {index + 1}. {row.section_name || "Nieuwe categorie"}
                          </div>

                          <div className="ember-label-row admin-inline-labels">
                            <span className="ember-label ember-label--muted">
                              key; {row.section_key || "-"}
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
                            onClick={() => moveSection(index, "up")}
                            onMouseEnter={() =>
                              upIconRefs.current[`section-up-${index}`]?.startAnimation?.()
                            }
                            onMouseLeave={() =>
                              upIconRefs.current[`section-up-${index}`]?.stopAnimation?.()
                            }
                          >
                            <ArrowUpIcon
                              ref={(el) => {
                                upIconRefs.current[`section-up-${index}`] = el;
                              }}
                              size={18}
                              className="nav-anim-icon"
                            />
                          </button>

                          <button
                            type="button"
                            className="icon-btn"
                            title="Omlaag"
                            disabled={index === draft.sections.length - 1}
                            onClick={() => moveSection(index, "down")}
                            onMouseEnter={() =>
                              downIconRefs.current[`section-down-${index}`]?.startAnimation?.()
                            }
                            onMouseLeave={() =>
                              downIconRefs.current[`section-down-${index}`]?.stopAnimation?.()
                            }
                          >
                            <ArrowDownIcon
                              ref={(el) => {
                                downIconRefs.current[`section-down-${index}`] = el;
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
                            <div className="cf-label-text">Key</div>
                          </div>

                          <div className="cf-control">
                            <input
                              className="input"
                              value={row.section_key}
                              onChange={(e) =>
                                setSection(index, { section_key: e.target.value })
                              }
                              placeholder="inst_algemeen"
                            />
                          </div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label">
                            <div className="cf-label-text">Naam</div>
                          </div>

                          <div className="cf-control">
                            <input
                              className="input"
                              value={row.section_name}
                              onChange={(e) =>
                                setSection(index, { section_name: e.target.value })
                              }
                              placeholder="Installatie algemeen"
                            />
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
                              onChange={(e) =>
                                setSection(index, { sort_order: e.target.value })
                              }
                            />
                          </div>
                        </div>

                        <div className="cf-row wide">
                          <div className="cf-label">
                            <div className="cf-label-text">Omschrijving</div>
                          </div>

                          <div className="cf-control">
                            <textarea
                              className="cf-textarea"
                              rows={3}
                              value={row.section_description ?? ""}
                              onChange={(e) =>
                                setSection(index, {
                                  section_description: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </AdminPanel>

      <AdminPanel
        title="Eigenschappen"
        subtitle="Eigenschappen gegroepeerd per categorie. Beheer type, zichtbaarheid, toepasbaarheid en vaste keuzes."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => addField("")}
            onMouseEnter={() => addFieldIconRef.current?.startAnimation?.()}
            onMouseLeave={() => addFieldIconRef.current?.stopAnimation?.()}
          >
            <PlusIcon ref={addFieldIconRef} size={16} className="nav-anim-icon" />
            Eigenschap toevoegen
          </button>
        }
      >
        <div className="admin-check-grid">
          {groupedSections.map(({ section, fields }) => {
            const sectionKey = section.section_key || "__unassigned__";
            const isOpen = openSectionKeys[sectionKey] === true;

            return (
              <div key={sectionKey} className="admin-subcard">
                <button
                  type="button"
                  className="admin-section-head"
                  onClick={() =>
                    setOpenSectionKeys((prev) => ({ ...prev, [sectionKey]: !isOpen }))
                  }
                >
                  <div className="admin-section-head-main">
                    <div className="admin-section-title">
                      {section.section_name || "Zonder categorie"}
                    </div>

                    <div className="admin-section-sub">
                      {section.section_description || "Geen omschrijving"};{" "}
                      {compactCountLabel(fields.length, "eigenschap", "eigenschappen")}
                    </div>
                  </div>

                  <div className="ember-label-row">
                    <span className="ember-label ember-label--muted">
                      {fields.length} eigenschappen
                    </span>

                    <span
                      className="btn btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        addField(section.section_key || "");
                      }}
                    >
                      <PlusIcon size={16} className="nav-anim-icon" />
                      Toevoegen
                    </span>

                    {isOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                  </div>
                </button>

                {isOpen && (
                  <div className="admin-section-body">
                    {fields.length === 0 ? (
                      <div className="admin-empty-note">
                        Nog geen eigenschappen in deze categorie.
                      </div>
                    ) : (
                      <div className="admin-check-grid">
                        {fields.map((row) => {
                          const fieldIndex = draft.fields.findIndex((x) => x === row);
                          if (fieldIndex < 0) return null;

                          const fieldOpenKey = row.field_key || `__field_${fieldIndex}`;
                          const isFieldOpen = openFieldKeys[fieldOpenKey] === true;

                          const applicabilityCount = Array.isArray(row.applicability_type_keys)
                            ? row.applicability_type_keys.length
                            : 0;

                          const optionsCount = Array.isArray(row.options)
                            ? row.options.length
                            : 0;

                          return (
                            <div
                              key={`${row.field_key || "new"}:${fieldIndex}`}
                              className={`admin-subcard ${
                                !row.is_active ? "admin-table-row--inactive" : ""
                              }`}
                            >
                              <button
                                type="button"
                                className="admin-compact-row"
                                onClick={() =>
                                  setOpenFieldKeys((prev) => ({
                                    ...prev,
                                    [fieldOpenKey]: !isFieldOpen,
                                  }))
                                }
                              >
                                <div className="admin-compact-row-main">
                                  <div className="admin-compact-row-title-wrap">
                                    <div className="admin-compact-row-title">
                                      {row.display_name || row.field_key || "Nieuwe eigenschap"}
                                    </div>

                                    <div className="admin-compact-row-sub">
                                      {row.field_key || "-"}
                                    </div>

                                    <div className="ember-label-row admin-inline-labels">
                                      <span
                                        className={`ember-label ember-label--${activeTone(
                                          row.is_active
                                        )}`}
                                      >
                                        {activeLabel(row.is_active)}
                                      </span>

                                      <span className="ember-label ember-label--muted">
                                        type; {dataTypeLabel(row.data_type)}
                                      </span>

                                      <span className="ember-label ember-label--muted">
                                        {applicabilityCount === 0
                                          ? "alle types"
                                          : `${applicabilityCount} types`}
                                      </span>

                                      <span className="ember-label ember-label--muted">
                                        {optionsCount} keuzes
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="admin-compact-row-right">
                                  {isFieldOpen ? (
                                    <ChevronDownIcon size={18} />
                                  ) : (
                                    <ChevronRightIcon size={18} />
                                  )}
                                </div>
                              </button>

                              {isFieldOpen && (
                                <div className="admin-subcard-body">
                                  <SectionHeader
                                    title="Instellingen"
                                    subtitle="Basisinstellingen voor deze eigenschap."
                                    actions={
                                      <div className="ember-label-row">
                                        <span
                                          className={`ember-label ember-label--${activeTone(
                                            row.is_active
                                          )}`}
                                        >
                                          {activeLabel(row.is_active)}
                                        </span>

                                        <button
                                          type="button"
                                          className="icon-btn"
                                          title="Omhoog"
                                          disabled={fieldIndex === 0}
                                          onClick={() => moveField(fieldIndex, "up")}
                                        >
                                          <ArrowUpIcon size={18} className="nav-anim-icon" />
                                        </button>

                                        <button
                                          type="button"
                                          className="icon-btn"
                                          title="Omlaag"
                                          disabled={fieldIndex === draft.fields.length - 1}
                                          onClick={() => moveField(fieldIndex, "down")}
                                        >
                                          <ArrowDownIcon size={18} className="nav-anim-icon" />
                                        </button>
                                      </div>
                                    }
                                  />

                                  <div className="cf-grid">
                                    <div className="cf-row">
                                      <div className="cf-label">
                                        <div className="cf-label-text">Field key</div>
                                      </div>

                                      <div className="cf-control">
                                        <input
                                          className="input"
                                          value={row.field_key}
                                          onChange={(e) =>
                                            setField(fieldIndex, { field_key: e.target.value })
                                          }
                                        />
                                      </div>
                                    </div>

                                    <div className="cf-row">
                                      <div className="cf-label">
                                        <div className="cf-label-text">Label</div>
                                      </div>

                                      <div className="cf-control">
                                        <input
                                          className="input"
                                          value={row.display_name}
                                          onChange={(e) =>
                                            setField(fieldIndex, {
                                              display_name: e.target.value,
                                            })
                                          }
                                        />
                                      </div>
                                    </div>

                                    <div className="cf-row">
                                      <div className="cf-label">
                                        <div className="cf-label-text">Type</div>
                                      </div>

                                      <div className="cf-control">
                                        <select
                                          className="input"
                                          value={row.data_type}
                                          onChange={(e) =>
                                            setField(fieldIndex, { data_type: e.target.value })
                                          }
                                        >
                                          <option value="string">Tekst</option>
                                          <option value="number">Getal</option>
                                          <option value="bool">Ja/Nee</option>
                                          <option value="date">Datum</option>
                                          <option value="json">JSON</option>
                                        </select>
                                      </div>
                                    </div>

                                    <div className="cf-row">
                                      <div className="cf-label">
                                        <div className="cf-label-text">Categorie</div>
                                      </div>

                                      <div className="cf-control">
                                        <select
                                          className="input"
                                          value={row.section_key ?? ""}
                                          onChange={(e) =>
                                            setField(fieldIndex, {
                                              section_key: e.target.value || "",
                                            })
                                          }
                                        >
                                          <option value="">Zonder categorie</option>
                                          {draft.sections.map((section) => (
                                            <option
                                              key={section.section_key || section.section_name}
                                              value={section.section_key}
                                            >
                                              {section.section_name || section.section_key}
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
                                          onChange={(e) =>
                                            setField(fieldIndex, {
                                              sort_order: e.target.value,
                                            })
                                          }
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
                                            handleFieldActiveChange(
                                              fieldIndex,
                                              e.target.value === "1"
                                            )
                                          }
                                        >
                                          <option value="1">Ja</option>
                                          <option value="0">Nee</option>
                                        </select>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="admin-subcard">
                                    <SectionHeader
                                      title="Toepasbaarheid"
                                      subtitle="Geen geselecteerde installatiesoorten betekent; zichtbaar voor alle types."
                                      actions={
                                        <span className="ember-label ember-label--muted">
                                          {applicabilityCount || "alle"} geselecteerd
                                        </span>
                                      }
                                    />

                                    <div className="admin-check-grid">
                                      {installationTypes.map((type) => {
                                        const checked = (
                                          row.applicability_type_keys || []
                                        ).includes(type.installation_type_key);

                                        return (
                                          <label
                                            key={type.installation_type_key}
                                            className={`admin-compact-row ${
                                              checked ? "ember-accent-active" : ""
                                            }`}
                                          >
                                            <div className="admin-compact-row-main">
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() =>
                                                  toggleFieldType(
                                                    fieldIndex,
                                                    type.installation_type_key
                                                  )
                                                }
                                              />

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
                                              <span
                                                className={
                                                  checked
                                                    ? "ember-label ember-label--success"
                                                    : "ember-label ember-label--muted"
                                                }
                                              >
                                                {checked ? "Beschikbaar" : "Niet gekozen"}
                                              </span>
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {row.data_type === "string" && (
                                    <div className="admin-subcard">
                                      <SectionHeader
                                        title="Keuzes"
                                        subtitle="Laat leeg als deze eigenschap vrije tekst moet blijven."
                                        actions={
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => addOption(fieldIndex)}
                                            onMouseEnter={() =>
                                              addOptionIconRefs.current[
                                                fieldIndex
                                              ]?.startAnimation?.()
                                            }
                                            onMouseLeave={() =>
                                              addOptionIconRefs.current[
                                                fieldIndex
                                              ]?.stopAnimation?.()
                                            }
                                          >
                                            <PlusIcon
                                              ref={(el) => {
                                                addOptionIconRefs.current[fieldIndex] = el;
                                              }}
                                              size={16}
                                              className="nav-anim-icon"
                                            />
                                            Keuze toevoegen
                                          </button>
                                        }
                                      />

                                      {(row.options || []).length === 0 ? (
                                        <div className="admin-empty-note">
                                          Geen vaste keuzes ingesteld.
                                        </div>
                                      ) : (
                                        <div className="admin-check-grid">
                                          {(row.options || []).map((option, optionIndex) => (
                                            <div
                                              key={`${option.option_value || "new"}:${optionIndex}`}
                                              className={`admin-subcard ${
                                                !option.is_active
                                                  ? "admin-table-row--inactive"
                                                  : ""
                                              }`}
                                            >
                                              <div className="admin-toolbar">
                                                <div className="admin-toolbar-title">
                                                  <div className="admin-subcard-title">
                                                    {optionIndex + 1}.{" "}
                                                    {option.option_label ||
                                                      option.option_value ||
                                                      "Nieuwe keuze"}
                                                  </div>

                                                  <div className="ember-label-row admin-inline-labels">
                                                    <span
                                                      className={`ember-label ember-label--${activeTone(
                                                        option.is_active
                                                      )}`}
                                                    >
                                                      {activeLabel(option.is_active)}
                                                    </span>

                                                    <span className="ember-label ember-label--muted">
                                                      waarde; {option.option_value || "-"}
                                                    </span>

                                                    <span className="ember-label ember-label--muted">
                                                      sortering; {option.sort_order || "-"}
                                                    </span>
                                                  </div>
                                                </div>

                                                <div className="admin-toolbar-actions">
                                                  <button
                                                    type="button"
                                                    className="icon-btn"
                                                    title="Omhoog"
                                                    disabled={optionIndex === 0}
                                                    onClick={() =>
                                                      moveOption(fieldIndex, optionIndex, "up")
                                                    }
                                                  >
                                                    <ArrowUpIcon
                                                      size={18}
                                                      className="nav-anim-icon"
                                                    />
                                                  </button>

                                                  <button
                                                    type="button"
                                                    className="icon-btn"
                                                    title="Omlaag"
                                                    disabled={
                                                      optionIndex ===
                                                      (row.options || []).length - 1
                                                    }
                                                    onClick={() =>
                                                      moveOption(fieldIndex, optionIndex, "down")
                                                    }
                                                  >
                                                    <ArrowDownIcon
                                                      size={18}
                                                      className="nav-anim-icon"
                                                    />
                                                  </button>
                                                </div>
                                              </div>

                                              <div className="cf-grid">
                                                <div className="cf-row">
                                                  <div className="cf-label">
                                                    <div className="cf-label-text">Waarde</div>
                                                  </div>

                                                  <div className="cf-control">
                                                    <input
                                                      className="input"
                                                      value={option.option_value}
                                                      onChange={(e) =>
                                                        setFieldOption(
                                                          fieldIndex,
                                                          optionIndex,
                                                          {
                                                            option_value: e.target.value,
                                                          }
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                </div>

                                                <div className="cf-row">
                                                  <div className="cf-label">
                                                    <div className="cf-label-text">Label</div>
                                                  </div>

                                                  <div className="cf-control">
                                                    <input
                                                      className="input"
                                                      value={option.option_label}
                                                      onChange={(e) =>
                                                        setFieldOption(
                                                          fieldIndex,
                                                          optionIndex,
                                                          {
                                                            option_label: e.target.value,
                                                          }
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                </div>

                                                <div className="cf-row">
                                                  <div className="cf-label">
                                                    <div className="cf-label-text">
                                                      Sortering
                                                    </div>
                                                  </div>

                                                  <div className="cf-control">
                                                    <input
                                                      type="number"
                                                      className="input"
                                                      value={option.sort_order ?? ""}
                                                      onChange={(e) =>
                                                        setFieldOption(
                                                          fieldIndex,
                                                          optionIndex,
                                                          {
                                                            sort_order: e.target.value,
                                                          }
                                                        )
                                                      }
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
                                                      value={option.is_active ? "1" : "0"}
                                                      onChange={(e) =>
                                                        handleOptionActiveChange(
                                                          fieldIndex,
                                                          optionIndex,
                                                          e.target.value === "1"
                                                        )
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
            );
          })}
        </div>
      </AdminPanel>
    </div>
  );
});

export default AdminInstallationFieldsTab;