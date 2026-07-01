// /api/src/services/profileService.ts
import crypto from "node:crypto";
import { sqlQuery } from "../db/index.js";
import {
  ensureUserProfileSql,
  getUserProfileSql,
  getActiveUserProfileAvatarSql,
  getActiveUserProfileSignatureSql,
  updateUserProfileSql,
  createUserProfileAvatarPlaceholderSql,
  setUserProfileAvatarFileSql,
  deactivateActiveUserProfileAvatarSql,
  createUserProfileSignaturePlaceholderSql,
  setUserProfileSignatureFileSql,
  deactivateActiveUserProfileSignatureSql,
  getUserProfileStatsSql,
  getUserDirectorySql,
} from "../db/queries/profile.sql.js";
import {
  uploadUserProfileAvatarBlob,
  deleteUserProfileAvatarBlob,
  uploadUserProfileSignatureBlob,
  deleteUserProfileSignatureBlob,
} from "./blobStorageService.js";
import {
  getUserAuditActor,
  getUserDisplayNameSnapshot,
  getUserEmail,
  getUserObjectId,
} from "../utils/userIdentity.js";

function toNullableString(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function sha256Hex(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function looksLikeGuid(value: any) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function looksLikeRealEmail(value: any) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function canUseMicrosoftAvatar(profile: any) {
  return (
    looksLikeGuid(profile?.user_object_id) ||
    looksLikeRealEmail(profile?.email_snapshot)
  );
}

function resolveAvatarMode(profile: any, avatar: any) {
  const requested = profile?.avatar_source_preference || "microsoft";
  const microsoftAvailable = canUseMicrosoftAvatar(profile);

  if (requested === "none") return "none";
  if (requested === "uploaded") return avatar?.has_file ? "uploaded" : "none";

  if (requested === "microsoft") {
    if (microsoftAvailable) return "microsoft";
    if (avatar?.has_file) return "uploaded";
    return "none";
  }

  if (avatar?.has_file) return "uploaded";
  if (microsoftAvailable) return "microsoft";
  return "none";
}

function normalizeAppearancePreference(value: any) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "dark" || v === "light" || v === "system") return v;
  return "system";
}

function normalizeAvatarSourcePreference(value: any) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "uploaded" || v === "microsoft" || v === "none") return v;
  return "microsoft";
}

function normalizeSignatureSourcePreference(value: any) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "uploaded" || v === "none") return v;
  return "uploaded";
}

function normalizeNotificationReminderFrequency(value: any) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "daily" || v === "weekly" || v === "monthly" || v === "none") return v;
  return "none";
}

function mapProfileRow(row: any, user: any) {
  const preferredDisplayName = row?.preferred_display_name ?? null;
  const snapshotName = row?.display_name_snapshot ?? user?.name ?? null;
  const snapshotEmail = row?.email_snapshot ?? user?.email ?? null;

  return {
    user_object_id: row?.user_object_id ?? user?.objectId ?? null,
    email_snapshot: snapshotEmail,
    display_name_snapshot: snapshotName,
    preferred_display_name: preferredDisplayName,
    effective_display_name: preferredDisplayName || snapshotName || snapshotEmail || "Gebruiker",
    profile_note: row?.profile_note ?? null,
    appearance_preference: row?.appearance_preference ?? "system",
    avatar_source_preference: row?.avatar_source_preference ?? "microsoft",
    notification_reminder_frequency: row?.notification_reminder_frequency ?? "none",
    signature_source_preference: row?.signature_source_preference ?? "uploaded",
    created_at: row?.created_at ?? null,
    created_by: row?.created_by ?? null,
    updated_at: row?.updated_at ?? null,
    updated_by: row?.updated_by ?? null,
  };
}

function mapAvatarRow(row: any) {
  if (!row) return null;

  return {
    avatar_id: row.avatar_id,
    file_name: row.file_name ?? null,
    mime_type: row.mime_type ?? null,
    file_size_bytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
    storage_provider: row.storage_provider ?? null,
    storage_key: row.storage_key ?? null,
    uploaded_at: row.uploaded_at ?? null,
    uploaded_by: row.uploaded_by ?? null,
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
    has_file: !!row.storage_key,
  };
}

