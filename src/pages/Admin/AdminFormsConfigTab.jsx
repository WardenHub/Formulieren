// /src/pages/Admin/AdminFormsConfigTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

function normalizeNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const DOCUMENT_PROFILE_OPTIONS = [
  { value: "", label: "Niet ingesteld" },
  { value: "certified_maintenance_report", label: "Gecertificeerd onderhoudsrapport" },
  { value: "commissioning_report", label: "Rapport van oplevering" },
  { value: "maintenance_plan", label: "Onderhoudsplan" },
  { value: "measurement_report", label: "Meetrapport" },
  { value: "audit_report", label: "Auditrapport" },
  { value: "safety_form", label: "Veiligheidsformulier" },
  { value: "analysis_form", label: "Analyseformulier" },
  { value: "intake_report", label: "Intakeformulier" },
];

const WORKFLOW_PROFILE_OPTIONS = [
  { value: "", label: "Niet ingesteld" },
  { value: "standard", label: "Standaard" },
  { value: "certified_maintenance", label: "Gecertificeerd onderhoud" },
];

const CONTEXT_OPTIONS = [
  { value: "RELATION", label: "Relatie" },
  { value: "PROJECT", label: "Project" },
  { value: "WORK_ORDER", label: "Werkbon" },
  { value: "INSTALLATION", label: "Installatie" },
  { value: "EMPLOYEE", label: "Medewerker" },
];

const FOLLOW_UP_TRIGGER_OPTIONS = [
  { value: "ON_SUBMIT", label: "Bij opslaan of indienen" },
  { value: "ON_FINALIZE", label: "Bij definitief afronden" },
  { value: "CONDITIONAL", label: "Als een voorwaarde waar is" },
];

function newFollowUpRule(index) {
  return {
    form_follow_up_rule_id: null,
    _client_key: `new-${Date.now()}-${index}`,
    trigger_type: "ON_FINALIZE",
    condition_json_text: "",
    action_title_template: "",
    action_description_template: "",
    category: "",
    priority: "NORMAL",
    responsibility_type: "WARDENBURG",
    assigned_role_code: "",
    due_after_days: null,
    certificate_impact: "",
    visibility: "INTERNAL_ONLY",
    sort_order: (index + 1) * 10,
    is_active: true,
  };
}

