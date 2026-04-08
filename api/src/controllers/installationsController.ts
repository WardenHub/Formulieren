// api/src/controllers/installationsController.ts
import type { Request, Response } from "express";
import * as service from "../services/installationsService.js";
import * as formsService from "../services/formsService.js";
import * as documentFilesService from "../services/installationDocumentFilesService.js";
import * as formDocumentFilesService from "../services/formInstanceDocumentFilesService.js";

// -------------------- Installations --------------------

export async function getInstallation(req: Request, res: Response) {
  try {
    const codeParam: any = (req.params as any).code;
    const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;

    const data = await service.getInstallationByCode(code);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getInstallation failed" });
  }
}

export async function getCatalog(req: Request, res: Response) {
  try {
    const codeParam: any = (req.params as any).code;
    const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;

    const data = await service.getCatalog(code);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getCatalog failed" });
  }
}

export async function getCustomValues(req: Request, res: Response) {
  try {
    const codeParam: any = (req.params as any).code;
    const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;

    const data = await service.getCustomValues(code);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getCustomValues failed" });
  }
}

export async function putCustomValues(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const values = req.body?.values;

    const result = await service.upsertCustomValues(code, values, req.user);
    if (result?.ok === false) return res.status(400).json(result);

    return res.json(result);
  } catch (err: any) {
    const msg = err?.message || String(err);

    if (msg.toLowerCase().includes("installation not found")) {
      return res.status(404).json({ error: "installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "putCustomValues failed" });
  }
}

export async function getDocuments(req: any, res: Response) {
  try {
    const codeParam: any = (req.params as any).code;
    const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;

    const data = await service.getInstallationDocuments(code);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getDocuments failed" });
  }
}

export async function getInstallationTypes(req: Request, res: Response) {
  try {
    const data = await service.getInstallationTypes();
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getInstallationTypes failed" });
  }
}

export async function putInstallationType(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const installation_type_key = req.body?.installation_type_key ?? null;

    const updatedBy = req.user?.name || req.user?.upn || "unknown";
    const data = await service.setInstallationType(code, installation_type_key, updatedBy);

    return res.json(data);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "putInstallationType failed" });
  }
}

export async function putDocuments(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const documents = req.body?.documents;

    const result = await service.upsertInstallationDocuments(code, documents, req.user);
    if (result?.ok === false) return res.status(400).json(result);

    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }

    if (msg.includes("installation not found")) {
      return res.status(404).json({ error: "installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "putDocuments failed" });
  }
}

export async function uploadDocumentFile(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const documentId = String(req.params.documentId || "");
    const file = req.file;

    const result = await documentFilesService.uploadDocumentFile(code, documentId, file, req.user);
    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("missing file")) {
      return res.status(400).json({ error: "missing file" });
    }
    if (msg.includes("document not found")) {
      return res.status(404).json({ error: "document not found" });
    }
    if (msg.includes("document already has file")) {
      return res.status(409).json({ error: "document already has file" });
    }

    console.error(err);
    return res.status(500).json({ error: "uploadDocumentFile failed" });
  }
}

export async function getDocumentDownloadUrl(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const documentId = String(req.params.documentId || "");

    const result = await documentFilesService.getDocumentDownloadUrl(code, documentId);
    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("document not found")) {
      return res.status(404).json({ error: "document not found" });
    }
    if (msg.includes("document has no file")) {
      return res.status(404).json({ error: "document has no file" });
    }

    console.error(err);
    return res.status(500).json({ error: "getDocumentDownloadUrl failed" });
  }
}

export async function createDocumentReplacement(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const documentId = String(req.params.documentId || "");
    const payload = req.body || {};

    const result = await documentFilesService.createReplacementDocument(code, documentId, payload, req.user);
    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("parent document not found")) {
      return res.status(404).json({ error: "parent document not found" });
    }
    if (msg.includes("parent document invalid")) {
      return res.status(409).json({ error: "parent document invalid" });
    }

    console.error(err);
    return res.status(500).json({ error: "createDocumentReplacement failed" });
  }
}

