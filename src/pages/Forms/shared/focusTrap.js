// src/pages/Forms/shared/focusTrap.js
//
// Focusbeheer voor de runtime. Twee dingen die er niet waren:
//
//   1. na een paginawissel bleef de focus op het paginanummer staan, dus Tab begon weer
//      bovenaan de navigatie in plaats van bij de eerste vraag van de nieuwe pagina;
//   2. de dialogen hielden de focus niet vast, dus met Tab liep je erachter langs door het
//      formulier eronder, en bij sluiten was er geen weg terug.
//
// Bewust klein en zonder afhankelijkheden; het gaat om de twee gevallen die er zijn.

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function getFocusableElements(root) {
  if (!root) return [];

  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute("disabled")) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;

    // Onzichtbaar is niet focusbaar; een dichtgeklapt paneel hoort geen tabstop te zijn.
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  });
}

// Houdt de focus binnen een element zolang het open staat, en zet hem bij sluiten terug op
// wat er daarvoor de focus had. Geeft een opruimfunctie terug.
export function trapFocus(container, { initialFocus } = {}) {
  if (!container || typeof document === "undefined") return () => {};

  const previouslyFocused = document.activeElement;

  const focusFirst = () => {
    const target =
      (typeof initialFocus === "function" ? initialFocus() : initialFocus) ||
      getFocusableElements(container)[0] ||
      container;

    try {
      target.focus({ preventScroll: false });
    } catch {
      // Een element dat de focus weigert mag het openen nooit blokkeren.
    }
  };

  // Na de eerste render; de inhoud van een dialoog staat er soms een tik later.
  const frame = window.requestAnimationFrame(focusFirst);

  const onKeyDown = (event) => {
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(container);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener("keydown", onKeyDown);

  return () => {
    window.cancelAnimationFrame(frame);
    container.removeEventListener("keydown", onKeyDown);

    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      try {
        previouslyFocused.focus({ preventScroll: true });
      } catch {
        // Het element kan inmiddels weg zijn; dan blijft de focus waar hij is.
      }
    }
  };
}

// Zet de focus op het eerste invulbare veld van de actieve pagina. Alleen als de focus nu
// nergens nuttig staat, zodat het niet gebeurt terwijl iemand net ergens in typt.
export function focusFirstQuestionOnPage(pageRoot) {
  if (!pageRoot || typeof document === "undefined") return;

  const active = document.activeElement;
  const activeIsField =
    active && pageRoot.contains(active) && active.matches?.(FOCUSABLE_SELECTOR);

  if (activeIsField) return;

  const fields = getFocusableElements(pageRoot).filter((element) =>
    element.closest(".ember-runtime-field, .ember-runtime-card-field, .ember-runtime-matrix")
  );

  const target = fields[0];
  if (!target) return;

  try {
    target.focus({ preventScroll: true });
  } catch {
    // stil; focus is een hulp en geen eis
  }
}
