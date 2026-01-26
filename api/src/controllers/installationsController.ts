import { Request, Response } from "express";
import * as service from "../services/installationsService";

export async function getInstallation(req: Request, res: Response) {
  const { code } = req.params;
  const data = await service.getInstallationByCode(code);
  res.json(data);
}

export async function getCatalog(req: Request, res: Response) {
  const data = await service.getCatalog();
  res.json(data);
}

export async function getCustomValues(req: Request, res: Response) {
  const { code } = req.params;
  const data = await service.getCustomValues(code);
  res.json(data);
}

export async function putCustomValues(req: any, res: Response) {
  const { code } = req.params;
  const values = req.body?.values || [];
  const user = req.user;
  const data = await service.upsertCustomValues(code, values, user);
  res.json(data);
}