export async function createDocumentAttachment(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const documentId = String(req.params.documentId || "");
    const payload = req.body || {};

    const result = await documentFilesService.createAttachmentDocument(code, documentId, payload, req.user);
    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("parent document not found")) {
      return res.status(404).json({ error: "parent document not found" });
    }
    if (msg.includes("parent document invalid")) {
      return res.status(409).json({ error: "parent document invalid" });
    }

    console.error(err);
    return res.status(500).json({ error: "createDocumentAttachment failed" });
  }
}

export async function searchInstallations(req: any, res: Response) {
  try {
    const q = req.query?.q ? String(req.query.q) : null;
    const take = req.query?.take ? Number(req.query.take) : 25;

    const data = await service.searchInstallations(q, Number.isFinite(take) ? take : 25);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "searchInstallations failed" });
  }
}

export async function getEnergySupplyBrandTypes(req: any, res: Response) {
  try {
    const data = await service.getEnergySupplyBrandTypes();
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getEnergySupplyBrandTypes failed" });
  }
}

export async function putEnergySupplyBrandTypes(req: any, res: any) {
  try {
    const types = req.body?.types;
    const result = await service.upsertEnergySupplyBrandTypes(types, req.user);
    if (result?.ok === false) return res.status(400).json(result);
    return res.json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "putEnergySupplyBrandTypes failed" });
  }
}

export async function getEnergySupplies(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const data = await service.getInstallationEnergySupplies(code);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getEnergySupplies failed" });
  }
}

export async function putEnergySupplies(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const items = req.body?.items;

    const result = await service.upsertInstallationEnergySupplies(code, items, req.user);
    if (result?.ok === false) return res.status(400).json(result);

    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }

    if (msg.includes("installation not found")) {
      return res.status(404).json({ error: "installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "putEnergySupplies failed" });
  }
}

export async function deleteEnergySupply(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const energy_supply_id = String(req.params.energySupplyId || "");

    const result = await service.deleteInstallationEnergySupply(code, energy_supply_id, req.user);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "deleteEnergySupply failed" });
  }
}

export async function getNen2535Catalog(req: any, res: Response) {
  try {
    const data = await service.getNen2535Catalog();
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getNen2535Catalog failed" });
  }
}

export async function getPerformanceRequirements(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const data = await service.getInstallationPerformanceRequirements(code);
    return res.json(data);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (msg.includes("installation not found")) return res.status(404).json({ error: "installation not found" });
    console.error(err);
    return res.status(500).json({ error: "getPerformanceRequirements failed" });
  }
}

export async function putPerformanceRequirements(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const payload = req.body;

    const result = await service.upsertInstallationPerformanceRequirements(code, payload, req.user);
    if (result?.ok === false) return res.status(400).json(result);

    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }
    if (msg.includes("installation not found")) {
      return res.status(404).json({ error: "installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "putPerformanceRequirements failed" });
  }
}

// -------------------- Forms (use formsService) --------------------

export async function getFormStartPreflight(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const formCode = String(req.params.formCode || "");

    const data = await formsService.getFormStartPreflight(code, formCode, req.user);
    return res.json(data);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "getFormStartPreflight failed" });
  }
}

export async function getFormsCatalog(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const data = await formsService.getFormsCatalog(code);
    return res.json(data);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "getFormsCatalog failed" });
  }
}

export async function getInstallationFormInstances(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const q = req.query?.q ? String(req.query.q) : null;

    const rawStatuses = req.query?.statuses;
    const statuses = Array.isArray(rawStatuses)
      ? rawStatuses.map((x) => String(x).trim()).filter(Boolean)
      : typeof rawStatuses === "string"
        ? rawStatuses.split(",").map((x) => x.trim()).filter(Boolean)
        : [];

    const data = await formsService.getInstallationFormInstances(code, {
      q,
      statuses,
    });

    return res.json(data);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "getInstallationFormInstances failed" });
  }
}

