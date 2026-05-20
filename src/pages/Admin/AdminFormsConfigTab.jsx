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

function statusTone(status) {
  if (status === "A") return "success";
  if (status === "M") return "warning";
  if (status === "I") return "muted";
  return "neutral";
}

function severityLabel(value) {
  if (value === "blocking") return "Blokkerend";
  if (value === "warning") return "Waarschuwing";
  return value || "-";
}

function severityTone(value) {
  if (value === "blocking") return "danger";
  if (value === "warning") return "warning";
  return "muted";
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

function SectionHeader({ title, subtitle, children }) {
  return (
    <div className="admin-toolbar">
      <div className="admin-toolbar-title">
        <div className="admin-subcard-title">{title}</div>
        {subtitle ? <div className="admin-panel-subtitle">{subtitle}</div> : null}
      </div>

      {children ? <div className="admin-toolbar-actions">{children}</div> : null}
    </div>
  );
}

const AdminFormsConfigTab = forwardRef(function AdminFormsConfigTab(
  {
    forms,
    selectedFormId,
    selectedForm,
    installationTypes,
    loading,
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

      if (set.has(typeKey)) {
        set.delete(typeKey);
      } else {
        set.add(typeKey);
      }

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
      await onSaveConfig?.({
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

  if (loading && !selectedForm) {
    return <div className="muted">laden; formulierconfiguratie</div>;
  }

  return (
    <div className="admin-grid">
      <AdminPanel
        title="Formulieren"
        subtitle="Selecteer een formulier om de configuratie te beheren. Alt+S slaat wijzigingen in deze tab op."
      >
        <div className="admin-check-grid">
          {(Array.isArray(forms) ? forms : []).map((form) => {
            const isSelected = form.form_id === selectedFormId;

            return (
              <div
                key={form.form_id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectForm?.(form.form_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectForm?.(form.form_id);
                  }
                }}
                className={`admin-compact-row ${isSelected ? "ember-accent-active" : ""}`}
                title="Selecteer formulier"
              >
                <div className="admin-compact-row-main">
                  <div className="admin-compact-row-title-wrap">
                    <div className="admin-compact-row-title">{form.name}</div>
                    <div className="admin-compact-row-sub">{form.code}</div>

                    <div className="ember-label-row admin-inline-labels">
                      <span className={`ember-label ember-label--${statusTone(form.status)}`}>
                        {statusLabel(form.status)}
                      </span>

                      <span className="ember-label ember-label--muted">
                        laatste versie; {form.latest_version_label ?? "-"}
                      </span>

                      <span className="ember-label ember-label--muted">
                        {form.version_count ?? 0} versie(s)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </AdminPanel>

      <AdminPanel
        title={`Configuratie${selectedForm ? `; ${selectedForm.name}` : ""}`}
        subtitle={
          selectedForm
            ? "Beheer formuliermetadata, beschikbaarheid en preflight-controles."
            : "Selecteer eerst een formulier."
        }
        actions={
          draft ? (
            <div className="ember-label-row">
              <span className={`ember-label ember-label--${statusTone(draft.status)}`}>
                {statusLabel(draft.status)}
              </span>

              {isDirty ? (
                <span className="ember-label ember-label--warning">Niet opgeslagen</span>
              ) : (
                <span className="ember-label ember-label--success">Opgeslagen</span>
              )}
            </div>
          ) : null
        }
      >
        {!draft ? (
          <div className="admin-empty-note">Geen formulier geselecteerd.</div>
        ) : (
          <div className="admin-check-grid">
            <div className="admin-subcard">
              <SectionHeader
                title="Algemeen"
                subtitle="Basisgegevens van de formulierdefinitie. De code blijft stabiel voor runtime-koppelingen."
              />

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

            <div className="admin-subcard">
              <SectionHeader
                title="Toepasbaarheid"
                subtitle="Geen geselecteerde installatietypes betekent; beschikbaar voor alle types."
              >
                <span className="ember-label ember-label--muted">
                  {draft.applicability_type_keys.length || "alle"} geselecteerd
                </span>
              </SectionHeader>

              <div className="admin-check-grid">
                {(Array.isArray(installationTypes) ? installationTypes : []).map((type) => {
                  const checked = selectedTypeKeysSet.has(type.installation_type_key);

                  return (
                    <label
                      key={type.installation_type_key}
                      className={`admin-compact-row ${checked ? "ember-accent-active" : ""}`}
                    >
                      <div className="admin-compact-row-main">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleType(type.installation_type_key)}
                        />

                        <div className="admin-compact-row-title-wrap">
                          <div className="admin-compact-row-title">{type.display_name}</div>
                          <div className="admin-compact-row-sub">{type.installation_type_key}</div>
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

            <div className="admin-subcard">
              <SectionHeader
                title="Preflight"
                subtitle="Controles die bepalen of een gebruiker een formulier veilig kan starten."
              >
                <div className="ember-label-row">
                  <span
                    className={
                      draft.preflight.is_active
                        ? "ember-label ember-label--success"
                        : "ember-label ember-label--muted"
                    }
                  >
                    {draft.preflight.is_active ? "Actief" : "Uit"}
                  </span>

                  <span
                    className={
                      draft.preflight.requires_type
                        ? "ember-label ember-label--warning"
                        : "ember-label ember-label--muted"
                    }
                  >
                    {draft.preflight.requires_type ? "Type vereist" : "Type optioneel"}
                  </span>
                </div>
              </SectionHeader>

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
                      <option value="blocking">Blokkerend</option>
                      <option value="warning">Waarschuwing</option>
                    </select>

                    <div className="ember-label-row admin-inline-labels">
                      <span
                        className={`ember-label ember-label--${severityTone(
                          draft.preflight.perf_severity
                        )}`}
                      >
                        {severityLabel(draft.preflight.perf_severity)}
                      </span>
                    </div>
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
                      <option value="blocking">Blokkerend</option>
                      <option value="warning">Waarschuwing</option>
                    </select>

                    <div className="ember-label-row admin-inline-labels">
                      <span
                        className={`ember-label ember-label--${severityTone(
                          draft.preflight.energy_severity
                        )}`}
                      >
                        {severityLabel(draft.preflight.energy_severity)}
                      </span>
                    </div>
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
                      <option value="blocking">Blokkerend</option>
                      <option value="warning">Waarschuwing</option>
                    </select>

                    <div className="ember-label-row admin-inline-labels">
                      <span
                        className={`ember-label ember-label--${severityTone(
                          draft.preflight.custom_severity
                        )}`}
                      >
                        {severityLabel(draft.preflight.custom_severity)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
});

export default AdminFormsConfigTab;