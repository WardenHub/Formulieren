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
  for (const o of catalog?.customFieldOptions || []) {
    const arr = optionsByFieldKey.get(o.field_key) || [];
    arr.push({
      option_value: o.option_value ?? "",
      option_label: o.option_label ?? "",
      sort_order: o.sort_order ?? null,
      is_active: o.is_active ?? true,
    });
    optionsByFieldKey.set(o.field_key, arr);
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

function compactCountLabel(count, single, plural) {
  return `${count} ${count === 1 ? single : plural}`;
}

const AdminInstallationFieldsTab = forwardRef(function AdminInstallationFieldsTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSaveSections, onSaveFields },
  ref
) {
  const addSectionIconRef = useRef(null);
  const addFieldIconRef = useRef(null);
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
        map[key] = prev[key] === true ? true : false;
      }
      return map;
    });

    setOpenFieldKeys((prev) => {
      const map = {};
      next.fields.forEach((field, index) => {
        const key = field.field_key || `__field_${index}`;
        map[key] = prev[key] === true ? true : false;
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

  const installationTypes = Array.isArray(catalog?.installationTypes) ? catalog.installationTypes : [];

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
        if (set.has(typeKey)) set.delete(typeKey);
        else set.add(typeKey);
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
          options: field.options.map((opt, oi) => (oi === optionIndex ? { ...opt, ...patch } : opt)),
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

  function handleFieldActiveChange(index, nextValue) {
    const row = draft.fields[index];
    const nextActive = Boolean(nextValue);

    if (row?.is_active && !nextActive) {
      const ok = window.confirm(
        `Weet je zeker dat je eigenschap "${row.display_name || row.field_key || "nieuw"}" inactief wilt maken?`
      );
      if (!ok) return;
    }

    setField(index, { is_active: nextActive });
  }

  function addSection() {
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
        options: (row.options || []).map((opt, optionIndex) => ({
          ...opt,
          sort_order: normalizeNumber(opt.sort_order, (optionIndex + 1) * 10),
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
      <div className="admin-panel">
        <div className="admin-toolbar">
          <div className="admin-toolbar-title">
            <div className="admin-panel-title">Categoriën</div>
            <div className="admin-panel-subtitle">
              Los beheer van categoriën. Deze Categoriën worden gebruikt om installatieeigenschappen en documenten te groeperen.
            </div>
          </div>

          <div className="admin-toolbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addSection}
              onMouseEnter={() => addSectionIconRef.current?.startAnimation?.()}
              onMouseLeave={() => addSectionIconRef.current?.stopAnimation?.()}
            >
              <PlusIcon ref={addSectionIconRef} size={16} className="nav-anim-icon" />
              Sectie toevoegen
            </button>
          </div>
        </div>

        <div className="admin-collapse-card">
          <button
            type="button"
            className="admin-collapse-head"
            onClick={() => setSectionsPanelOpen((prev) => !prev)}
          >
            <div className="admin-collapse-head-main">
              <div className="admin-collapse-title">Categoriën overzicht</div>
              <div className="admin-collapse-sub">
                {compactCountLabel(draft.sections.length, "categorie", "categoriën")}
              </div>
            </div>

            <div className="admin-collapse-head-actions">
              {sectionsPanelOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
            </div>
          </button>

          {sectionsPanelOpen && (
            <div className="admin-collapse-body">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="admin-col-order">Volgorde</th>
                      <th className="admin-col-key">Key</th>
                      <th className="admin-col-name">Naam</th>
                      <th className="admin-col-description">Omschrijving</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.sections.map((row, index) => (
                      <tr key={`${row.section_key || "new"}:${index}`}>
                        <td>
                          <div className="admin-sorter">
                            <button
                              type="button"
                              className="admin-mini-icon-btn"
                              title="Omhoog"
                              disabled={index === 0}
                              onClick={() => moveSection(index, "up")}
                              onMouseEnter={() => upIconRefs.current[`section-up-${index}`]?.startAnimation?.()}
                              onMouseLeave={() => upIconRefs.current[`section-up-${index}`]?.stopAnimation?.()}
                            >
                              <ArrowUpIcon
                                ref={(el) => {
                                  upIconRefs.current[`section-up-${index}`] = el;
                                }}
                                size={16}
                                className="nav-anim-icon"
                              />
                            </button>

                            <button
                              type="button"
                              className="admin-mini-icon-btn"
                              title="Omlaag"
                              disabled={index === draft.sections.length - 1}
                              onClick={() => moveSection(index, "down")}
                              onMouseEnter={() => downIconRefs.current[`section-down-${index}`]?.startAnimation?.()}
                              onMouseLeave={() => downIconRefs.current[`section-down-${index}`]?.stopAnimation?.()}
                            >
                              <ArrowDownIcon
                                ref={(el) => {
                                  downIconRefs.current[`section-down-${index}`] = el;
                                }}
                                size={16}
                                className="nav-anim-icon"
                              />
                            </button>

                            <input
                              type="number"
                              className="input admin-sorter-value"
                              value={row.sort_order ?? ""}
                              onChange={(e) => setSection(index, { sort_order: e.target.value })}
                            />
                          </div>
                        </td>

                        <td>
                          <input
                            className="input"
                            value={row.section_key}
                            onChange={(e) => setSection(index, { section_key: e.target.value })}
                          />
                        </td>

                        <td>
                          <input
                            className="input"
                            value={row.section_name}
                            onChange={(e) => setSection(index, { section_name: e.target.value })}
                          />
                        </td>

                        <td>
                          <textarea
                            className="cf-textarea"
                            rows={2}
                            value={row.section_description ?? ""}
                            onChange={(e) => setSection(index, { section_description: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {draft.sections.length === 0 && (
                <div className="admin-empty-note">Nog geen secties gevonden.</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-toolbar">
          <div className="admin-toolbar-title">
            <div className="admin-panel-title">Eigenschappen</div>
            <div className="admin-panel-subtitle">
              Eigenschappen gegroepeerd per categorie. Stel per eigenschap standaardwaarden in en voor welke installatiesoorten de eigenschap moet gelden.
            </div>
          </div>

          <div className="admin-toolbar-actions">
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
          </div>
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
                  onClick={() => setOpenSectionKeys((prev) => ({ ...prev, [sectionKey]: !isOpen }))}
                >
                  <div className="admin-section-head-main">
                    <div className="admin-section-title">
                      {section.section_name || "Zonder sectie"}
                    </div>
                    <div className="admin-section-sub">
                      {section.section_description || "Geen omschrijving"} · {compactCountLabel(fields.length, "eigenschap", "eigenschappen")}
                    </div>
                  </div>

                  <div className="admin-section-head-actions">
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
                        Nog geen eigenschappen in deze sectie.
                      </div>
                    ) : (
                      fields.map((row) => {
                        const fieldIndex = draft.fields.findIndex((x) => x === row);
                        if (fieldIndex < 0) return null;

                        const fieldOpenKey = row.field_key || `__field_${fieldIndex}`;
                        const isFieldOpen = openFieldKeys[fieldOpenKey] === true;
                        const applicabilityCount = Array.isArray(row.applicability_type_keys)
                          ? row.applicability_type_keys.length
                          : 0;
                        const optionsCount = Array.isArray(row.options) ? row.options.length : 0;

                        return (
                          <div key={`${row.field_key || "new"}:${fieldIndex}`} className="admin-subcard">
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
                                </div>

                                <div className="admin-compact-row-meta">
                                  <span className="admin-chip">{row.data_type}</span>
                                  <span className="admin-chip admin-chip--info">
                                    {applicabilityCount === 0 ? "alle types" : `${applicabilityCount} types`}
                                  </span>
                                  <span className="admin-chip admin-chip--muted-soft">
                                    {optionsCount} keuzes
                                  </span>
                                </div>
                              </div>

                              <div className="admin-compact-row-right">
                                {statusBadge(row.is_active)}
                                {isFieldOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                              </div>
                            </button>

                            {isFieldOpen && (
                              <div className="admin-subcard-body">
                                <div className="admin-toolbar">
                                  <div className="admin-toolbar-title">
                                    <div className="admin-subcard-title">Instellingen</div>
                                    <div className="admin-panel-subtitle">
                                      Detailinstellingen voor deze eigenschap.
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
                                        onClick={() => moveField(fieldIndex, "up")}
                                      >
                                        <ArrowUpIcon size={16} className="nav-anim-icon" />
                                      </button>

                                      <button
                                        type="button"
                                        className="admin-mini-icon-btn"
                                        title="Omlaag"
                                        disabled={fieldIndex === draft.fields.length - 1}
                                        onClick={() => moveField(fieldIndex, "down")}
                                      >
                                        <ArrowDownIcon size={16} className="nav-anim-icon" />
                                      </button>

                                      <input
                                        type="number"
                                        className="input admin-sorter-value"
                                        value={row.sort_order ?? ""}
                                        onChange={(e) => setField(fieldIndex, { sort_order: e.target.value })}
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="cf-grid">
                                  <div className="cf-row">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Field key</div>
                                    </div>
                                    <div className="cf-control">
                                      <input
                                        className="input"
                                        value={row.field_key}
                                        onChange={(e) => setField(fieldIndex, { field_key: e.target.value })}
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
                                        onChange={(e) => setField(fieldIndex, { display_name: e.target.value })}
                                      />
                                    </div>
                                  </div>

                                  <div className="cf-row">
                                    <div className="cf-label">
                                      <div className="cf-label-text">Datatype</div>
                                    </div>
                                    <div className="cf-control">
                                      <select
                                        className="input"
                                        value={row.data_type}
                                        onChange={(e) => setField(fieldIndex, { data_type: e.target.value })}
                                      >
                                        <option value="string">string</option>
                                        <option value="number">number</option>
                                        <option value="bool">bool</option>
                                        <option value="date">date</option>
                                        <option value="json">json</option>
                                      </select>
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
                                        onChange={(e) => setField(fieldIndex, { section_key: e.target.value || null })}
                                      >
                                        <option value="">— geen —</option>
                                        {draft.sections.map((s) => (
                                          <option key={s.section_key || `sec-${fieldIndex}`} value={s.section_key}>
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
                                        onChange={(e) => handleFieldActiveChange(fieldIndex, e.target.value === "1")}
                                      >
                                        <option value="1">Ja</option>
                                        <option value="0">Nee</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>

                                <div className="admin-subcard">
                                  <div className="admin-subcard-title">Toepasbaarheid</div>
                                  <div className="admin-check-grid">
                                    {installationTypes.map((type) => {
                                      const checked = (row.applicability_type_keys || []).includes(type.installation_type_key);

                                      return (
                                        <label key={type.installation_type_key} className="admin-check-row">
                                          <div className="admin-check-row-main">
                                            <div className="admin-check-row-title">{type.display_name}</div>
                                            <div className="admin-check-row-sub">{type.installation_type_key}</div>
                                          </div>

                                          <span className="admin-check-toggle">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => toggleFieldType(fieldIndex, type.installation_type_key)}
                                            />
                                            <span>van toepassing</span>
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>

                                  <div className="admin-info-inline">
                                    Geen geselecteerde installatiesoorten betekent: zichtbaar voor alle types.
                                  </div>
                                </div>

                                {row.data_type === "string" && (
                                  <div className="admin-subcard">
                                    <div className="admin-toolbar">
                                      <div className="admin-toolbar-title">
                                        <div className="admin-subcard-title">Keuzes</div>
                                        <div className="admin-panel-subtitle">
                                          Laat leeg als dit vrije tekst moet blijven.
                                        </div>
                                      </div>

                                      <div className="admin-toolbar-actions">
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          onClick={() => addOption(fieldIndex)}
                                        >
                                          <PlusIcon size={16} className="nav-anim-icon" />
                                          Keuze toevoegen
                                        </button>
                                      </div>
                                    </div>

                                    {(row.options || []).length === 0 ? (
                                      <div className="admin-empty-note">
                                        Geen vaste keuzes ingesteld.
                                      </div>
                                    ) : (
                                      <div className="admin-table-wrap">
                                        <table className="admin-table">
                                          <thead>
                                            <tr>
                                              <th className="admin-col-key">Waarde</th>
                                              <th className="admin-col-name">Label</th>
                                              <th className="admin-col-order">Sortering</th>
                                              <th className="admin-col-active">Actief</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(row.options || []).map((opt, optionIndex) => (
                                              <tr
                                                key={`${opt.option_value || "new"}:${optionIndex}`}
                                                className={!opt.is_active ? "admin-table-row--inactive" : ""}
                                              >
                                                <td>
                                                  <input
                                                    className="input"
                                                    value={opt.option_value}
                                                    onChange={(e) =>
                                                      setFieldOption(fieldIndex, optionIndex, {
                                                        option_value: e.target.value,
                                                      })
                                                    }
                                                  />
                                                </td>

                                                <td>
                                                  <input
                                                    className="input"
                                                    value={opt.option_label}
                                                    onChange={(e) =>
                                                      setFieldOption(fieldIndex, optionIndex, {
                                                        option_label: e.target.value,
                                                      })
                                                    }
                                                  />
                                                </td>

                                                <td>
                                                  <input
                                                    type="number"
                                                    className="input"
                                                    value={opt.sort_order ?? ""}
                                                    onChange={(e) =>
                                                      setFieldOption(fieldIndex, optionIndex, {
                                                        sort_order: e.target.value,
                                                      })
                                                    }
                                                  />
                                                </td>

                                                <td>
                                                  <select
                                                    className="input"
                                                    value={opt.is_active ? "1" : "0"}
                                                    onChange={(e) =>
                                                      setFieldOption(fieldIndex, optionIndex, {
                                                        is_active: e.target.value === "1",
                                                      })
                                                    }
                                                  >
                                                    <option value="1">Ja</option>
                                                    <option value="0">Nee</option>
                                                  </select>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
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

export default AdminInstallationFieldsTab;