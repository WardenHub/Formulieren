import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

import {
  getInstallationTypes,
  getInstallationsMap,
  getInstallationsMapViewport,
} from "@/api/emberApi.js";
import { createApiWarmupRetry, describeApiFailure } from "@/api/apiWarmup.js";
import ApiStartupLoader from "@/components/ApiStartupLoader.jsx";
import { useApiStartupLoader } from "@/components/apiStartupLoaderState.js";
import InstallationTypeTag from "@/components/InstallationTypeTag.jsx";
import { SearchIcon } from "@/components/ui/search";
import {
  getInstallationStatusClassName,
  getInstallationStatusLabel,
} from "@/lib/installationStatus.js";
import { getInstallationTypeAppearance } from "@/lib/installationTypeAppearance.js";
import { BUSINESS_UNITS } from "@/lib/businessUnitAppearance.js";
import InstallationsMap from "./InstallationsMap.jsx";

const DEFAULT_FILTERS = {
  followUpMode: "ALL",
  installationType: "",
  // coordinateMode bestaat nog aan de serverkant, maar het scherm bood alleen "alles" aan
  // als zinnige stand; installaties zonder coordinaten staan al apart onder de kaart.
  coordinateMode: "ALL",
  maintenanceStatus: "",
  inspectionServiceStatus: "",
  openFormsOnly: false,
  missingDocumentsOnly: false,
};

function serviceTone(status) {
  const clean = String(status || "").toUpperCase();
  if (["EXPIRED", "MISSING", "REVOKED"].includes(clean)) return "danger";
  if (["EXPIRING", "UNKNOWN"].includes(clean)) return "warning";
  if (["ACTIVE", "VALID"].includes(clean)) return "success";
  return "muted";
}