export async function startFormInstance(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const formCode = String(req.params.formCode || "");

    const data = await formsService.startFormInstance(code, formCode, req.user);
    if (data?.error === "not found") return res.status(404).json({ error: "not found" });

    return res.json(data);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (msg.includes("atrium installation not found")) return res.status(404).json({ error: "atrium installation not found" });
    if (msg.includes("form not found")) return res.status(404).json({ error: "form not found" });
    console.error(err);
    return res.status(500).json({ error: "startFormInstance failed" });
  }
}

export async function startChildFormInstance(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const parentInstanceId = req.params.parentInstanceId;
    const formCode = String(req.params.formCode || "");

    const result = await formsService.startChildFormInstance(
      code,
      parentInstanceId,
      formCode,
      req.user
    );

    if (result && "ok" in result && result.ok === false) {
      return res.status(400).json(result);
    }

    if (result && "error" in result) {
      if (result.error === "not found") {
        return res.status(404).json({ error: "not found" });
      }
      return res.status(400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }
    if (msg.includes("parent form instance not found")) {
      return res.status(404).json({ error: "parent form instance not found" });
    }
    if (msg.includes("parent form instance invalid")) {
      return res.status(400).json({ error: "parent form instance invalid" });
    }
    if (msg.includes("form not found")) {
      return res.status(404).json({ error: "form not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "startChildFormInstance failed" });
  }
}

export async function getFormInstance(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");

    const data = await formsService.getFormInstance(code, instanceId);
    if (data?.error === "not found") return res.status(404).json({ error: "not found" });

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getFormInstance failed" });
  }
}

export async function putFormInstanceMetadata(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const payload = req.body || {};

    const result = await formsService.updateFormInstanceMetadata(code, instanceId, payload, req.user);
    if (result?.ok === false) return res.status(400).json(result);

    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("form instance not found")) {
      return res.status(404).json({ error: "form instance not found" });
    }
    if (msg.includes("parent form instance not found")) {
      return res.status(400).json({ error: "parent form instance not found" });
    }
    if (msg.includes("parent form instance invalid")) {
      return res.status(400).json({ error: "parent form instance invalid" });
    }
    if (msg.includes("draft_rev conflict")) {
      return res.status(409).json({ error: "draft_rev conflict" });
    }
    if (msg.includes("form instance not editable")) {
      return res.status(409).json({ error: "form instance not editable" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormInstanceMetadata failed" });
  }
}

export async function putFormAnswers(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const payload = req.body || {};

    const result = await formsService.saveFormAnswers(code, instanceId, payload, req.user);
    if (result?.ok === false) return res.status(400).json(result);

    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (msg.includes("draft_rev conflict")) return res.status(409).json({ error: "draft_rev conflict" });
    if (msg.includes("form instance not editable")) return res.status(409).json({ error: "form instance not editable" });
    console.error(err);
    return res.status(500).json({ error: "putFormAnswers failed" });
  }
}

export async function previewSubmitFormInstance(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const payload = req.body || {};

    const result = await formsService.previewSubmitFormInstance(code, instanceId, payload, req.user);
    if (result?.error === "not found") return res.status(404).json({ error: "not found" });

    return res.json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "previewSubmitFormInstance failed" });
  }
}

export async function submitFormInstance(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");

    const result = await formsService.submitFormInstance(code, instanceId, req.user);
    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (msg.includes("invalid status transition")) return res.status(409).json({ error: "invalid status transition" });
    console.error(err);
    return res.status(500).json({ error: "submitFormInstance failed" });
  }
}

