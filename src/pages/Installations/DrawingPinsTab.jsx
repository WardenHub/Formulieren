import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { GlobalWorkerOptions, getDocument as loadPdfDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BadgeAlert, BriefcaseBusiness, ChevronLeft, ChevronRight, MapPinPlusInside, MessageSquareMore, MoreVertical, PanelRightClose, PanelRightOpen, Pin, PinOff, X } from "lucide-react";

import EmberRadialActionMenu from "@/components/radial/EmberRadialActionMenu.jsx";
import { BadgeAlertIcon } from "@/components/ui/badge-alert.jsx";
import { MapPinPlusInsideIcon } from "@/components/ui/map-pin-plus-inside.jsx";
import { MessageSquareMoreIcon } from "@/components/ui/message-square-more.jsx";
import { CircleHelpIcon } from "@/components/ui/circle-help.jsx";
import { getResolvedAppearance, subscribeAppearance } from "@/theme/appearance.js";

import {
  createDrawingPin,
  createManualFollowUpForDrawingPin,
  deleteDrawingPin,
  downloadInstallationDocumentFile,
  getDrawingPins,
  getInstallationDrawings,
  linkDrawingPinAction,
  unlinkDrawingPinAction,
  updateDrawingPin,
} from "@/api/emberApi.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

