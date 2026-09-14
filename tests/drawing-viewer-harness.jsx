// De bediening van een tekening zonder aanmelden en zonder PDF. De echte schermen zitten
// achter een login en achter een document uit Atrium; de hooks uit src/lib/drawingViewer.js
// weten daar niets van, dus hier ligt er een nagemaakte plattegrond onder.
// Openen op /tests/drawing-viewer-harness.html.
//
// Waar naar te kijken:
//   - slepen schuift de tekening, ook met een vinger; de knoppen blijven bedienbaar
//   - ctrl of cmd met het wiel zoomt naar de muisaanwijzer toe, niet naar linksboven
//   - twee vingers knijpen zoomt naar het midden tussen de vingers
//   - dubbeltikken met een vinger wisselt tussen passend en twee keer
//   - schermvullend vult echt het scherm; Escape brengt hem terug
//   - tikken op de tekening zet een vinkje, tikken op een vinkje haalt hem weg
//   - de vinkjes en het radiale menu houden hun maat, hoe ver je ook inzoomt
//   - rechtermuisknop of een lange druk opent het menu; die druk verdraagt wat trilling
//
// De opbouw staat gelijk aan die van de tekening zelf: markeringen in de geschaalde pagina met
// een anker dat de zoom terugdraait, en het menu en de knop met de drie puntjes aan de shell,
// met de shell als grens. Alleen zo meet je hier wat daar gebeurt.
//
// Gemeten op 14 september 2026, in dit venster. De viewer: knijpen van 80 naar 240 pixels
// tussen de vingers gaf 100 naar 300 procent en het punt onder het midden bleef staan (438 op
// de pagina, voor en na); dubbeltikken gaf 100 - 200 - 100; slepen over 90 bij 50 pixels
// verschoof precies 90 bij 50; schermvullend gaf 880 in plaats van 636 pixels hoogte.
//
// Het radiale menu voor de verbouwing: 154, 256, 512 en 768 pixels doorsnede bij 60, 100, 200
// en 300 procent, vanaf 200 procent gedeeltelijk buiten beeld, en pannen om erbij te komen
// sloot het menu. De knop met de drie puntjes stond bij 300 procent 1443 pixels rechts buiten
// het venster. Een lange druk opende het menu alleen bij een vinger die volkomen stillag.

import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { BadgeAlert, Check, MapPinPlusInside, Maximize2, MessageSquareMore, Minimize2, MoreVertical, Scan } from "lucide-react";

import EmberRadialActionMenu from "../src/components/radial/EmberRadialActionMenu.jsx";
import { useDrawingViewer, useFullscreen } from "../src/lib/drawingViewer.js";
import "../src/styles/layout.css";

const PAGE = { width: 900, height: 620 };
const LONG_PRESS_MS = 550;
const LONG_PRESS_SLOP = 10;

// Dezelfde drie acties als op de tekening zelf.
const QUICK_ACTIONS = [
  { id: "component", label: "Component geplaatst", icon: MapPinPlusInside, tone: "primary" },
  { id: "note", label: "Opmerking", icon: MessageSquareMore, tone: "note" },
  { id: "defect", label: "Tekortkoming", icon: BadgeAlert, tone: "danger" },
];

// Een paar melders op vaste plekken, zodat er iets te mikken valt.
const MELDERS = [
  { id: "m1", x: 0.18, y: 0.22 },
  { id: "m2", x: 0.44, y: 0.31 },
  { id: "m3", x: 0.72, y: 0.24 },
  { id: "m4", x: 0.27, y: 0.66 },
  { id: "m5", x: 0.58, y: 0.71 },
  { id: "m6", x: 0.83, y: 0.62 },
];

