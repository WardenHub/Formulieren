import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const NETHERLANDS_CENTER = [52.15, 5.3];

function FitVisibleMarkers({ markers }) {
  const map = useMap();

  useEffect(() => {
    const valid = markers.filter((marker) =>
      Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude))
    );

    if (valid.length === 0) {
      map.setView(NETHERLANDS_CENTER, 7);
      return;
    }

    if (valid.length === 1) {
      map.setView([Number(valid[0].latitude), Number(valid[0].longitude)], 15);
      return;
    }

    map.fitBounds(
      valid.map((marker) => [Number(marker.latitude), Number(marker.longitude)]),
      { padding: [28, 28], maxZoom: 15 }
    );
  }, [map, markers]);

  return null;
}

function markerIcon(marker) {
  const status = String(marker.attention_status || "OK").toLowerCase();
  const count = Number(marker.installation_count || marker.installations?.length || 1);
  return L.divIcon({
    className: "installation-map-marker-wrap",
    html: `<span class="installation-map-marker installation-map-marker--${status}">${count}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
  });
}

function labelTone(status) {
  const clean = String(status || "").toUpperCase();
  if (["EXPIRED", "MISSING", "REVOKED", "CRITICAL"].includes(clean)) return "danger";
  if (["EXPIRING", "UNKNOWN", "ATTENTION"].includes(clean)) return "warning";
  if (["ACTIVE", "VALID", "OK"].includes(clean)) return "success";
  return "muted";
}

function statusLabel(value) {
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

function InstallationPopup({ marker }) {
  return (
    <div className="installation-map-popup">
      <div className="installation-map-popup__title">
        {marker.object_name || "Object zonder naam"}
      </div>
      {marker.formatted_address ? (
        <div className="installation-map-popup__address">{marker.formatted_address}</div>
      ) : null}
      {marker.relation ? <div className="installation-map-popup__address">{marker.relation}</div> : null}

      <div className="installation-map-popup__signals">
        <span className={`ember-label ember-label--${labelTone(marker.attention_status)}`}>
          {marker.attention_reason || "Geen operationele signalen"}
        </span>
        {Number(marker.open_follow_up_count || 0) > 0 ? (
          <span className="ember-label ember-label--warning">
            {marker.open_follow_up_count} open opvolging
          </span>
        ) : null}
        {Number(marker.overdue_follow_up_count || 0) > 0 ? (
          <span className="ember-label ember-label--danger">
            {marker.overdue_follow_up_count} verlopen
          </span>
        ) : null}
        {Number(marker.open_form_count || 0) > 0 ? (
          <span className="ember-label ember-label--info">{marker.open_form_count} open formulier</span>
        ) : null}
        {Number(marker.missing_required_document_count || 0) > 0 ? (
          <span className="ember-label ember-label--danger">
            {marker.missing_required_document_count} document ontbreekt
          </span>
        ) : null}
      </div>

      <div className="installation-map-popup__installations">
        {(marker.installations || []).map((installation) => (
          <div key={installation.atrium_installation_code} className="installation-map-popup__installation">
            <div className="installation-map-popup__installation-top">
              <Link to={`/installaties/${installation.atrium_installation_code}`}>
                {installation.atrium_installation_code}
              </Link>
              <span>{installation.installation_name || "Geen naam"}</span>
            </div>
            <div className="installation-map-popup__signals">
              {installation.has_maintenance_service ? (
                <span className={`ember-label ember-label--${labelTone(installation.maintenance_contract_status)}`}>
                  Onderhoud; {statusLabel(installation.maintenance_contract_status)}
                </span>
              ) : null}
              {installation.has_inspection_service ? (
                <span className={`ember-label ember-label--${labelTone(installation.inspection_service_status)}`}>
                  Inspectie; {statusLabel(installation.inspection_service_status)}
                </span>
              ) : null}
              {installation.has_monitoring_service ? (
                <span className={`ember-label ember-label--${labelTone(installation.monitoring_service_status)}`}>
                  Meldkamer; {statusLabel(installation.monitoring_service_status)}
                </span>
              ) : null}
              {installation.certification_required ? (
                <span className={`ember-label ember-label--${labelTone(installation.certificate_status)}`}>
                  Certificaat; {statusLabel(installation.certificate_status)}
                </span>
              ) : null}
              {Number(installation.active_inspection_case_count || 0) > 0 ? (
                <span className="ember-label ember-label--info">
                  Inspectiecase; {installation.active_inspection_case_status}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InstallationsMap({ markers = [], compact = false }) {
  const stableMarkers = useMemo(
    () => markers.filter((marker) =>
      Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude))
    ),
    [markers]
  );

  return (
    <div className={`installation-map-shell${compact ? " installation-map-shell--compact" : ""}`}>
      <MapContainer
        className="installation-map"
        center={NETHERLANDS_CENTER}
        zoom={7}
        minZoom={5}
        maxZoom={19}
        scrollWheelZoom={!compact}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitVisibleMarkers markers={stableMarkers} />
        {stableMarkers.map((marker) => (
          <Marker
            key={marker.marker_group_key}
            position={[Number(marker.latitude), Number(marker.longitude)]}
            icon={markerIcon(marker)}
            title={`${marker.object_name || "Object"}; ${marker.installation_count || 1} installatie(s)`}
            alt={marker.object_name || "Installatieobject"}
          >
            <Popup minWidth={300} maxWidth={420}>
              <InstallationPopup marker={marker} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {stableMarkers.length === 0 ? (
        <div className="installation-map-empty">
          Geen installaties met geldige coördinaten binnen deze selectie.
        </div>
      ) : null}
    </div>
  );
}
