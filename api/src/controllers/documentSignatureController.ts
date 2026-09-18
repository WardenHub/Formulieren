// api/src/controllers/documentSignatureController.ts

import * as documentSignatureService from "../services/documentSignatureService.js";

function isHistoricalReadOnlyMessage(msg: string) {
  return String(msg || "").toLowerCase().includes("historical installation read-only");
}

// De boodschappen uit de service zijn kort en machineleesbaar; hier mappen we ze op een
// status en een tekst die de frontend mag tonen.
const CONFLICTS: Array<{ match: string; status: number; error: string }> = [
  { match: "document not found", status: 404, error: "document not found" },
  { match: "signature request not found", status: 404, error: "signature request not found" },
  { match: "signature file not found", status: 404, error: "signature file not found" },
  { match: "signature provider not configured", status: 503, error: "signature provider not configured" },
  { match: "document type not signable", status: 409, error: "document type not signable" },
  { match: "document archived", status: 409, error: "document archived" },
  { match: "document has no file", status: 409, error: "document has no file" },
  { match: "document already signed", status: 409, error: "document already signed" },
  { match: "document is not a pdf", status: 409, error: "document is not a pdf" },
  { match: "pdf unreadable", status: 409, error: "pdf unreadable" },
  { match: "signature request already open", status: 409, error: "signature request already open" },
  { match: "signature request not editable", status: 409, error: "signature request not editable" },
  { match: "signature request not open", status: 409, error: "signature request not open" },
  { match: "signature request has no package", status: 409, error: "signature request has no package" },
  { match: "document is not a replacement", status: 409, error: "document is not a replacement" },
  { match: "invalid placement method", status: 400, error: "invalid placement method" },
  { match: "signer email invalid", status: 400, error: "signer email invalid" },
  { match: "signer name required", status: 400, error: "signer name required" },
  { match: "duplicate signer email", status: 400, error: "duplicate signer email" },
  { match: "too many signers", status: 400, error: "too many signers" },
  { match: "no signers", status: 400, error: "no signers" },
  { match: "reason required", status: 400, error: "reason required" },
];

function respondError(res: any, err: any, fallback: string) {
  const raw = String(err?.message || err || "");
  const msg = raw.toLowerCase();

  if (isHistoricalReadOnlyMessage(msg)) {
    return res.status(409).json({ error: "historical installation read-only" });
  }

  // Hier horen de namen van de ondertekenaars bij, anders weet de gebruiker niet bij wie
  // het vak ontbreekt; de boodschap gaat daarom heel mee.
  if (msg.startsWith("signature fields missing for ")) {
    return res.status(409).json({
      error: "signature fields missing",
      signers: raw.slice("signature fields missing for ".length).split(", ").filter(Boolean),
    });
  }

  for (const candidate of CONFLICTS) {
    if (msg.includes(candidate.match)) {
      return res.status(candidate.status).json({ error: candidate.error });
    }
  }

  if (err?.name === "ValidSignError") {
    console.error(err);
    return res.status(502).json({ error: "signature provider unavailable" });
  }

  console.error(err);
  return res.status(500).json({ error: fallback });
}

export async function getDocumentSignature(req: any, res: any) {
  try {
    const result = await documentSignatureService.getSignatureState(
      String(req.params.code || ""),
      String(req.params.documentId || "")
    );
    return res.json(result);
  } catch (err) {
    return respondError(res, err, "getDocumentSignature failed");
  }
}

export async function postDocumentSignatureRequest(req: any, res: any) {
  try {
    const result = await documentSignatureService.createSignatureRequest(
      String(req.params.code || ""),
      String(req.params.documentId || ""),
      req.body || {},
      req.user
    );
    return res.json(result);
  } catch (err) {
    return respondError(res, err, "postDocumentSignatureRequest failed");
  }
}

export async function postDocumentSignatureDesignerSession(req: any, res: any) {
  try {
    const result = await documentSignatureService.createDesignerSession(
      String(req.params.code || ""),
      String(req.params.documentId || ""),
      String(req.params.signatureRequestId || "")
    );
    return res.json(result);
  } catch (err) {
    return respondError(res, err, "postDocumentSignatureDesignerSession failed");
  }
}

export async function postDocumentSignatureSend(req: any, res: any) {
  try {
    const result = await documentSignatureService.sendSignatureRequest(
      String(req.params.code || ""),
      String(req.params.documentId || ""),
      String(req.params.signatureRequestId || ""),
      req.user
    );
    return res.json(result);
  } catch (err) {
    return respondError(res, err, "postDocumentSignatureSend failed");
  }
}

export async function postDocumentSignatureCancel(req: any, res: any) {
  try {
    const result = await documentSignatureService.cancelSignatureRequest(
      String(req.params.code || ""),
      String(req.params.documentId || ""),
      String(req.params.signatureRequestId || ""),
      req.body || {},
      req.user
    );
    return res.json(result);
  } catch (err) {
    return respondError(res, err, "postDocumentSignatureCancel failed");
  }
}

export async function getDocumentSignatureFile(req: any, res: any) {
  try {
    const kind = String(req.params.kind || "").toUpperCase() === "EVIDENCE" ? "EVIDENCE" : "SIGNED";

    const result = await documentSignatureService.getSignatureFileDownload(
      String(req.params.code || ""),
      String(req.params.documentId || ""),
      String(req.params.signatureRequestId || ""),
      kind
    );

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Length", String(result.contentLength));
    res.setHeader("Content-Disposition", result.contentDisposition);
    return res.send(result.buffer);
  } catch (err) {
    return respondError(res, err, "getDocumentSignatureFile failed");
  }
}

export async function putDocumentVersionSignatureDecision(req: any, res: any) {
  try {
    const result = await documentSignatureService.applyVersionSignatureDecision(
      String(req.params.code || ""),
      String(req.params.documentId || ""),
      req.body || {},
      req.user
    );
    return res.json(result);
  } catch (err) {
    return respondError(res, err, "putDocumentVersionSignatureDecision failed");
  }
}

export async function postValidSignCallback(req: any, res: any) {
  try {
    const result = await documentSignatureService.handleProviderCallback(req.body || {});
    return res.json(result);
  } catch (err) {
    // Een 500 laat ValidSign de callback opnieuw aanbieden; dat is precies wat we willen
    // wanneer het ophalen van het getekende bestand tijdelijk misging.
    console.error(err);
    return res.status(500).json({ error: "callback processing failed" });
  }
}
