import { Request, Response } from "express";
import * as service from "../services/installationsService";

export async function getInstallation(req: Request, res: Response) {
  try {
    const { code } = req.params;
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
    const { code } = req.params;
    const data = await service.getCustomValues(code);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getCustomValues failed" });
  }
}

export async function putCustomValues(req: any, res: Response) {
  try {
    const { code } = req.params;
    const values = req.body?.values || [];
    const user = req.user;
    const data = await service.upsertCustomValues(code, values, user);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "putCustomValues failed" });
  }
}
