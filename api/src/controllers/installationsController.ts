// api/src/controllers/installationsController.ts

import type { Request, Response } from "express";
import * as service from "../services/installationsService.js";
import * as formsService from "../services/formsService.js";

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