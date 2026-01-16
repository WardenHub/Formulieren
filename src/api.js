const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (res.status === 401) {
    // stuur gebruiker “stil” door de API login flow
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