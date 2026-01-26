import { Router } from "express";
import {
  getInstallation,
  getCatalog,
  getCustomValues,
  putCustomValues,
} from "../controllers/installationsController";
import { requireRole } from "../middleware/roleMiddleware";

const router = Router();

// authMiddleware zit al globaal in app.ts; dus hier geen router.use(authMiddleware)

router.get("/:code", getInstallation);
router.get("/:code/catalog", getCatalog);
router.get("/:code/custom-values", getCustomValues);
router.put("/:code/custom-values", requireRole("admin", "monteur"), putCustomValues);

export default router;
