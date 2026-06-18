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

function safeDecodeJwtPayload(token: string | null | undefined) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  try {
    const parts = raw.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

function summarizeGraphToken(token: string | null | undefined) {
  const payload = safeDecodeJwtPayload(token);
  const roles = Array.isArray(payload?.roles)
    ? payload.roles.map((value: any) => String(value)).filter(Boolean)
    : payload?.roles
      ? [String(payload.roles)]
      : [];

  return {
    aud: payload?.aud || null,
    appid: payload?.appid || payload?.azp || null,
    oid: payload?.oid || payload?.sub || null,
    tid: payload?.tid || null,
    roles,
    scp: payload?.scp || null,
    hasProfilePhotoReadPermission: roles.some((role) =>
      [
        "ProfilePhoto.Read.All",
        "ProfilePhoto.ReadWrite.All",
        "User.Read.All",
        "User.ReadWrite.All",
      ].includes(role)
    ),
  };
}

function getGraphCredentialDebugContext() {
  return {
    nodeEnv: process.env.NODE_ENV || null,
    websiteSiteName: process.env.WEBSITE_SITE_NAME || null,
    websiteInstanceId: process.env.WEBSITE_INSTANCE_ID || null,
    azureClientId: process.env.AZURE_CLIENT_ID || process.env.MANAGED_IDENTITY_CLIENT_ID || null,
    azureTenantId:
      process.env.AAD_TENANT_ID ||
      process.env.VITE_AAD_TENANT_ID ||
      process.env.AZURE_TENANT_ID ||
      null,
    hasAzureClientSecret: Boolean(String(process.env.AZURE_CLIENT_SECRET || "").trim()),
    hasIdentityEndpoint: Boolean(String(process.env.IDENTITY_ENDPOINT || "").trim()),
    hasMsiEndpoint: Boolean(String(process.env.MSI_ENDPOINT || "").trim()),
  };
}

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

  let token = null;
  try {
    token = await graphCredential.getToken("https://graph.microsoft.com/.default");
  } catch (err) {
    console.error("[profile microsoft photo] graph token acquisition failed", err);
    return null;
  }

  if (!token?.token) {
    console.error("[profile microsoft photo] no graph token");
    return null;
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(clean)}/photo/$value`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.token}`,
    },
  });

  if (res.status === 404) {
    return null;
  }

  if (res.status === 400) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[profile microsoft photo] graph failed", {
      identifier: clean,
      status: res.status,
      wwwAuthenticate: res.headers.get("www-authenticate") || null,
      requestId: res.headers.get("request-id") || null,
      clientRequestId: res.headers.get("client-request-id") || null,
      xMsAgsDiagnostic: res.headers.get("x-ms-ags-diagnostic") || null,
      token: summarizeGraphToken(token.token),
      credential: getGraphCredentialDebugContext(),
      body: text,
    });
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

    const photoByOid = await tryDownloadMicrosoftUserPhoto(userObjectId);

    if (photoByOid) {
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Content-Type", photoByOid.contentType);
      res.setHeader("Content-Length", String(photoByOid.buffer.length));
      return res.send(photoByOid.buffer);
    }

    const photoByEmail = await tryDownloadMicrosoftUserPhoto(email);

    if (photoByEmail) {
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Content-Type", photoByEmail.contentType);
      res.setHeader("Content-Length", String(photoByEmail.buffer.length));
      return res.send(photoByEmail.buffer);
    }

    return res.status(404).json({
      error: "microsoft avatar not available",
      userObjectId,
      email,
    });
  } catch (err) {
    console.error("[profile microsoft photo] failed", err);
    return res.status(404).json({ error: "microsoft avatar not available" });
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

    res.setHeader("Cache-Control", "private, max-age=300");
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

    res.setHeader("Cache-Control", "private, max-age=300");
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

    res.setHeader("Cache-Control", "private, max-age=300");
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

    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Type", blob.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(blob.contentLength || blob.buffer.length));
    return res.send(blob.buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}