function serviceLabel(status) {
  const labels = {
    ACTIVE: "actief",
    INACTIVE: "niet actief",
    UNKNOWN: "onbekend",
    VALID: "geldig",
    EXPIRING: "verloopt binnenkort",
    EXPIRED: "verlopen",
    MISSING: "ontbreekt",
    REVOKED: "ingetrokken",
  };
  return labels[String(status || "").toUpperCase()] || String(status || "onbekend").toLowerCase();
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="installations-filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function CheckFilter({ label, checked, onChange }) {
  return (
    <label className="installations-filter-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function InstallationRow({ item }) {
  return (
    <Link
      to={`/installaties/${encodeURIComponent(item.atrium_installation_code)}`}
      className="installations-row"
    >
      <div className="installations-row__main">
        <div className="installations-row__top">
          <div className="installations-row__code">{item.atrium_installation_code}</div>
          {item.installation_status ? (
            <span className={getInstallationStatusClassName(item.installation_status)}>
              {getInstallationStatusLabel(item.installation_status)}
            </span>
          ) : null}
          {item.BedrijfUnit ? (
            <span className="ember-label ember-label--muted">{item.BedrijfUnit}</span>
          ) : null}
          {item.installation_type_key ? (
            <InstallationTypeTag
              typeKey={item.installation_type_key}
              label={item.installation_type_name}
            />
          ) : null}
          {item.attention_status === "CRITICAL" || item.attention_status === "ATTENTION" ? (
            <span className={`ember-label ember-label--${item.attention_status === "CRITICAL" ? "danger" : "warning"}`}>{item.attention_reason}</span>
          ) : (
            <span className="ember-label ember-label--success" title="Geen operationele signalen" aria-label="Geen operationele signalen"><CheckCircle2 size={14} aria-hidden="true" /></span>
          )}
        </div>

        <div className="installations-row__name">
          {item.installation_name || "Geen naam"}
          {item.formatted_address ? `; ${item.formatted_address}` : ""}
        </div>

        <div className="installations-row__meta">
          {Number(item.open_follow_up_count || 0) > 0 ? (
            <span className="ember-label ember-label--warning">
              {item.open_follow_up_count} open opvolging
            </span>
          ) : null}
          {Number(item.overdue_follow_up_count || 0) > 0 ? (
            <span className="ember-label ember-label--danger">
              {item.overdue_follow_up_count} verlopen
            </span>
          ) : null}
          {Number(item.open_form_count || 0) > 0 ? (
            <span className="ember-label ember-label--info">{item.open_form_count} open formulier</span>
          ) : null}
          {Number(item.missing_required_document_count || 0) > 0 ? (
            <span className="ember-label ember-label--danger">
              {item.missing_required_document_count} verplicht document ontbreekt
            </span>
          ) : null}
          {item.has_maintenance_service ? (
            <span className={`ember-label ember-label--${serviceTone(item.maintenance_contract_status)}`}>
              Onderhoud; {serviceLabel(item.maintenance_contract_status)}
            </span>
          ) : null}
          {item.has_inspection_service ? (
            <span className={`ember-label ember-label--${serviceTone(item.inspection_service_status)}`}>
              Inspectie; {serviceLabel(item.inspection_service_status)}
            </span>
          ) : null}
          {item.has_monitoring_service ? (
            <span className={`ember-label ember-label--${serviceTone(item.monitoring_service_status)}`}>
              Meldkamer; {serviceLabel(item.monitoring_service_status)}
            </span>
          ) : null}
          {item.certification_required ? (
            <span className={`ember-label ember-label--${serviceTone(item.certificate_status)}`}>
              Certificaat; {serviceLabel(item.certificate_status)}
            </span>
          ) : null}
          {!item.has_valid_coordinates ? (
            <span className="ember-label ember-label--muted">Geen geldige coördinaten</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function InstallationsIndex() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("map");
  const [onlyCurrent, setOnlyCurrent] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [data, setData] = useState({ items: [], markers: [], without_coordinates: [], summary: {} });
  const [installationTypes, setInstallationTypes] = useState([]);
  const [selectedInstallationTypes, setSelectedInstallationTypes] = useState([]);
  // Leeg betekent alle bedrijfsonderdelen; zo hoeft niemand een keuze te maken die er
  // vandaag nog niet toe doet.
  const [selectedBusinessUnits, setSelectedBusinessUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [viewport, setViewport] = useState(null);
  const mapRequestRef = useRef(null);
  const startupLoader = useApiStartupLoader(loading);

  /* Een koude API geeft 401 of 503 terug op een geldig verzoek. Dat is geen fout van de
     gebruiker en ook niets om een pagina voor te herladen; dit vraagt het gewoon opnieuw,
     met steeds iets langere tussenpozen. */
  const retryTimerRef = useRef(null);
  const warmupRef = useRef(null);
  if (warmupRef.current == null) {
    warmupRef.current = createApiWarmupRetry();
  }
  const [retryToken, setRetryToken] = useState(0);

  const handleLoadError = useCallback((error) => {
    setErr(describeApiFailure(error));

    const pauze = warmupRef.current.planNext(error);
    if (pauze === null) return;

    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = window.setTimeout(() => setRetryToken((n) => n + 1), pauze);
  }, []);

  const retryNow = useCallback(() => {
    window.clearTimeout(retryTimerRef.current);
    warmupRef.current.reset();
    setRetryToken((n) => n + 1);
  }, []);

  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);

  useEffect(() => {
    let cancelled = false;
    getInstallationTypes()
      .then((response) => {
        if (!cancelled) setInstallationTypes((response?.types || []).filter((item) => item.is_active));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "list") return undefined;
    let cancelled = false;

    async function run() {
      setErr(null);
      setLoading(true);
      try {
        // De server filtert nu zelf op meerdere soorten. Eerder werden bij twee of meer
        // soorten alle 25000 rijen opgehaald om er lokaal vijfhonderd van te tonen; dat was
        // tientallen megabytes per keer.
        const response = await getInstallationsMap({
          ...filters,
          q: q.trim(),
          onlyCurrent,
          installationTypes: selectedInstallationTypes,
          businessUnits: selectedBusinessUnits,
          take: 500,
        });
        if (!cancelled) {
          setData({
            items: response?.items || [],
            markers: response?.markers || [],
            without_coordinates: response?.without_coordinates || [],
            summary: response?.summary || {},
          });
        }
        if (!cancelled) warmupRef.current.reset();
      } catch (error) {
        if (!cancelled) handleLoadError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, onlyCurrent, q, mode, selectedInstallationTypes, selectedBusinessUnits, retryToken, handleLoadError]);

  useEffect(() => {
    if (mode !== "map" || !viewport) return undefined;
    const cleanQuery = q.trim();
    if (cleanQuery.length === 1) {
      setErr("Typ minimaal twee tekens om op de kaart te zoeken.");
      return undefined;
    }

    mapRequestRef.current?.abort();
    const controller = new AbortController();
    mapRequestRef.current = controller;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const hasOperationalFilters = Boolean(
          filters.maintenanceStatus ||
          filters.inspectionServiceStatus ||
          filters.openFormsOnly ||
          filters.missingDocumentsOnly ||
          selectedInstallationTypes.length > 1
        );
        const response = hasOperationalFilters
          ? await getInstallationsMap({
            ...filters,
            q: cleanQuery,
            onlyCurrent,
            installationTypes: selectedInstallationTypes,
            businessUnits: selectedBusinessUnits,
            take: cleanQuery ? 500 : 3000,
          }, { signal: controller.signal })
          : await getInstallationsMapViewport({
            ...viewport,
            q: cleanQuery,
            onlyCurrent,
            installationTypes: selectedInstallationTypes,
            businessUnits: selectedBusinessUnits,
            followUpMode: filters.followUpMode,
            take: cleanQuery ? 100 : 750,
          }, { signal: controller.signal });
        const markers = response?.markers || [];
        setData((current) => ({
          ...current,
          // De lijstrijen komen van de server; de geneste installaties in een marker dragen
          // alleen wat de popup nodig heeft.
          items: cleanQuery ? response?.items || [] : [],
          markers,
          without_coordinates: [],
          summary: {
            result_count: markers.reduce((sum, marker) => sum + Number(marker.installation_count || 0), 0),
            marker_count: markers.length,
          },
        }));
        warmupRef.current.reset();
      } catch (error) {
        if (error?.name !== "AbortError") handleLoadError(error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, cleanQuery ? 300 : 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, mode, onlyCurrent, q, selectedInstallationTypes, selectedBusinessUnits, viewport, retryToken, handleLoadError]);

  const visibleList = useMemo(() => data.items.slice(0, 500), [data.items]);
  const summary = data.summary || {};

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="installations-index">
      <div className="page-hero">
        <div className="page-hero__title-wrap">
          <h1 className="page-hero__title">Installaties</h1>
          <div className="page-hero__subtitle">
            Vind installaties en zie direct waar operationele aandacht nodig is.
          </div>
        </div>

        <div className="installations-index__hero-actions">
          <div className="ember-segmented" aria-label="Weergave kiezen">
            <button type="button" className={mode === "map" ? "is-active" : ""} onClick={() => setMode("map")}>
              Kaart
            </button>
            <button type="button" className={mode === "list" ? "is-active" : ""} onClick={() => setMode("list")}>
              Lijst
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={onlyCurrent ? "true" : "false"}
            className={`ember-toggle${onlyCurrent ? " is-on" : " is-off"}`}
            onClick={() => setOnlyCurrent((current) => !current)}
          >
            <span className="ember-toggle__track"><span className="ember-toggle__thumb" /></span>
            <span className="ember-toggle__label">
              {onlyCurrent ? "Alleen actueel" : "Inclusief historisch"}
            </span>
          </button>
        </div>
      </div>

      <div className="installations-workspace">
        <aside className="installations-filter-panel" aria-label="Installatiefilters">
          <div className="searchbar installations-search">
            <SearchIcon size={16} className="muted" />
            <input
              className="searchbar-input"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Code, naam, object of relatie"
              autoComplete="off"
            />
          </div>

          <FilterSelect label="Opvolging" value={filters.followUpMode} onChange={(value) => setFilter("followUpMode", value)}>
            <option value="ALL">Alle installaties</option>
            <option value="OPEN">Met open opvolging</option>
            <option value="OVERDUE">Met verlopen opvolging</option>
            <option value="NONE">Zonder open opvolging</option>
          </FilterSelect>

          <div className="installations-type-filters" aria-label="Installatiesoort">
            <span className="installations-filter-field__label">Installatiesoort</span>
            <div className="installations-type-filter-buttons">
              <button type="button" className={`installations-type-filter-button installations-type-filter-button--all${selectedInstallationTypes.length === 0 ? " is-active" : ""}`} aria-pressed={selectedInstallationTypes.length === 0} onClick={() => setSelectedInstallationTypes((current) => (current.length === 0 ? installationTypes.map((type) => String(type.installation_type_key || "").toUpperCase()) : []))}>Alle</button>
              {installationTypes.map((type) => {
                const key = String(type.installation_type_key || "").toUpperCase();
                const active = selectedInstallationTypes.length === 0 || selectedInstallationTypes.includes(key);
                return <button key={key} type="button" className={`installations-type-filter-button${active ? " is-active" : ""}`} style={{ "--type-color": getInstallationTypeAppearance(key).color }} aria-pressed={active} onClick={() => setSelectedInstallationTypes((current) => {
                  const base = current.length === 0 ? installationTypes.map((item) => String(item.installation_type_key || "").toUpperCase()) : current;
                  return base.includes(key) ? base.filter((item) => item !== key) : [...base, key];
                })}>{type.display_name || key}</button>;
              })}
            </div>
          </div>

          <details className="installations-advanced-filters">
            <summary>Meer filters</summary>
            <div className="installations-advanced-filters__content">
              <FilterSelect label="Heeft onderhoudscontract" value={filters.maintenanceStatus} onChange={(value) => setFilter("maintenanceStatus", value)}>
                <option value="">Alle statussen</option>
                <option value="ACTIVE">Actief</option>
                <option value="INACTIVE">Niet actief</option>
                <option value="UNKNOWN">Onbekend</option>
              </FilterSelect>
              <FilterSelect label="Inspectiecertificaat vereist" value={filters.inspectionServiceStatus} onChange={(value) => setFilter("inspectionServiceStatus", value)}>
                <option value="">Alle statussen</option>
                <option value="ACTIVE">Actief</option>
                <option value="INACTIVE">Niet actief</option>
                <option value="UNKNOWN">Onbekend</option>
              </FilterSelect>
              <CheckFilter label="Met openstaande formulieren" checked={filters.openFormsOnly} onChange={(value) => setFilter("openFormsOnly", value)} />
              <CheckFilter label="Verplichte documenten ontbreken" checked={filters.missingDocumentsOnly} onChange={(value) => setFilter("missingDocumentsOnly", value)} />
            </div>
          </details>

          <div className="installations-type-filters" aria-label="Bedrijven">
            <span className="installations-filter-field__label">Bedrijven</span>
            <div className="installations-type-filter-buttons">
              <button
                type="button"
                className={`installations-type-filter-button installations-type-filter-button--all${selectedBusinessUnits.length === 0 ? " is-active" : ""}`}
                aria-pressed={selectedBusinessUnits.length === 0}
                onClick={() => setSelectedBusinessUnits([])}
              >
                Beide
              </button>

              {BUSINESS_UNITS.map((unit) => {
                const active =
                  selectedBusinessUnits.length === 0 || selectedBusinessUnits.includes(unit.key);

                return (
                  <button
                    key={unit.key}
                    type="button"
                    className={`installations-type-filter-button installations-bu-filter-button${active ? " is-active" : ""}`}
                    style={{ "--type-color": unit.color }}
                    aria-pressed={active}
                    title={unit.note || `Alleen installaties van ${unit.label}`}
                    onClick={() =>
                      setSelectedBusinessUnits((current) => {
                        const basis = current.length === 0 ? BUSINESS_UNITS.map((item) => item.key) : current;
                        const volgende = basis.includes(unit.key)
                          ? basis.filter((item) => item !== unit.key)
                          : [...basis, unit.key];

                        // Alles aangevinkt is hetzelfde als geen keuze; dat houdt de
                        // aanvraag klein en de knop "Beide" eerlijk.
                        return volgende.length === BUSINESS_UNITS.length ? [] : volgende;
                      })
                    }
                  >
                    {unit.logo ? (
                      <img src={unit.logo} alt="" className="installations-bu-filter-button__logo" />
                    ) : null}
                    <span>{unit.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button type="button" className="btn btn-secondary" onClick={() => { setFilters(DEFAULT_FILTERS); setSelectedInstallationTypes([]); setSelectedBusinessUnits([]); }}>
            Filters wissen
          </button>
        </aside>

        <main className="installations-results">
          <div className="installations-summary" aria-live="polite">
            <span className="ember-label ember-label--muted">{summary.result_count || 0} installaties</span>
            <span className="ember-label ember-label--danger">{summary.critical_count || 0} kritisch</span>
            <span className="ember-label ember-label--warning">{summary.attention_count || 0} aandacht</span>
            <span className="ember-label ember-label--info">{summary.open_follow_up_count || 0} open opvolgingen</span>
            <span className="ember-label ember-label--muted">{summary.without_coordinates_count || 0} zonder coördinaten</span>
          </div>

          {/* In lijstmodus mag de melding gewoon meelopen. Op de kaart niet: een regel die
              erboven verschijnt duwt de hele kaart naar beneden en dan verschuift alles waar
              je net naar keek. Daar gaat hij als laag over de kaart heen; zie de prop error
              op InstallationsMap. */}
          {err && mode === "list" ? <p className="doc-error">{err}</p> : null}
          {mode === "list" && startupLoader.showStartupCard ? <ApiStartupLoader state={startupLoader} /> : null}

          {!loading && !err && mode === "list" && data.items.length === 0 ? (
            <div className="ui-empty">Geen installaties binnen deze selectie.</div>
          ) : null}

          {mode === "map" ? (
            <InstallationsMap
              markers={data.markers}
              loading={loading}
              error={err}
              onRetry={retryNow}
              onViewportChange={setViewport}
              fitRequestKey={q.trim().length >= 2 ? q.trim() : ""}
              showLegend
            />
          ) : null}

          {!loading && !err && mode === "list" && visibleList.length > 0 ? (
            <>
              {data.items.length > visibleList.length ? (
                <div className="ember-alert ember-alert--info">
                  De eerste {visibleList.length} van {data.items.length} resultaten worden getoond. Gebruik filters om de lijst te verfijnen.
                </div>
              ) : null}
              <div className="installations-list">
                {visibleList.map((item) => (
                  <InstallationRow key={item.atrium_installation_code} item={item} />
                ))}
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
