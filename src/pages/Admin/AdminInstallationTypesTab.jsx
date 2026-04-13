// src/pages/Admin/AdminInstallationTypesTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

function normalizeDraft(catalog) {
  return Array.isArray(catalog?.installationTypes)
    ? catalog.installationTypes.map((x, index) => ({
        installation_type_key: x.installation_type_key ?? "",
        display_name: x.display_name ?? "",
        sort_order: x.sort_order ?? (index + 1) * 10,
        is_active: x.is_active ?? true,
      }))
    : [];
}

const AdminInstallationTypesTab = forwardRef(function AdminInstallationTypesTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSave },
  ref
) {
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizeDraft(catalog));
  }, [catalog]);

  const baseSnapshot = useMemo(() => JSON.stringify(normalizeDraft(catalog)), [catalog]);
  const currentSnapshot = useMemo(() => JSON.stringify(draft), [draft]);
  const isDirty = baseSnapshot !== currentSnapshot;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  function setRow(index, patch) {
    setDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setDraft((prev) => [
      ...prev,
      {
        installation_type_key: "",
        display_name: "",
        sort_order: (prev.length + 1) * 10,
        is_active: true,
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
    return <div className="muted">laden; installatiesoorten</div>;
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
          <div style={{ fontWeight: 600 }}>Installatiesoorten</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Beheer de Ember-installatiesoorten. Alt+S slaat op.
          </div>
        </div>

        <button type="button" className="btn btn-secondary" onClick={addRow}>
          Toevoegen
        </button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {draft.map((row, index) => (
          <div
            key={`${row.installation_type_key || "new"}:${index}`}
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
                  <input
                    className="input"
                    value={row.installation_type_key}
                    onChange={(e) => setRow(index, { installation_type_key: e.target.value })}
                  />
                </div>
              </div>

              <div className="cf-row">
                <div className="cf-label"><div className="cf-label-text">Naam</div></div>
                <div className="cf-control">
                  <input
                    className="input"
                    value={row.display_name}
                    onChange={(e) => setRow(index, { display_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="cf-row">
                <div className="cf-label"><div className="cf-label-text">Sortering</div></div>
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
                <div className="cf-label"><div className="cf-label-text">Actief</div></div>
                <div className="cf-control">
                  <select
                    className="input"
                    value={row.is_active ? "1" : "0"}
                    onChange={(e) => setRow(index, { is_active: e.target.value === "1" })}
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
    </div>
  );
});

export default AdminInstallationTypesTab;