function normalizeDraftFromForm(selectedForm) {
  if (!selectedForm) return null;

  return {
    form_id: selectedForm.form_id,
    code: selectedForm.code,
    name: selectedForm.name ?? "",
    description: selectedForm.description ?? "",
    document_profile_key: selectedForm.document_profile_key ?? "",
    workflow_profile_key: selectedForm.workflow_profile_key ?? "",
    official_document_number: selectedForm.official_document_number ?? "",
    owner_department: selectedForm.owner_department ?? "",
    owner_display_name: selectedForm.owner_display_name ?? "",
    knowledge_base_reference: selectedForm.knowledge_base_reference ?? "",
    requires_installation_review: Boolean(selectedForm.requires_installation_review),
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
    context_rules: (selectedForm.context_rules || []).map((rule) => ({ ...rule })),
    follow_up_rules: (selectedForm.follow_up_rules || []).map((rule, index) => ({
      ...rule,
      _client_key: rule.form_follow_up_rule_id || `loaded-${index}`,
      condition_json_text: rule.condition ? JSON.stringify(rule.condition, null, 2) : "",
    })),
    workflow_roles: (selectedForm.workflow_roles || []).map((role) => ({ ...role })),
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

  function toggleContext(contextType) {
    setDraft((prev) => {
      const current = prev.context_rules || [];
      const existing = current.find((rule) => rule.context_type === contextType);
      if (existing) {
        const remaining = current.filter((rule) => rule.context_type !== contextType);
        if (existing.is_primary && remaining.length > 0) remaining[0] = { ...remaining[0], is_primary: true };
        return { ...prev, context_rules: remaining };
      }
      const next = [...current, {
        context_type: contextType,
        is_required: false,
        is_primary: current.length === 0,
        selection_order: (current.length + 1) * 10,
        is_active: true,
      }];
      return { ...prev, context_rules: next };
    });
  }

  function setContextField(contextType, key, value) {
    setDraft((prev) => ({
      ...prev,
      context_rules: (prev.context_rules || []).map((rule) => {
        if (key === "is_primary") {
          return { ...rule, is_primary: rule.context_type === contextType ? value : false };
        }
        return rule.context_type === contextType ? { ...rule, [key]: value } : rule;
      }),
    }));
  }

  function addFollowUpRule() {
    setDraft((prev) => ({
      ...prev,
      follow_up_rules: [...(prev.follow_up_rules || []), newFollowUpRule((prev.follow_up_rules || []).length)],
    }));
  }

  function setFollowUpRuleField(index, key, value) {
    setDraft((prev) => ({
      ...prev,
      follow_up_rules: (prev.follow_up_rules || []).map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, [key]: value } : rule
      ),
    }));
  }

  function removeFollowUpRule(index) {
    setDraft((prev) => ({
      ...prev,
      follow_up_rules: (prev.follow_up_rules || []).filter((_rule, ruleIndex) => ruleIndex !== index),
    }));
  }

  async function save() {
    if (!draft || saving || !isDirty) return;

    setSaving(true);

    try {
      await onSaveConfig?.({
        ...draft,
        follow_up_rules: (draft.follow_up_rules || []).map((rule, index) => ({
          ...rule,
          condition: rule.condition_json_text,
          due_after_days: normalizeNullableNumber(rule.due_after_days),
          sort_order: normalizeNullableNumber(rule.sort_order) ?? (index + 1) * 10,
          _client_key: undefined,
          condition_json_text: undefined,
        })),
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
            ? "Beheer formuliermetadata, context, beschikbaarheid en automatische opvolging."
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
                  <div className="cf-label"><div className="cf-label-text">Verantwoordelijke afdeling</div></div>
                  <div className="cf-control">
                    <input className="input" value={draft.owner_department} onChange={(e) => setField("owner_department", e.target.value)} />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Functioneel eigenaar</div></div>
                  <div className="cf-control">
                    <input className="input" value={draft.owner_display_name} onChange={(e) => setField("owner_display_name", e.target.value)} />
                  </div>
                </div>

                <div className="cf-row wide">
                  <div className="cf-label"><div className="cf-label-text">Kennisbankverwijzing</div></div>
                  <div className="cf-control">
                    <input className="input" value={draft.knowledge_base_reference} onChange={(e) => setField("knowledge_base_reference", e.target.value)} placeholder="URL of herkenbare paginaverwijzing" />
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label"><div className="cf-label-text">Installatiebeoordeling vereist</div></div>
                  <div className="cf-control">
                    <select className="input" value={draft.requires_installation_review ? "1" : "0"} onChange={(e) => setField("requires_installation_review", e.target.value === "1")}>
                      <option value="0">Nee</option>
                      <option value="1">Ja</option>
                    </select>
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
                    <div className="cf-label-text">Documentsoort</div>
                  </div>

                  <div className="cf-control">
                    <select
                      className="input"
                      value={draft.document_profile_key ?? ""}
                      onChange={(e) => setField("document_profile_key", e.target.value)}
                    >
                      {DOCUMENT_PROFILE_OPTIONS.map((option) => (
                        <option key={option.value || "empty"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Workflowprofiel</div>
                  </div>

                  <div className="cf-control">
                    <select
                      className="input"
                      value={draft.workflow_profile_key ?? ""}
                      onChange={(e) => setField("workflow_profile_key", e.target.value)}
                    >
                      {WORKFLOW_PROFILE_OPTIONS.map((option) => (
                        <option key={option.value || "empty"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Officieel documentnummer</div>
                  </div>

                  <div className="cf-control">
                    <input
                      className="input"
                      value={draft.official_document_number ?? ""}
                      onChange={(e) => setField("official_document_number", e.target.value)}
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
                title="Formuliercontext"
                subtitle="Bepaal aan welke bedrijfsobjecten een formulier wordt gekoppeld. Kies bij gebruik precies één primaire context."
              >
                <span className="ember-label ember-label--muted">{draft.context_rules.length} actief</span>
              </SectionHeader>

              <div className="admin-check-grid">
                {CONTEXT_OPTIONS.map((option) => {
                  const rule = draft.context_rules.find((item) => item.context_type === option.value);
                  return (
                    <div key={option.value} className={`admin-compact-row ${rule ? "ember-accent-active" : ""}`}>
                      <div className="admin-compact-row-main">
                        <input type="checkbox" checked={Boolean(rule)} onChange={() => toggleContext(option.value)} />
                        <div className="admin-compact-row-title-wrap">
                          <div className="admin-compact-row-title">{option.label}</div>
                          <div className="admin-compact-row-sub">{option.value}</div>
                        </div>
                      </div>
                      {rule ? (
                        <div className="admin-compact-row-right ember-label-row">
                          <label className="ember-label ember-label--muted">
                            <input type="checkbox" checked={Boolean(rule.is_required)} onChange={(e) => setContextField(option.value, "is_required", e.target.checked)} /> verplicht
                          </label>
                          <label className="ember-label ember-label--muted">
                            <input type="radio" name="primary-form-context" checked={Boolean(rule.is_primary)} onChange={() => setContextField(option.value, "is_primary", true)} /> primair
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="admin-subcard">
              <SectionHeader
                title="Automatische opvolging"
                subtitle="Maak herhaalbare acties vanuit de formulierdefinitie. Waarden uit antwoorden kunnen met {{veldnaam}} in titel en omschrijving worden gebruikt."
              >
                <button type="button" className="btn btn-secondary" onClick={addFollowUpRule}>Regel toevoegen</button>
              </SectionHeader>

              {(draft.follow_up_rules || []).length === 0 ? (
                <div className="admin-empty-note">Geen automatische opvolgregels ingesteld.</div>
              ) : (
                <div className="admin-check-grid">
                  {draft.follow_up_rules.map((rule, index) => (
                    <div className="admin-subcard" key={rule._client_key || rule.form_follow_up_rule_id || index}>
                      <SectionHeader title={`Opvolgregel ${index + 1}`} subtitle={rule.action_title_template || "Nieuwe opvolgregel"}>
                        <button type="button" className="btn btn-secondary" onClick={() => removeFollowUpRule(index)}>Verwijderen</button>
                      </SectionHeader>

                      <div className="cf-grid">
                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Moment</div></div>
                          <div className="cf-control">
                            <select className="input" value={rule.trigger_type} onChange={(e) => setFollowUpRuleField(index, "trigger_type", e.target.value)}>
                              {FOLLOW_UP_TRIGGER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="cf-row wide">
                          <div className="cf-label"><div className="cf-label-text">Actietitel</div></div>
                          <div className="cf-control"><input className="input" value={rule.action_title_template} onChange={(e) => setFollowUpRuleField(index, "action_title_template", e.target.value)} /></div>
                        </div>

                        <div className="cf-row wide">
                          <div className="cf-label"><div className="cf-label-text">Omschrijving</div></div>
                          <div className="cf-control"><textarea rows={3} className="cf-textarea" value={rule.action_description_template || ""} onChange={(e) => setFollowUpRuleField(index, "action_description_template", e.target.value)} /></div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Categorie</div></div>
                          <div className="cf-control"><input className="input" value={rule.category || ""} onChange={(e) => setFollowUpRuleField(index, "category", e.target.value)} /></div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Prioriteit</div></div>
                          <div className="cf-control"><select className="input" value={rule.priority} onChange={(e) => setFollowUpRuleField(index, "priority", e.target.value)}><option value="LOW">Laag</option><option value="NORMAL">Normaal</option><option value="HIGH">Hoog</option><option value="CRITICAL">Kritiek</option></select></div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Verantwoordelijkheid</div></div>
                          <div className="cf-control"><select className="input" value={rule.responsibility_type} onChange={(e) => setFollowUpRuleField(index, "responsibility_type", e.target.value)}><option value="WARDENBURG">Wardenburg</option><option value="CUSTOMER">Klant</option><option value="THIRD_PARTY">Derde partij</option><option value="UNSPECIFIED">Nog te bepalen</option></select></div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Workflowrol</div></div>
                          <div className="cf-control"><select className="input" value={rule.assigned_role_code || ""} onChange={(e) => setFollowUpRuleField(index, "assigned_role_code", e.target.value)}><option value="">Niet toegewezen</option>{(draft.workflow_roles || []).map((role) => <option key={role.role_code} value={role.role_code}>{role.display_name}</option>)}</select></div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Afhandelen binnen dagen</div></div>
                          <div className="cf-control"><input type="number" min="0" className="input" value={rule.due_after_days ?? ""} onChange={(e) => setFollowUpRuleField(index, "due_after_days", e.target.value)} /></div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Certificaatgevolg</div></div>
                          <div className="cf-control"><select className="input" value={rule.certificate_impact || ""} onChange={(e) => setFollowUpRuleField(index, "certificate_impact", e.target.value)}><option value="">Niet vooraf bepaald</option><option value="yes">Ja</option><option value="no">Nee</option></select></div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Zichtbaarheid</div></div>
                          <div className="cf-control"><select className="input" value={rule.visibility} onChange={(e) => setFollowUpRuleField(index, "visibility", e.target.value)}><option value="INTERNAL_ONLY">Alleen intern</option><option value="CUSTOMER_VISIBLE">Zichtbaar voor klant</option></select></div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label"><div className="cf-label-text">Actief</div></div>
                          <div className="cf-control"><select className="input" value={rule.is_active ? "1" : "0"} onChange={(e) => setFollowUpRuleField(index, "is_active", e.target.value === "1")}><option value="1">Ja</option><option value="0">Nee</option></select></div>
                        </div>

                        {rule.trigger_type === "CONDITIONAL" ? (
                          <div className="cf-row wide">
                            <div className="cf-label"><div className="cf-label-text">Voorwaarde</div></div>
                            <div className="cf-control">
                              <textarea rows={5} className="cf-textarea" value={rule.condition_json_text || ""} onChange={(e) => setFollowUpRuleField(index, "condition_json_text", e.target.value)} placeholder={'{"field":"vraagcode","operator":"equals","value":"Ja"}'} />
                              <div className="admin-panel-subtitle">Gebruik een veilig JSON-object met field, operator en value. all, any en not zijn beschikbaar voor samengestelde voorwaarden.</div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
