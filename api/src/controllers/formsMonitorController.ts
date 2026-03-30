//api/src/controllers/formsMonitorController.ts
import type { Request, Response } from "express";
import * as service from "../services/formsMonitorService.js";

export async function getFormsMonitorList(req: any, res: Response) {
  try {
    const data = await service.getMonitorList({
      query: req.query || {},
      user: req.user,
      roles: req.roles || [],
    });

    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "getFormsMonitorList failed" });
  }
}

export async function getFormsMonitorDetail(req: any, res: Response) {
  try {
    const formInstanceId = String(req.params.formInstanceId || "");
    const autoClaimRaw = req.query?.autoClaim;
    const autoClaim =
      autoClaimRaw === undefined
        ? true
        : !["0", "false", "False", "FALSE"].includes(String(autoClaimRaw));

    const data = await service.getMonitorDetail(formInstanceId, {
      user: req.user,
      roles: req.roles || [],
      autoClaim,
    });

    if (data?.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("not found")) {
      return res.status(404).json({ error: "not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "getFormsMonitorDetail failed" });
  }
}

export async function getFormsMonitorFollowUps(req: any, res: Response) {
  try {
    const formInstanceId = String(req.params.formInstanceId || "");

    const data = await service.getMonitorFollowUps(formInstanceId, {
      user: req.user,
      roles: req.roles || [],
    });

    if (data?.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("not found")) {
      return res.status(404).json({ error: "not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "getFormsMonitorFollowUps failed" });
  }
}

export async function postFormsMonitorStatusAction(req: any, res: Response) {
  try {
    const formInstanceId = String(req.params.formInstanceId || "");
    const action = String(req.body?.action || "").trim();

    const data = await service.runMonitorFormStatusAction(formInstanceId, action, {
      user: req.user,
      roles: req.roles || [],
    });

    if (data?.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("not found")) {
      return res.status(404).json({ error: "not found" });
    }
    if (msg.includes("invalid action")) {
      return res.status(400).json({ error: "invalid action" });
    }
    if (msg.includes("invalid status transition")) {
      return res.status(409).json({ error: "invalid status transition" });
    }
    if (msg.includes("cannot mark form done")) {
      return res.status(409).json({ error: "cannot mark form done" });
    }
    if (msg.includes("forbidden")) {
      return res.status(403).json({ error: "forbidden" });
    }

    console.error(err);
    return res.status(500).json({ error: "postFormsMonitorStatusAction failed" });
  }
}

export async function postFormsMonitorFollowUpStatusAction(req: any, res: Response) {
  try {
    const followUpActionId = String(req.params.followUpActionId || "");
    const action = String(req.body?.action || "").trim();
    const payload = req.body || {};

    const data = await service.runMonitorFollowUpStatusAction(followUpActionId, action, payload, {
      user: req.user,
      roles: req.roles || [],
    });

    if (data?.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("not found")) {
      return res.status(404).json({ error: "not found" });
    }
    if (msg.includes("invalid action")) {
      return res.status(400).json({ error: "invalid action" });
    }
    if (msg.includes("invalid status transition")) {
      return res.status(409).json({ error: "invalid status transition" });
    }
    if (msg.includes("forbidden")) {
      return res.status(403).json({ error: "forbidden" });
    }

    console.error(err);
    return res.status(500).json({ error: "postFormsMonitorFollowUpStatusAction failed" });
  }
}

export async function putFormsMonitorFollowUpNote(req: any, res: Response) {
  try {
    const followUpActionId = String(req.params.followUpActionId || "");
    const payload = req.body || {};

    const data = await service.updateMonitorFollowUpNote(followUpActionId, payload, {
      user: req.user,
      roles: req.roles || [],
    });

    if (data?.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();

    if (msg.includes("not found")) {
      return res.status(404).json({ error: "not found" });
    }
    if (msg.includes("forbidden")) {
      return res.status(403).json({ error: "forbidden" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormsMonitorFollowUpNote failed" });
  }
}