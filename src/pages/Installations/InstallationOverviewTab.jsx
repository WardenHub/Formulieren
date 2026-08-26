import { useEffect, useMemo, useState } from "react";

import { getInstallationOperationalSummary } from "@/api/emberApi.js";
import InstallationsMap from "./InstallationsMap.jsx";

function tone(value) {
  const clean = String(value || "").toUpperCase();
  if (["CRITICAL", "EXPIRED", "MISSING", "REVOKED"].includes(clean)) return "danger";
  if (["ATTENTION", "EXPIRING", "UNKNOWN"].includes(clean)) return "warning";
  if (["OK", "ACTIVE", "VALID"].includes(clean)) return "success";
  return "muted";
}

function label(value) {
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
  return labels[String(value || "").toUpperCase()] || String(value || "onbekend").toLowerCase();
}

function Metric({ value, label: metricLabel, tone: metricTone = "muted" }) {
  return (
    <div className={`installation-overview-metric installation-overview-metric--${metricTone}`}>
      <strong>{Number(value || 0)}</strong>
      <span>{metricLabel}</span>
    </div>
  );
}

export default function InstallationOverviewTab({ code, onOpenTab }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getInstallationOperationalSummary(code)
      .then((response) => {
        if (!cancelled) setItem(response?.item || null);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.message || String(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const marker = useMemo(() => {
    if (!item?.has_valid_coordinates) return [];
    return [{
      marker_group_key: item.marker_group_key || `INSTALLATION|${item.atrium_installation_code}`,
      object_name: item.object_name || item.installation_name,
      formatted_address: item.formatted_address,
      relation: item.gebruiker_naam || item.eigenaar_naam || item.debiteur_naam || null,
      latitude: item.latitude,
      longitude: item.longitude,
      attention_status: item.attention_status,
      attention_reason: item.attention_reason,
      open_follow_up_count: item.open_follow_up_count,
      overdue_follow_up_count: item.overdue_follow_up_count,
      open_form_count: item.open_form_count,
      missing_required_document_count: item.missing_required_document_count,
      installation_count: 1,
      installations: [item],
    }];
  }, [item]);

  if (loading) return <div className="ui-empty">Operationele samenvatting laden...</div>;
  if (error) return <div className="ember-alert ember-alert--danger">{error}</div>;
  if (!item) return <div className="ui-empty">Geen operationele samenvatting beschikbaar.</div>;

  return (
    <div className="installation-overview">
      <section className="installation-overview__summary">
        <div className="installation-overview__heading">
          <div>
            <h2>Operationeel overzicht</h2>
            <p>{item.attention_reason || "Geen operationele signalen"}</p>
          </div>
          <span className={`ember-label ember-label--${tone(item.attention_status)}`}>
            {item.attention_status === "CRITICAL" ? "Kritisch" : item.attention_status === "ATTENTION" ? "Aandacht" : "Op orde"}
          </span>
        </div>

        <div className="installation-overview__metrics">
          <Metric value={item.open_follow_up_count} label="open opvolgingen" tone={item.open_follow_up_count ? "warning" : "success"} />
          <Metric value={item.overdue_follow_up_count} label="verlopen opvolgingen" tone={item.overdue_follow_up_count ? "danger" : "success"} />
          <Metric value={item.open_form_count} label="open formulieren" tone={item.open_form_count ? "warning" : "success"} />
          <Metric value={item.missing_required_document_count} label="missende documenten" tone={item.missing_required_document_count ? "danger" : "success"} />
        </div>

        <div className="installation-overview__badges">
          {item.has_maintenance_service ? (
            <span className={`ember-label ember-label--${tone(item.maintenance_contract_status)}`}>
              Onderhoud; {label(item.maintenance_contract_status)}
            </span>
          ) : null}
          {item.has_inspection_service ? (
            <span className={`ember-label ember-label--${tone(item.inspection_service_status)}`}>
              Inspectiedienst; {label(item.inspection_service_status)}
            </span>
          ) : null}
          {item.has_monitoring_service ? (
            <span className={`ember-label ember-label--${tone(item.monitoring_service_status)}`}>
              Meldkamer; {label(item.monitoring_service_status)}
            </span>
          ) : null}
          {item.certification_required ? (
            <span className={`ember-label ember-label--${tone(item.certificate_status)}`}>
              Certificaat; {label(item.certificate_status)}
            </span>
          ) : (
            <span className="ember-label ember-label--muted">Geen certificaatplicht vastgelegd</span>
          )}
          {Number(item.active_inspection_case_count || 0) > 0 ? (
            <span className="ember-label ember-label--info">
              Inspectiecase; {item.active_inspection_case_status}
            </span>
          ) : null}
        </div>

        {Number(item.open_follow_up_count || 0) > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={() => onOpenTab?.("notes")}>
            Open opvolgingen en notities
          </button>
        ) : null}
      </section>

      <section className="installation-overview__location">
        <div className="installation-overview__heading">
          <div>
            <h2>Locatie</h2>
            <p>{item.formatted_address || "Geen geformatteerd adres beschikbaar"}</p>
          </div>
          <span className={`ember-label ember-label--${item.has_valid_coordinates ? "success" : "warning"}`}>
            {item.has_valid_coordinates ? "Coördinaten beschikbaar" : "Coördinaten ontbreken"}
          </span>
        </div>
        <InstallationsMap markers={marker} compact />
      </section>

      {item.service_badges?.length ? (
        <section className="installation-overview__services">
          <h2>Dienstonderbouwing</h2>
          <div className="installation-overview__service-grid">
            {item.service_badges.map((service, index) => (
              <article key={`${service.service_category}:${service.paragraph_code}:${index}`} className="installation-overview__service-card">
                <div className="installation-overview__heading">
                  <strong>{service.display_label || service.service_category}</strong>
                  <span className={`ember-label ember-label--${tone(service.service_status)}`}>
                    {label(service.service_status)}
                  </span>
                </div>
                <span>{service.bestek_code || "Bestek onbekend"}; {service.paragraph_title || service.paragraph_code || "Paragraaf onbekend"}</span>
                <small>{service.service_status_reason || "Geen statusreden beschikbaar"}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
