// api/src/server.ts
import "./env.js";
import app from "./app.js";
import { warmUpHtmlFormReportRenderer } from "./services/formReportHtmlRendererService.js";
import { markRuntimeRendererWarmUp, markRuntimeServerListening } from "./services/runtimeStatusService.js";

const port = Number(process.env.PORT) || 8080;

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

app.listen(port, () => {
  console.log(`ember-api listening on ${port}`);
  markRuntimeServerListening();

  if (String(process.env.FORM_REPORT_PREWARM_DISABLED || "").trim() === "1") return;

  const delays = [250, 10000];
  for (const delay of delays) {
    setTimeout(() => {
      markRuntimeRendererWarmUp("startup");
      void warmUpHtmlFormReportRenderer();
    }, delay);
  }
});
