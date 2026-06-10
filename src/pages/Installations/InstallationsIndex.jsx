// /src/pages/Installations/InstallationsIndex.jsx
// /src/pages/Installations/InstallationsIndex.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { searchInstallations } from "@/api/emberApi.js";
import { SearchIcon } from "@/components/ui/search";
import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";
import InstallationTypeTag from "@/components/InstallationTypeTag.jsx";
import {
  getInstallationStatusClassName,
  getInstallationStatusLabel,
} from "@/lib/installationStatus.js";

export default function InstallationsIndex() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const loaderRef = useRef(null);

  useEffect(() => {
    if (loading) loaderRef.current?.startAnimation?.();
    else loaderRef.current?.stopAnimation?.();
  }, [loading]);

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
    <div className="installations-index">
      <div className="page-hero">
        <div className="page-hero__title-wrap">
          <h1 className="page-hero__title">Installaties</h1>
          <div className="page-hero__subtitle">
            Zoek een installatie op code, naam, object of relatie.
          </div>
        </div>
      </div>

      <div className="searchbar installations-search">
        <SearchIcon size={16} className="muted" />
        <input
          className="searchbar-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="zoek op code of naam; bv; 1 of Eigenaar"
          autoComplete="off"
        />
      </div>

      {err && <p className="doc-error">{err}</p>}

      {loading && (
        <div className="inline-status muted">
          <LoaderPinwheelIcon ref={loaderRef} size={18} aria-label="laden" />
          <span>laden</span>
        </div>
      )}

      {!loading && !hasQuery && (
        <div className="ui-empty">typ een code om te zoeken</div>
      )}

      {!loading && hasQuery && items.length === 0 && (
        <div className="ui-empty">geen resultaten</div>
      )}

      {!loading && items.length > 0 && (
        <div className="installations-list">
          {items.map((i) => (
            <Link
              key={i.atrium_installation_code}
              to={`/installaties/${i.atrium_installation_code}`}
              className="installations-row"
            >
              <div className="installations-row__main">
                <div className="installations-row__top">
                  <div className="installations-row__code">
                    {i.atrium_installation_code}
                  </div>

                  {i.installation_status ? (
                    <span className={getInstallationStatusClassName(i.installation_status)}>
                      {getInstallationStatusLabel(i.installation_status)}
                    </span>
                  ) : null}

                  {i.BedrijfUnit ? (
                    <span className="ember-label ember-label--muted">{i.BedrijfUnit}</span>
                  ) : null}

                  {i.installation_type_key && (
                    <InstallationTypeTag
                      typeKey={i.installation_type_key}
                      label={i.installation_type_name}
                    />
                  )}
                </div>

                <div className="installations-row__name">
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