export async function withdrawFormInstance(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");

    const result = await formsService.withdrawFormInstance(code, instanceId, req.user);
    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (msg.includes("invalid status transition")) return res.status(409).json({ error: "invalid status transition" });
    console.error(err);
    return res.status(500).json({ error: "withdrawFormInstance failed" });
  }
}

export async function reopenFormInstance(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");

    const result = await formsService.reopenFormInstance(code, instanceId, req.user);
    if (result?.error === "not found") return res.status(404).json({ error: "not found" });

    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (msg.includes("invalid status transition")) return res.status(409).json({ error: "invalid status transition" });
    console.error(err);
    return res.status(500).json({ error: "reopenFormInstance failed" });
  }
}

export async function importFormAnswerFile(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const file = req.body || {};

    const result = await formsService.importFormAnswerFile(code, file, req.user);
    if (result?.ok === false) return res.status(400).json(result);

    return res.json(result);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (msg.includes("draft_rev conflict")) return res.status(409).json({ error: "draft_rev conflict" });
    console.error(err);
    return res.status(500).json({ error: "importFormAnswerFile failed" });
  }
}

export async function getFormPrefill(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const formCode = String(req.params.formCode || "");

    const keys = req.body?.keys ?? req.body?.keysJson ?? req.body?.requested_keys ?? [];
    if (!Array.isArray(keys)) {
      return res.status(400).json({ ok: false, error: "keys must be an array" });
    }

    const data = await formsService.getFormPrefill(code, formCode, keys, req.user);
    return res.json(data);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "getFormPrefill failed" });
  }
}

export async function getInstallationComponents(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const data = await service.getInstallationComponents(code);
    return res.json(data);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("atrium installation not found")) {
      return res.status(404).json({ error: "atrium installation not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "getInstallationComponents failed" });
  }
}

export async function downloadDocumentFile(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const documentId = String(req.params.documentId || "");

    const result = await documentFilesService.downloadDocumentFile(code, documentId);

    res.setHeader("Content-Type", result.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(result.contentLength ?? result.buffer.length));
    res.setHeader("Content-Disposition", result.contentDisposition);
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(result.buffer);
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();

    if (msg.includes("document not found")) {
      return res.status(404).json({ error: "document not found" });
    }
    if (msg.includes("document has no file")) {
      return res.status(404).json({ error: "document has no file" });
    }

    console.error(err);
    return res.status(500).json({ error: "downloadDocumentFile failed" });
  }
}

export async function getFormInstanceDocuments(req: any, res: Response) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");

    const data = await formDocumentFilesService.getFormInstanceDocuments(code, instanceId);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "getFormInstanceDocuments failed" });
  }
}

export async function putFormInstanceDocuments(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const items = req.body?.items;

    const result = await formDocumentFilesService.upsertFormInstanceDocuments(
      code,
      instanceId,
      items,
      req.user
    );

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("form instance not found")) {
      return res.status(404).json({ error: "form instance not found" });
    }
    if (msg.includes("form instance not editable")) {
      return res.status(409).json({ error: "form instance not editable" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormInstanceDocuments failed" });
  }
}

export async function uploadFormInstanceDocumentFile(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const documentId = String(req.params.documentId || "");
    const file = req.file;

    const result = await formDocumentFilesService.uploadDocumentFile(
      code,
      instanceId,
      documentId,
      file,
      req.user
    );

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("missing file")) {
      return res.status(400).json({ error: "missing file" });
    }
    if (msg.includes("document not found")) {
      return res.status(404).json({ error: "document not found" });
    }
    if (msg.includes("document already has file")) {
      return res.status(409).json({ error: "document already has file" });
    }
    if (msg.includes("form instance not editable")) {
      return res.status(409).json({ error: "form instance not editable" });
    }

    console.error(err);
    return res.status(500).json({ error: "uploadFormInstanceDocumentFile failed" });
  }
}

