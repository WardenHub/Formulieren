//src/theme/appearance.js

const STORAGE_KEY = "ember.appearance_preference";

function normalizeAppearance(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "dark" || v === "light" || v === "system") return v;
  return "system";
}

function resolveEffectiveAppearance(preference) {
  const pref = normalizeAppearance(preference);

  if (pref === "dark" || pref === "light") return pref;

  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  return "dark";
}

export function applyAppearancePreference(preference) {
  const pref = normalizeAppearance(preference);
  const effective = resolveEffectiveAppearance(pref);

  document.documentElement.dataset.appearancePreference = pref;
  document.documentElement.dataset.appearance = effective;

  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // stil
  }

  return { preference: pref, effective };
}

export function applyStoredAppearancePreference() {
  let stored = "system";

  try {
    stored = localStorage.getItem(STORAGE_KEY) || "system";
  } catch {
    stored = "system";
  }

  return applyAppearancePreference(stored);
}

export function watchSystemAppearancePreference() {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const mq = window.matchMedia("(prefers-color-scheme: light)");

  const onChange = () => {
    const pref = document.documentElement.dataset.appearancePreference || "system";
    if (normalizeAppearance(pref) === "system") {
      applyAppearancePreference("system");
    }
  };

  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}