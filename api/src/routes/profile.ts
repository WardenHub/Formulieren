// /api/src/routes/profile.ts

import { Router } from "express";
import multer from "multer";
import {
  getMyProfile,
  getDirectory,
  updateMyProfile,
  uploadMyAvatar,
  deleteMyAvatar,
  uploadMySignature,
  deleteMySignature,
  getMyAvatarFile,
  getMySignatureFile,
  getDirectoryAvatarFile,
  getMyMicrosoftAvatarFile,
  getDirectoryMicrosoftAvatarFile,
  getMyNotifications,
  postMyNotificationRead,
  postMyNotificationsReadAll,
} from "../controllers/profileController.js";

import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.get("/", getMyProfile);
router.put("/", updateMyProfile);

router.get("/avatar/file", getMyAvatarFile);
router.delete("/avatar", deleteMyAvatar);
router.post("/avatar", upload.single("file"), uploadMyAvatar);

router.get("/signature/file", getMySignatureFile);
router.delete("/signature", deleteMySignature);
router.post("/signature", upload.single("file"), uploadMySignature);

// Het smoelenboek is bedrijfsgegevens; het stond open voor elke geauthenticeerde
// gebruiker, ook voor iemand wiens rollookup was mislukt en die dus geen enkele rol had.
router.get("/directory", requireRole("admin", "gebruiker", "documentbeheerder", "uitlegbeheerder", "kam_coordinator", "certificering_coordinator"), getDirectory);
router.get("/directory/:userObjectId/avatar/file", getDirectoryAvatarFile);
router.get("/notifications", getMyNotifications);
router.post("/notifications/read-all", postMyNotificationsReadAll);
router.post("/notifications/:notificationEventId/read", postMyNotificationRead);

router.get("/avatar/microsoft/file", getMyMicrosoftAvatarFile);
router.get("/directory/:userObjectId/avatar/microsoft/file", getDirectoryMicrosoftAvatarFile);

export default router;
