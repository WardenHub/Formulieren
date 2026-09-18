import { Router } from "express";
import { requireValidSignCallbackKey } from "../middleware/validSignCallbackKeyMiddleware.js";
import { postValidSignCallback } from "../controllers/documentSignatureController.js";

const router = Router();

// ValidSign kent per account maar een callback-adres. Dit is dat adres; het heeft een
// eigen sleutelcontrole en staat daarom voor de gewone authenticatie gemount.
router.post("/callback", requireValidSignCallbackKey, postValidSignCallback);

export default router;
