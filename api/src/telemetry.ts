/**
 * Optional Azure Monitor instrumentation for the API.
 *
 * The SDK is deliberately inert when no connection string is configured. This
 * keeps local development and the existing runtime behavior unchanged while
 * allowing the Azure App Service to collect request, dependency and exception
 * telemetry through its normal Application Insights setting.
 */
import { useAzureMonitor } from "applicationinsights";

const connectionString = String(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || "").trim();

if (connectionString) {
  useAzureMonitor({
    enableAutoCollectRequests: true,
    enableAutoCollectDependencies: true,
    enableAutoCollectExceptions: true,
    enableAutoCollectPerformance: true,
  });

  console.log("application insights telemetry enabled");
}

