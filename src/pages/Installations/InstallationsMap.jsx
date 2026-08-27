import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { fetchProtectedObjectUrl, httpJson } from "@/api/http.js";
import { getInstallationTypeAppearance, getInstallationTypeLegend } from "@/lib/installationTypeAppearance.js";
import { resolveProfileAvatarPath } from "@/lib/avatar.js";

const NETHERLANDS_CENTER = [52.15, 5.3];

function FitVisibleMarkers({ markers, fitRequestKey }) {
  const map = useMap();
  const lastAppliedKey = useRef("");
  useEffect(() => {
    if (!fitRequestKey || lastAppliedKey.current === fitRequestKey) return;
    const valid = markers.filter((marker) => Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude)));
    if (!valid.length) return;
    lastAppliedKey.current = fitRequestKey;
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

function useProfileAvatar() {
  const [avatarSrc, setAvatarSrc] = useState(() => window.__emberProfileAvatarObjectUrl || null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    function onAvatarReady(event) {
      if (!cancelled) setAvatarSrc(event?.detail?.objectUrl || null);
    }

    async function load() {
      try {
        const [profileData, meData] = await Promise.all([
          httpJson("/me/profile"),
          httpJson("/me"),
        ]);
        const mediaPath = resolveProfileAvatarPath(profileData, meData);
        if (!mediaPath) {
          if (!cancelled) setAvatarSrc(null);
          return;
        }
        const nextObjectUrl = await fetchProtectedObjectUrl(mediaPath);
        if (cancelled) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = nextObjectUrl;
        setAvatarSrc(nextObjectUrl);
      } catch {
        if (!cancelled) setAvatarSrc(null);
      }
    }

    window.addEventListener("ember:profile-avatar-ready", onAvatarReady);
    if (!window.__emberProfileAvatarObjectUrl) load();
    window.addEventListener("ember:profile-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("ember:profile-avatar-ready", onAvatarReady);
      window.removeEventListener("ember:profile-updated", load);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return avatarSrc;
}

function UserLocationControl({ avatarSrc }) {
  const map = useMap();
  const [location, setLocation] = useState(null);
  const [state, setState] = useState("idle");
  const autoLocateRef = useRef(false);
  const locationPreferenceKey = "ember.installations.useMyLocation";

  useMapEvents({
    locationfound(event) {
      setLocation(event.latlng);
      setState("found");
      try { window.localStorage.setItem(locationPreferenceKey, "1"); } catch { /* storage is optional */ }
      map.setView(event.latlng, 13, { animate: true, duration: 1.4 });
    },
    locationerror() {
      setState("error");
    },
  });

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setState("error");
      return;
    }
    setState("loading");
    map.locate({ enableHighAccuracy: true, maximumAge: 60000, timeout: 10000, setView: false });
  }, [map]);

  useEffect(() => {
    if (autoLocateRef.current || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    let permission = null;
    async function restoreLocationPreference() {
      let preferred = false;
      try { preferred = window.localStorage.getItem(locationPreferenceKey) === "1"; } catch { /* storage is optional */ }
      if (!preferred) return;
      try {
        permission = await navigator.permissions.query({ name: "geolocation" });
        if (!cancelled && permission.state === "granted") {
          autoLocateRef.current = true;
          locateUser();
        }
      } catch { /* browsers without a permissions implementation simply wait for a click */ }
    }
    restoreLocationPreference();
    return () => {
      cancelled = true;
      permission?.removeEventListener?.("change", restoreLocationPreference);
    };
  }, [locateUser, map]);

  return (
    <>
      <div className="installation-map-location-control" role="group" aria-label="Mijn locatie">
        <button type="button" onClick={locateUser} disabled={state === "loading"} title="Toon mijn locatie op de kaart">
          {state === "loading" ? "Locatie zoeken..." : "Mijn locatie"}
        </button>
        {state === "error" ? <span role="status">Locatietoestemming niet beschikbaar.</span> : null}
      </div>
      {location ? (
        avatarSrc ? (
          <Marker
            position={location}
            icon={L.divIcon({
              className: "installation-map-user-marker-wrap",
              html: `<span class="installation-map-user-marker"><img src="${avatarSrc}" alt="" /></span>`,
              iconSize: [42, 42],
              iconAnchor: [21, 21],
            })}
            title="Mijn locatie"
          />
        ) : (
          <CircleMarker center={location} radius={8} pathOptions={{ color: "#2563eb", fillColor: "#60a5fa", fillOpacity: 0.85, weight: 3 }} />
        )
      ) : null}
    </>
  );
}

function markerIcon(marker) {
  const count = Number(marker.installation_count || marker.installations?.length || 1);
  const types = [...new Set((marker.installations || []).map((item) => String(item.installation_type_key || "").trim().toUpperCase()).filter(Boolean))];
  const typeKey = String(marker.installation_type_key || types[0] || "").trim().toUpperCase();
  const mixed = count > 1 && types.length > 1;
  const appearance = mixed ? { color: "#475569" } : getInstallationTypeAppearance(typeKey);
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
      <div className="installation-map-popup__installations">
        {items.map((installation) => (
          <Link key={installation.atrium_installation_code} className="installation-map-popup__installation" to={`/installaties/${encodeURIComponent(installation.atrium_installation_code)}`}>
            <div className="installation-map-popup__installation-top">
              <span className="installation-map-popup__installation-code">{installation.atrium_installation_code}</span>
              <span>{installation.installation_name || "Geen naam"}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function InstallationsMap({ markers = [], compact = false, loading = false, onViewportChange, fitRequestKey = "", showLegend = false, showUserLocation = true }) {
  const stableMarkers = useMemo(() => markers.filter((marker) => Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude))), [markers]);
  const legend = useMemo(() => getInstallationTypeLegend(), []);
  const avatarSrc = useProfileAvatar();

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
        {showUserLocation ? <UserLocationControl avatarSrc={avatarSrc} /> : null}
        <ViewportReporter onViewportChange={onViewportChange} />
        <FitVisibleMarkers markers={stableMarkers} fitRequestKey={fitRequestKey} />
        {stableMarkers.map((marker) => (
          <Marker key={marker.marker_group_key} position={[Number(marker.latitude), Number(marker.longitude)]} icon={markerIcon(marker)} title={`${marker.object_name || "Installatie"}; ${marker.installation_count || 1} installatie(s)`} alt={marker.object_name || "Installatie"} keyboard>
            <Popup minWidth={260} maxWidth={380}><InstallationPopup marker={marker} /></Popup>
          </Marker>
        ))}
      </MapContainer>
      {loading ? (
        <div className="installation-map-loading" role="status" aria-live="polite">
          <span className="installation-map-loading__bar" aria-hidden="true" />
          <span className="installation-map-loading__pill"><span className="installation-map-loading__spinner" aria-hidden="true" />Kaart bijwerken...</span>
        </div>
      ) : null}
      {showLegend ? (
        <div className="installation-map-legend" aria-label="Legenda installatiesoorten">
          {legend.map((item) => <span key={item.typeKey}><i style={{ background: item.color }} />{item.label}</span>)}
          <span><i style={{ background: "#475569" }} />Gemengd cluster</span>
        </div>
      ) : null}
      {!stableMarkers.length && !loading ? <div className="installation-map-empty-mark" role="img" aria-label="Geen installaties binnen deze kaart">×</div> : null}
    </div>
  );
}
