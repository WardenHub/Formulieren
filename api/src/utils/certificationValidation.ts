/** Expected user-input failures; do not expose arbitrary database errors as validation. */
export class CertificationValidationError extends Error {
  readonly status = 400;
}

// SQL uniqueidentifier/NEWSEQUENTIALID is not limited to RFC UUID version bits.
export function certificationIdentifier(value: unknown, required = true): string | null {
  const clean = String(value ?? "").trim();
  if (!clean && !required) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    throw new CertificationValidationError("Ongeldige identificatiesleutel");
  }
  return clean;
}

export function certificationDate(value: unknown): string | null {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const timestamp = Date.parse(`${clean}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().slice(0, 10) !== clean) {
    throw new CertificationValidationError("Vul een bestaande kalenderdatum in");
  }
  return clean;
}
