import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GlobalWorkerOptions, getDocument as loadPdfDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MapPin, MessageSquareText, MoreVertical, TriangleAlert } from "lucide-react";

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

function PdfPinViewer({ pdfDocument, pageNumber, pins, selectedPinId, placing, onPlace, onSelect, onQuickAction, readOnly }) {
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [shellWidth, setShellWidth] = useState(900);
  const [rendering, setRendering] = useState(false);
  const [quickMenu, setQuickMenu] = useState(null);
  const menuRef = useRef(null);
  const longPressRef = useRef(null);

  useEffect(() => {
    if (!shellRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries?.[0]?.contentRect?.width;
      if (Number.isFinite(width) && width > 0) setShellWidth(width);
    });
    observer.observe(shellRef.current);
    return () => observer.disconnect();
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
      const cssScale = Math.max(0.15, (Math.max(280, shellWidth) - 32) / unscaled.width);
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
  }, [pageNumber, pdfDocument, shellWidth]);

  const pagePins = pins.filter((pin) => Number(pin.page_number) === Number(pageNumber));

  useEffect(() => {
    if (!quickMenu) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && menuRef.current?.contains(event.target)) return;
      setQuickMenu(null);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    window.requestAnimationFrame(() => menuRef.current?.querySelector("button")?.focus());
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [quickMenu]);

  function positionFromEvent(event) {
    const layer = event.currentTarget;
    const rect = layer.getBoundingClientRect();
    const offsetX = Math.min(rect.width - 72, Math.max(72, event.clientX - rect.left));
    const offsetY = Math.min(rect.height - 72, Math.max(72, event.clientY - rect.top));
    return {
      left: offsetX,
      top: offsetY,
      x_normalized: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y_normalized: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      page_number: pageNumber,
    };
  }

  function openQuickMenu(event) {
    if (readOnly || placing || !pageSize.width || !pageSize.height) return;
    event.preventDefault();
    setQuickMenu(positionFromEvent(event));
  }

  function runQuickAction(kind) {
    if (!quickMenu) return;
    onQuickAction?.(kind, {
      x_normalized: quickMenu.x_normalized,
      y_normalized: quickMenu.y_normalized,
      page_number: quickMenu.page_number,
    });
    setQuickMenu(null);
  }

  function handlePlacement(event) {
    if (!placing || !pageSize.width || !pageSize.height) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    onPlace?.({ x_normalized: x, y_normalized: y, page_number: pageNumber });
  }

  return (
    <div ref={shellRef} className={`drawing-pdf-shell${placing ? " is-placing" : ""}`}>
      <div className="drawing-pdf-page" style={{ width: pageSize.width || "auto", height: pageSize.height || "auto" }}>
        <canvas ref={canvasRef} aria-label={`PDF pagina ${pageNumber}`} />
        <div
          className="drawing-pin-layer"
          role={placing ? "button" : undefined}
          tabIndex={placing ? 0 : -1}
          aria-label={placing ? "Klik op de tekening om een pin te plaatsen" : "Pins op de tekening"}
          onClick={handlePlacement}
          onContextMenu={openQuickMenu}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" || readOnly || placing) return;
            const position = positionFromEvent(event);
            longPressRef.current = window.setTimeout(() => setQuickMenu(position), 550);
          }}
          onPointerUp={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
          onPointerCancel={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
          onPointerMove={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
        >
          {pagePins.map((pin) => (
            <button
              key={pin.drawing_pin_id}
              type="button"
              className={`drawing-pin${pin.drawing_pin_id === selectedPinId ? " is-selected" : ""}`}
              style={{ left: `${Number(pin.x_normalized) * 100}%`, top: `${Number(pin.y_normalized) * 100}%` }}
              onClick={(event) => {
                event.stopPropagation();
                onSelect?.(pin);
              }}
              title={pin.label}
              aria-label={`Pin ${pin.label}`}
            >
              <span />
            </button>
          ))}
          {!readOnly && !placing ? (
            <button
              type="button"
              className="drawing-quick-menu-fallback"
              aria-label="Snelmenu voor een pin openen"
              title="Pin, opmerking of tekortkoming toevoegen"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.parentElement.getBoundingClientRect();
                setQuickMenu({ left: rect.width - 54, top: 54, x_normalized: 0.88, y_normalized: 0.12, page_number: pageNumber });
              }}
            ><MoreVertical size={19} /></button>
          ) : null}
          {quickMenu ? (
            <div ref={menuRef} className="drawing-radial-menu" style={{ left: quickMenu.left, top: quickMenu.top }} role="menu" aria-label="Tekeningactie">
              <button type="button" role="menuitem" className="drawing-radial-menu__item drawing-radial-menu__item--pin" onClick={(event) => { event.stopPropagation(); runQuickAction("pin"); }}><MapPin size={18} /><span>Pin</span></button>
              <button type="button" role="menuitem" className="drawing-radial-menu__item drawing-radial-menu__item--note" onClick={(event) => { event.stopPropagation(); runQuickAction("note"); }}><MessageSquareText size={18} /><span>Opmerking</span></button>
              <button type="button" role="menuitem" className="drawing-radial-menu__item drawing-radial-menu__item--defect" onClick={(event) => { event.stopPropagation(); runQuickAction("defect"); }}><TriangleAlert size={18} /><span>Tekortkoming</span></button>
            </div>
          ) : null}
        </div>
      </div>
      {rendering ? <div className="drawing-pdf-loading">PDF-pagina laden...</div> : null}
      {placing ? <div className="drawing-placement-hint">Klik op de juiste plaats in de tekening.</div> : null}
    </div>
  );
}

