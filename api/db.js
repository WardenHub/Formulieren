// IMPORTANT:
// In Azure App Service we MUST use:
// "azure-active-directory-msi-app-service"
// Never access-token auth there; SQL will reset the socket.

import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";

let pool;

function baseConfig({ server, database }) {
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

export async function getDbConnection() {
  const server = process.env.SQL_SERVER || process.env.AZURE_SQL_SERVER;
  const database = process.env.SQL_DATABASE || process.env.AZURE_SQL_DATABASE;

  if (!server) throw new Error("missing SQL_SERVER");
  if (!database) throw new Error("missing SQL_DATABASE");

  if (pool?.connected) return pool;

  const isAzure = !!process.env.WEBSITE_INSTANCE_ID;
  const authMode = (process.env.DB_AUTH || "sql").toLowerCase();

  let config = baseConfig({ server, database });

  if (isAzure) {
    // 🔥 production path; DO NOT TOUCH
    config.authentication = {
      type: "azure-active-directory-msi-app-service",
    };
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

  pool = await sql.connect(config);
  return pool;
}
