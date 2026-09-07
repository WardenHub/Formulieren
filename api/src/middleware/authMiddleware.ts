import crypto from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";

const ROLE_GROUPS: Record<string, string> = {
  admin: "b0b4c5d3-d918-46a6-971e-c734afa21536",
  gebruiker: "64e2c12f-73d5-4b2a-9d56-fc465e3cc9bf",
  documentbeheerder: "7cadb29c-c15c-4e1e-acff-71214865e00a",
  uitlegbeheerder: "c4b6dc5c-e4e9-4dd0-a283-08747e1ea505",
  kam_coordinator: "b8a5b9cc-84f9-40e6-837c-91e69be6f6f8",
  // Groep EMBER-CERTIFICERING-COORDINATOR uit
  // deployment/ember-certificering-coordinator-app-role-plan.json. Ontbrak hier, waardoor de
  // rol onbereikbaar was zodra de app-rol niet in het token meekwam.
  certificering_coordinator: "bdc3e9b2-669d-4d12-b28a-e546b7f0a6e1",
};

const APP_ROLE_MAP: Record<string, string> = {
  "Ember.Admin": "admin",
  "Ember.Gebruiker": "gebruiker",
  "Ember.Documentbeheerder": "documentbeheerder",
  "Ember.Uitlegbeheerder": "uitlegbeheerder",
  "Ember.KAMCoordinator": "kam_coordinator",
  "Ember.CertificeringCoordinator": "certificering_coordinator",
};

function isDevAuthEnabled() {
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  const devAuth = (process.env.DEV_AUTH || "").trim();
  return nodeEnv === "development" && devAuth === "1";
}

const credential = new DefaultAzureCredential();

// simpele cache zodat je niet elke request Graph aanroept
// key = userObjectId, value = { roles, expiresAt }
const rolesCache = new Map<string, { roles: string[]; expiresAt: number }>();
// Tien minuten. Dit stond op 600 * 60 * 1000, tien uur; een ingetrokken
// groepslidmaatschap werkte daardoor een werkdag lang niet door.
const CACHE_TTL_MS = 10 * 60 * 1000;

// OpenID / JWKS cache
const openIdConfigCache = new Map<string, { value: any; expiresAt: number }>();
const jwksCache = new Map<string, { value: any; expiresAt: number }>();
const OPENID_CACHE_TTL_MS = 60 * 60 * 1000;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

function getClientPrincipal(req: any) {
  const b64 = req.headers["x-ms-client-principal"];
  if (!b64) return null;

  try {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getClaim(principal: any, claimType: string) {
  const claims = principal?.claims || [];
  const found = claims.find((c: any) => c.typ === claimType);
  return found?.val || null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function mapAppRolesToInternalRoles(appRoles: string[]) {
  return uniqueStrings(
    appRoles
      .map((role) => APP_ROLE_MAP[role])
      .filter(Boolean)
  );
}

async function graphGet(url: string) {
  const token = await credential.getToken("https://graph.microsoft.com/.default");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token?.token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[GRAPH ERROR]", res.status, text);
    throw new Error(`graph error ${res.status}: ${text}`);
  }

  return res.json();
}

async function getUserGroupIds(userObjectId: string) {
  const data = await graphGet(
    `https://graph.microsoft.com/v1.0/users/${userObjectId}/transitiveMemberOf?$select=id`
  );

  return (data.value || []).map((g: any) => g.id);
}

function mapGroupsToRoles(groupIds: string[]) {
  const roles: string[] = [];

  for (const [role, groupId] of Object.entries(ROLE_GROUPS)) {
    if (groupIds.includes(groupId)) roles.push(role);
  }

  return uniqueStrings(roles);
}

function getBearerToken(req: any) {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  if (!raw || typeof raw !== "string") return null;

  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function base64UrlToBuffer(input: string) {
  const normalized = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(input || "").length / 4) * 4, "=");

  return Buffer.from(normalized, "base64");
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeJwtParts(token: string) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("invalid jwt");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = safeJsonParse(base64UrlToBuffer(headerB64).toString("utf-8"));
  const payload = safeJsonParse(base64UrlToBuffer(payloadB64).toString("utf-8"));
  const signature = base64UrlToBuffer(signatureB64);
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "utf-8");

  if (!header || !payload) {
    throw new Error("invalid jwt json");
  }

  return {
    header,
    payload,
    signature,
    signingInput,
  };
}

