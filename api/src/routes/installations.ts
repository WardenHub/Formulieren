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
  importFormAnswerFile,
  startFormInstance,
  getFormInstance,
  withdrawFormInstance,
  submitFormInstance,
  putFormAnswers,
  reopenFormInstance,
} from "../controllers/installationsController.js";


import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

// authMiddleware zit al globaal in app.ts; dus hier geen router.use(authMiddleware)
router.get("/search", requireRole("admin", "monteur"), searchInstallations);
// stroomvoorziening e.d.
router.get("/energy-supply-brand-types", requireRole("admin", "monteur"), getEnergySupplyBrandTypes);
router.put("/energy-supply-brand-types", requireRole("admin"), putEnergySupplyBrandTypes);
router.get("/:code/energy-supplies", requireRole("admin", "monteur"), getEnergySupplies);
router.put("/:code/energy-supplies", requireRole("admin", "monteur"), putEnergySupplies);
router.delete("/:code/energy-supplies/:energySupplyId", requireRole("admin", "monteur"), deleteEnergySupply);
// NEN2535 prestatie-eisen catalog
router.get("/nen2535/catalog", requireRole("admin", "monteur"), getNen2535Catalog);
// NEN2535 prestatie-eisen per installatie
router.get("/:code/performance-requirements", requireRole("admin", "monteur"), getPerformanceRequirements);
router.put("/:code/performance-requirements", requireRole("admin", "monteur"), putPerformanceRequirements);

// preflight formulieren
router.get("/:code/forms/catalog", requireRole("admin", "monteur"), getFormsCatalog);
router.get("/:code/forms/:formCode/preflight", requireRole("admin", "monteur"), getFormStartPreflight);


// basis installatie data
router.get("/:code", getInstallation);
router.get("/:code/catalog", getCatalog);
router.get("/:code/custom-values", getCustomValues);
router.put("/:code/custom-values", requireRole("admin", "monteur"), putCustomValues);
router.get("/:code/documents", requireRole("admin", "monteur"), getDocuments);
router.put("/:code/type", requireRole("admin", "monteur"), putInstallationType);
router.put("/:code/documents", requireRole("admin", "monteur"), putDocuments);

// forms runtime
router.post("/:code/forms/:formCode/start", requireRole("admin", "monteur"), startFormInstance);
router.get("/:code/forms/instances/:instanceId", requireRole("admin", "monteur"), getFormInstance);
router.put("/:code/forms/instances/:instanceId/answers", requireRole("admin", "monteur"), putFormAnswers);
router.post("/:code/forms/instances/:instanceId/submit", requireRole("admin", "monteur"), submitFormInstance);
router.post("/:code/forms/instances/:instanceId/withdraw", requireRole("admin", "monteur"), withdrawFormInstance);
router.post("/:code/forms/instances/:instanceId/reopen", requireRole("admin", "monteur"), reopenFormInstance);
// offline-light import
router.post("/:code/forms/import", requireRole("admin", "monteur"), importFormAnswerFile);



export default router;
