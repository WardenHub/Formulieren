// api/src/services/formReportPdfService.ts
import { buildFormReportExportModel, buildFormReportFileName } from "./formReportExportModelService.js";
import { tryBuildActionPointsPdf, tryBuildHtmlFormReportPdf } from "./formReportHtmlRendererService.js";

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

/* De actiepuntenbijlage als los bestand.

   Hetzelfde blad dat achterin het rapport staat, maar zelfstandig, zodat de behandelaar het
   los kan meesturen zonder het hele rapport door te hoeven sturen. De naam krijgt het
   voorvoegsel Actiepunten, anders staan er straks twee pdf's met dezelfde naam in een mailbox.

   Levert null terug als het formulier geen actiepunten heeft; de knop hoort dan niets op te
   leveren in plaats van een leeg vel. */
export async function buildActionPointsPdf(formInstanceIdRaw: any, user: any) {
  const exportModelResult: any = await buildFormReportExportModel(formInstanceIdRaw, user);
  if (exportModelResult?.error === "not found") return exportModelResult;

  const buffer = await tryBuildActionPointsPdf(exportModelResult.model);
  if (!buffer) return { ok: false, empty: true };

  const fileName = `Actiepunten-${buildFormReportFileName(exportModelResult.model)}`;

  return {
    ok: true,
    buffer,
    contentType: "application/pdf",
    contentLength: buffer.length,
    fileName,
    contentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
  };
}
