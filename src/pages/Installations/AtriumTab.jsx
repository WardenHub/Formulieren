// /src/pages/Installations/AtriumTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";

const AtriumTab = forwardRef(function AtriumTab({ catalog, installation, isAdmin = false, onAnyOpenChange }, ref) {
  const sections = Array.isArray(catalog?.sections) ? catalog.sections : [];
  const fields = Array.isArray(catalog?.fields) ? catalog.fields : [];

  // only external fields from AtriumInstallationBase + filter synced/gcid
  const atriumFields = useMemo(() => {
    return fields.filter((f) => {
      if (!f) return false;
      if (f.is_active === false) return false;
      if (f.source !== "external") return false;
      if (f.source_type && f.source_type !== "fabric") return false;
      if (f.fabric_table && f.fabric_table !== "AtriumInstallationBase") return false;

      const sk = String(f.section_key || "overig");
      if (sk === "gcid") return false;
      if (sk === "synced" && !isAdmin) return false;

      return true;
    });
  }, [fields, isAdmin]);

  const fieldsBySection = useMemo(() => {
    const m = new Map();
    for (const f of atriumFields) {
      const key = f.section_key || "overig";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(f);
    }
    return m;
  }, [atriumFields]);

  const orderedSectionKeys = useMemo(() => {
    const known = sections
      .map((s) => s.section_key)
      .filter((k) => k !== "gcid")
      .filter((k) => (isAdmin ? true : k !== "synced"));

    const unknown = Array.from(fieldsBySection.keys()).filter((k) => !known.includes(k));
    return [...known.filter((k) => fieldsBySection.has(k)), ...unknown];
  }, [sections, fieldsBySection, isAdmin]);

  function getValueForField(f) {
    const col = f.fabric_column;
    if (!col) return null;
    return installation?.[col] ?? null;
  }

  function formatValue(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "boolean") return v ? "ja" : "nee";
    return String(v);
  }

  function sectionName(sectionKey) {
    const s = sections.find((x) => x.section_key === sectionKey);
    return s?.section_name || sectionKey;
  }

  const [openMap, setOpenMap] = useState({}); // sectionKey -> bool
  const toggleIconRefs = useRef({});

  // init defaults: alles dicht
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const sectionKey of orderedSectionKeys) {
        if (next[sectionKey] === undefined) next[sectionKey] = false;
      }
      return next;
    });
  }, [orderedSectionKeys]);

  // notify parent: staat er iets open?
  useEffect(() => {
    const anyOpen = Object.values(openMap).some(Boolean);
    onAnyOpenChange?.(anyOpen);
  }, [openMap, onAnyOpenChange]);

  function toggleOpen(sectionKey) {
    setOpenMap((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  }

  function expandAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const sectionKey of orderedSectionKeys) next[sectionKey] = true;
      return next;
    });
  }

  function collapseAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const sectionKey of orderedSectionKeys) next[sectionKey] = false;
      return next;
    });
  }

  useImperativeHandle(ref, () => ({ expandAll, collapseAll }));

  function animateSummaryIcon(sectionKey) {
    toggleIconRefs.current[sectionKey]?.startAnimation?.();
  }

  function stopSummaryIcon(sectionKey) {
    toggleIconRefs.current[sectionKey]?.stopAnimation?.();
  }

  if (!catalog || !installation) return <p className="muted">laden; atriumdata</p>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Atriumdata</h2>

      {orderedSectionKeys.length === 0 && <p className="muted">geen atrium velden gevonden in catalog</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {orderedSectionKeys.map((sectionKey) => {
          const list = fieldsBySection.get(sectionKey) || [];
          const totalCount = list.length;

          let filledCount = 0;
          for (const f of list) {
            const val = formatValue(getValueForField(f));
            if (val !== null) filledCount++;
          }

          const isOpen = Boolean(openMap[sectionKey]);

          return (
            <div
              key={sectionKey}
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
              }}
            >
              <button
                type="button"
                onClick={() => toggleOpen(sectionKey)}
                onMouseEnter={() => animateSummaryIcon(sectionKey)}
                onMouseLeave={() => stopSummaryIcon(sectionKey)}
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
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600 }}>{sectionName(sectionKey)}</div>

                  <div className="muted" style={{ whiteSpace: "nowrap" }}>
                    {totalCount} velden
                  </div>

                  <div className="muted" style={{ whiteSpace: "nowrap" }}>
                    {filledCount} met waarde
                  </div>
                </div>

                <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
                  {!isOpen ? (
                    <PlusIcon
                      ref={(el) => {
                        toggleIconRefs.current[sectionKey] = el;
                      }}
                      size={18}
                      className="nav-anim-icon"
                    />
                  ) : (
                    <ChevronUpIcon
                      ref={(el) => {
                        toggleIconRefs.current[sectionKey] = el;
                      }}
                      size={18}
                      className="nav-anim-icon"
                    />
                  )}
                </div>
              </button>

              {isOpen && (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {list.map((f) => {
                    const raw = getValueForField(f);
                    const val = formatValue(raw);

                    return (
                      <div
                        key={f.field_key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "260px 1fr",
                          gap: 12,
                          alignItems: "baseline",
                        }}
                      >
                        <div className="muted">{f.label || f.field_key}</div>
                        <div style={{ overflowWrap: "anywhere" }}>
                          {val ?? <span className="muted">geen waarde</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default AtriumTab;
