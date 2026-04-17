// /src/pages/Profile/ProfileSignaturePadModal.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

import { CheckCheckIcon } from "@/components/ui/check-check";
import { DeleteIcon } from "@/components/ui/delete";
import { ChevronLeftIcon } from "@/components/ui/chevron-left";

function getCanvasSize() {
  if (typeof window === "undefined") {
    return { width: 760, height: 260 };
  }

  const viewportWidth = window.innerWidth || 1280;
  const width = Math.min(760, Math.max(280, viewportWidth - 80));
  const height = width < 420 ? 200 : 260;

  return { width, height };
}

function dataUrlToFile(dataUrl, fileName) {
  const parts = String(dataUrl || "").split(",");
  const meta = parts[0] || "";
  const base64 = parts[1] || "";
  const mimeMatch = meta.match(/data:([^;]+);base64/i);
  const mime = mimeMatch?.[1] || "image/png";

  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], fileName, { type: mime });
}

function buildTrimmedTransparentCanvas(sourceCanvas, padding = 12) {
  const srcCtx = sourceCanvas.getContext("2d");
  const { width, height } = sourceCanvas;
  const imageData = srcCtx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropW = Math.min(width - cropX, maxX - minX + 1 + padding * 2);
  const cropH = Math.min(height - cropY, maxY - minY + 1 + padding * 2);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = cropW;
  outCanvas.height = cropH;

  const outCtx = outCanvas.getContext("2d");
  outCtx.clearRect(0, 0, cropW, cropH);
  outCtx.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropW,
    cropH,
    0,
    0,
    cropW,
    cropH
  );

  return outCanvas;
}

export default function ProfileSignaturePadModal({
  open,
  busy = false,
  onClose,
  onSave,
}) {
  const sigRef = useRef(null);
  const wrapperRef = useRef(null);

  const [hasStroke, setHasStroke] = useState(false);
  const [canvasSize, setCanvasSize] = useState(getCanvasSize());

  const dpr = useMemo(() => {
    if (typeof window === "undefined") return 1;
    return Math.max(window.devicePixelRatio || 1, 1);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    function handleResize() {
      setCanvasSize(getCanvasSize());
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(e) {
      if (e.key === "Escape" && !busy) {
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) return;
    setHasStroke(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const pad = sigRef.current;
    if (!pad) return;

    const canvas = pad.getCanvas();
    const ratio = dpr;
    const cssWidth = canvasSize.width;
    const cssHeight = canvasSize.height;

    const previousData = !pad.isEmpty() ? pad.toData() : null;

    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    pad.clear();

    if (previousData && previousData.length > 0) {
      pad.fromData(previousData);
      setHasStroke(true);
    }
  }, [open, canvasSize, dpr]);

  function handleOverlayMouseDown(e) {
    if (busy) return;
    if (!wrapperRef.current) return;
    if (wrapperRef.current.contains(e.target)) return;
    onClose?.();
  }

  function handleClear() {
    if (busy) return;
    sigRef.current?.clear();
    setHasStroke(false);
  }

  async function handleSave() {
    const pad = sigRef.current;
    if (!pad || pad.isEmpty() || busy) return;

    const sourceCanvas = pad.getCanvas();
    const trimmedCanvas = buildTrimmedTransparentCanvas(sourceCanvas, 16);

    if (!trimmedCanvas) return;

    const dataUrl = trimmedCanvas.toDataURL("image/png");
    const file = dataUrlToFile(dataUrl, "signature.png");

    await onSave?.(file);
  }

  if (!open) return null;

  return (
    <div
      className="profile-signature-modal-backdrop"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={wrapperRef}
        className="profile-signature-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Handtekening tekenen"
      >
        <div className="profile-signature-modal-head">
          <div>
            <div className="profile-section-title">Handtekening tekenen</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Teken met muis, touch of stylus; opslaan maakt een transparante PNG
            </div>
          </div>
        </div>

        <div className="profile-signature-pad-shell">
          <SignatureCanvas
            ref={sigRef}
            penColor="black"
            backgroundColor="rgba(0,0,0,0)"
            canvasProps={{
              className: "profile-signature-pad-canvas",
            }}
            minWidth={0.8}
            maxWidth={2.2}
            onBegin={() => setHasStroke(true)}
            onEnd={() => setHasStroke(!sigRef.current?.isEmpty())}
          />
        </div>

        <div className="profile-signature-modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={handleClear}
          >
            <DeleteIcon size={18} className="nav-anim-icon" />
            Wissen
          </button>

          <div className="profile-signature-modal-actions-right">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => onClose?.()}
            >
              <ChevronLeftIcon size={18} className="nav-anim-icon" />
              Annuleren
            </button>

            <button
              type="button"
              className="btn"
              disabled={busy || !hasStroke}
              onClick={handleSave}
            >
              <CheckCheckIcon size={18} className="nav-anim-icon" />
              {busy ? "Opslaan..." : "Opslaan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}