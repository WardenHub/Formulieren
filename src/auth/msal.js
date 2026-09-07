// src/auth/msal.js
import { EventType, PublicClientApplication } from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_AAD_TENANT_ID;
const clientId = import.meta.env.VITE_AAD_CLIENT_ID;
const apiAppId = import.meta.env.VITE_API_APP_ID;

const scope = `api://${apiAppId}/user_impersonation`;

/* De aanmelding wordt gedeeld tussen tabbladen.

   Dit stond op sessionStorage, en sessionStorage is per tabblad. Wie met ctrl+klik een
   installatie in een nieuw tabblad opende kwam daardoor in een leeg tabblad zonder account,
   en omdat de automatische aanmelding ook nog "select_account" meestuurde moest je bij elk
   tabblad je account opnieuw aanwijzen. Microsoft schrijft localStorage voor als je die
   aanmelding tussen tabbladen wil delen; dat is precies dit geval.

   De afweging is bekend: localStorage overleeft het sluiten van de browser en is leesbaar
   voor scripts op dit domein, waar sessionStorage met het tabblad verdwijnt. Ember is een
   intern platform achter Entra en de winst is elke dag merkbaar, dus die kant op. */
const msal = new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "localStorage",
  },
});

let initPromise;
let afmeldenBezig = false;
// Of dit tabblad eerder een account had. Zonder dat kan een storage-melding niet worden
// onderscheiden van "hier was toch al niemand aangemeld".
let warAangemeld = false;

function onthoudAccount(account) {
  if (!account) return null;
  msal.setActiveAccount(account);
  warAangemeld = true;
  return account;
}

/* Afmelden in het ene tabblad is afmelden in alle. De gedeelde cache maakt dat zichtbaar:
   zodra de accounts uit localStorage verdwijnen weten de andere tabbladen het.

   MSAL v5 kent geen accountgebeurtenissen meer over tabbladen heen, dus dit gebruikt de
   storage-melding van de browser zelf en kijkt daarna in de cache in plaats van de
   sleutelnamen van MSAL na te bouwen. */
function bewaakAndereTabbladen() {
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage) return;
    if (afmeldenBezig || !warAangemeld) return;
    if (msal.getAllAccounts().length > 0) return;

    warAangemeld = false;
    msal.setActiveAccount(null);
    window.location.reload();
  });
}

async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      await msal.initialize();

      msal.addEventCallback((bericht) => {
        if (bericht.eventType === EventType.LOGIN_SUCCESS && bericht.payload?.account) {
          onthoudAccount(bericht.payload.account);
        }

        if (bericht.eventType === EventType.LOGOUT_SUCCESS) {
          warAangemeld = false;
        }
      });

      bewaakAndereTabbladen();

      const resultaat = await msal.handleRedirectPromise();
      if (resultaat?.account) {
        onthoudAccount(resultaat.account);
        return;
      }

      // Al aangemeld in een ander tabblad, of eerder in dit browserprofiel; dan staat het
      // account nu in de gedeelde cache en hoeft er niets te gebeuren.
      onthoudAccount(msal.getActiveAccount() || msal.getAllAccounts()[0] || null);
    })();
  }

  await initPromise;
}

function getPreferredAccount() {
  const actief = msal.getActiveAccount();
  if (actief) {
    warAangemeld = true;
    return actief;
  }

  const [eerste] = msal.getAllAccounts();
  return eerste ? onthoudAccount(eerste) : null;
}

async function ensureSignedInAccount() {
  const account = getPreferredAccount();
  if (account) return account;

  /* Nog geen account in de gedeelde cache. Eerst stil proberen op de Entra-sessie; meestal
     kent Microsoft de gebruiker nog en dan hoeft niemand iets te kiezen of te typen. Lukt
     dat niet, dan alsnog de gewone aanmelding, maar bewust zonder "select_account": een
     accountkeuze hoort bij bewust aanmelden of wisselen, niet bij een nieuw tabblad. */
  try {
    const stil = await msal.ssoSilent({ scopes: [scope] });
    if (stil?.account) return onthoudAccount(stil.account);
  } catch {
    // Geen bruikbare sessie, of meer dan één account zonder hint; ga interactief verder.
  }

  await msal.loginRedirect({ scopes: [scope] });

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

/* Bewust aanmelden of van account wisselen. Hier hoort de accountkeuze wel; dit is de knop
   die iemand indrukt om zelf te kiezen. */
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

  afmeldenBezig = true;
  warAangemeld = false;

  await msal.logoutRedirect({
    account: msal.getActiveAccount() || msal.getAllAccounts()[0] || null,
    postLogoutRedirectUri: window.location.origin,
  });
}
