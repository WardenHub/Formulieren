// /api/src/controllers/installationsController.ts

import type { Request, Response } from "express";
import * as service from "../services/installationsService.js";

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

