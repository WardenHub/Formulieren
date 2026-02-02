// src/auth/msal.js
import { PublicClientApplication } from "@azure/msal-browser";

const msal = new PublicClientApplication({
  auth: {
    clientId: import.meta.env.VITE_AAD_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AAD_TENANT_ID}`,
    redirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
});

let initPromise = null;
function ensureInit() {
  if (!initPromise) initPromise = msal.initialize();
  return initPromise;
}

const API_SCOPE = `api://${import.meta.env.VITE_API_APP_ID}/user_impersonation`;

export async function getApiAccessToken() {
  await ensureInit();

  // als je net van een redirect terugkomt; laat MSAL dat eerst afhandelen
  const redirectResult = await msal.handleRedirectPromise();
  if (redirectResult?.accessToken) return redirectResult.accessToken;

  // loginHint uit SWA sessie; helpt silent SSO
  const meRes = await fetch("/.auth/me", { credentials: "include" });
  const me = await meRes.json();
  const loginHint = me?.clientPrincipal?.userDetails || undefined;

  const accounts = msal.getAllAccounts();
  const account = accounts[0] || undefined;

  try {
    const result = await msal.acquireTokenSilent({
      account,
      scopes: [API_SCOPE],
      loginHint,
    });
    return result.accessToken;
  } catch {
    await msal.acquireTokenRedirect({
      scopes: [API_SCOPE],
      loginHint,
    });
    return null;
  }
}
