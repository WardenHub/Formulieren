// /src/pages/Installations/AtriumTab.jsx

export default function AtriumTab({ catalog, installation }) {
  if (!catalog || !installation) {
    return <p className="muted">laden; atriumdata</p>;
  }

  const sections = Array.isArray(catalog.sections) ? catalog.sections : [];
  const fields = Array.isArray(catalog.fields) ? catalog.fields : [];

  // only external fields from AtriumInstallationBase
  const atriumFields = fields.filter((f) => {
    if (!f) return false;
    if (f.is_active === false) return false;
    if (f.source !== "external") return false;
    if (f.source_type && f.source_type !== "fabric") return false;
    if (f.fabric_table && f.fabric_table !== "AtriumInstallationBase") return false;
    return true;
  });

  const fieldsBySection = new Map();
  for (const f of atriumFields) {
    const key = f.section_key || "overig";
    if (!fieldsBySection.has(key)) fieldsBySection.set(key, []);
    fieldsBySection.get(key).push(f);
  }

  // prefer section order from catalog; append unknown section keys at end
  const knownSectionKeys = sections.map((s) => s.section_key);
  const unknownSectionKeys = Array.from(fieldsBySection.keys()).filter(
    (k) => !knownSectionKeys.includes(k)
  );

  const orderedSectionKeys = [
    ...knownSectionKeys.filter((k) => fieldsBySection.has(k)),
    ...unknownSectionKeys,
  ];

  function getValueForField(f) {
    const col = f.fabric_column;
    if (!col) return null;
    return installation[col] ?? null;
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

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Atriumdata</h2>

      {orderedSectionKeys.length === 0 && (
        <p className="muted">geen atrium velden gevonden in catalog</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {orderedSectionKeys.map((sectionKey) => {
          const list = fieldsBySection.get(sectionKey) || [];

          return (
            <div
              key={sectionKey}
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
              }}
            >
              <div style={{ marginBottom: 8, fontWeight: 600 }}>
                {sectionName(sectionKey)}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
