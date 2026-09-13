export const CERTIFICATION_APPEARANCE = {
  VALID: { label: "Voldoet aan certificaateis", color: "#15803d", rank: 0 },
  EXPIRING: { label: "Verloopt binnenkort", color: "#b45309", rank: 2 },
  EXPIRED: { label: "Certificaat verlopen", color: "#b91c1c", rank: 4 },
  MISSING: { label: "Vereist certificaat ontbreekt", color: "#b91c1c", rank: 5 },
  UNKNOWN: { label: "Beoordeling nodig", color: "#64748b", rank: 3 },
  CONTRACT_ENDED: { label: "Contract beëindigd", color: "#64748b", rank: 1 },
  NOT_REQUIRED: { label: "Geen certificaateis", color: "#64748b", rank: -1 },
};
export function certificationAppearance(status) {
  return CERTIFICATION_APPEARANCE[status] || CERTIFICATION_APPEARANCE.UNKNOWN;
}
