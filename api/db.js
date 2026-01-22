import sql from "mssql";
import { ManagedIdentityCredential, DefaultAzureCredential } from "@azure/identity";

let pool;

function buildConfigBase({ server, database }) {
  return {
    server,
    database,
    port: 1433,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    connectionTimeout: 30000,
    requestTimeout: 30000,
  };
}

function buildConfigWithAccessToken({ server, database, token }) {
  return {
    ...buildConfigBase({ server, database }),
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token },
    },
  };
}

function buildConfigWithSqlAuth({ server, database, user, password }) {
  return {
    ...buildConfigBase({ server, database }),
    user,
    password,
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

  const authMode = (process.env.DB_AUTH || (isAzure ? "mi" : "sql")).toLowerCase();
  console.log("[SQL] authMode", authMode, "isAzure", isAzure);

  let cfg;

  if (authMode === "sql") {
    const user = process.env.SQL_USER;
    const password = process.env.SQL_PASSWORD;
    if (!user) throw new Error("missing env var SQL_USER for sql auth");
    if (!password) throw new Error("missing env var SQL_PASSWORD for sql auth");

    cfg = buildConfigWithSqlAuth({ server, database, user, password });
  } else {
    // "mi" in azure, "aad" local (or if you set DB_AUTH=aad)
    const credential = isAzure ? new ManagedIdentityCredential() : new DefaultAzureCredential();
    const token = await credential.getToken("https://database.windows.net/.default");

    console.log(
      "[SQL] got token",
      !!token?.token,
      "expires",
      token?.expiresOnTimestamp
    );

    cfg = buildConfigWithAccessToken({ server, database, token: token.token });
  }

  const nextPool = new sql.ConnectionPool(cfg);
  nextPool.on("error", (err) => console.error("[SQL POOL ERROR]", err));

  await nextPool.connect();
  pool = nextPool;

  console.log("[SQL] pool connected", { connected: pool.connected, connecting: pool.connecting });

  return pool;
}
