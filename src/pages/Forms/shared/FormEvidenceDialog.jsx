import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { trapFocus } from "./focusTrap.js";

export default function FormEvidenceDialog({ title, description, onClose, busy = false, wide = false, closeLabel = "Terug", children }) {
  const dialogRef = useRef(null);

  useEffect(() => trapFocus(dialogRef.current), []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  return createPortal(
    <div className="form-evidence-overlay" onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!busy) onClose();
      }
    }}>
      <section ref={dialogRef} className={`form-evidence-dialog${wide ? " form-evidence-dialog--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="form-evidence-dialog__head">
          <div><h2>{title}</h2>{description ? <p className="muted">{description}</p> : null}</div>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{closeLabel}</button>
        </header>
        <div className="form-evidence-dialog__body">{children}</div>
      </section>
    </div>,
    document.body
  );
}
