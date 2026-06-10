import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PlusIcon } from "@/components/ui/plus";
import { ArrowUpIcon } from "@/components/ui/arrow-up";
import { ArrowDownIcon } from "@/components/ui/arrow-down";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";
import { MonitorCheckIcon } from "@/components/ui/monitor-check";

function buildDraft(catalog) {
  const linksByPortal = new Map();

  for (const link of catalog?.managementPortalTypeLinks || []) {
    const arr = linksByPortal.get(link.portal_key) || [];
    arr.push(link.installation_type_key);
    linksByPortal.set(link.portal_key, arr);
  }

  return Array.isArray(catalog?.managementPortals)
    ? catalog.managementPortals
        .map((item, index) => ({
          portal_key: item.portal_key ?? "",
          display_name: item.display_name ?? "",
          notes: item.notes ?? "",
          installation_url_template: item.installation_url_template ?? "",
          sort_order: item.sort_order ?? (index + 1) * 10,
          is_active: item.is_active ?? true,
          applicability_type_keys: linksByPortal.get(item.portal_key) || [],
        }))
        .sort((a, b) => {
          const sa = Number(a.sort_order ?? 0);
          const sb = Number(b.sort_order ?? 0);
          if (sa !== sb) return sa - sb;
          return String(a.display_name || "").localeCompare(String(b.display_name || ""));
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

const AdminInstallationManagementPortalsTab = forwardRef(function AdminInstallationManagementPortalsTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSave },
  ref
) {
  const addIconRef = useRef(null);
  const upIconRefs = useRef({});
  const downIconRefs = useRef({});

  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [openPortalKeys, setOpenPortalKeys] = useState({});

  useEffect(() => {
    const next = buildDraft(catalog);
    setDraft(next);

    setOpenPortalKeys((prev) => {
      const map = { ...prev };
      for (const row of next) {
        const key = row.portal_key || `__row_${row.display_name || "new"}`;
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
        `Weet je zeker dat je beheerportaal "${row.display_name || row.portal_key || "nieuw"}" inactief wilt maken?`
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

        if (applicability.has(typeKey)) {
          applicability.delete(typeKey);
        } else {
          applicability.add(typeKey);
        }

        return {
          ...row,
          applicability_type_keys: Array.from(applicability),
        };
      })
    );
  }

  function addRow() {
    setDraft((prev) => [
      ...prev,
      {
        portal_key: "",
        display_name: "",
        notes: "",
        installation_url_template: "",
        sort_order: (prev.length + 1) * 10,
        is_active: true,
        applicability_type_keys: [],
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

  if (loading && draft.length === 0) {
    return <div className="muted">laden; beheerportalen</div>;
  }

  return (
    <div className="admin-grid">
      <AdminPanel
        title="Beheerportalen"
        subtitle="Beheer de centrale portal-definities en bepaal voor welke installatiesoorten ze beschikbaar zijn in de Software-tab."
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
              Toevoegen
            </button>
          </>
        }
      >
        {draft.length === 0 ? (
          <div className="admin-empty-note">Nog geen beheerportalen gevonden.</div>
        ) : (
          <div className="admin-check-grid">
            {draft.map((row, index) => {
              const applicabilitySet = new Set(row.applicability_type_keys || []);
              const allTypesImplicit = applicabilitySet.size === 0;
              const portalOpenKey = row.portal_key || `__row_${index}`;
              const isOpen = openPortalKeys[portalOpenKey] === true;

              return (
                <div
                  key={`${row.portal_key || "new"}:${index}`}
                  className={`admin-subcard ${!row.is_active ? "admin-table-row--inactive" : ""}`}
                >
                  <div className="admin-toolbar">
                    <div className="admin-toolbar-title">
                      <div className="admin-subcard-title">
                        {index + 1}. {row.display_name || "Nieuw beheerportaal"}
                      </div>

                      <div className="ember-label-row admin-inline-labels">
                        <span className={`ember-label ember-label--${activeTone(row.is_active)}`}>
                          {activeLabel(row.is_active)}
                        </span>

                        <span className="ember-label ember-label--muted">
                          key; {row.portal_key || "-"}
                        </span>

                        <span className="ember-label ember-label--muted">
                          sortering; {row.sort_order || "-"}
                        </span>

                        {allTypesImplicit ? (
                          <span className="ember-label ember-label--success">Alle types</span>
                        ) : (
                          <span className="ember-label ember-label--muted">
                            {applicabilitySet.size} gekozen
                          </span>
                        )}
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
                          value={row.display_name}
                          onChange={(e) => setRow(index, { display_name: e.target.value })}
                          placeholder="Bosch Remote Portal"
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
                          value={row.portal_key}
                          onChange={(e) => setRow(index, { portal_key: e.target.value })}
                          placeholder="bosch_remote"
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
                          onChange={(e) => handleActiveChange(index, e.target.value === "1")}
                        >
                          <option value="1">Ja</option>
                          <option value="0">Nee</option>
                        </select>
                      </div>
                    </div>

                    <div className="cf-row">
                      <div className="cf-label">
                        <div className="cf-label-text">Deeplink template</div>
                      </div>

                      <div className="cf-control">
                        <input
                          className="input"
                          value={row.installation_url_template}
                          onChange={(e) =>
                            setRow(index, { installation_url_template: e.target.value })
                          }
                          placeholder="https://portaal.example/installatie/{installation_code}"
                        />
                      </div>
                    </div>

                    <div className="cf-row">
                      <div className="cf-label">
                        <div className="cf-label-text">Notitie</div>
                      </div>

                      <div className="cf-control">
                        <textarea
                          className="input"
                          rows={3}
                          value={row.notes}
                          onChange={(e) => setRow(index, { notes: e.target.value })}
                          placeholder="Korte uitleg of bijzonderheden bij dit beheerportaal."
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="admin-section-head"
                    onClick={() =>
                      setOpenPortalKeys((prev) => ({
                        ...prev,
                        [portalOpenKey]: !isOpen,
                      }))
                    }
                    style={{ marginTop: 16 }}
                  >
                    <div className="admin-section-head-main">
                      <div className="admin-section-title">Toepasbaarheid per installatiesoort</div>
                      <div className="admin-section-sub">
                        {allTypesImplicit
                          ? "Geen selectie betekent; beschikbaar voor alle installatiesoorten."
                          : `${applicabilitySet.size} gekozen installatiesoorten`}
                      </div>
                    </div>

                    <div className="ember-label-row">
                      <span className="ember-label ember-label--info">
                        <MonitorCheckIcon size={14} className="nav-anim-icon" />
                        &nbsp;portaal
                      </span>
                      {isOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="admin-section-body">
                      <div className="admin-check-grid">
                        {installationTypes.map((type) => {
                          const checked = applicabilitySet.has(type.installation_type_key);

                          return (
                            <label
                              key={type.installation_type_key}
                              className={`admin-compact-row ${
                                checked || allTypesImplicit ? "ember-accent-active" : ""
                              }`}
                            >
                              <div className="admin-compact-row-main">
                                <div className="admin-compact-row-title-wrap">
                                  <div className="admin-compact-row-title">{type.display_name}</div>
                                  <div className="admin-compact-row-sub">
                                    {type.installation_type_key}
                                  </div>
                                </div>
                              </div>

                              <div className="admin-compact-row-right">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleApplicability(index, type.installation_type_key)
                                  }
                                />
                              </div>
                            </label>
                          );
                        })}
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

export default AdminInstallationManagementPortalsTab;
