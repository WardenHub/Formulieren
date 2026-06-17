function normalizeOptionalText(value: any): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function getUserObjectId(user: any): string | null {
  return normalizeOptionalText(user?.objectId);
}

export function getUserEmail(user: any): string | null {
  return (
    normalizeOptionalText(user?.email) ||
    normalizeOptionalText(user?.preferred_username) ||
    normalizeOptionalText(user?.upn) ||
    null
  );
}

export function getUserDisplayNameSnapshot(user: any): string {
  return (
    normalizeOptionalText(user?.name) ||
    getUserEmail(user) ||
    getUserObjectId(user) ||
    "unknown"
  );
}

export function getUserAuditActor(user: any): string {
  return (
    getUserObjectId(user) ||
    getUserEmail(user) ||
    getUserDisplayNameSnapshot(user) ||
    "unknown"
  );
}

export function getUserActorCandidates(user: any): string[] {
  return Array.from(
    new Set(
      [
        getUserObjectId(user),
        normalizeOptionalText(user?.email),
        normalizeOptionalText(user?.preferred_username),
        normalizeOptionalText(user?.upn),
        normalizeOptionalText(user?.name),
      ].filter(Boolean)
    )
  );
}
