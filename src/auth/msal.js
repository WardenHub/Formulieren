// src/auth/msal.js
import { PublicClientApplication } from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_AAD_TENANT_ID;
const clientId = import.meta.env.VITE_AAD_CLIENT_ID;
const apiAppId = import.meta.env.VITE_API_APP_ID;

const scope = `api://${apiAppId}/user_impersonation`;

const msal = new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
});

let initPromise;

async function ensureInit() {
  if (!initPromise) {
    initPromise = msal.initialize();
  }

  await initPromise;
  await msal.handleRedirectPromise();
}

function getPreferredAccount() {
  const accounts = msal.getAllAccounts();
  if (!accounts?.length) return null;
  return accounts[0];
}

async function ensureSignedInAccount() {
  const account = getPreferredAccount();
  if (account) return account;

  await msal.loginRedirect({
    scopes: [scope],
    prompt: "select_account",
  });

  return null;
}

export async function getApiAccessToken() {
  if (import.meta.env.MODE === "development") return null;

  await ensureInit();

  const account = await ensureSignedInAccount();
  if (!account) return null;

  try {
    const result = await msal.acquireTokenSilent({
      scopes: [scope],
      account,
    });
    return result.accessToken;
  } catch {
    await msal.acquireTokenRedirect({
      scopes: [scope],
      account,
    });
    return null;
  }
}

export async function login() {
  if (import.meta.env.MODE === "development") return;

  await ensureInit();

  await msal.loginRedirect({
    scopes: [scope],
    prompt: "select_account",
  });
}

export async function logout() {
  await ensureInit();
  await msal.logoutRedirect({
    postLogoutRedirectUri: window.location.origin,
  });
}