import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument as loadPdfDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MapPin, X } from "lucide-react";

/* Een punt op de tekening zetten, zonder internet.
 *
 * De tekening staat al op het apparaat; hij is met het pakket meegekomen. Daarmee kan hier
 * precies hetzelfde gebeuren als online: een plek aanwijzen op de tekening en die bij het
 * punt bewaren. De pin wordt pas op kantoor echt aangemaakt, want daar hoort hij aan het
 * opvolgpunt te hangen dat uit dit werk voortkomt.
 *
 * De coördinaten zijn genormaliseerd, 0 tot 1 over breedte en hoogte, net als in
 * DrawingPinsTab. Daardoor maakt het niet uit hoe groot de tekening hier op het scherm staat;
 * op kantoor komt de pin op dezelfde plek terecht.
 */

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function isTekening(document) {
  const type = String(document?.mime_type || "").toLowerCase();
  const naam = String(document?.file_name || "").toLowerCase();

  if (type.startsWith("image/")) return true;
  if (type === "application/pdf") return true;
  return naam.endsWith(".pdf") || /\.(png|jpe?g|webp|gif)$/.test(naam);
}

function isPdf(document) {
  const type = String(document?.mime_type || "").toLowerCase();
  return type === "application/pdf" || String(document?.file_name || "").toLowerCase().endsWith(".pdf");
}

