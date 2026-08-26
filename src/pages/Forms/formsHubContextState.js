export const MINIMUM_CONTEXT_SEARCH_LENGTH = 3;

export function resetForPrimaryContext(current, primaryType, item) {
  const next = {};
  if (current?.EMPLOYEE && primaryType !== "EMPLOYEE") next.EMPLOYEE = current.EMPLOYEE;
  if (item) next[primaryType] = { ...item, derivation_type: "SELECTED" };
  return next;
}

export function groupDerivedContexts(items, allowedTypes, primaryType, primaryKey) {
  return (Array.isArray(items) ? items : []).reduce((groups, candidate) => {
    const type = String(candidate?.context_type || "").toUpperCase();
    if (!allowedTypes.has(type)) return groups;
    if (type === primaryType && candidate?.source_key === primaryKey) return groups;
    if (!groups[type]) groups[type] = [];
    groups[type].push({ ...candidate, derivation_type: "DERIVED" });
    return groups;
  }, {});
}

export function applyUnambiguousDerivedContexts(current, grouped) {
  const next = { ...current };
  for (const [type, candidates] of Object.entries(grouped || {})) {
    if (!next[type] && candidates.length === 1) next[type] = candidates[0];
  }
  return next;
}
