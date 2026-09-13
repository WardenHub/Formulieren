/** Pure policy; inputs must be resolved from explicit installation scope and source contracts. */
export type CertificateType = "MAINTENANCE" | "INSPECTION";
export type Scope = "BMI" | "OAI_B";
export type RequirementState = "REQUIRED" | "NOT_REQUIRED" | "CONTRACT_ENDED" | "UNKNOWN";
export type ContractState = "ACTIVE" | "ENDED" | "NONE" | "UNKNOWN" | "FUTURE";
export type EvidenceState = "VALID" | "EXPIRING" | "EXPIRED" | "MISSING" | "UNKNOWN" | "NOT_REQUIRED" | "CONTRACT_ENDED";

export interface RequirementInput {
  certificateType: CertificateType;
  scope: Scope;
  contract: ContractState;
  manualRequired: boolean;
}
export interface CertificateEvidence {
  certificate_type: string;
  scopes: readonly string[];
  record_status: string;
  verification_status: string;
  stored_file_id?: string | null;
  issue_date?: string | null;
  valid_until?: string | null;
}

// Explicit Ember types, not inferred from free-text Atrium labels.
export const INSTALLATION_CERTIFICATE_SCOPES: Readonly<Record<string, readonly Scope[]>> = {
  BMI: ["BMI"], BMI_OAI: ["BMI", "OAI_B"], OAI_TYPE_B: ["OAI_B"],
};

export function certificateWarningDays() {
  const configured = Number(process.env.CERTIFICATE_EXPIRY_WARNING_DAYS || 90);
  return Number.isInteger(configured) && configured >= 1 && configured <= 730 ? configured : 90;
}

export function contractState(services: readonly any[], category: string, today: string): ContractState {
  const relevant = services.filter((s) => s.service_category === category);
  if (!relevant.length) return "NONE";
  const states = relevant.map((s): ContractState => {
    const historical = String(s.contract_historical ?? "").trim().toUpperCase();
    const blocked = String(s.paragraph_blocked ?? "").trim().toUpperCase();
    if ((s.contract_key && !["N", "J"].includes(historical)) || !["N", "J"].includes(blocked)) return "UNKNOWN";
    if (historical === "J") return "ENDED";
    // Keep contract and paragraph boundaries independent; one cannot hide the other.
    const ends = [s.contract_end_date, s.paragraph_end_date].map(day).filter((d): d is string => Boolean(d));
    if (s.end_date_rule !== "IGNORE" && ends.some((d) => d < today && !(s.end_date_rule === "OPEN_30_DEC" && d.slice(5) === "12-30"))) return "ENDED";
    const starts = [s.contract_start_date, s.paragraph_start_date].map(day).filter((d): d is string => Boolean(d));
    if (starts.some((d) => d > today)) return "FUTURE";
    if (blocked === "J" || String(s.document_status_code ?? "").trim() !== "G") return "UNKNOWN";
    return "ACTIVE";
  });
  return (["ACTIVE", "UNKNOWN", "FUTURE", "ENDED"] as ContractState[]).find((s) => states.includes(s))!;
}

export function requirementState(input: RequirementInput): RequirementState {
  // Manual declarations cannot neutralize active contracts. Maintenance is contract-only.
  if (input.contract === "ACTIVE") return "REQUIRED";
  if (input.certificateType === "INSPECTION" && input.manualRequired) return "REQUIRED";
  if (input.contract === "ENDED") return "CONTRACT_ENDED";
  if (input.contract === "UNKNOWN") return "UNKNOWN";
  return "NOT_REQUIRED";
}

function day(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isFinite(value.getTime())) return null;
  const clean = (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const time = Date.parse(`${clean}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== clean) return null;
  return clean;
}

export function assessCertificate(
  requirement: RequirementInput,
  certificates: readonly CertificateEvidence[],
  today: string,
  warningDays = 90,
): { requirement_status: RequirementState; certificate_status: EvidenceState } {
  const reference = day(today);
  if (!reference || !Number.isInteger(warningDays) || warningDays < 0 || warningDays > 730) {
    throw new Error("Invalid certification reference date or warning period");
  }
  const state = requirementState(requirement);
  if (state !== "REQUIRED") return { requirement_status: state, certificate_status: state };
  const relevant = certificates.filter((c) => c.certificate_type === requirement.certificateType
    && c.scopes.includes(requirement.scope) && c.record_status === "CURRENT");
  if (!relevant.length) return { requirement_status: state, certificate_status: "MISSING" };
  const warningDate = new Date(`${reference}T00:00:00Z`);
  warningDate.setUTCDate(warningDate.getUTCDate() + warningDays);
  const warningUntil = warningDate.toISOString().slice(0, 10);
  const results: EvidenceState[] = relevant.map((c) => {
    if (c.verification_status !== "VERIFIED" || !c.stored_file_id) return "UNKNOWN";
    const issue = day(c.issue_date);
    const expiry = day(c.valid_until);
    if (!issue || !expiry || issue > reference || expiry < issue) return "UNKNOWN";
    if (expiry < reference) return "EXPIRED";
    return expiry <= warningUntil ? "EXPIRING" : "VALID";
  });
  // A valid document can cover a scope even if another current registration is incomplete.
  const best = (["VALID", "EXPIRING", "UNKNOWN", "EXPIRED"] as EvidenceState[])
    .find((status) => results.includes(status))!;
  return { requirement_status: state, certificate_status: best };
}

export function validateCertificateCoverage(allowedScopes: readonly Scope[], selected: readonly string[], combined: boolean) {
  if (!allowedScopes.length || !selected.length || new Set(selected).size !== selected.length
    || selected.some((scope) => !allowedScopes.includes(scope as Scope))) {
    throw new Error("Certificaat past niet bij de vastgelegde installatiesoort");
  }
  if (combined) {
    if (allowedScopes.length !== 2 || !allowedScopes.includes("BMI") || !allowedScopes.includes("OAI_B")
      || selected.length !== 2) throw new Error("Combinatiecertificaat vereist een geïntegreerde BMI-OAI type B installatie");
  } else if (selected.length !== 1) {
    throw new Error("Kies combinatiecertificaat of registreer de certificaten afzonderlijk");
  }
}
