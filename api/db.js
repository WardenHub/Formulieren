import sql from "mssql";
import { ManagedIdentityCredential, DefaultAzureCredential } from "@azure/identity";

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

  if (pool?.connected) return pool;

  if (pool && !pool.connected) {
    try { pool.close(); } catch {}
    pool = undefined;
  }

  const isAzure = !!process.env.WEBSITE_INSTANCE_ID;

  // in azure: force managed identity
  // local: keep default chain (az cli / env etc.)
  const credential = isAzure ? new ManagedIdentityCredential() : new DefaultAzureCredential();

  const token = await credential.getToken("https://database.windows.net/.default");
  console.log("[SQL] got token", !!token?.token, "expires", token?.expiresOnTimestamp, "isAzure", isAzure);

  const cfg = buildConfigWithAccessToken({ server, database, token: token.token });

  const nextPool = new sql.ConnectionPool(cfg);
  nextPool.on("error", (err) => console.error("[SQL POOL ERROR]", err));

  await nextPool.connect();
  pool = nextPool;
  console.log("[SQL] pool connected", { connected: pool.connected, connecting: pool.connecting });

  return pool;
}
