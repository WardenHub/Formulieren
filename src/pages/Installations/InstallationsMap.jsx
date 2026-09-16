import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { getInstallationTypeAppearance, getInstallationTypeLegend } from "@/lib/installationTypeAppearance.js";
import { getProfileAvatarSnapshot, subscribeProfileAvatar } from "@/lib/profileAvatarStore.js";
import { CERTIFICATION_APPEARANCE, certificationAppearance } from "@/lib/certificationAppearance.js";

const NETHERLANDS_CENTER = [52.15, 5.3];

/* Waar de kaart zijn beeld haalt.

   Zowel de gewone kaart als de luchtfoto komen van PDOK. Daarmee gebruikt Ember geen
   voor algemeen appverkeer bedoelde OpenStreetMap-tegelservers rechtstreeks; die kunnen
   zulke verzoeken blokkeren en tonen dan een 403-melding in de kaart.

   Op het diepste zoomniveau heeft de gewone kaart bijna niets te tekenen; een tegel van
   een bedrijventerrein of een landelijk adres is dan een vlak zonder inhoud, en dat las
   als een kapotte kaart. Een luchtfoto laat daar juist het gebouw zelf zien, en dat is
   precies wat je wil weten als je naar een installatie toe moet.

   De luchtfoto komt van PDOK, de open dataservice van het Kadaster; Nederlandse dekking
   tot en met zoom 19, ook buiten de steden. maxNativeZoom zorgt dat er nooit om een tegel
   wordt gevraagd die niet bestaat; verder inzoomen schaalt de diepste tegel op in plaats
   van grijs te worden. */
const MAP_LAYERS = {
  kaart: {
    label: "Kaart",
    url: "https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png",
    credit: "Achtergrondkaart © Kadaster / PDOK",
    creditHref: "https://www.pdok.nl/ogc-webservices/-/article/basisregistratie-topografie-achtergrondkaarten-brt-a-",
    maxNativeZoom: 19,
  },
  luchtfoto: {
    label: "Luchtfoto",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    credit: "Luchtfoto © PDOK / Kadaster",
    creditHref: "https://www.pdok.nl",
    maxNativeZoom: 19,
  },
};

const LAYER_PREFERENCE_KEY = "ember.installations.mapLayer";

function readLayerPreference() {
  try {
    const stored = window.localStorage.getItem(LAYER_PREFERENCE_KEY);
    if (stored && MAP_LAYERS[stored]) return stored;
  } catch {
    // Zonder opslag begint de kaart gewoon op de gewone weergave.
  }
  return "kaart";
}

// De markers zijn divIcons met een HTML-string; wat daarin komt moet ontdaan zijn van
// tekens die de markup kunnen breken.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

/* De kaart groeit mee met het venster. Leaflet meet zichzelf alleen bij een venstergrootte,
   niet wanneer zijn container om een andere reden van maat verandert; dan blijft er een grijze
   strook staan waar nooit tegels zijn opgehaald. Deze waarnemer dekt beide gevallen af. */
