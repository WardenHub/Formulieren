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
} from "../controllers/profileController.js";

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

router.get("/directory", getDirectory);
router.get("/directory/:userObjectId/avatar/file", getDirectoryAvatarFile);

export default router;