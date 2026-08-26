import { Router } from "express";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  getAvailableForms,
  getFormInstance,
  getMyForms,
  previewSubmitFormInstance,
  reopenFormInstance,
  resolveContext,
  saveFormAnswers,
  searchContext,
  startForm,
  submitFormInstance,
  updateFormInstanceMetadata,
  withdrawFormInstance,
} from "../controllers/formsHubController.js";

const router = Router();
const allowed = requireRole("admin", "gebruiker");

router.get("/definitions", allowed, getAvailableForms);
router.get("/instances", allowed, getMyForms);
router.get("/instances/:instanceId", allowed, getFormInstance);
router.put("/instances/:instanceId/metadata", allowed, updateFormInstanceMetadata);
router.put("/instances/:instanceId/answers", allowed, saveFormAnswers);
router.post("/instances/:instanceId/submit-preview", allowed, previewSubmitFormInstance);
router.post("/instances/:instanceId/submit", allowed, submitFormInstance);
router.post("/instances/:instanceId/withdraw", allowed, withdrawFormInstance);
router.post("/instances/:instanceId/reopen", allowed, reopenFormInstance);
router.get("/contexts/:contextType/search", allowed, searchContext);
router.get("/contexts/:contextType/resolve", allowed, resolveContext);
router.post("/definitions/:formCode/start", allowed, startForm);

export default router;
