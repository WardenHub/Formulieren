import { invoke } from "@tauri-apps/api/core";

const CALLBACK_URI = "http://127.0.0.1:43863/auth/callback";
const SESSION_KEY = "ember-offline-auth-session";

export function isDesktopRuntime() {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

export async function cancelMicrosoftSignIn() {
  if (!isDesktopRuntime()) return;

  try {
    await invoke("cancel_desktop_auth");
  } catch {
    // The request may already have completed or the native command may be unavailable.
  }
}

function configValue(key) {
  return String(import.meta.env[key] || "").trim();
}

function base64Url(bytes) {
  let value = "";
  bytes.forEach((byte) => {
    value += String.fromCharCode(byte);
  });
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createRandomValue() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createCodeChallenge(verifier) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return base64Url(bytes);
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return {};
  }
}

export function getDesktopAuthConfig() {
  const tenantId = configValue("VITE_OFFLINE_AAD_TENANT_ID");
  const clientId = configValue("VITE_OFFLINE_AAD_CLIENT_ID");
  const apiAppId = configValue("VITE_OFFLINE_API_APP_ID");
  return {
    tenantId,
    clientId,
    apiAppId,
    configured: Boolean(tenantId && clientId && apiAppId),
  };
}

export function getDesktopAuthSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.accessToken || Number(session.expiresAt || 0) < Date.now() + 30_000) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearDesktopAuthSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function signInWithMicrosoft() {
  const config = getDesktopAuthConfig();
  if (!config.configured) {
    throw new Error("Aanmelden is nog niet geconfigureerd voor Ember Offline.");
  }
  if (!isDesktopRuntime()) {
    throw new Error("Open Ember Offline als desktopapp om aan te melden.");
  }

  const state = createRandomValue();
  const verifier = createRandomValue();
  const codeChallenge = await createCodeChallenge(verifier);
  const scope = `openid profile api://${config.apiAppId}/user_impersonation`;
  const authorizeUrl = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`
  );
  authorizeUrl.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: CALLBACK_URI,
    response_mode: "query",
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const callbackUrl = await invoke("authenticate_with_oidc", { authorizeUrl: authorizeUrl.toString() });
  const callback = new URL(callbackUrl);
  const returnedState = callback.searchParams.get("state");
  const error = callback.searchParams.get("error");
  const errorDescription = callback.searchParams.get("error_description");
  const code = callback.searchParams.get("code");

  if (error) throw new Error(errorDescription || error);
  if (returnedState !== state) throw new Error("De aanmeldbeveiliging kon niet worden gecontroleerd.");
  if (!code) throw new Error("Microsoft gaf geen autorisatiecode terug.");

  const tokenBody = await invoke("redeem_auth_code", {
    payload: {
      tenantId: config.tenantId,
      clientId: config.clientId,
      redirectUri: CALLBACK_URI,
      code,
      codeVerifier: verifier,
      scope,
    },
  });
  if (!tokenBody?.accessToken) throw new Error("Microsoft gaf geen toegangstoken terug.");

  const identity = decodeJwtPayload(tokenBody.idToken);
  const session = {
    accessToken: tokenBody.accessToken,
    expiresAt: Date.now() + Math.max(Number(tokenBody.expiresIn || 3600) - 30, 60) * 1000,
    displayName: String(identity.name || identity.preferred_username || "Ember-gebruiker"),
    email: String(identity.preferred_username || identity.email || ""),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
