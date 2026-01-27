import { Request, Response } from "express";
import * as service from "../services/installationsService";

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
    const data = await service.getCatalog();
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