function PinEditor({ draft, isExisting, busy, onChange, onSave, onDelete, onCancel }) {
  if (!draft) return null;
  return (
    <div className="drawing-pin-editor">
      <div className="drawing-pin-editor__head">
        <strong>{isExisting ? "Pin bewerken" : "Nieuwe pin"}</strong>
        <span className="ember-label ember-label--muted">Pagina {draft.page_number}</span>
      </div>
      <label className="admin-field">
        <span>Label</span>
        <input value={draft.label || ""} maxLength={200} onChange={(event) => onChange({ label: event.target.value })} />
      </label>
      <label className="admin-field">
        <span>Omschrijving</span>
        <textarea rows={3} value={draft.description || ""} maxLength={2000} onChange={(event) => onChange({ description: event.target.value })} />
      </label>
      <div className="drawing-pin-editor__position">
        x {Number(draft.x_normalized).toFixed(4)}; y {Number(draft.y_normalized).toFixed(4)}
      </div>
      <div className="drawing-pin-editor__actions">
        <button type="button" className="btn btn-primary" disabled={busy || !String(draft.label || "").trim()} onClick={onSave}>
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
      <strong>Gekoppelde opvolgingen</strong>
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

      <button type="button" className="btn btn-secondary" onClick={() => setShowNew((current) => !current)}>
        {showNew ? "Nieuwe opvolging sluiten" : "Nieuwe opvolging maken"}
      </button>

      {showNew ? (
        <div className="drawing-manual-action-form">
          <label className="admin-field"><span>Titel</span><input maxLength={300} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
          <label className="admin-field"><span>Omschrijving</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="drawing-manual-action-form__grid">
            <label className="admin-field"><span>Prioriteit</span><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}><option value="LOW">Laag</option><option value="NORMAL">Normaal</option><option value="HIGH">Hoog</option><option value="CRITICAL">Kritisch</option></select></label>
            <label className="admin-field"><span>Verantwoordelijkheid</span><select value={draft.responsibility_type} onChange={(event) => setDraft((current) => ({ ...current, responsibility_type: event.target.value }))}><option value="WARDENBURG">Wardenburg</option><option value="CUSTOMER">Klant</option><option value="THIRD_PARTY">Derde</option><option value="UNSPECIFIED">Nog te bepalen</option></select></label>
            <label className="admin-field"><span>Vervaldatum</span><input type="date" value={draft.due_date} onChange={(event) => setDraft((current) => ({ ...current, due_date: event.target.value }))} /></label>
          </div>
          <label className="installations-filter-check"><input type="checkbox" checked={draft.customer_visible} onChange={(event) => setDraft((current) => ({ ...current, customer_visible: event.target.checked }))} /><span>Klantzichtbare tekst voorbereiden</span></label>
          {draft.customer_visible ? <label className="admin-field"><span>Klantzichtbare tekst</span><textarea rows={2} value={draft.customer_note} onChange={(event) => setDraft((current) => ({ ...current, customer_note: event.target.value }))} /></label> : null}
          <button type="button" className="btn btn-primary" disabled={busy || !draft.title.trim()} onClick={createAction}>Opvolging maken en koppelen</button>
        </div>
      ) : null}
    </div>
  );
}

