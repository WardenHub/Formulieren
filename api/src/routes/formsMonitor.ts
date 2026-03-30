//api/src/routes/formsMonitor.ts

import { Router } from "express";
import {
  getFormsMonitorList,
  getFormsMonitorDetail,
  getFormsMonitorFollowUps,
  postFormsMonitorStatusAction,
  postFormsMonitorFollowUpStatusAction,
  putFormsMonitorFollowUpNote,
} from "../controllers/formsMonitorController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.get("/", requireRole("admin", "gebruiker", "documentbeheerder"), getFormsMonitorList);
router.get("/:formInstanceId", requireRole("admin", "gebruiker", "documentbeheerder"), getFormsMonitorDetail);
router.get("/:formInstanceId/follow-ups", requireRole("admin", "gebruiker", "documentbeheerder"), getFormsMonitorFollowUps);

router.post("/:formInstanceId/status-action", requireRole("admin", "documentbeheerder"), postFormsMonitorStatusAction);
router.post("/follow-ups/:followUpActionId/status-action", requireRole("admin", "documentbeheerder"), postFormsMonitorFollowUpStatusAction);
router.put("/follow-ups/:followUpActionId/note", requireRole("admin", "documentbeheerder"), putFormsMonitorFollowUpNote);

export default router;