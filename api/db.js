import sql from "mssql";

let pool;

export async function getDbConnection() {
  const server = process.env.SQL_SERVER || process.env.AZURE_SQL_SERVER;
  const database = process.env.SQL_DATABASE || process.env.AZURE_SQL_DATABASE;

  if (!server) throw new Error("missing SQL_SERVER");
  if (!database) throw new Error("missing SQL_DATABASE");

  if (pool?.connected) return pool;

  const isAzure = !!process.env.WEBSITE_INSTANCE_ID;

  const config = {
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

  if (isAzure) {
    config.authentication = {
      type: "azure-active-directory-msi-app-service",
    };
  } else {
    config.user = process.env.SQL_USER;
    config.password = process.env.SQL_PASSWORD;
  }

  pool = await sql.connect(config);
  return pool;
}
