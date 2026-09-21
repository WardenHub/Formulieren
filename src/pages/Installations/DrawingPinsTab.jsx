import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlobalWorkerOptions, getDocument as loadPdfDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BadgeAlert, BriefcaseBusiness, ChevronLeft, ChevronRight, MapPinPlusInside, Maximize2, MessageSquareMore, Minimize2, MoreVertical, PanelRightClose, PanelRightOpen, Pin, PinOff } from "lucide-react";

import EmberRadialActionMenu from "@/components/radial/EmberRadialActionMenu.jsx";
import { BadgeAlertIcon } from "@/components/ui/badge-alert.jsx";
import { MapPinPlusInsideIcon } from "@/components/ui/map-pin-plus-inside.jsx";
import { MessageSquareMoreIcon } from "@/components/ui/message-square-more.jsx";
import { CircleHelpIcon } from "@/components/ui/circle-help.jsx";
import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";
import { savePointDrawing } from "../Forms/shared/pointEvidence.js";
import { getResolvedAppearance, subscribeAppearance } from "@/theme/appearance.js";
import { useDrawingViewer, useFullscreen, usePdfPage } from "@/lib/drawingViewer.js";

import {
  createDrawingPin,
  createManualFollowUpForDrawingPin,
  copyDrawingPinsToRevision,
  deleteDrawingPin,
  downloadInstallationDocumentFile,
  getDrawingPins,
  getInstallationDrawings,
  linkDrawingPinAction,
  setInstallationPrimaryDrawing,
  unlinkDrawingPinAction,
  updateDrawingPin,
} from "@/api/emberApi.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function readPdfPageSizes(document) {
  const sizes = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    sizes.push({ width: viewport.width, height: viewport.height });
  }
  return sizes;
}

// De lange druk op een tablet. 550 ms is dezelfde tijd als voorheen; de speling is nieuw en
// ligt bij de 12 pixels die de tekeningviewer voor een tik aanhoudt.
const LONG_PRESS_MS = 550;
const LONG_PRESS_SLOP = 10;

const DRAWING_QUICK_ACTIONS = [
  {
    id: "component",
    label: "Component geplaatst",
    icon: MapPinPlusInside,
    tone: "primary",
  },
  {
    id: "note",
    label: "Opmerking",
    icon: MessageSquareMore,
    tone: "note",
  },
  {
    id: "defect",
    label: "Tekortkoming",
    icon: BadgeAlert,
    tone: "danger",
  },
];

const PIN_TYPE_META = {
  DEFICIENCY: { label: "Tekortkoming", Icon: BadgeAlertIcon, tone: "danger" },
  NOTE: { label: "Opmerking", Icon: MessageSquareMoreIcon, tone: "note" },
  COMPONENT_PLACED: { label: "Component geplaatst", Icon: MapPinPlusInsideIcon, tone: "primary" },
};

function DrawingLoadingCard({ label = "De PDF en markeringen worden voorbereid." }) {
  return (
    <div className="card ember-loading-card drawing-loading-card" role="status" aria-live="polite">
      <div className="ember-loading-card-inner">
        <div className="ember-loading-icon">
          <LoaderPinwheelIcon size={30} active aria-label="tekening wordt geladen" />
        </div>
        <div className="ember-loading-title">Tekening wordt geladen</div>
        <div className="muted ember-small-text">{label}</div>
      </div>
    </div>
  );
}