function Harness() {
  const shellRef = useRef(null);
  const layerRef = useRef(null);
  const longPressRef = useRef(null);
  const [shell, setShell] = useState(null);
  const [quickMenu, setQuickMenu] = useState(null);
  const [points, setPoints] = useState([]);

  const fullscreen = useFullscreen(shellRef);
  const { viewportRef, zoom, setZoom, zoomToPoint, handlers } = useDrawingViewer({ initial: 1 });
  const markerScale = zoom > 0 ? 1 / zoom : 1;

  function connectShell(element) {
    shellRef.current = element;
    setShell(element);
  }

  useEffect(() => () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
  }, []);

  function positionFromClientPoint(clientX, clientY) {
    const layer = layerRef.current;
    if (!layer) return null;

    const rect = layer.getBoundingClientRect();
    const shellRect = shellRef.current?.getBoundingClientRect();
    return {
      x_normalized: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y_normalized: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      shell_x: shellRect ? clientX - shellRect.left : clientX,
      shell_y: shellRect ? clientY - shellRect.top : clientY,
    };
  }

  function positionAtVisibleCentre() {
    const viewport = viewportRef.current;
    if (!viewport) return null;

    const rect = viewport.getBoundingClientRect();
    return positionFromClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function cancelLongPress() {
    if (!longPressRef.current) return;
    window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }

  function startLongPress(event) {
    if (event.pointerType === "mouse") return;
    if (longPressRef.current) { cancelLongPress(); return; }

    const position = positionFromClientPoint(event.clientX, event.clientY);
    if (!position) return;

    longPressRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        setQuickMenu(position);
        longPressRef.current = null;
      }, LONG_PRESS_MS),
    };
  }

  function moveLongPress(event) {
    const press = longPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= LONG_PRESS_SLOP) return;
    cancelLongPress();
  }

  function openQuickMenu(event) {
    const position = positionFromClientPoint(event.clientX, event.clientY);
    if (!position) return;
    event.preventDefault();
    setQuickMenu(position);
  }

  function onWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomToPoint(zoom + (event.deltaY < 0 ? 0.15 : -0.15), event.clientX, event.clientY);
  }

  function addPoint(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    setPoints((current) => [...current, { id: `${Date.now()}-${current.length}`, x, y }]);
  }

  return (
    <div style={{ padding: "1rem", maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Tekening bedienen</h2>
      <p style={{ color: "var(--muted)" }}>
        {points.length ? `${points.length} vinkjes gezet` : "Tik op de tekening om een vinkje te zetten"}
        {" · "}
        zoom {Math.round(zoom * 100)}%
      </p>

      <div ref={connectShell} className={`drawing-pdf-shell${fullscreen.active ? " is-fullscreen" : ""}`}>
        <div className="drawing-zoom-controls" aria-label="Tekening bedienen">
          <button type="button" className="icon-btn" title="Inzoomen" onClick={() => setZoom((current) => current + 0.2)}>+</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn" title="Uitzoomen" onClick={() => setZoom((current) => current - 0.2)}>&minus;</button>
          <button type="button" className="icon-btn" title="Passend maken" aria-label="Passend maken" onClick={() => setZoom(1)}>
            <Scan size={17} aria-hidden="true" />
          </button>
          <span className="drawing-zoom-controls__divider" aria-hidden="true" />
          <button
            type="button"
            className="icon-btn"
            title={fullscreen.active ? "Schermvullend sluiten" : "Schermvullend tonen"}
            aria-label={fullscreen.active ? "Schermvullend sluiten" : "Schermvullend tonen"}
            aria-pressed={fullscreen.active}
            onClick={fullscreen.toggle}
          >
            {fullscreen.active ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
          </button>
        </div>

        <div ref={viewportRef} className="drawing-pdf-viewport" onWheel={onWheel} {...handlers}>
          <div
            className="drawing-pdf-page-zoom-frame"
            style={{ width: PAGE.width * zoom, height: PAGE.height * zoom }}
          >
            <div
              className="drawing-pdf-page"
              style={{ width: PAGE.width, height: PAGE.height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            >
              <svg width={PAGE.width} height={PAGE.height} role="img" aria-label="Nagemaakte plattegrond">
                <rect width={PAGE.width} height={PAGE.height} fill="#f4f1ea" />
                <rect x="40" y="40" width={PAGE.width - 80} height={PAGE.height - 80} fill="none" stroke="#333" strokeWidth="3" />
                <line x1="40" y1="300" x2={PAGE.width - 40} y2="300" stroke="#333" strokeWidth="2" />
                <line x1="400" y1="40" x2="400" y2="300" stroke="#333" strokeWidth="2" />
                <line x1="620" y1="300" x2="620" y2={PAGE.height - 40} stroke="#333" strokeWidth="2" />
                {MELDERS.map((melder) => (
                  <circle key={melder.id} cx={melder.x * PAGE.width} cy={melder.y * PAGE.height} r="9" fill="#c8102e" />
                ))}
                <text x="56" y="76" fontSize="16" fill="#333">Begane grond</text>
              </svg>

              <div
                ref={layerRef}
                className="drawing-pin-layer drawing-check-layer"
                role="button"
                tabIndex={0}
                aria-label="Tik om te markeren"
                onClick={addPoint}
                onContextMenu={openQuickMenu}
                onPointerDown={startLongPress}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerMove={moveLongPress}
              >
                {points.map((point, index) => (
                  <span
                    key={point.id}
                    className="drawing-pin-anchor drawing-pin-anchor--pin"
                    style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, "--drawing-marker-scale": markerScale }}
                  >
                    <button
                      type="button"
                      className="drawing-check"
                      aria-label={`Gecontroleerd ${index + 1}, tik om weg te halen`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPoints((current) => current.filter((item) => item.id !== point.id));
                      }}
                    >
                      <Check size={15} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="drawing-quick-menu-fallback"
          aria-label="Snelmenu voor een pin openen"
          onClick={(event) => {
            event.stopPropagation();
            const position = positionAtVisibleCentre();
            if (position) setQuickMenu(position);
          }}
        >
          <MoreVertical size={19} />
        </button>

        <EmberRadialActionMenu
          open={Boolean(quickMenu)}
          anchorPosition={quickMenu ? { x: quickMenu.shell_x, y: quickMenu.shell_y } : null}
          actions={QUICK_ACTIONS}
          onSelect={() => setQuickMenu(null)}
          onClose={() => setQuickMenu(null)}
          ariaLabel="Tekeningactie"
          resolvedTheme="light"
          boundaryElement={shell}
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
