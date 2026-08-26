const INSTALLATION_TYPE_APPEARANCE = Object.freeze({
  BMI: { className: "type-bmi", color: "#e62b27", label: "BMI" },
  BMI_OAI: { className: "type-bmi-oai", color: "#f97316", label: "BMI en OAI" },
  OAI_TYPE_A: { className: "type-oai", color: "#0ea5e9", label: "OAI" },
  IBC: { className: "type-ibc", color: "#2563eb", label: "IBC" },
  TELEFONIE: { className: "type-telefonie", color: "#8b5cf6", label: "Telefonie" },
  CAMERA: { className: "type-camera", color: "#f59e0b", label: "Camera" },
});

const FALLBACK = Object.freeze({ className: "type-unknown", color: "#64748b", label: "Overig" });

export function getInstallationTypeAppearance(typeKey) {
  return INSTALLATION_TYPE_APPEARANCE[String(typeKey || "").trim().toUpperCase()] || FALLBACK;
}

export function getInstallationTypeLegend() {
  return Object.entries(INSTALLATION_TYPE_APPEARANCE).map(([typeKey, value]) => ({ typeKey, ...value }));
}
