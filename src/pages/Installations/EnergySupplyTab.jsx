// src/pages/Installations/EnergySupplyTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { putEnergySupplies, deleteEnergySupply } from "../../api/emberApi.js";

import { BatteryWarningIcon } from "@/components/ui/battery-warning";
import { BatteryPlusIcon } from "@/components/ui/battery-plus";
import { DeleteIcon } from "@/components/ui/delete";
import { RotateCCWIcon } from "@/components/ui/rotate-ccw";
import { MessageCircleMoreIcon } from "@/components/ui/message-circle-more";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";

function normalizeDateForInput(v) {
  if (!v) return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function clampQty(v) {
  const n = toIntOrNull(v);
  if (n === null) return 1;
  return Math.max(1, n);
}

function computeEffectiveAh(capacityAh, quantity, configuration) {
  const cap = Number(capacityAh);
  const qty = Number(quantity);
  if (!Number.isFinite(cap) || !Number.isFinite(qty) || qty <= 0) return null;
  if (configuration === "parallel") return cap * qty;
  return cap;
}

function todayIsoDate() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatAh(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function getAgeInfo(dateStr) {
  const iso = normalizeDateForInput(dateStr);
  if (!iso) return null;

  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return null;

  const days = diffMs / 86400000;
  const years = days / 365.25;

  if (days < 30) return { label: `${Math.ceil(days)} d`, years };
  if (days < 365) return { label: `${(days / 30.4375).toFixed(1)} mnd`, years };
  return { label: `${years.toFixed(1)} jr`, years };
}

const EnergySupplyTab = forwardRef(function EnergySupplyTab(
  { code, items, brandTypes, onDirtyChange, onSavingChange, onSaveOk, onSaved, onAnyOpenChange },
  ref
) {
  const initialJsonRef = useRef("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const [openMap, setOpenMap] = useState({}); // key -> bool

  const addIconRef = useRef(null);
  const deleteIconRefs = useRef({});
  const wipeIconRefs = useRef({});
  const msgIconRefs = useRef({});
  const toggleIconRefs = useRef({});
  const warnIconRefs = useRef({});

  const rowsLenRef = useRef(0);
  useEffect(() => {
    rowsLenRef.current = rows.length;
  }, [rows.length]);

  const brandTypeMap = useMemo(() => {
    const m = new Map();
    for (const t of brandTypes || []) m.set(String(t.brand_type_key), t);
    return m;
  }, [brandTypes]);

  function getDefaultBrandTypeKey() {
    const list = (brandTypes || [])
      .filter((t) => t.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const first = list[0]?.brand_type_key;
    return first === null || first === undefined ? null : String(first);
  }

  useEffect(() => {
    const normalized = (items || []).map((x) => ({
      energy_supply_id: x.energy_supply_id ?? null,
      location_label: x.location_label ?? "",
      brand_type_key: x.brand_type_key === null || x.brand_type_key === undefined ? null : String(x.brand_type_key),
      brand_type_manual: x.brand_type_manual ?? "",
      capacity_ah: x.capacity_ah ?? null,
      quantity: x.quantity ?? 1,
      configuration: x.configuration ?? "single",
      battery_date: normalizeDateForInput(x.battery_date),
      remarks: x.remarks ?? "",
    }));

    setRows(normalized);
    initialJsonRef.current = JSON.stringify(normalized);
    onDirtyChange?.(false);

    setOpenMap((prev) => {
      const next = { ...prev };
      for (let i = 0; i < normalized.length; i++) {
        const r = normalized[i];
        const key = r.energy_supply_id ?? `new-${i}`;
        if (next[key] === undefined) next[key] = !r.energy_supply_id;
      }
      return next;
    });
  }, [items, onDirtyChange]);

  useEffect(() => {
    const now = JSON.stringify(rows);
    onDirtyChange?.(now !== initialJsonRef.current);
  }, [rows, onDirtyChange]);

  useEffect(() => {
    const anyOpen = Object.values(openMap).some(Boolean);
    onAnyOpenChange?.(anyOpen);
  }, [openMap, onAnyOpenChange]);

  useEffect(() => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const key = r.energy_supply_id ?? `new-${i}`;
      const ageInfo = getAgeInfo(r.battery_date);
      const isOld = Boolean(ageInfo && ageInfo.years >= 4.0);

      if (isOld) warnIconRefs.current[key]?.startAnimation?.();
      else warnIconRefs.current[key]?.stopAnimation?.();
    }
  }, [rows]);

  function updateRow(idx, patch) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (saving) return;

    const defaultKey = getDefaultBrandTypeKey();
    const bt = defaultKey ? brandTypeMap.get(defaultKey) : null;

    const newIndex = rowsLenRef.current;

    setRows((prev) => [
      ...prev,
      {
        energy_supply_id: null,
        location_label: "",
        brand_type_key: defaultKey,
        brand_type_manual: "",
        capacity_ah: bt?.default_capacity_ah ?? null,
        quantity: 1,
        configuration: "single",
        battery_date: todayIsoDate(),
        remarks: "",
      },
    ]);

    setOpenMap((prev) => ({ ...prev, [`new-${newIndex}`]: true }));

    addIconRef.current?.startAnimation?.();
    window.setTimeout(() => addIconRef.current?.stopAnimation?.(), 650);
  }

    useEffect(() => {
    function onKeyDown(e) {
      if (saving) return;
      if (e.repeat) return;

      // Alt+T (zonder Ctrl/Meta/Shift)
      if (!e.altKey) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;

      const k = String(e.key || "");
      if (k !== "t" && k !== "T") return;

      e.preventDefault();
      addRow();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saving]);


  function validateRow(r) {
    const hasKey = r.brand_type_key !== null && r.brand_type_key !== undefined && String(r.brand_type_key) !== "";
    const hasManual = String(r.brand_type_manual || "").trim().length > 0;
    if (hasKey && hasManual) return "kies óf merk/type óf handmatig; niet allebei";

    const qty = Number(r.quantity);
    if (Number.isFinite(qty) && qty < 1) return "aantal accu's moet minimaal 1 zijn";

    const cfg = r.configuration;
    if (cfg && cfg !== "single" && cfg !== "series" && cfg !== "parallel" && cfg !== "unknown") {
      return "schakeling moet single; series; parallel of unknown zijn";
    }

    if (!r.battery_date) return "plaatsingdatum is verplicht";
    const ds = String(r.battery_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return "plaatsingdatum is ongeldig";

    return null;
  }

  async function save() {
    if (saving) return;

    for (const r of rows) {
      const msg = validateRow(r);
      if (msg) {
        alert(msg);
        return;
      }
    }

    try {
      setSaving(true);
      onSavingChange?.(true);

      const payloadItems = rows.map((r, idx) => ({
        energy_supply_id: r.energy_supply_id,
        location_label: String(r.location_label || "").trim() || null,
        brand_type_key: r.brand_type_key,
        brand_type_manual: String(r.brand_type_manual || "").trim() || null,
        capacity_ah: toNumberOrNull(r.capacity_ah),
        quantity: clampQty(r.quantity),
        configuration: r.configuration || "single",
        battery_date: normalizeDateForInput(r.battery_date),
        remarks: String(r.remarks || "").trim() || null,
        sort_order: idx + 1,
        kind: "battery_set",
        is_active: true,
      }));

      await putEnergySupplies(code, payloadItems);

      onSaveOk?.();
      await onSaved?.();

      setOpenMap((prev) => {
        const next = { ...prev };
        for (let i = 0; i < rows.length; i++) {
          const rr = rows[i];
          const k = rr.energy_supply_id ?? `new-${i}`;
          if (rr.energy_supply_id) next[k] = false;
        }
        return next;
      });
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  function expandAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const k = r.energy_supply_id ?? `new-${i}`;
        next[k] = true;
      }
      return next;
    });
  }

  function collapseAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = false;
      return next;
    });
  }

  useImperativeHandle(ref, () => ({ save, expandAll, collapseAll }));

  async function onDelete(idx) {
    const row = rows[idx];
    if (!row) return;

    const label = (row.location_label || "").trim() || `bron ${idx + 1}`;
    if (!window.confirm(`Energievoorziening verwijderen (${label}); weet je het zeker?`)) return;

    if (row.energy_supply_id) {
      await deleteEnergySupply(code, row.energy_supply_id);
      await onSaved?.();
      return;
    }

    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function onBrandTypeChange(idx, newKey) {
    const key = newKey === "" ? null : String(newKey);
    const bt = key ? brandTypeMap.get(String(key)) : null;

    updateRow(idx, {
      brand_type_key: key,
      brand_type_manual: key ? "" : rows[idx]?.brand_type_manual || "",
      capacity_ah: bt?.default_capacity_ah ?? rows[idx]?.capacity_ah ?? null,
    });
  }

  function incQty(idx) {
    const cur = clampQty(rows[idx]?.quantity ?? 1);
    updateRow(idx, { quantity: cur + 1 });
  }

  function decQty(idx) {
    const cur = clampQty(rows[idx]?.quantity ?? 1);
    updateRow(idx, { quantity: Math.max(1, cur - 1) });
  }

  function toggleOpen(key) {
    setOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function getBrandLabel(r) {
    const key = r.brand_type_key ? String(r.brand_type_key) : "";
    if (key) return brandTypeMap.get(key)?.display_name || key;
    const m = String(r.brand_type_manual || "").trim();
    return m ? m : "handmatig";
  }

  function animateSummaryIcons(key) {
    toggleIconRefs.current[key]?.startAnimation?.();
    msgIconRefs.current[key]?.startAnimation?.();
    warnIconRefs.current[key]?.startAnimation?.();
  }

  function stopSummaryIcons(key, isOld) {
    toggleIconRefs.current[key]?.stopAnimation?.();
    msgIconRefs.current[key]?.stopAnimation?.();
    if (!isOld) warnIconRefs.current[key]?.stopAnimation?.();
  }

  return (
    <div className="card">
      <div className="card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 600 }}>Energievoorziening</div>
          <div className="muted" style={{ fontSize: 13 }}>
            voeg accu-sets toe per paneel
          </div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={addRow}
          disabled={saving}
          onMouseEnter={() => addIconRef.current?.startAnimation?.()}
          onMouseLeave={() => addIconRef.current?.stopAnimation?.()}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
          title="toevoegen (Alt+T)"
        >
          <BatteryPlusIcon ref={addIconRef} size={18} className="nav-anim-icon" />
          <span>toevoegen</span>
        </button>
      </div>

      <div className="card-body" style={{ display: "grid", gap: 12 }}>
        {rows.length === 0 && <div className="muted">geen energiebronnen</div>}

        {rows.map((r, idx) => {
          const rawEffectiveAh = computeEffectiveAh(r.capacity_ah, r.quantity, r.configuration);
          const effectiveAh = rawEffectiveAh === null ? null : formatAh(rawEffectiveAh);

          const brandKeyStr =
            r.brand_type_key === null || r.brand_type_key === undefined ? "" : String(r.brand_type_key);
          const hasKey = brandKeyStr !== "";
          const selectDisabled = String(r.brand_type_manual || "").trim().length > 0;

          const key = r.energy_supply_id ?? `new-${idx}`;
          const isOpen = Boolean(openMap[key]);

          const hasRemarks = String(r.remarks || "").trim().length > 0;

          const ageInfo = getAgeInfo(r.battery_date);
          const isOld = Boolean(ageInfo && ageInfo.years >= 4.0);
          const dangerColor = "var(--danger, #ff5b5b)";

          return (
            <div key={key} className="panel" style={{ padding: 12 }}>
              <button
                type="button"
                className="panel-summary"
                onClick={() => toggleOpen(key)}
                disabled={saving}
                onMouseEnter={() => animateSummaryIcons(key)}
                onMouseLeave={() => stopSummaryIcons(key, isOld)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                }}
                title={isOpen ? "inklappen" : "uitklappen"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div className="muted" style={{ width: 22, flex: "0 0 auto" }}>
                    {idx + 1}
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 260,
                      }}
                    >
                      {String(r.location_label || "").trim() || "zonder locatie"}
                    </div>

                    <div className="muted" style={{ whiteSpace: "nowrap" }}>
                      {clampQty(r.quantity)}×
                    </div>

                    <div className="muted" style={{ whiteSpace: "nowrap" }}>
                      {getBrandLabel(r)}
                    </div>

                    <div className="muted" style={{ whiteSpace: "nowrap" }}>
                      {effectiveAh === null ? "n.v.t." : `${effectiveAh} Ah`}
                    </div>

                    {ageInfo && (
                      <div
                        className="muted"
                        style={{
                          whiteSpace: "nowrap",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          color: isOld ? dangerColor : undefined,
                        }}
                      >
                        {isOld && (
                          <BatteryWarningIcon
                            ref={(el) => {
                              warnIconRefs.current[key] = el;
                            }}
                            size={18}
                            className="nav-anim-icon"
                            style={{ color: dangerColor }}
                          />
                        )}
                        ({ageInfo.label})
                      </div>
                    )}

                    {hasRemarks && (
                      <span
                        title="opmerking ingevuld"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageCircleMoreIcon
                          ref={(el) => {
                            msgIconRefs.current[key] = el;
                          }}
                          size={18}
                          className="nav-anim-icon"
                        />
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
                  {!isOpen ? (
                    <PlusIcon
                      ref={(el) => {
                        toggleIconRefs.current[key] = el;
                      }}
                      size={18}
                      className="nav-anim-icon"
                    />
                  ) : (
                    <ChevronUpIcon
                      ref={(el) => {
                        toggleIconRefs.current[key] = el;
                      }}
                      size={18}
                      className="nav-anim-icon"
                    />
                  )}
                </div>
              </button>

              {isOpen && (
                <>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => onDelete(idx)}
                      disabled={saving}
                      onMouseEnter={() => deleteIconRefs.current[key]?.startAnimation?.()}
                      onMouseLeave={() => deleteIconRefs.current[key]?.stopAnimation?.()}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <DeleteIcon
                        ref={(el) => {
                          deleteIconRefs.current[key] = el;
                        }}
                        size={18}
                        className="nav-anim-icon"
                      />
                      <span>verwijderen</span>
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                    <div>
                      <div className="label">locatie</div>
                      <input
                        className="input"
                        value={r.location_label}
                        onChange={(e) => updateRow(idx, { location_label: e.target.value })}
                        placeholder="hoofdpaneel; nevenpaneel 1; etc."
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <div className="label">merk/type</div>
                      <select
                        className="input"
                        value={brandKeyStr}
                        onChange={(e) => onBrandTypeChange(idx, e.target.value)}
                        disabled={saving || selectDisabled}
                        title={selectDisabled ? "maak handmatig leeg om merk/type te kiezen" : ""}
                      >
                        <option value="">handmatig</option>
                        {(brandTypes || [])
                          .filter((t) => t.is_active)
                          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                          .map((t) => (
                            <option key={t.brand_type_key} value={String(t.brand_type_key)}>
                              {t.display_name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {!hasKey && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div className="label">handmatig merk/type</div>

                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <input
                            className="input"
                            value={r.brand_type_manual}
                            onChange={(e) => updateRow(idx, { brand_type_manual: e.target.value, brand_type_key: null })}
                            placeholder="bijv. onbekend; of afwijkend type"
                            disabled={saving}
                          />

                          <button
                            type="button"
                            className="icon-btn"
                            title="handmatig leegmaken"
                            disabled={saving || !String(r.brand_type_manual || "").trim()}
                            onClick={() => updateRow(idx, { brand_type_manual: "" })}
                            onMouseEnter={() => wipeIconRefs.current[key]?.startAnimation?.()}
                            onMouseLeave={() => wipeIconRefs.current[key]?.stopAnimation?.()}
                            style={{ flex: "0 0 auto" }}
                          >
                            <RotateCCWIcon
                              ref={(el) => {
                                wipeIconRefs.current[key] = el;
                              }}
                              size={18}
                              className="nav-anim-icon"
                            />
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="label">plaatsingdatum</div>
                      <input
                        className="input"
                        type="date"
                        lang="nl-NL"
                        value={r.battery_date || ""}
                        onChange={(e) => updateRow(idx, { battery_date: e.target.value || null })}
                        disabled={saving}
                      />
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        verplicht
                      </div>
                    </div>

                    <div>
                      <div className="label">capaciteit per accu; Ah</div>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={r.capacity_ah ?? ""}
                        onChange={(e) => updateRow(idx, { capacity_ah: e.target.value })}
                        placeholder="bijv. 26"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <div className="label">aantal accu's</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input
                          className="input"
                          inputMode="numeric"
                          value={r.quantity ?? 1}
                          onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                          disabled={saving}
                        />
                        <div style={{ display: "grid", gap: 8, flex: "0 0 auto" }}>
                          <button
                            type="button"
                            className="icon-btn"
                            title="aantal +1"
                            onClick={() => incQty(idx)}
                            disabled={saving}
                            style={{ width: 40, height: 40 }}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="aantal -1"
                            onClick={() => decQty(idx)}
                            disabled={saving}
                            style={{ width: 40, height: 40 }}
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="label">schakeling</div>
                      <select
                        className="input"
                        value={r.configuration}
                        onChange={(e) => updateRow(idx, { configuration: e.target.value })}
                        disabled={saving}
                      >
                        <option value="single">single</option>
                        <option value="series">series</option>
                        <option value="parallel">parallel</option>
                        <option value="unknown">onbekend</option>
                      </select>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <div className="label">effectieve Ah</div>
                      <div
                        className="muted"
                        style={{
                          padding: "10px 12px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 10,
                        }}
                      >
                        {rawEffectiveAh === null
                          ? "n.v.t."
                          : r.configuration === "series"
                            ? `${formatAh(rawEffectiveAh)}`
                            : String(formatAh(rawEffectiveAh))}
                      </div>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <div className="label">opmerking</div>
                      <textarea
                        className="input"
                        value={r.remarks}
                        onChange={(e) => updateRow(idx, { remarks: e.target.value })}
                        placeholder="bijv. bijzondere plaatsing; afwijkingen; attentiepunten."
                        rows={3}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default EnergySupplyTab;
