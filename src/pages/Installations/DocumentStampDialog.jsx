import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { GlobalWorkerOptions, getDocument as loadPdfDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  addInstallationDocumentStamp,
  downloadInstallationDocumentFile,
} from "../../api/emberApi.js";
import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const STAMPS = [
  ["CALCULATIE", "Calculatie"],
  ["GECONTROLEERD", "Gecontroleerd"],
  ["INGETROKKEN", "Ingetrokken"],
  ["OPDRACHT", "Opdracht"],
  ["UITGIFTE", "Uitgifte"],
  ["VERVALLEN", "Vervallen"],
];

const STAMP_ASPECT_RATIO = 148.451 / 61.609;
const STAMP_WIDTH_NORMALIZED = 0.32;

function errorText(error) {
  return String(error?.message || error || "De stempel kon niet worden geplaatst.");
}

function StampPreview({ label, compact = false }) {
  return (
    <span className={`document-stamp-preview${compact ? " document-stamp-preview--compact" : ""}`}>
      <span className="document-stamp-preview__title">{label}</span>
      <span className="document-stamp-preview__brand"><span>W</span><b>/</b></span>
      {!compact ? (
        <span className="document-stamp-preview__rows">
          <span><b>Datum</b> vandaag</span>
          <span><b>Naam</b> jouw Entra-naam</span>
          <span><b>Functie</b> jouw Entra-functie</span>
        </span>
      ) : null}
    </span>
  );
}

export default function DocumentStampDialog({ code, documentId, documentTitle, onClose, onChanged }) {
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [availableWidth, setAvailableWidth] = useState(900);
  const [stampType, setStampType] = useState("");
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stampLabel = useMemo(
    () => STAMPS.find(([value]) => value === stampType)?.[1] || "",
    [stampType]
  );

  useEffect(() => {
    if (!shellRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect?.width) setAvailableWidth(entry.contentRect.width);
    });
    observer.observe(shellRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task = null;
    setLoading(true);
    setError("");

    downloadInstallationDocumentFile(code, documentId)
      .then((result) => result.blob.arrayBuffer())
      .then((buffer) => {
        if (cancelled) return null;
        task = loadPdfDocument({ data: buffer });
        return task.promise;
      })
      .then((document) => {
        if (!cancelled && document) setPdfDocument(document);
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorText(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      task?.destroy?.();
    };
  }, [code, documentId]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return undefined;
    let cancelled = false;

    async function render() {
      const page = await pdfDocument.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1, rotation: page.rotate });
      const cssScale = Math.max(0.2, (Math.max(320, availableWidth) - 24) / unscaled.width);
      const cssViewport = page.getViewport({ scale: cssScale, rotation: page.rotate });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = page.getViewport({ scale: cssScale * pixelRatio, rotation: page.rotate });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      setPageSize({ width: cssViewport.width, height: cssViewport.height });
      renderTaskRef.current = page.render({
        canvasContext: canvas.getContext("2d", { alpha: false }),
        viewport: renderViewport,
      });
      await renderTaskRef.current.promise;
    }

    render().catch((renderError) => {
      if (!cancelled && renderError?.name !== "RenderingCancelledException") setError(errorText(renderError));
    });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
    };
  }, [availableWidth, pageNumber, pdfDocument]);

  function choosePosition(event) {
    if (!stampType || !pageSize.width || !pageSize.height) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const heightNormalized = (STAMP_WIDTH_NORMALIZED * pageSize.width / STAMP_ASPECT_RATIO) / pageSize.height;
    const x = (event.clientX - rect.left) / rect.width - STAMP_WIDTH_NORMALIZED / 2;
    const y = (event.clientY - rect.top) / rect.height - heightNormalized / 2;
    setPosition({
      x: Math.min(1 - STAMP_WIDTH_NORMALIZED, Math.max(0, x)),
      y: Math.min(1 - heightNormalized, Math.max(0, y)),
      height: heightNormalized,
    });
  }

  async function saveStamp() {
    if (!stampType || !position) return;
    setSaving(true);
    setError("");
    try {
      await addInstallationDocumentStamp(code, documentId, {
        stamp_type: stampType,
        page_number: pageNumber,
        x_normalized: position.x,
        y_normalized: position.y,
        width_normalized: STAMP_WIDTH_NORMALIZED,
      });
      await onChanged?.();
      onClose?.();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-evidence-overlay document-stamp-overlay" role="dialog" aria-modal="true" aria-label="Document stempelen">
      <div className="document-stamp-dialog">
        <header className="document-stamp-dialog__header">
          <div>
            <div className="profile-section-title">Stempel toevoegen</div>
            <div className="muted">{documentTitle || "PDF-document"}</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Sluiten" title="Sluiten" onClick={onClose} disabled={saving}><X size={18} /></button>
        </header>

        <div className="document-stamp-dialog__body">
          <aside className="document-stamp-picker" aria-label="Kies een stempel">
            <strong>Kies een stempel</strong>
            <div className="document-stamp-picker__grid">
              {STAMPS.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`document-stamp-choice${stampType === value ? " is-selected" : ""}`}
                  aria-pressed={stampType === value}
                  onClick={() => {
                    setStampType(value);
                    setPosition(null);
                  }}
                >
                  <StampPreview label={label} compact />
                </button>
              ))}
            </div>
            <p className="muted ember-small-text">
              Bij Gecontroleerd controleert Ember dat jij niet de oorspronkelijke uploader bent.
            </p>
          </aside>

          <section className="document-stamp-workspace" ref={shellRef}>
            <div className="document-stamp-toolbar">
              <button type="button" className="icon-btn" aria-label="Vorige pagina" disabled={!pdfDocument || pageNumber <= 1} onClick={() => { setPageNumber((value) => value - 1); setPosition(null); }}><ChevronLeft size={18} /></button>
              <span>Pagina {pageNumber} van {pdfDocument?.numPages || 0}</span>
              <button type="button" className="icon-btn" aria-label="Volgende pagina" disabled={!pdfDocument || pageNumber >= pdfDocument.numPages} onClick={() => { setPageNumber((value) => value + 1); setPosition(null); }}><ChevronRight size={18} /></button>
            </div>

            {loading ? (
              <div className="document-stamp-loading" role="status"><LoaderPinwheelIcon size={30} active /><span>PDF wordt voorbereid...</span></div>
            ) : null}
            {error ? <div className="ember-alert ember-alert--warning">{error}</div> : null}
            {!loading && pdfDocument ? (
              <div className={`document-stamp-page${stampType ? " is-placing" : ""}`} style={{ width: pageSize.width || "auto", height: pageSize.height || "auto" }} onClick={choosePosition}>
                <canvas ref={canvasRef} aria-label={`PDF pagina ${pageNumber}`} />
                {position && stampLabel ? (
                  <span
                    className="document-stamp-placement"
                    style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: `${STAMP_WIDTH_NORMALIZED * 100}%`, height: `${position.height * 100}%` }}
                  >
                    <StampPreview label={stampLabel} />
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="muted ember-small-text document-stamp-hint">
              {!stampType ? "Kies links eerst een stempel." : !position ? "Klik op de gewenste plaats in de PDF." : "Klik opnieuw om de positie te verplaatsen."}
            </div>
          </section>
        </div>

        <footer className="document-stamp-dialog__footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={saveStamp} disabled={saving || !stampType || !position}>
            {saving ? "Stempel verwerken..." : "Stempel definitief plaatsen"}
          </button>
        </footer>
      </div>
    </div>
  );
}
