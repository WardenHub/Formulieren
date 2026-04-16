// /src/pages/Installations/AtriumTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";

const AtriumTab = forwardRef(function AtriumTab({ catalog, installation, isAdmin = false, onAnyOpenChange }, ref) {
  const sections = Array.isArray(catalog?.sections) ? catalog.sections : [];
  const fields = Array.isArray(catalog?.fields) ? catalog.fields : [];
  const installationTypeKey = installation?.installation_type_key ?? null;

  const atriumFields = useMemo(() => {
    return fields.filter((f) => {
      if (!f) return false;
      if (f.is_active === false) return false;
      if (f.source !== "external") return false;

      const applicableTypeKeys = Array.isArray(f.applicability_type_keys)
        ? f.applicability_type_keys.filter(Boolean)
        : [];

      if (applicableTypeKeys.length > 0) {
        if (!installationTypeKey) return false;
        if (!applicableTypeKeys.includes(installationTypeKey)) return false;
      }

      const sk = String(f.section_key || "overig");
      if (sk === "gcid") return false;
      if (sk === "synced" && !isAdmin) return false;

      return true;
    });
  }, [fields, isAdmin, installationTypeKey]);

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

  const [openMap, setOpenMap] = useState({});
  const toggleIconRefs = useRef({});

  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const sectionKey of orderedSectionKeys) {
        if (next[sectionKey] === undefined) next[sectionKey] = false;
      }
      return next;
    });
  }, [orderedSectionKeys]);

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

  if (!catalog || !installation) {
    return (
      <TabLoadingCard
        title="Atriumdata laden..."
        label="Bezig met Atriumvelden en installatiegegevens ophalen."
      />
    );
  }

  return (
    <div className="atrium-tab">
      <h2 className="atrium-tab-title">Atriumdata</h2>

      {orderedSectionKeys.length === 0 && (
        <p className="muted">geen atrium velden gevonden in catalog</p>
      )}

      <div className="atrium-section-list">
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
            <div key={sectionKey} className="atrium-section-card">
              <button
                type="button"
                onClick={() => toggleOpen(sectionKey)}
                onMouseEnter={() => animateSummaryIcon(sectionKey)}
                onMouseLeave={() => stopSummaryIcon(sectionKey)}
                className="atrium-section-head"
                title={isOpen ? "inklappen" : "uitklappen"}
              >
                <div className="atrium-section-head-main">
                  <div className="atrium-section-title">{sectionName(sectionKey)}</div>

                  <div className="atrium-section-meta">
                    <span>{totalCount} velden</span>
                    <span>{filledCount} met waarde</span>
                  </div>
                </div>

                <div className="atrium-section-head-icon">
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
                <div className="atrium-section-body">
                  {list.map((f) => {
                    const raw = getValueForField(f);
                    const val = formatValue(raw);

                    return (
                      <div key={f.field_key} className="atrium-field-row">
                        <div className="atrium-field-label">{f.label || f.field_key}</div>
                        <div className="atrium-field-value">
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

function TabLoadingCard({ title = "Laden...", label = "Bezig met gegevens laden." }) {
  return (
    <div
      className="card"
      style={{
        minHeight: 180,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 24,
          display: "grid",
          gap: 10,
          justifyItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.08)",
            boxShadow: "0 0 0 8px rgba(255,255,255,0.04)",
          }}
        >
          <PlusIcon size={26} className="nav-anim-icon" />
        </div>

        <div style={{ fontWeight: 800, fontSize: 20 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      </div>
    </div>
  );
}

export default AtriumTab;