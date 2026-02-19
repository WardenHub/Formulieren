// /src/pages/Installations/CustomFieldsTab.jsx
import { forwardRef, useEffect, useMemo, useImperativeHandle, useRef, useState } from "react";
import { putCustomValues } from "../../api/emberApi.js";
import { Check } from "lucide-react";

import { PlusIcon } from "@/components/ui/plus";
import { ChevronUpIcon } from "@/components/ui/chevron-up";

const SAVED_MS = 3000;

function valueToTyped(field, v) {
  if (!v) return null;

  if (field.data_type === "bool") return v.value_bool ?? null;
  if (field.data_type === "number") return v.value_number ?? null;
  if (field.data_type === "date") return v.value_date ?? null;
  if (field.data_type === "json") return v.value_json ?? null;

  return v.value_string ?? null;
}

function typedToPayload(field, typedValue) {
  const base = { field_key: field.field_key };

  if (typedValue === "" || typedValue === undefined) typedValue = null;

  if (field.data_type === "bool") return { ...base, value_bool: typedValue ?? null };

  if (field.data_type === "number") {
    if (typedValue === null) return { ...base, value_number: null };
    const n = Number(typedValue);
    return { ...base, value_number: Number.isFinite(n) ? n : null };
  }

  if (field.data_type === "date") return { ...base, value_date: typedValue ?? null };
  if (field.data_type === "json") return { ...base, value_json: typedValue ?? null };

  return { ...base, value_string: typedValue ?? null };
}

