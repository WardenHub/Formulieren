// api/src/routes/adminInstallations.ts

import { Router } from "express";
import {
  getAdminInstallationsCatalog,
  saveAdminInstallationTypes,
  saveAdminInstallationSections,
  saveAdminInstallationFields,
  saveAdminInstallationDocuments,
  saveAdminInstallationExternalFields,
} from "../controllers/adminInstallationsController.js";

import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.get("/", requireRole("admin"), getAdminInstallationsCatalog);
router.put("/types", requireRole("admin"), saveAdminInstallationTypes);
router.put("/sections", requireRole("admin"), saveAdminInstallationSections);
router.put("/fields", requireRole("admin"), saveAdminInstallationFields);
router.put("/documents", requireRole("admin"), saveAdminInstallationDocuments);
router.put("/external-fields", requireRole("admin"), saveAdminInstallationExternalFields);

export default router;