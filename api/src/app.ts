// /api/src/app.ts
import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware/authMiddleware.js";
import { requireRole } from "./middleware/roleMiddleware.js";
import { getDbConnection } from "./db/index.js";
import installationsRouter from "./routes/installations.js";
import installationTypesRouter from "./routes/installationTypes.js";
import formsMonitorRouter from "./routes/formsMonitor.js";
import adminFormsRouter from "./routes/adminForms.js";
import adminInstallationsRouter from "./routes/adminInstallations.js";
import adminGuidanceRouter from "./routes/adminGuidance.js";
import adminFeedbackRouter from "./routes/adminFeedback.js";
import adminAssistantRouter from "./routes/adminAssistant.js";
import internalMaintenanceRouter from "./routes/internalMaintenance.js";
import homeRouter from "./routes/home.js";
import profileRouter from "./routes/profile.js";
import meFeedbackRouter from "./routes/meFeedback.js";
import * as profileService from "./services/profileService.js";
import { getRuntimeStatusSnapshot } from "./services/runtimeStatusService.js";

const app = express();
const RAW_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function norm(o: string | undefined | null) {
  return (o || "").replace(/\/+$/, "");
}

const ALLOWED = new Set(RAW_ORIGINS.map(norm));
const TAURI_DESKTOP_ORIGINS = new Set(
  ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"].map(norm)
);

function isAllowedCorsOrigin(origin: string) {
  const normalized = norm(origin);
  if (ALLOWED.has(normalized) || TAURI_DESKTOP_ORIGINS.has(normalized)) return true;

  // De native ontwikkelapp laadt via de lokale Vite-server. Productie blijft
  // gebonden aan de vaste Tauri-origins hierboven.
  if (normalized === "http://127.0.0.1:1430" || normalized === "http://localhost:1430") return true;

  if ((process.env.NODE_ENV || "").toLowerCase() !== "production") {
    try {
      const host = new URL(normalized).hostname;
      return host === "localhost" || host === "127.0.0.1";
    } catch {
      return false;
    }
  }

  return false;
}

function mapRuntimeHealthStatus(apiStatus: string | undefined) {
  if (apiStatus === "starting") return "starting";
  if (apiStatus === "degraded") return "degraded";
  return "healthy";
}

function buildHealthPayload({
  runtime,
  db,
  dbConnected,
}: {
  runtime: ReturnType<typeof getRuntimeStatusSnapshot>;
  db: number | "error";
  dbConnected: boolean;
}) {
  const status = mapRuntimeHealthStatus(runtime.api_status);
  const healthy = runtime.api_status === "healthy" && dbConnected;

  return {
    ok: healthy,
    service: "ember-api",
    api: runtime.api_status === "healthy" ? "ok" : runtime.api_status,
    status,
    db,
    Jesse: healthy ? ":)" : ":(",
    pdf_renderer_status: runtime.renderer_status,
    runtime: {
      ready: runtime.ready,
      startup_phase: runtime.startup_phase,
      startup_message: runtime.startup_message,
      renderer_status: runtime.renderer_status,
    },
  };
}

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "10mb" }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      if (isAllowedCorsOrigin(origin)) return cb(null, true);

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
console.log("maintenance api key configured", process.env.MAINTENANCE_API_KEY ? "yes" : "no");

const required = ["SQL_SERVER", "SQL_DATABASE"];
for (const k of required) {
  if (!process.env[k]) throw new Error(`missing env var ${k}`);
}

if ((process.env.DB_AUTH || "aad") === "sql") {
  for (const k of ["SQL_USER", "SQL_PASSWORD"]) {
    if (!process.env[k]) throw new Error(`missing env var ${k} for sql auth`);
  }
}

app.get("/", async (req, res) => {
  const runtime = getRuntimeStatusSnapshot();

  console.log(
    "hit /",
    new Date().toISOString(),
    "auth",
    req.headers.authorization ? "yes" : "no"
  );

  try {
    const pool = await getDbConnection();
    return res.json(
      buildHealthPayload({
        runtime,
        db: pool?.connected ? 1 : 0,
        dbConnected: !!pool?.connected,
      })
    );
  } catch {
    return res.status(500).json(
      buildHealthPayload({
        runtime,
        db: "error",
        dbConnected: false,
      })
    );
  }
});

app.get("/health", async (req, res) => {
  const runtime = getRuntimeStatusSnapshot();

  try {
    const pool = await getDbConnection();
    return res.json(
      buildHealthPayload({
        runtime,
        db: pool?.connected ? 1 : 0,
        dbConnected: !!pool?.connected,
      })
    );
  } catch {
    return res.status(500).json(
      buildHealthPayload({
        runtime,
        db: "error",
        dbConnected: false,
      })
    );
  }
});

app.get("/runtime/status", (req, res) => {
  const runtime = getRuntimeStatusSnapshot();
  return res.json(runtime);
});

app.use("/home", homeRouter);
app.use("/internal/maintenance", internalMaintenanceRouter);

app.use(authMiddleware);
app.use("/me/profile", profileRouter);
app.use("/me/feedback", meFeedbackRouter);
app.use("/installations", installationsRouter);
app.use("/installation-types", installationTypesRouter);
app.use("/admin/forms", adminFormsRouter);
app.use("/admin/installations", adminInstallationsRouter);
app.use("/admin/guidance", adminGuidanceRouter);
app.use("/admin/feedback", adminFeedbackRouter);
app.use("/admin/ai", adminAssistantRouter);
app.use("/forms-monitor", formsMonitorRouter);

app.get("/me", async (req: any, res) => {
  try {
    const base = {
      user: req.user,
      roles: req.roles || [],
    };

    if (!req.user?.objectId) {
      return res.json(base);
    }

    const profile = await profileService.getMyProfile(req.user);

    return res.json({
      ...base,
      profile: {
        display_name: profile?.profile?.effective_display_name || null,
        initials: profile?.effective?.initials || null,
        avatar_url: profile?.effective?.avatar_url || null,
        profile_note: profile?.profile?.profile_note || null,
      },
    });
  } catch (err) {
    console.error(err);
    return res.json({
      user: req.user,
      roles: req.roles || [],
    });
  }
});

app.get("/forms/definitions", requireRole("admin"), (req, res) => {
  res.json({ ok: true, data: [] });
});

app.get("/forms/instances", requireRole("admin", "gebruiker"), (req, res) => {
  res.json({ ok: true, data: [] });
});

export default app;