function getTenantId() {
  return (
    process.env.AAD_TENANT_ID ||
    process.env.VITE_AAD_TENANT_ID ||
    process.env.AZURE_TENANT_ID ||
    null
  );
}

function getApiAudienceCandidates() {
  const raw = [
    process.env.API_APP_ID,
    process.env.AAD_API_CLIENT_ID,
    process.env.VITE_API_APP_ID,
    process.env.API_AUDIENCE,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  const values = new Set<string>();

  for (const v of raw) {
    values.add(v);

    if (/^[0-9a-f-]{36}$/i.test(v)) {
      values.add(`api://${v}`);
    }

    if (v.startsWith("api://")) {
      const withoutScheme = v.slice("api://".length).trim();
      if (withoutScheme) values.add(withoutScheme);
    }
  }

  return [...values];
}

/* Een niet op te halen openid-configuratie of JWKS is geen ongeldig token; het is een
   dienst die Entra nog niet kan bereiken. Dat verschil hoort de client te zien: op 401
   gaat hij opnieuw inloggen, op 503 wacht hij even. Zonder dit onderscheid gaf een koude
   start "unauthorized" terug op een geldig token. */
class AuthDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthDependencyError";
  }
}

async function fetchJsonWithCache(
  cache: Map<string, { value: any; expiresAt: number }>,
  key: string,
  ttlMs: number,
  url: string
) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let res: Response;

  try {
    res = await fetch(url);
  } catch (e: any) {
    throw new AuthDependencyError(`openid fetch unreachable: ${e?.message || e}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AuthDependencyError(`openid fetch failed ${res.status}: ${text}`);
  }

  let value: any;

  try {
    value = await res.json();
  } catch (e: any) {
    throw new AuthDependencyError(`openid fetch unparsable: ${e?.message || e}`);
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  return value;
}

async function getOpenIdConfiguration(tenantId: string) {
  const issuerBase = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  const url = `${issuerBase}/.well-known/openid-configuration`;

  return fetchJsonWithCache(
    openIdConfigCache,
    `openid:${tenantId}`,
    OPENID_CACHE_TTL_MS,
    url
  );
}

async function getJwks(jwksUri: string) {
  return fetchJsonWithCache(
    jwksCache,
    `jwks:${jwksUri}`,
    JWKS_CACHE_TTL_MS,
    jwksUri
  );
}

function findJwkForKid(jwks: any, kid: string) {
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  return keys.find((k: any) => k?.kid === kid) || null;
}

function verifyJwtSignatureWithJwk(
  signingInput: Buffer,
  signature: Buffer,
  jwk: any,
  alg: string
) {
  if (alg !== "RS256") {
    throw new Error(`unsupported jwt alg ${alg}`);
  }

  const publicKey = crypto.createPublicKey({
    key: jwk,
    format: "jwk",
  });

  return crypto.verify(
    "RSA-SHA256",
    signingInput,
    publicKey,
    signature
  );
}

function validateJwtClaims(payload: any, tenantId: string) {
  const now = Math.floor(Date.now() / 1000);
  const issuerOptions = new Set([
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ]);

  const audCandidates = getApiAudienceCandidates();

  if (!payload?.iss || !issuerOptions.has(String(payload.iss))) {
    throw new Error("invalid token issuer");
  }

  if (!payload?.aud || !audCandidates.includes(String(payload.aud))) {
    throw new Error(
      `invalid token audience; aud=${String(payload?.aud || "")}; expected one of ${audCandidates.join(", ")}`
    );
  }

  if (payload?.nbf && Number(payload.nbf) > now + 60) {
    throw new Error("token not yet valid");
  }

  if (!payload?.exp || Number(payload.exp) <= now - 60) {
    throw new Error("token expired");
  }
}

async function verifyBearerToken(token: string) {
  const tenantId = getTenantId();
  if (!tenantId) {
    throw new Error("missing tenant id for bearer auth");
  }

  const audCandidates = getApiAudienceCandidates();
  if (!audCandidates.length) {
    throw new Error("missing api audience for bearer auth");
  }

  const decoded = decodeJwtParts(token);
  const alg = String(decoded.header?.alg || "");
  const kid = String(decoded.header?.kid || "");

  if (!kid) {
    throw new Error("jwt missing kid");
  }

  const openid = await getOpenIdConfiguration(tenantId);
  const jwksUri = String(openid?.jwks_uri || "").trim();
  if (!jwksUri) {
    throw new Error("openid config missing jwks_uri");
  }

  const jwks = await getJwks(jwksUri);
  const jwk = findJwkForKid(jwks, kid);
  if (!jwk) {
    throw new Error("signing key not found");
  }

  const ok = verifyJwtSignatureWithJwk(
    decoded.signingInput,
    decoded.signature,
    jwk,
    alg
  );

  if (!ok) {
    throw new Error("invalid token signature");
  }

  validateJwtClaims(decoded.payload, tenantId);

  return decoded.payload;
}

function getRolesFromJwtPayload(payload: any) {
  const roles = Array.isArray(payload?.roles)
    ? payload.roles.map((x: any) => String(x)).filter(Boolean)
    : payload?.roles
      ? [String(payload.roles)]
      : [];

  return uniqueStrings(roles);
}

function getUserFromJwtPayload(payload: any) {
  return {
    objectId: payload?.oid || payload?.sub || null,
    email: payload?.preferred_username || payload?.email || payload?.upn || null,
    name: payload?.name || null,
  };
}

// Een koude App Service haalt eerst een managed-identity token op en zet daarna een
// verbinding naar Graph op. Die eerste poging mislukt soms; eenmaal opnieuw proberen na een
// korte pauze vangt dat op zonder een normaal verzoek merkbaar te vertragen.
const ROLE_LOOKUP_RETRY_DELAY_MS = 400;

function pauze(ms: number) {
  return new Promise((klaar) => setTimeout(klaar, ms));
}

async function resolveRolesViaGraph(userObjectId: string) {
  try {
    return mapGroupsToRoles(await getUserGroupIds(userObjectId));
  } catch (eerste: any) {
    console.error("[GRAPH] roles lookup failed, one retry", eerste?.message || eerste);
  }

  await pauze(ROLE_LOOKUP_RETRY_DELAY_MS);
  return mapGroupsToRoles(await getUserGroupIds(userObjectId));
}

/* Een mislukte lookup gaat niet in de cache, dus tijdens het opwarmen vraagt elk verzoek
   het opnieuw. Een paginalading zijn er vijf tegelijk; die horen samen één lookup te doen
   in plaats van vijf. Dit deelt de lopende poging en laat hem daarna weer los. */
const rolesInFlight = new Map<string, Promise<string[]>>();

function resolveRolesOnce(userObjectId: string) {
  const lopend = rolesInFlight.get(userObjectId);
  if (lopend) return lopend;

  const poging = resolveRolesViaGraph(userObjectId).finally(() => {
    rolesInFlight.delete(userObjectId);
  });

  rolesInFlight.set(userObjectId, poging);
  return poging;
}

async function applyRoleResolutionForUser(req: any, userObjectId: string, appRoles: string[]) {
  const mappedAppRoles = mapAppRolesToInternalRoles(appRoles);

  // voorkeursroute; gebruik app roles direct als ze aanwezig zijn
  if (mappedAppRoles.length > 0) {
    req.roles = uniqueStrings([
      ...mappedAppRoles,
      ...(mappedAppRoles.includes("certificering_coordinator") ? ["gebruiker"] : []),
    ]);
    req.rolesUnavailable = false;
    return;
  }

  // fallback; groepslookup via Graph
  const cached = rolesCache.get(userObjectId);
  if (cached && cached.expiresAt > Date.now()) {
    req.roles = cached.roles || [];
    req.rolesUnavailable = false;
    return;
  }

  try {
    const roles = await resolveRolesOnce(userObjectId);
    rolesCache.set(userObjectId, { roles, expiresAt: Date.now() + CACHE_TTL_MS });
    req.roles = roles;
    req.rolesUnavailable = false;
  } catch (e: any) {
    /* Een mislukte lookup is geen antwoord. Hij werd hier eerder als lege rollenlijst in
       de cache gezet; een enkele koude start maakte de gebruiker daarmee tien minuten
       rechteloos, ook nadat de API al warm was. Dat is precies het beeld van 's ochtends:
       inloggen lukt, het beheermenu ontbreekt en het nieuws laadt niet.

       Nu blijft de cache leeg, zodat het volgende verzoek het opnieuw probeert, en weet de
       rest van de keten dat de rollen onbekend zijn in plaats van leeg. */
    console.error("[GRAPH] roles lookup failed", e?.message || e);
    rolesCache.delete(userObjectId);
    req.roles = [];
    req.rolesUnavailable = true;
  }
}

// De header x-ms-client-principal is base64, geen ondertekend token. Wie de App Service
// direct kan bereiken stuurde hem zelf mee en was admin, want dit pad werd voor de
// bearer-validatie geprobeerd en nam ook de roles-claims uit de header over.
//
// Of de ingress de header strip is hier niet vast te stellen, dus het pad staat nu uit
// tenzij iemand het bewust aanzet. En ook dan komen rollen nooit uit de header; die worden
// altijd via Graph opgelost, zodat een verzonnen header hoogstens een identiteit voorstelt
// die verder niets mag.
function isClientPrincipalTrusted() {
  return String(process.env.TRUST_CLIENT_PRINCIPAL || "").trim() === "1";
}

async function tryAuthenticateFromClientPrincipal(req: any) {
  if (!isClientPrincipalTrusted()) return false;

  const principal = getClientPrincipal(req);
  if (!principal) return false;

  const userObjectId =
    getClaim(principal, "http://schemas.microsoft.com/identity/claims/objectidentifier") ||
    getClaim(principal, "oid");

  if (!userObjectId) {
    throw new Error("missing user object id (oid)");
  }

  req.user = {
    objectId: userObjectId,
    email:
      getClaim(principal, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress") ||
      getClaim(principal, "preferred_username") ||
      null,
    name: getClaim(principal, "name") || null,
  };

  // Bewust een lege lijst; rollen komen uit Graph en niet uit de header.
  await applyRoleResolutionForUser(req, userObjectId, []);

  return true;
}

async function tryAuthenticateFromBearer(req: any) {
  const token = getBearerToken(req);
  if (!token) return false;

  const payload = await verifyBearerToken(token);
  const user = getUserFromJwtPayload(payload);

  if (!user.objectId) {
    throw new Error("missing user object id (oid)");
  }

  req.user = user;

  const appRoles = getRolesFromJwtPayload(payload);
  await applyRoleResolutionForUser(req, String(user.objectId), appRoles);

  return true;
}

export async function authMiddleware(req: any, res: any, next: any) {
  try {
    if (isDevAuthEnabled()) {
      req.user = {
        objectId: process.env.DEV_USER_OID || "local-dev-user",
        email: process.env.DEV_USER_EMAIL || null,
        name: process.env.DEV_USER_NAME || null,
      };

      const rolesRaw = process.env.DEV_ROLES || "";
      req.roles = rolesRaw
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      req.rolesUnavailable = false;

      return next();
    }

    // 1. behoud bestaand platformgedrag
    const principalOk = await tryAuthenticateFromClientPrincipal(req);
    if (principalOk) {
      return next();
    }

    // 2. fallback voor normale bearer-token requests vanuit de frontend
    const bearerOk = await tryAuthenticateFromBearer(req);
    if (bearerOk) {
      return next();
    }

    return res.status(401).json({ error: "not authenticated" });
  } catch (err: any) {
    if (err instanceof AuthDependencyError) {
      console.error("[AUTH] dependency unavailable", err?.message || err);
      res.setHeader("Retry-After", "5");
      return res.status(503).json({
        error: "auth_unavailable",
        message:
          "Ember kan de inlogdienst nu niet bereiken; meestal is dat het opstarten. " +
          "Probeer het over een paar seconden opnieuw.",
      });
    }

    console.error("[AUTH] failed", err?.message || err);
    return res.status(401).json({ error: "not authenticated" });
  }
}