export default function OfflinePinPicker({ documents = [], huidigePin = null, onCancel, onConfirm }) {
  const tekeningen = useMemo(() => (Array.isArray(documents) ? documents.filter(isTekening) : []), [documents]);

  const [documentId, setDocumentId] = useState(
    huidigePin?.document_id || tekeningen[0]?.document_id || ""
  );
  const [pageNumber, setPageNumber] = useState(huidigePin?.page_number || 1);
  const [pageCount, setPageCount] = useState(1);
  const [positie, setPositie] = useState(
    huidigePin ? { x: huidigePin.x_normalized, y: huidigePin.y_normalized } : null
  );
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  const canvasRef = useRef(null);
  const afbeeldingUrlRef = useRef(null);

  const gekozen = tekeningen.find((document) => document.document_id === documentId) || null;

  useEffect(() => {
    let actief = true;
    let renderTaak = null;

    async function teken() {
      if (!gekozen?.blob || !canvasRef.current) return;

      setBezig(true);
      setFout("");

      try {
        if (isPdf(gekozen)) {
          const buffer = await gekozen.blob.arrayBuffer();
          const pdf = await loadPdfDocument({ data: buffer }).promise;
          if (!actief) return;

          setPageCount(pdf.numPages);
          const veiligePagina = Math.min(Math.max(1, pageNumber), pdf.numPages);
          const page = await pdf.getPage(veiligePagina);
          if (!actief) return;

          /* Vaste breedte; de tekening moet in één oogopslag te overzien zijn en de pin
             wordt toch genormaliseerd opgeslagen. */
          const basis = page.getViewport({ scale: 1, rotation: page.rotate });
          const schaal = 900 / basis.width;
          const viewport = page.getViewport({ scale: schaal, rotation: page.rotate });

          const canvas = canvasRef.current;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";

          renderTaak = page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport });
          await renderTaak.promise;
        } else {
          const url = URL.createObjectURL(gekozen.blob);
          if (afbeeldingUrlRef.current) URL.revokeObjectURL(afbeeldingUrlRef.current);
          afbeeldingUrlRef.current = url;

          const afbeelding = new Image();
          await new Promise((resolve, reject) => {
            afbeelding.onload = resolve;
            afbeelding.onerror = () => reject(new Error("De tekening kon niet worden geopend."));
            afbeelding.src = url;
          });
          if (!actief) return;

          setPageCount(1);
          const canvas = canvasRef.current;
          canvas.width = afbeelding.naturalWidth;
          canvas.height = afbeelding.naturalHeight;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.getContext("2d").drawImage(afbeelding, 0, 0);
        }
      } catch (error) {
        if (actief) setFout(error?.message || "De tekening kon niet worden getoond.");
      } finally {
        if (actief) setBezig(false);
      }
    }

    teken();

    return () => {
      actief = false;
      try {
        renderTaak?.cancel();
      } catch {
        // Een afgebroken tekening is geen fout.
      }
    };
  }, [gekozen, pageNumber]);

  useEffect(() => {
    return () => {
      if (afbeeldingUrlRef.current) URL.revokeObjectURL(afbeeldingUrlRef.current);
    };
  }, []);

  function plaats(event) {
    const doel = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - doel.left) / doel.width;
    const y = (event.clientY - doel.top) / doel.height;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    setPositie({
      x: Math.min(Math.max(x, 0), 1),
      y: Math.min(Math.max(y, 0), 1),
    });
  }

  function bevestig() {
    if (!gekozen || !positie) {
      setFout("Wijs eerst een plek op de tekening aan.");
      return;
    }

    onConfirm?.({
      document_id: gekozen.document_id,
      document_title: gekozen.title || gekozen.file_name || "Tekening",
      page_number: pageNumber,
      x_normalized: Number(positie.x.toFixed(6)),
      y_normalized: Number(positie.y.toFixed(6)),
    });
  }

  return (
    <div className="eo-pin-overlay" role="dialog" aria-modal="true" aria-label="Plek op tekening kiezen">
      <div className="eo-pin-dialog">
        <header className="eo-pin-dialog__head">
          <div>
            <div className="eo-pin-dialog__title">Plek op tekening</div>
            <p className="eo-pin-dialog__hint">Tik op de tekening waar het punt zit.</p>
          </div>
          <button type="button" className="eo-pin-dialog__close" onClick={onCancel} aria-label="Sluiten">
            <X size={18} />
          </button>
        </header>

        {tekeningen.length === 0 ? (
          <p className="eo-muted">
            Er staan geen tekeningen op dit apparaat. Neem ze mee bij het ophalen van het formulier; zonder tekening
            kun je hier geen plek aanwijzen.
          </p>
        ) : (
          <>
            <div className="eo-pin-dialog__controls">
              <label className="eo-points__field">
                <span>Tekening</span>
                <select
                  value={documentId}
                  onChange={(event) => {
                    setDocumentId(event.target.value);
                    setPageNumber(1);
                    setPositie(null);
                  }}
                >
                  {tekeningen.map((document) => (
                    <option key={document.document_id} value={document.document_id}>
                      {document.title || document.file_name}
                    </option>
                  ))}
                </select>
              </label>

              {pageCount > 1 ? (
                <div className="eo-pin-dialog__pages">
                  <button
                    type="button"
                    className="eo-btn eo-btn--secondary"
                    disabled={pageNumber <= 1}
                    onClick={() => {
                      setPageNumber((huidig) => Math.max(1, huidig - 1));
                      setPositie(null);
                    }}
                  >
                    Vorige
                  </button>
                  <span>
                    Pagina {pageNumber} van {pageCount}
                  </span>
                  <button
                    type="button"
                    className="eo-btn eo-btn--secondary"
                    disabled={pageNumber >= pageCount}
                    onClick={() => {
                      setPageNumber((huidig) => Math.min(pageCount, huidig + 1));
                      setPositie(null);
                    }}
                  >
                    Volgende
                  </button>
                </div>
              ) : null}
            </div>

            {/* De pin staat op dezelfde verhouding als hij is aangewezen; het canvas mag dus
                vrij schalen zonder dat de plek verschuift. */}
            <div className="eo-pin-dialog__canvas" onClick={plaats}>
              <canvas ref={canvasRef} />
              {positie ? (
                <span
                  className="eo-pin-dialog__marker"
                  style={{ left: `${positie.x * 100}%`, top: `${positie.y * 100}%` }}
                  aria-hidden="true"
                >
                  <MapPin size={26} />
                </span>
              ) : null}
            </div>

            {bezig ? <p className="eo-muted">Bezig met openen van de tekening.</p> : null}
            {fout ? <p className="eo-points__error">{fout}</p> : null}

            <div className="eo-points__actions">
              <button type="button" className="eo-btn eo-btn--secondary" onClick={onCancel}>
                Annuleren
              </button>
              <button type="button" className="eo-btn eo-btn--primary" onClick={bevestig} disabled={!positie}>
                Plek vastleggen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
