// src/pages/Installations/PerformanceRequirementsTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  getNen2535Catalog,
  getPerformanceRequirements,
  putPerformanceRequirements,
} from "../../api/emberApi.js";

import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { GaugeIcon } from "@/components/ui/gauge";
import { DeleteIcon } from "@/components/ui/delete";

function toInt(v) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  if (typeof v === "object") return [v];
  return [];
}

function round2(n) {
  if (n === null || n === undefined) return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

function computeWeightedCount(row) {
  const a = toInt(row.automatic_detectors);
  const h = toInt(row.manual_call_points);
  const v = toInt(row.flame_detectors) * 5;
  const l = toInt(row.linear_smoke_detectors) * 10;
  const asp = toInt(row.aspirating_openings);
  return a + h + v + l + asp;
}

function factor2009Plus(riskLetter) {
  const r = String(riskLetter || "").trim();
  if (!r) return 0;
  if (r === "A") return 0.5;
  if (r === "B") return 1;
  if (r === "C") return 1.5;
  if (r === "D") return 2;
  if (r === "E") return 3;
  return 0;
}

function factorIntern1996(riskLetter) {
  const r = String(riskLetter || "").trim();
  if (!r) return 0;
  if (r === "A") return 1;
  if (r === "B") return 2;
  if (r === "C") return 3;
  return 0;
}

function factorExtern1996(riskLetter) {
  const r = String(riskLetter || "").trim();
  if (!r) return 0;
  if (r === "A") return 0.5;
  if (r === "B") return 1;
  if (r === "C") return 1.5;
  return 0;
}

const DEFAULT_NORMERING = "NEN2535_2009_PLUS";

function dmLabel(dm) {
  if (dm === "MET_VERTRAGING") return "met vertraging";
  if (dm === "ZONDER_VERTRAGING") return "zonder vertraging";
  return "geen";
}

function badgeVariant(dm) {
  if (dm === "MET_VERTRAGING") return "met";
  if (dm === "ZONDER_VERTRAGING") return "zonder";
  return "geen";
}

function Badge({ children, variant = "neutral", title }) {
  const cls =
    variant === "met"
      ? "pr-badge pr-badge--met"
      : variant === "zonder"
      ? "pr-badge pr-badge--zonder"
      : variant === "geen"
      ? "pr-badge pr-badge--geen"
      : "pr-badge";

  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

function StepperInput({ label, value, disabled, onChange }) {
  const n = toInt(value);

  return (
    <div>
      <div className="label">{label}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <input
          className="input"
          inputMode="numeric"
          value={value ?? 0}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          style={{ flex: 1 }}
        />

        <div style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            className="icon-btn"
            disabled={disabled}
            title="+1"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange?.(String(n + 1));
            }}
          >
            <ChevronUpIcon size={18} className="nav-anim-icon" />
          </button>

          <button
            type="button"
            className="icon-btn"
            disabled={disabled || n <= 0}
            title="-1"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange?.(String(Math.max(0, n - 1)));
            }}
          >
            <ChevronDownIcon size={18} className="nav-anim-icon" />
          </button>
        </div>
      </div>
    </div>
  );
}

