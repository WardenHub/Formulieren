//api/src/routes/formsMonitor.ts

import { Router } from "express";
import {
  getFormsMonitorList,
  getFormsMonitorDetail,
  getFormsMonitorFollowUps,
  postFormsMonitorStatusAction,
  postFormsMonitorFollowUpStatusAction,
  putFormsMonitorFollowUpNote,
  downloadFormsMonitorPdf,
  putFormsMonitorAssignment,
  putFormsMonitorComplimentPoint,
} from "../controllers/formsMonitorController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.get("/", requireRole("admin", "gebruiker", "documentbeheerder"), getFormsMonitorList);
router.get("/:formInstanceId/pdf", requireRole("admin", "gebruiker", "documentbeheerder"), downloadFormsMonitorPdf);
router.get("/:formInstanceId/follow-ups", requireRole("admin", "gebruiker", "documentbeheerder"), getFormsMonitorFollowUps);
router.get("/:formInstanceId", requireRole("admin", "gebruiker", "documentbeheerder"), getFormsMonitorDetail);


router.post("/:formInstanceId/status-action", requireRole("admin", "documentbeheerder"), postFormsMonitorStatusAction);
router.put("/:formInstanceId/assignment", requireRole("admin", "documentbeheerder"), putFormsMonitorAssignment);
router.put("/:formInstanceId/compliment-point", requireRole("admin", "documentbeheerder"), putFormsMonitorComplimentPoint);
router.post("/follow-ups/:followUpActionId/status-action", requireRole("admin", "documentbeheerder"), postFormsMonitorFollowUpStatusAction);
router.put("/follow-ups/:followUpActionId/note", requireRole("admin", "documentbeheerder"), putFormsMonitorFollowUpNote);


export default router;
