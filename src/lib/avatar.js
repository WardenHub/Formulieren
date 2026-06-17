function firstNonEmpty(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }
  return null;
}

function normalizeLookupKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function buildInitials(name, email, fallback = "E") {
  const source = String(name || email || "").trim();
  if (!source) return fallback;

  const words = source
    .replace(/[|]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function getDirectoryDisplayName(item) {
  return String(
    item?.effective_display_name ||
      item?.preferred_display_name ||
      item?.display_name_snapshot ||
      item?.email_snapshot ||
      item?.email ||
      ""
  ).trim();
}

export function getDirectoryActorKeys(item) {
  const values = [
    item?.user_object_id,
    item?.email,
    item?.email_snapshot,
    item?.preferred_display_name,
    item?.display_name_snapshot,
    item?.effective_display_name,
  ];

  return Array.from(
    new Set(values.map(normalizeLookupKey).filter(Boolean))
  );
}

export function buildDirectoryActorLookup(items) {
  const byKey = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    for (const key of getDirectoryActorKeys(item)) {
      if (!byKey.has(key)) {
        byKey.set(key, item);
      }
    }
  }

  return byKey;
}

export function resolveActorDirectoryEntry(actorValue, actorLookup) {
  if (!actorLookup || typeof actorLookup.get !== "function") return null;
  const key = normalizeLookupKey(actorValue);
  if (!key) return null;
  return actorLookup.get(key) || null;
}

export function resolveActorDisplayName(actorValue, actorLookup, fallback = "-") {
  const directoryEntry = resolveActorDirectoryEntry(actorValue, actorLookup);
  const directoryName = getDirectoryDisplayName(directoryEntry);
  if (directoryName) return directoryName;

  const raw = String(actorValue || "").trim();
  return raw || fallback;
}

export function resolveAvatarMode(profileData) {
  return (
    profileData?.effective?.avatar_mode ||
    profileData?.avatar?.mode ||
    profileData?.profile?.avatar_source_preference ||
    profileData?.avatar?.requested_mode ||
    "microsoft"
  );
}

export function resolveProfileAvatarPath(profileData, meData = null) {
  const avatarMode = resolveAvatarMode(profileData);

  if (avatarMode === "none") return null;

  if (avatarMode === "microsoft") {
    return firstNonEmpty(
      profileData?.effective?.avatar_url,
      profileData?.effective?.avatar_download_url,
      profileData?.effective?.avatar_preview_url,
      profileData?.effective?.microsoft_avatar_url,
      profileData?.effective?.microsoft_photo_url,
      profileData?.profile?.avatar_url,
      meData?.profile?.avatar_url,
      "/me/profile/avatar/microsoft/file"
    );
  }

  return firstNonEmpty(
    profileData?.effective?.avatar_url,
    profileData?.effective?.avatar_download_url,
    profileData?.effective?.avatar_preview_url,
    profileData?.avatar?.download_url,
    profileData?.avatar?.preview_url,
    profileData?.avatar?.url,
    profileData?.profile?.avatar_url,
    meData?.profile?.avatar_url
  );
}

export function resolveDirectoryAvatarPath(item) {
  const avatarMode =
    item?.avatar?.mode ||
    item?.avatar?.requested_mode ||
    item?.profile?.avatar_source_preference ||
    "microsoft";

  if (avatarMode === "none") return null;

  return firstNonEmpty(
    item?.avatar?.url,
    item?.effective?.avatar_url,
    item?.effective?.avatar_download_url,
    item?.effective?.avatar_preview_url,
    item?.profile?.avatar_url
  );
}
