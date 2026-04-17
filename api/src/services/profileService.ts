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
} from "../db/queries/profile.sql.js";
import {
  uploadUserProfileAvatarBlob,
  deleteUserProfileAvatarBlob,
  uploadUserProfileSignatureBlob,
  deleteUserProfileSignatureBlob,
} from "./blobStorageService.js";

function actorName(user: any) {
  return user?.name || user?.email || user?.objectId || "unknown";
}

function actorEmail(user: any) {
  return user?.email || null;
}

function toNullableString(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function sha256Hex(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeAppearancePreference(value: any) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "dark" || v === "light" || v === "system") return v;
  return "system";
}

function normalizeAvatarSourcePreference(value: any) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "uploaded" || v === "microsoft" || v === "none") return v;
  return "uploaded";
}

function normalizeSignatureSourcePreference(value: any) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "uploaded" || v === "none") return v;
  return "uploaded";
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
    avatar_source_preference: row?.avatar_source_preference ?? "uploaded",
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

async function ensureProfile(user: any) {
  const userObjectId = String(user?.objectId || "").trim();
  if (!userObjectId) {
    throw new Error("missing user object id");
  }

  const rows = await sqlQuery(ensureUserProfileSql, {
    userObjectId,
    emailSnapshot: toNullableString(user?.email),
    displayNameSnapshot: toNullableString(user?.name),
    actor: actorName(user),
  });

  return rows?.[0] ?? null;
}

async function loadProfileParts(user: any) {
  const userObjectId = String(user?.objectId || "").trim();
  if (!userObjectId) {
    throw new Error("missing user object id");
  }

  await ensureProfile(user);

  const [profileRows, avatarRows, signatureRows, statsRows] = await Promise.all([
    sqlQuery(getUserProfileSql, { userObjectId }),
    sqlQuery(getActiveUserProfileAvatarSql, { userObjectId }),
    sqlQuery(getActiveUserProfileSignatureSql, { userObjectId }),
    sqlQuery(getUserProfileStatsSql, {
      actorEmail: actorEmail(user),
      actorName: actorName(user),
    }),
  ]);

  const profileRow = profileRows?.[0] ?? null;
  const avatarRow = avatarRows?.[0] ?? null;
  const signatureRow = signatureRows?.[0] ?? null;
  const statsRow = statsRows?.[0] ?? {};

  const profile = mapProfileRow(profileRow, user);
  const avatar = mapAvatarRow(avatarRow);
  const signature = mapSignatureRow(signatureRow);

  const avatarMode = profile.avatar_source_preference || "uploaded";
  const signatureMode = profile.signature_source_preference || "uploaded";

  return {
    profile,
    avatar,
    signature,
    effective: {
      initials: buildInitials(profile.effective_display_name, profile.email_snapshot),
      avatar_mode: avatarMode,
      avatar_uploaded_available: !!avatar?.has_file,
      avatar_microsoft_available: true,
      avatar_has_any:
        (!!avatar?.has_file && avatarMode === "uploaded") ||
        avatarMode === "microsoft",
      signature_mode: signatureMode,
      signature_uploaded_available: !!signature?.has_file,
      signature_has_any: !!signature?.has_file && signatureMode === "uploaded",
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
        waiting: Number(statsRow?.waiting_count ?? 0),
        done: Number(statsRow?.done_count ?? 0),
        rejected: Number(statsRow?.rejected_count ?? 0),
        expired: Number(statsRow?.expired_count ?? 0),
        informative: Number(statsRow?.informative_count ?? 0),
      },
    },
  };
}

export async function getMyProfile(user: any) {
  return loadProfileParts(user);
}

