export function getInstallationStatusCode(value) {
  if (value && typeof value === "object") {
    return getInstallationStatusCode(
      value.installation_status ?? value.installationStatus ?? value.status
    );
  }

  return String(value ?? "").trim().toUpperCase();
}

export function isHistoricalInstallation(value) {
  return getInstallationStatusCode(value) === "J";
}

export function getInstallationStatusLabel(value) {
  const code = getInstallationStatusCode(value);
  if (code === "N") return "Actueel";
  if (code === "J") return "Historisch";
  return code || "Onbekend";
}

export function getInstallationStatusTone(value) {
  const code = getInstallationStatusCode(value);
  if (code === "N") return "success";
  if (code === "J") return "danger";
  return "muted";
}

export function getInstallationStatusClassName(value) {
  return `ember-label ember-label--${getInstallationStatusTone(value)}`;
}
