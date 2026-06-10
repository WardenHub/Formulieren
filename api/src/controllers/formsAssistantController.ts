// api/src/controllers/formsAssistantController.ts

import * as formsAssistantService from "../services/formsAssistantService.js";

function isHistoricalReadOnlyMessage(msg: string) {
  return String(msg || "").toLowerCase().includes("historical installation read-only");
}

export async function transcribeAssistantAudio(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const file = req.file;

    const result = await formsAssistantService.transcribeAssistantAudio(
      code,
      instanceId,
      file,
      req.body || {},
      req.user
    );

    if (result?.ok === false) {
      const error = String(result.error || "transcribe failed");

      if (error.includes("missing file")) return res.status(400).json(result);
      if (error.includes("ongeldige")) return res.status(400).json(result);
      if (error.includes("te groot")) return res.status(413).json(result);

      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }

    if (msg.toLowerCase().includes("form instance not found")) {
      return res.status(404).json({ error: "form instance not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "transcribeAssistantAudio failed", detail: msg });
  }
}

export async function interpretAssistantText(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");

    const result = await formsAssistantService.interpretAssistantText(
      code,
      instanceId,
      req.body || {},
      req.user
    );

    if (result?.ok === false) return res.status(400).json(result);
    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }

    if (msg.toLowerCase().includes("form instance not found")) {
      return res.status(404).json({ error: "form instance not found" });
    }

    console.error(err);
    return res.status(500).json({ error: "interpretAssistantText failed", detail: msg });
  }
}

export async function applyAssistantPatches(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");

    const result = await formsAssistantService.markAssistantPatchesApplied(
      code,
      instanceId,
      req.body || {},
      req.user
    );

    if (result?.ok === false) return res.status(400).json(result);
    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }
    console.error(err);
    return res.status(500).json({ error: "applyAssistantPatches failed", detail: msg });
  }
}

export async function rejectAssistantPatches(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");

    const result = await formsAssistantService.markAssistantPatchesRejected(
      code,
      instanceId,
      req.body || {},
      req.user
    );

    if (result?.ok === false) return res.status(400).json(result);
    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (isHistoricalReadOnlyMessage(msg)) {
      return res.status(409).json({ error: "historical installation read-only" });
    }
    console.error(err);
    return res.status(500).json({ error: "rejectAssistantPatches failed", detail: msg });
  }
}

export async function getAssistantAudit(req: any, res: any) {
  try {
    const code = String(req.params.code || "");
    const instanceId = String(req.params.instanceId || "");
    const take = req.query?.take;

    const result = await formsAssistantService.getAssistantAudit(code, instanceId, take);

    if (result?.ok === false) return res.status(400).json(result);
    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err);
    console.error(err);
    return res.status(500).json({ error: "getAssistantAudit failed", detail: msg });
  }
}

export async function getAdminAssistantAudit(req: any, res: any) {
  try {
    const result = await formsAssistantService.getAdminAssistantAudit(req.query || {});

    if (result?.ok === false) return res.status(400).json(result);
    return res.json(result);
  } catch (err: any) {
    const msg = String(err?.message || err);
    console.error(err);
    return res.status(500).json({ error: "getAdminAssistantAudit failed", detail: msg });
  }
}