export default function DrawingPinsTab({ code, readOnly = false, onOpenFollowUp }) {
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
  const [quickActionKind, setQuickActionKind] = useState("");

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
    const response = await getDrawingPins(code, documentId);
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
  }, [code]);

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
    Promise.all([
      getDrawingPins(code, selectedDocumentId),
      downloadInstallationDocumentFile(code, selectedDocumentId),
    ])
      .then(async ([pinResponse, download]) => {
        if (cancelled) return;
        setPins(pinResponse?.pins || []);
        const buffer = await download.blob.arrayBuffer();
        if (cancelled) return;
        activePdf = await loadPdfDocument({ data: buffer }).promise;
        if (cancelled) {
          activePdf.destroy();
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
      if (activePdf) activePdf.destroy();
    };
  }, [code, selectedDocumentId]);

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
        if (quickActionKind === "defect" && response?.pin?.drawing_pin_id) {
          const next = new URLSearchParams(searchParams);
          next.set("tab", "followups");
          next.set("newFollowUpPin", String(response.pin.drawing_pin_id));
          setSearchParams(next);
          onOpenFollowUp?.(String(response.pin.drawing_pin_id));
        }
      }
      setQuickActionKind("");
      setPlacing(false);
      await Promise.all([loadPins(), loadDirectory({ documentId: selectedDocumentId })]);
    } catch (requestError) {
      setError(requestError?.message || String(requestError));
    } finally {
      setBusy(false);
    }
  }

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
        <button
          type="button"
          className="btn btn-primary"
          disabled={readOnly || !selectedDocumentId || !pdfDocument || selectedDrawing?.is_current_version === false}
          onClick={() => {
            setDraft(null);
            setSelectedPinId("");
            setPlacing(true);
          }}
        >
          Nieuwe pin plaatsen
        </button>
      </div>

      {error ? <div className="ember-alert ember-alert--danger">{error}</div> : null}
      {readOnly ? <div className="ember-alert ember-alert--warning">Deze historische installatie is alleen-lezen.</div> : null}
      {selectedDrawing?.is_current_version === false ? <div className="ember-alert ember-alert--info">Deze pinnen blijven gekoppeld aan de exacte historische PDF-versie. Nieuwe pins kunnen alleen op de actuele tekenversie worden geplaatst.</div> : null}

      {!directory.drawings.length ? (
        <div className="ui-empty">Geen actieve PDF-tekeningen in het installatiedossier.</div>
      ) : null}

      {selectedDocumentId && pdfDocument ? (
        <div className="drawing-pins-workspace">
          <div className="drawing-pins-canvas-column">
            <div className="drawing-page-navigation">
              <button type="button" className="btn btn-secondary" disabled={pageNumber <= 1} onClick={() => { const next = pageNumber - 1; setPageNumber(next); updateLocation(selectedDocumentId, next, selectedPinId); }}>Vorige</button>
              <span>Pagina {pageNumber} van {pdfDocument.numPages}</span>
              <button type="button" className="btn btn-secondary" disabled={pageNumber >= pdfDocument.numPages} onClick={() => { const next = pageNumber + 1; setPageNumber(next); updateLocation(selectedDocumentId, next, selectedPinId); }}>Volgende</button>
            </div>
            <PdfPinViewer
              pdfDocument={pdfDocument}
              pageNumber={pageNumber}
              pins={pins}
              selectedPinId={selectedPinId}
              placing={placing}
              readOnly={readOnly || selectedDrawing?.is_current_version === false}
              onPlace={(position) => {
                setPlacing(false);
                setDraft({ ...position, label: "", description: "" });
              }}
              onSelect={(pin) => {
                setSelectedPinId(String(pin.drawing_pin_id));
                setDraft({ ...pin });
                setPlacing(false);
                updateLocation(selectedDocumentId, pin.page_number, pin.drawing_pin_id);
              }}
              onQuickAction={(kind, position) => {
                setQuickActionKind(kind);
                setSelectedPinId("");
                setPlacing(false);
                setDraft({
                  ...position,
                  label: kind === "defect" ? "Tekortkoming" : kind === "note" ? "Opmerking" : "Pin",
                  description: "",
                  pin_kind: kind === "defect" ? "DEFICIENCY" : kind === "note" ? "NOTE" : "LOCATION",
                });
              }}
            />
          </div>

          <aside className="drawing-pins-side-panel">
            {placing ? <div className="ember-alert ember-alert--info">Klik op de tekening om de locatie vast te leggen.</div> : null}
            <PinEditor
              draft={draft}
              isExisting={Boolean(draft?.drawing_pin_id)}
              busy={busy}
              onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              onSave={savePin}
              onDelete={removePin}
              onCancel={() => { setDraft(null); setSelectedPinId(""); setPlacing(false); updateLocation(selectedDocumentId, pageNumber, ""); }}
            />
            {selectedPin ? (
              <PinActions
                code={code}
                pin={selectedPin}
                actions={directory.follow_up_actions || []}
                busy={busy}
                onChanged={refreshLinks}
              />
            ) : null}
            {!draft && !placing ? (
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
                      updateLocation(selectedDocumentId, pin.page_number, pin.drawing_pin_id);
                    }}
                  >
                    <strong>{pin.label}</strong>
                    <span>Pagina {pin.page_number}; {(pin.follow_up_actions || []).length} opvolging(en)</span>
                  </button>
                )) : <span className="muted">Nog geen pins.</span>}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
