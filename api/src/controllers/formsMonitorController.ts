//api/src/controllers/formsMonitorController.ts
import type { Request, Response } from "express";
import * as service from "../services/formsMonitorService.js";
import { buildFormReportPdf } from "../services/formReportPdfService.js";
import {
  createFormReportPdfJob,
  getFormReportPdfJob,
  getFormReportPdfJobDownload,
} from "../services/formReportPdfJobService.js";

function isHistoricalReadOnlyMessage(msg: string) {
  return String(msg || "").toLowerCase().includes("historical installation read-only");
}

export async function downloadFormsMonitorPdf(req: any, res: any) {
  try {
    const result: any = await buildFormReportPdf(req.params.formInstanceId, req.user);

    if (result?.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Length", String(result.contentLength));
    res.setHeader("Content-Disposition", result.contentDisposition);
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(result.buffer);
  } catch (err) {
    const message = String((err as any)?.message || err || "downloadFormsMonitorPdf failed");
    console.error("[form report pdf] failed", err);
    return res.status(500).json({
      error: message.includes("timed out") ? message : "downloadFormsMonitorPdf failed",
    });
  }
}

export async function postFormsMonitorPdfJob(req: any, res: any) {
  try {
    const formInstanceId = String(req.params.formInstanceId || "");
    const job = createFormReportPdfJob(formInstanceId, req.user);
    return res.status(202).json(job);
  } catch (err) {
    console.error("[form report pdf] could not create job", err);
    return res.status(500).json({ error: "createFormsMonitorPdfJob failed" });
  }
}

export async function getFormsMonitorPdfJob(req: any, res: any) {
  try {
    const job = getFormReportPdfJob(String(req.params.jobId || ""));
    if (!job) {
      return res.status(404).json({ error: "not found" });
    }
    return res.json(job);
  } catch (err) {
    console.error("[form report pdf] could not read job", err);
    return res.status(500).json({ error: "getFormsMonitorPdfJob failed" });
  }
}

export async function downloadFormsMonitorPdfJob(req: any, res: any) {
  try {
    const result = getFormReportPdfJobDownload(String(req.params.jobId || ""));
    if ((result as any)?.error === "not found") {
      return res.status(404).json({ error: "not found" });
    }
    if ((result as any)?.error === "not ready") {
      return res.status(409).json({
        error: "not ready",
        job: (result as any).job,
      });
    }

    res.setHeader("Content-Type", (result as any).contentType);
    res.setHeader("Content-Length", String((result as any).contentLength));
    res.setHeader("Content-Disposition", (result as any).contentDisposition);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send((result as any).buffer);
  } catch (err) {
    console.error("[form report pdf] could not download job result", err);
    return res.status(500).json({ error: "downloadFormsMonitorPdfJob failed" });
  }
}

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
    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
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
    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }
    if (msg.includes("invalid action")) {
      return res.status(400).json({ error: "invalid action" });
    }
    if (msg.includes("invalid status transition")) {
      return res.status(409).json({ error: "invalid status transition" });
    }
    if (msg.includes("report-only follow-ups cannot use workflow status actions")) {
      return res.status(409).json({ error: "report-only follow-ups cannot use workflow status actions" });
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
    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }
    if (msg.includes("forbidden")) {
      return res.status(403).json({ error: "forbidden" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormsMonitorFollowUpNote failed" });
  }
}

export async function putFormsMonitorFollowUpCertificateImpact(req: any, res: Response) {
  try {
    const followUpActionId = String(req.params.followUpActionId || "");
    const payload = req.body || {};

    const data = await service.updateMonitorFollowUpCertificateImpact(followUpActionId, payload, {
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
    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }
    if (msg.includes("invalid certificate impact override")) {
      return res.status(400).json({ error: "invalid certificate impact override" });
    }
    if (msg.includes("only allowed for workflow")) {
      return res.status(409).json({ error: "certificate impact override only allowed for workflow follow-ups" });
    }
    if (msg.includes("forbidden")) {
      return res.status(403).json({ error: "forbidden" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormsMonitorFollowUpCertificateImpact failed" });
  }
}

export async function putFormsMonitorAssignment(req: any, res: Response) {
  try {
    const formInstanceId = String(req.params.formInstanceId || "");
    const payload = req.body || {};

    const data = await service.updateMonitorFormAssignment(formInstanceId, payload, {
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
    if (msg.includes("assigned user not found")) {
      return res.status(400).json({ error: "assigned user not found" });
    }
    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }
    if (msg.includes("forbidden")) {
      return res.status(403).json({ error: "forbidden" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormsMonitorAssignment failed" });
  }
}

export async function putFormsMonitorComplimentPoint(req: any, res: Response) {
  try {
    const formInstanceId = String(req.params.formInstanceId || "");
    const payload = req.body || {};

    const data = await service.upsertMonitorComplimentPoint(formInstanceId, payload, {
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
    if (msg.includes("negative compliment point requires reason")) {
      return res.status(400).json({ error: "negative compliment point requires reason" });
    }
    if (msg.includes("compliment points not allowed for withdrawn forms")) {
      return res.status(409).json({ error: "compliment points not allowed for withdrawn forms" });
    }
    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }
    if (msg.includes("forbidden")) {
      return res.status(403).json({ error: "forbidden" });
    }

    console.error(err);
    return res.status(500).json({ error: "putFormsMonitorComplimentPoint failed" });
  }
}
