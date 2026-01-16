import { useEffect, useState } from "react";
import "./App.css";
import { apiGet } from "./api";

function App() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

    apiGet("/me")
      .then((data) => {
        if (!alive) return;
        setMe(data);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || String(err));
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <h1>Ember</h1>

      {!me && !error && <p>laden...</p>}

      {error && (
        <div className="card">
          <h2>fout</h2>
          <pre style={{ textAlign: "left", whiteSpace: "pre-wrap" }}>{error}</pre>
        </div>
      )}

      {me && (
        <div className="card" style={{ textAlign: "left" }}>
          <h2>ingelogd</h2>
          <div><b>naam:</b> {me.user?.name}</div>
          <div><b>email:</b> {me.user?.email}</div>
          <div><b>oid:</b> {me.user?.objectId}</div>
          <div><b>rollen:</b> {(me.roles || []).join(", ") || "-"}</div>
        </div>
      )}
    </>
  );
}

export default App;