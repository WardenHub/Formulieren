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
  getEnergySupplies,
  putEnergySupplies,
  getEnergySupplyBrandTypes,
  putEnergySupplyBrandTypes,
  deleteEnergySupply,
  getNen2535Catalog,
  getPerformanceRequirements,
  putPerformanceRequirements,
  getFormStartPreflight,
  getFormsCatalog,
  getInstallationFormInstances,
  importFormAnswerFile,
  startFormInstance,
  startChildFormInstance,
  getFormInstance,
  withdrawFormInstance,
  submitFormInstance,
  putFormAnswers,
  putFormInstanceMetadata,
  reopenFormInstance,
  getFormPrefill,
  getInstallationComponents,
  previewSubmitFormInstance,
} from "../controllers/installationsController.js";

import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

// authMiddleware zit al globaal in app.ts; dus hier geen router.use(authMiddleware)
router.get("/search", requireRole("admin", "gebruiker"), searchInstallations);

// stroomvoorziening e.d.
router.get("/energy-supply-brand-types", requireRole("admin", "gebruiker"), getEnergySupplyBrandTypes);
router.put("/energy-supply-brand-types", requireRole("admin"), putEnergySupplyBrandTypes);
router.get("/:code/energy-supplies", requireRole("admin", "gebruiker"), getEnergySupplies);
router.put("/:code/energy-supplies", requireRole("admin", "gebruiker"), putEnergySupplies);
router.delete("/:code/energy-supplies/:energySupplyId", requireRole("admin", "gebruiker"), deleteEnergySupply);

// NEN2535 prestatie-eisen catalog
router.get("/nen2535/catalog", requireRole("admin", "gebruiker"), getNen2535Catalog);

// NEN2535 prestatie-eisen per installatie
router.get("/:code/performance-requirements", requireRole("admin", "gebruiker"), getPerformanceRequirements);
router.put("/:code/performance-requirements", requireRole("admin", "gebruiker"), putPerformanceRequirements);

// forms start / catalog / overview / preflight
router.get("/:code/forms/catalog", requireRole("admin", "gebruiker"), getFormsCatalog);
router.get("/:code/forms/overview", requireRole("admin", "gebruiker"), getInstallationFormInstances);
router.get("/:code/forms/:formCode/preflight", requireRole("admin", "gebruiker"), getFormStartPreflight);

// basis installatie data
router.get("/:code", getInstallation);
router.get("/:code/catalog", getCatalog);
router.get("/:code/custom-values", getCustomValues);
router.get("/:code/components", requireRole("admin", "gebruiker"), getInstallationComponents);
router.put("/:code/custom-values", requireRole("admin", "gebruiker"), putCustomValues);
router.get("/:code/documents", requireRole("admin", "gebruiker"), getDocuments);
router.put("/:code/type", requireRole("admin", "gebruiker"), putInstallationType);
router.put("/:code/documents", requireRole("admin", "gebruiker"), putDocuments);

// prefill (SurveyJS ember.bind kind="prefill")
router.post("/:code/forms/:formCode/prefill", requireRole("admin", "gebruiker"), getFormPrefill);

// forms runtime
router.post("/:code/forms/:formCode/start", requireRole("admin", "gebruiker"), startFormInstance);
router.post(
  "/:code/forms/instances/:parentInstanceId/children/:formCode/start",
  requireRole("admin", "gebruiker"),
  startChildFormInstance
);
router.get("/:code/forms/instances/:instanceId", requireRole("admin", "gebruiker"), getFormInstance);
router.put("/:code/forms/instances/:instanceId/metadata", requireRole("admin", "gebruiker"), putFormInstanceMetadata);
router.put("/:code/forms/instances/:instanceId/answers", requireRole("admin", "gebruiker"), putFormAnswers);
router.post("/:code/forms/instances/:instanceId/submit-preview", requireRole("admin", "gebruiker"), previewSubmitFormInstance);
router.post("/:code/forms/instances/:instanceId/submit", requireRole("admin", "gebruiker"), submitFormInstance);
router.post("/:code/forms/instances/:instanceId/withdraw", requireRole("admin", "gebruiker"), withdrawFormInstance);
router.post("/:code/forms/instances/:instanceId/reopen", requireRole("admin", "gebruiker"), reopenFormInstance);

// offline-light import
router.post("/:code/forms/import", requireRole("admin", "gebruiker"), importFormAnswerFile);

export default router;