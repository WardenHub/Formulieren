// /src/components/InstallationTypeRequiredPanel.jsx
import InstallationTypeTag from "./InstallationTypeTag.jsx";

export default function InstallationTypeRequiredPanel({
  types,
  saving,
  onSelect,
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 16,
        padding: 20,
        background: "rgba(255,255,255,.03)",
        maxWidth: 720,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Installatiesoort kiezen</h3>

      <p className="muted" style={{ marginBottom: 16 }}>
        Deze installatie heeft nog geen installatiesoort.
        Kies eerst het type voordat je de eigenschappen kunt invullen.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {types.map((t) => (
          <button
            key={t.installation_type_key}
            type="button"
            disabled={saving}
            onClick={() => onSelect(t.installation_type_key)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <InstallationTypeTag
              typeKey={t.installation_type_key}
              label={t.display_name}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
