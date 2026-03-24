// /src/pages/Admin/AdminFormsConfigTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

function normalizeNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDraftFromForm(selectedForm) {
  if (!selectedForm) return null;

  return {
    form_id: selectedForm.form_id,
    code: selectedForm.code,
    name: selectedForm.name ?? "",
    description: selectedForm.description ?? "",
    status: selectedForm.status ?? "A",
    applicability_type_keys: [...(selectedForm.applicability_type_keys || [])],
    preflight: {
      requires_type: Boolean(selectedForm.preflight?.requires_type),
      perf_min_rows: selectedForm.preflight?.perf_min_rows ?? null,
      perf_severity: selectedForm.preflight?.perf_severity ?? "warning",
      energy_min_rows: selectedForm.preflight?.energy_min_rows ?? null,
      energy_severity: selectedForm.preflight?.energy_severity ?? "warning",
      custom_min_filled: selectedForm.preflight?.custom_min_filled ?? null,
      custom_severity: selectedForm.preflight?.custom_severity ?? "warning",
      is_active: selectedForm.preflight?.is_active ?? true,
    },
  };
}

function statusLabel(status) {
  if (status === "A") return "Actief";
  if (status === "M") return "Alleen beheer";
  if (status === "I") return "Niet actief";
  return status || "Onbekend";
}

