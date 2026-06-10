import { Router } from "express";
import { initializeInstallationTypesFromAtriumInternal } from "../controllers/adminInstallationsController.js";
import { requireMaintenanceKey } from "../middleware/maintenanceKeyMiddleware.js";

const router = Router();

router.post(
  "/installations/type-initialization/run",
  requireMaintenanceKey,
  initializeInstallationTypesFromAtriumInternal
);

export default router;
