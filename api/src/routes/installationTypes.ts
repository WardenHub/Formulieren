// /api/src/routes/installationTypes.ts
import { Router } from "express";
import { getInstallationTypes } from "../controllers/installationsController.js";

const router = Router();

router.get("/", getInstallationTypes);

export default router;
