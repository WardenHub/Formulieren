// /src/api/http.js
import { getApiAccessToken } from "../auth/msal";

const RAW_BASE = import.meta.env.VITE_API_BASE || "";
const API_BASE = RAW_BASE.replace(/\/+$/, "");
console.log("api base", import.meta.env.VITE_API_BASE);
const protectedObjectFailureCache = new Map();
const PROTECTED_OBJECT_FAILURE_TTL_MS = 30000;

export class ApiError extends Error {
  constructor(message, { status = null, correlationId = null, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.correlationId = correlationId;
    this.payload = payload;
  }
}

/* Bij een tijdelijke storing stuurt de API een leesbare uitleg mee in "message"; dat is de
   tekst die de gebruiker moet zien. Bij alle andere fouten blijft "error" leidend, want
   daar wordt elders in de app op gematcht. */
function pickErrorMessage(status, data, fallback) {
  if (status === 503 && data?.message) return String(data.message);
  return data?.error || fallback;
}

/* De boodschap blijft "unauthorized"; daar matchen meerdere schermen op. Wat erbij komt is
   de status, zodat een scherm het verschil kan zien tussen "je mag dit niet" en "de API is
   nog niet warm" en in het tweede geval gewoon opnieuw kan vragen. */
function unauthorizedError(tokenSent) {
  return new ApiError("unauthorized", { status: 401, payload: { token_sent: tokenSent } });
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export function buildApiUrl(path) {
  return buildUrl(path);
}

/* Geeft de headers terug plus de vraag of er een token in zat. Zonder token krijg je van de
   API een 401 die niet te onderscheiden is van een geweigerd token, en dat is precies het
   verschil tussen "log opnieuw in" en "de dienst is nog niet warm". */
async function buildHeaders(extraHeaders = {}) {
  const token = await getApiAccessToken();

  return {
    headers: {
      ...(extraHeaders || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    tokenSent: Boolean(token),
  };
}

function parseFilenameFromDisposition(value) {
  const raw = String(value || "");
  if (!raw) return null;

  const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = raw.match(/filename="([^"]+)"/i) || raw.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return String(plainMatch[1]).trim().replace(/^"|"$/g, "");
  }

  return null;
}

export async function httpJson(path, options = {}) {
  const url = buildUrl(path);

  const { headers, tokenSent } = await buildHeaders({
    ...(options.headers || {}),
    Accept: "application/json",
  });

  const res = await fetch(url, {
    ...options,
    credentials: "omit",
    headers,
  });

  if (res.status === 401) {
    throw unauthorizedError(tokenSent);
  }

  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json().catch(() => null);
      throw new ApiError(pickErrorMessage(res.status, data, `Request failed (${res.status})`), {
        status: res.status,
        correlationId: data?.correlation_id || null,
        payload: data,
      });
    }

    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }

  if (res.status === 204) {
    return null;
  }

  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!ct.includes("application/json")) {
    if (!String(text || "").trim()) {
      throw new Error(`Lege API-respons van ${url}`);
    }
    throw new Error(`Expected JSON from ${url}, got: ${ct}. First chars: ${text.slice(0, 80)}`);
  }

  if (!String(text || "").trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Ongeldige JSON van ${url}. First chars: ${text.slice(0, 80)}`);
  }
}

export async function httpUpload(path, formData, options = {}) {
  const url = buildUrl(path);

  const { headers, tokenSent } = await buildHeaders({
    ...(options.headers || {}),
    Accept: "application/json",
  });

  const res = await fetch(url, {
    ...options,
    method: options.method || "POST",
    credentials: "omit",
    headers,
    body: formData,
  });

  if (res.status === 401) {
    throw unauthorizedError(tokenSent);
  }

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const data = await res.json().catch(() => null);
      throw new ApiError(pickErrorMessage(res.status, data, `Request failed (${res.status})`), {
        status: res.status,
        payload: data,
      });
    }

    const text = await res.text().catch(() => "");
    throw new ApiError(text || `Request failed (${res.status})`, { status: res.status });
  }

  if (!isJson) {
    const text = await res.text();
    throw new Error(`Expected JSON from ${url}, got: ${ct}. First chars: ${text.slice(0, 80)}`);
  }

  return res.json();
}

export async function httpDownload(path, options = {}) {
  const url = buildUrl(path);

  const { headers, tokenSent } = await buildHeaders({
    ...(options.headers || {}),
    Accept: "*/*",
  });

  const res = await fetch(url, {
    ...options,
    method: options.method || "GET",
    credentials: "omit",
    headers,
  });

  if (res.status === 401) {
    throw unauthorizedError(tokenSent);
  }

  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json().catch(() => null);
      throw new ApiError(pickErrorMessage(res.status, data, `Request failed (${res.status})`), {
        status: res.status,
        payload: data,
      });
    }

    const text = await res.text().catch(() => "");
    throw new ApiError(text || `Request failed (${res.status})`, { status: res.status });
  }

  const blob = await res.blob();
  const fileName = parseFilenameFromDisposition(res.headers.get("content-disposition")) || null;

  return {
    blob,
    fileName,
    contentType: res.headers.get("content-type") || blob.type || "application/octet-stream",
  };
}

export async function fetchProtectedObjectUrl(path, options = {}) {
  const key = String(path || "").trim();
  const cachedFailure = protectedObjectFailureCache.get(key);

  if (cachedFailure && cachedFailure.expiresAt > Date.now()) {
    throw cachedFailure.error;
  }

  try {
    const { blob } = await httpDownload(path, options);
    protectedObjectFailureCache.delete(key);
    return URL.createObjectURL(blob);
  } catch (err) {
    protectedObjectFailureCache.set(key, {
      error: err instanceof Error ? err : new Error(String(err)),
      expiresAt: Date.now() + PROTECTED_OBJECT_FAILURE_TTL_MS,
    });
    throw err;
  }
}
