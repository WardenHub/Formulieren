import express from "express";
import "dotenv/config";
import { authMiddleware } from "./middleware/authMiddleware";
import { requireRole } from "./middleware/roleMiddleware";
import { getDbConnection } from "./db";

const app = express();
app.use(express.json());

console.log("node", process.version);
console.log("db auth mode", process.env.DB_AUTH || "aad");
console.log("sql server", process.env.SQL_SERVER);
console.log("sql database", process.env.SQL_DATABASE);

const required = ["SQL_SERVER", "SQL_DATABASE"];
for (const k of required) {
  if (!process.env[k]) throw new Error(`missing env var ${k}`);
}

if ((process.env.DB_AUTH || "aad") === "sql") {
  for (const k of ["SQL_USER", "SQL_PASSWORD"]) {
    if (!process.env[k]) throw new Error(`missing env var ${k} for sql auth`);
  }
}

app.get("/", (req, res) => res.json({ ok: true, service: "ember-api", blij: "Jesse" }));

app.get("/health", async (req, res) => {
  try {
    const pool = await getDbConnection();
    res.json({
      api: "ok",
      db: pool?.connected ? 1 : 0,
    });
  } catch (err) {
    res.status(500).json({ api: "ok", db: "error" });
  }
});

// alles hieronder vereist user + roles
app.use(authMiddleware);

app.get("/me", (req: any, res) => {
  res.json({ user: req.user, roles: req.roles || [] });
});

app.get("/forms/definitions", requireRole("admin"), (req, res) => {
  res.json({ ok: true, data: [] });
});

app.get("/forms/instances", requireRole("admin", "monteur"), (req, res) => {
  res.json({ ok: true, data: [] });
});

export default app;