import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";

let pool;

export async function getDbConnection() {
  const server = process.env.SQL_SERVER || process.env.AZURE_SQL_SERVER;
  const database = process.env.SQL_DATABASE || process.env.AZURE_SQL_DATABASE;
  if (!server) throw new Error("missing env var SQL_SERVER or AZURE_SQL_SERVER");
  if (!database) throw new Error("missing env var SQL_DATABASE or AZURE_SQL_DATABASE");
  
  if (pool) return pool;

  const auth = process.env.DB_AUTH || "aad";

  if (auth === "sql") {
    pool = await sql.connect({
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      port: 1433,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
      connectionTimeout: 30000,
      requestTimeout: 30000,
    });
    return pool;
  }

  const credential = new DefaultAzureCredential();
  const token = await credential.getToken("https://database.windows.net/.default");

  pool = new sql.ConnectionPool({
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    port: 1433,
    options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token: token.token },
    },
    connectionTimeout: 30000,
    requestTimeout: 30000,
  });

  await pool.connect();
  return pool;
}
