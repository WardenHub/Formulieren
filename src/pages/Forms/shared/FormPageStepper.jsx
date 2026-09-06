//src/pages/Forms/shared/FormPageStepper.jsx

import { getPageTitle } from "./surveyCore.jsx";

function readPageTitle(pages, pageIndex) {
  const page = Array.isArray(pages) ? pages[pageIndex] : null;
  if (!page) return "";

  return String(getPageTitle(page) || "").trim();
}

// Paginanavigatie onderaan het formulier. De genummerde pills bovenin blijven bestaan
// voor gericht springen; dit is de doorloopnavigatie en op smalle schermen de enige
// navigatie die zonder scrollen naar boven bereikbaar is.
export function FormPageStepper({
  pages,
  currentPageIndex,
  onGoToPage,
  onSubmit,
  onSave,
  submitLabel = "Indienen",
  saveLabel = "Opslaan",
  canSubmit = false,
  canSave = false,
  saveBusy = false,
}) {
  const list = Array.isArray(pages) ? pages : [];
  const total = list.length;

  if (total <= 1) return null;

  const index = Math.min(Math.max(Number(currentPageIndex) || 0, 0), total - 1);
  const hasPrevious = index > 0;
  const hasNext = index < total - 1;

  const previousTitle = hasPrevious ? readPageTitle(list, index - 1) : "";
  const nextTitle = hasNext ? readPageTitle(list, index + 1) : "";

  const showSubmit = !hasNext && canSubmit && typeof onSubmit === "function";
  // Opslaan staat in de kop, en die is op een telefoon onderaan een lange pagina niet in
  // beeld. Hier staat hij naast de doorloopnavigatie, op de plek waar de gebruiker toch al
  // kijkt als hij klaar is met een pagina.
  const showSave = canSave && typeof onSave === "function";

  return (
    <nav className="ember-page-stepper" aria-label="Paginanavigatie">
      <button
        type="button"
        className="ember-page-stepper__btn ember-page-stepper__btn--prev"
        onClick={() => onGoToPage(index - 1)}
        disabled={!hasPrevious}
      >
        <span className="ember-page-stepper__btn-label">Vorige</span>
        {previousTitle ? (
          <span className="ember-page-stepper__btn-title">{previousTitle}</span>
        ) : null}
      </button>

      <div className="ember-page-stepper__middle">
        <span className="ember-page-stepper__position" aria-live="polite">
          Pagina {index + 1} van {total}
        </span>

        {showSave ? (
          <button
            type="button"
            className="ember-page-stepper__save"
            onClick={onSave}
            disabled={saveBusy}
          >
            {saveBusy ? "Opslaan..." : saveLabel}
          </button>
        ) : null}
      </div>

      {showSubmit ? (
        <button
          type="button"
          className="ember-page-stepper__btn ember-page-stepper__btn--submit"
          onClick={onSubmit}
        >
          <span className="ember-page-stepper__btn-label">{submitLabel}</span>
        </button>
      ) : (
        <button
          type="button"
          className="ember-page-stepper__btn ember-page-stepper__btn--next"
          onClick={() => onGoToPage(index + 1)}
          disabled={!hasNext}
        >
          <span className="ember-page-stepper__btn-label">Volgende</span>
          {nextTitle ? (
            <span className="ember-page-stepper__btn-title">{nextTitle}</span>
          ) : null}
        </button>
      )}
    </nav>
  );
}

export default FormPageStepper;