export async function getFormInstanceDocumentDownloadUrl(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const documentId = String(req.params.documentId || "");

    const result = await formDocumentFilesService.getDocumentDownloadUrl(
      code,
      instanceId,
      documentId
    );

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("document not found")) {
      return res.status(404).json({ error: "document not found" });
    }
    if (msg.includes("document has no file")) {
      return res.status(404).json({ error: "document has no file" });
    }

    console.error(err);
    return res.status(500).json({ error: "getFormInstanceDocumentDownloadUrl failed" });
  }
}

export async function downloadFormInstanceDocumentFile(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const documentId = String(req.params.documentId || "");

    const result = await formDocumentFilesService.downloadDocumentFile(
      code,
      instanceId,
      documentId
    );

    res.setHeader("Content-Type", result.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(result.contentLength ?? result.buffer.length));
    res.setHeader("Content-Disposition", result.contentDisposition);
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(result.buffer);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("document not found")) {
      return res.status(404).json({ error: "document not found" });
    }
    if (msg.includes("document has no file")) {
      return res.status(404).json({ error: "document has no file" });
    }

    console.error(err);
    return res.status(500).json({ error: "downloadFormInstanceDocumentFile failed" });
  }
}

export async function createFormInstanceDocumentReplacement(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const documentId = String(req.params.documentId || "");
    const payload = req.body || {};

    const result = await formDocumentFilesService.createReplacementDocument(
      code,
      instanceId,
      documentId,
      payload,
      req.user
    );

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("parent document not found")) {
      return res.status(404).json({ error: "parent document not found" });
    }
    if (msg.includes("parent document invalid")) {
      return res.status(409).json({ error: "parent document invalid" });
    }
    if (msg.includes("form instance not editable")) {
      return res.status(409).json({ error: "form instance not editable" });
    }

    console.error(err);
    return res.status(500).json({ error: "createFormInstanceDocumentReplacement failed" });
  }
}

export async function createFormInstanceDocumentAttachment(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const documentId = String(req.params.documentId || "");
    const payload = req.body || {};

    const result = await formDocumentFilesService.createAttachmentDocument(
      code,
      instanceId,
      documentId,
      payload,
      req.user
    );

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("parent document not found")) {
      return res.status(404).json({ error: "parent document not found" });
    }
    if (msg.includes("parent document invalid")) {
      return res.status(409).json({ error: "parent document invalid" });
    }
    if (msg.includes("form instance not editable")) {
      return res.status(409).json({ error: "form instance not editable" });
    }

    console.error(err);
    return res.status(500).json({ error: "createFormInstanceDocumentAttachment failed" });
  }
}

export async function putFormInstanceDocumentLabels(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const documentId = String(req.params.documentId || "");
    const labels = req.body?.labels ?? [];

    const result = await formDocumentFilesService.replaceDocumentLabels(
      code,
      instanceId,
      documentId,
      labels,
      req.user
    );

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("form instance document not editable")) {
      return res.status(409).json({ error: "form instance document not editable" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormInstanceDocumentLabels failed" });
  }
}

export async function putFormInstanceDocumentFollowUps(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const documentId = String(req.params.documentId || "");
    const items = req.body?.items ?? [];

    const result = await formDocumentFilesService.replaceDocumentFollowUps(
      code,
      instanceId,
      documentId,
      items,
      req.user
    );

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("form instance document not found")) {
      return res.status(404).json({ error: "form instance document not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormInstanceDocumentFollowUps failed" });
  }
}

export async function deleteFormInstanceDocument(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const documentId = String(req.params.documentId || "");

    const result = await formDocumentFilesService.deleteDocument(
      code,
      instanceId,
      documentId,
      req.user
    );

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("form instance document not found")) {
      return res.status(404).json({ error: "form instance document not found" });
    }
    if (msg.includes("form instance not editable")) {
      return res.status(409).json({ error: "form instance not editable" });
    }

    console.error(err);
    return res.status(500).json({ error: "deleteFormInstanceDocument failed" });
  }
}