function PdfPinViewer({ pdfDocument, pageNumber, pageCount, pins, selectedPinId, selectedPin, draft, editorOpen, editorContent, placing, onPreviousPage, onNextPage, onPlace, onSelect, onPinDragStart, onMove, onMoveEnd, onDraftMove, onQuickAction, readOnly }) {
  const shellRef = useRef(null);
  const viewportRef = useRef(null);
  const layerRef = useRef(null);
  const canvasRef = useRef(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [shellSize, setShellSize] = useState({ width: 900, height: 600 });
  const [rendering, setRendering] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [quickMenu, setQuickMenu] = useState(null);
  const [boundaryElement, setBoundaryElement] = useState(null);
  const menuTriggerRef = useRef(null);
  const longPressRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const handleWheel = (event) => {
      if ((!event.ctrlKey && !event.metaKey) || !viewport.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setZoom((current) => Math.min(3, Math.max(0.5, current + (event.deltaY < 0 ? 0.1 : -0.1))));
    };
    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return undefined;
    let cancelled = false;
    let renderTask = null;

    async function render() {
      setRendering(true);
      const page = await pdfDocument.getPage(pageNumber);
      if (cancelled) return;
      const unscaled = page.getViewport({ scale: 1, rotation: page.rotate });
      const cssScale = Math.max(0.15, (Math.max(280, shellSize.width) - 32) / unscaled.width);
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
  }, [pageNumber, pdfDocument, shellSize.width]);

  const pagePins = pins.filter((pin) => Number(pin.page_number) === Number(pageNumber));

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

  useEffect(() => () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
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

  function positionFromEvent(event) {
    const layer = event.currentTarget;
    const rect = layer.getBoundingClientRect();
    const shellRect = shellRef.current?.getBoundingClientRect();
    const normalizedX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const normalizedY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return {
      left: normalizedX * layer.clientWidth,
      top: normalizedY * layer.clientHeight,
      x_normalized: normalizedX,
      y_normalized: normalizedY,
      page_number: pageNumber,
      shell_x: shellRect ? event.clientX - shellRect.left : event.clientX,
      shell_y: shellRect ? event.clientY - shellRect.top : event.clientY,
    };
  }

  function openQuickMenu(event) {
    if (readOnly || placing || !pageSize.width || !pageSize.height) return;
    event.preventDefault();
    showQuickMenu(positionFromEvent(event), event.currentTarget);
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
    <div ref={shellRef} className={`drawing-pdf-shell${placing ? " is-placing" : ""}`}>
      <div className="drawing-zoom-controls" aria-label="PDF zoom">
        <button type="button" className="icon-btn" title="Vorige pagina" aria-label="Vorige pagina" disabled={pageNumber <= 1} onClick={onPreviousPage}><ChevronLeft size={18} /></button>
        <span className="drawing-zoom-controls__page" title={`Pagina ${pageNumber} van ${pageCount}`}>{pageNumber}/{pageCount}</span>
        <button type="button" className="icon-btn" title="Volgende pagina" aria-label="Volgende pagina" disabled={pageNumber >= pageCount} onClick={onNextPage}><ChevronRight size={18} /></button>
        <span className="drawing-zoom-controls__divider" aria-hidden="true" />
        <button type="button" className="icon-btn" title="Inzoomen" onClick={() => setZoom((current) => Math.min(3, current + 0.1))}>+</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="icon-btn" title="Uitzoomen" onClick={() => setZoom((current) => Math.max(0.5, current - 0.1))}>−</button>
        <button type="button" className="icon-btn" title="Zoom herstellen" onClick={() => setZoom(1)}>⟳</button>
      </div>
      {placing ? <div className="drawing-placement-hint">Klik op de juiste plaats in de tekening.</div> : null}
      {/* Wheel input is reserved for normal viewport scrolling; zoom is
          deliberately controlled by the visible buttons. */}
      <div ref={viewportRef} className="drawing-pdf-viewport"
        onPointerDown={(event) => {
          if (placing || event.button !== 0 || event.target.closest?.(".drawing-pin, .ember-radial-action-menu, .drawing-zoom-controls")) return;
          const viewport = event.currentTarget;
          panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
          viewport.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          const viewport = event.currentTarget;
          viewport.scrollLeft = pan.left - (event.clientX - pan.x);
          viewport.scrollTop = pan.top - (event.clientY - pan.y);
        }}
        onPointerUp={(event) => {
          if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
        }}
        onPointerCancel={() => { panRef.current = null; }}
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
            const position = positionFromEvent(event);
            const triggerElement = event.currentTarget;
            longPressRef.current = window.setTimeout(() => {
              showQuickMenu(position, triggerElement);
              longPressRef.current = null;
            }, 550);
          }}
          onPointerUp={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
          onPointerCancel={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
          onPointerMove={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
        >
          {pagePins.map((pin) => (
            <button
              key={pin.drawing_pin_id}
              type="button"
              className={`drawing-pin drawing-pin--${String(pin.pin_kind || "NOTE").toLowerCase()}${pin.pin_status === "HISTORICAL" ? " is-historical" : ""}${pin.drawing_pin_id === selectedPinId ? " is-selected" : ""}`}
              style={{ left: `${Number(pin.x_normalized) * 100}%`, top: `${Number(pin.y_normalized) * 100}%` }}
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
          ))}
          {editorOpen && selectedPin && Number(selectedPin.page_number) === Number(pageNumber) ? (
            <div className="drawing-pin-tooltip" style={{ left: `${Number(selectedPin.x_normalized) * 100}%`, top: `${Number(selectedPin.y_normalized) * 100}%` }} role="status">
              <strong>{PIN_TYPE_META[selectedPin.pin_kind]?.label || "Markering"}</strong>
              <span>{selectedPin.label}</span>
              {selectedPin.description ? <small>{selectedPin.description}</small> : null}
              {selectedPin.pin_status === "HISTORICAL" ? <small>Historisch</small> : null}
            </div>
          ) : null}
          {editorOpen && draft && !draft.drawing_pin_id && Number(draft.page_number) === Number(pageNumber) ? (
            <button
              type="button"
              key="drawing-pin-preview"
              className="drawing-pin-preview"
              style={{ left: `${Number(draft.x_normalized) * 100}%`, top: `${Number(draft.y_normalized) * 100}%` }}
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
          ) : null}
          {!readOnly && !placing ? (
            <button
              type="button"
              className="drawing-quick-menu-fallback"
              aria-label="Snelmenu voor een pin openen"
              title="Pin, opmerking of tekortkoming toevoegen"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.parentElement.getBoundingClientRect();
                showQuickMenu({
                  left: rect.width - 54,
                  top: 54,
                  x_normalized: 0.88,
                  y_normalized: 0.12,
                  page_number: pageNumber,
                }, event.currentTarget);
              }}
            ><MoreVertical size={19} /></button>
          ) : null}
          <EmberRadialActionMenu
            open={Boolean(quickMenu)}
            anchorPosition={quickMenu}
            actions={DRAWING_QUICK_ACTIONS}
            onSelect={(action) => runQuickAction(action.id)}
            onClose={closeQuickMenu}
            ariaLabel="Tekeningactie"
            resolvedTheme={resolvedTheme}
            boundaryElement={boundaryElement}
          />
        </div>
      </div>
      </div>
      </div>
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

function PinEditor({ draft, isExisting, busy, floating, onToggleFloating, onChange, onSave, onDelete, onCancel }) {
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
        <PinKindPicker value={draft.pin_kind || "NOTE"} onChange={(pin_kind) => onChange({ pin_kind })} />
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
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    priority: "NORMAL",
    responsibility_type: "WARDENBURG",
    due_date: "",
    customer_visible: false,
    customer_note: "",
  });
  const linkedIds = new Set((pin.follow_up_actions || []).map((item) => String(item.follow_up_action_id)));
  const available = actions.filter((item) => !linkedIds.has(String(item.follow_up_action_id)));

  async function linkSelected() {
    if (!selectedActionId) return;
    await linkDrawingPinAction(code, pin.drawing_pin_id, selectedActionId);
    setSelectedActionId("");
    await onChanged?.();
  }

  async function createAction() {
    if (!draft.title.trim()) return;
    await createManualFollowUpForDrawingPin(code, pin.drawing_pin_id, draft);
    setShowNew(false);
    setDraft({ title: "", description: "", priority: "NORMAL", responsibility_type: "WARDENBURG", due_date: "", customer_visible: false, customer_note: "" });
    await onChanged?.({ reloadDirectory: true });
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
                disabled={busy}
                title="Koppeling verwijderen"
                onClick={async () => {
                  await unlinkDrawingPinAction(code, pin.drawing_pin_id, action.follow_up_action_id);
                  await onChanged?.();
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : <span className="muted">Nog geen opvolging gekoppeld.</span>}

      <div className="drawing-pin-actions__link">
        <select value={selectedActionId} onChange={(event) => setSelectedActionId(event.target.value)}>
          <option value="">Bestaande opvolging kiezen</option>
          {available.map((action) => (
            <option key={action.follow_up_action_id} value={action.follow_up_action_id}>
              {action.workflow_title}; {action.status}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary" disabled={busy || !selectedActionId} onClick={linkSelected}>Koppelen</button>
      </div>

      {!showNew ? <button type="button" className="btn btn-secondary" onClick={() => setShowNew(true)}>Nieuwe opvolging maken</button> : null}

      {showNew ? (
        <div className="drawing-manual-action-form">
          <label className="admin-field"><span>Titel</span><input maxLength={300} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
          <label className="admin-field"><span>Omschrijving</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="drawing-manual-action-form__grid">
            <label className="admin-field"><span>Prioriteit</span><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}><option value="LOW">Laag</option><option value="NORMAL">Normaal</option><option value="HIGH">Hoog</option><option value="CRITICAL">Kritisch</option></select></label>
            <label className="admin-field"><span>Verantwoordelijkheid</span><select value={draft.responsibility_type} onChange={(event) => setDraft((current) => ({ ...current, responsibility_type: event.target.value }))}><option value="WARDENBURG">Wardenburg</option><option value="CUSTOMER">Klant</option><option value="THIRD_PARTY">Derde</option><option value="UNSPECIFIED">Nog te bepalen</option></select></label>
            <label className="admin-field"><span>Vervaldatum</span><span className="drawing-date-field"><input type="date" value={draft.due_date} onChange={(event) => setDraft((current) => ({ ...current, due_date: event.target.value }))} />{draft.due_date ? <button type="button" className="icon-btn drawing-date-clear" title="Vervaldatum wissen" aria-label="Vervaldatum wissen" onClick={() => setDraft((current) => ({ ...current, due_date: "" }))}><X size={16} /></button> : null}</span></label>
          </div>
          <label className="installations-filter-check"><input type="checkbox" checked={draft.customer_visible} onChange={(event) => setDraft((current) => ({ ...current, customer_visible: event.target.checked }))} /><span>Klantzichtbare tekst voorbereiden</span></label>
          {draft.customer_visible ? <label className="admin-field"><span>Klantzichtbare tekst</span><textarea rows={2} value={draft.customer_note} onChange={(event) => setDraft((current) => ({ ...current, customer_note: event.target.value }))} /></label> : null}
          <button type="button" className="btn btn-primary" disabled={busy || !draft.title.trim()} onClick={createAction}>Opvolging maken en koppelen</button>
          <button type="button" className="btn btn-danger drawing-manual-action-cancel" onClick={() => setShowNew(false)}><X size={17} aria-hidden="true" /> Annuleren</button>
        </div>
      ) : null}
    </div>
  );
}

export default function DrawingPinsTab({ code, readOnly = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [directory, setDirectory] = useState({ drawings: [], follow_up_actions: [] });
  const [selectedDocumentId, setSelectedDocumentId] = useState(() => String(searchParams.get("drawing") || ""));
  const [pins, setPins] = useState([]);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageNumber, setPageNumber] = useState(() => Math.max(1, Number(searchParams.get("page") || 1)));
  const [selectedPinId, setSelectedPinId] = useState(() => String(searchParams.get("pin") || ""));
  const [draft, setDraft] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFloating, setEditorFloating] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpIconRef = useRef(null);

  const selectedDrawing = directory.drawings.find((item) => String(item.document_id) === selectedDocumentId) || null;
  const selectedPin = pins.find((item) => String(item.drawing_pin_id) === selectedPinId) || null;

  function updateLocation(documentId, page, pinId = "") {
    const next = new URLSearchParams(searchParams);
    if (documentId) next.set("drawing", documentId); else next.delete("drawing");
    if (page) next.set("page", String(page)); else next.delete("page");
    if (pinId) next.set("pin", pinId); else next.delete("pin");
    setSearchParams(next, { replace: true });
  }

  async function loadDirectory(options = {}) {
    const response = await getInstallationDrawings(code);
    setDirectory(response || { drawings: [], follow_up_actions: [] });
    const preferred = options.documentId || selectedDocumentId || response?.drawings?.[0]?.document_id || "";
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
    setLoading(true);
    setError("");
    getInstallationDrawings(code)
      .then((response) => {
        if (cancelled) return;
        setDirectory(response || { drawings: [], follow_up_actions: [] });
        const preferred = selectedDocumentId || response?.drawings?.[0]?.document_id || "";
        setSelectedDocumentId(String(preferred));
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.message || String(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [code, selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setPins([]);
      setPdfDocument(null);
      return undefined;
    }
    let cancelled = false;
    let activePdf = null;
    setLoading(true);
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
        if (!cancelled) setLoading(false);
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
    setBusy(true);
    setError("");
    try {
      if (draft.drawing_pin_id) {
        const response = await updateDrawingPin(code, draft.drawing_pin_id, draft);
        setDraft(response?.pin || null);
        setSelectedPinId(String(response?.pin?.drawing_pin_id || ""));
      } else {
        const response = await createDrawingPin(code, selectedDocumentId, draft);
        setDraft(response?.pin || null);
        setSelectedPinId(String(response?.pin?.drawing_pin_id || ""));
      }
      setPlacing(false);
      await Promise.all([loadPins(), loadDirectory({ documentId: selectedDocumentId })]);
    } catch (requestError) {
      setError(requestError?.message || String(requestError));
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

  if (loading && !directory.drawings.length) return <div className="ui-empty">Tekeningen laden...</div>;

  return (
    <div className="drawing-pins-tab">
      <div className="drawing-pins-toolbar">
        <label className="admin-field drawing-pins-toolbar__select">
          <span>PDF-tekening</span>
          <select
            value={selectedDocumentId}
            onChange={(event) => {
              const value = event.target.value;
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
                {drawing.title || drawing.file_name || drawing.document_type_name}; {drawing.pin_count} pin(s){drawing.is_current_version === false ? "; historische versie" : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedDrawing ? (
          <div className="drawing-pins-toolbar__meta">
            <strong>{selectedDrawing.title || selectedDrawing.file_name}</strong>
            <span>{selectedDrawing.file_name}; {selectedDrawing.document_type_name}</span>
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
          disabled={readOnly || !selectedDocumentId || !pdfDocument || selectedDrawing?.is_current_version === false}
          onClick={() => {
            setDraft(null);
            setSelectedPinId("");
            setEditorOpen(false);
            setPlacing(true);
          }}
        >
          Nieuwe pin plaatsen
        </button>
        <label className={`ember-toggle ${showHistory ? "is-on" : "is-off"}`} title="Toon of verberg historische componentpins en tekenversies">
          <input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} />
          <span className="ember-toggle__track"><span className="ember-toggle__thumb" /></span>
          <span className="ember-toggle__label">Toon geschiedenis</span>
        </label>
      </div>

      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {readOnly ? <div className="ember-alert ember-alert--warning">Deze historische installatie is alleen-lezen.</div> : null}
      {selectedDrawing?.is_current_version === false ? <div className="ember-alert ember-alert--info">Deze pinnen blijven gekoppeld aan de exacte historische PDF-versie. Nieuwe pins kunnen alleen op de actuele tekenversie worden geplaatst.</div> : null}

      {!directory.drawings.length ? (
        <div className="ui-empty">Geen actieve PDF-tekeningen in het installatiedossier.</div>
      ) : null}

      {selectedDocumentId && pdfDocument ? (
        <div className={`drawing-pins-workspace${sidePanelOpen ? "" : " is-side-panel-collapsed"}`}>
          <div className="drawing-pins-canvas-column">
            <div className="drawing-page-navigation">
              <button type="button" className="btn btn-secondary" disabled={pageNumber <= 1} onClick={() => { const next = pageNumber - 1; setPageNumber(next); updateLocation(selectedDocumentId, next, selectedPinId); }}>Vorige</button>
              <span>Pagina {pageNumber} van {pdfDocument.numPages}</span>
              <button type="button" className="btn btn-secondary" disabled={pageNumber >= pdfDocument.numPages} onClick={() => { const next = pageNumber + 1; setPageNumber(next); updateLocation(selectedDocumentId, next, selectedPinId); }}>Volgende</button>
              <button type="button" className="icon-btn drawing-side-panel-toggle" title={sidePanelOpen ? "Rechterpaneel inklappen" : "Rechterpaneel uitklappen"} aria-label={sidePanelOpen ? "Rechterpaneel inklappen" : "Rechterpaneel uitklappen"} onClick={() => setSidePanelOpen((current) => !current)}>{sidePanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>
            </div>
            <PdfPinViewer
              pdfDocument={pdfDocument}
              pageNumber={pageNumber}
              pageCount={pdfDocument.numPages}
              pins={pins}
              selectedPinId={selectedPinId}
              selectedPin={selectedPin}
              draft={draft}
              editorOpen={editorOpen}
              editorContent={editorFloating ? pinEditor : null}
              placing={placing}
              readOnly={readOnly || selectedDrawing?.is_current_version === false}
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
                setDraft({ ...position, label: "", description: "" });
                setEditorOpen(true);
              }}
              onSelect={(pin) => {
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
                setEditorOpen(false);
              }}
              onMoveEnd={saveMovedPin}
              onDraftMove={(position) => setDraft((current) => current ? { ...current, ...position } : current)}
              onQuickAction={(kind, position) => {
                setSelectedPinId("");
                setPlacing(false);
                setSidePanelOpen(true);
                setEditorOpen(true);
                setDraft({
                  ...position,
                    label: kind === "defect" ? "Tekortkoming" : kind === "note" ? "Opmerking" : "Component geplaatst",
                    description: "",
                  pin_kind: kind === "defect" ? "DEFICIENCY" : kind === "note" ? "NOTE" : "COMPONENT_PLACED",
                  pin_status: "ACTIVE",
                });
              }}
            />
          </div>

          <aside className="drawing-pins-side-panel" aria-hidden={!sidePanelOpen}>
            {placing ? <div className="ember-alert ember-alert--info">Klik op de tekening om de locatie vast te leggen.</div> : null}
            {editorOpen && !editorFloating ? pinEditor : null}
          {editorOpen && selectedPin ? (
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
                {pins.length ? pins.map((pin) => (
                  <button
                    key={pin.drawing_pin_id}
                    type="button"
                    className="drawing-pin-list__item"
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
                    <strong>{pin.label}</strong>
                    <span>Pagina {pin.page_number}; {(pin.follow_up_actions || []).length} opvolging(en)</span>
                  </button>
                )) : <span className="muted">Nog geen pins.</span>}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
