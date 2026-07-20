// api/src/services/formReportPdfService.ts
import { buildFormReportExportModel } from "./formReportExportModelService.js";
import { tryBuildHtmlFormReportPdf } from "./formReportHtmlRendererService.js";

type PdfProgressReporter = (phase: string, message: string, progress?: number) => void;

/**
 * Bouwt een formulier-rapport uitsluitend via de gedeelde HTML/Playwright-renderer.
 * De renderer ontvangt het volledige exportmodel, zodat runtime en PDF-export
 * dezelfde brondata en weergavelogica gebruiken.
 */
export async function buildFormReportPdf(
  formInstanceIdRaw: any,
  user: any,
  reportProgress?: PdfProgressReporter
) {
  reportProgress?.("building_model", "Rapportdata wordt verzameld", 12);
  const exportModelResult: any = await buildFormReportExportModel(formInstanceIdRaw, user);
  if (exportModelResult?.error === "not found") return exportModelResult;

  return tryBuildHtmlFormReportPdf(exportModelResult.model, reportProgress);
}
