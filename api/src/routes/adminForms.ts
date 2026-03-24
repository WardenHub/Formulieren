import { Router } from "express";
import {
  getAdminForms,
  getAdminFormDetail,
  createAdminForm,
  saveAdminFormsOrder,
  saveAdminFormConfig,
  createAdminFormVersion,
} from "../controllers/adminFormsController.js";

import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.get("/", requireRole("admin"), getAdminForms);
router.get("/:formId", requireRole("admin"), getAdminFormDetail);
router.post("/", requireRole("admin"), createAdminForm);
router.put("/order", requireRole("admin"), saveAdminFormsOrder);
router.put("/:formId/config", requireRole("admin"), saveAdminFormConfig);
router.post("/:formId/versions", requireRole("admin"), createAdminFormVersion);

export default router;