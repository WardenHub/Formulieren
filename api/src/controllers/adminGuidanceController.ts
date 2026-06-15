import type { Response } from "express";
import * as service from "../services/adminGuidanceService.js";

function errorMessage(err: any) {
  return String(err?.message || err || "").toLowerCase();
}

export async function getAdminGuidanceCatalog(req: any, res: Response) {
  try {
    const data = await service.getAdminGuidanceCatalog();
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getAdminGuidanceCatalog failed" });
  }
}

export async function createGuidanceItem(req: any, res: Response) {
  try {
    const data = await service.createGuidanceItem(req.body || {}, req.user);
    if (data && "ok" in data && data.ok === false) {
      return res.status(400).json(data);
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "createGuidanceItem failed" });
  }
}

export async function updateGuidanceItem(req: any, res: Response) {
  try {
    const data = await service.updateGuidanceItem(
      String(req.params.guidanceId || ""),
      req.body || {},
      req.user
    );
    if (data && "ok" in data && data.ok === false) {
      return res.status(400).json(data);
    }
    return res.json(data);
  } catch (err: any) {
    const msg = errorMessage(err);
    if (msg.includes("guidance not found")) {
      return res.status(404).json({ error: "guidance not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "updateGuidanceItem failed" });
  }
}

export async function replaceGuidanceLinks(req: any, res: Response) {
  try {
    const data = await service.replaceGuidanceLinks(
      String(req.params.guidanceId || ""),
      req.body?.links,
      req.user
    );
    return res.json(data);
  } catch (err: any) {
    const msg = errorMessage(err);
    if (msg.includes("guidance not found")) {
      return res.status(404).json({ error: "guidance not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "replaceGuidanceLinks failed" });
  }
}

export async function uploadGuidanceMedia(req: any, res: Response) {
  try {
    const data = await service.uploadGuidanceMedia(
      String(req.params.guidanceId || ""),
      req.body || {},
      req.file,
      req.user
    );
    if (data && "ok" in data && data.ok === false) {
      return res.status(400).json(data);
    }
    return res.status(201).json(data);
  } catch (err: any) {
    const msg = errorMessage(err);
    if (msg.includes("guidance not found")) {
      return res.status(404).json({ error: "guidance not found" });
    }
    if (msg.includes("missing file")) {
      return res.status(400).json({ error: "missing file" });
    }
    if (msg.includes("guidance image must be image")) {
      return res.status(400).json({ error: "guidance image must be image" });
    }
    if (msg.includes("guidance video must be video")) {
      return res.status(400).json({ error: "guidance video must be video" });
    }
    console.error(err);
    return res.status(500).json({ error: "uploadGuidanceMedia failed" });
  }
}

export async function addExternalGuidanceMedia(req: any, res: Response) {
  try {
    const data = await service.addExternalGuidanceMedia(
      String(req.params.guidanceId || ""),
      req.body || {},
      req.user
    );
    if (data && "ok" in data && data.ok === false) {
      return res.status(400).json(data);
    }
    return res.status(201).json(data);
  } catch (err: any) {
    const msg = errorMessage(err);
    if (msg.includes("guidance not found")) {
      return res.status(404).json({ error: "guidance not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "addExternalGuidanceMedia failed" });
  }
}

export async function activateGuidanceMedia(req: any, res: Response) {
  try {
    const data = await service.activateGuidanceMedia(
      String(req.params.guidanceId || ""),
      String(req.params.guidanceMediaId || ""),
      req.user
    );
    return res.json(data);
  } catch (err: any) {
    const msg = errorMessage(err);
    if (msg.includes("guidance media not found")) {
      return res.status(404).json({ error: "guidance media not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "activateGuidanceMedia failed" });
  }
}

export async function updateGuidanceMedia(req: any, res: Response) {
  try {
    const data = await service.updateGuidanceMedia(
      String(req.params.guidanceId || ""),
      String(req.params.guidanceMediaId || ""),
      req.body || {},
      req.user
    );
    return res.json(data);
  } catch (err: any) {
    const msg = errorMessage(err);
    if (msg.includes("guidance media not found")) {
      return res.status(404).json({ error: "guidance media not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "updateGuidanceMedia failed" });
  }
}

export async function archiveGuidanceMedia(req: any, res: Response) {
  try {
    const data = await service.archiveGuidanceMedia(
      String(req.params.guidanceId || ""),
      String(req.params.guidanceMediaId || ""),
      req.user
    );
    if (data && "ok" in data && data.ok === false) {
      return res.status(404).json({ error: data.error });
    }
    return res.json(data);
  } catch (err: any) {
    const msg = errorMessage(err);
    if (msg.includes("guidance media not found")) {
      return res.status(404).json({ error: "guidance media not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "archiveGuidanceMedia failed" });
  }
}
