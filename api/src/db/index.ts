// api/src/db/index.ts
// IMPORTANT:
// In Azure App Service we MUST use:
// "azure-active-directory-msi-app-service"
// Never access-token auth there; SQL will reset the socket.

import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";

let pool: sql.ConnectionPool | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransientSqlConnectError(err: any): boolean {
  const code = err?.code ?? err?.originalError?.code ?? err?.cause?.code;
  const message = String(err?.message ?? "").toLowerCase();

  // Network/socket/transient connect issues that are usually safe to retry
  return (
    code === "ESOCKET" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "EAI_AGAIN" ||
    message.includes("socket hang up") ||
    message.includes("login timeout") ||
    message.includes("failed to connect")
  );
}

async function connectWithRetry(config: any) {
  const maxAttempts = Number(process.env.SQL_CONNECT_MAX_ATTEMPTS || 6);
  const baseDelayMs = Number(process.env.SQL_CONNECT_RETRY_BASE_DELAY_MS || 250);
  const maxDelayMs = Number(process.env.SQL_CONNECT_RETRY_MAX_DELAY_MS || 5000);

  let lastErr: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Ensure we don't keep a broken pool around between attempts
      if (pool) {
        try {
          await pool.close();
        } catch {
          // ignore
        }
        pool = undefined;
      }

      pool = await new sql.ConnectionPool(config).connect();

      // If the pool errors later (e.g., serverless pause / network flap), drop it so next query reconnects.
      pool.on("error", (e) => {
        console.error("[SQL] pool error; dropping pool", e);
        try {
          pool?.close();
        } catch {
          // ignore
        }
        pool = undefined;
      });

      return pool;
    } catch (err: any) {
      lastErr = err;

      const transient = isTransientSqlConnectError(err);
      const canRetry = transient && attempt < maxAttempts;

      console.error(
        `[SQL] connect attempt ${attempt}/${maxAttempts} failed (${transient ? "transient" : "non-transient"})`,
        err
      );

      if (!canRetry) throw err;

      // Exponential backoff with a bit of jitter
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.min(250, exp * 0.2));
      const delay = exp + jitter;

      await sleep(delay);
    }
  }

  throw lastErr;
}

const ms = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function baseConfig({ server, database }: { server: string; database: string }) {
  return {
    server,
    database,
    port: 1433,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
      // keepAlive can help with idle path drops (supported by tedious)
      keepAlive: true,
    },
    // Serverless resume can exceed 30s; bump this.
    connectionTimeout: ms(process.env.SQL_CONNECTION_TIMEOUT_MS, 60000),
    requestTimeout: ms(process.env.SQL_REQUEST_TIMEOUT_MS, 30000),

    // Optional: pool tuning (defaults are usually fine; this just makes it explicit)
    pool: {
      max: ms(process.env.SQL_POOL_MAX, 10),
      min: ms(process.env.SQL_POOL_MIN, 0),
      idleTimeoutMillis: ms(process.env.SQL_POOL_IDLE_TIMEOUT_MS, 30000),
    },
  };
}

export async function getDbConnection() {
  const server = process.env.SQL_SERVER || process.env.AZURE_SQL_SERVER;
  const database = process.env.SQL_DATABASE || process.env.AZURE_SQL_DATABASE;

  if (!server) throw new Error("missing SQL_SERVER");
  if (!database) throw new Error("missing SQL_DATABASE");

  if (pool?.connected) return pool;

  const isAzure = !!process.env.WEBSITE_INSTANCE_ID;
  const authMode = (process.env.DB_AUTH || "sql").toLowerCase();

  const config: any = baseConfig({ server, database });

  if (isAzure) {
    // production path; DO NOT TOUCH
    config.authentication = { type: "azure-active-directory-msi-app-service" };
    console.log("[SQL] auth mode: managed identity (app service)");
  } else if (authMode === "aad") {
    // lokaal: Azure CLI / VS Code login
    const credential = new DefaultAzureCredential();
    const token = await credential.getToken("https://database.windows.net/.default");

    config.authentication = {
      type: "azure-active-directory-access-token",
      options: { token: token.token },
    };
    console.log("[SQL] auth mode: aad (local)");
  } else {
    // lokaal default: SQL login
    const user = process.env.SQL_USER;
    const password = process.env.SQL_PASSWORD;
    if (!user || !password) {
      throw new Error("missing SQL_USER or SQL_PASSWORD for local sql auth");
    }

    config.user = user;
    config.password = password;
    console.log("[SQL] auth mode: sql login (local)");
  }

  try {
    // Use retrying connect to survive serverless resume / transient network resets.
    pool = await connectWithRetry(config);
    return pool;
  } catch (e) {
    // Ensure callers don't get stuck with a bad pool reference
    pool = undefined;
    throw e;
  }
}

function applyParams(req: sql.Request, params?: Record<string, any>) {
  for (const [k, v] of Object.entries(params || {})) {
    req.input(k, v as any);
  }
}

/**
 * Single SELECT helper (backwards compatible)
 * Returns: rows array
 */
export async function sqlQuery<T = any>(queryText: string, params?: Record<string, any>) {
  const pool = await getDbConnection();
  const req = pool.request();
  applyParams(req, params);

  const result = await req.query<T>(queryText);
  return result.recordset;
}

/**
 * Raw helper for multi-select queries
 * Returns: full mssql result object (recordset + recordsets + output + rowsAffected)
 */
export async function sqlQueryRaw<T = any>(queryText: string, params?: Record<string, any>) {
  const pool = await getDbConnection();
  const req = pool.request();
  applyParams(req, params);

  const result = await req.query<T>(queryText);
  return result;
}
