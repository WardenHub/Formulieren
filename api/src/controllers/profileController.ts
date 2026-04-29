// /api/src/controllers/profileController.ts

import type { Response } from "express";
import * as service from "../services/profileService.js";
import {
  downloadUserProfileAvatarBlob,
  downloadUserProfileSignatureBlob,
} from "../services/blobStorageService.js";
import { sqlQuery } from "../db/index.js";
import {
  getActiveUserProfileAvatarSql,
  getActiveUserProfileSignatureSql,
  getUserProfileSql,
} from "../db/queries/profile.sql.js";
import { DefaultAzureCredential } from "@azure/identity";

const graphCredential = new DefaultAzureCredential();

function looksLikeGuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function looksLikeRealEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

async function tryDownloadMicrosoftUserPhoto(identifier: string | null | undefined) {
  const clean = String(identifier || "").trim();
  if (!clean) return null;

  if (!looksLikeGuid(clean) && !looksLikeRealEmail(clean)) {
    return null;
  }

  const token = await graphCredential.getToken("https://graph.microsoft.com/.default");

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(clean)}/photo/$value`,
    {
      headers: {
        Authorization: `Bearer ${token?.token}`,
      },
    }
  );

  if (res.status === 400 || res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[profile microsoft photo] graph failed", res.status, text);
    return null;
  }

  const arrayBuffer = await res.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: res.headers.get("content-type") || "image/jpeg",
  };
}

export async function getMyMicrosoftAvatarFile(req: any, res: Response) {
  try {
    const userObjectId = String(req.user?.objectId || "").trim();
    const email = String(req.user?.email || "").trim();

    const photo =
      (await tryDownloadMicrosoftUserPhoto(userObjectId)) ||
      (await tryDownloadMicrosoftUserPhoto(email));

    if (!photo) return res.status(404).end();

    res.setHeader("Content-Type", photo.contentType);
    res.setHeader("Content-Length", String(photo.buffer.length));
    return res.send(photo.buffer);
  } catch (err) {
    console.error("[profile microsoft photo] failed", err);
    return res.status(404).end();
  }
}

export async function getDirectoryMicrosoftAvatarFile(req: any, res: Response) {
  try {
    const targetUserObjectId = String(req.params?.userObjectId || "").trim();
    if (!targetUserObjectId) return res.status(404).end();

    const profileRows = await sqlQuery(getUserProfileSql, {
      userObjectId: targetUserObjectId,
    });

    const profile = profileRows?.[0] ?? null;
    const email = String(profile?.email_snapshot || "").trim();

    const photo =
      (await tryDownloadMicrosoftUserPhoto(targetUserObjectId)) ||
      (await tryDownloadMicrosoftUserPhoto(email));

    if (!photo) return res.status(404).end();

    res.setHeader("Content-Type", photo.contentType);
    res.setHeader("Content-Length", String(photo.buffer.length));
    return res.send(photo.buffer);
  } catch (err) {
    console.error("[directory microsoft photo] failed", err);
    return res.status(404).end();
  }
}

export async function getMyProfile(req: any, res: Response) {
  try {
    const data = await service.getMyProfile(req.user);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getMyProfile failed" });
  }
}

export async function getDirectory(req: any, res: Response) {
  try {
    const data = await service.getDirectory(req.user);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getDirectory failed" });
  }
}

export async function updateMyProfile(req: any, res: Response) {
  try {
    const data = await service.updateMyProfile(req.body || {}, req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "updateMyProfile failed" });
  }
}

export async function uploadMyAvatar(req: any, res: Response) {
  try {
    const data = await service.uploadMyAvatar(req.file, req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "uploadMyAvatar failed" });
  }
}

export async function deleteMyAvatar(req: any, res: Response) {
  try {
    const data = await service.deleteMyAvatar(req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "deleteMyAvatar failed" });
  }
}

export async function uploadMySignature(req: any, res: Response) {
  try {
    const data = await service.uploadMySignature(req.file, req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "uploadMySignature failed" });
  }
}

export async function deleteMySignature(req: any, res: Response) {
  try {
    const data = await service.deleteMySignature(req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "deleteMySignature failed" });
  }
}

export async function getMyAvatarFile(req: any, res: Response) {
  try {
    const userObjectId = String(req.user?.objectId || "").trim();
    if (!userObjectId) return res.status(400).end();

    const rows = await sqlQuery(getActiveUserProfileAvatarSql, { userObjectId });
    const row = rows?.[0];

    if (!row?.storage_key) {
      return res.status(404).end();
    }

    const blob = await downloadUserProfileAvatarBlob(String(row.storage_key));

    res.setHeader("Content-Type", blob.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(blob.contentLength || blob.buffer.length));
    return res.send(blob.buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}

export async function getMySignatureFile(req: any, res: Response) {
  try {
    const userObjectId = String(req.user?.objectId || "").trim();
    if (!userObjectId) return res.status(400).end();

    const rows = await sqlQuery(getActiveUserProfileSignatureSql, { userObjectId });
    const row = rows?.[0];

    if (!row?.storage_key) {
      return res.status(404).end();
    }

    const blob = await downloadUserProfileSignatureBlob(String(row.storage_key));

    res.setHeader("Content-Type", blob.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(blob.contentLength || blob.buffer.length));
    return res.send(blob.buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}

export async function getDirectoryAvatarFile(req: any, res: Response) {
  try {
    const targetUserObjectId = String(req.params?.userObjectId || "").trim();
    if (!targetUserObjectId) return res.status(400).end();

    const rows = await sqlQuery(getActiveUserProfileAvatarSql, {
      userObjectId: targetUserObjectId,
    });
    const row = rows?.[0];

    if (!row?.storage_key) {
      return res.status(404).end();
    }

    const blob = await downloadUserProfileAvatarBlob(String(row.storage_key));

    res.setHeader("Content-Type", blob.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(blob.contentLength || blob.buffer.length));
    return res.send(blob.buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}