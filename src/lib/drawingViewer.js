/* Het gereedschap om een tekening te bekijken: een PDF-pagina tekenen, zoomen, pannen, knijpen
   en schermvullend maken.

   Dit stond eerst helemaal in DrawingPinsTab.jsx en was daardoor alleen bruikbaar op het
   installatiescherm. De FormRunner heeft dezelfde tekening nodig, en op een tablet moeten
   allebei kunnen knijpen en schermvullend gaan. De logica staat daarom hier, en elk scherm
   houdt zijn eigen laag met pins of vinkjes erbovenop.

   Bewust hooks en geen component: de twee schermen tekenen iets heel verschillends over de
   pagina heen, maar het bekijken zelf is precies hetzelfde.

   useDrawingViewer maakt de viewport-ref zelf en geeft hem terug, in plaats van hem als
   argument aan te nemen. Zo blijft het schuiven binnen de hook en weet elke lezer, en ook de
   React-compiler, wie de eigenaar is. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 12;

// Wat een gebaar niet mag oppakken: de pins, het radiale menu en de knoppenbalk.
const GESTURE_EXCLUDES = ".drawing-pin, .ember-radial-action-menu, .drawing-zoom-controls, .drawing-check";

function clampZoom(value, min = MIN_ZOOM, max = MAX_ZOOM) {
  return Math.min(max, Math.max(min, Number(value) || 1));
}

/* Tekent één pagina op een canvas, geschaald naar de beschikbare breedte. De canvas krijgt de
   pixeldichtheid van het scherm mee tot maximaal twee keer; daarboven kost het alleen geheugen
   zonder dat iemand het ziet. */
