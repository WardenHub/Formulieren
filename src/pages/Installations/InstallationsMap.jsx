import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { getInstallationTypeAppearance, getInstallationTypeLegend } from "@/lib/installationTypeAppearance.js";

const NETHERLANDS_CENTER = [52.15, 5.3];

function FitVisibleMarkers({ markers, fitRequestKey }) {
  const map = useMap();
  useEffect(() => {
    if (!fitRequestKey) return;
    const valid = markers.filter((marker) => Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude)));
    if (!valid.length) return;
    if (valid.length === 1) map.setView([Number(valid[0].latitude), Number(valid[0].longitude)], 15);
    else map.fitBounds(valid.map((marker) => [Number(marker.latitude), Number(marker.longitude)]), { padding: [28, 28], maxZoom: 15 });
  }, [fitRequestKey, map, markers]);
  return null;
}

function ViewportReporter({ onViewportChange }) {
  const map = useMapEvents({ moveend: report, zoomend: report });
  function report() {
    if (!onViewportChange) return;
    const bounds = map.getBounds();
    onViewportChange({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest(), zoom: map.getZoom() });
  }
  useEffect(() => {
    const timer = window.setTimeout(report, 0);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

function markerIcon(marker) {
  const count = Number(marker.installation_count || marker.installations?.length || 1);
  const mixed = count > 1 && !marker.installation_type_key;
  const appearance = mixed ? { color: "#475569" } : getInstallationTypeAppearance(marker.installation_type_key);
  return L.divIcon({
    className: "installation-map-marker-wrap",
    html: `<span class="installation-map-marker${count > 1 ? " installation-map-marker--cluster" : ""}" style="--marker-color:${appearance.color}">${count}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
  });
}

function InstallationPopup({ marker }) {
  const items = marker.installations || [];
  return (
    <div className="installation-map-popup">
      <div className="installation-map-popup__title">{marker.object_name || "Installaties"}</div>
      {marker.formatted_address ? <div className="installation-map-popup__address">{marker.formatted_address}</div> : null}
      {marker.relation ? <div className="installation-map-popup__address">{marker.relation}</div> : null}
      {Number(marker.installation_count || 0) > items.length ? <div className="ember-label ember-label--muted">Zoom verder in om alle installaties te zien.</div> : null}
      <div className="installation-map-popup__installations">
        {items.map((installation) => (
          <div key={installation.atrium_installation_code} className="installation-map-popup__installation">
            <div className="installation-map-popup__installation-top">
              <Link to={`/installaties/${encodeURIComponent(installation.atrium_installation_code)}`}>{installation.atrium_installation_code}</Link>
              <span>{installation.installation_name || "Geen naam"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InstallationsMap({ markers = [], compact = false, loading = false, onViewportChange, fitRequestKey = "", showLegend = false }) {
  const stableMarkers = useMemo(() => markers.filter((marker) => Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude))), [markers]);
  const legend = useMemo(() => getInstallationTypeLegend(), []);

  return (
    <div className={`installation-map-shell${compact ? " installation-map-shell--compact" : ""}`}>
      <MapContainer
        className="installation-map"
        center={NETHERLANDS_CENTER}
        zoom={compact && stableMarkers.length === 1 ? 15 : 7}
        minZoom={5}
        maxZoom={19}
        scrollWheelZoom
        keyboard
        touchZoom
        zoomControl
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ViewportReporter onViewportChange={onViewportChange} />
        <FitVisibleMarkers markers={stableMarkers} fitRequestKey={fitRequestKey} />
        {stableMarkers.map((marker) => (
          <Marker key={marker.marker_group_key} position={[Number(marker.latitude), Number(marker.longitude)]} icon={markerIcon(marker)} title={`${marker.object_name || "Installatie"}; ${marker.installation_count || 1} installatie(s)`} alt={marker.object_name || "Installatie"} keyboard>
            <Popup minWidth={260} maxWidth={380}><InstallationPopup marker={marker} /></Popup>
          </Marker>
        ))}
      </MapContainer>
      {loading ? <div className="installation-map-loading" role="status">Kaart bijwerken...</div> : null}
      {showLegend ? (
        <div className="installation-map-legend" aria-label="Legenda installatiesoorten">
          {legend.map((item) => <span key={item.typeKey}><i style={{ background: item.color }} />{item.label}</span>)}
          <span><i style={{ background: "#475569" }} />Gemengd cluster</span>
        </div>
      ) : null}
      {!stableMarkers.length && !loading ? <div className="installation-map-empty">Geen installaties met geldige coördinaten binnen deze kaart.</div> : null}
    </div>
  );
}
