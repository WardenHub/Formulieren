// api/src/controllers/adminInstallationsController.ts

import type { Request, Response } from "express";
import * as service from "../services/adminInstallationsService.js";

export async function getAdminInstallationsCatalog(req: Request, res: Response) {
  try {
    const data = await service.getAdminInstallationsCatalog();
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getAdminInstallationsCatalog failed" });
  }
}

export async function saveAdminInstallationTypes(req: any, res: Response) {
  try {
    const items = req.body?.items;
    const data = await service.saveAdminInstallationTypes(items, req.user);

    if (data?.ok === false) {
      return res.status(400).json(data);
    }

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "saveAdminInstallationTypes failed" });
  }
}

export async function saveAdminInstallationSections(req: any, res: Response) {
  try {
    const items = req.body?.items;
    const data = await service.saveAdminInstallationSections(items, req.user);

    if (data?.ok === false) {
      return res.status(400).json(data);
    }

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "saveAdminInstallationSections failed" });
  }
}

export async function saveAdminInstallationFields(req: any, res: Response) {
  try {
    const items = req.body?.items;
    const data = await service.saveAdminInstallationFields(items, req.user);

    if (data?.ok === false) {
      return res.status(400).json(data);
    }

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "saveAdminInstallationFields failed" });
  }
}

export async function saveAdminInstallationDocuments(req: any, res: Response) {
  try {
    const items = req.body?.items;
    const data = await service.saveAdminInstallationDocuments(items, req.user);

    if (data?.ok === false) {
      return res.status(400).json(data);
    }

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "saveAdminInstallationDocuments failed" });
  }
}