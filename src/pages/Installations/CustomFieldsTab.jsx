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

function looksLikeCompanyPresetSection(sectionNameOrKey) {
  const s = lower(sectionNameOrKey);
  if (!s) return false;

  return (
    s.includes("installateur") ||
    s.includes("installateurs") ||
    s.includes("onderhouder") ||
    s.includes("onderhoud") ||
    s.includes("onderhoudsbedrijf")
  );
}

function findFieldKeyByLabel(fields, predicate) {
  for (const f of fields) {
    const label = lower(f?.label || "");
    const key = lower(f?.field_key || "");
    if (predicate(label) || predicate(key)) return f.field_key;
  }
  return null;
}

function findAddressFieldKey(fields) {
  const arr = Array.isArray(fields) ? fields : [];

  const candidates = arr
    .map((f) => {
      const label = lower(f?.label || "");
      const key = lower(f?.field_key || "");
      return { field_key: f?.field_key ?? null, label, key };
    })
    .filter((x) => x.field_key);

  for (const c of candidates) {
    if (c.key.includes("_straat") || c.key.endsWith("straat")) return c.field_key;
  }

  for (const c of candidates) {
    if (c.key.includes("adres1") || c.key.includes("_adres") || c.key.endsWith("adres")) return c.field_key;
  }

  for (const c of candidates) {
    if (
      c.label.includes("straat") ||
      c.label.includes("straatnaam") ||
      c.label.includes("huisnummer") ||
      c.label.includes("adres")
    ) {
      return c.field_key;
    }
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

function TabLoadingCard({ title = "Laden...", label = "Bezig met gegevens laden." }) {
  return (
    <div className="card ember-loading-card">
      <div className="ember-loading-card-inner">
        <div className="ember-loading-icon">
          <PlusIcon size={26} className="nav-anim-icon" />
        </div>

        <div className="ember-loading-title">{title}</div>
        <div className="muted ember-small-text">{label}</div>
      </div>
    </div>
  );
}

const CustomFieldsTab = forwardRef(function CustomFieldsTab(
  {
    code,
    catalog,
    customValues,
    onSaved,
    onDirtyChange,
    onSavingChange,
    onSaveOk,
    onAnyOpenChange,
    readOnly = false,
  },
  ref
) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [savedKeys, setSavedKeys] = useState(() => new Set());
  const savedTimersRef = useRef(new Map());

  const toggleIconRefs = useRef({});
  const [openMap, setOpenMap] = useState({});

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

  const optionsByFieldKey = useMemo(() => {
    const map = new Map();

    for (const f of catalog?.fields || []) {
      if (!f?.field_key) continue;
      const arr = Array.isArray(f.options) ? f.options : Array.isArray(f.option_list) ? f.option_list : null;
      if (!arr || arr.length === 0) continue;

      const normalized = arr.map(toOption).filter(Boolean);
      if (normalized.length) map.set(f.field_key, normalized);
    }

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

    for (const [fk, opts] of map.entries()) {
      const byValue = new Map();
      for (const o of opts) byValue.set(o.value, o.label);

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

  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const g of grouped) {
        if (next[g.section_key] === undefined) next[g.section_key] = false;
      }
      return next;
    });
  }, [grouped]);

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
    onDirtyChange?.(readOnly ? false : isDirty);
  }, [isDirty, onDirtyChange, readOnly]);

  useEffect(() => {
    onSavingChange?.(saving);
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
    if (readOnly) return;
    setDraft((prev) => ({ ...prev, [fieldKey]: nextValue }));
    setSaveError(null);
    clearSaved(fieldKey);
  }

  function applyCompanyPreset(sectionFields, preset) {
    if (readOnly) return;
    const fields = Array.isArray(sectionFields) ? sectionFields : [];
    const keyAddress = findAddressFieldKey(fields);

    const keyPcPlaats = findFieldKeyByLabel(fields, (l) => {
      return l.includes("pc") || l.includes("postcode") || (l.includes("plaats") && l.includes("pc"));
    });

    const keyPlaats = keyPcPlaats ? null : findFieldKeyByLabel(fields, (l) => l.includes("plaats"));
    const keyPostcode = keyPcPlaats ? null : findFieldKeyByLabel(fields, (l) => l.includes("postcode"));

    const keyPhone = findFieldKeyByLabel(fields, (l) => l.includes("telefoon"));
    const keyEmail = findFieldKeyByLabel(fields, (l) => l.includes("e-mail") || l.includes("email"));

    const keyName = findFieldKeyByLabel(fields, (l) => {
      return l === "naam" || l.includes("bedrijfsnaam") || l.includes("organisatie");
    });

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
    if (saving || readOnly) return;

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

      await onSaved?.();
      markSaved(changedKeys);
      onSaveOk?.();
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

  function isFilledValue(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  }

  const PRESETS = {
    hefas: {
      name: "Hefas",
      addressLine: "Impact 27",
      pcPlaats: "6921 RZ Duiven",
      postcode: "6921 RZ",
      plaats: "Duiven",
      phone: "026 750 5000",
      email: "info@hefas.nl",
    },
    wardenburg: {
      name: "Wardenburg",
      addressLine: "W.A. Scholtenlaan 21",
      pcPlaats: "9615 TG Kolham",
      postcode: "9615 TG",
      plaats: "Kolham",
      phone: "0598 397 497",
      email: "info@wardenburg.nl",
    },
  };

  if (!catalog) {
    return (
      <TabLoadingCard
        title="Eigenschappen laden..."
        label="Bezig met catalogus en eigenschappen ophalen."
      />
    );
  }

  if (customFields.length === 0) {
    return <div className="muted">geen eigenschappen beschikbaar</div>;
  }

  return (
    <div className="ember-page-stack custom-fields-tab">
      {saveError && <div className="ember-error-text">{saveError}</div>}

      <div className="custom-fields-tab__sections">
        {grouped.map((g) => {
          const isOpen = Boolean(openMap[g.section_key]);
          const totalCount = g.fields.length;

          let filledCount = 0;
          for (const f of g.fields) {
            const val = draft[f.field_key];
            if (isFilledValue(val)) filledCount++;
          }

          const sectionName = g.section?.section_name || g.section_key;
          const showCompanyPresets =
            looksLikeCompanyPresetSection(sectionName) || looksLikeCompanyPresetSection(g.section_key);

          return (
            <div key={g.section_key} className={`ember-group-card ${isOpen ? "is-open" : ""}`}>
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
                className="ember-group-toggle"
                title={isOpen ? "inklappen" : "uitklappen"}
              >
                <div className="ember-group-main">
                  <div className="ember-group-title-row">
                    <div className="ember-group-title">{sectionName}</div>
                    <span className="ember-meta-text">{totalCount} velden</span>
                    <span className="ember-meta-text">{filledCount} met waarde</span>
                  </div>

                  {showCompanyPresets && (
                    <div
                      className="ember-group-presets"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <span className="ember-meta-text">Vul bedrijf:</span>

                      {Object.entries(PRESETS)
                        .map(([key, preset]) => ({ key, ...preset }))
                        .sort((a, b) => a.name.localeCompare(b.name, "nl"))
                        .map((preset) => (
                          <button
                            key={preset.key}
                            type="button"
                            className="btn btn-compact"
                            title={`Vul met ${preset.name}`}
                            onClick={() => applyCompanyPreset(g.fields, preset)}
                            disabled={readOnly}
                          >
                            {preset.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <span className="ember-group-icon">
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
                </span>
              </div>

              {isOpen && (
                <div className="ember-group-body">
                  <div className="cf-grid">
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
                                  disabled={readOnly}
                                >
                                  Ja
                                </button>

                                <button
                                  type="button"
                                  className={val === false ? "cf-bool-btn active" : "cf-bool-btn"}
                                  onClick={() => setField(f.field_key, false)}
                                  disabled={readOnly}
                                >
                                  Nee
                                </button>
                              </div>
                            ) : showAsDropdown ? (
                              <select
                                className="input"
                                value={val ?? ""}
                                onChange={(e) => setField(f.field_key, e.target.value)}
                                disabled={readOnly}
                              >
                                <option value="">kies</option>
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
                                disabled={readOnly}
                              />
                            ) : f.data_type === "date" ? (
                              <input
                                type="date"
                                value={formatDateForInput(val)}
                                onChange={(e) => setField(f.field_key, e.target.value)}
                                className="cf-input"
                                disabled={readOnly}
                              />
                            ) : f.data_type === "json" ? (
                              <textarea
                                value={val ?? ""}
                                onChange={(e) => setField(f.field_key, e.target.value)}
                                rows={5}
                                className="cf-textarea"
                                disabled={readOnly}
                              />
                            ) : (
                              <input
                                type="text"
                                value={val ?? ""}
                                onChange={(e) => setField(f.field_key, e.target.value)}
                                className="input"
                                disabled={readOnly}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
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

export default CustomFieldsTab;
