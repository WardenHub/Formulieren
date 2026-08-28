import { useId, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatDateInput, parseDateInput } from "../lib/dateInput.js";

export default function DateInput({ value, onChange, allowEmpty = true, disabled = false, id, name, "aria-label": ariaLabel }) {
  const generatedId = useId();
  const inputId = id || `date-${generatedId}`;
  const lastCommitted = String(value || "").slice(0, 10);
  const [draft, setDraft] = useState(() => ({ source: lastCommitted, text: formatDateInput(value) }));
  const [validation, setValidation] = useState(() => ({ source: lastCommitted, error: "" }));
  const text = draft.source === lastCommitted ? draft.text : formatDateInput(value);
  const error = validation.source === lastCommitted ? validation.error : "";

  function setText(nextText) {
    setDraft({ source: lastCommitted, text: nextText });
  }

  function setError(nextError) {
    setValidation({ source: lastCommitted, error: nextError });
  }

  function commit(raw = text) {
    const parsed = parseDateInput(raw);
    if (!parsed.iso && !String(raw || "").trim() && !allowEmpty) {
      setError("Een datum is verplicht.");
      return false;
    }
    if (parsed.error) {
      setError(parsed.error);
      return false;
    }
    setError("");
    setText(formatDateInput(parsed.iso));
    onChange?.(parsed.iso);
    return true;
  }

  return (
    <div className={`ember-date-input${error ? " ember-date-input--invalid" : ""}`}>
      <div className="ember-date-input__row">
        <input
          id={inputId}
          name={name}
          className="cf-input ember-date-input__text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={text}
          aria-label={ariaLabel}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          placeholder="dd-mm-jjjj"
          onChange={(event) => { setText(event.target.value); setError(""); }}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commit(); }
          }}
        />
        <button type="button" className="icon-btn ember-date-input__button" disabled={disabled} tabIndex={-1} aria-hidden="true">
          <CalendarDays size={17} />
        </button>
        <input
          className="ember-date-input__native"
          type="date"
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel}; datumkiezer` : "Datum kiezen"}
          title="Datum kiezen"
          value={lastCommitted}
          onChange={(event) => {
            const iso = event.target.value || null;
            setText(formatDateInput(iso));
            setError("");
            onChange?.(iso);
          }}
        />
      </div>
      {error ? <small id={`${inputId}-error`} className="ember-date-input__error">{error}</small> : null}
    </div>
  );
}
