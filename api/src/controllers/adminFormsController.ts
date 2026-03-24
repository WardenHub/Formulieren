// /api/src/controllers/adminFormsController.ts

import type { Request, Response } from "express";
import * as service from "../services/adminFormsService.js";

export async function getAdminForms(req: Request, res: Response) {
  try {
    const data = await service.getAdminForms();
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getAdminForms failed" });
  }
}

export async function getAdminFormDetail(req: any, res: Response) {
  try {
    const formId = String(req.params.formId || "");
    const data = await service.getAdminFormDetail(formId);

    if (data && "error" in data && data.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getAdminFormDetail failed" });
  }
}

export async function createAdminForm(req: any, res: Response) {
  try {
    const payload = req.body || {};
    const data = await service.createAdminForm(payload, req.user);

    if (data && "ok" in data && data.ok === false) {
      return res.status(400).json(data);
    }

    if (data && "error" in data) {
      return res.status(500).json({ error: data.error });
    }

    return res.status(201).json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("form code already exists")) {
      return res.status(409).json({ error: "form code already exists" });
    }

    console.error(err);
    return res.status(500).json({ error: "createAdminForm failed" });
  }
}

export async function saveAdminFormsOrder(req: any, res: Response) {
  try {
    const items = req.body?.items;
    const data = await service.saveAdminFormsOrder(items, req.user);

    if (data && "ok" in data && data.ok === false) {
      return res.status(400).json(data);
    }

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "saveAdminFormsOrder failed" });
  }
}

export async function saveAdminFormConfig(req: any, res: Response) {
  try {
    const formId = String(req.params.formId || "");
    const payload = req.body || {};

    const data = await service.saveAdminFormConfig(formId, payload, req.user);

    if (data && "ok" in data && data.ok === false) {
      return res.status(400).json(data);
    }

    if (data && "error" in data && data.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("form not found")) {
      return res.status(404).json({ error: "form not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "saveAdminFormConfig failed" });
  }
}

export async function createAdminFormVersion(req: any, res: Response) {
  try {
    const formId = String(req.params.formId || "");
    const payload = req.body || {};

    const data = await service.createAdminFormVersion(formId, payload, req.user);

    if (data && "ok" in data && data.ok === false) {
      return res.status(400).json(data);
    }

    if (data && "error" in data && data.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    return res.status(201).json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("form not found")) {
      return res.status(404).json({ error: "form not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "createAdminFormVersion failed" });
  }
}