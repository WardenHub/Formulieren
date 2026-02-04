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
// basis installatie data
router.get("/:code", getInstallation);
router.get("/:code/catalog", getCatalog);
router.get("/:code/custom-values", getCustomValues);
router.put("/:code/custom-values", requireRole("admin", "monteur"), putCustomValues);
router.get("/:code/documents", requireRole("admin", "monteur"), getDocuments);
router.put("/:code/type", requireRole("admin", "monteur"), putInstallationType);
router.put("/:code/documents", requireRole("admin", "monteur"), putDocuments);

export default router;
