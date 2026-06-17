// api/src/routes/installations.ts
import { Router } from "express";
import multer from "multer";
import {
  getInstallation,
  getCatalog,
  getCustomValues,
  putCustomValues,
  getDocuments,
  putInstallationType,
  putDocuments,
  uploadDocumentFile,
  getDocumentDownloadUrl,
  downloadDocumentFile,
  createDocumentReplacement,
  createDocumentAttachment,
  searchInstallations,
  getEnergySupplies,
  putEnergySupplies,
  getInstallationSoftware,
  putInstallationSoftware,
  uploadInstallationProgramming,
  getInstallationProgrammingDownloadUrl,
  downloadInstallationProgrammingFile,
  archiveInstallationProgramming,
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
  getFormInstanceDocuments,
  putFormInstanceDocuments,
  uploadFormInstanceDocumentFile,
  putFormInstanceDocumentFileName,
  getFormInstanceDocumentDownloadUrl,
  downloadFormInstanceDocumentFile,
  createFormInstanceDocumentReplacement,
  createFormInstanceDocumentAttachment,
  putFormInstanceDocumentLabels,
  putFormInstanceDocumentFollowUps,
  deleteFormInstanceDocument,
} from "../controllers/installationsController.js";

import {
  transcribeAssistantAudio,
  interpretAssistantText,
  applyAssistantPatches,
  rejectAssistantPatches,
  getAssistantAudit,
} from "../controllers/formsAssistantController.js";

import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES || 25 * 1024 * 1024),
  },
});

const assistantAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.ASSISTANT_AUDIO_UPLOAD_MAX_BYTES || 10 * 1024 * 1024),
  },
});

const documentRoles = ["admin", "gebruiker", "documentbeheerder"] as const;

router.get("/search", requireRole("admin", "gebruiker"), searchInstallations);

// stroomvoorziening e.d.
router.get("/energy-supply-brand-types", requireRole("admin", "gebruiker"), getEnergySupplyBrandTypes);
router.put("/energy-supply-brand-types", requireRole("admin"), putEnergySupplyBrandTypes);
router.get("/:code/energy-supplies", requireRole("admin", "gebruiker"), getEnergySupplies);
router.put("/:code/energy-supplies", requireRole("admin", "gebruiker"), putEnergySupplies);
router.delete("/:code/energy-supplies/:energySupplyId", requireRole("admin", "gebruiker"), deleteEnergySupply);

router.get("/:code/software", requireRole("admin", "gebruiker"), getInstallationSoftware);
router.put("/:code/software", requireRole("admin", "gebruiker"), putInstallationSoftware);
router.post(
  "/:code/software/programming/upload",
  requireRole("admin", "gebruiker"),
  upload.single("file"),
  uploadInstallationProgramming
);
router.get(
  "/:code/software/programming/:programmingId/download-url",
  requireRole("admin", "gebruiker"),
  getInstallationProgrammingDownloadUrl
);
router.get(
  "/:code/software/programming/:programmingId/download",
  requireRole("admin", "gebruiker"),
  downloadInstallationProgrammingFile
);
router.post(
  "/:code/software/programming/:programmingId/archive",
  requireRole("admin", "gebruiker"),
  archiveInstallationProgramming
);

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

router.get("/:code/documents", requireRole(...documentRoles), getDocuments);
router.put("/:code/documents", requireRole(...documentRoles), putDocuments);
router.post(
  "/:code/documents/:documentId/upload",
  requireRole(...documentRoles),
  upload.single("file"),
  uploadDocumentFile
);
router.get(
  "/:code/documents/:documentId/download-url",
  requireRole(...documentRoles),
  getDocumentDownloadUrl
);
router.get(
  "/:code/documents/:documentId/download",
  requireRole(...documentRoles),
  downloadDocumentFile
);
router.post(
  "/:code/documents/:documentId/replacements",
  requireRole(...documentRoles),
  createDocumentReplacement
);
router.post(
  "/:code/documents/:documentId/attachments",
  requireRole(...documentRoles),
  createDocumentAttachment
);

router.put("/:code/type", requireRole("admin", "gebruiker"), putInstallationType);

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

router.post(
  "/:code/forms/instances/:instanceId/assistant/transcribe",
  requireRole("admin", "gebruiker"),
  assistantAudioUpload.single("audio"),
  transcribeAssistantAudio
);

router.post(
  "/:code/forms/instances/:instanceId/assistant/interpret",
  requireRole("admin", "gebruiker"),
  interpretAssistantText
);

router.post(
  "/:code/forms/instances/:instanceId/assistant/patches/apply",
  requireRole("admin", "gebruiker"),
  applyAssistantPatches
);

router.post(
  "/:code/forms/instances/:instanceId/assistant/patches/reject",
  requireRole("admin", "gebruiker"),
  rejectAssistantPatches
);

router.get(
  "/:code/forms/instances/:instanceId/assistant/audit",
  requireRole("admin", "gebruiker", "documentbeheerder"),
  getAssistantAudit
);

router.get(
  "/:code/forms/instances/:instanceId/documents",
  requireRole("admin", "gebruiker"),
  getFormInstanceDocuments
);

router.put(
  "/:code/forms/instances/:instanceId/documents",
  requireRole("admin", "gebruiker"),
  putFormInstanceDocuments
);

router.post(
  "/:code/forms/instances/:instanceId/documents/:documentId/upload",
  requireRole("admin", "gebruiker"),
  upload.single("file"),
  uploadFormInstanceDocumentFile
);

router.put(
  "/:code/forms/instances/:instanceId/documents/:documentId/file-name",
  requireRole("admin", "gebruiker"),
  putFormInstanceDocumentFileName
);

router.get(
  "/:code/forms/instances/:instanceId/documents/:documentId/download-url",
  requireRole("admin", "gebruiker"),
  getFormInstanceDocumentDownloadUrl
);

router.get(
  "/:code/forms/instances/:instanceId/documents/:documentId/download",
  requireRole("admin", "gebruiker"),
  downloadFormInstanceDocumentFile
);

router.post(
  "/:code/forms/instances/:instanceId/documents/:documentId/replacements",
  requireRole("admin", "gebruiker"),
  createFormInstanceDocumentReplacement
);

router.post(
  "/:code/forms/instances/:instanceId/documents/:documentId/attachments",
  requireRole("admin", "gebruiker"),
  createFormInstanceDocumentAttachment
);

router.put(
  "/:code/forms/instances/:instanceId/documents/:documentId/labels",
  requireRole("admin", "gebruiker"),
  putFormInstanceDocumentLabels
);

router.put(
  "/:code/forms/instances/:instanceId/documents/:documentId/follow-ups",
  requireRole("admin", "gebruiker"),
  putFormInstanceDocumentFollowUps
);

router.delete(
  "/:code/forms/instances/:instanceId/documents/:documentId",
  requireRole("admin", "gebruiker"),
  deleteFormInstanceDocument
);

// offline-light import
router.post("/:code/forms/import", requireRole("admin", "gebruiker"), importFormAnswerFile);

export default router;
