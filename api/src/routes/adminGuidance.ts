import { Router } from "express";
import multer from "multer";
import {
  activateGuidanceMedia,
  addExternalGuidanceMedia,
  archiveGuidanceMedia,
  createGuidanceItem,
  getAdminGuidanceCatalog,
  replaceGuidanceLinks,
  updateGuidanceItem,
  uploadGuidanceMedia,
} from "../controllers/adminGuidanceController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.GUIDANCE_MEDIA_UPLOAD_MAX_BYTES || 250 * 1024 * 1024),
  },
});

const allowedRoles = ["admin", "uitlegbeheerder"] as const;

router.get("/", requireRole(...allowedRoles), getAdminGuidanceCatalog);
router.post("/items", requireRole(...allowedRoles), createGuidanceItem);
router.put("/items/:guidanceId", requireRole(...allowedRoles), updateGuidanceItem);
router.put("/items/:guidanceId/links", requireRole(...allowedRoles), replaceGuidanceLinks);
router.post(
  "/items/:guidanceId/media/upload",
  requireRole(...allowedRoles),
  upload.single("file"),
  uploadGuidanceMedia
);
router.post(
  "/items/:guidanceId/media/external",
  requireRole(...allowedRoles),
  addExternalGuidanceMedia
);
router.post(
  "/items/:guidanceId/media/:guidanceMediaId/activate",
  requireRole(...allowedRoles),
  activateGuidanceMedia
);
router.post(
  "/items/:guidanceId/media/:guidanceMediaId/archive",
  requireRole(...allowedRoles),
  archiveGuidanceMedia
);

export default router;
