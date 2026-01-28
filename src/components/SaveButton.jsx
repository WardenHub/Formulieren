// /src/components/SaveButton.jsx
import { Check, Loader2, Save } from "lucide-react";

export default function SaveButton({ disabled, saving, saved, onClick, pulse }) {
  const isDisabled = disabled || saving;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={`btn-save ${pulse && !isDisabled ? "pulse" : ""}`}
      aria-busy={saving ? "true" : "false"}
      title={
        saving
          ? "opslaan..."
          : disabled
          ? "geen wijzigingen"
          : "opslaan (Alt+S)"
      }
    >
      {saving && <Loader2 size={25} className="spin" />}
      {!saving && saved && <Check size={25} className="icon-success" />}
      {!saving && !saved && <Save size={25} />}

      <span className="btn-save-text">{saving ? "opslaan" : saved ? "opgeslagen" : "opslaan"}</span>
    </button>
  );
}