export async function updateMyProfile(payload: any, user: any) {
  const userObjectId = String(user?.objectId || "").trim();
  if (!userObjectId) {
    throw new Error("missing user object id");
  }

  await ensureProfile(user);

  await sqlQuery(updateUserProfileSql, {
    userObjectId,
    preferredDisplayName: toNullableString(payload?.preferred_display_name),
    profileNote: toNullableString(payload?.profile_note),
    appearancePreference: normalizeAppearancePreference(payload?.appearance_preference),
    avatarSourcePreference: normalizeAvatarSourcePreference(payload?.avatar_source_preference),
    signatureSourcePreference: normalizeSignatureSourcePreference(payload?.signature_source_preference),
    actor: actorName(user),
  });

  return loadProfileParts(user);
}

export async function uploadMyAvatar(file: Express.Multer.File, user: any) {
  if (!file) throw new Error("missing file");

  const userObjectId = String(user?.objectId || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const placeholderRows = await sqlQuery(createUserProfileAvatarPlaceholderSql, {
    userObjectId,
    actor: actorName(user),
  });

  const avatar = placeholderRows?.[0] ?? null;
  if (!avatar?.avatar_id) {
    throw new Error("avatar create failed");
  }

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
      actor: actorName(user),
    });

    await sqlQuery(updateUserProfileSql, {
      userObjectId,
      preferredDisplayName: null,
      profileNote: null,
      appearancePreference: "system",
      avatarSourcePreference: "uploaded",
      signatureSourcePreference: "uploaded",
      actor: actorName(user),
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
  const userObjectId = String(user?.objectId || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const currentRows = await sqlQuery(getActiveUserProfileAvatarSql, { userObjectId });
  const current = currentRows?.[0] ?? null;

  if (current?.storage_key) {
    await deleteUserProfileAvatarBlob(String(current.storage_key));
  }

  await sqlQuery(deactivateActiveUserProfileAvatarSql, {
    userObjectId,
    actor: actorName(user),
  });

  return loadProfileParts(user);
}

export async function uploadMySignature(file: Express.Multer.File, user: any) {
  if (!file) throw new Error("missing file");

  const userObjectId = String(user?.objectId || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const placeholderRows = await sqlQuery(createUserProfileSignaturePlaceholderSql, {
    userObjectId,
    actor: actorName(user),
  });

  const signature = placeholderRows?.[0] ?? null;
  if (!signature?.signature_id) {
    throw new Error("signature create failed");
  }

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
      actor: actorName(user),
    });

    const currentRows = await sqlQuery(getUserProfileSql, { userObjectId });
    const current = currentRows?.[0] ?? null;

    await sqlQuery(updateUserProfileSql, {
      userObjectId,
      preferredDisplayName: current?.preferred_display_name ?? null,
      profileNote: current?.profile_note ?? null,
      appearancePreference: current?.appearance_preference ?? "system",
      avatarSourcePreference: current?.avatar_source_preference ?? "uploaded",
      signatureSourcePreference: "uploaded",
      actor: actorName(user),
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
  const userObjectId = String(user?.objectId || "").trim();
  if (!userObjectId) throw new Error("missing user object id");

  await ensureProfile(user);

  const currentRows = await sqlQuery(getActiveUserProfileSignatureSql, { userObjectId });
  const current = currentRows?.[0] ?? null;

  if (current?.storage_key) {
    await deleteUserProfileSignatureBlob(String(current.storage_key));
  }

  await sqlQuery(deactivateActiveUserProfileSignatureSql, {
    userObjectId,
    actor: actorName(user),
  });

  const profileRows = await sqlQuery(getUserProfileSql, { userObjectId });
  const currentProfile = profileRows?.[0] ?? null;

  await sqlQuery(updateUserProfileSql, {
    userObjectId,
    preferredDisplayName: currentProfile?.preferred_display_name ?? null,
    profileNote: currentProfile?.profile_note ?? null,
    appearancePreference: currentProfile?.appearance_preference ?? "system",
    avatarSourcePreference: currentProfile?.avatar_source_preference ?? "uploaded",
    signatureSourcePreference: "none",
    actor: actorName(user),
  });

  return loadProfileParts(user);
}