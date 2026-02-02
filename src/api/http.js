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

export async function httpJson(path, options = {}) {
  const url = buildUrl(path);

  const token = await getApiAccessToken();

  const res = await fetch(url, {
    ...options,
    credentials: "omit",
    headers: {
      ...(options.headers || {}),
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