function formatDateForInput(value) {
  if (!value) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function normStr(v) {
  const s = v == null ? "" : String(v);
  const t = s.trim();
  return t.length ? t : "";
}

function lower(v) {
  return normStr(v).toLowerCase();
}

function looksLikeInstallateurSectionName(name) {
  return lower(name).includes("installateur");
}

function findFieldKeyByLabel(fields, predicate) {
  for (const f of fields) {
    const label = lower(f?.label || f?.field_key || "");
    if (predicate(label)) return f.field_key;
  }
  return null;
}

function toOption(o) {
  if (!o) return null;
  const value = o.option_value ?? o.value ?? o.key ?? o.id ?? null;
  const label = o.option_label ?? o.label ?? o.name ?? String(value ?? "");
  if (value == null) return null;
  return { value: String(value), label: String(label) };
}

const CustomFieldsTab = forwardRef(function CustomFieldsTab(
  { code, catalog, customValues, onSaved, onDirtyChange, onSavingChange, onSaveOk, onAnyOpenChange },
  ref
) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [savedKeys, setSavedKeys] = useState(() => new Set());
  const savedTimersRef = useRef(new Map()); // field_key -> timeoutId

  const toggleIconRefs = useRef({}); // section_key -> iconRef
  const [openMap, setOpenMap] = useState({}); // section_key -> bool

  const customFields = useMemo(() => {
    const fields = catalog?.fields || [];
    return fields
      .filter((f) => f && f.source === "custom" && f.is_active !== false)
      .slice()
      .sort((a, b) => {
        const sa = a.section_key || "";
        const sb = b.section_key || "";
        if (sa !== sb) return sa.localeCompare(sb);
        return (a.label || "").localeCompare(b.label || "");
      });
  }, [catalog]);

  const sectionsByKey = useMemo(() => {
    const map = new Map();
    for (const s of catalog?.sections || []) map.set(s.section_key, s);
    return map;
  }, [catalog]);

  const valuesByKey = useMemo(() => {
    const map = new Map();
    for (const v of customValues || []) map.set(v.field_key, v);
    return map;
  }, [customValues]);

  // ─────────────────────────────────────────────────────────────
  // Options support (dropdowns)
  // We support multiple catalog shapes:
  // 1) field.options (array)
  // 2) catalog.*Options as array rows (field_key, option_value, option_label)
  // 3) NEW backend: catalog.fieldOptions as OBJECT: { [field_key]: [{value,label}] }
  // Result: Map(field_key -> [{value,label}...])
  // ─────────────────────────────────────────────────────────────
  const optionsByFieldKey = useMemo(() => {
    const map = new Map();

    // 1) opties direct op het veld
    for (const f of catalog?.fields || []) {
      if (!f?.field_key) continue;
      const arr = Array.isArray(f.options) ? f.options : Array.isArray(f.option_list) ? f.option_list : null;
      if (!arr || arr.length === 0) continue;

      const normalized = arr.map(toOption).filter(Boolean);
      if (normalized.length) map.set(f.field_key, normalized);
    }

    // 2) opties als losse lijst op de catalog (array rows)
    const flatLists = [
      catalog?.customFieldOptions,
      catalog?.options,
      catalog?.installationCustomFieldOptions,
    ].filter((x) => Array.isArray(x));

    for (const list of flatLists) {
      for (const row of list) {
        const fk = row?.field_key ?? row?.fieldKey ?? null;
        if (!fk) continue;
        const opt = toOption(row);
        if (!opt) continue;

        if (!map.has(fk)) map.set(fk, []);
        map.get(fk).push(opt);
      }
    }

    // 3) NEW: backend returns fieldOptions as object map
    // { [field_key]: [{value,label}] }
    const obj = catalog?.fieldOptions;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [fk, arr] of Object.entries(obj)) {
        if (!fk) continue;
        if (!Array.isArray(arr)) continue;

        const normalized = arr.map(toOption).filter(Boolean);
        if (!normalized.length) continue;

        if (!map.has(fk)) map.set(fk, []);
        map.get(fk).push(...normalized);
      }
    }

    // sort & dedupe per field (by value)
    for (const [fk, opts] of map.entries()) {
      const byValue = new Map();
      for (const o of opts) {
        // laatste wint; label uit backend is leading
        byValue.set(o.value, o.label);
      }
      const unique = Array.from(byValue.entries()).map(([value, label]) => ({ value, label }));
      unique.sort((a, b) => a.label.localeCompare(b.label));
      map.set(fk, unique);
    }

    return map;
  }, [catalog]);

  useEffect(() => {
    const next = {};
    for (const f of customFields) {
      const v = valuesByKey.get(f.field_key);
      next[f.field_key] = valueToTyped(f, v);
    }
    setDraft(next);
    setSaveError(null);

    setSavedKeys(new Set());
    for (const t of savedTimersRef.current.values()) clearTimeout(t);
    savedTimersRef.current.clear();
  }, [customFields, valuesByKey]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const f of customFields) {
      const k = f.section_key || "overig";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(f);
    }
    return Array.from(map.entries()).map(([section_key, fields]) => ({
      section_key,
      section: sectionsByKey.get(section_key) || { section_key, section_name: section_key },
      fields,
    }));
  }, [customFields, sectionsByKey]);

  // init defaults: alles dicht
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) {
        if (next[g.section_key] === undefined) next[g.section_key] = false;
      }
      return next;
    });
  }, [grouped]);

  // notify parent: staat er iets open?
  useEffect(() => {
    const anyOpen = Object.values(openMap).some(Boolean);
    onAnyOpenChange?.(anyOpen);
  }, [openMap, onAnyOpenChange]);

  const dirtyKeys = useMemo(() => {
    const set = new Set();
    for (const f of customFields) {
      const original = valueToTyped(f, valuesByKey.get(f.field_key));
      const current = draft[f.field_key] ?? null;

      const a = original === undefined ? null : original;
      const b = current === undefined ? null : current;

      if (String(a ?? "") !== String(b ?? "")) set.add(f.field_key);
    }
    return set;
  }, [customFields, draft, valuesByKey]);

  const isDirty = dirtyKeys.size > 0;

  useEffect(() => {
    if (typeof onDirtyChange === "function") onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (typeof onSavingChange === "function") onSavingChange(saving);
  }, [saving, onSavingChange]);

  useEffect(() => {
    return () => {
      for (const t of savedTimersRef.current.values()) clearTimeout(t);
      savedTimersRef.current.clear();
    };
  }, []);

  function clearSaved(fieldKey) {
    const prevTimer = savedTimersRef.current.get(fieldKey);
    if (prevTimer) clearTimeout(prevTimer);
    savedTimersRef.current.delete(fieldKey);

    setSavedKeys((prev) => {
      if (!prev.has(fieldKey)) return prev;
      const next = new Set(prev);
      next.delete(fieldKey);
      return next;
    });
  }

  function markSaved(keys) {
    setSavedKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });

    for (const k of keys) {
      const prevTimer = savedTimersRef.current.get(k);
      if (prevTimer) clearTimeout(prevTimer);

      const t = setTimeout(() => {
        setSavedKeys((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
        savedTimersRef.current.delete(k);
      }, SAVED_MS);

      savedTimersRef.current.set(k, t);
    }
  }

  function setField(fieldKey, nextValue) {
    setDraft((prev) => ({ ...prev, [fieldKey]: nextValue }));
    setSaveError(null);
    clearSaved(fieldKey);
  }

  function applyCompanyPreset(sectionFields, preset) {
    const fields = Array.isArray(sectionFields) ? sectionFields : [];

    const keyAddress = findFieldKeyByLabel(fields, (l) => l.includes("adres"));
    const keyPcPlaats = findFieldKeyByLabel(fields, (l) => l.includes("pc") || l.includes("postcode") || (l.includes("plaats") && l.includes("pc")));
    const keyPlaats = keyPcPlaats ? null : findFieldKeyByLabel(fields, (l) => l.includes("plaats"));
    const keyPostcode = keyPcPlaats ? null : findFieldKeyByLabel(fields, (l) => l.includes("postcode"));

    const keyPhone = findFieldKeyByLabel(fields, (l) => l.includes("telefoon"));
    const keyEmail = findFieldKeyByLabel(fields, (l) => l.includes("e-mail") || l.includes("email"));
    const keyName = findFieldKeyByLabel(fields, (l) => l === "naam" || l.includes("bedrijfsnaam") || l.includes("organisatie"));

    setDraft((prev) => {
      const next = { ...prev };
      const touched = [];

      if (keyName) {
        next[keyName] = preset.name ?? prev[keyName] ?? null;
        touched.push(keyName);
      }

      if (keyAddress) {
        next[keyAddress] = preset.addressLine ?? null;
        touched.push(keyAddress);
      }

      if (keyPcPlaats) {
        next[keyPcPlaats] = preset.pcPlaats ?? null;
        touched.push(keyPcPlaats);
      } else {
        if (keyPostcode) {
          next[keyPostcode] = preset.postcode ?? null;
          touched.push(keyPostcode);
        }
        if (keyPlaats) {
          next[keyPlaats] = preset.plaats ?? null;
          touched.push(keyPlaats);
        }
      }

      if (keyPhone) {
        next[keyPhone] = preset.phone ?? null;
        touched.push(keyPhone);
      }

      if (keyEmail) {
        next[keyEmail] = preset.email ?? null;
        touched.push(keyEmail);
      }

      for (const k of touched) clearSaved(k);

      return next;
    });

    setSaveError(null);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setSaveError(null);

    try {
      const changes = [];
      const changedKeys = [];

      for (const f of customFields) {
        const original = valueToTyped(f, valuesByKey.get(f.field_key));
        const current = draft[f.field_key] ?? null;

        const a = original === undefined ? null : original;
        const b = current === undefined ? null : current;

        if (String(a ?? "") === String(b ?? "")) continue;

        changes.push(typedToPayload(f, current));
        changedKeys.push(f.field_key);
      }

      if (changes.length === 0) return;

      await putCustomValues(code, changes);

      if (typeof onSaved === "function") {
        await onSaved();
      }

      markSaved(changedKeys);

      if (typeof onSaveOk === "function") {
        onSaveOk();
      }
    } catch (e) {
      setSaveError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  function toggleSection(sectionKey) {
    setOpenMap((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  }

  function expandAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) next[g.section_key] = true;
      return next;
    });
  }

  function collapseAll() {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) next[g.section_key] = false;
      return next;
    });
  }

  function animateSectionIcon(sectionKey) {
    toggleIconRefs.current[sectionKey]?.startAnimation?.();
  }

  function stopSectionIcon(sectionKey) {
    toggleIconRefs.current[sectionKey]?.stopAnimation?.();
  }

  useImperativeHandle(ref, () => ({ save, expandAll, collapseAll }));

  if (!catalog) return <div className="muted">laden; catalog</div>;
  if (customFields.length === 0) return <div className="muted">geen eigenschappen beschikbaar</div>;

  function isFilledValue(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  }

  const PRESETS = {
    wardenburg: {
      name: "Wardenburg",
      addressLine: "W.A. Scholtenlaan 21",
      pcPlaats: "9615 TG Kolham",
      postcode: "9615 TG",
      plaats: "Kolham",
      phone: "0598 397 497",
      email: "info@wardenburg.nl",
    },
    hefas: {
      name: "Hefas",
      addressLine: "Impact 27",
      pcPlaats: "6921 RZ Duiven",
      postcode: "6921 RZ",
      plaats: "Duiven",
      phone: "026 750 5000",
      email: null,
    },
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {saveError && <div style={{ color: "salmon" }}>{saveError}</div>}

      <div style={{ display: "grid", gap: 10 }}>
        {grouped.map((g) => {
          const isOpen = Boolean(openMap[g.section_key]);

          const totalCount = g.fields.length;
          let filledCount = 0;
          for (const f of g.fields) {
            const val = draft[f.field_key];
            if (isFilledValue(val)) filledCount++;
          }

          const sectionName = g.section?.section_name || g.section_key;
          const showInstallateurPresets = looksLikeInstallateurSectionName(sectionName);

          return (
            <div
              key={g.section_key}
              style={{
                padding: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
              }}
            >
              {/* summary row (NO nested button issue) */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleSection(g.section_key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSection(g.section_key);
                  }
                }}
                onMouseEnter={() => animateSectionIcon(g.section_key)}
                onMouseLeave={() => stopSectionIcon(g.section_key)}
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
                  outline: "none",
                }}
                title={isOpen ? "inklappen" : "uitklappen"}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600 }}>{sectionName}</div>

                  <div className="muted" style={{ whiteSpace: "nowrap" }}>
                    {totalCount} velden
                  </div>

                  <div className="muted" style={{ whiteSpace: "nowrap" }}>
                    {filledCount} met waarde
                  </div>

                  {showInstallateurPresets && (
                    <div
                      style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginLeft: 4,
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                        Vul bedrijf:
                      </span>

                      <button
                        type="button"
                        className="btn"
                        title="Vul Installateur met Wardenburg"
                        onClick={() => applyCompanyPreset(g.fields, PRESETS.wardenburg)}
                      >
                        Wardenburg
                      </button>

                      <button
                        type="button"
                        className="btn"
                        title="Vul Installateur met Hefas"
                        onClick={() => applyCompanyPreset(g.fields, PRESETS.hefas)}
                      >
                        Hefas
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
                  {!isOpen ? (
                    <PlusIcon
                      ref={(el) => {
                        toggleIconRefs.current[g.section_key] = el;
                      }}
                      size={18}
                      className="nav-anim-icon"
                    />
                  ) : (
                    <ChevronUpIcon
                      ref={(el) => {
                        toggleIconRefs.current[g.section_key] = el;
                      }}
                      size={18}
                      className="nav-anim-icon"
                    />
                  )}
                </div>
              </div>

              {/* details */}
              {isOpen && (
                <div className="cf-grid" style={{ marginTop: 10 }}>
                  {g.fields.map((f) => {
                    const val = draft[f.field_key];
                    const label = f.label || f.field_key;
                    const dirty = dirtyKeys.has(f.field_key);
                    const saved = savedKeys.has(f.field_key);

                    const opts = optionsByFieldKey.get(f.field_key) || [];
                    const hasOptions = opts.length > 0;

                    const isWide = f.data_type === "json";
                    const showAsDropdown = hasOptions && f.data_type === "string";

                    return (
                      <div key={f.field_key} className={isWide ? "cf-row wide" : "cf-row"}>
                        <div className="cf-label">
                          {saved ? (
                            <span className="icon-ok icon-ok--green" title="opgeslagen">
                              <Check size={14} />
                            </span>
                          ) : (
                            <span className={dirty ? "dot dirty" : "dot"} title={dirty ? "gewijzigd" : ""} />
                          )}
                          <div className="cf-label-text">{label}</div>
                        </div>

                        <div className="cf-control">
                          {f.data_type === "bool" ? (
                            <div className="cf-bool">
                              <button
                                type="button"
                                className={val === true ? "cf-bool-btn active" : "cf-bool-btn"}
                                onClick={() => setField(f.field_key, true)}
                              >
                                Ja
                              </button>
                              <button
                                type="button"
                                className={val === false ? "cf-bool-btn active" : "cf-bool-btn"}
                                onClick={() => setField(f.field_key, false)}
                              >
                                Nee
                              </button>
                            </div>
                          ) : showAsDropdown ? (
                            <select
                              className="input"
                              value={val ?? ""}
                              onChange={(e) => setField(f.field_key, e.target.value)}
                            >
                              <option value="">— kies —</option>
                              {opts.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : f.data_type === "number" ? (
                            <input
                              type="number"
                              value={val ?? ""}
                              onChange={(e) => setField(f.field_key, e.target.value)}
                              className="cf-input"
                            />
                          ) : f.data_type === "date" ? (
                            <input
                              type="date"
                              value={formatDateForInput(val)}
                              onChange={(e) => setField(f.field_key, e.target.value)}
                              className="cf-input"
                            />
                          ) : f.data_type === "json" ? (
                            <textarea
                              value={val ?? ""}
                              onChange={(e) => setField(f.field_key, e.target.value)}
                              rows={5}
                              className="cf-textarea"
                            />
                          ) : (
                            <input
                              type="text"
                              value={val ?? ""}
                              onChange={(e) => setField(f.field_key, e.target.value)}
                              className="input"
                            />
                          )}
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

export default CustomFieldsTab;