function PdfPinViewer({ pdfDocument, pageNumber, pageCount, pins, selectedPinId, selectedPin, componentReview, draft, editorOpen, editorContent, placing, onPreviousPage, onNextPage, onPlace, onSelect, onPinDragStart, onMove, onMoveEnd, onDraftMove, onQuickAction, readOnly }) {
  const shellRef = useRef(null);
  const layerRef = useRef(null);
  const [shellSize, setShellSize] = useState({ width: 900, height: 600 });
  const fullscreen = useFullscreen(shellRef);
  // Zoomen, pannen en knijpen komen uit de gedeelde tekeningviewer; de FormRunner gebruikt
  // dezelfde. Tijdens het plaatsen van een pin staan de gebaren uit, want dan is een tik een
  // plaatsing en geen sleep.
  const { viewportRef, zoom, setZoom, zoomToPoint, handlers: viewerHandlers } = useDrawingViewer({
    initial: componentReview ? 1.45 : 1,
    enabled: !placing,
  });
  const { canvasRef, pageSize, rendering } = usePdfPage({
    pdfDocument,
    pageNumber,
    availableWidth: shellSize.width,
  });
  const [quickMenu, setQuickMenu] = useState(null);
  const [boundaryElement, setBoundaryElement] = useState(null);
  const menuTriggerRef = useRef(null);
  const longPressRef = useRef(null);
  const dragRef = useRef(null);
  const lastFocusedPinRef = useRef("");
  const editorDragRef = useRef(null);
  const [editorDragPosition, setEditorDragPosition] = useState(null);
  const resolvedTheme = useSyncExternalStore(
    subscribeAppearance,
    getResolvedAppearance,
    () => "dark",
  );

  useEffect(() => {
    if (!shellRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const contentRect = entries?.[0]?.contentRect;
      if (contentRect?.width > 0 && contentRect?.height > 0) {
        setShellSize({ width: contentRect.width, height: contentRect.height });
      }
    });
    observer.observe(shellRef.current);
    return () => observer.disconnect();
  }, []);

  // Ctrl of cmd plus wiel zoomt, met het punt onder de cursor als anker. Gewoon scrollen blijft
  // gewoon scrollen, want in een tekening wil je vaker schuiven dan zoomen.
  useEffect(() => {
    function handleWheel(event) {
      const viewport = viewportRef.current;
      if ((!event.ctrlKey && !event.metaKey) || !viewport?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      zoomToPoint(zoom + (event.deltaY < 0 ? 0.15 : -0.15), event.clientX, event.clientY);
    }

    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handleWheel, { capture: true });
  }, [viewportRef, zoom, zoomToPoint]);


  useEffect(() => {
    if (!selectedPinId || !selectedPin || rendering || !pageSize.width || !pageSize.height) return undefined;
    if (Number(selectedPin.page_number) !== Number(pageNumber)) return undefined;
    const focusKey = `${selectedPinId}:${pageNumber}`;
    if (lastFocusedPinRef.current === focusKey) return undefined;
    lastFocusedPinRef.current = focusKey;

    const frameId = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const pinX = Number(selectedPin.x_normalized) * pageSize.width * zoom;
      const pinY = Number(selectedPin.y_normalized) * pageSize.height * zoom;
      const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTo({
        left: Math.min(maxLeft, Math.max(0, pinX - viewport.clientWidth / 2)),
        top: Math.min(maxTop, Math.max(0, pinY - viewport.clientHeight / 2)),
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [componentReview, pageNumber, pageSize.height, pageSize.width, rendering, selectedPin, selectedPinId, viewportRef, zoom]);

  const pagePins = pins.filter((pin) => Number(pin.page_number) === Number(pageNumber));

  // Een pin is een markering op de tekening, geen onderdeel ervan. De laag zit in de geschaalde
  // pagina, dus draaien de markeringen de zoom weer terug en houden ze op elk zoomniveau
  // dezelfde maat op het scherm; bij ver uitzoomen bleven ze anders te klein om aan te tikken.
  const markerScale = zoom > 0 ? 1 / zoom : 1;

  const initialEditorPosition = (() => {
    if (!editorOpen) return null;
    const editorWidth = Math.min(360, Math.max(280, shellSize.width - 24));
    const editorHeight = Math.min(460, Math.max(250, shellSize.height - 24));
    return {
      left: Math.max(12, shellSize.width - editorWidth - 16),
      top: Math.min(72, Math.max(52, shellSize.height - editorHeight - 12)),
    };
  })();
  const editorPosition = editorDragPosition || initialEditorPosition;

  const cancelLongPress = useCallback(() => {
    if (!longPressRef.current) return;
    window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }, []);

  useEffect(() => () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
  }, []);

  const showQuickMenu = useCallback((position, triggerElement) => {
    menuTriggerRef.current = triggerElement || layerRef.current;
    setQuickMenu(position);
  }, []);

  const closeQuickMenu = useCallback(({ restoreFocus = true } = {}) => {
    const triggerElement = menuTriggerRef.current;
    setQuickMenu(null);
    if (restoreFocus && triggerElement?.focus) {
      window.requestAnimationFrame(() => triggerElement.focus({ preventScroll: true }));
    }
  }, []);

  const connectLayerElement = useCallback((element) => {
    layerRef.current = element;
  }, []);

  // Het radiale menu hoort bij het scherm en niet bij het papier. Stond het in de pinlaag, dan
  // schaalde het mee met de zoom (bij 300 procent een ring van 768 pixels) en klemde het tegen
  // de pagina in plaats van tegen wat je ziet, zodat de helft buiten beeld viel.
  const connectShellElement = useCallback((element) => {
    shellRef.current = element;
    setBoundaryElement(element);
  }, []);

  useEffect(() => {
    if (!quickMenu) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && event.target?.closest?.(".ember-radial-action-menu")) return;
      closeQuickMenu();
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [closeQuickMenu, quickMenu]);

  function positionFromClientPoint(clientX, clientY) {
    const layer = layerRef.current;
    if (!layer) return null;

    const rect = layer.getBoundingClientRect();
    const shellRect = shellRef.current?.getBoundingClientRect();
    const normalizedX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const normalizedY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));

    return {
      left: normalizedX * layer.clientWidth,
      top: normalizedY * layer.clientHeight,
      x_normalized: normalizedX,
      y_normalized: normalizedY,
      page_number: pageNumber,
      shell_x: shellRect ? clientX - shellRect.left : clientX,
      shell_y: shellRect ? clientY - shellRect.top : clientY,
    };
  }

  function positionFromEvent(event) {
    return positionFromClientPoint(event.clientX, event.clientY);
  }

  // Waar kijkt de monteur nu naar. De knop met de drie puntjes zit aan het scherm vast, dus de
  // pin die eruit volgt hoort in het midden van het zichtbare stuk tekening te komen.
  function positionAtVisibleCentre() {
    const viewport = viewportRef.current;
    if (!viewport) return null;

    const rect = viewport.getBoundingClientRect();
    return positionFromClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function openQuickMenu(event) {
    if (readOnly || placing || !pageSize.width || !pageSize.height) return;
    const position = positionFromEvent(event);
    if (!position) return;
    event.preventDefault();
    showQuickMenu(position, event.currentTarget);
  }

  function runQuickAction(kind) {
    if (!quickMenu) return;
    onQuickAction?.(kind, {
      x_normalized: quickMenu.x_normalized,
      y_normalized: quickMenu.y_normalized,
      page_number: quickMenu.page_number,
    });
    closeQuickMenu();
  }

  function handlePlacement(event) {
    if (!placing || !pageSize.width || !pageSize.height) return;
    onPlace?.(positionFromEvent(event));
  }

  function startEditorDrag(event) {
    if (event.button !== 0 || !editorPosition || !shellRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    editorDragRef.current = {
      pointerId: event.pointerId,
      left: editorPosition.left,
      top: editorPosition.top,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function moveEditor(event) {
    const drag = editorDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !shellRef.current) return;
    const shell = shellRef.current;
    const overlay = event.currentTarget.closest(".drawing-pin-editor-overlay");
    const width = overlay?.offsetWidth || 360;
    const height = overlay?.offsetHeight || 360;
    setEditorDragPosition({
      left: Math.min(Math.max(12, drag.left + event.clientX - drag.x), Math.max(12, shell.clientWidth - width - 12)),
      top: Math.min(Math.max(52, drag.top + event.clientY - drag.y), Math.max(52, shell.clientHeight - height - 12)),
    });
  }

  function finishEditorDrag(event) {
    if (editorDragRef.current?.pointerId === event.pointerId) editorDragRef.current = null;
  }

  return (
    <div ref={connectShellElement} className={`drawing-pdf-shell${placing ? " is-placing" : ""}${fullscreen.active ? " is-fullscreen" : ""}`}>
      <div className="drawing-zoom-controls" aria-label="PDF zoom">
        <button type="button" className="icon-btn" title="Vorige pagina" aria-label="Vorige pagina" disabled={pageNumber <= 1} onClick={onPreviousPage}><ChevronLeft size={18} /></button>
        <span className="drawing-zoom-controls__page" title={`Pagina ${pageNumber} van ${pageCount}`}>{pageNumber}/{pageCount}</span>
        <button type="button" className="icon-btn" title="Volgende pagina" aria-label="Volgende pagina" disabled={pageNumber >= pageCount} onClick={onNextPage}><ChevronRight size={18} /></button>
        <span className="drawing-zoom-controls__divider" aria-hidden="true" />
        <button type="button" className="icon-btn" title="Inzoomen" onClick={() => setZoom((current) => current + 0.2)}>+</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="icon-btn" title="Uitzoomen" onClick={() => setZoom((current) => current - 0.2)}>−</button>
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
      {placing ? <div className="drawing-placement-hint">Klik op de juiste plaats in de tekening.</div> : null}
      {/* Wheel input is reserved for normal viewport scrolling; zoom is
          deliberately controlled by the visible buttons. */}
      <div
        ref={viewportRef}
        className="drawing-pdf-viewport"
        {...viewerHandlers}
      >
      <div className="drawing-pdf-page-zoom-frame" style={{ width: pageSize.width ? pageSize.width * zoom : "auto", height: pageSize.height ? pageSize.height * zoom : "auto" }}>
      <div className="drawing-pdf-page" style={{ width: pageSize.width || "auto", height: pageSize.height || "auto", transform: `scale(${zoom})`, transformOrigin: "top left" }}>
        <canvas ref={canvasRef} aria-label={`PDF pagina ${pageNumber}`} />
        <div
          ref={connectLayerElement}
          className="drawing-pin-layer"
          role={placing ? "button" : undefined}
          tabIndex={placing ? 0 : -1}
          aria-label={placing ? "Klik op de tekening om een pin te plaatsen" : "Pins op de tekening"}
          onClick={handlePlacement}
          onContextMenu={openQuickMenu}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" || readOnly || placing) return;
            // Een tweede vinger betekent knijpen; dan is er geen lange druk meer in de maak.
            if (longPressRef.current) { cancelLongPress(); return; }

            const position = positionFromEvent(event);
            if (!position) return;
            const triggerElement = event.currentTarget;

            longPressRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              timer: window.setTimeout(() => {
                showQuickMenu(position, triggerElement);
                longPressRef.current = null;
              }, LONG_PRESS_MS),
            };
          }}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onPointerMove={(event) => {
            // Een vinger op glas staat nooit helemaal stil. Zonder speling ging de lange druk
            // bij twee pixels trilling al verloren; dat is precies wat er op de tablet misging.
            const press = longPressRef.current;
            if (!press || press.pointerId !== event.pointerId) return;
            if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= LONG_PRESS_SLOP) return;
            cancelLongPress();
          }}
        >
          {pagePins.map((pin) => (
            <span
              key={pin.drawing_pin_id}
              className="drawing-pin-anchor drawing-pin-anchor--pin"
              style={{ left: `${Number(pin.x_normalized) * 100}%`, top: `${Number(pin.y_normalized) * 100}%`, "--drawing-marker-scale": markerScale }}
            >
            <button
              type="button"
              className={`drawing-pin drawing-pin--${String(pin.pin_kind || "NOTE").toLowerCase()}${pin.pin_status === "HISTORICAL" ? " is-historical" : ""}${pin.drawing_pin_id === selectedPinId ? " is-selected" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                if (dragRef.current?.moved) { dragRef.current = null; return; }
                onSelect?.(pin, positionFromEvent(event));
              }}
              onPointerDown={(event) => {
                if (readOnly || placing || !event.ctrlKey || event.button !== 0) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                dragRef.current = { pin, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
                onPinDragStart?.(pin);
              }}
              onPointerMove={(event) => {
                if (!dragRef.current || dragRef.current.pointerId !== event.pointerId || dragRef.current.pin.drawing_pin_id !== pin.drawing_pin_id) return;
                if (!dragRef.current.moved && Math.hypot(event.clientX - dragRef.current.startX, event.clientY - dragRef.current.startY) < 4) return;
                const rect = layerRef.current.getBoundingClientRect();
                const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
                dragRef.current.moved = true;
                dragRef.current.position = { x_normalized: x, y_normalized: y, page_number: pageNumber };
                onMove?.(pin, { x_normalized: x, y_normalized: y, page_number: pageNumber });
              }}
              onPointerUp={(event) => {
                if (dragRef.current?.pointerId === event.pointerId && dragRef.current?.pin.drawing_pin_id === pin.drawing_pin_id) {
                  if (dragRef.current.moved) onMoveEnd?.(pin, dragRef.current.position);
                  dragRef.current = null;
                }
              }}
              onPointerCancel={() => { dragRef.current = null; }}
              title={`${PIN_TYPE_META[pin.pin_kind]?.label || "Opmerking"}: ${pin.label}. Houd Ctrl ingedrukt en sleep om te verplaatsen.`}
              aria-label={`Pin ${pin.label}`}
            >
              {(() => { const Icon = PIN_TYPE_META[pin.pin_kind]?.Icon || MessageSquareMoreIcon; return <Icon className="drawing-pin__icon" size={19} aria-hidden="true" />; })()}
            </button>
            </span>
          ))}
          {selectedPinId && selectedPin && Number(selectedPin.page_number) === Number(pageNumber) ? (
            <span
              key={`${selectedPinId}-${pageNumber}`}
              className="drawing-pin-anchor drawing-pin-anchor--indicator"
              style={{ left: `${Number(selectedPin.x_normalized) * 100}%`, top: `${Number(selectedPin.y_normalized) * 100}%`, "--drawing-marker-scale": markerScale }}
            >
              <div className="drawing-pin-focus-indicator" role="status" aria-live="polite">
                <span>Deze pin</span>
              </div>
            </span>
          ) : null}
          {editorOpen && selectedPin && Number(selectedPin.page_number) === Number(pageNumber) ? (
            <span
              className="drawing-pin-anchor drawing-pin-anchor--tooltip"
              style={{ left: `${Number(selectedPin.x_normalized) * 100}%`, top: `${Number(selectedPin.y_normalized) * 100}%`, "--drawing-marker-scale": markerScale }}
            >
              <div className="drawing-pin-tooltip" role="status">
                <strong>{PIN_TYPE_META[selectedPin.pin_kind]?.label || "Markering"}</strong>
                <span>{selectedPin.label}</span>
                {selectedPin.description ? <small>{selectedPin.description}</small> : null}
                {selectedPin.pin_status === "HISTORICAL" ? <small>Historisch</small> : null}
              </div>
            </span>
          ) : null}
          {editorOpen && draft && !draft.drawing_pin_id && Number(draft.page_number) === Number(pageNumber) ? (
            <span
              key="drawing-pin-preview"
              className="drawing-pin-anchor drawing-pin-anchor--preview"
              style={{ left: `${Number(draft.x_normalized) * 100}%`, top: `${Number(draft.y_normalized) * 100}%`, "--drawing-marker-scale": markerScale }}
            >
            <button
              type="button"
              className="drawing-pin-preview" 
              aria-label="Nieuwe markering; houd Ctrl ingedrukt en sleep om te verplaatsen"
              title="Houd Ctrl ingedrukt en sleep om deze nieuwe markering te verplaatsen"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => {
                if (!event.ctrlKey || event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                dragRef.current = { draft: true, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
              }}
              onPointerMove={(event) => {
                if (!dragRef.current?.draft || dragRef.current.pointerId !== event.pointerId || !layerRef.current) return;
                if (!dragRef.current.moved && Math.hypot(event.clientX - dragRef.current.startX, event.clientY - dragRef.current.startY) < 4) return;
                const rect = layerRef.current.getBoundingClientRect();
                const position = {
                  x_normalized: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
                  y_normalized: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
                  page_number: pageNumber,
                };
                dragRef.current.moved = true;
                onDraftMove?.(position);
              }}
              onPointerUp={(event) => {
                if (dragRef.current?.draft && dragRef.current.pointerId === event.pointerId) dragRef.current = null;
              }}
              onPointerCancel={() => { dragRef.current = null; }}
            >
              <div className="drawing-pin-preview__icon"><MapPinPlusInsideIcon animate size={34} aria-hidden="true" /></div>
              <span>Nieuwe markering</span>
            </button>
            </span>
          ) : null}
        </div>
      </div>
      </div>
      </div>
      {!readOnly && !placing ? (
        <button
          type="button"
          className="drawing-quick-menu-fallback"
          aria-label="Snelmenu voor een pin openen"
          title="Pin, opmerking of tekortkoming toevoegen"
          onClick={(event) => {
            event.stopPropagation();
            const position = positionAtVisibleCentre();
            if (position) showQuickMenu(position, event.currentTarget);
          }}
        ><MoreVertical size={19} /></button>
      ) : null}

      <EmberRadialActionMenu
        open={Boolean(quickMenu)}
        anchorPosition={quickMenu ? { x: quickMenu.shell_x, y: quickMenu.shell_y } : null}
        actions={DRAWING_QUICK_ACTIONS}
        onSelect={(action) => runQuickAction(action.id)}
        onClose={closeQuickMenu}
        ariaLabel="Tekeningactie"
        resolvedTheme={resolvedTheme}
        boundaryElement={boundaryElement}
      />

      {rendering ? <div className="drawing-pdf-loading">PDF-pagina laden...</div> : null}
      {editorOpen && editorContent && editorPosition ? (
        <div
          className="drawing-pin-editor-overlay"
          style={{ left: editorPosition.left, top: editorPosition.top }}
          role="dialog"
          aria-label={draft?.drawing_pin_id ? "Markering bewerken" : "Nieuwe markering"}
          onPointerDown={(event) => {
            if (event.target.closest?.(".drawing-pin-editor__drag-handle")) startEditorDrag(event);
          }}
          onPointerMove={moveEditor}
          onPointerUp={finishEditorDrag}
          onPointerCancel={finishEditorDrag}
        >
          {editorContent}
        </div>
      ) : null}
    </div>
  );
}

function PinKindPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const options = Object.entries(PIN_TYPE_META);
  const selected = PIN_TYPE_META[value] || PIN_TYPE_META.NOTE;

  return (
    <div className="drawing-pin-kind-picker">
      <button type="button" className="drawing-pin-kind-picker__trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{selected.label}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="drawing-pin-kind-picker__menu" role="listbox" aria-label="Type markering">
          {options.map(([kind, meta]) => {
            const Icon = meta.Icon;
            return (
              <button key={kind} type="button" role="option" aria-selected={kind === value} className={kind === value ? "is-selected" : ""} onClick={() => { onChange(kind); setOpen(false); }}>
                <Icon size={18} aria-hidden="true" />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// Standaard hoort bij het soort markering. Een tekortkoming die niemand opvolgt is geen
// tekortkoming; een opmerking of een geplaatst component is juist zelden werk.
function followUpDefaultForKind(pinKind) {
  return String(pinKind || "NOTE").toUpperCase() === "DEFICIENCY";
}

function PinEditor({ draft, isExisting, busy, floating, canCreateFollowUp, onToggleFloating, onChange, onSave, onDelete, onCancel }) {
  const requiresDescription = draft?.pin_kind === "COMPONENT_PLACED";
  const descriptionMissing = requiresDescription && !String(draft?.description || "").trim();
  const canSave = Boolean(String(draft?.label || "").trim()) && !descriptionMissing;
  useEffect(() => {
    if (!draft) return undefined;
    const onKeyDown = (event) => {
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!busy && canSave) onSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, canSave, draft, onSave]);
  if (!draft) return null;
  return (
    <div className="drawing-pin-editor">
      <div className={`drawing-pin-editor__head${floating ? " drawing-pin-editor__drag-handle" : ""}`} title={floating ? "Sleep om dit venster te verplaatsen" : undefined}>
        <div className="drawing-pin-editor__title">
          <strong>{isExisting ? "Markering bewerken" : "Nieuwe markering"}</strong>
          <span className="ember-label ember-label--muted">Pagina {draft.page_number}</span>
        </div>
        <button
          type="button"
          className="icon-btn drawing-pin-editor__dock-toggle"
          title={floating ? "Vastzetten in rechterpaneel" : "Zwevend maken boven de tekening"}
          aria-label={floating ? "Vastzetten in rechterpaneel" : "Zwevend maken boven de tekening"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onToggleFloating}
        >
          {floating ? <Pin size={17} /> : <PinOff size={17} />}
        </button>
      </div>
      <label className="admin-field">
        <span>Type</span>
        <PinKindPicker
          value={draft.pin_kind || "NOTE"}
          onChange={(pin_kind) =>
            onChange(
              draft.follow_up_touched
                ? { pin_kind }
                : { pin_kind, create_follow_up: followUpDefaultForKind(pin_kind) }
            )
          }
        />
      </label>
      {draft.pin_kind === "COMPONENT_PLACED" ? (
        <label className="admin-field">
          <span>Status</span>
          <select value={draft.pin_status || "ACTIVE"} onChange={(event) => onChange({ pin_status: event.target.value })}>
            <option value="ACTIVE">Actief</option>
            <option value="HISTORICAL">Historisch</option>
          </select>
        </label>
      ) : null}
      <label className="admin-field">
        <span>Label</span>
        <input value={draft.label || ""} maxLength={200} onChange={(event) => onChange({ label: event.target.value })} />
      </label>
      <label className={`admin-field drawing-pin-description${descriptionMissing ? " is-required-attention" : ""}`}>
        <span>Omschrijving{requiresDescription ? " *" : ""}</span>
        <textarea aria-required={requiresDescription ? "true" : undefined} rows={3} value={draft.description || ""} maxLength={2000} onChange={(event) => onChange({ description: event.target.value })} />
        {descriptionMissing ? <small>Beschrijf welk component op de volgende tekenrevisie moet worden verwerkt.</small> : null}
      </label>
      {canCreateFollowUp && !isExisting ? (
        <label className={`ember-toggle drawing-pin-editor__follow-up ${draft.create_follow_up ? "is-on" : "is-off"}`}>
          <input
            type="checkbox"
            checked={Boolean(draft.create_follow_up)}
            onChange={(event) => onChange({ create_follow_up: event.target.checked, follow_up_touched: true })}
          />
          <span className="ember-toggle__track"><span className="ember-toggle__thumb" /></span>
          <span className="ember-toggle__label">
            Hier een opvolgpunt van maken
            <small>Label en omschrijving worden overgenomen. Prioriteit, termijn en wat de klant ziet stelt de behandelaar in de Monitor in.</small>
          </span>
        </label>
      ) : null}

      <div className="drawing-pin-editor__position">
        x {Number(draft.x_normalized).toFixed(4)}; y {Number(draft.y_normalized).toFixed(4)}
      </div>
      <div className="drawing-pin-editor__actions">
        <button type="button" className="btn btn-primary" title="Opslaan (Alt+S)" disabled={busy || !canSave} onClick={onSave}>
          {busy ? "Opslaan..." : "Opslaan"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Annuleren</button>
        {isExisting ? (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onDelete}>Pin verwijderen</button>
        ) : null}
      </div>
    </div>
  );
}

function PinActions({ code, pin, actions, busy, onChanged }) {
  const [selectedActionId, setSelectedActionId] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const linkedIds = new Set((pin.follow_up_actions || []).map((item) => String(item.follow_up_action_id)));
  const available = actions.filter((item) => !linkedIds.has(String(item.follow_up_action_id)));
  const disabled = busy || working;

  // Het aanmaakformulier met zeven velden stond hier; dat is weg. Een opvolgpunt ontstaat nu
  // bij het plaatsen van de markering zelf, of met deze ene knop voor een markering die er al
  // staat. Prioriteit, termijn, verantwoordelijke en wat de klant ziet horen bij de behandelaar
  // in de Monitor, waar die velden al bestaan; op een ladder is dat geen invulwerk.
  async function run(action) {
    if (disabled) return;
    setWorking(true);
    setError("");
    try {
      await action();
    } catch (requestError) {
      setError(requestError?.message || String(requestError));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="drawing-pin-actions">
      <strong className="drawing-pin-actions__title"><BriefcaseBusiness size={16} aria-hidden="true" /> Gekoppelde opvolgingen</strong>

      {(pin.follow_up_actions || []).length ? (
        <div className="drawing-pin-actions__list">
          {pin.follow_up_actions.map((action) => (
            <div key={action.follow_up_action_id} className="drawing-pin-action-row">
              <div>
                <strong>{action.workflow_title}</strong>
                <span>{action.status}; {action.priority}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                disabled={disabled}
                title="Koppeling verwijderen"
                onClick={() => run(async () => {
                  await unlinkDrawingPinAction(code, pin.drawing_pin_id, action.follow_up_action_id);
                  await onChanged?.();
                })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : <span className="muted">Nog geen opvolging gekoppeld.</span>}

      <button
        type="button"
        className="btn btn-primary"
        disabled={disabled || !String(pin.label || "").trim()}
        onClick={() => run(async () => {
          await createManualFollowUpForDrawingPin(code, pin.drawing_pin_id, {
            title: pin.label,
            description: pin.description || "",
          });
          await onChanged?.({ reloadDirectory: true });
        })}
      >
        {working ? "Bezig..." : "Opvolgpunt maken van deze markering"}
      </button>

      <div className="drawing-pin-actions__link">
        <select value={selectedActionId} disabled={disabled} onChange={(event) => setSelectedActionId(event.target.value)}>
          <option value="">Bestaande opvolging kiezen</option>
          {available.map((action) => (
            <option key={action.follow_up_action_id} value={action.follow_up_action_id}>
              {action.workflow_title}; {action.status}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled || !selectedActionId}
          onClick={() => run(async () => {
            await linkDrawingPinAction(code, pin.drawing_pin_id, selectedActionId);
            setSelectedActionId("");
            await onChanged?.();
          })}
        >
          Koppelen
        </button>
      </div>

      {error ? <div className="ember-alert ember-alert--warning">{error}</div> : null}
    </div>
  );
}

export default function DrawingPinsTab({ code, readOnly = false, navigationTarget = null, onOpenFollowUp, embedded = false, onLinked, onBusyChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Gezet wanneer de gebruiker vanuit een opvolgpunt hierheen is gestuurd om de locatie
  // te bepalen. De pin die hij plaatst wordt dan meteen aan dat punt gekoppeld, en
  // daarna keert hij terug naar waar hij vandaan kwam.
  const linkActionId = String(navigationTarget?.linkActionId || (!embedded && searchParams.get("linkAction")) || "").trim();
  const returnTo = String(searchParams.get("returnTo") || "").trim();

  const [directory, setDirectory] = useState({ drawings: [], follow_up_actions: [], primary_drawing_document_id: null });
  const [selectedDocumentId, setSelectedDocumentId] = useState(() => String(navigationTarget?.documentId || (!embedded && searchParams.get("drawing")) || ""));
  const [pins, setPins] = useState([]);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageNumber, setPageNumber] = useState(() => Math.max(1, Number(navigationTarget?.pageNumber || (!embedded && searchParams.get("page")) || 1)));
  const [selectedPinId, setSelectedPinId] = useState(() => String(navigationTarget?.pinId || (!embedded && searchParams.get("pin")) || ""));
  const [draft, setDraft] = useState(null);
  const [placing, setPlacing] = useState(Boolean(navigationTarget?.startPlacing));
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(Boolean(embedded && navigationTarget?.pinId));
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFloating, setEditorFloating] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [primaryCandidateId, setPrimaryCandidateId] = useState("");
  const [primaryNotice, setPrimaryNotice] = useState("");
  const [revisionPreview, setRevisionPreview] = useState(null);
  const [revisionCopyAcknowledged, setRevisionCopyAcknowledged] = useState(false);
  const helpIconRef = useRef(null);

  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const selectedDrawing = directory.drawings.find((item) => String(item.document_id) === selectedDocumentId) || null;
  const primaryDrawing = directory.drawings.find((item) => item.is_primary_drawing) || null;
  const primaryCandidate = directory.drawings.find((item) => String(item.document_id) === primaryCandidateId) || null;
  const selectedPin = pins.find((item) => String(item.drawing_pin_id) === selectedPinId) || null;
  const componentReview = Boolean(navigationTarget?.componentReview) || (!embedded && searchParams.get("componentReview") === "1");
  const componentReviewPins = (directory.pins || []).filter((pin) => pin.pin_kind === "COMPONENT_PLACED" && String(pin.pin_status || "").toUpperCase() === "ACTIVE");
  const componentReviewIndex = Math.max(0, componentReviewPins.findIndex((pin) => String(pin.drawing_pin_id) === selectedPinId));
  const previewPins = revisionPreview?.pins || null;

  // Een opvolgpunt aanmaken hoort alleen op de plek waar iemand zelf een bevinding vastlegt.
  // Kom je hier vanuit een formulier om een locatie bij een bestaand punt te zetten, dan is er
  // al een punt en zou een tweede alleen verwarring geven.
  const canCreateFollowUp = !readOnly && !embedded && !linkActionId;

  function openComponentReviewPin(offset) {
    if (!componentReviewPins.length) return;
    const nextIndex = (componentReviewIndex + offset + componentReviewPins.length) % componentReviewPins.length;
    const target = componentReviewPins[nextIndex];
    setSelectedDocumentId(String(target.installation_document_id));
    setPageNumber(Number(target.page_number || 1));
    setSelectedPinId(String(target.drawing_pin_id));
    setDraft(null);
    setEditorOpen(false);
    updateLocation(target.installation_document_id, target.page_number, target.drawing_pin_id);
  }

  async function completeCurrentReviewPin() {
    if (!selectedPin || selectedPin.pin_kind !== "COMPONENT_PLACED" || readOnly) return;
    const nextTarget = componentReviewPins.length > 1 ? componentReviewPins[(componentReviewIndex + 1) % componentReviewPins.length] : null;
    setBusy(true);
    setError("");
    try {
      await updateDrawingPin(code, selectedPin.drawing_pin_id, { ...selectedPin, pin_status: "HISTORICAL" });
      const response = await loadDirectory({ documentId: nextTarget?.installation_document_id || selectedDocumentId });
      if (nextTarget) {
        setSelectedDocumentId(String(nextTarget.installation_document_id));
        setPageNumber(Number(nextTarget.page_number || 1));
        setSelectedPinId(String(nextTarget.drawing_pin_id));
        setDraft(null);
        setEditorOpen(false);
        updateLocation(nextTarget.installation_document_id, nextTarget.page_number, nextTarget.drawing_pin_id);
      } else {
        setSelectedPinId("");
        setDraft(null);
        setEditorOpen(false);
        updateLocation(selectedDocumentId, pageNumber, "");
      }
      await loadPins(nextTarget?.installation_document_id || selectedDocumentId);
      setDirectory(response || { drawings: [], follow_up_actions: [], pins: [] });
    } catch (requestError) {
      setError(requestError?.message || "Componentmarkering verwerken is mislukt.");
      await Promise.all([loadPins(), loadDirectory({ documentId: selectedDocumentId })]).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function updateLocation(documentId, page, pinId = "") {
    if (embedded) return;
    const next = new URLSearchParams(searchParams);
    if (documentId) next.set("drawing", documentId); else next.delete("drawing");
    if (page) next.set("page", String(page)); else next.delete("page");
    if (pinId) next.set("pin", pinId); else next.delete("pin");
    setSearchParams(next, { replace: true });
  }

  async function loadDirectory(options = {}) {
    const response = await getInstallationDrawings(code);
    setDirectory(response || { drawings: [], follow_up_actions: [] });
    const preferred = options.documentId || selectedDocumentId || response?.primary_drawing_document_id || response?.drawings?.[0]?.document_id || "";
    if (preferred && preferred !== selectedDocumentId) setSelectedDocumentId(String(preferred));
    return response;
  }

  async function loadPins(documentId = selectedDocumentId) {
    if (!documentId) {
      setPins([]);
      return;
    }
    const response = await getDrawingPins(code, documentId, showHistory);
    setPins(response?.pins || []);
  }

  useEffect(() => {
    let cancelled = false;
    setDirectoryLoading(true);
    setError("");
    getInstallationDrawings(code)
      .then((response) => {
        if (cancelled) return;
        setDirectory(response || { drawings: [], follow_up_actions: [] });
        setSelectedDocumentId((current) => String(current || response?.primary_drawing_document_id || response?.drawings?.[0]?.document_id || ""));
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.message || String(requestError));
      })
      .finally(() => {
        if (!cancelled) setDirectoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [code]);

  async function confirmPrimaryDrawing() {
    if (!primaryCandidateId || readOnly) return;
    setBusy(true);
    setError("");
    setPrimaryNotice("");
    try {
      const response = await setInstallationPrimaryDrawing(code, primaryCandidateId);
      setDirectory(response || { drawings: [], follow_up_actions: [], primary_drawing_document_id: primaryCandidateId });
      setSelectedDocumentId(String(primaryCandidateId));
      setPrimaryCandidateId("");
      setPrimaryNotice("De hoofdtekening is opgeslagen en wordt voortaan in de FormRunner gebruikt.");
    } catch (requestError) {
      setError(requestError?.message || "Hoofdtekening opslaan is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function openRevisionPinPreview() {
    const sourceDocumentId = String(selectedDrawing?.parent_document_id || "");
    if (!sourceDocumentId || !pdfDocument) return;
    setBusy(true);
    setError("");
    setRevisionCopyAcknowledged(false);
    let sourcePdf = null;
    try {
      const [sourcePinsResponse, sourceDownload, targetPageSizes] = await Promise.all([
        getDrawingPins(code, sourceDocumentId, false),
        downloadInstallationDocumentFile(code, sourceDocumentId),
        readPdfPageSizes(pdfDocument),
      ]);
      sourcePdf = await loadPdfDocument({ data: await sourceDownload.blob.arrayBuffer() }).promise;
      const sourcePageSizes = await readPdfPageSizes(sourcePdf);
      const sourcePins = sourcePinsResponse?.pins || [];
      const comparedPageCount = Math.min(sourcePageSizes.length, targetPageSizes.length);
      const changedPages = [];
      for (let index = 0; index < comparedPageCount; index += 1) {
        const sourceSize = sourcePageSizes[index];
        const targetSize = targetPageSizes[index];
        if (Math.abs(sourceSize.width - targetSize.width) > 1 || Math.abs(sourceSize.height - targetSize.height) > 1) {
          changedPages.push(index + 1);
        }
      }
      const missingPagePins = sourcePins.filter((pin) => Number(pin.page_number) > targetPageSizes.length);
      setRevisionPreview({
        sourceDocumentId,
        pins: sourcePins,
        sourcePageCount: sourcePageSizes.length,
        targetPageCount: targetPageSizes.length,
        changedPages,
        missingPagePinCount: missingPagePins.length,
      });
      setPageNumber(1);
      setSidePanelOpen(false);
      setSelectedPinId("");
      setDraft(null);
      setEditorOpen(false);
      setPlacing(false);
    } catch (requestError) {
      setError(requestError?.message || "Het pinvoorbeeld kon niet worden opgebouwd.");
    } finally {
      await sourcePdf?.destroy?.();
      setBusy(false);
    }
  }

  async function copyRevisionPins() {
    if (!revisionPreview || revisionPreview.missingPagePinCount > 0 || readOnly) return;
    setBusy(true);
    setError("");
    setPrimaryNotice("");
    try {
      const response = await copyDrawingPinsToRevision(
        code,
        revisionPreview.sourceDocumentId,
        selectedDocumentId
      );
      await Promise.all([loadPins(selectedDocumentId), loadDirectory({ documentId: selectedDocumentId })]);
      setRevisionPreview(null);
      setRevisionCopyAcknowledged(false);
      const copied = Number(response?.copied_count || 0);
      const existing = Number(response?.already_copied_count || 0);
      setPrimaryNotice(
        copied > 0
          ? `${copied} pin(s) zijn naar de nieuwe revisie gekopieerd. De oorspronkelijke pins blijven op de vorige revisie bewaard.`
          : `${existing} pin(s) stonden al op deze revisie; er zijn geen duplicaten gemaakt.`
      );
    } catch (requestError) {
      setError(requestError?.message || "Pins kopiëren naar de nieuwe revisie is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedDocumentId) {
      setPins([]);
      setPdfDocument(null);
      return undefined;
    }
    let cancelled = false;
    let activePdf = null;
    setPdfLoading(true);
    setPdfDocument(null);
    setError("");
    downloadInstallationDocumentFile(code, selectedDocumentId)
      .then(async (download) => {
        if (cancelled) return;
        const buffer = await download.blob.arrayBuffer();
        if (cancelled) return;
        activePdf = await loadPdfDocument({ data: buffer }).promise;
        if (cancelled) {
          activePdf?.destroy?.();
          return;
        }
        setPdfDocument(activePdf);
        setPageNumber((current) => Math.min(Math.max(1, current), activePdf.numPages));
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.message || String(requestError));
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });
    return () => {
      cancelled = true;
      activePdf?.destroy?.();
    };
  }, [code, selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId) return undefined;
    let cancelled = false;
    getDrawingPins(code, selectedDocumentId, showHistory)
      .then((response) => { if (!cancelled) setPins(response?.pins || []); })
      .catch((requestError) => { if (!cancelled) setError(requestError?.message || String(requestError)); });
    return () => { cancelled = true; };
  }, [code, selectedDocumentId, showHistory]);

  useEffect(() => {
    if (!selectedPinId || !pins.length) return;
    const target = pins.find((item) => String(item.drawing_pin_id) === selectedPinId);
    if (!target) return;
    setPageNumber(Number(target.page_number));
    setDraft({ ...target });
  }, [pins, selectedPinId]);

  async function savePin() {
    if (!draft || readOnly) return;
    // Onthouden vóór het opslaan; savePointDrawing vervangt de draft door de bewaarde pin en
    // daar zit deze keuze niet in.
    const wantsFollowUp = Boolean(draft.create_follow_up) && !draft.drawing_pin_id && canCreateFollowUp;
    const followUpTitle = String(draft.label || "").trim();
    const followUpDescription = String(draft.description || "");
    setBusy(true);
    setError("");
    try {
      const savedPin = await savePointDrawing({
        draft, code, documentId: selectedDocumentId, actionId: linkActionId,
        createPin: createDrawingPin, updatePin: updateDrawingPin, linkPin: linkDrawingPinAction,
        onSaved: (pin) => { setDraft(pin); setSelectedPinId(String(pin.drawing_pin_id)); },
      });
      if (linkActionId && onLinked) {
        onLinked(savedPin);
        return;
      }

      // De markering staat er; lukt het punt niet, dan zegt de melding dat en hoeft niemand
      // opnieuw te gaan prikken. De knop bij de markering blijft over om het af te maken.
      if (wantsFollowUp && savedPin?.drawing_pin_id) {
        try {
          await createManualFollowUpForDrawingPin(code, savedPin.drawing_pin_id, {
            title: followUpTitle,
            description: followUpDescription,
          });
        } catch {
          setError("De markering is opgeslagen, maar het opvolgpunt niet. Gebruik Opvolgpunt maken van deze markering; opnieuw prikken is niet nodig.");
        }
      }

      setPlacing(false);
      await Promise.all([loadPins(), loadDirectory({ documentId: selectedDocumentId })]);

      if (!embedded && linkActionId && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        navigate(returnTo);
        return;
      }
    } catch (requestError) {
      setError(requestError?.message || String(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function linkSelectedPin() {
    if (!selectedPin || !linkActionId || readOnly || busy) return;
    setBusy(true);
    setError("");
    try {
      await linkDrawingPinAction(code, selectedPin.drawing_pin_id, linkActionId);
      onLinked?.(selectedPin);
    } catch (requestError) {
      setError(requestError?.message || "Koppelen is niet gelukt. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMovedPin(pin, position) {
    if (!pin?.drawing_pin_id || readOnly) return;
    setBusy(true);
    setError("");
    try {
      const response = await updateDrawingPin(code, pin.drawing_pin_id, { ...pin, ...position });
      const updatedPin = response?.pin
        ? { ...pin, ...response.pin, follow_up_actions: pin.follow_up_actions || [] }
        : { ...pin, ...position };
      setPins((current) => current.map((item) => String(item.drawing_pin_id) === String(pin.drawing_pin_id) ? updatedPin : item));
      setDraft((current) => String(current?.drawing_pin_id) === String(pin.drawing_pin_id) ? updatedPin : current);
    } catch (requestError) {
      setError(requestError?.message || String(requestError));
      try {
        await loadPins();
      } catch {
        // Keep the original update error visible; a later refresh can retry the read.
      }
    } finally {
      setBusy(false);
    }
  }

  function closeEditor() {
    setDraft(null);
    setSelectedPinId("");
    setPlacing(false);
    setEditorOpen(false);
    updateLocation(selectedDocumentId, pageNumber, "");
  }

  function toggleEditorFloating() {
    setEditorFloating((current) => {
      const next = !current;
      if (!next) setSidePanelOpen(true);
      return next;
    });
  }

  const pinEditor = editorOpen && draft ? (
    <PinEditor
      draft={draft}
      isExisting={Boolean(draft?.drawing_pin_id)}
      busy={busy}
      floating={editorFloating}
      canCreateFollowUp={canCreateFollowUp}
      onToggleFloating={toggleEditorFloating}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onSave={savePin}
      onDelete={removePin}
      onCancel={closeEditor}
    />
  ) : null;

  async function removePin() {
    if (!draft?.drawing_pin_id || readOnly) return;
    if (!window.confirm(`Pin "${draft.label}" verwijderen?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteDrawingPin(code, draft.drawing_pin_id, draft.row_version);
      setDraft(null);
      setSelectedPinId("");
      updateLocation(selectedDocumentId, pageNumber, "");
      await Promise.all([loadPins(), loadDirectory({ documentId: selectedDocumentId })]);
    } catch (requestError) {
      setError(requestError?.message || String(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function refreshLinks(options = {}) {
    setBusy(true);
    setError("");
    try {
      await loadPins();
      if (options.reloadDirectory) await loadDirectory({ documentId: selectedDocumentId });
    } catch (requestError) {
      setError(requestError?.message || String(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (directoryLoading && !directory.drawings.length) return <DrawingLoadingCard />;

  return (
    <div className="drawing-pins-tab">
      {embedded && linkActionId ? <div className="ember-alert ember-alert--info">
        <strong>{navigationTarget?.label || "Locatie bij opvolgactie"}</strong>
        <div>Kies een tekening en plaats een pin, of klik een bestaande pin aan om die te koppelen.</div>
        {selectedPin ? <button type="button" className="btn btn-primary" disabled={busy || readOnly} onClick={linkSelectedPin}>Deze pin koppelen</button> : null}
      </div> : null}
      <div className="drawing-pins-toolbar">
        <label className="admin-field drawing-pins-toolbar__select">
          <span>PDF-tekening</span>
          <select
            value={selectedDocumentId}
            onChange={(event) => {
              const value = event.target.value;
              setRevisionPreview(null);
              setRevisionCopyAcknowledged(false);
              setSelectedDocumentId(value);
              setPageNumber(1);
              setSelectedPinId("");
              setDraft(null);
              setPlacing(false);
              setEditorFloating(false);
              updateLocation(value, 1, "");
            }}
          >
            <option value="">Kies een tekening</option>
            {directory.drawings.map((drawing) => (
              <option key={drawing.document_id} value={drawing.document_id}>
                {drawing.title || drawing.file_name || drawing.document_type_name}; {drawing.pin_count} pin(s){drawing.is_primary_drawing ? "; hoofdtekening" : ""}{drawing.is_current_version === false ? "; historische versie" : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedDrawing ? (
          <div className="drawing-pins-toolbar__meta">
            <strong>{selectedDrawing.title || selectedDrawing.file_name}</strong>
            <span>{selectedDrawing.file_name}; {selectedDrawing.document_type_name}</span>
            {selectedDrawing.is_primary_drawing ? <span className="ember-label ember-label--success">Hoofdtekening</span> : null}
            {selectedDrawing.is_current_version === false ? <span className="ember-label ember-label--muted">Historische PDF-versie</span> : null}
          </div>
        ) : null}
        <div className="drawing-pins-help-wrap">
          <button
            type="button"
            className="icon-btn"
            title="Info over tekeningen en pins"
            aria-label="Info over tekeningen en pins"
            aria-expanded={helpOpen}
            aria-controls="drawing-pins-help-panel"
            onClick={() => setHelpOpen((current) => !current)}
            onMouseEnter={() => helpIconRef.current?.startAnimation?.()}
            onMouseLeave={() => helpIconRef.current?.stopAnimation?.()}
          >
            <CircleHelpIcon ref={helpIconRef} size={18} className="nav-anim-icon" />
          </button>
          {helpOpen ? (
            <div id="drawing-pins-help-panel" className="panel drawing-pins-help-panel" role="dialog" aria-label="Info tekeningen en pins">
              <div className="muted">Klik een bestaande pin aan om de details te bekijken of te wijzigen. Houd Ctrl ingedrukt en sleep een pin om de locatie te wijzigen. Gebruik de rechtermuisknop op de tekening voor een nieuwe markering. Component geplaatst blijft actief totdat de component in een volgende tekenrevisie is verwerkt.</div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={Boolean(revisionPreview) || readOnly || !selectedDocumentId || !pdfDocument || selectedDrawing?.is_current_version === false}
          onClick={() => {
            setDraft(null);
            setSelectedPinId("");
            setEditorOpen(false);
            setPlacing(true);
          }}
        >
          Nieuwe pin plaatsen
        </button>
        {!readOnly && selectedDrawing && selectedDrawing.is_drawing_type && selectedDrawing.is_current_version !== false && !selectedDrawing.is_primary_drawing ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setPrimaryCandidateId(String(selectedDrawing.document_id))}>
            Als hoofdtekening gebruiken
          </button>
        ) : null}
        <label className={`ember-toggle ${showHistory ? "is-on" : "is-off"}`} title="Toon of verberg historische componentpins en tekenversies">
          <input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} />
          <span className="ember-toggle__track"><span className="ember-toggle__thumb" /></span>
          <span className="ember-toggle__label">Toon geschiedenis</span>
        </label>
      </div>

      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {primaryNotice ? <div className="ember-alert ember-alert--success">{primaryNotice}</div> : null}
      {primaryCandidate ? (
        <div className="ember-alert ember-alert--warning drawing-primary-confirm" role="dialog" aria-label="Hoofdtekening wijzigen">
          <div>
            <strong>Deze tekening voortaan overal gebruiken?</strong>
            <div>
              Ember opent dan <strong>{primaryCandidate.title || primaryCandidate.file_name}</strong> automatisch in de FormRunner.
              {primaryDrawing?.pin_count
                ? ` De ${primaryDrawing.pin_count} bestaande pin(s) op ${primaryDrawing.title || primaryDrawing.file_name} blijven veilig aan die exacte PDF-versie gekoppeld en worden niet automatisch verplaatst.`
                : ""}
            </div>
          </div>
          <div className="drawing-primary-confirm__actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setPrimaryCandidateId("")}>Annuleren</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={confirmPrimaryDrawing}>{busy ? "Opslaan..." : "Hoofdtekening opslaan"}</button>
          </div>
        </div>
      ) : null}
      {readOnly ? <div className="ember-alert ember-alert--warning">{embedded ? "Deze gekoppelde locatie is hier alleen te bekijken." : "Deze historische installatie is alleen-lezen."}</div> : null}
      {selectedDrawing?.is_current_version === false ? <div className="ember-alert ember-alert--info">Deze pinnen blijven gekoppeld aan de exacte historische PDF-versie. Nieuwe pins kunnen alleen op de actuele tekenversie worden geplaatst.</div> : null}
      {selectedDrawing?.is_current_version !== false && selectedDrawing?.parent_document_id && selectedDrawing?.previous_version_pin_count > 0 ? (
        <div className="ember-alert ember-alert--info drawing-replacement-notice">
          <div>
            <strong>Nieuwe tekenversie actief</strong>
            <div>{selectedDrawing.previous_version_pin_count} pin(s) staan op de vorige revisie. Bekijk eerst hoe deze pins op de nieuwe PDF uitkomen en kopieer ze daarna indien gewenst.</div>
          </div>
          <div className="drawing-replacement-notice__actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={openRevisionPinPreview}>Voorbeeld op nieuwe revisie</button>
            <button type="button" className="btn btn-secondary" onClick={() => {
              const previousId = String(selectedDrawing.parent_document_id);
              setRevisionPreview(null);
              setSelectedDocumentId(previousId);
              setPageNumber(1);
              setSelectedPinId("");
              setDraft(null);
              setShowHistory(true);
              updateLocation(previousId, 1, "");
            }}>Vorige revisie bekijken</button>
          </div>
        </div>
      ) : null}
      {revisionPreview ? (
        <div className="ember-alert ember-alert--warning drawing-revision-preview" role="region" aria-label="Voorbeeld pins op nieuwe revisie">
          <div>
            <strong>Voorbeeld; {revisionPreview.pins.length} pin(s) op de nieuwe revisie</strong>
            <div>De pins hieronder zijn nog niet gekopieerd. Controleer hun positie op iedere relevante pagina.</div>
            {revisionPreview.sourcePageCount !== revisionPreview.targetPageCount ? (
              <div><strong>Let op:</strong> de vorige revisie heeft {revisionPreview.sourcePageCount} pagina('s), de nieuwe {revisionPreview.targetPageCount}.</div>
            ) : null}
            {revisionPreview.changedPages.length ? (
              <div><strong>Let op:</strong> de pagina-afmetingen verschillen op pagina {revisionPreview.changedPages.join(", ")}. Controleer de positie extra zorgvuldig.</div>
            ) : null}
            {revisionPreview.missingPagePinCount > 0 ? (
              <div><strong>Kopiëren geblokkeerd:</strong> {revisionPreview.missingPagePinCount} pin(s) staan op een pagina die niet voorkomt in de nieuwe revisie.</div>
            ) : null}
          </div>
          <div className="drawing-revision-preview__actions">
            {(revisionPreview.changedPages.length > 0 || revisionPreview.sourcePageCount !== revisionPreview.targetPageCount) && revisionPreview.missingPagePinCount === 0 ? (
              <label className="drawing-revision-preview__acknowledge">
                <input type="checkbox" checked={revisionCopyAcknowledged} onChange={(event) => setRevisionCopyAcknowledged(event.target.checked)} />
                <span>Ik heb de afwijkingen en pinposities gecontroleerd</span>
              </label>
            ) : null}
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setRevisionPreview(null); setRevisionCopyAcknowledged(false); }}>Voorbeeld sluiten</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || revisionPreview.missingPagePinCount > 0 || ((revisionPreview.changedPages.length > 0 || revisionPreview.sourcePageCount !== revisionPreview.targetPageCount) && !revisionCopyAcknowledged)}
              onClick={copyRevisionPins}
            >
              {busy ? "Kopiëren..." : "Pins kopiëren naar nieuwe revisie"}
            </button>
          </div>
        </div>
      ) : null}

      {!directory.drawings.length ? (
        <div className="ui-empty">Geen actieve PDF-tekeningen in het installatiedossier.</div>
      ) : null}

      {selectedDocumentId && pdfLoading && !pdfDocument ? <DrawingLoadingCard label="De gekozen PDF wordt gedownload en opgebouwd." /> : null}

      {selectedDocumentId && pdfDocument ? (
        <div className={`drawing-pins-workspace${sidePanelOpen ? "" : " is-side-panel-collapsed"}`}>
          <div className="drawing-pins-canvas-column">
            <div className="drawing-page-navigation">
              <button type="button" className="btn btn-secondary" disabled={pageNumber <= 1} onClick={() => { const next = pageNumber - 1; setPageNumber(next); updateLocation(selectedDocumentId, next, selectedPinId); }}>Vorige</button>
              <span>Pagina {pageNumber} van {pdfDocument.numPages}</span>
              <button type="button" className="btn btn-secondary" disabled={pageNumber >= pdfDocument.numPages} onClick={() => { const next = pageNumber + 1; setPageNumber(next); updateLocation(selectedDocumentId, next, selectedPinId); }}>Volgende</button>
              <button type="button" className="icon-btn drawing-side-panel-toggle" disabled={Boolean(revisionPreview)} title={sidePanelOpen ? "Rechterpaneel inklappen" : "Rechterpaneel uitklappen"} aria-label={sidePanelOpen ? "Rechterpaneel inklappen" : "Rechterpaneel uitklappen"} onClick={() => setSidePanelOpen((current) => !current)}>{sidePanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>
            </div>
            <PdfPinViewer
              pdfDocument={pdfDocument}
              pageNumber={pageNumber}
              pageCount={pdfDocument.numPages}
              pins={previewPins || pins}
              selectedPinId={revisionPreview ? "" : selectedPinId}
              selectedPin={revisionPreview ? null : selectedPin}
              componentReview={revisionPreview ? false : componentReview}
              draft={revisionPreview ? null : draft}
              editorOpen={revisionPreview ? false : editorOpen}
              editorContent={revisionPreview ? null : (editorFloating ? pinEditor : null)}
              placing={revisionPreview ? false : placing}
              readOnly={Boolean(revisionPreview) || readOnly || selectedDrawing?.is_current_version === false}
              onPreviousPage={() => {
                const next = Math.max(1, pageNumber - 1);
                setPageNumber(next);
                updateLocation(selectedDocumentId, next, selectedPinId);
              }}
              onNextPage={() => {
                const next = Math.min(pdfDocument.numPages, pageNumber + 1);
                setPageNumber(next);
                updateLocation(selectedDocumentId, next, selectedPinId);
              }}
              onPlace={(position) => {
                setPlacing(false);
                setEditorFloating(false);
                setSidePanelOpen(true);
                const placedKind = navigationTarget?.pinKind || "NOTE";
                setDraft({ ...position, label: navigationTarget?.label || "", description: navigationTarget?.description || "", pin_kind: placedKind, pin_status: "ACTIVE", create_follow_up: canCreateFollowUp && followUpDefaultForKind(placedKind) });
                setEditorOpen(true);
              }}
              onSelect={revisionPreview ? () => undefined : (pin) => {
                setSelectedPinId(String(pin.drawing_pin_id));
                setDraft({ ...pin });
                setPlacing(false);
                setEditorFloating(false);
                setSidePanelOpen(true);
                setEditorOpen(true);
                updateLocation(selectedDocumentId, pin.page_number, pin.drawing_pin_id);
              }}
              onMove={(pin, position) => {
                setSelectedPinId(String(pin.drawing_pin_id));
                setPins((current) => current.map((item) => String(item.drawing_pin_id) === String(pin.drawing_pin_id) ? { ...item, ...position } : item));
                setDraft((current) => (current?.drawing_pin_id === pin.drawing_pin_id ? { ...current, ...position } : { ...pin, ...position }));
              }}
              onPinDragStart={() => {
                if (editorFloating) {
                  setEditorFloating(false);
                  setSidePanelOpen(true);
                }
              }}
              onMoveEnd={saveMovedPin}
              onDraftMove={(position) => setDraft((current) => current ? { ...current, ...position } : current)}
              onQuickAction={(kind, position) => {
                setSelectedPinId("");
                setPlacing(false);
                setSidePanelOpen(true);
                setEditorOpen(true);
                const quickKind = kind === "defect" ? "DEFICIENCY" : kind === "note" ? "NOTE" : "COMPONENT_PLACED";
                setDraft({
                  ...position,
                  label: kind === "defect" ? "Tekortkoming" : kind === "note" ? "Opmerking" : "Component geplaatst",
                  description: navigationTarget?.description || "",
                  pin_kind: quickKind,
                  pin_status: "ACTIVE",
                  create_follow_up: canCreateFollowUp && followUpDefaultForKind(quickKind),
                });
              }}
            />
          </div>

          <aside className="drawing-pins-side-panel" aria-hidden={!sidePanelOpen}>
            {componentReview ? (
              <div className="drawing-component-review">
                <div>
                  <strong>Tekencontrole componenten</strong>
                  <span className="muted">{componentReviewPins.length ? `${componentReviewIndex + 1} van ${componentReviewPins.length} actief` : "Alle componentmarkeringen zijn verwerkt"}</span>
                </div>
                {componentReviewPins.length ? <div className="drawing-component-review__controls">
                  <button type="button" className="icon-btn" onClick={() => openComponentReviewPin(-1)} aria-label="Vorige component"><ChevronLeft size={18} /></button>
                  <button type="button" className="icon-btn" onClick={() => openComponentReviewPin(1)} aria-label="Volgende component"><ChevronRight size={18} /></button>
                  <button type="button" className="btn btn-primary btn-compact" disabled={busy || !selectedPin} onClick={completeCurrentReviewPin}><MapPinPlusInside size={16} /> Verwerkt; volgende</button>
                </div> : null}
                <button type="button" className="btn btn-secondary btn-compact" onClick={() => onOpenFollowUp?.()}>Terug naar werkvoorraad</button>
              </div>
            ) : null}
            {placing ? <div className="ember-alert ember-alert--info">Klik op de tekening om de locatie vast te leggen.</div> : null}
            {editorOpen && !editorFloating ? pinEditor : null}
          {editorOpen && selectedPin && !embedded ? (
              <PinActions
                code={code}
                pin={selectedPin}
                actions={directory.follow_up_actions || []}
                busy={busy}
                onChanged={refreshLinks}
              />
            ) : null}
            <div className="drawing-pin-list">
                <strong>Pins op deze tekening</strong>
                {pins.length ? pins.map((pin) => {
                  const meta = PIN_TYPE_META[pin.pin_kind] || PIN_TYPE_META.NOTE;
                  const Icon = meta.Icon;
                  const isHistorical = String(pin.pin_status || "").toUpperCase() === "HISTORICAL";
                  return (
                    <button
                      key={pin.drawing_pin_id}
                      type="button"
                      className={`follow-up-pin-card follow-up-pin-card--${meta.tone} drawing-pin-list__item${isHistorical ? " is-historical" : ""}${String(pin.drawing_pin_id) === selectedPinId ? " is-selected" : ""}`}
                      onClick={() => {
                        setPageNumber(Number(pin.page_number));
                        setSelectedPinId(String(pin.drawing_pin_id));
                        setDraft({ ...pin });
                        setEditorFloating(false);
                        setSidePanelOpen(true);
                        setEditorOpen(true);
                        updateLocation(selectedDocumentId, pin.page_number, pin.drawing_pin_id);
                      }}
                    >
                      <span className="follow-up-pin-card__icon"><Icon size={21} className="nav-anim-icon" /></span>
                      <span className="follow-up-pin-card__body">
                        <span className="follow-up-pin-card__head">
                          <strong>{pin.label || meta.label}</strong>
                          <span className={`monitor-tag monitor-tag--${isHistorical ? "muted" : "active"}`}>{isHistorical ? "Historisch" : "Actief"}</span>
                        </span>
                        {pin.description ? <span className="follow-up-pin-card__description">{pin.description}</span> : null}
                        <span className="follow-up-card__meta"><span>{meta.label}</span><span>Pagina {pin.page_number}</span><span>{(pin.follow_up_actions || []).length} opvolging{(pin.follow_up_actions || []).length === 1 ? "" : "en"}</span></span>
                      </span>
                    </button>
                  );
                }) : <span className="muted">Nog geen pins.</span>}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
