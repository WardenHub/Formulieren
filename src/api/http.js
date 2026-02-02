// /src/api/http.js

const RAW_BASE = import.meta.env.VITE_API_BASE || "";
const API_BASE = RAW_BASE.replace(/\/+$/, ""); // trim trailing slash

function buildUrl(path) {
  // allow absolute urls
  if (/^https?:\/\//i.test(path)) return path;

  // ensure leading slash
  const p = path.startsWith("/") ? path : `/${path}`;

  // if VITE_API_BASE is set, use it, otherwise same-origin
  return API_BASE ? `${API_BASE}${p}` : p;
}

export async function httpJson(path, options = {}) {
  const url = buildUrl(path);

  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.headers || {}),
      Accept: "application/json",
    },
  });

  if (res.status === 401) {
    window.location.assign("/.auth/login/aad");
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
