// /src/pages/Installations/CustomFieldsTab.jsx
import {
  forwardRef,
  useEffect,
  useMemo,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { putCustomValues } from "../../api/emberApi.js";
import { Check } from "lucide-react";

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

const CustomFieldsTab = forwardRef(function CustomFieldsTab(
  { code, catalog, customValues, onSaved, onDirtyChange, onSavingChange, onSaveOk },
  ref
) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [savedKeys, setSavedKeys] = useState(() => new Set());
  const savedTimersRef = useRef(new Map()); // field_key -> timeoutId

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

  useEffect(() => {
    const next = {};
    for (const f of customFields) {
      const v = valuesByKey.get(f.field_key);
      next[f.field_key] = valueToTyped(f, v);
    }
    setDraft(next);
    setSaveError(null);

    // reset per-field saved indicators bij “nieuwe” load
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

  useImperativeHandle(ref, () => ({ save }), [save]);

  if (!catalog) return <div className="muted">laden; catalog</div>;
  if (customFields.length === 0) return <div className="muted">geen eigenschappen beschikbaar</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {saveError && <div style={{ color: "salmon" }}>{saveError}</div>}

      <div style={{ display: "grid", gap: 10 }}>
        {grouped.map((g) => (
          <div
            key={g.section_key}
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {g.section?.section_name || g.section_key}
            </div>

            <div className="cf-grid">
              {g.fields.map((f) => {
                const val = draft[f.field_key];
                const label = f.label || f.field_key;
                const dirty = dirtyKeys.has(f.field_key);
                const saved = savedKeys.has(f.field_key);
                const isWide = f.data_type === "json";

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
                          className="cf-input"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default CustomFieldsTab;
