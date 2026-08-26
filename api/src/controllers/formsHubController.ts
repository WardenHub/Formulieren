import type { Response } from "express";
import * as service from "../services/formsHubService.js";

function sendKnownError(res: Response, err: any, fallback: string) {
  if (["TIMEOUT", "UNAVAILABLE", "CONFIGURATION", "BAD_RESPONSE"].includes(String(err?.category || ""))) {
    return res.status(503).json({ error: "atrium reader unavailable" });
  }
  if (String(err?.category || "") === "VALIDATION") {
    return res.status(400).json({ error: "atrium reader request invalid" });
  }
  const message = String(err?.message || err || "").toLowerCase();

  if (message.includes("not found")) {
    return res.status(404).json({ error: "not found" });
  }

  if (
    message.includes("context") ||
    message.includes("form has no active") ||
    message.includes("parent") ||
    message.includes("invalid status") ||
    message.includes("not editable") ||
    message.includes("survey_json") ||
    message.includes("answers_json") ||
    message.includes("calculated_json")
  ) {
    return res.status(400).json({ error: String(err?.message || err) });
  }

  if (message.includes("draft_rev conflict")) {
    return res.status(409).json({ error: String(err?.message || err) });
  }

  console.error(err);
  return res.status(500).json({ error: fallback });
}

export async function getAvailableForms(req: any, res: Response) {
  try {
    return res.json(await service.getAvailableForms());
  } catch (err) {
    return sendKnownError(res, err, "getAvailableForms failed");
  }
}

export async function getMyForms(req: any, res: Response) {
  try {
    const requestedMine = String(req.query?.mine ?? "1") !== "0";
    const isAdmin = Array.isArray(req.roles) && req.roles.includes("admin");
    const data = await service.getMyForms(
      {
        q: req.query?.q,
        status: req.query?.status,
        formCode: req.query?.formCode,
        contextQ: req.query?.contextQ,
        dateFrom: req.query?.dateFrom,
        dateTo: req.query?.dateTo,
        reviewStatus: req.query?.reviewStatus,
        hasOpenPoints: req.query?.hasOpenPoints,
        mine: isAdmin ? requestedMine : true,
      },
      req.user
    );
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "getMyForms failed");
  }
}

export async function searchContext(req: any, res: Response) {
  try {
    const data = await service.searchContext(
      req.params.contextType,
      req.query?.q,
      req.query?.businessUnit
    );
    if (data.ok === false) return res.status(400).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "searchContext failed");
  }
}

export async function resolveContext(req: any, res: Response) {
  try {
    const data = await service.resolveContext(
      req.params.contextType,
      req.query?.sourceSystem,
      req.query?.sourceKey
    );
    if (data.ok === false) return res.status(400).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "resolveContext failed");
  }
}

export async function startForm(req: any, res: Response) {
  try {
    const data = await service.startForm(req.params.formCode, req.body || {}, req.user);
    if (data.ok === false) return res.status(400).json(data);
    return res.status(201).json(data);
  } catch (err) {
    return sendKnownError(res, err, "startForm failed");
  }
}

export async function getFormInstance(req: any, res: Response) {
  try {
    const data = await service.getFormInstance(req.params.instanceId);
    if (data.error === "not found") return res.status(404).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "getFormInstance failed");
  }
}

export async function updateFormInstanceMetadata(req: any, res: Response) {
  try {
    const data = await service.updateFormInstanceMetadata(
      req.params.instanceId,
      req.body || {},
      req.user
    );
    if (data.ok === false) return res.status(400).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "updateFormInstanceMetadata failed");
  }
}

export async function saveFormAnswers(req: any, res: Response) {
  try {
    const data = await service.saveFormAnswers(
      req.params.instanceId,
      req.body || {},
      req.user
    );
    if (data.ok === false) return res.status(400).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "saveFormAnswers failed");
  }
}

export async function previewSubmitFormInstance(req: any, res: Response) {
  try {
    const data: any = await service.previewSubmitFormInstance(
      req.params.instanceId,
      req.body || {}
    );
    if (data?.error === "not found") return res.status(404).json(data);
    if (data?.ok === false) return res.status(400).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "previewSubmitFormInstance failed");
  }
}

export async function submitFormInstance(req: any, res: Response) {
  try {
    const data: any = await service.submitFormInstance(req.params.instanceId, req.user);
    if (data?.error === "not found") return res.status(404).json(data);
    if (data?.ok === false) return res.status(400).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "submitFormInstance failed");
  }
}

export async function withdrawFormInstance(req: any, res: Response) {
  try {
    const data = await service.withdrawFormInstance(req.params.instanceId, req.user);
    if (data?.error === "not found") return res.status(404).json(data);
    if (data?.ok === false) return res.status(400).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "withdrawFormInstance failed");
  }
}

export async function reopenFormInstance(req: any, res: Response) {
  try {
    const data = await service.reopenFormInstance(req.params.instanceId, req.user);
    if (data?.error === "not found") return res.status(404).json(data);
    if (data?.ok === false) return res.status(400).json(data);
    return res.json(data);
  } catch (err) {
    return sendKnownError(res, err, "reopenFormInstance failed");
  }
}
