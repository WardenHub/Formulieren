const DEFAULT_BASE_URL = "https://www.digitaallogboek.com";
const DEFAULT_SCOPE = "DigitalLog.API.ExternalAccess";
const REQUEST_TIMEOUT_MS = 30000;
const MAX_FOLDERS = 500;
const MAX_DOCUMENTS = 2000;

let tokenCache: { accessToken: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;

function requiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`missing env var ${name}`);
  return value;
}

function baseUrl() {
  return String(process.env.DIGITAAL_LOGBOEK_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestToken() {
  const clientId = requiredEnv("DIGITAAL_LOGBOEK_CLIENT_ID");
  const clientSecret = requiredEnv("DIGITAAL_LOGBOEK_CLIENT_SECRET");
  const scope = String(process.env.DIGITAAL_LOGBOEK_SCOPE || DEFAULT_SCOPE).trim();
  const body = new URLSearchParams({ grant_type: "client_credentials", scope });
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");

  const response = await fetchWithTimeout(`${baseUrl()}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) throw new Error(`digitaal logboek authentication failed (${response.status})`);
  const payload: any = await response.json();
  const accessToken = String(payload?.access_token || "");
  if (!accessToken) throw new Error("digitaal logboek authentication returned no token");

  const expiresIn = Math.max(60, Number(payload?.expires_in) || 3600);
  tokenCache = { accessToken, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
  return accessToken;
}

async function getToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.accessToken;
  if (!tokenPromise) tokenPromise = requestToken().finally(() => { tokenPromise = null; });
  return tokenPromise;
}

async function apiRequest(path: string) {
  const token = await getToken();
  const response = await fetchWithTimeout(`${baseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (response.status === 401) tokenCache = null;
  if (!response.ok) throw new Error(`digitaal logboek request failed (${response.status})`);
  return response;
}

async function getJson(path: string) {
  const response = await apiRequest(path);
  return response.json();
}

function encodeId(value: string) {
  return encodeURIComponent(String(value || "").trim());
}

export async function getDigiLog(digiLogId: string) {
  return getJson(`/api/DigiLogs/${encodeId(digiLogId)}`);
}

export async function scanDigiLogDocuments(digiLogId: string) {
  const encodedLogId = encodeId(digiLogId);
  const roots: any[] = await getJson(`/api/digilogs/${encodedLogId}/Folders?rootFoldersOnly=true`);
  const queue = Array.isArray(roots) ? [...roots] : [];
  const folders: any[] = [];
  const seenFolders = new Set<string>();

  while (queue.length) {
    const folder = queue.shift();
    const folderId = String(folder?.id || "").trim();
    if (!folderId || seenFolders.has(folderId)) continue;
    seenFolders.add(folderId);
    folders.push(folder);
    if (folders.length > MAX_FOLDERS) throw new Error("digitaal logboek folder limit exceeded");

    const children: any[] = await getJson(
      `/api/digilogs/${encodedLogId}/Folders/GetByParentFolderId?parentFolderId=${encodeId(folderId)}`
    );
    if (Array.isArray(children)) queue.push(...children);
  }

  const listed: any[] = [];
  for (const folder of folders) {
    const folderId = String(folder?.id || "").trim();
    const documents: any[] = await getJson(
      `/api/digilogs/${encodedLogId}/Documents?folderId=${encodeId(folderId)}`
    );
    for (const document of Array.isArray(documents) ? documents : []) {
      listed.push({ ...document, folderId, folderName: document?.folderName || folder?.name || null });
      if (listed.length > MAX_DOCUMENTS) throw new Error("digitaal logboek document limit exceeded");
    }
  }

  const unique = Array.from(new Map(listed.map((item) => [String(item?.id || ""), item])).values())
    .filter((item: any) => item?.id);
  const detailed: any[] = [];
  for (let index = 0; index < unique.length; index += 5) {
    const batch = unique.slice(index, index + 5);
    const rows = await Promise.all(batch.map(async (item: any) => {
      const detail: any = await getJson(
        `/api/digilogs/${encodedLogId}/Documents/${encodeId(item.id)}`
      );
      return { ...item, ...detail, folderId: detail?.folderId || item.folderId, folderName: detail?.folderName || item.folderName };
    }));
    detailed.push(...rows);
  }

  return detailed;
}

export async function downloadDigiLogDocument(digiLogId: string, documentId: string) {
  const response = await apiRequest(
    `/api/digilogs/${encodeId(digiLogId)}/Documents/download/${encodeId(documentId)}`
  );
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
}
