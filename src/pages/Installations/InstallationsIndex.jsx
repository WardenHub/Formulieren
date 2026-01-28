// /src/pages/Installations/InstallationsIndex.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { searchInstallations } from "@/api/emberApi.js";
import { SearchIcon } from "@/components/ui/search";
import InstallationTypeTag from "@/components/InstallationTypeTag.jsx";

export default function InstallationsIndex() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr(null);
      setLoading(true);

      try {
        const res = await searchInstallations(q, 25);
        if (!cancelled) setItems(res?.items || []);
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const hasQuery = useMemo(() => q.trim().length > 0, [q]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Installaties</h1>

      <div className="searchbar">
        <SearchIcon size={16} className="muted" />
        <input
          className="searchbar-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="zoek op code of naam; bv; 1 of Eigenaar"
          autoComplete="off"
        />
      </div>

      {err && <p style={{ color: "salmon", margin: 0 }}>{err}</p>}
      {loading && (
        <p className="muted" style={{ margin: 0 }}>
          laden
        </p>
      )}

      {!loading && !hasQuery && (
        <p className="muted" style={{ margin: 0 }}>
          typ een code om te zoeken
        </p>
      )}

      {!loading && hasQuery && items.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          geen resultaten
        </p>
      )}

      {!loading && items.length > 0 && (
        <div className="list">
          {items.map((i) => (
            <Link
              key={i.atrium_installation_code}
              to={`/installaties/${i.atrium_installation_code}`}
              className="list-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
  {/* bovenste regel: code + type */}
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    }}
  >
    <div style={{ fontWeight: 650 }}>
      {i.atrium_installation_code}
    </div>

    {i.installation_type_key && (
      <InstallationTypeTag
        typeKey={i.installation_type_key}
        label={i.installation_type_name}
      />
    )}
  </div>

  {/* tweede regel: locatie / naam */}
  <div className="muted" style={{ fontSize: 13 }}>
    {i.installation_name || "geen naam"}
  </div>
</div>
            </Link>
          ))}
        </div>
      )}

    </div>
  );
}
