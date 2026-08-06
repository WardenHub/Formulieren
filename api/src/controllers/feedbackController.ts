import type { Response } from "express";

import * as service from "../services/feedbackService.js";

export async function getMyFeedback(req: any, res: Response) {
  try {
    const data = await service.getMyFeedback(req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "getMyFeedback failed" });
  }
}

export async function postMyFeedback(req: any, res: Response) {
  try {
    const data = await service.createMyFeedback(req.body || {}, req.user);
    return res.status(201).json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();
    if (msg.includes("invalid feedback sentiment") || msg.includes("invalid feedback context id")) {
      return res.status(400).json({ error: err?.message || "invalid payload" });
    }
    console.error(err);
    return res.status(500).json({ error: err?.message || "postMyFeedback failed" });
  }
}

function sendFeedbackMutationError(err: any, res: Response, fallback: string) {
  const message = String(err?.message || err).toLowerCase();
  if (message.includes("feedback not found")) return res.status(404).json({ error: "not found" });
  if (message.includes("feedback access denied")) return res.status(403).json({ error: "feedback access denied" });
  if (message.includes("feedback locked after admin reply")) return res.status(409).json({ error: "feedback locked after admin reply" });
  if (message.includes("invalid feedback sentiment")) return res.status(400).json({ error: err?.message || "invalid payload" });
  console.error(err);
  return res.status(500).json({ error: err?.message || fallback });
}

export async function putMyFeedback(req: any, res: Response) {
  try {
    return res.json(await service.updateMyFeedback(String(req.params?.feedbackId || ""), req.body || {}, req.user));
  } catch (err: any) {
    return sendFeedbackMutationError(err, res, "putMyFeedback failed");
  }
}

export async function deleteMyFeedback(req: any, res: Response) {
  try {
    return res.json(await service.deleteMyFeedback(String(req.params?.feedbackId || ""), req.user));
  } catch (err: any) {
    return sendFeedbackMutationError(err, res, "deleteMyFeedback failed");
  }
}

export async function getAdminFeedback(req: any, res: Response) {
  try {
    const data = await service.getAdminFeedback(req.query || {});
    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();
    if (msg.includes("invalid feedback status") || msg.includes("invalid feedback sentiment")) {
      return res.status(400).json({ error: err?.message || "invalid query" });
    }
    console.error(err);
    return res.status(500).json({ error: err?.message || "getAdminFeedback failed" });
  }
}

export async function putAdminFeedbackStatus(req: any, res: Response) {
  try {
    const data = await service.updateAdminFeedbackStatus(
      String(req.params?.feedbackId || ""),
      req.body || {},
      req.user
    );
    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();
    if (msg.includes("feedback not found")) {
      return res.status(404).json({ error: "not found" });
    }
    if (msg.includes("invalid feedback status")) {
      return res.status(400).json({ error: err?.message || "invalid status" });
    }
    console.error(err);
    return res.status(500).json({ error: err?.message || "putAdminFeedbackStatus failed" });
  }
}

export async function putAdminFeedbackReply(req: any, res: Response) {
  try {
    const data = await service.upsertAdminFeedbackReply(
      String(req.params?.feedbackId || ""),
      req.body || {},
      req.user
    );
    return res.json(data);
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();
    if (msg.includes("feedback not found")) {
      return res.status(404).json({ error: "not found" });
    }
    if (msg.includes("feedback reply required")) {
      return res.status(400).json({ error: err?.message || "reply required" });
    }
    console.error(err);
    return res.status(500).json({ error: err?.message || "putAdminFeedbackReply failed" });
  }
}

export async function postAdminFeedbackRead(req: any, res: Response) {
  try {
    return res.json(await service.markAdminFeedbackRead(String(req.params?.feedbackId || ""), req.user));
  } catch (err: any) {
    return sendFeedbackMutationError(err, res, "postAdminFeedbackRead failed");
  }
}

export async function deleteAdminFeedback(req: any, res: Response) {
  try {
    return res.json(await service.deleteAdminFeedback(String(req.params?.feedbackId || "")));
  } catch (err: any) {
    return sendFeedbackMutationError(err, res, "deleteAdminFeedback failed");
  }
}
