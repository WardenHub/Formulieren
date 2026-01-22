import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";

let pool;

function buildConfigWithAccessToken({ server, database, token }) {
  return {
    server,
    database,
    port: 1433,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token },
    },
    connectionTimeout: 30000,
    requestTimeout: 30000,
  };
}

export async function getDbConnection() {
  const server = process.env.SQL_SERVER || process.env.AZURE_SQL_SERVER;
  const database = process.env.SQL_DATABASE || process.env.AZURE_SQL_DATABASE;

  if (!server) throw new Error("missing env var SQL_SERVER or AZURE_SQL_SERVER");
  if (!database) throw new Error("missing env var SQL_DATABASE or AZURE_SQL_DATABASE");

  // if we have a healthy connected pool, reuse it
  if (pool?.connected) return pool;

  // if we have a stale/closed pool hanging around, drop it
  if (pool && !pool.connected) {
    try { pool.close(); } catch {}
    pool = undefined;
  }

  const credential = new DefaultAzureCredential();
  const token = await credential.getToken("https://database.windows.net/.default");

  const cfg = buildConfigWithAccessToken({
    server,
    database,
    token: token.token,
  });

  const nextPool = new sql.ConnectionPool(cfg);

  // optional; helps you see pool-level errors in logs
  nextPool.on("error", (err) => {
    console.error("[SQL POOL ERROR]", err);
  });

  try {
    await nextPool.connect();
    pool = nextPool; // only cache after connect succeeded
    return pool;
  } catch (err) {
    try { nextPool.close(); } catch {}
    throw err;
  }
}
