import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import { PlusIcon } from "@/components/ui/plus";
import { initializeInstallationTypesFromAtrium } from "../../api/emberApi.js";

function normalizeDraft(catalog) {
  const installationTypes = Array.isArray(catalog?.installationTypes) ? catalog.installationTypes : [];
  const mappings = Array.isArray(catalog?.installationTypeAtriumMappings)
    ? catalog.installationTypeAtriumMappings
    : [];

  return installationTypes
    .map((type) => ({
      installation_type_key: type.installation_type_key ?? "",
      display_name: type.display_name ?? "",
      is_active: type.is_active !== false,
      atrium_mappings: mappings
        .filter((mapping) => mapping.installation_type_key === type.installation_type_key)
        .map((mapping) => ({
          mapping_id: mapping.mapping_id ?? null,
          atrium_installation_type_code: mapping.atrium_installation_type_code ?? "",
          atrium_installation_type_description: mapping.atrium_installation_type_description ?? "",
          is_active: mapping.is_active !== false,
        }))
        .sort((a, b) =>
          String(a.atrium_installation_type_code || "").localeCompare(
            String(b.atrium_installation_type_code || "")
          )
        ),
    }))
    .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")));
}

function formatDateTime(value) {
  if (!value) return "onbekend";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function reasonLabel(reason) {
  if (reason === "already_typed") return "Al getypt";
  if (reason === "historical") return "Historisch";
  if (reason === "not_current") return "Niet actueel";
  if (reason === "no_mapping") return "Geen mapping";
  if (reason === "mapping_target_missing") return "Doeltype ontbreekt";
  return reason || "onbekend";
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

const AdminInstallationTypeAutomationTab = forwardRef(function AdminInstallationTypeAutomationTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSave, onCatalogRefresh },
  ref
) {
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState("");

  const runIconRef = useRef(null);
  const addIconRefs = useRef({});

  useEffect(() => {
    setDraft(normalizeDraft(catalog));
  }, [catalog]);

  const baseSnapshot = useMemo(() => JSON.stringify(normalizeDraft(catalog)), [catalog]);
  const currentSnapshot = useMemo(() => JSON.stringify(draft), [draft]);
  const isDirty = baseSnapshot !== currentSnapshot;

  const auditGroups = useMemo(() => {
    const audits = Array.isArray(catalog?.installationTypeInitializationAudits)
      ? catalog.installationTypeInitializationAudits
      : [];
    const details = Array.isArray(catalog?.installationTypeInitializationAuditDetails)
      ? catalog.installationTypeInitializationAuditDetails
      : [];

    return audits.map((audit) => ({
      ...audit,
      details: details.filter((detail) => detail.run_id === audit.run_id),
    }));
  }, [catalog]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving || runBusy);
  }, [saving, runBusy, onSavingChange]);

  function setMapping(typeIndex, mappingIndex, patch) {
    setDraft((prev) =>
      prev.map((row, i) => {
        if (i !== typeIndex) return row;
        return {
          ...row,
          atrium_mappings: row.atrium_mappings.map((mapping, j) =>
            j === mappingIndex ? { ...mapping, ...patch } : mapping
          ),
        };
      })
    );
  }

  function addMapping(typeIndex) {
    setDraft((prev) =>
      prev.map((row, i) => {
        if (i !== typeIndex) return row;
        return {
          ...row,
          atrium_mappings: [
            ...row.atrium_mappings,
            {
              mapping_id: null,
              atrium_installation_type_code: "",
              atrium_installation_type_description: "",
              is_active: true,
            },
          ],
        };
      })
    );
  }

  function removeMapping(typeIndex, mappingIndex) {
    setDraft((prev) =>
      prev.map((row, i) => {
        if (i !== typeIndex) return row;
        return {
          ...row,
          atrium_mappings: row.atrium_mappings.filter((_, j) => j !== mappingIndex),
        };
      })
    );
  }

  async function save() {
    if (saving || !isDirty) return;

    setSaving(true);

    try {
      await onSave?.(
        draft.map((row, index) => ({
          installation_type_key: row.installation_type_key,
          display_name: row.display_name,
          sort_order:
            catalog?.installationTypes?.find(
              (type) => type.installation_type_key === row.installation_type_key
            )?.sort_order ?? (index + 1) * 10,
          is_active: row.is_active !== false,
          atrium_mappings: row.atrium_mappings.map((mapping) => ({
            atrium_installation_type_code: mapping.atrium_installation_type_code,
            atrium_installation_type_description: mapping.atrium_installation_type_description,
            is_active: mapping.is_active !== false,
          })),
        }))
      );

      onSaveOk?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleRunInitialization() {
    if (runBusy) return;

    setRunBusy(true);
    setRunError("");

    try {
      const res = await initializeInstallationTypesFromAtrium({ trigger_source: "admin" });
      setRunResult(res || null);
      await onCatalogRefresh?.();
    } catch (e) {
      setRunError(e?.message || String(e));
    } finally {
      setRunBusy(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  if (loading && draft.length === 0) {
    return <div className="muted">laden; typebijwerker</div>;
  }

  return (
    <div className="admin-grid">
      <AdminPanel
        title="Typebijwerker"
        subtitle="Beheer de Atrium-codekoppelingen, draai de handmatige initialisatie en bekijk de audit van eerdere runs."
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
              onClick={handleRunInitialization}
              disabled={runBusy || saving}
              onMouseEnter={() => runIconRef.current?.startAnimation?.()}
              onMouseLeave={() => runIconRef.current?.stopAnimation?.()}
              title="Vult alleen lege installatietypes voor actuele installaties."
            >
              <RefreshCWIcon ref={runIconRef} size={16} className="nav-anim-icon" />
              Nu installatietypes bijwerken
            </button>
          </>
        }
      >
        {runError ? <div className="ember-label ember-label--danger">{runError}</div> : null}

        {runResult?.summary ? (
          <div className="admin-subcard">
            <div className="admin-subcard-title">Laatste handmatige run</div>
            <div className="ember-label-row admin-inline-labels">
              <span className="ember-label ember-label--success">
                bijgewerkt; {runResult.summary.updated_total ?? 0}
              </span>
              <span className="ember-label ember-label--muted">
                nieuwe overlay; {runResult.summary.inserted_overlay_count ?? 0}
              </span>
              <span className="ember-label ember-label--warning">
                onbekend; {runResult.summary.unknown_no_mapping_count ?? 0}
              </span>
              <span className="ember-label ember-label--muted">
                historisch; {runResult.summary.skipped_historical_count ?? 0}
              </span>
            </div>
          </div>
        ) : null}

        <div className="admin-check-grid">
          {draft.map((row, typeIndex) => (
            <div key={row.installation_type_key || typeIndex} className="admin-subcard">
              <div className="admin-toolbar">
                <div className="admin-toolbar-title">
                  <div className="admin-subcard-title">
                    {row.display_name || row.installation_type_key || "Onbekend type"}
                  </div>
                  <div className="ember-label-row admin-inline-labels">
                    <span className="ember-label ember-label--muted">
                      key; {row.installation_type_key || "-"}
                    </span>
                    <span className="ember-label ember-label--muted">
                      mappings; {row.atrium_mappings.length}
                    </span>
                  </div>
                </div>

                <div className="admin-toolbar-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => addMapping(typeIndex)}
                    onMouseEnter={() => addIconRefs.current[typeIndex]?.startAnimation?.()}
                    onMouseLeave={() => addIconRefs.current[typeIndex]?.stopAnimation?.()}
                  >
                    <PlusIcon
                      ref={(el) => {
                        addIconRefs.current[typeIndex] = el;
                      }}
                      size={16}
                      className="nav-anim-icon"
                    />
                    Code toevoegen
                  </button>
                </div>
              </div>

              {row.atrium_mappings.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {row.atrium_mappings.map((mapping, mappingIndex) => (
                    <div key={`${mapping.mapping_id || "new"}:${mappingIndex}`} className="admin-subcard">
                      <div className="cf-grid">
                        <div className="cf-row">
                          <div className="cf-label">
                            <div className="cf-label-text">Atrium code</div>
                          </div>
                          <div className="cf-control">
                            <input
                              className="input"
                              value={mapping.atrium_installation_type_code}
                              onChange={(e) =>
                                setMapping(typeIndex, mappingIndex, {
                                  atrium_installation_type_code: e.target.value,
                                })
                              }
                              placeholder="02"
                            />
                          </div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label">
                            <div className="cf-label-text">Omschrijving</div>
                          </div>
                          <div className="cf-control">
                            <input
                              className="input"
                              value={mapping.atrium_installation_type_description}
                              onChange={(e) =>
                                setMapping(typeIndex, mappingIndex, {
                                  atrium_installation_type_description: e.target.value,
                                })
                              }
                              placeholder="Brandmeldsysteem"
                            />
                          </div>
                        </div>

                        <div className="cf-row">
                          <div className="cf-label">
                            <div className="cf-label-text">Actief</div>
                          </div>
                          <div className="cf-control" style={{ display: "flex", gap: 8 }}>
                            <select
                              className="input"
                              value={mapping.is_active ? "1" : "0"}
                              onChange={(e) =>
                                setMapping(typeIndex, mappingIndex, {
                                  is_active: e.target.value === "1",
                                })
                              }
                            >
                              <option value="1">Ja</option>
                              <option value="0">Nee</option>
                            </select>

                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => removeMapping(typeIndex, mappingIndex)}
                            >
                              Verwijderen
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">Nog geen Atrium-code gekoppeld.</div>
              )}
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel
        title="Bijwerklog"
        subtitle="Alleen totalen en groepsaantallen; geen installatiecodes."
      >
        {auditGroups.length === 0 ? (
          <div className="muted">Nog geen runs vastgelegd.</div>
        ) : (
          <div className="admin-check-grid">
            {auditGroups.map((audit) => {
              const appliedDetails = audit.details.filter((detail) => detail.detail_kind === "applied");
              const unknownDetails = audit.details.filter((detail) => detail.detail_kind === "unknown");

              return (
                <div key={audit.run_id} className="admin-subcard">
                  <div className="admin-toolbar">
                    <div className="admin-toolbar-title">
                      <div className="admin-subcard-title">
                        {formatDateTime(audit.completed_at || audit.started_at)}
                      </div>
                      <div className="ember-label-row admin-inline-labels">
                        <span className="ember-label ember-label--muted">
                          bron; {audit.trigger_source || "onbekend"}
                        </span>
                        <span className="ember-label ember-label--muted">
                          door; {audit.triggered_by || "onbekend"}
                        </span>
                        <span className="ember-label ember-label--success">
                          bijgewerkt; {audit.updated_total}
                        </span>
                        <span className="ember-label ember-label--warning">
                          onbekend; {audit.unknown_no_mapping_count}
                        </span>
                      </div>
                    </div>
                  </div>

                  {appliedDetails.length ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div className="admin-panel-subtitle">Toegepast</div>
                      {appliedDetails.map((detail, index) => (
                        <div key={`applied:${audit.run_id}:${index}`} className="ember-label-row admin-inline-labels">
                          <span className="ember-label ember-label--success">
                            {detail.atrium_installation_type_code || "geen code"}; {detail.installation_type_key || "geen type"}
                          </span>
                          <span className="ember-label ember-label--muted">
                            {detail.item_count} installatie(s)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {unknownDetails.length ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      <div className="admin-panel-subtitle">Onbekend of incompleet</div>
                      <div className="ember-label-row admin-inline-labels">
                        {unknownDetails.map((detail, index) => (
                          <span key={`unknown:${audit.run_id}:${index}`} className="ember-label ember-label--warning">
                            {detail.atrium_installation_type_code || "geen code"}; {reasonLabel(detail.reason)}; {detail.item_count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </AdminPanel>
    </div>
  );
});

export default AdminInstallationTypeAutomationTab;
