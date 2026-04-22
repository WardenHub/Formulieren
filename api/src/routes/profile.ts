// /api/src/routes/profile.ts

import { Router } from "express";
import multer from "multer";
import {
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
  deleteMyAvatar,
  uploadMySignature,
  deleteMySignature,
  getMyAvatarFile,
  getMySignatureFile,
} from "../controllers/profileController.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.get("/avatar/file", getMyAvatarFile);
router.get("/signature/file", getMySignatureFile);

router.get("/", getMyProfile);
router.put("/", updateMyProfile);

router.post("/avatar", upload.single("file"), uploadMyAvatar);
router.delete("/avatar", deleteMyAvatar);

router.post("/signature", upload.single("file"), uploadMySignature);
router.delete("/signature", deleteMySignature);

export default router;