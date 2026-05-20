// src/pages/Admin/AdminInstallationTypesTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PlusIcon } from "@/components/ui/plus";
import { ArrowUpIcon } from "@/components/ui/arrow-up";
import { ArrowDownIcon } from "@/components/ui/arrow-down";

function normalizeDraft(catalog) {
  return Array.isArray(catalog?.installationTypes)
    ? [...catalog.installationTypes]
        .map((x, index) => ({
          installation_type_key: x.installation_type_key ?? "",
          display_name: x.display_name ?? "",
          sort_order: x.sort_order ?? (index + 1) * 10,
          is_active: x.is_active ?? true,
        }))
        .sort((a, b) => {
          const sa = Number(a.sort_order ?? 0);
          const sb = Number(b.sort_order ?? 0);
          if (sa !== sb) return sa - sb;
          return String(a.display_name || "").localeCompare(String(b.display_name || ""));
        })
    : [];
}

function statusLabel(isActive) {
  return isActive ? "Actief" : "Niet actief";
}

function statusTone(isActive) {
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

const AdminInstallationTypesTab = forwardRef(function AdminInstallationTypesTab(
  { catalog, loading, onDirtyChange, onSavingChange, onSaveOk, onSave },
  ref
) {
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  const addIconRef = useRef(null);
  const upIconRefs = useRef({});
  const downIconRefs = useRef({});

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

  function moveRow(index, direction) {
    setDraft((prev) => {
      const arr = [...prev];
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= arr.length) return prev;

      const tmp = arr[index];
      arr[index] = arr[nextIndex];
      arr[nextIndex] = tmp;

      return arr.map((row, i) => ({
        ...row,
        sort_order: (i + 1) * 10,
      }));
    });
  }

  function toggleActive(index, nextActive) {
    const row = draft[index];
    if (!row) return;

    if (row.is_active && !nextActive) {
      const ok = window.confirm(
        `Weet je zeker dat je installatiesoort "${row.display_name || row.installation_type_key || "onbekend"}" inactief wilt maken?`
      );
      if (!ok) return;
    }

    setRow(index, { is_active: nextActive });
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
      await onSave?.(
        draft.map((row, index) => ({
          ...row,
          sort_order: Number.isFinite(Number(row.sort_order))
            ? Number(row.sort_order)
            : (index + 1) * 10,
        }))
      );

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
    <div className="admin-grid">
      <AdminPanel
        title="Installatiesoorten"
        subtitle="Beheer de installatiecategorieën die in Ember beschikbaar zijn. De volgorde wordt gebruikt in dropdowns en overzichten."
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
        <div className="admin-check-grid">
          {draft.map((row, index) => (
            <div
              key={`${row.installation_type_key || "new"}:${index}`}
              className={`admin-subcard ${!row.is_active ? "admin-table-row--inactive" : ""}`}
            >
              <div className="admin-toolbar">
                <div className="admin-toolbar-title">
                  <div className="admin-subcard-title">
                    {index + 1}. {row.display_name || "Nieuwe installatiesoort"}
                  </div>

                  <div className="ember-label-row admin-inline-labels">
                    <span className={`ember-label ember-label--${statusTone(row.is_active)}`}>
                      {statusLabel(row.is_active)}
                    </span>

                    <span className="ember-label ember-label--muted">
                      key; {row.installation_type_key || "-"}
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
                    onClick={() => moveRow(index, "up")}
                    disabled={index === 0}
                    onMouseEnter={() => upIconRefs.current[index]?.startAnimation?.()}
                    onMouseLeave={() => upIconRefs.current[index]?.stopAnimation?.()}
                    title="Omhoog"
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
                    onClick={() => moveRow(index, "down")}
                    disabled={index === draft.length - 1}
                    onMouseEnter={() => downIconRefs.current[index]?.startAnimation?.()}
                    onMouseLeave={() => downIconRefs.current[index]?.stopAnimation?.()}
                    title="Omlaag"
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
                      placeholder="Brandmeldinstallatie"
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
                      value={row.installation_type_key}
                      onChange={(e) => setRow(index, { installation_type_key: e.target.value })}
                      placeholder="BMI"
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
                      onChange={(e) => toggleActive(index, e.target.value === "1")}
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
      </AdminPanel>
    </div>
  );
});

export default AdminInstallationTypesTab;