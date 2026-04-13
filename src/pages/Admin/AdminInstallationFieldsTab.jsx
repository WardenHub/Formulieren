// src/pages/Admin/AdminInstallationFieldsTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

function buildDraft(catalog) {
  const sections = Array.isArray(catalog?.sections)
    ? catalog.sections.map((x, index) => ({
        section_key: x.section_key ?? "",
        section_name: x.section_name ?? "",
        section_description: x.section_description ?? "",
        sort_order: x.sort_order ?? (index + 1) * 10,
      }))
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
    ? catalog.customFields.map((x, index) => ({
        field_key: x.field_key ?? "",
        display_name: x.display_name ?? "",
        data_type: x.data_type ?? "string",
        section_key: x.section_key ?? "",
        sort_order: x.sort_order ?? (index + 1) * 10,
        is_active: x.is_active ?? true,
        options: optionsByFieldKey.get(x.field_key) || [],
        applicability_type_keys: applicabilityByFieldKey.get(x.field_key) || [],
      }))
    : [];

  return { sections, fields };
}

const AdminInstallationFieldsTab = forwardRef(function AdminInstallationFieldsTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSaveSections, onSaveFields },
  ref
) {
  const [draft, setDraft] = useState({ sections: [], fields: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(buildDraft(catalog));
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
  }

  function addField() {
    setDraft((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          field_key: "",
          display_name: "",
          data_type: "string",
          section_key: "",
          sort_order: (prev.fields.length + 1) * 10,
          is_active: true,
          options: [],
          applicability_type_keys: [],
        },
      ],
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
      await onSaveSections?.(draft.sections);
      await onSaveFields?.(draft.fields);
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
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          padding: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600 }}>Secties</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Beheer van formuliersecties voor installatie-eigenschappen en documenttypes.
            </div>
          </div>

          <button type="button" className="btn btn-secondary" onClick={addSection}>
            Sectie toevoegen
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {draft.sections.map((row, index) => (
            <div
              key={`${row.section_key || "new"}:${index}`}
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className="cf-grid">
                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Key</div></div>
                  <div className="cf-control">
                    <input className="input" value={row.section_key} onChange={(e) => setSection(index, { section_key: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Naam</div></div>
                  <div className="cf-control">
                    <input className="input" value={row.section_name} onChange={(e) => setSection(index, { section_name: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Sortering</div></div>
                  <div className="cf-control">
                    <input type="number" className="input" value={row.sort_order ?? ""} onChange={(e) => setSection(index, { sort_order: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row wide">
                  <div className="cf-label"><div className="cf-label-text">Omschrijving</div></div>
                  <div className="cf-control">
                    <textarea className="cf-textarea" rows={3} value={row.section_description ?? ""} onChange={(e) => setSection(index, { section_description: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600 }}>Custom eigenschappen</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Beheer definities, opties en toepasbaarheid per installatiesoort.
            </div>
          </div>

          <button type="button" className="btn btn-secondary" onClick={addField}>
            Eigenschap toevoegen
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {draft.fields.map((row, index) => (
            <div
              key={`${row.field_key || "new"}:${index}`}
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                display: "grid",
                gap: 12,
              }}
            >
              <div className="cf-grid">
                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Field key</div></div>
                  <div className="cf-control">
                    <input className="input" value={row.field_key} onChange={(e) => setField(index, { field_key: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Label</div></div>
                  <div className="cf-control">
                    <input className="input" value={row.display_name} onChange={(e) => setField(index, { display_name: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Datatype</div></div>
                  <div className="cf-control">
                    <select className="input" value={row.data_type} onChange={(e) => setField(index, { data_type: e.target.value })}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="bool">bool</option>
                      <option value="date">date</option>
                      <option value="json">json</option>
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Sectie</div></div>
                  <div className="cf-control">
                    <select className="input" value={row.section_key ?? ""} onChange={(e) => setField(index, { section_key: e.target.value || null })}>
                      <option value="">— geen —</option>
                      {draft.sections.map((s) => (
                        <option key={s.section_key || `sec-${index}`} value={s.section_key}>
                          {s.section_name || s.section_key}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Sortering</div></div>
                  <div className="cf-control">
                    <input type="number" className="input" value={row.sort_order ?? ""} onChange={(e) => setField(index, { sort_order: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Actief</div></div>
                  <div className="cf-control">
                    <select className="input" value={row.is_active ? "1" : "0"} onChange={(e) => setField(index, { is_active: e.target.value === "1" })}>
                      <option value="1">Ja</option>
                      <option value="0">Nee</option>
                    </select>
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 600 }}>Toepasbaarheid</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {installationTypes.map((type) => {
                    const checked = (row.applicability_type_keys || []).includes(type.installation_type_key);
                    return (
                      <label
                        key={type.installation_type_key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 10,
                          cursor: "pointer",
                        }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleFieldType(index, type.installation_type_key)} />
                        <span>{type.display_name}</span>
                        <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
                          {type.installation_type_key}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {row.data_type === "string" && (
                <div
                  style={{
                    padding: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ fontWeight: 600 }}>Keuzes</div>
                    <button type="button" className="btn btn-secondary" onClick={() => addOption(index)}>
                      Keuze toevoegen
                    </button>
                  </div>

                  {(row.options || []).length === 0 ? (
                    <div className="muted" style={{ fontSize: 13 }}>
                      Geen vaste keuzes. Dit veld blijft vrije tekst.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {(row.options || []).map((opt, optionIndex) => (
                        <div
                          key={`${opt.option_value || "new"}:${optionIndex}`}
                          style={{
                            padding: 10,
                            border: "1px solid rgba(255,255,255,0.10)",
                            borderRadius: 10,
                            display: "grid",
                            gap: 10,
                          }}
                        >
                          <div className="cf-grid">
                            <div className="cf-row">
                              <div className="cf-label"><div className="cf-label-text">Waarde</div></div>
                              <div className="cf-control">
                                <input className="input" value={opt.option_value} onChange={(e) => setFieldOption(index, optionIndex, { option_value: e.target.value })} />
                              </div>
                            </div>

                            <div className="cf-row">
                              <div className="cf-label"><div className="cf-label-text">Label</div></div>
                              <div className="cf-control">
                                <input className="input" value={opt.option_label} onChange={(e) => setFieldOption(index, optionIndex, { option_label: e.target.value })} />
                              </div>
                            </div>

                            <div className="cf-row">
                              <div className="cf-label"><div className="cf-label-text">Sortering</div></div>
                              <div className="cf-control">
                                <input type="number" className="input" value={opt.sort_order ?? ""} onChange={(e) => setFieldOption(index, optionIndex, { sort_order: e.target.value })} />
                              </div>
                            </div>

                            <div className="cf-row">
                              <div className="cf-label"><div className="cf-label-text">Actief</div></div>
                              <div className="cf-control">
                                <select className="input" value={opt.is_active ? "1" : "0"} onChange={(e) => setFieldOption(index, optionIndex, { is_active: e.target.value === "1" })}>
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
          ))}
        </div>
      </div>
    </div>
  );
});

export default AdminInstallationFieldsTab;