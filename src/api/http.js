// src/api/http.js
const API_BASE = import.meta.env.VITE_API_BASE || "";
console.log("api base", API_BASE);

export async function httpJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (res.status === 401) {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${API_BASE}/.auth/login/aad?post_login_redirect_uri=${returnTo}`;
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}