export function usePdfPage({ pdfDocument, pageNumber, availableWidth }) {
  const canvasRef = useRef(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return undefined;

    let cancelled = false;
    let renderTask = null;

    async function render() {
      setRendering(true);
      const page = await pdfDocument.getPage(pageNumber);
      if (cancelled) return;

      const unscaled = page.getViewport({ scale: 1, rotation: page.rotate });
      const cssScale = Math.max(0.15, (Math.max(280, availableWidth) - 32) / unscaled.width);
      const cssViewport = page.getViewport({ scale: cssScale, rotation: page.rotate });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = page.getViewport({ scale: cssScale * pixelRatio, rotation: page.rotate });

      const canvas = canvasRef.current;
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      setPageSize({ width: cssViewport.width, height: cssViewport.height });

      const context = canvas.getContext("2d", { alpha: false });
      renderTask = page.render({ canvasContext: context, viewport: renderViewport });
      await renderTask.promise;
      if (!cancelled) setRendering(false);
    }

    render().catch((error) => {
      if (error?.name !== "RenderingCancelledException") console.error("PDF page render failed", error);
      if (!cancelled) setRendering(false);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [availableWidth, pageNumber, pdfDocument]);

  return { canvasRef, pageSize, rendering };
}

/* Zoomen, pannen en knijpen op één plek.

   Het zoomen heeft een anker. Zonder anker trekt inzoomen de tekening naar linksboven, want de
   schaal hangt aan transform-origin top left; met een vinger op een melder is dat
   desoriënterend. Daarom onthouden we welk punt van de tekening onder de vinger zat en zetten
   we de schuifbalken daar na de schaalwijziging weer op terug.

   Eén vinger pant, twee vingers knijpen, dubbeltikken wisselt tussen passend en ingezoomd. De
   browser mag zelf niets met aanraking doen, vandaar touch-action none op de viewport. */
export function useDrawingViewer({ min = MIN_ZOOM, max = MAX_ZOOM, initial = 1, fitZoom = 1, tapZoom = 2, enabled = true } = {}) {
  const viewportRef = useRef(null);
  const anchorRef = useRef(null);
  const pointersRef = useRef(new Map());
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const lastTapRef = useRef(0);

  const [zoom, setZoomState] = useState(() => clampZoom(initial, min, max));

  const setZoom = useCallback(
    (next) => {
      setZoomState((current) => clampZoom(typeof next === "function" ? next(current) : next, min, max));
    },
    [max, min]
  );

  const zoomToPoint = useCallback(
    (nextZoom, clientX, clientY) => {
      const viewport = viewportRef.current;
      const target = clampZoom(nextZoom, min, max);

      if (!viewport) {
        setZoomState(target);
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      const offsetY = clientY - rect.top;

      setZoomState((current) => {
        // Ligt er nog een anker klaar, dan staan de schuifbalken nog op de vorige stand; de
        // layout-effect komt pas na deze render. Reken dan met de stand die straks gezet
        // wordt, anders mengt een tweede knijpstap een oude positie met een nieuwe schaal.
        const pending = anchorRef.current;
        const currentLeft = pending ? pending.contentX * current - pending.offsetX : viewport.scrollLeft;
        const currentTop = pending ? pending.contentY * current - pending.offsetY : viewport.scrollTop;

        anchorRef.current = {
          contentX: (currentLeft + offsetX) / current,
          contentY: (currentTop + offsetY) / current,
          offsetX,
          offsetY,
        };
        return target;
      });
    },
    [max, min]
  );

  // Pas nadat de nieuwe maat in de DOM staat kunnen de schuifbalken terug naar het anker.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;

    const viewport = viewportRef.current;
    if (!anchor || !viewport) return;

    viewport.scrollLeft = anchor.contentX * zoom - anchor.offsetX;
    viewport.scrollTop = anchor.contentY * zoom - anchor.offsetY;
  }, [zoom]);

  const onPointerDown = useCallback(
    (event) => {
      if (!enabled) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target.closest?.(GESTURE_EXCLUDES)) return;

      const viewport = viewportRef.current;
      if (!viewport) return;

      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
        panRef.current = null;
        return;
      }

      panRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
        moved: false,
      };
      viewport.setPointerCapture?.(event.pointerId);
    },
    [enabled, zoom]
  );

  const onPointerMove = useCallback(
    (event) => {
      if (!enabled) return;

      const known = pointersRef.current.get(event.pointerId);
      if (known) {
        known.x = event.clientX;
        known.y = event.clientY;
      }

      const pinch = pinchRef.current;
      if (pinch && pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        zoomToPoint(pinch.zoom * (distance / pinch.distance), (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }

      const pan = panRef.current;
      const viewport = viewportRef.current;
      if (!pan || pan.pointerId !== event.pointerId || !viewport) return;

      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) pan.moved = true;

      viewport.scrollLeft = pan.left - dx;
      viewport.scrollTop = pan.top - dy;
    },
    [enabled, zoomToPoint]
  );

  const onPointerUp = useCallback(
    (event) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;

      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      panRef.current = null;

      // Dubbeltikken is alleen voor vingers; met een muis zijn de knoppen er.
      if (pan.moved || event.pointerType === "mouse") return;

      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        if (Math.abs(zoom - fitZoom) < 0.01) zoomToPoint(tapZoom, event.clientX, event.clientY);
        else setZoom(fitZoom);
        return;
      }

      lastTapRef.current = now;
    },
    [fitZoom, setZoom, tapZoom, zoom, zoomToPoint]
  );

  const onPointerCancel = useCallback((event) => {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    panRef.current = null;
  }, []);

  return {
    viewportRef,
    zoom,
    setZoom,
    zoomToPoint,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}

/* Schermvullend. Waar de browser het toestaat vragen we echt volledig scherm, zodat ook de
   adresbalk verdwijnt; dat scheelt op een tablet tientallen pixels. Kan dat niet, zoals op een
   iPhone, dan valt het terug op een laag die het hele venster vult. Die laag staat er altijd,
   dus het gedrag is overal hetzelfde en alleen de browserbalk verschilt. */
export function useFullscreen(elementRef) {
  const [active, setActive] = useState(false);

  // Sluit de gebruiker het volledige scherm met Escape of een veeg, dan moet de laag mee terug.
  useEffect(() => {
    function onChange() {
      if (!document.fullscreenElement) setActive(false);
    }

    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") setActive(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  const toggle = useCallback(() => {
    const element = elementRef?.current;

    setActive((current) => {
      const next = !current;

      try {
        if (next && element?.requestFullscreen) element.requestFullscreen().catch(() => {});
        else if (!next && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      } catch {
        // De laag vult dan alleen het venster; nog altijd veel meer dan de 72vh van voorheen.
      }

      return next;
    });
  }, [elementRef]);

  return { active, toggle };
}
