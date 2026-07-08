import { Router } from "express";

import {
  getAdminFeedback,
  putAdminFeedbackReply,
  putAdminFeedbackStatus,
} from "../controllers/feedbackController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.get("/", requireRole("admin"), getAdminFeedback);
router.put("/:feedbackId/status", requireRole("admin"), putAdminFeedbackStatus);
router.put("/:feedbackId/reply", requireRole("admin"), putAdminFeedbackReply);

export default router;
