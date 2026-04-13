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

function statusBadge(isActive) {
  return (
    <span className={isActive ? "admin-status-badge admin-status-badge--active" : "admin-status-badge admin-status-badge--inactive"}>
      <span className={isActive ? "admin-status-dot admin-status-dot--active" : "admin-status-dot admin-status-dot--inactive"} />
      {isActive ? "Ja" : "Nee"}
    </span>
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
          sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : (index + 1) * 10,
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
    <div className="admin-panel">
      <div className="admin-toolbar">
        <div className="admin-toolbar-title">
          <div style={{ fontWeight: 700 }}>Installatiesoorten</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Hier configureer je de verschillende soorten installaties die in het systeem worden gebruikt. Je kunt hier nieuwe soorten toevoegen, bestaande soorten bewerken of verwijderen, en de volgorde van de soorten aanpassen. De volgorde bepaalt hoe de installatiesoorten worden weergegeven in dropdowns en lijsten binnen Ember.
          </div>
        </div>

        <div className="admin-toolbar-actions">
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
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>#</th>
              <th style={{ minWidth: 220 }}>Naam</th>
              <th style={{ minWidth: 180 }}>Key</th>
              <th style={{ minWidth: 150 }}>Sortering</th>
              <th style={{ minWidth: 120 }}>Actief</th>
              <th style={{ minWidth: 130 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((row, index) => (
              <tr
                key={`${row.installation_type_key || "new"}:${index}`}
                className={!row.is_active ? "admin-table-row--inactive" : ""}
              >
                <td>{index + 1}</td>

                <td>
                  <input
                    className="input"
                    value={row.display_name}
                    onChange={(e) => setRow(index, { display_name: e.target.value })}
                    placeholder="Brandmeldinstallatie"
                  />
                </td>

                <td>
                  <input
                    className="input"
                    value={row.installation_type_key}
                    onChange={(e) => setRow(index, { installation_type_key: e.target.value })}
                    placeholder="bmi"
                  />
                </td>

                <td>
                  <div className="admin-sorter">
                    <button
                      type="button"
                      className="admin-mini-icon-btn"
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
                        size={16}
                        className="nav-anim-icon"
                      />
                    </button>

                    <button
                      type="button"
                      className="admin-mini-icon-btn"
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
                        size={16}
                        className="nav-anim-icon"
                      />
                    </button>

                    <input
                      type="number"
                      className="input admin-sorter-value"
                      value={row.sort_order ?? ""}
                      onChange={(e) => setRow(index, { sort_order: e.target.value })}
                    />
                  </div>
                </td>

                <td>
                  <select
                    className="input"
                    value={row.is_active ? "1" : "0"}
                    onChange={(e) => toggleActive(index, e.target.value === "1")}
                  >
                    <option value="1">Ja</option>
                    <option value="0">Nee</option>
                  </select>
                </td>

                <td>{statusBadge(row.is_active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default AdminInstallationTypesTab;