function mapSignatureRow(row: any) {
  if (!row) return null;

  return {
    signature_id: row.signature_id,
    file_name: row.file_name ?? null,
    mime_type: row.mime_type ?? null,
    file_size_bytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
    storage_provider: row.storage_provider ?? null,
    storage_key: row.storage_key ?? null,
    image_width_px: row.image_width_px == null ? null : Number(row.image_width_px),
    image_height_px: row.image_height_px == null ? null : Number(row.image_height_px),
    uploaded_at: row.uploaded_at ?? null,
    uploaded_by: row.uploaded_by ?? null,
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
    has_file: !!row.storage_key,
  };
}

function buildInitials(name: string | null, email: string | null) {
  const source = String(name || email || "").trim();
  if (!source) return "E";

  const words = source
    .replace(/[|]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function buildTeamsDeepLink(email: string | null) {
  const safe = String(email || "").trim();
  if (!safe) return null;
  if (!looksLikeRealEmail(safe)) return null;

  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(safe)}`;
}

async function ensureProfile(user: any) {
  const userObjectId = String(getUserObjectId(user) || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  const rows = await sqlQuery(ensureUserProfileSql, {
    userObjectId,
    emailSnapshot: getUserEmail(user),
    displayNameSnapshot: toNullableString(getUserDisplayNameSnapshot(user)),
    actor: getUserAuditActor(user),
  });

  return rows?.[0] ?? null;
}

async function loadProfileParts(user: any) {
  const userObjectId = String(getUserObjectId(user) || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const [profileRows, avatarRows, signatureRows, statsRows] = await Promise.all([
    sqlQuery(getUserProfileSql, { userObjectId }),
    sqlQuery(getActiveUserProfileAvatarSql, { userObjectId }),
    sqlQuery(getActiveUserProfileSignatureSql, { userObjectId }),
    sqlQuery(getUserProfileStatsSql, {
      actorObjectId: getUserObjectId(user),
      actorEmail: getUserEmail(user),
      actorName: getUserDisplayNameSnapshot(user),
    }),
  ]);

  const profile = mapProfileRow(profileRows?.[0] ?? null, user);
  const avatar = mapAvatarRow(avatarRows?.[0] ?? null);
  const signature = mapSignatureRow(signatureRows?.[0] ?? null);
  const statsRow = statsRows?.[0] ?? {};

  const avatarMode = resolveAvatarMode(profile, avatar);
  const signatureMode = profile.signature_source_preference || "uploaded";
  const microsoftAvatarAvailable = canUseMicrosoftAvatar(profile);

  const avatarUrl =
    avatarMode === "microsoft"
      ? "/me/profile/avatar/microsoft/file"
      : avatarMode === "uploaded" && avatar?.has_file
        ? "/me/profile/avatar/file"
        : null;

  const signatureUrl =
    signature?.has_file && signatureMode === "uploaded"
      ? "/me/profile/signature/file"
      : null;

  return {
    profile,
    avatar,
    signature,
    effective: {
      initials: buildInitials(profile.effective_display_name, profile.email_snapshot),

      avatar_mode: avatarMode,
      avatar_requested_mode: profile.avatar_source_preference || "microsoft",
      avatar_uploaded_available: !!avatar?.has_file,
      avatar_microsoft_available: microsoftAvatarAvailable,
      avatar_has_any:
        (avatarMode === "microsoft" && microsoftAvatarAvailable) ||
        (avatarMode === "uploaded" && !!avatar?.has_file),

      avatar_url: avatarUrl,
      avatar_preview_url: avatarUrl,
      avatar_download_url: avatarUrl,

      signature_mode: signatureMode,
      signature_uploaded_available: !!signature?.has_file,
      signature_has_any: !!signature?.has_file && signatureMode === "uploaded",

      signature_url: signatureUrl,
      signature_preview_url: signatureUrl,
      signature_download_url: signatureUrl,
    },
    stats: {
      forms: {
        total: Number(statsRow?.total_forms ?? 0),
        concept: Number(statsRow?.concept_count ?? 0),
        ingediend: Number(statsRow?.ingediend_count ?? 0),
        in_behandeling: Number(statsRow?.in_behandeling_count ?? 0),
        afgehandeld: Number(statsRow?.afgehandeld_count ?? 0),
        ingetrokken: Number(statsRow?.ingetrokken_count ?? 0),
      },
      follow_ups: {
        total: Number(statsRow?.total_follow_ups ?? 0),
        open: Number(statsRow?.open_count ?? 0),
        planning_needed: Number(statsRow?.planning_needed_count ?? 0),
        waiting: Number(statsRow?.waiting_count ?? 0),
        planned: Number(statsRow?.planned_count ?? 0),
        done: Number(statsRow?.done_count ?? 0),
        rejected: Number(statsRow?.rejected_count ?? 0),
        expired: Number(statsRow?.expired_count ?? 0),
        informative: Number(statsRow?.informative_count ?? 0),
      },
    },
  };
}

function mapDirectoryRow(row: any, currentUserObjectId: string | null) {
  const preferredDisplayName = row?.preferred_display_name ?? null;
  const displayNameSnapshot = row?.display_name_snapshot ?? null;
  const emailSnapshot = row?.email_snapshot ?? null;
  const effectiveDisplayName =
    preferredDisplayName || displayNameSnapshot || emailSnapshot || "Gebruiker";

  const profileForAvatar = {
    user_object_id: row?.user_object_id ?? null,
    email_snapshot: emailSnapshot,
    avatar_source_preference: row?.avatar_source_preference ?? "microsoft",
  };

  const avatarForResolve = {
    has_file: !!row?.avatar_storage_key,
  };

  const avatarMode = resolveAvatarMode(profileForAvatar, avatarForResolve);
  const hasAvatarFile = !!row?.avatar_storage_key;
  const userObjectId = String(row?.user_object_id || "");

  const avatarUrl =
    avatarMode === "microsoft"
      ? `/me/profile/directory/${encodeURIComponent(userObjectId)}/avatar/microsoft/file`
      : hasAvatarFile && avatarMode === "uploaded"
        ? `/me/profile/directory/${encodeURIComponent(userObjectId)}/avatar/file`
        : null;

  return {
    user_object_id: row?.user_object_id ?? null,
    email: emailSnapshot,
    display_name_snapshot: displayNameSnapshot,
    preferred_display_name: preferredDisplayName,
    effective_display_name: effectiveDisplayName,
    initials: buildInitials(effectiveDisplayName, emailSnapshot),
    profile_note: row?.profile_note ?? null,

    avatar: {
      mode: avatarMode,
      requested_mode: row?.avatar_source_preference ?? "microsoft",
      has_file: hasAvatarFile,
      microsoft_available: canUseMicrosoftAvatar(profileForAvatar),
      file_name: row?.avatar_file_name ?? null,
      mime_type: row?.avatar_mime_type ?? null,
      file_size_bytes:
        row?.avatar_file_size_bytes == null ? null : Number(row.avatar_file_size_bytes),
      url: avatarUrl,
    },

    stats: {
      forms_total: Number(row?.total_forms ?? 0),
      follow_ups_total: Number(row?.total_follow_ups ?? 0),
      follow_ups_open: Number(row?.open_follow_ups ?? 0),
      follow_ups_done: Number(row?.done_follow_ups ?? 0),
    },

    teams_chat_url: buildTeamsDeepLink(emailSnapshot),
    is_current_user:
      !!currentUserObjectId &&
      String(row?.user_object_id || "") === String(currentUserObjectId),
  };
}

export async function getMyProfile(user: any) {
  return loadProfileParts(user);
}

export async function getDirectory(user: any) {
  const rows = await sqlQuery(getUserDirectorySql, {});
  const currentUserObjectId = String(getUserObjectId(user) || "").trim() || null;

  return {
    items: (rows || [])
      .filter((row: any) => {
        const email = String(row?.email_snapshot || "").trim().toLowerCase();
        return email !== "jesse@local" && email !== "adminwb@wardenburg.nl";
      })
      .map((row: any) => mapDirectoryRow(row, currentUserObjectId)),
  };
}

export async function updateMyProfile(payload: any, user: any) {
  const userObjectId = String(getUserObjectId(user) || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  await sqlQuery(updateUserProfileSql, {
    userObjectId,
    preferredDisplayName: toNullableString(payload?.preferred_display_name),
    profileNote: toNullableString(payload?.profile_note),
    appearancePreference: normalizeAppearancePreference(payload?.appearance_preference),
    avatarSourcePreference: normalizeAvatarSourcePreference(payload?.avatar_source_preference),
    notificationReminderFrequency: normalizeNotificationReminderFrequency(
      payload?.notification_reminder_frequency
    ),
    signatureSourcePreference: normalizeSignatureSourcePreference(payload?.signature_source_preference),
    actor: getUserAuditActor(user),
  });

  return loadProfileParts(user);
}

export async function uploadMyAvatar(file: Express.Multer.File, user: any) {
  if (!file) throw new Error("missing file");

  const userObjectId = String(getUserObjectId(user) || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const currentRowsBefore = await sqlQuery(getUserProfileSql, { userObjectId });
  const currentBefore = currentRowsBefore?.[0] ?? null;

  const placeholderRows = await sqlQuery(createUserProfileAvatarPlaceholderSql, {
    userObjectId,
    actor: getUserAuditActor(user),
  });

  const avatar = placeholderRows?.[0] ?? null;
  if (!avatar?.avatar_id) throw new Error("avatar create failed");

  const checksum = sha256Hex(file.buffer);
  let uploaded: { storageProvider: string; storageKey: string; storageUrl: string | null } | null = null;

  try {
    uploaded = await uploadUserProfileAvatarBlob({
      userObjectId,
      avatarId: String(avatar.avatar_id),
      fileName: file.originalname,
      contentType: file.mimetype || "application/octet-stream",
      buffer: file.buffer,
    });

    await sqlQuery(setUserProfileAvatarFileSql, {
      userObjectId,
      avatarId: avatar.avatar_id,
      fileName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      fileSizeBytes: file.size ?? file.buffer.length,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      checksumSha256: checksum,
      actor: getUserAuditActor(user),
    });

    await sqlQuery(updateUserProfileSql, {
      userObjectId,
      preferredDisplayName: currentBefore?.preferred_display_name ?? null,
      profileNote: currentBefore?.profile_note ?? null,
      appearancePreference: currentBefore?.appearance_preference ?? "system",
      avatarSourcePreference: "uploaded",
      notificationReminderFrequency:
        currentBefore?.notification_reminder_frequency ?? "none",
      signatureSourcePreference: currentBefore?.signature_source_preference ?? "uploaded",
      actor: getUserAuditActor(user),
    });

    return loadProfileParts(user);
  } catch (err) {
    if (uploaded?.storageKey) {
      try {
        await deleteUserProfileAvatarBlob(uploaded.storageKey);
      } catch (cleanupErr) {
        console.error("[profile avatar upload] blob cleanup failed", cleanupErr);
      }
    }
    throw err;
  }
}

export async function deleteMyAvatar(user: any) {
  const userObjectId = String(getUserObjectId(user) || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const currentRows = await sqlQuery(getActiveUserProfileAvatarSql, { userObjectId });
  const current = currentRows?.[0] ?? null;

  if (current?.storage_key) {
    await deleteUserProfileAvatarBlob(String(current.storage_key));
  }

  await sqlQuery(deactivateActiveUserProfileAvatarSql, {
    userObjectId,
    actor: getUserAuditActor(user),
  });

  const profileRows = await sqlQuery(getUserProfileSql, { userObjectId });
  const currentProfile = profileRows?.[0] ?? null;

  await sqlQuery(updateUserProfileSql, {
    userObjectId,
    preferredDisplayName: currentProfile?.preferred_display_name ?? null,
    profileNote: currentProfile?.profile_note ?? null,
    appearancePreference: currentProfile?.appearance_preference ?? "system",
    avatarSourcePreference: "microsoft",
    notificationReminderFrequency:
      currentProfile?.notification_reminder_frequency ?? "none",
    signatureSourcePreference: currentProfile?.signature_source_preference ?? "uploaded",
    actor: getUserAuditActor(user),
  });

  return loadProfileParts(user);
}

export async function uploadMySignature(file: Express.Multer.File, user: any) {
  if (!file) throw new Error("missing file");

  const userObjectId = String(getUserObjectId(user) || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const currentRowsBefore = await sqlQuery(getUserProfileSql, { userObjectId });
  const currentBefore = currentRowsBefore?.[0] ?? null;

  const placeholderRows = await sqlQuery(createUserProfileSignaturePlaceholderSql, {
    userObjectId,
    actor: getUserAuditActor(user),
  });

  const signature = placeholderRows?.[0] ?? null;
  if (!signature?.signature_id) throw new Error("signature create failed");

  const checksum = sha256Hex(file.buffer);
  let uploaded: { storageProvider: string; storageKey: string; storageUrl: string | null } | null = null;

  try {
    uploaded = await uploadUserProfileSignatureBlob({
      userObjectId,
      signatureId: String(signature.signature_id),
      fileName: file.originalname,
      contentType: file.mimetype || "application/octet-stream",
      buffer: file.buffer,
    });

    await sqlQuery(setUserProfileSignatureFileSql, {
      userObjectId,
      signatureId: signature.signature_id,
      fileName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      fileSizeBytes: file.size ?? file.buffer.length,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      checksumSha256: checksum,
      imageWidthPx: null,
      imageHeightPx: null,
      actor: getUserAuditActor(user),
    });

    await sqlQuery(updateUserProfileSql, {
      userObjectId,
      preferredDisplayName: currentBefore?.preferred_display_name ?? null,
      profileNote: currentBefore?.profile_note ?? null,
      appearancePreference: currentBefore?.appearance_preference ?? "system",
      avatarSourcePreference: currentBefore?.avatar_source_preference ?? "microsoft",
      notificationReminderFrequency:
        currentBefore?.notification_reminder_frequency ?? "none",
      signatureSourcePreference: "uploaded",
      actor: getUserAuditActor(user),
    });

    return loadProfileParts(user);
  } catch (err) {
    if (uploaded?.storageKey) {
      try {
        await deleteUserProfileSignatureBlob(uploaded.storageKey);
      } catch (cleanupErr) {
        console.error("[profile signature upload] blob cleanup failed", cleanupErr);
      }
    }
    throw err;
  }
}

export async function deleteMySignature(user: any) {
  const userObjectId = String(getUserObjectId(user) || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const currentRows = await sqlQuery(getActiveUserProfileSignatureSql, { userObjectId });
  const current = currentRows?.[0] ?? null;

  if (current?.storage_key) {
    await deleteUserProfileSignatureBlob(String(current.storage_key));
  }

  await sqlQuery(deactivateActiveUserProfileSignatureSql, {
    userObjectId,
    actor: getUserAuditActor(user),
  });

  const profileRows = await sqlQuery(getUserProfileSql, { userObjectId });
  const currentProfile = profileRows?.[0] ?? null;

  await sqlQuery(updateUserProfileSql, {
    userObjectId,
    preferredDisplayName: currentProfile?.preferred_display_name ?? null,
    profileNote: currentProfile?.profile_note ?? null,
    appearancePreference: currentProfile?.appearance_preference ?? "system",
    avatarSourcePreference: currentProfile?.avatar_source_preference ?? "microsoft",
    notificationReminderFrequency:
      currentProfile?.notification_reminder_frequency ?? "none",
    signatureSourcePreference: "none",
    actor: getUserAuditActor(user),
  });

  return loadProfileParts(user);
}
