import { Router } from "express";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import * as controller from "../controllers/inspectionsController.js";
import { getInspectionCase } from "../services/inspectionService.js";
import { assertInstallationWritable } from "../services/installationsService.js";

const router = Router();
// Role is an additional boundary; legacy documentbeheerder permissions do not grant writes.
router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  return requireRole("admin", "certificering_coordinator")(req, res, next);
});
router.get("/", requirePermission("inspection.view"), controller.overview);
router.param("caseId", async (req, res, next, caseId) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  try {
    const detail = await getInspectionCase(caseId);
    await assertInstallationWritable(detail.case.atrium_installation_code);
    if (["COMPLETED", "CANCELLED"].includes(detail.case.status)) {
      return res.status(409).json({ error: "Afgerond of geannuleerd dossier is alleen-lezen" });
    }
    return next();
  } catch (error: any) {
    return res.status(error?.status || 400).json({ error: error?.message || "Dossier kan niet worden gewijzigd" });
  }
});
router.post("/signal", requirePermission("inspection.create"), controller.signal);
router.get("/cases", requirePermission("inspection.view"), controller.list);
router.post("/cases", requirePermission("inspection.create"), controller.create);
router.get("/cases/:caseId", requirePermission("inspection.view"), controller.get);
router.put("/cases/:caseId", requirePermission("inspection.update"), controller.update);
router.put("/cases/:caseId/assignment", requirePermission("inspection.assign"), controller.assignment);
router.get("/cases/:caseId/events", requirePermission("inspection.audit.view"), controller.events);
router.get("/cases/:caseId/dossier.pdf", requirePermission("inspection.view"), controller.dossierPdf);
router.post("/cases/:caseId/workorders/refresh", requirePermission("inspection.refresh_workorder"), controller.refresh);
router.put("/cases/:caseId/checklist/:requirementId", requirePermission("inspection.checklist.manage"), controller.checklist);
router.post("/cases/:caseId/packages", requirePermission("inspection.package.prepare"), controller.preparePackage);
router.post("/cases/:caseId/packages/:packageId/send", requirePermission("inspection.package.send"), controller.sendPackage);
router.post("/cases/:caseId/reports", requirePermission("inspection.report.register"), controller.report);
router.post("/cases/:caseId/conclusion", requirePermission("inspection.conclusion.process"), controller.conclusion);
router.post("/cases/:caseId/reinspection", requirePermission("inspection.reinspection.create"), controller.reinspection);
router.post("/cases/:caseId/complete", requirePermission("inspection.complete"), controller.complete);
export default router;
