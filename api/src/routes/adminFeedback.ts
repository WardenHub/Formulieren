import { Router } from "express";

import {
  getAdminFeedback,
  deleteAdminFeedback,
  postAdminFeedbackRead,
  putAdminFeedbackReply,
  putAdminFeedbackStatus,
} from "../controllers/feedbackController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.get("/", requireRole("admin"), getAdminFeedback);
router.put("/:feedbackId/status", requireRole("admin"), putAdminFeedbackStatus);
router.put("/:feedbackId/reply", requireRole("admin"), putAdminFeedbackReply);
router.post("/:feedbackId/read", requireRole("admin"), postAdminFeedbackRead);
router.delete("/:feedbackId", requireRole("admin"), deleteAdminFeedback);

export default router;
