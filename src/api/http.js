// /src/api/http.js
import { getApiAccessToken } from "../auth/msal";

const RAW_BASE = import.meta.env.VITE_API_BASE || "";
const API_BASE = RAW_BASE.replace(/\/+$/, "");
console.log("api base", import.meta.env.VITE_API_BASE);

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export function buildApiUrl(path) {
  return buildUrl(path);
}

async function buildHeaders(extraHeaders = {}) {
  const token = await getApiAccessToken();

  return {
    ...(extraHeaders || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function httpJson(path, options = {}) {
  const url = buildUrl(path);

  const headers = await buildHeaders({
    ...(options.headers || {}),
    Accept: "application/json",
  });

  const res = await fetch(url, {
    ...options,
    credentials: "omit",
    headers,
  });

  if (res.status === 401) {
    throw new Error("unauthorized");
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Expected JSON from ${url}, got: ${ct}. First chars: ${text.slice(0, 80)}`);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export async function httpUpload(path, formData, options = {}) {
  const url = buildUrl(path);

  const headers = await buildHeaders({
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
    throw new Error("unauthorized");
  }

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || `Request failed (${res.status})`);
    }

    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }

  if (!isJson) {
    const text = await res.text();
    throw new Error(`Expected JSON from ${url}, got: ${ct}. First chars: ${text.slice(0, 80)}`);
  }

  return res.json();
}