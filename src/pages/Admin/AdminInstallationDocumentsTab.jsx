// src/pages/Admin/AdminInstallationDocumentsTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

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
    ? catalog.documentTypes.map((x, index) => ({
        document_type_key: x.document_type_key ?? "",
        document_type_name: x.document_type_name ?? "",
        section_key: x.section_key ?? "",
        sort_order: x.sort_order ?? (index + 1) * 10,
        is_active: x.is_active ?? true,
        applicability_type_keys: applicabilityByDocType.get(x.document_type_key) || [],
        required_type_keys: requiredByDocType.get(x.document_type_key) || [],
      }))
    : [];
}

const AdminInstallationDocumentsTab = forwardRef(function AdminInstallationDocumentsTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSave },
  ref
) {
  const [draft, setDraft] = useState([]);
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

  const sections = Array.isArray(catalog?.sections) ? catalog.sections : [];
  const installationTypes = Array.isArray(catalog?.installationTypes) ? catalog.installationTypes : [];

  function setRow(index, patch) {
    setDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
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

        if (!applicability.has(typeKey) && applicability.size > 0) {
          return row;
        }

        if (required.has(typeKey)) required.delete(typeKey);
        else required.add(typeKey);

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
      await onSave?.(draft);
      onSaveOk?.();
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  if (loading && draft.length === 0) {
    return <div className="muted">laden; documenttypes</div>;
  }

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600 }}>Documenttypes</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Beheer documenttypes, toepasbaarheid en verplichtheid per installatiesoort.
          </div>
        </div>

        <button type="button" className="btn btn-secondary" onClick={addRow}>
          Documenttype toevoegen
        </button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {draft.map((row, index) => {
          const applicabilitySet = new Set(row.applicability_type_keys || []);
          const requiredSet = new Set(row.required_type_keys || []);

          return (
            <div
              key={`${row.document_type_key || "new"}:${index}`}
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
                  <div className="cf-label"><div className="cf-label-text">Key</div></div>
                  <div className="cf-control">
                    <input className="input" value={row.document_type_key} onChange={(e) => setRow(index, { document_type_key: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Naam</div></div>
                  <div className="cf-control">
                    <input className="input" value={row.document_type_name} onChange={(e) => setRow(index, { document_type_name: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Sectie</div></div>
                  <div className="cf-control">
                    <select className="input" value={row.section_key ?? ""} onChange={(e) => setRow(index, { section_key: e.target.value || null })}>
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
                  <div className="cf-label"><div className="cf-label-text">Sortering</div></div>
                  <div className="cf-control">
                    <input type="number" className="input" value={row.sort_order ?? ""} onChange={(e) => setRow(index, { sort_order: e.target.value })} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Actief</div></div>
                  <div className="cf-control">
                    <select className="input" value={row.is_active ? "1" : "0"} onChange={(e) => setRow(index, { is_active: e.target.value === "1" })}>
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
                <div style={{ fontWeight: 600 }}>Toepasbaarheid en verplichtheid</div>

                <div style={{ display: "grid", gap: 8 }}>
                  {installationTypes.map((type) => {
                    const applicable = applicabilitySet.has(type.installation_type_key);
                    const required = requiredSet.has(type.installation_type_key);
                    const allTypesImplicit = applicabilitySet.size === 0;

                    return (
                      <div
                        key={type.installation_type_key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1fr) auto auto",
                          gap: 12,
                          alignItems: "center",
                          padding: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 10,
                        }}
                      >
                        <div>
                          <div>{type.display_name}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {type.installation_type_key}
                          </div>
                        </div>

                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" checked={applicable} onChange={() => toggleApplicability(index, type.installation_type_key)} />
                          <span>van toepassing</span>
                        </label>

                        <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: applicable || allTypesImplicit ? 1 : 0.55 }}>
                          <input
                            type="checkbox"
                            checked={required}
                            disabled={!applicable && !allTypesImplicit}
                            onChange={() => toggleRequired(index, type.installation_type_key)}
                          />
                          <span>verplicht</span>
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  Geen geselecteerde toepasbaarheid betekent: zichtbaar voor alle installatiesoorten. Verplichtheid wordt altijd per installatiesoort vastgelegd.
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default AdminInstallationDocumentsTab;