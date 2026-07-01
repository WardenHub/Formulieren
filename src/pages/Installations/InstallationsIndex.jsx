// /src/pages/Installations/InstallationsIndex.jsx
// /src/pages/Installations/InstallationsIndex.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { searchInstallations } from "@/api/emberApi.js";
import ApiStartupLoader, { useApiStartupLoader } from "@/components/ApiStartupLoader.jsx";
import { SearchIcon } from "@/components/ui/search";
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
  const [onlyCurrent, setOnlyCurrent] = useState(true);
  const startupLoader = useApiStartupLoader(loading);

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
  const visibleItems = useMemo(() => {
    if (!onlyCurrent) return items;
    return items.filter((item) => String(item.installation_status || "").toUpperCase() !== "J");
  }, [items, onlyCurrent]);

  return (
    <div className="installations-index">
      <div className="page-hero">
        <div className="page-hero__title-wrap">
          <h1 className="page-hero__title">Installaties</h1>
          <div className="page-hero__subtitle">
            Zoek een installatie op code, naam, object of relatie.
          </div>
        </div>

        <div className="installations-index__hero-actions">
          <button
            type="button"
            role="switch"
            aria-checked={onlyCurrent ? "true" : "false"}
            className={`ember-toggle${onlyCurrent ? " is-on" : " is-off"}`}
            onClick={() => setOnlyCurrent((prev) => !prev)}
          >
            <span className="ember-toggle__track">
              <span className="ember-toggle__thumb" />
            </span>
            <span className="ember-toggle__label">
              {onlyCurrent ? "Alleen actuele installaties" : "Historische installaties tonen"}
            </span>
          </button>
        </div>
      </div>

      <div className="searchbar installations-search">
        <SearchIcon size={16} className="muted" />
        <input
          className="searchbar-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="zoek op installatiecode of naam"
          autoComplete="off"
        />
      </div>

      {err && <p className="doc-error">{err}</p>}

      <ApiStartupLoader state={startupLoader} />

      {!loading && !hasQuery && (
        <div className="ui-empty">typ een code om te zoeken</div>
      )}

      {!loading && hasQuery && visibleItems.length === 0 && items.length === 0 && (
        <div className="ui-empty">geen resultaten</div>
      )}

      {!loading && hasQuery && visibleItems.length === 0 && items.length > 0 && onlyCurrent && (
        <div className="ui-empty">
          geen actuele resultaten; zet 'alleen actuele installaties' uit om het archief mee te nemen
        </div>
      )}

      {!loading && visibleItems.length > 0 && (
        <div className="installations-list">
          {visibleItems.map((i) => (
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

                {(i.management_portal_name || Number(i.required_document_count || 0) > 0) ? (
                  <div className="installations-row__meta">
                    {i.management_portal_name ? (
                      <span className="ember-label ember-label--info">
                        Beheerportaal; {i.management_portal_name}
                      </span>
                    ) : null}

                    {Number(i.required_document_count || 0) > 0 ? (
                      Number(i.missing_required_document_count || 0) > 0 ? (
                        <span className="ember-label ember-label--danger">
                          {Number(i.missing_required_document_count) === 1
                            ? "1 verplicht document ontbreekt"
                            : `${Number(i.missing_required_document_count)} verplichte documenten ontbreken`}
                        </span>
                      ) : (
                        <span className="ember-label ember-label--success">
                          Verplichte documenten compleet
                        </span>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
