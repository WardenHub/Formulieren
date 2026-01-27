import { Check, Loader2, Save } from "lucide-react";

export default function SaveButton({ disabled, saving, saved, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || saving}
      className="btn-save"
      aria-busy={saving ? "true" : "false"}
    >
      {saving && <Loader2 size={16} className="spin" />}
      {!saving && saved && <Check size={16} />}
      {!saving && !saved && <Save size={16} />}

      <span className="btn-save-text">
        {saving ? "opslaan" : saved ? "opgeslagen" : "opslaan"}
      </span>
    </button>
  );
}
