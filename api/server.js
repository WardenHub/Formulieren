import express from "express";
import { DefaultAzureCredential } from "@azure/identity";

const app = express();
app.use(express.json());

const ROLE_GROUPS = {
  admin: "03ba899f-0af6-4d81-9ab7-023a0cc42455",
  monteur: "64e2c12f-73d5-4b2a-9d56-fc465e3cc9bf",
};

const credential = new DefaultAzureCredential();

// simpele cache zodat je niet elke request Graph aanroept
// key = userObjectId, value = { roles, expiresAt }
const rolesCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getClientPrincipal(req) {
  const b64 = req.headers["x-ms-client-principal"];
  if (!b64) return null;

  const json = Buffer.from(b64, "base64").toString("utf-8");
  return JSON.parse(json);
}

function getClaim(principal, claimType) {
  const claims = principal?.claims || [];
  const hit = claims.find((c) => c.typ === claimType);
  return hit?.val ?? null;
}

async function graphGet(url) {
  console.log("[GRAPH] GET", url);

  const token = await credential.getToken(
    "https://graph.microsoft.com/.default"
  );

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[GRAPH ERROR]", res.status, text);
    throw new Error(`graph error ${res.status}: ${text}`);
  }

  return res.json();
}


// haalt groepen op, inclusief nested groepen
async function getUserGroupIds(userObjectId) {
  const data = await graphGet(
    `https://graph.microsoft.com/v1.0/users/${userObjectId}/transitiveMemberOf?$select=id`
  );

  return (data.value || []).map((g) => g.id);
}

function mapGroupsToRoles(groupIds) {
  const roles = [];

  for (const [role, groupId] of Object.entries(ROLE_GROUPS)) {
    if (groupIds.includes(groupId)) roles.push(role);
  }

  return roles;
}

async function authMiddleware(req, res, next) {
  try {
    const principal = getClientPrincipal(req);
    if (!principal) return res.status(401).json({ error: "not authenticated" });

    // Entra Object ID zit meestal als claim: http://schemas.microsoft.com/identity/claims/objectidentifier
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
      req.roles = cached.roles;
      return next();
    }

    const groupIds = await getUserGroupIds(userObjectId);
    const roles = mapGroupsToRoles(groupIds);

    rolesCache.set(userObjectId, { roles, expiresAt: Date.now() + CACHE_TTL_MS });

    req.roles = roles;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "auth middleware failed" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const roles = req.roles || [];
    if (!roles.includes(role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

function requireAnyRole(rolesAllowed) {
  return (req, res, next) => {
    const roles = req.roles || [];
    const ok = rolesAllowed.some((r) => roles.includes(r));
    if (!ok) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

// routes
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ember-api" });
});

// alles hieronder vereist user + roles
app.use(authMiddleware);

app.get("/me", (req, res) => {
  res.json({
    user: req.user,
    roles: req.roles || [],
  });
});

app.get("/forms/definitions", requireRole("admin"), (req, res) => {
  res.json({
    ok: true,
    route: "/forms/definitions",
    user: req.user,
    roles: req.roles,
    data: [],
  });
});

app.get("/forms/instances", requireAnyRole(["admin", "monteur"]), (req, res) => {
  res.json({
    ok: true,
    route: "/forms/instances",
    user: req.user,
    roles: req.roles,
    data: [],
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`ember-api listening on ${port}`));
