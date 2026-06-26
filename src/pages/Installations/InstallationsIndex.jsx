// /src/pages/Installations/InstallationsIndex.jsx
// /src/pages/Installations/InstallationsIndex.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { searchInstallations } from "@/api/emberApi.js";
import { SearchIcon } from "@/components/ui/search";
import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";
import { HourglassIcon } from "@/components/ui/hourglass";
import { HandCoinsIcon } from "@/components/ui/hand-coins";
import InstallationTypeTag from "@/components/InstallationTypeTag.jsx";
import {
  getInstallationStatusClassName,
  getInstallationStatusLabel,
} from "@/lib/installationStatus.js";

export default function InstallationsIndex() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSlowLoadingHint, setShowSlowLoadingHint] = useState(false);
  const [loadingElapsedSeconds, setLoadingElapsedSeconds] = useState(0);
  const [err, setErr] = useState(null);
  const [onlyCurrent, setOnlyCurrent] = useState(true);

  const loaderRef = useRef(null);
  const loadingStartRef = useRef(0);

  useEffect(() => {
    if (loading) loaderRef.current?.startAnimation?.();
    else loaderRef.current?.stopAnimation?.();
  }, [loading]);

  useEffect(() => {
    if (!loading) {
      loadingStartRef.current = 0;
      setShowSlowLoadingHint(false);
      setLoadingElapsedSeconds(0);
      return undefined;
    }

    loadingStartRef.current = Date.now();
    setLoadingElapsedSeconds(0);
    const slowHintTimer = window.setTimeout(() => {
      setShowSlowLoadingHint(true);
    }, 5000);

    const elapsedTimer = window.setInterval(() => {
      const startedAt = loadingStartRef.current;
      if (!startedAt) return;
      setLoadingElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);

    return () => {
      window.clearTimeout(slowHintTimer);
      window.clearInterval(elapsedTimer);
    };
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

      {loading && !showSlowLoadingHint && (
        <div className="inline-status muted">
          <LoaderPinwheelIcon ref={loaderRef} size={18} aria-label="laden" />
          <span>laden</span>
        </div>
      )}

      {loading && showSlowLoadingHint && (
        <div className="ember-loading-card installations-startup-card" aria-live="polite">
          <div className="ember-loading-card-inner installations-startup-card__inner">
            <div className="ember-loading-icon installations-startup-card__icon">
              <HourglassIcon ref={loaderRef} size={30} aria-label="api wordt opgestart" />
            </div>

            <div className="ember-loading-title">Ember start de API op</div>

            <div className="ember-page-subtitle installations-startup-card__copy">
              Dit duurt eenmalig langer als de web API in rust was. Daarna reageert Ember weer op normale snelheid.
            </div>

            <div className="installations-startup-card__meta">
              <span className="ember-label ember-label--warning installations-startup-card__eco">
                <HandCoinsIcon size={16} aria-hidden="true" />
              </span>
              <span className="ember-label ember-label--muted">
                {loadingElapsedSeconds}s bezig
              </span>
            </div>

            <div className="installations-startup-card__progress" aria-hidden="true">
              <span
                className="installations-startup-card__progress-bar"
                style={{ width: `${Math.min(94, 8 + (loadingElapsedSeconds / 30) * 86)}%` }}
              />
            </div>
          </div>
        </div>
      )}

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