const PerformanceRequirementsTab = forwardRef(function PerformanceRequirementsTab(
  { code, onDirtyChange, onSavingChange, onSaveOk, onSaved, onAnyOpenChange },
  ref
) {
  const initialJsonRef = useRef("");
  const [saving, setSaving] = useState(false);

  const [catalog, setCatalog] = useState({ normeringen: [], functies: [], matrix: [] });
  const [normeringKey, setNormeringKey] = useState(DEFAULT_NORMERING);

  const [rows, setRows] = useState([]);
  const [openMap, setOpenMap] = useState({});

  const addIconRef = useRef(null);
  const toggleIconRefs = useRef({});

  // ---- load
  useEffect(() => {
    let cancelled = false;

    Promise.all([getNen2535Catalog(), getPerformanceRequirements(code)])
      .then(([catRaw, pr]) => {
        if (cancelled) return;

        const cat = {
          normeringen: toArray(catRaw?.normeringen),
          functies: toArray(catRaw?.functies),
          matrix: toArray(catRaw?.matrix),
        };
        setCatalog(cat);

        const header = pr?.performanceRequirement || null;
        const nk = String(header?.normering_key || DEFAULT_NORMERING);
        setNormeringKey(nk);

        const loadedRows = toArray(pr?.rows).map((r, idx) => ({
          performance_requirement_row_id: r.performance_requirement_row_id ?? null,
          gebruikersfunctie_key: r.gebruikersfunctie_key ?? "",
          row_label: r.row_label ?? "",
          doormelding_mode: String(r.doormelding_mode || "GEEN").trim() || "GEEN",
          automatic_detectors: r.automatic_detectors ?? 0,
          manual_call_points: r.manual_call_points ?? 0,
          flame_detectors: r.flame_detectors ?? 0,
          linear_smoke_detectors: r.linear_smoke_detectors ?? 0,
          aspirating_openings: r.aspirating_openings ?? 0,
          sort_order: r.sort_order ?? idx + 1,
        }));

        setRows(loadedRows);

        setOpenMap((prev) => {
          const next = { ...prev };
          for (let i = 0; i < loadedRows.length; i++) {
            const rr = loadedRows[i];
            const key = rr.performance_requirement_row_id ?? `row-${i}`;
            if (next[key] === undefined) next[key] = !rr.performance_requirement_row_id;
            if (rr.performance_requirement_row_id) next[key] = false;
          }
          return next;
        });

        initialJsonRef.current = JSON.stringify({ normeringKey: nk, rows: loadedRows });
        onDirtyChange?.(false);
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
    };
  }, [code, onDirtyChange]);

  // ---- dirty
  useEffect(() => {
    const snap = JSON.stringify({ normeringKey, rows });
    onDirtyChange?.(snap !== initialJsonRef.current);
  }, [normeringKey, rows, onDirtyChange]);

  // ---- any open
  useEffect(() => {
    const anyOpen = Object.values(openMap).some(Boolean);
    onAnyOpenChange?.(anyOpen);
  }, [openMap, onAnyOpenChange]);

  // ---- lookups
  const normeringen = useMemo(() => {
    return toArray(catalog?.normeringen)
      .filter((n) => n?.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [catalog]);

  const functies = useMemo(() => {
    return toArray(catalog?.functies)
      .filter((f) => f?.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [catalog]);

  const functieNameByKey = useMemo(() => {
    const m = new Map();
    for (const f of functies) {
      m.set(
        String(f.gebruikersfunctie_key),
        String(f.default_name || f.display_name || f.gebruikersfunctie_key)
      );
    }
    return m;
  }, [functies]);

  const matrixForNorm = useMemo(() => {
    const nk = String(normeringKey || DEFAULT_NORMERING);
    return toArray(catalog?.matrix)
      .filter((m) => String(m.normering_key) === nk && m.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [catalog, normeringKey]);

  const matrixByFunKey = useMemo(() => {
    const m = new Map();
    for (const x of matrixForNorm) m.set(String(x.gebruikersfunctie_key), x);
    return m;
  }, [matrixForNorm]);

  const allowedFunKeys = useMemo(
    () => new Set(matrixForNorm.map((m) => String(m.gebruikersfunctie_key))),
    [matrixForNorm]
  );

  function updateRow(idx, patch) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function toggleOpen(key) {
    setOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function expandAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (let i = 0; i < rows.length; i++) {
        const k = rows[i].performance_requirement_row_id ?? `row-${i}`;
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

  function addRow() {
    if (saving) return;

    const nk = String(normeringKey || "").trim() || DEFAULT_NORMERING;
    if (nk !== normeringKey) setNormeringKey(nk);

    const firstKey = matrixForNorm[0]?.gebruikersfunctie_key
      ? String(matrixForNorm[0].gebruikersfunctie_key)
      : String(functies[0]?.gebruikersfunctie_key || "");

    const newIndex = rows.length;

    setRows((prev) => [
      ...prev,
      {
        performance_requirement_row_id: null,
        gebruikersfunctie_key: firstKey,
        row_label: "",
        doormelding_mode: "GEEN",
        automatic_detectors: 0,
        manual_call_points: 0,
        flame_detectors: 0,
        linear_smoke_detectors: 0,
        aspirating_openings: 0,
        sort_order: newIndex + 1,
      },
    ]);

    setOpenMap((prev) => ({ ...prev, [`row-${newIndex}`]: true }));

    addIconRef.current?.startAnimation?.();
    window.setTimeout(() => addIconRef.current?.stopAnimation?.(), 650);
  }

  function removeRow(idx) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate() {
    const nk = String(normeringKey || "").trim();
    if (!nk) return "normering is verplicht";
    if (!["NEN2535_2009_PLUS", "NEN2535_1996_2008"].includes(nk)) return "normering is ongeldig";

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      const k = String(r.gebruikersfunctie_key || "").trim();
      if (!k) return `regel ${i + 1}: gebruikersfunctie is verplicht`;
      if (matrixForNorm.length > 0 && !allowedFunKeys.has(k)) {
        return `regel ${i + 1}: gebruikersfunctie niet toegestaan voor normering`;
      }

      const dm = String(r.doormelding_mode || "").trim() || "GEEN";
      if (!["GEEN", "ZONDER_VERTRAGING", "MET_VERTRAGING"].includes(dm)) {
        return `regel ${i + 1}: doormelding is ongeldig`;
      }

      const fields = [
        "automatic_detectors",
        "manual_call_points",
        "flame_detectors",
        "linear_smoke_detectors",
        "aspirating_openings",
      ];

      for (const f of fields) {
        const n = Number(r[f] ?? 0);
        if (!Number.isFinite(n) || n < 0) return `regel ${i + 1}: aantallen moeten >= 0 zijn`;
      }
    }

    return null;
  }

  async function save() {
    if (saving) return;

    const msg = validate();
    if (msg) {
      alert(msg);
      return;
    }

    try {
      setSaving(true);
      onSavingChange?.(true);

      const payload = {
        normering_key: String(normeringKey || DEFAULT_NORMERING),
        doormelding_mode: "GEEN", // header blijft bestaan (legacy), UI gebruikt per-regel doormelding
        remarks: null,
        rows: rows.map((r, idx) => ({
          gebruikersfunctie_key: String(r.gebruikersfunctie_key || "").trim(),
          row_label: String(r.row_label || "").trim() || null,
          doormelding_mode: String(r.doormelding_mode || "GEEN").trim() || "GEEN",
          automatic_detectors: toInt(r.automatic_detectors),
          manual_call_points: toInt(r.manual_call_points),
          flame_detectors: toInt(r.flame_detectors),
          linear_smoke_detectors: toInt(r.linear_smoke_detectors),
          aspirating_openings: toInt(r.aspirating_openings),
          sort_order: Number.isFinite(Number(r.sort_order)) ? Math.trunc(Number(r.sort_order)) : idx + 1,
        })),
      };

      await putPerformanceRequirements(code, payload);

      onSaveOk?.();
      await onSaved?.();

      const pr = await getPerformanceRequirements(code);

      const header = pr?.performanceRequirement || null;
      const nk = String(header?.normering_key || payload.normering_key);

      const loadedRows = toArray(pr?.rows).map((r, idx) => ({
        performance_requirement_row_id: r.performance_requirement_row_id ?? null,
        gebruikersfunctie_key: r.gebruikersfunctie_key ?? "",
        row_label: r.row_label ?? "",
        doormelding_mode: String(r.doormelding_mode || "GEEN").trim() || "GEEN",
        automatic_detectors: r.automatic_detectors ?? 0,
        manual_call_points: r.manual_call_points ?? 0,
        flame_detectors: r.flame_detectors ?? 0,
        linear_smoke_detectors: r.linear_smoke_detectors ?? 0,
        aspirating_openings: r.aspirating_openings ?? 0,
        sort_order: r.sort_order ?? idx + 1,
      }));

      setNormeringKey(nk);
      setRows(loadedRows);

      initialJsonRef.current = JSON.stringify({ normeringKey: nk, rows: loadedRows });

      setOpenMap((prev) => {
        const next = { ...prev };
        for (let i = 0; i < loadedRows.length; i++) {
          const k = loadedRows[i].performance_requirement_row_id ?? `row-${i}`;
          next[k] = false;
        }
        return next;
      });
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  // ---- berekening per regel + totalen per doormelding-groep
  const calcByRowKey = useMemo(() => {
    const nk = String(normeringKey || DEFAULT_NORMERING);
    const out = new Map();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const key = r.performance_requirement_row_id ?? `row-${i}`;
      const dm = String(r.doormelding_mode || "GEEN").trim() || "GEEN";

      // regels:
      // - MET_VERTRAGING: intern + extern
      // - ZONDER_VERTRAGING: alleen extern
      // - GEEN: niets
      const rowInternEnabled = dm === "MET_VERTRAGING";
      const rowExternEnabled = dm === "MET_VERTRAGING" || dm === "ZONDER_VERTRAGING";

      const m = matrixByFunKey.get(String(r.gebruikersfunctie_key || ""));
      const riskI = m?.risk_internal ?? null;
      const riskE = m?.risk_external ?? null;

      const weighted = computeWeightedCount(r);

      let imax = null;
      let emax = null;

      if (rowInternEnabled && riskI) {
        const f = nk === "NEN2535_2009_PLUS" ? factor2009Plus(riskI) : factorIntern1996(riskI);
        imax = round2((weighted / 100) * f);
      }

      if (rowExternEnabled && riskE) {
        const f = nk === "NEN2535_2009_PLUS" ? factor2009Plus(riskE) : factorExtern1996(riskE);
        emax = round2((weighted / 100) * f);
      }

      out.set(key, { dm, riskI, riskE, imax, emax });
    }

    return out;
  }, [rows, normeringKey, matrixByFunKey]);

  const totalsByDm = useMemo(() => {
    const t = {
      MET_VERTRAGING: { intern: 0, extern: 0, hasIntern: false, hasExtern: false },
      ZONDER_VERTRAGING: { intern: 0, extern: 0, hasIntern: false, hasExtern: false },
    };

    for (const v of calcByRowKey.values()) {
      const dm = v.dm || "GEEN";

      if (dm === "MET_VERTRAGING") {
        if (Number.isFinite(Number(v.imax))) {
          t.MET_VERTRAGING.intern += Number(v.imax);
          t.MET_VERTRAGING.hasIntern = true;
        }
        if (Number.isFinite(Number(v.emax))) {
          t.MET_VERTRAGING.extern += Number(v.emax);
          t.MET_VERTRAGING.hasExtern = true;
        }
      }

      if (dm === "ZONDER_VERTRAGING") {
        if (Number.isFinite(Number(v.emax))) {
          t.ZONDER_VERTRAGING.extern += Number(v.emax);
          t.ZONDER_VERTRAGING.hasExtern = true;
        }
      }
    }

    return {
      MET_VERTRAGING: {
        intern: round2(t.MET_VERTRAGING.intern),
        extern: round2(t.MET_VERTRAGING.extern),
        ...t.MET_VERTRAGING,
      },
      ZONDER_VERTRAGING: {
        intern: null,
        extern: round2(t.ZONDER_VERTRAGING.extern),
        ...t.ZONDER_VERTRAGING,
      },
    };
  }, [calcByRowKey]);

  return (
    <div className="card">
      <div
        className="card-head"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
            <GaugeIcon size={18} className="nav-anim-icon" />
            <span>NEN2535 prestatie-eisen</span>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            kies normering; vul aantallen per gebruikersfunctie
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
          title="toevoegen"
        >
          <PlusIcon ref={addIconRef} size={18} className="nav-anim-icon" />
          <span>toevoegen</span>
        </button>
      </div>

      <div className="card-body" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div>
            <div className="label">normering</div>
            <select
              className="input"
              value={normeringKey}
              onChange={(e) => setNormeringKey(e.target.value || DEFAULT_NORMERING)}
              disabled={saving}
            >
              <option value="">kies...</option>
              {normeringen.map((n) => (
                <option key={n.normering_key} value={String(n.normering_key)}>
                  {String(n.normering_name || n.display_name || n.normering_key)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* totalen per doormelding-groep */}
        {rows.length > 0 && (
          <div
            className="muted"
            style={{
              padding: "10px 12px",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 800 }}>O&amp;O meldingen (max)</div>

            <Badge variant="met" title="Som van regels met doormeldvertraging">
              met: intern{" "}
              {totalsByDm.MET_VERTRAGING.hasIntern ? totalsByDm.MET_VERTRAGING.intern : "n.v.t."} ·
              extern{" "}
              {totalsByDm.MET_VERTRAGING.hasExtern ? totalsByDm.MET_VERTRAGING.extern : "n.v.t."}
            </Badge>

            <Badge variant="zonder" title="Som van regels zonder doormeldvertraging">
              zonder: extern{" "}
              {totalsByDm.ZONDER_VERTRAGING.hasExtern
                ? totalsByDm.ZONDER_VERTRAGING.extern
                : "n.v.t."}
            </Badge>
          </div>
        )}

        {rows.length === 0 && <div className="muted">geen regels</div>}

        {rows.map((r, idx) => {
          const key = r.performance_requirement_row_id ?? `row-${idx}`;
          const isOpen = Boolean(openMap[key]);

          const label = String(r.row_label || "").trim();
          const hasLabel = label.length > 0;

          const funKey = String(r.gebruikersfunctie_key || "").trim();
          const funName = functieNameByKey.get(funKey) || funKey || "geen functie";

          const calc = calcByRowKey.get(key) || {
            dm: String(r.doormelding_mode || "GEEN"),
            riskI: null,
            riskE: null,
            imax: null,
            emax: null,
          };

          const rowInternEnabled = calc.dm === "MET_VERTRAGING";
          const rowExternEnabled = calc.dm === "MET_VERTRAGING" || calc.dm === "ZONDER_VERTRAGING";

          return (
            <div key={key} className="panel" style={{ padding: 12 }}>
              <button
                type="button"
                className="panel-summary"
                onClick={() => toggleOpen(key)}
                disabled={saving}
                onMouseEnter={() => toggleIconRefs.current[key]?.startAnimation?.()}
                onMouseLeave={() => toggleIconRefs.current[key]?.stopAnimation?.()}
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

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                      flexWrap: "wrap",
                    }}
                  >
                    <div className="pr-head-title">
                      <span className="pr-func">
                        {funName}
                        {hasLabel ? <> {"\""}{label}{"\""}</> : null}
                      </span>
                    </div>

                    <Badge variant={badgeVariant(calc.dm)} title="Doormelding (per regel)">
                      {dmLabel(calc.dm)}
                    </Badge>

                    {rowExternEnabled && (
                      <Badge variant={badgeVariant(calc.dm)} title="Risicoklasse extern">
                        Extern: {calc.riskE ?? "—"}
                      </Badge>
                    )}

                    {rowInternEnabled && (
                      <Badge variant={badgeVariant(calc.dm)} title="Risicoklasse intern">
                        Intern: {calc.riskI ?? "—"}
                      </Badge>
                    )}

                    {(rowInternEnabled || rowExternEnabled) && (
                      <Badge variant={badgeVariant(calc.dm)} title="O&O max voor deze regel">
                        O&amp;O{" "}
                        {rowInternEnabled ? `intern: ${calc.imax ?? "—"} ` : ""}
                        {rowExternEnabled ? `· extern: ${calc.emax ?? "—"}` : ""}
                      </Badge>
                    )}

                    <span className="muted" style={{ whiteSpace: "nowrap" }}>
                      A:{toInt(r.automatic_detectors)} H:{toInt(r.manual_call_points)} V:
                      {toInt(r.flame_detectors)} L:{toInt(r.linear_smoke_detectors)} ASP:
                      {toInt(r.aspirating_openings)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    flex: "0 0 auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    title="verwijderen"
                    disabled={saving}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeRow(idx);
                    }}
                  >
                    <DeleteIcon size={18} />
                  </button>

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
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className="label">gebruikersfunctie</div>
                    <select
                      className="input"
                      value={r.gebruikersfunctie_key}
                      onChange={(e) => updateRow(idx, { gebruikersfunctie_key: e.target.value })}
                      disabled={saving}
                    >
                      {matrixForNorm.length > 0
                        ? matrixForNorm.map((m) => {
                            const fk = String(m.gebruikersfunctie_key);
                            const nm = functieNameByKey.get(fk) || String(m.matrix_name || fk);
                            return (
                              <option key={fk} value={fk}>
                                {nm}
                              </option>
                            );
                          })
                        : functies.map((f) => (
                            <option
                              key={f.gebruikersfunctie_key}
                              value={String(f.gebruikersfunctie_key)}
                            >
                              {String(f.default_name || f.display_name || f.gebruikersfunctie_key)}
                            </option>
                          ))}
                    </select>
                  </div>

                  <div>
                    <div className="label">doormelding (regel)</div>
                    <select
                      className="input"
                      value={r.doormelding_mode || "GEEN"}
                      onChange={(e) =>
                        updateRow(idx, { doormelding_mode: String(e.target.value || "GEEN") })
                      }
                      disabled={saving}
                    >
                      <option value="GEEN">geen</option>
                      <option value="ZONDER_VERTRAGING">zonder vertraging</option>
                      <option value="MET_VERTRAGING">met vertraging</option>
                    </select>
                  </div>

                  <div>
                    <div className="label">label (optioneel)</div>
                    <input
                      className="input"
                      value={r.row_label ?? ""}
                      onChange={(e) => updateRow(idx, { row_label: e.target.value })}
                      placeholder='bijv. "hoofdgebouw"; "bijgebouw"; "magazijn 1"'
                      disabled={saving}
                    />
                  </div>

                  <StepperInput
                    label="automatische melders"
                    value={r.automatic_detectors ?? 0}
                    disabled={saving}
                    onChange={(v) => updateRow(idx, { automatic_detectors: v })}
                  />

                  <StepperInput
                    label="handmelders"
                    value={r.manual_call_points ?? 0}
                    disabled={saving}
                    onChange={(v) => updateRow(idx, { manual_call_points: v })}
                  />

                  <StepperInput
                    label="vlamdetectoren"
                    value={r.flame_detectors ?? 0}
                    disabled={saving}
                    onChange={(v) => updateRow(idx, { flame_detectors: v })}
                  />

                  <StepperInput
                    label="lijnrookmelders"
                    value={r.linear_smoke_detectors ?? 0}
                    disabled={saving}
                    onChange={(v) => updateRow(idx, { linear_smoke_detectors: v })}
                  />

                  <div style={{ gridColumn: "1 / -1" }}>
                    <StepperInput
                      label="aspiratie openingen"
                      value={r.aspirating_openings ?? 0}
                      disabled={saving}
                      onChange={(v) => updateRow(idx, { aspirating_openings: v })}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default PerformanceRequirementsTab;
