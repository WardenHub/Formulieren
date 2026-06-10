// /src/components/InstallationTypeRequiredPanel.jsx
import InstallationTypeTag from "./InstallationTypeTag.jsx";

export default function InstallationTypeRequiredPanel({
  title,
  types,
  saving,
  onSelect,
  compact,
  disabled = false,
  readOnlyMessage = "",
}) {
  const isChange = String(title || "").toLowerCase().includes("wijzig");

  return (
    <div className={compact ? "type-panel type-panel--compact" : "type-panel"}>
      <h3 style={{ marginTop: 0 }}>{title || "Installatiesoort kiezen"}</h3>

      <p className="muted" style={{ marginBottom: 16 }}>
        {isChange
          ? "Kies een andere installatiesoort. De getoonde eigenschappen passen zich daarna automatisch aan."
          : "Deze installatie heeft nog geen installatiesoort. Kies eerst het type voordat je de eigenschappen kunt invullen."}
      </p>

      {readOnlyMessage ? (
        <p className="muted" style={{ marginBottom: 16 }}>
          {readOnlyMessage}
        </p>
      ) : null}

      <div className="type-panel-options">
        {types.map((t) => (
          <button
            key={t.installation_type_key}
            type="button"
            disabled={saving || disabled}
            onClick={() => onSelect(t.installation_type_key)}
            className="type-panel-option"
            style={{ opacity: saving || disabled ? 0.6 : 1 }}
          >
            <InstallationTypeTag typeKey={t.installation_type_key} label={t.display_name} />
          </button>
        ))}
      </div>
    </div>
  );
}
