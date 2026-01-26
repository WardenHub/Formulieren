import { DefaultAzureCredential } from "@azure/identity";

const ROLE_GROUPS: Record<string, string> = {
  admin: "03ba899f-0af6-4d81-9ab7-023a0cc42455",
  monteur: "64e2c12f-73d5-4b2a-9d56-fc465e3cc9bf",
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
const CACHE_TTL_MS = 600 * 60 * 1000;

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

async function graphGet(url: string) {
  console.log("[GRAPH] GET", url);

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

  return roles;
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

      return next();
    }

    const principal = getClientPrincipal(req);
    if (!principal) return res.status(401).json({ error: "not authenticated" });

    const userObjectId =
      getClaim(principal, "http://schemas.microsoft.com/identity/claims/objectidentifier") ||
      getClaim(principal, "oid");

    if (!userObjectId) {
      return res.status(401).json({ error: "missing user object id (oid)" });
    }

    req.user = {
      objectId: userObjectId,
      email:
        getClaim(principal, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress") ||
        getClaim(principal, "preferred_username") ||
        null,
      name: getClaim(principal, "name") || null,
    };

    const cached = rolesCache.get(userObjectId);
    if (cached && cached.expiresAt > Date.now()) {
      req.roles = cached.roles || [];
      return next();
    }

    let roles: string[] = [];

    try {
      const groupIds = await getUserGroupIds(userObjectId);
      roles = mapGroupsToRoles(groupIds);
    } catch (e: any) {
      console.error("[GRAPH] roles lookup failed", e?.message || e);
      roles = [];
    }

    rolesCache.set(userObjectId, { roles, expiresAt: Date.now() + CACHE_TTL_MS });

    req.roles = roles;
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "auth middleware failed" });
  }
}
