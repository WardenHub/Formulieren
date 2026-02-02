// /api/src/routes/installations.ts

import { Router } from "express";
import {
  getInstallation,
  getCatalog,
  getCustomValues,
  putCustomValues,
  getDocuments,
  putInstallationType,
  putDocuments,
  searchInstallations, 
} from "../controllers/installationsController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

// authMiddleware zit al globaal in app.ts; dus hier geen router.use(authMiddleware)
router.get("/search", requireRole("admin", "monteur"), searchInstallations);
router.get("/:code", getInstallation);
router.get("/:code/catalog", getCatalog);

router.get("/:code/custom-values", getCustomValues);
router.put("/:code/custom-values", requireRole("admin", "monteur"), putCustomValues);

router.get("/:code/documents", requireRole("admin", "monteur"), getDocuments);

router.put("/:code/type", requireRole("admin", "monteur"), putInstallationType);

router.put("/:code/documents", requireRole("admin", "monteur"), putDocuments);


export default router;
