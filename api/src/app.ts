import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware/authMiddleware.js";
import { requireRole } from "./middleware/roleMiddleware.js";
import { getDbConnection } from "./db/index.js";
import installationsRouter from "./routes/installations.js";
import installationTypesRouter from "./routes/installationTypes.js";


const app = express();
app.use(express.json());
app.use(
  cors({
    origin: (origin, cb) => {
      const allow = new Set([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ]);

      // allow non-browser clients; curl; powershell; etc
      if (!origin) return cb(null, true);

      if (allow.has(origin)) return cb(null, true);
      return cb(new Error(`cors blocked origin: ${origin}`));
    },
    credentials: true,
  })
);


console.log("node", process.version);
console.log("db auth mode", process.env.DB_AUTH || "aad");
console.log("sql server", process.env.SQL_SERVER);
console.log("sql database", process.env.SQL_DATABASE);
console.log("node env", process.env.NODE_ENV);
console.log("dev auth", process.env.DEV_AUTH);


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
      "Jesse" : "Blij 😁",
    });
  } catch (err) {
    res.status(500).json({ api: "ok", db: "error" });
  }
});

// alles hieronder vereist user + roles
app.use(authMiddleware);
app.use("/installations", installationsRouter);
app.use("/installation-types", installationTypesRouter);

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