const AdminFormsConfigTab = forwardRef(function AdminFormsConfigTab(
  {
    forms,
    selectedFormId,
    selectedForm,
    installationTypes,
    onSelectForm,
    onDirtyChange,
    onSavingChange,
    onSaveOk,
    onSaveConfig,
  },
  ref
) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizeDraftFromForm(selectedForm));
  }, [selectedForm]);

  const baseSnapshot = useMemo(() => {
    return normalizeDraftFromForm(selectedForm);
  }, [selectedForm]);

  const isDirty = useMemo(() => {
    if (!draft && !baseSnapshot) return false;
    return JSON.stringify(draft) !== JSON.stringify(baseSnapshot);
  }, [draft, baseSnapshot]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  const selectedTypeKeysSet = useMemo(() => {
    return new Set(draft?.applicability_type_keys || []);
  }, [draft]);

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function setPreflightField(key, value) {
    setDraft((prev) => ({
      ...prev,
      preflight: {
        ...prev.preflight,
        [key]: value,
      },
    }));
  }

  function toggleType(typeKey) {
    setDraft((prev) => {
      const set = new Set(prev.applicability_type_keys || []);
      if (set.has(typeKey)) set.delete(typeKey);
      else set.add(typeKey);

      return {
        ...prev,
        applicability_type_keys: Array.from(set),
      };
    });
  }

  async function save() {
    if (!draft || saving || !isDirty) return;

    setSaving(true);

    try {
      await Promise.resolve();

      onSaveConfig({
        ...draft,
        preflight: {
          ...draft.preflight,
          perf_min_rows: normalizeNullableNumber(draft.preflight.perf_min_rows),
          energy_min_rows: normalizeNullableNumber(draft.preflight.energy_min_rows),
          custom_min_filled: normalizeNullableNumber(draft.preflight.custom_min_filled),
        },
      });

      onSaveOk?.();
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          padding: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>Formulieren</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Alt+S slaat wijzigingen in deze tab op.
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {forms.map((form) => {
            const isSelected = form.form_id === selectedFormId;

            return (
              <div
                key={form.form_id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectForm(form.form_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectForm(form.form_id);
                  }
                }}
                style={{
                  padding: 12,
                  border: isSelected
                    ? "1px solid rgba(255,255,255,0.32)"
                    : "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  background: isSelected ? "rgba(255,255,255,0.04)" : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                  cursor: "pointer",
                  outline: "none",
                }}
                title="Selecteer formulier"
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{form.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {form.code}
                  </div>
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  {statusLabel(form.status)}
                </div>
              </div>
            );
          })}
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
        <div style={{ fontWeight: 600 }}>
          Configuratie {selectedForm ? `; ${selectedForm.name}` : ""}
        </div>

        {!draft ? (
          <div className="muted">Geen formulier geselecteerd.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>Algemeen</div>

              <div className="cf-grid">
                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Code</div>
                  </div>
                  <div className="cf-control">
                    <input className="input" value={draft.code} readOnly />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Naam</div>
                  </div>
                  <div className="cf-control">
                    <input
                      className="input"
                      value={draft.name}
                      onChange={(e) => setField("name", e.target.value)}
                    />
                  </div>
                </div>

                <div className="cf-row wide">
                  <div className="cf-label">
                    <div className="cf-label-text">Omschrijving</div>
                  </div>
                  <div className="cf-control">
                    <textarea
                      rows={4}
                      className="cf-textarea"
                      value={draft.description}
                      onChange={(e) => setField("description", e.target.value)}
                    />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Status</div>
                  </div>
                  <div className="cf-control">
                    <select
                      className="input"
                      value={draft.status}
                      onChange={(e) => setField("status", e.target.value)}
                    >
                      <option value="A">Actief</option>
                      <option value="M">Alleen beheer</option>
                      <option value="I">Niet actief</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>Toepasbaarheid</div>

              <div className="muted" style={{ fontSize: 13 }}>
                Geen geselecteerde installatietypes betekent; beschikbaar voor alle types.
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {installationTypes.map((type) => {
                  const checked = selectedTypeKeysSet.has(type.installation_type_key);

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
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleType(type.installation_type_key)}
                      />
                      <span>{type.display_name}</span>
                      <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
                        {type.installation_type_key}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>Preflight</div>

              <div className="cf-grid">
                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Preflight actief</div>
                  </div>
                  <div className="cf-control">
                    <select
                      className="input"
                      value={draft.preflight.is_active ? "1" : "0"}
                      onChange={(e) => setPreflightField("is_active", e.target.value === "1")}
                    >
                      <option value="1">Ja</option>
                      <option value="0">Nee</option>
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Installatietype vereist</div>
                  </div>
                  <div className="cf-control">
                    <select
                      className="input"
                      value={draft.preflight.requires_type ? "1" : "0"}
                      onChange={(e) => setPreflightField("requires_type", e.target.value === "1")}
                    >
                      <option value="1">Ja</option>
                      <option value="0">Nee</option>
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Min. prestatie-eisen rijen</div>
                  </div>
                  <div className="cf-control">
                    <input
                      type="number"
                      className="input"
                      value={draft.preflight.perf_min_rows ?? ""}
                      onChange={(e) => setPreflightField("perf_min_rows", e.target.value)}
                    />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Prestatie-eisen severity</div>
                  </div>
                  <div className="cf-control">
                    <select
                      className="input"
                      value={draft.preflight.perf_severity}
                      onChange={(e) => setPreflightField("perf_severity", e.target.value)}
                    >
                      <option value="blocking">blocking</option>
                      <option value="warning">warning</option>
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Min. energievoorziening rijen</div>
                  </div>
                  <div className="cf-control">
                    <input
                      type="number"
                      className="input"
                      value={draft.preflight.energy_min_rows ?? ""}
                      onChange={(e) => setPreflightField("energy_min_rows", e.target.value)}
                    />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Energie severity</div>
                  </div>
                  <div className="cf-control">
                    <select
                      className="input"
                      value={draft.preflight.energy_severity}
                      onChange={(e) => setPreflightField("energy_severity", e.target.value)}
                    >
                      <option value="blocking">blocking</option>
                      <option value="warning">warning</option>
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Min. gevulde eigenschappen</div>
                  </div>
                  <div className="cf-control">
                    <input
                      type="number"
                      className="input"
                      value={draft.preflight.custom_min_filled ?? ""}
                      onChange={(e) => setPreflightField("custom_min_filled", e.target.value)}
                    />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Eigenschappen severity</div>
                  </div>
                  <div className="cf-control">
                    <select
                      className="input"
                      value={draft.preflight.custom_severity}
                      onChange={(e) => setPreflightField("custom_severity", e.target.value)}
                    >
                      <option value="blocking">blocking</option>
                      <option value="warning">warning</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default AdminFormsConfigTab;