// api/src/routes/adminAssistant.ts

import { Router } from "express";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  getAdminAssistantAudit,
} from "../controllers/formsAssistantController.js";

const router = Router();

router.get("/audit", requireRole("admin"), getAdminAssistantAudit);

export default router;