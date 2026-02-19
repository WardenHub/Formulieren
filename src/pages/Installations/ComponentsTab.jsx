// /src/pages/Installations/ComponentsTab.jsx
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { SearchIcon } from "@/components/ui/search";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";

import { getInstallationComponents } from "../../api/emberApi.js";

const ComponentsTab = forwardRef(function ComponentsTab({ code, onAnyOpenChange }, ref) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [q, setQ] = useState("");

  const searchIconRef = useRef(null);
  const helpIconRef = useRef(null);

  const [helpOpen, setHelpOpen] = useState(false);
  const helpWrapRef = useRef(null);

  const [openMap, setOpenMap] = useState({}); // component_id -> bool
  const toggleIconRefs = useRef({});

  const helpText =
    "Alleen-lezen; gesynchroniseerd uit Atrium. Pas componenten aan in je werkbon (Installatie → Componenten) of rechtstreeks in Atrium bij installatie → regels.";

  const typeInfo = useMemo(() => {
    return {
      M: { label: "Artikel", badgeKey: "m" },
      K: { label: "Handmatig", badgeKey: "k" },
      R: { label: "Recept", badgeKey: "r" },
    };
  }, []);

  function normalizeStr(v) {
    const s = v === null || v === undefined ? "" : String(v);
    const t = s.trim();
    return t.length ? t : null;
  }

  function formatDate(v) {
    if (!v) return null;

    if (typeof v === "string") {
      const s = v.trim();

      // YYYY-MM-DD from API or DB
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

      // ISO; show date part only
      if (s.includes("T") && /^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

      const d = new Date(s);
      if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
      return s;
    }

    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return String(v);
    return d.toISOString().slice(0, 10);
  }

  // NEW: readable timestamp for "geladen"
  function formatDateTime(v) {
    if (!v) return null;

    const d = v instanceof Date ? v : new Date(v);
    if (!Number.isFinite(d.getTime())) return typeof v === "string" ? v : String(v);

    // local time, compact & readable: 2026-02-18 13:13
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  function formatQty(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);

    const asInt = Math.trunc(n);
    if (Math.abs(n - asInt) < 0.0000001) return String(asInt);

    return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await getInstallationComponents(code);
        const list = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
        if (cancelled) return;

        setItems(list);

        setOpenMap((prev) => {
          const next = { ...prev };
          for (const it of list) {
            const id = it?.component_id || it?.id || it?.componentId;
            if (!id) continue;
            if (next[id] === undefined) next[id] = false;
          }
          return next;
        });
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (code) run();

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    const anyOpen = Object.values(openMap).some(Boolean);
    onAnyOpenChange?.(anyOpen);
  }, [openMap, onAnyOpenChange]);

  useEffect(() => {
    if (!helpOpen) return;

    function onMouseDown(e) {
      const el = helpWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setHelpOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") setHelpOpen(false);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [helpOpen]);

  const filtered = useMemo(() => {
    const needle = String(q || "").trim().toLowerCase();
    if (!needle) return items;

    return items.filter((it) => {
      const parts = [
        it?.instcomp_omschrijving,
        it?.instcomp_serienr,
        it?.instcomp_locatie,
        it?.artikel_code,
        it?.artikel_omschrijving,
        it?.handart_code,
        it?.handart_omschrijving,
        it?.tarief_code,
        it?.tarief_omschrijving,
      ]
        .map(normalizeStr)
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return parts.includes(needle);
    });
  }, [items, q]);

  function toggleOpen(id) {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const it of filtered) {
        const id = it?.component_id || it?.id || it?.componentId;
        if (id) next[id] = true;
      }
      return next;
    });
  }

  function collapseAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const it of filtered) {
        const id = it?.component_id || it?.id || it?.componentId;
        if (id) next[id] = false;
      }
      return next;
    });
  }

  useImperativeHandle(ref, () => ({ expandAll, collapseAll }));

  if (!code) return <p className="muted">laden; componenten</p>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>Componenten</h2>

          <div ref={helpWrapRef} style={{ position: "relative" }}>
            <button
              type="button"
              className="icon-btn"
              title="info"
              style={{ width: 38, height: 38 }}
              onClick={() => setHelpOpen((v) => !v)}
              onMouseEnter={() => helpIconRef.current?.startAnimation?.()}
              onMouseLeave={() => helpIconRef.current?.stopAnimation?.()}
            >
              <CircleHelpIcon ref={helpIconRef} size={18} className="nav-anim-icon" />
            </button>

            {helpOpen && (
              <div
                className="panel"
                role="dialog"
                aria-label="info componenten"
                style={{
                  position: "absolute",
                  top: 44,
                  left: 0,
                  width: "min(520px, calc(100vw - 40px))",
                  padding: 12,
                  borderRadius: 14,
                  background: "var(--surface-2)",
                  boxShadow: "var(--shadow)",
                  zIndex: 30,
                }}
              >
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                  {helpText}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
          {filtered.length} van {items.length}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 260 }}>
          <div className="searchbar">
            <SearchIcon ref={searchIconRef} size={18} className="nav-anim-icon" />

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek op omschrijving; serienr; locatie; artikel"
              onFocus={() => searchIconRef.current?.startAnimation?.()}
              onBlur={() => searchIconRef.current?.stopAnimation?.()}
              className="searchbar-input"
            />
          </div>
        </div>
      </div>

      {loading && <p className="muted">Laden…</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="muted">Geen componenten gevonden.</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((it) => {
          const id = it?.component_id || it?.id || it?.componentId;
          if (!id) return null;

          const regelNr = it?.instcomp_regel_nr ?? "";
          const nr =
            regelNr !== "" && regelNr !== null && regelNr !== undefined ? String(regelNr) : "?";

          const qty = formatQty(it?.instcomp_aantal);
          const qtyTxt = qty ? `${qty}×` : null;

          const name =
            normalizeStr(it?.instcomp_omschrijving) ||
            normalizeStr(it?.artikel_omschrijving) ||
            "Onbekend component";

          const regelType = normalizeStr(it?.instcomp_regel_type);
          const t = regelType && typeInfo[regelType] ? typeInfo[regelType] : null;

          const badgeLabel = t?.label || "Onbekend";
          const badgeKey = t?.badgeKey || "m";

          const isOpen = Boolean(openMap[id]);

          const plaatsing = formatDate(it?.instcomp_datum_plaatsing);
          const garantie = formatDate(it?.instcomp_datum_garantie);

          const artikel = [normalizeStr(it?.artikel_code), normalizeStr(it?.artikel_omschrijving)]
            .filter(Boolean)
            .join(" ; ");
          const handart = [normalizeStr(it?.handart_code), normalizeStr(it?.handart_omschrijving)]
            .filter(Boolean)
            .join(" ; ");
          const tarief = [normalizeStr(it?.tarief_code), normalizeStr(it?.tarief_omschrijving)]
            .filter(Boolean)
            .join(" ; ");

          const metaLine = artikel ? `artikel ${artikel}` : tarief ? `tarief ${tarief}` : null;

          const bronGcid = normalizeStr(it?.source_instcomp_gcid);
          const geladenAt = formatDateTime(it?.data_loaded_at);

          return (
            <div key={id} className="comp-row">
              <button
                type="button"
                className="comp-head"
                onClick={() => toggleOpen(id)}
                onMouseEnter={() => toggleIconRefs.current[id]?.startAnimation?.()}
                onMouseLeave={() => toggleIconRefs.current[id]?.stopAnimation?.()}
                title={isOpen ? "inklappen" : "uitklappen"}
              >
                <div className="comp-head-left">
                  <div className="comp-title-row">
                    <span className="comp-pill comp-pill--nr">#{nr}</span>
                    {qtyTxt ? <span className="comp-pill comp-pill--qty">{qtyTxt}</span> : null}

                    <div className="comp-title" title={name}>
                      {name}
                    </div>
                  </div>

                  {metaLine ? <div className="comp-meta">{metaLine}</div> : null}
                </div>

                <div className="comp-head-right">
                  <span className={`comp-badge comp-badge--${badgeKey}`}>{badgeLabel}</span>

                  {!isOpen ? (
                    <PlusIcon
                      ref={(el) => {
                        toggleIconRefs.current[id] = el;
                      }}
                      size={18}
                      className="nav-anim-icon"
                    />
                  ) : (
                    <ChevronUpIcon
                      ref={(el) => {
                        toggleIconRefs.current[id] = el;
                      }}
                      size={18}
                      className="nav-anim-icon"
                    />
                  )}
                </div>
              </button>

              {isOpen && (
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <div className="muted">Plaatsingdatum</div>
                    <div>{plaatsing ?? <span className="muted">onbekend</span>}</div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <div className="muted">Garantie tot</div>
                    <div>{garantie ?? <span className="muted">onbekend</span>}</div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <div className="muted">Artikeltype</div>
                    <div style={{ overflowWrap: "anywhere" }}>
                      {normalizeStr(it?.instcomp_artikeltype) ||
                        normalizeStr(it?.artikel_artikeltype) || (
                          <span className="muted">onbekend</span>
                        )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <div className="muted">Handelsartikel</div>
                    <div style={{ overflowWrap: "anywhere" }}>
                      {handart ? handart : <span className="muted">onbekend</span>}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <div className="muted">Tarief</div>
                    <div style={{ overflowWrap: "anywhere" }}>
                      {tarief ? tarief : <span className="muted">onbekend</span>}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <div className="muted">Serienr</div>
                    <div style={{ overflowWrap: "anywhere" }}>
                      {normalizeStr(it?.instcomp_serienr) ?? <span className="muted">onbekend</span>}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <div className="muted">Locatie</div>
                    <div style={{ overflowWrap: "anywhere" }}>
                      {normalizeStr(it?.instcomp_locatie) ?? <span className="muted">onbekend</span>}
                    </div>
                  </div>

                  {/* UPDATED: eerst geladen (leesbaar), dan gcid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr",
                      gap: 12,
                      alignItems: "baseline",
                    }}
                  >
                    <div className="muted">Bron</div>
                    <div className="muted" style={{ overflowWrap: "anywhere" }}>
                      {geladenAt ? `geladen ${geladenAt}` : "geladen onbekend"}
                      {bronGcid ? ` ; gcid ${bronGcid}` : " ; gcid onbekend"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @media (max-width: 720px){
          .comp-row [style*="grid-template-columns: 260px 1fr"]{
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
});

export default ComponentsTab;
