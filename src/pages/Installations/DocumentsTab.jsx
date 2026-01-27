export default function DocumentsTab({ docs }) {
  if (!docs) return null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Documenten</h2>

      <div style={{ display: "grid", gap: 8 }}>
        {docs.documentTypes.map((dt) => (
          <div
            key={dt.document_type_key}
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>{dt.document_type_name}</div>
              <div className="muted">{dt.documents.length}</div>
            </div>

            {dt.documents.length === 0 && (
              <div className="muted" style={{ marginTop: 6 }}>
                nog geen document
              </div>
            )}

            {dt.documents.length > 0 && (
              <ul style={{ margin: "8px 0 0 18px" }}>
                {dt.documents.map((d) => (
                  <li key={d.document_id}>
                    {d.storage_url ? (
                      <a href={d.storage_url} target="_blank" rel="noreferrer">
                        {d.title || d.file_name || d.document_number || d.document_id}
                      </a>
                    ) : (
                      <span>{d.title || d.file_name || d.document_number || d.document_id}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
