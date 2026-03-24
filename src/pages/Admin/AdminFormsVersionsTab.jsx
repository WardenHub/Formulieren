// /src/pages/Admin/AdminFormsVersionsTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowUpIcon } from "@/components/ui/arrow-up";
import { ArrowDownIcon } from "@/components/ui/arrow-down";

function formatPublishedAt(value) {
  if (!value) return "Niet gepubliceerd";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("nl-NL");
}

function statusLabel(status) {
  if (status === "A") return "Actief";
  if (status === "M") return "Alleen beheer";
  if (status === "I") return "Niet actief";
  return status || "Onbekend";
}

function downloadJsonFile(filename, obj) {
  const text = JSON.stringify(obj ?? null, null, 2) + "\n";
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(String(text || "")) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

function formatJsonText(text) {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, value: JSON.stringify(parsed.value, null, 2) + "\n" };
}

const AdminFormsVersionsTab = forwardRef(function AdminFormsVersionsTab(
  {
    forms,
    selectedFormId,
    onSelectForm,
    onDirtyChange,
    onSavingChange,
    onSaveOk,
    onPersistFormOrder,
    onOpenFormDev,
    onCreateForm,
    onCreateVersionFromJsonText,
  },
  ref
) {
  const upIconRefs = useRef({});
  const downIconRefs = useRef({});

  const [orderDraft, setOrderDraft] = useState(forms);
  const [saving, setSaving] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFormCode, setNewFormCode] = useState("");
  const [newFormName, setNewFormName] = useState("");
  const [newFormDescription, setNewFormDescription] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadError, setUploadError] = useState(null);
  const [uploadOk, setUploadOk] = useState(false);

  useEffect(() => {
    setOrderDraft(forms);
  }, [forms]);

  const selectedForm = useMemo(() => {
    return orderDraft.find((x) => x.form_id === selectedFormId) ?? null;
  }, [orderDraft, selectedFormId]);

  const isDirty = useMemo(() => {
    const a = orderDraft.map((x) => x.form_id);
    const b = forms.map((x) => x.form_id);
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [orderDraft, forms]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  function moveForm(formId, direction) {
    setOrderDraft((prev) => {
      const arr = [...prev];
      const idx = arr.findIndex((x) => x.form_id === formId);
      if (idx < 0) return prev;

      const nextIdx = direction === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= arr.length) return prev;

      const swap = arr[nextIdx];
      arr[nextIdx] = arr[idx];
      arr[idx] = swap;

      return arr.map((item, i) => ({
        ...item,
        sort_order: (i + 1) * 10,
      }));
    });
  }

  async function save() {
    if (!isDirty || saving) return;

    setSaving(true);
    try {
      await Promise.resolve();
      onPersistFormOrder(orderDraft);
      onSaveOk?.();
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  function resetCreateForm() {
    setShowCreateForm(false);
    setNewFormCode("");
    setNewFormName("");
    setNewFormDescription("");
  }

  function handleConfirmCreateForm() {
    const code = String(newFormCode || "").trim();
    const name = String(newFormName || "").trim();
    const description = String(newFormDescription || "").trim();

    if (!code || !name) {
      window.alert("Vul minimaal code en naam in.");
      return;
    }

    onCreateForm({
      code,
      name,
      description,
    });

    resetCreateForm();
  }

  function handleFormatUploadJson() {
    const res = formatJsonText(uploadText);
    if (!res.ok) {
      setUploadError(`Format faalde; ${res.error}`);
      setUploadOk(false);
      return;
    }

    setUploadText(res.value);
    setUploadError(null);
    setUploadOk(false);
  }

  function handleValidateUploadJson() {
    const parsed = safeJsonParse(uploadText);
    if (!parsed.ok) {
      setUploadError(`JSON ongeldig; ${parsed.error}`);
      setUploadOk(false);
      return;
    }

    setUploadError(null);
    setUploadOk(true);
  }

  function handleConfirmUpload() {
    if (!selectedForm) return;

    const parsed = safeJsonParse(uploadText);
    if (!parsed.ok) {
      setUploadError(`JSON ongeldig; ${parsed.error}`);
      setUploadOk(false);
      return;
    }

    onCreateVersionFromJsonText(selectedForm, uploadText);
    setUploadText("");
    setUploadError(null);
    setUploadOk(false);
    setShowUpload(false);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          padding: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>Formulieren</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Sorteervolgorde wordt hier beheerd. Alt+S slaat op.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowCreateForm((v) => !v);
                setShowUpload(false);
              }}
            >
              Nieuw formulier
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={!selectedForm}
              onClick={() => selectedForm && onOpenFormDev(selectedForm)}
            >
              Open formdev
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={!selectedForm}
              onClick={() => {
                setShowUpload((v) => !v);
                setShowCreateForm(false);
              }}
            >
              Upload nieuwe formulierdefinitie
            </button>
          </div>
        </div>

        {showCreateForm && (
          <div
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600 }}>Nieuw formulier</div>

            <div className="cf-grid">
              <div className="cf-row">
                <div className="cf-label">
                  <div className="cf-label-text">Code</div>
                </div>
                <div className="cf-control">
                  <input
                    className="input"
                    value={newFormCode}
                    onChange={(e) => setNewFormCode(e.target.value)}
                  />
                </div>
              </div>

              <div className="cf-row">
                <div className="cf-label">
                  <div className="cf-label-text">Naam</div>
                </div>
                <div className="cf-control">
                  <input
                    className="input"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                  />
                </div>
              </div>

              <div className="cf-row wide">
                <div className="cf-label">
                  <div className="cf-label-text">Omschrijving</div>
                </div>
                <div className="cf-control">
                  <textarea
                    rows={4}
                    className="cf-textarea"
                    value={newFormDescription}
                    onChange={(e) => setNewFormDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={handleConfirmCreateForm}>
                Aanmaken
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetCreateForm}>
                Annuleren
              </button>
            </div>
          </div>
        )}

        {showUpload && (
          <div
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600 }}>
              Upload nieuwe formulierdefinitie {selectedForm ? `; ${selectedForm.name}` : ""}
            </div>

            <div className="muted" style={{ fontSize: 13 }}>
              Plak een geldige SurveyJS JSON-definitie. Gebruik eerst Format JSON en Controleer JSON voordat je de nieuwe versie toevoegt.
            </div>

            {uploadError && <div style={{ color: "salmon" }}>{uploadError}</div>}
            {!uploadError && uploadOk && <div className="muted">JSON is geldig.</div>}

            <textarea
              className="cf-textarea"
              rows={14}
              value={uploadText}
              onChange={(e) => {
                setUploadText(e.target.value);
                setUploadError(null);
                setUploadOk(false);
              }}
            />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary" onClick={handleFormatUploadJson}>
                Format JSON
              </button>

              <button type="button" className="btn btn-secondary" onClick={handleValidateUploadJson}>
                Controleer JSON
              </button>

              <button
                type="button"
                className="btn"
                disabled={!selectedForm}
                onClick={handleConfirmUpload}
              >
                Toevoegen nieuwe versie
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowUpload(false);
                  setUploadText("");
                  setUploadError(null);
                  setUploadOk(false);
                }}
              >
                Annuleren
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {orderDraft.map((form, index) => {
            const isSelected = form.form_id === selectedFormId;

            return (
              <div
                key={form.form_id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectForm(form.form_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectForm(form.form_id);
                  }
                }}
                style={{
                  padding: 12,
                  border: isSelected
                    ? "1px solid rgba(255,255,255,0.32)"
                    : "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  background: isSelected ? "rgba(255,255,255,0.04)" : "transparent",
                  display: "grid",
                  gap: 8,
                  cursor: "pointer",
                  outline: "none",
                }}
                title="Selecteer formulier"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {index + 1}. {form.name}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {form.code}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Omhoog"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveForm(form.form_id, "up");
                        }}
                        disabled={index === 0}
                        onMouseEnter={() => upIconRefs.current[form.form_id]?.startAnimation?.()}
                        onMouseLeave={() => upIconRefs.current[form.form_id]?.stopAnimation?.()}
                      >
                        <ArrowUpIcon
                          ref={(el) => {
                            upIconRefs.current[form.form_id] = el;
                          }}
                          size={18}
                          className="nav-anim-icon"
                        />
                      </button>

                      <button
                        type="button"
                        className="icon-btn"
                        title="Omlaag"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveForm(form.form_id, "down");
                        }}
                        disabled={index === orderDraft.length - 1}
                        onMouseEnter={() => downIconRefs.current[form.form_id]?.startAnimation?.()}
                        onMouseLeave={() => downIconRefs.current[form.form_id]?.stopAnimation?.()}
                      >
                        <ArrowDownIcon
                          ref={(el) => {
                            downIconRefs.current[form.form_id] = el;
                          }}
                          size={18}
                          className="nav-anim-icon"
                        />
                      </button>
                    </div>
                  </div>

                  <div
                    className="muted"
                    style={{ fontSize: 13, display: "flex", gap: 12, flexWrap: "wrap" }}
                  >
                    <span>status; {statusLabel(form.status)}</span>
                    <span>laatste versie; {form.latest_version_label ?? "-"}</span>
                    <span>aantal versies; {form.version_count ?? 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          padding: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 600 }}>
          Versieoverzicht {selectedForm ? `; ${selectedForm.name}` : ""}
        </div>

        {!selectedForm ? (
          <div className="muted">Geen formulier geselecteerd.</div>
        ) : selectedForm.versions?.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {selectedForm.versions.map((version) => (
              <div
                key={version.form_version_id}
                style={{
                  padding: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  display: "grid",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    Versie {version.version_label} {version.is_latest ? "(actief)" : ""}
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      downloadJsonFile(
                        `${selectedForm.code}_v${version.version_label}.json`,
                        version.survey_json
                      )
                    }
                  >
                    Download JSON
                  </button>
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  Intern versienummer; {version.version}
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  Publicatie; {formatPublishedAt(version.published_at)}
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  Gepubliceerd door; {version.published_by || "-"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">Nog geen versies gevonden.</div>
        )}
      </div>
    </div>
  );
});

export default AdminFormsVersionsTab;