function ResizeReporter() {
  const map = useMap();

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

function ViewportReporter({ onViewportChange }) {
  // resize hoort erbij; een hogere kaart toont meer gebied en dus meer markers.
  const map = useMapEvents({ moveend: report, zoomend: report, resize: report });
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

// De topbar laadt de profielfoto en zet hem in de store; zie src/lib/profileAvatarStore.js
// voor waarom dat een store is en geen window-variabele.
function useProfileAvatar() {
  // Leest de huidige waarde bij elke render, dus onafhankelijk van de vraag of de topbar er
  // eerder was dan dit scherm. Dat was precies de reden dat hier soms een blauwe stip stond
  // terwijl de foto rechtsboven wel zichtbaar was.
  return useSyncExternalStore(
    subscribeProfileAvatar,
    getProfileAvatarSnapshot,
    getProfileAvatarSnapshot
  );
}

function UserLocationControl({ avatar }) {
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
        avatar?.src || avatar?.initials ? (
          <Marker
            position={location}
            icon={L.divIcon({
              className: "installation-map-user-marker-wrap",
              html: avatar.src
                ? `<span class="installation-map-user-marker"><img src="${avatar.src}" alt="" /></span>`
                : `<span class="installation-map-user-marker installation-map-user-marker--initials">${escapeHtml(avatar.initials)}</span>`,
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

function markerIcon(marker, certificationMode) {
  const count = Number(marker.installation_count || marker.installations?.length || 1);
  const types = [...new Set((marker.installations || []).map((item) => String(item.installation_type_key || "").trim().toUpperCase()).filter(Boolean))];
  const typeKey = String(marker.installation_type_key || types[0] || "").trim().toUpperCase();
  const mixed = count > 1 && types.length > 1;
  const appearance = certificationMode ? certificationAppearance(marker.certificate_status) : mixed ? { color: "#475569" } : getInstallationTypeAppearance(typeKey);
  return L.divIcon({
    className: "installation-map-marker-wrap",
    html: `<span class="installation-map-marker${count > 1 ? " installation-map-marker--cluster" : ""}" style="--marker-color:${appearance.color}">${count}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
  });
}

function InstallationPopup({ marker, certificationMode }) {
  const items = marker.installations || [];
  const total = Number(marker.installation_count || items.length || 0);
  const remaining = Math.max(0, total - items.length);

  return (
    <div className="installation-map-popup">
      <div className="installation-map-popup__title">{marker.object_name || "Installaties"}</div>
      {marker.formatted_address ? <div className="installation-map-popup__address">{marker.formatted_address}</div> : null}
      {marker.relation ? <div className="installation-map-popup__address">{marker.relation}</div> : null}

      {items.length ? (
        <div className="installation-map-popup__installations">
          {items.map((installation) => (
            <Link key={installation.atrium_installation_code} className="installation-map-popup__installation" to={`/installaties/${encodeURIComponent(installation.atrium_installation_code)}`}>
              <div className="installation-map-popup__installation-top">
                <span className="installation-map-popup__installation-code">{installation.atrium_installation_code}</span>
                <span>{installation.installation_name || "Geen naam"}</span>
                {certificationMode ? <span>{certificationAppearance(installation.certificate_status).label}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {/* Uitgezoomd staat een marker voor een gebied en niet voor een adres. Dan is een lijst
          van willekeurige installaties geen hulp; zeggen hoeveel het zijn en uitnodigen om in
          te zoomen wel. Het aantal komt altijd van de server, ook als de lijst leeg is. */}
      {remaining > 0 ? (
        <div className="installation-map-popup__more">
          {items.length
            ? `En nog ${remaining} installatie${remaining === 1 ? "" : "s"} op deze plek; zoom in om ze te zien.`
            : `${total} installatie${total === 1 ? "" : "s"} in dit gebied; zoom in om ze te zien.`}
        </div>
      ) : null}
    </div>
  );
}

export default function InstallationsMap({ markers = [], compact = false, loading = false, error = null, onRetry, onViewportChange, fitRequestKey = "", showLegend = false, showUserLocation = true, certificationMode = false }) {
  const stableMarkers = useMemo(() => markers.filter((marker) => Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude))), [markers]);
  const legend = useMemo(() => certificationMode ? Object.entries(CERTIFICATION_APPEARANCE).map(([typeKey, appearance]) => ({ typeKey, ...appearance })) : getInstallationTypeLegend(), [certificationMode]);
  const avatar = useProfileAvatar();
  const [layerKey, setLayerKey] = useState(readLayerPreference);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const layer = MAP_LAYERS[layerKey] || MAP_LAYERS.kaart;

  function kiesLaag(nextKey) {
    setLayerKey(nextKey);
    try {
      window.localStorage.setItem(LAYER_PREFERENCE_KEY, nextKey);
    } catch {
      // De keuze geldt dan alleen voor deze sessie.
    }
  }

  // De markers hangen alleen van de markerlijst af. Zonder dit hertekende elke
  // kaartbeweging ze allemaal, want de loading-indicator zit in dezelfde component en elk
  // divIcon werd dan opnieuw opgebouwd; bij driehonderd markers is dat merkbaar.
  const renderedMarkers = useMemo(
    () =>
      stableMarkers.map((marker) => (
        <Marker
          key={marker.marker_group_key}
          position={[Number(marker.latitude), Number(marker.longitude)]}
          icon={markerIcon(marker, certificationMode)}
          title={`${marker.object_name || "Installatie"}; ${marker.installation_count || 1} installatie(s)`}
          alt={marker.object_name || "Installatie"}
          keyboard
        >
          <Popup minWidth={260} maxWidth={380}>
            <InstallationPopup marker={marker} certificationMode={certificationMode}/>
          </Popup>
        </Marker>
      )),
    [stableMarkers, certificationMode]
  );

  return (
    <div className={`installation-map-shell${compact ? " installation-map-shell--compact" : ""}`}>
      <MapContainer
        className="installation-map"
        center={NETHERLANDS_CENTER}
        zoom={compact && stableMarkers.length === 1 ? 15 : 7}
        minZoom={5}
        // Een stap verder dan de diepste tegel; die wordt dan opgeschaald in plaats van
        // grijs te blijven.
        maxZoom={20}
        scrollWheelZoom
        keyboard
        touchZoom
        zoomControl
        /* De vaste balk "Leaflet | (c) OpenStreetMap" staat rechtsonder permanent over de
           kaart en is intern alleen ruis. De vermelding zelf blijft: die staat achter het
           knopje naast de weergavekeuze, met de bron van de laag die je bekijkt. */
        attributionControl={false}
      >
        <TileLayer
          key={layerKey}
          url={layer.url}
          maxNativeZoom={layer.maxNativeZoom}
          maxZoom={20}
          // Bij pannen niet elke tussenstand ophalen; dat scheelt verzoeken en het voelt
          // rustiger.
          updateWhenIdle
          keepBuffer={3}
        />
        {showUserLocation ? <UserLocationControl avatar={avatar} /> : null}
        <ResizeReporter />
        <ViewportReporter onViewportChange={onViewportChange} />
        <FitVisibleMarkers markers={stableMarkers} fitRequestKey={fitRequestKey} />
        {renderedMarkers}
      </MapContainer>
      <div className="installation-map-layer-switch" role="group" aria-label="Kaartweergave">
        {Object.entries(MAP_LAYERS).map(([key, item]) => (
          <button
            key={key}
            type="button"
            className={key === layerKey ? "is-active" : ""}
            aria-pressed={key === layerKey}
            onClick={() => kiesLaag(key)}
          >
            {item.label}
          </button>
        ))}

        <button
          type="button"
          className={`installation-map-layer-switch__info${creditsOpen ? " is-active" : ""}`}
          aria-expanded={creditsOpen}
          aria-label="Bron van het kaartbeeld"
          title="Bron van het kaartbeeld"
          onClick={() => setCreditsOpen((open) => !open)}
        >
          i
        </button>
      </div>

      {creditsOpen ? (
        <div className="installation-map-credit" role="note">
          <a href={layer.creditHref} target="_blank" rel="noreferrer noopener">
            {layer.credit}
          </a>
        </div>
      ) : null}

      {/* De melding gaat over de kaart heen en niet erboven; erboven duwt hij de kaart weg
          en verschuift alles waar je net naar keek. */}
      {error ? (
        <div className="installation-map-error" role="alert">
          <span className="installation-map-error__pill">
            <span>{error}</span>
            {onRetry ? (
              <button type="button" onClick={onRetry}>
                Opnieuw proberen
              </button>
            ) : null}
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="installation-map-loading" role="status" aria-live="polite">
          <span className="installation-map-loading__bar" aria-hidden="true" />
          <span className="installation-map-loading__pill"><span className="installation-map-loading__spinner" aria-hidden="true" />Kaart bijwerken...</span>
        </div>
      ) : null}
      {showLegend ? (
        <div className="installation-map-legend" aria-label={certificationMode ? "Legenda certificaatstatus" : "Legenda installatiesoorten"}>
          {legend.map((item) => <span key={item.typeKey}><i style={{ background: item.color }} />{item.label}</span>)}
          {!certificationMode ? <span><i style={{ background: "#475569" }} />Gemengd cluster</span> : null}
        </div>
      ) : null}
      {!stableMarkers.length && !loading && !error ? <div className="installation-map-empty-mark" role="img" aria-label="Geen installaties binnen deze kaart">×</div> : null}
    </div>
  );
}
