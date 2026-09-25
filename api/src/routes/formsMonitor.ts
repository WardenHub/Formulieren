//api/src/routes/formsMonitor.ts

import { Router } from "express";
import {
  getFormsMonitorList,
  getFormsMonitorDetail,
  getFormsMonitorFollowUps,
  getFormsMonitorEvents,
  getFormsMonitorFollowUpReview,
  postFormsMonitorFollowUpReview,
  postFormsMonitorStatusAction,
  postFormsMonitorFollowUpStatusAction,
  postFormsMonitorManualFollowUp,
  putFormsMonitorFollowUpNote,
  deleteFormsMonitorFollowUp,
  getFormsMonitorFollowUpAttachmentUrl,
  putFormsMonitorFollowUpCertificateImpact,
  putFormsMonitorFollowUpClassification,
  downloadFormsMonitorPdf,
  downloadFormsMonitorActionPointsPdf,
  postFormsMonitorPdfJob,
  getFormsMonitorPdfJob,
  downloadFormsMonitorPdfJob,
  putFormsMonitorAssignment,
  putFormsMonitorComplimentPoint,
} from "../controllers/formsMonitorController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.get("/", requireRole("admin", "gebruiker", "documentbeheerder", "kam_coordinator"), getFormsMonitorList);
router.post("/:formInstanceId/pdf-jobs", requireRole("admin", "gebruiker", "documentbeheerder"), postFormsMonitorPdfJob);
router.get("/pdf-jobs/:jobId", requireRole("admin", "gebruiker", "documentbeheerder"), getFormsMonitorPdfJob);
router.get("/pdf-jobs/:jobId/download", requireRole("admin", "gebruiker", "documentbeheerder"), downloadFormsMonitorPdfJob);
router.get("/:formInstanceId/pdf", requireRole("admin", "gebruiker", "documentbeheerder"), downloadFormsMonitorPdf);
router.get("/:formInstanceId/action-points.pdf", requireRole("admin", "gebruiker", "documentbeheerder"), downloadFormsMonitorActionPointsPdf);
router.get("/:formInstanceId/follow-ups", requireRole("admin", "gebruiker", "documentbeheerder", "kam_coordinator"), getFormsMonitorFollowUps);
router.get("/:formInstanceId/follow-up-review", requireRole("admin", "gebruiker", "documentbeheerder", "kam_coordinator"), getFormsMonitorFollowUpReview);
// Ruimer dan de handeling zelf; resolveFormProcessor in de service bepaalt per formulier
// wie mag beoordelen. Een KAM-coordinator op een gewoon formulier krijgt daar forbidden.
router.post("/:formInstanceId/follow-up-review", requireRole("admin", "documentbeheerder", "kam_coordinator"), postFormsMonitorFollowUpReview);
router.get("/:formInstanceId/events", requireRole("admin", "gebruiker", "documentbeheerder", "kam_coordinator"), getFormsMonitorEvents);
router.get("/:formInstanceId", requireRole("admin", "gebruiker", "documentbeheerder", "kam_coordinator"), getFormsMonitorDetail);


// Idem; het definitief maken zit achter FormDefinition.finalize_role_code in de service.
router.post("/:formInstanceId/status-action", requireRole("admin", "documentbeheerder", "kam_coordinator"), postFormsMonitorStatusAction);
router.put("/:formInstanceId/assignment", requireRole("admin", "documentbeheerder"), putFormsMonitorAssignment);
router.put("/:formInstanceId/compliment-point", requireRole("admin", "documentbeheerder"), putFormsMonitorComplimentPoint);
router.post("/:formInstanceId/follow-ups", requireRole("admin", "documentbeheerder"), postFormsMonitorManualFollowUp);
router.post("/follow-ups/:followUpActionId/status-action", requireRole("admin", "documentbeheerder", "kam_coordinator"), postFormsMonitorFollowUpStatusAction);
router.put("/follow-ups/:followUpActionId/note", requireRole("admin", "documentbeheerder"), putFormsMonitorFollowUpNote);
/* Wie wat mag weghalen zit in de service; de route laat iedereen door die uberhaupt met punten
   werkt, zodat een gebruiker zijn eigen vergissing kan herstellen. */
router.delete(
  "/follow-ups/:followUpActionId",
  requireRole("admin", "documentbeheerder", "kam_coordinator", "gebruiker"),
  deleteFormsMonitorFollowUp
);
router.get(
  "/follow-ups/:followUpActionId/attachments/:storedFileId/download-url",
  requireRole("admin", "gebruiker", "documentbeheerder", "kam_coordinator"),
  getFormsMonitorFollowUpAttachmentUrl
);
router.put("/follow-ups/:followUpActionId/certificate-impact", requireRole("admin", "documentbeheerder"), putFormsMonitorFollowUpCertificateImpact);
router.put(
  "/follow-ups/:followUpActionId/classification",
  requireRole("admin", "documentbeheerder"),
  putFormsMonitorFollowUpClassification
);


export default router;
