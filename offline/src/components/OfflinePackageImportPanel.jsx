import { useRef } from "react";
import { Download, FolderUp, PackagePlus } from "lucide-react";

export default function OfflinePackageImportPanel({
  busy,
  importMessage,
  error,
  onFilesSelected,
  onClearError,
}) {
  const fileInputRef = useRef(null);

  function openPicker() {
    fileInputRef.current?.click?.();
  }

  function handleInputChange(event) {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) onFilesSelected(files);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    onClearError?.();
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) onFilesSelected(files);
  }

  function handleDragOver(event) {
    event.preventDefault();
  }

  return (
    <section className="eo-card eo-import-panel">
      <div className="eo-card__header">
        <div>
          <div className="eo-section-title">Json-formulier laden</div>
          <div className="eo-section-subtitle">
            Gebruik dit alleen wanneer een formulier nog niet rechtstreeks vanuit Ember is klaargezet.
          </div>
        </div>
        <button type="button" className="eo-btn eo-btn--secondary" onClick={openPicker} disabled={busy}>
          <FolderUp size={18} />
          Kies formulier
        </button>
      </div>

      <div className="eo-import-dropzone" onDrop={handleDrop} onDragOver={handleDragOver} role="presentation">
        <div className="eo-import-dropzone__icon">
          <PackagePlus size={24} />
        </div>
        <div className="eo-import-dropzone__title">Sleep Ember Offline formulieren hierheen</div>
        <div className="eo-import-dropzone__copy">
          Het formulier wordt lokaal opgeslagen en verschijnt daarna meteen in de werkvoorraad.
        </div>
        <div className="eo-import-dropzone__actions">
          <button type="button" className="eo-btn eo-btn--primary" onClick={openPicker} disabled={busy}>
            <Download size={18} />
            Importeren
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="eo-hidden-input"
          type="file"
          accept=".json,application/json"
          multiple
          onChange={handleInputChange}
        />
      </div>

      {importMessage ? <div className="eo-inline-note eo-inline-note--success">{importMessage}</div> : null}
      {error ? <div className="eo-inline-note eo-inline-note--danger">{error}</div> : null}
    </section>
  );
}
