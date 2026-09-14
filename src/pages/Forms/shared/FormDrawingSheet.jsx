/* De tekening tijdens het invullen van een formulier.

   Tot nu toe zat de tekening alleen op het installatiescherm en moest een monteur de runner
   verlaten om te kijken waar een melder hangt. Dit paneel zet dezelfde tekening naast het
   formulier, met dezelfde bediening: knijpen, slepen, dubbeltikken en schermvullend.

   Het verschil met het installatiescherm is de laag erboven. Daar staan echte pins met een
   levensduur; hier staan tijdelijke vinkjes die alleen dit apparaat kent en die bij het
   indienen verdwijnen. Zie checkedPoints.js voor waarom dat zo is. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Maximize2, Minimize2, Scan, X } from "lucide-react";
import { GlobalWorkerOptions, getDocument as loadPdfDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { useDrawingViewer, useFullscreen, usePdfPage } from "@/lib/drawingViewer.js";
import { downloadInstallationDocumentFile, getInstallationDrawings } from "@/api/emberApi.js";
import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";

import { readCheckedPoints, saveCheckedPoints } from "./checkedPoints.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function FormDrawingSheet({ code, instanceId, onClose, readOnly = false }) {
  const shellRef = useRef(null);
  const [drawings, setDrawings] = useState([]);
  const [documentId, setDocumentId] = useState("");
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [shellWidth, setShellWidth] = useState(900);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [points, setPoints] = useState(() => readCheckedPoints(instanceId));

  const fullscreen = useFullscreen(shellRef);
  const { viewportRef, zoom, setZoom, handlers } = useDrawingViewer({ initial: 1 });
  const { canvasRef, pageSize, rendering } = usePdfPage({ pdfDocument, pageNumber, availableWidth: shellWidth });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver((entries) => {
      const width = entries?.[0]?.contentRect?.width;
      if (width > 0) setShellWidth(width);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    getInstallationDrawings(code)
      .then((response) => {
        if (cancelled) return;
        const list = response?.drawings || [];
        setDrawings(list);
        setDocumentId(String(list[0]?.document_id || ""));
        if (!list.length) setLoading(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError?.message || String(requestError));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!documentId) return undefined;

    let cancelled = false;
    let active = null;

    // De laadstand hoort bij het ophalen zelf; zo staat de hele levenscyclus van deze aanroep
    // op een plek en begint het effect niet met een reeks setState-aanroepen.
    async function laad() {
      setLoading(true);
      setError("");

      try {
        const download = await downloadInstallationDocumentFile(code, documentId);
        const buffer = await download.blob.arrayBuffer();
        if (cancelled) return;

        active = await loadPdfDocument({ data: buffer }).promise;
        if (cancelled) {
          active?.destroy?.();
          return;
        }

        setPdfDocument(active);
        setPageNumber(1);
      } catch (requestError) {
        if (!cancelled) setError(requestError?.message || String(requestError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    laad();

    return () => {
      cancelled = true;
      active?.destroy?.();
    };
  }, [code, documentId]);

  // Elke wijziging gaat meteen naar de opslag; een monteur die de tab sluit en terugkomt hoort
  // zijn vinkjes terug te zien.
  useEffect(() => {
    saveCheckedPoints(instanceId, points);
  }, [instanceId, points]);

  const pagePoints = useMemo(
    () => points.filter((point) => point.documentId === documentId && Number(point.page) === Number(pageNumber)),
    [documentId, pageNumber, points]
  );

  const addPoint = useCallback(
    (event) => {
      if (readOnly || !pageSize.width || !pageSize.height) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;

      setPoints((current) => [
        ...current,
        { id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, documentId, page: pageNumber, x, y },
      ]);
    },
    [documentId, pageNumber, pageSize.height, pageSize.width, readOnly]
  );

  const removePoint = useCallback((id) => {
    setPoints((current) => current.filter((point) => point.id !== id));
  }, []);

  const pageCount = pdfDocument?.numPages || 1;
  // Een vinkje hoort even groot te blijven als je inzoomt; het hangt aan een punt van de
  // tekening, maar het is geen onderdeel van de tekening. Zie .drawing-pin-anchor.
  const markerScale = zoom > 0 ? 1 / zoom : 1;

  return (
    <div className="form-drawing-sheet" role="dialog" aria-label="Tekening bij dit formulier">
      <div className="form-drawing-sheet__header">
        <div>
          <strong>Tekening</strong>
          <span>
            {points.length
              ? `${points.length} ${points.length === 1 ? "vinkje" : "vinkjes"} gezet`
              : "Tik op de tekening om te markeren wat je hebt gecontroleerd"}
          </span>
        </div>

        <div className="form-drawing-sheet__header-actions">
          {points.length ? (
            <button type="button" className="btn btn-secondary" onClick={() => setPoints([])}>
              Vinkjes wissen
            </button>
          ) : null}
          <button type="button" className="icon-btn" title="Tekening sluiten" aria-label="Tekening sluiten" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {drawings.length > 1 ? (
        <label className="form-drawing-sheet__picker">
          <span>Tekening</span>
          <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
            {drawings.map((drawing) => (
              <option key={drawing.document_id} value={drawing.document_id}>
                {drawing.title || drawing.document_number || "Tekening"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div ref={shellRef} className={`drawing-pdf-shell${fullscreen.active ? " is-fullscreen" : ""}`}>
        <div className="drawing-zoom-controls" aria-label="Tekening bedienen">
          <button type="button" className="icon-btn" title="Vorige pagina" aria-label="Vorige pagina" disabled={pageNumber <= 1} onClick={() => setPageNumber((current) => Math.max(1, current - 1))}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="drawing-zoom-controls__page">{pageNumber}/{pageCount}</span>
          <button type="button" className="icon-btn" title="Volgende pagina" aria-label="Volgende pagina" disabled={pageNumber >= pageCount} onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <span className="drawing-zoom-controls__divider" aria-hidden="true" />
          <button type="button" className="icon-btn" title="Inzoomen" onClick={() => setZoom((current) => current + 0.2)}>+</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn" title="Uitzoomen" onClick={() => setZoom((current) => current - 0.2)}>−</button>
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

        {loading ? (
          <div className="form-drawing-sheet__state">
            <LoaderPinwheelIcon size={26} active aria-label="tekening wordt geladen" />
            <span>De tekening wordt geladen.</span>
          </div>
        ) : null}

        {error ? <div className="form-drawing-sheet__state">{error}</div> : null}

        {!loading && !error && !drawings.length ? (
          <div className="form-drawing-sheet__state">Bij deze installatie staat geen tekening.</div>
        ) : null}

        <div ref={viewportRef} className="drawing-pdf-viewport" {...handlers}>
          <div
            className="drawing-pdf-page-zoom-frame"
            style={{ width: pageSize.width ? pageSize.width * zoom : "auto", height: pageSize.height ? pageSize.height * zoom : "auto" }}
          >
            <div
              className="drawing-pdf-page"
              style={{ width: pageSize.width || "auto", height: pageSize.height || "auto", transform: `scale(${zoom})`, transformOrigin: "top left" }}
            >
              <canvas ref={canvasRef} aria-label={`Tekening pagina ${pageNumber}`} />

              {/* De vinkjeslaag. Tikken zet een vinkje, op een vinkje tikken haalt hem weg. */}
              <div
                className="drawing-pin-layer drawing-check-layer"
                role={readOnly ? undefined : "button"}
                tabIndex={readOnly ? -1 : 0}
                aria-label="Tik om te markeren wat je hebt gecontroleerd"
                onClick={addPoint}
              >
                {pagePoints.map((point, index) => (
                  <span
                    key={point.id}
                    className="drawing-pin-anchor drawing-pin-anchor--pin"
                    style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, "--drawing-marker-scale": markerScale }}
                  >
                  <button
                    type="button"
                    className="drawing-check"
                    title={`Gecontroleerd ${index + 1}; tik om dit vinkje weg te halen`}
                    aria-label={`Gecontroleerd ${index + 1}, tik om weg te halen`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removePoint(point.id);
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

        {rendering ? <div className="form-drawing-sheet__rendering">Pagina wordt getekend...</div> : null}
      </div>

      <p className="form-drawing-sheet__note">
        Vinkjes staan alleen op dit apparaat en verdwijnen zodra je het formulier indient. Ze komen
        niet in het rapport.
      </p>
    </div>
  );
}
