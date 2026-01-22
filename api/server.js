import express from "express";
import "dotenv/config";
import { DefaultAzureCredential } from "@azure/identity";
// db toevoegen
import { getDbConnection } from "./db.js";

const app = express();
app.use(express.json());

console.log("node", process.version);
console.log("db auth mode", process.env.DB_AUTH || "aad");
console.log("sql server", process.env.SQL_SERVER);
console.log("sql database", process.env.SQL_DATABASE);

const ROLE_GROUPS = {
  admin: "03ba899f-0af6-4d81-9ab7-023a0cc42455",
  monteur: "64e2c12f-73d5-4b2a-9d56-fc465e3cc9bf",
};

const credential = new DefaultAzureCredential();

// simpele cache zodat je niet elke request Graph aanroept
// key = userObjectId, value = { roles, expiresAt }
const rolesCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const required = ["SQL_SERVER", "SQL_DATABASE"];
for (const k of required) {
  if (!process.env[k]) throw new Error(`missing env var ${k}`);
}

if ((process.env.DB_AUTH || "aad") === "sql") {
  for (const k of ["SQL_USER", "SQL_PASSWORD"]) {
    if (!process.env[k]) throw new Error(`missing env var ${k} for sql auth`);
  }
}


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

  const token = await credential.getToken("https://graph.microsoft.com/.default");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.token}` },
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

function requireRole(...allowed) {
  return (req, res, next) => {
    const roles = req.roles || [];
    const ok = allowed.some((r) => roles.includes(r));
    if (!ok) return res.status(403).json({ error: "forbidden", required: allowed });
    next();
  };
}


app.get("/", (req, res) =>  res.json({ ok: true, service: "ember-api"   }));

// public route (geen auth)
app.get("/health", async (req, res) => {
  console.log("SQL_SERVER", process.env.SQL_SERVER);
  console.log("SQL_DATABASE", process.env.SQL_DATABASE);
  try {
    const pool = await getDbConnection();
    const result = await pool.request().query("select 1 as ok");
    res.json({
      api: "ok",
      db: result.recordset[0].ok,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      api: "ok",
      db: "error",
      message: err.message,
    });
  }
});


// alles hieronder vereist user + roles
app.use(authMiddleware);

app.get("/me", (req, res) => {
  res.json({ user: req.user, roles: req.roles || [] });
});


app.get("/forms/definitions", requireRole("admin"), (req, res) => {
  res.json({ ok: true, data: [] });
});

app.get("/forms/instances", requireRole("admin", "monteur"), (req, res) => {
  res.json({ ok: true, data: [] });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`ember-api listening on ${port}`));
