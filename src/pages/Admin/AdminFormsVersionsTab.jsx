// /src/pages/Admin/AdminFormsVersionsTab.jsx

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

export default function AdminFormsVersionsTab({
  forms,
  selectedFormId,
  onSelectForm,
  onOpenFormDev,
  onCreateVersion,
}) {
  const selectedForm = forms.find((x) => x.form_id === selectedFormId) ?? null;

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
        <div style={{ fontWeight: 600 }}>Formulieren</div>

        <div style={{ display: "grid", gap: 10 }}>
          {forms.map((form) => {
            const isSelected = form.form_id === selectedFormId;

            return (
              <div
                key={form.form_id}
                style={{
                  padding: 12,
                  border: isSelected
                    ? "1px solid rgba(255,255,255,0.32)"
                    : "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  background: isSelected ? "rgba(255,255,255,0.04)" : "transparent",
                  display: "grid",
                  gap: 8,
                }}
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
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{form.name}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {form.code}
                    </div>
                  </div>

                  <div className="muted" style={{ fontSize: 13 }}>
                    status: {statusLabel(form.status)}
                  </div>
                </div>

                <div
                  className="muted"
                  style={{ fontSize: 13, display: "flex", gap: 12, flexWrap: "wrap" }}
                >
                  <span>laatste versie: {form.latest_version_label ?? "-"}</span>
                  <span>aantal versies: {form.version_count ?? 0}</span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn" onClick={() => onSelectForm(form.form_id)}>
                    {isSelected ? "Geselecteerd" : "Selecteer"}
                  </button>

                  <button type="button" className="btn" onClick={() => onCreateVersion(form)}>
                    Nieuwe versie
                  </button>

                  <button type="button" className="btn" onClick={() => onOpenFormDev(form)}>
                    Open formdev
                  </button>
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
                    Versie {version.version_label} {version.is_latest ? "(laatste)" : ""}
                  </div>

                  {version.is_latest && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      Actieve versie
                    </span>
                  )}
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  Intern versienummer: {version.version}
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  Publicatie: {formatPublishedAt(version.published_at)}
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  Gepubliceerd door: {version.published_by || "-"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">Geen versies gevonden.</div>
        )}
      </div>
    </div>
  );
}