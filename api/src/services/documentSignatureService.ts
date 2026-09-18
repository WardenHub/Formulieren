// api/src/services/documentSignatureService.ts
//
// Regelt een ondertekenronde op een installatiedocument. Ember blijft de baas over de
// flow: wij maken het pakket aan, wij verzenden het, en wij verwerken de terugkoppeling.
// De designer van de leverancier wordt alleen gebruikt om de vakken te plaatsen.

import crypto from "node:crypto";
import { sqlQuery } from "../db/index.js";
import {
  getSignableDocumentSql,
  createSignatureRequestSql,
  getSignatureRequestSql,
  getLatestSignatureRequestForDocumentSql,
  getSignatureRequestByPackageSql,
  getSignatureRequestSignersSql,
  setSignaturePackageIdSql,
  markSignatureRequestSentSql,
  setSignatureRequestStatusSql,
  setSignerStatusSql,
  markAllSignersSignedSql,
  insertSignatureStoredFileSql,
  completeSignatureRequestSql,
  getSignatureStoredFileSql,
  insertSignatureEventSql,
  getSignatureEventsForDocumentSql,
  applyVersionSignatureDecisionSql,
} from "../db/queries/documentSignatures.sql.js";
import {
  downloadInstallationDocumentBlob,
  uploadDocumentSignatureBlob,
  downloadDocumentSignatureBlob,
  deleteDocumentSignatureBlob,
} from "./blobStorageService.js";
import { assertInstallationWritable } from "./installationsService.js";
import { getUserAuditActor, getUserDisplayNameSnapshot } from "../utils/userIdentity.js";
import * as validSign from "./validSignClient.js";
import {
  appendSignaturePage,
  readPageCount,
  signatureFieldAnchor,
  dateFieldAnchor,
} from "./documentSignaturePageService.js";

const PLACEMENT_METHODS = new Set(["IN_DOCUMENT", "SIGNATURE_PAGE"]);
const MAX_SIGNERS = 10;

function toNullableString(value: any, maxLength: number) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text.length) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ValidSign wil een voor- en achternaam apart. Uit een ingevulde naam maken we daar het
// beste van; bij een naam van een woord blijft de achternaam gelijk aan het geheel.
function splitName(fullName: string) {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function fileExtension(fileName: string | null) {
  const raw = String(fileName || "").trim();
  const index = raw.lastIndexOf(".");
  return index > 0 && index < raw.length - 1 ? raw.slice(index + 1).toLowerCase() : null;
}

async function writeEvent(input: {
  signatureRequestId: string | null;
  documentId: string | null;
  eventType: string;
  eventBy: string | null;
  detail?: string | null;
  payloadJson?: string | null;
}) {
  try {
    await sqlQuery(insertSignatureEventSql, {
      signatureRequestId: input.signatureRequestId,
      documentId: input.documentId,
      eventType: input.eventType,
      eventBy: input.eventBy,
      detail: toNullableString(input.detail, 1000),
      payloadJson: input.payloadJson ?? null,
    });
  } catch (err) {
    // Het spoor mag de handeling niet tegenhouden; wel zichtbaar blijven in de logs.
    console.error("[document signature] event write failed", err);
  }
}

async function loadDocument(code: string, documentId: string) {
  const rows = await sqlQuery(getSignableDocumentSql, { code, documentId });
  return rows?.[0] ?? null;
}

async function loadRequest(signatureRequestId: string) {
  const rows = await sqlQuery(getSignatureRequestSql, { signatureRequestId });
  return rows?.[0] ?? null;
}

async function loadSigners(signatureRequestId: string) {
  return (await sqlQuery(getSignatureRequestSignersSql, { signatureRequestId })) || [];
}

export async function getSignatureState(code: string, documentId: string) {
  const document = await loadDocument(code, documentId);
  if (!document) throw new Error("document not found");

  const latest = await sqlQuery(getLatestSignatureRequestForDocumentSql, { code, documentId });
  const signatureRequestId = latest?.[0]?.signature_request_id ?? null;

  const request = signatureRequestId ? await loadRequest(signatureRequestId) : null;
  const signers = signatureRequestId ? await loadSigners(signatureRequestId) : [];
  const events = (await sqlQuery(getSignatureEventsForDocumentSql, { documentId })) || [];

  return {
    ok: true,
    provider_configured: validSign.isConfigured(),
    document: {
      document_id: document.document_id,
      document_type_key: document.document_type_key,
      document_type_name: document.document_type_name,
      tracks_signature: Boolean(document.tracks_signature),
      supports_esignature: Boolean(document.supports_esignature),
      is_signed: document.is_signed === true,
      has_file: Boolean(document.storage_key),
      file_name: document.file_name ?? null,
    },
    request,
    signers,
    events,
  };
}

function normalizeSigners(raw: any) {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) throw new Error("no signers");
  if (list.length > MAX_SIGNERS) throw new Error("too many signers");

  const seen = new Set<string>();

  return list.map((entry: any, index: number) => {
    const fullName = toNullableString(entry?.full_name, 200);
    const email = toNullableString(entry?.email, 320);

    if (!fullName) throw new Error("signer name required");
    if (!email || !looksLikeEmail(email)) throw new Error("signer email invalid");

    const key = email.toLowerCase();
    if (seen.has(key)) throw new Error("duplicate signer email");
    seen.add(key);

    return {
      signing_order: index + 1,
      provider_role_key: `Signer${index + 1}`,
      full_name: fullName,
      email,
      capacity: toNullableString(entry?.capacity, 200),
      user_object_id: toNullableString(entry?.user_object_id, 100),
    };
  });
}

export async function createSignatureRequest(
  code: string,
  documentId: string,
  payload: any,
  user: any
) {
  await assertInstallationWritable(code);

  if (!validSign.isConfigured()) throw new Error("signature provider not configured");

  const document = await loadDocument(code, documentId);
  if (!document) throw new Error("document not found");
  if (!document.supports_esignature) throw new Error("document type not signable");
  if (!document.is_active) throw new Error("document archived");
  if (!document.storage_key) throw new Error("document has no file");
  if (document.is_signed === true) throw new Error("document already signed");

  const mime = String(document.mime_type || "").toLowerCase();
  const extension = fileExtension(document.file_name);
  if (!mime.includes("pdf") && extension !== "pdf") {
    throw new Error("document is not a pdf");
  }

  const placementMethod = String(payload?.placement_method || "").trim().toUpperCase();
  if (!PLACEMENT_METHODS.has(placementMethod)) throw new Error("invalid placement method");

  const signers = normalizeSigners(payload?.signers);
  const message = toNullableString(payload?.message, 1000);
  const actor = getUserAuditActor(user);

  const created = await sqlQuery(createSignatureRequestSql, {
    code,
    documentId,
    placementMethod,
    message,
    signersJson: JSON.stringify(signers),
    createdBy: actor,
  });

  const signatureRequestId = String(created?.[0]?.signature_request_id || "");
  if (!signatureRequestId) throw new Error("signature request not created");

  await writeEvent({
    signatureRequestId,
    documentId,
    eventType: "SIGNATURE_REQUEST_CREATED",
    eventBy: actor,
    detail: `${placementMethod === "SIGNATURE_PAGE" ? "met ondertekenpagina" : "in het document"}; ${signers.length} ondertekenaar(s)`,
  });

  try {
    const source = await downloadInstallationDocumentBlob(String(document.storage_key));
    const documentName = toNullableString(document.title, 200) || document.document_type_name || "Document";

    let pdf = source.buffer;
    const fields: Record<string, any[]> = {};

    if (placementMethod === "SIGNATURE_PAGE") {
      const merged = await appendSignaturePage({
        sourcePdf: source.buffer,
        document: {
          title: documentName,
          installationCode: code,
          installationName: null,
          revision: document.revision ?? null,
          documentNumber: document.document_number ?? null,
        },
        signers: signers.map((signer) => ({
          order: signer.signing_order,
          fullName: signer.full_name,
          capacity: signer.capacity,
        })),
      });

      pdf = merged.pdf;

      // Met een ondertekenpagina weten we precies waar de vakken horen; de designer
      // hoeft er niet meer aan te pas te komen.
      for (const signer of signers) {
        fields[signer.provider_role_key] = [
          { type: "SIGNATURE", subtype: "FULLNAME", extractAnchor: signatureFieldAnchor(signer.signing_order) },
          { type: "INPUT", subtype: "LABEL", binding: "{approval.signed}", extractAnchor: dateFieldAnchor(signer.signing_order) },
        ];
      }
    } else {
      // Zonder ondertekenpagina plaatst de gebruiker de vakken zelf in de designer. We
      // sturen daarom geen velden mee; een leeg pakket opent gewoon in de designer.
      await readPageCount(source.buffer);
      for (const signer of signers) fields[signer.provider_role_key] = [];
    }

    // De uitnodiging komt van het verzamelaccount, dus de ontvanger ziet niet wie hem
    // stuurde. De naam van de aanvrager gaat daarom altijd mee in het bericht.
    const afzenderNaam = getUserDisplayNameSnapshot(user);
    const begeleidendBericht = [message, `Verstuurd vanuit Ember door ${afzenderNaam}.`]
      .filter(Boolean)
      .join("\n\n");

    const packageId = await validSign.createDraftPackage({
      name: `${code} ${documentName}`,
      description: `Ember; installatie ${code}`,
      message: begeleidendBericht,
      documentName,
      pdf,
      signingOrderEnforced: Boolean(payload?.enforce_order),
      signers: signers.map((signer) => {
        const { firstName, lastName } = splitName(signer.full_name);
        return {
          roleKey: signer.provider_role_key,
          firstName,
          lastName,
          email: signer.email,
          index: signer.signing_order,
          fields: fields[signer.provider_role_key] || [],
        };
      }),
    });

    await sqlQuery(setSignaturePackageIdSql, { signatureRequestId, packageId });

    await writeEvent({
      signatureRequestId,
      documentId,
      eventType: "SIGNATURE_PACKAGE_CREATED",
      eventBy: actor,
      detail: `pakket ${packageId}`,
    });
  } catch (err: any) {
    const detail = err?.detail ? `${err.message}; ${err.detail}` : err?.message || String(err);

    await sqlQuery(setSignatureRequestStatusSql, {
      signatureRequestId,
      status: "FAILED",
      closedReason: toNullableString(detail, 500),
    });

    await writeEvent({
      signatureRequestId,
      documentId,
      eventType: "SIGNATURE_PACKAGE_FAILED",
      eventBy: actor,
      detail,
    });

    throw err;
  }

  return {
    ok: true,
    signature_request_id: signatureRequestId,
    ...(await getSignatureState(code, documentId)),
  };
}

// Levert de namen van de ondertekenaars die nog geen handtekeningvak hebben.
async function signersWithoutSignatureField(packageId: string) {
  const pkg = await validSign.getPackage(packageId);

  const namePerRole = new Map<string, string>();
  for (const role of pkg?.roles || []) {
    const signer = role?.signers?.[0];
    const naam = [signer?.firstName, signer?.lastName].filter(Boolean).join(" ").trim();
    namePerRole.set(String(role?.id || ""), naam || String(role?.id || ""));
  }

  const withField = new Set<string>();
  for (const document of pkg?.documents || []) {
    for (const approval of document?.approvals || []) {
      const heeftHandtekening = (approval?.fields || []).some(
        (veld: any) => String(veld?.type || "").toUpperCase() === "SIGNATURE"
      );
      if (heeftHandtekening) withField.add(String(approval?.role || ""));
    }
  }

  return Array.from(namePerRole.entries())
    .filter(([roleKey]) => !withField.has(roleKey))
    .map(([, naam]) => naam);
}

export async function createDesignerSession(code: string, documentId: string, signatureRequestId: string) {
  const request = await loadRequest(signatureRequestId);
  if (!request || request.atrium_installation_code !== code || request.document_id !== documentId) {
    throw new Error("signature request not found");
  }
  if (request.status !== "DRAFT") throw new Error("signature request not editable");
  if (!request.provider_package_id) throw new Error("signature request has no package");

  const url = await validSign.createDesignerUrl(String(request.provider_package_id));

  return { ok: true, url };
}

export async function sendSignatureRequest(
  code: string,
  documentId: string,
  signatureRequestId: string,
  user: any
) {
  await assertInstallationWritable(code);

  const request = await loadRequest(signatureRequestId);
  if (!request || request.atrium_installation_code !== code || request.document_id !== documentId) {
    throw new Error("signature request not found");
  }
  if (request.status !== "DRAFT") throw new Error("signature request not editable");
  if (!request.provider_package_id) throw new Error("signature request has no package");

  const actor = getUserAuditActor(user);

  // Zonder handtekeningvak krijgt de ontvanger een document waarin hij niets kan doen.
  // Dat kan gebeuren wanneer iemand de plaatsing overslaat, dus we controleren het hier
  // in plaats van bij de ontvanger.
  const zonderVak = await signersWithoutSignatureField(String(request.provider_package_id));
  if (zonderVak.length) {
    throw new Error(`signature fields missing for ${zonderVak.join(", ")}`);
  }

  await validSign.sendPackage(String(request.provider_package_id));
  await sqlQuery(markSignatureRequestSentSql, { signatureRequestId, sentBy: actor });

  await writeEvent({
    signatureRequestId,
    documentId,
    eventType: "SIGNATURE_REQUEST_SENT",
    eventBy: actor,
    detail: null,
  });

  return getSignatureState(code, documentId);
}

export async function cancelSignatureRequest(
  code: string,
  documentId: string,
  signatureRequestId: string,
  payload: any,
  user: any
) {
  await assertInstallationWritable(code);

  const request = await loadRequest(signatureRequestId);
  if (!request || request.atrium_installation_code !== code || request.document_id !== documentId) {
    throw new Error("signature request not found");
  }
  if (!["DRAFT", "SENT"].includes(String(request.status))) {
    throw new Error("signature request not open");
  }

  const actor = getUserAuditActor(user);
  const reason = toNullableString(payload?.reason, 500);

  // Het pakket bij de leverancier laten we staan; verwijderen daar is onomkeerbaar en
  // hoort niet bij een annulering vanuit Ember.
  await sqlQuery(setSignatureRequestStatusSql, {
    signatureRequestId,
    status: "CANCELLED",
    closedReason: reason,
  });

  await writeEvent({
    signatureRequestId,
    documentId,
    eventType: "SIGNATURE_REQUEST_CANCELLED",
    eventBy: actor,
    detail: reason,
  });

  return getSignatureState(code, documentId);
}

export async function getSignatureFileDownload(
  code: string,
  documentId: string,
  signatureRequestId: string,
  kind: "SIGNED" | "EVIDENCE"
) {
  const request = await loadRequest(signatureRequestId);
  if (!request || request.atrium_installation_code !== code || request.document_id !== documentId) {
    throw new Error("signature request not found");
  }

  const rows = await sqlQuery(getSignatureStoredFileSql, { signatureRequestId, kind });
  const file = rows?.[0];
  if (!file?.storage_key) throw new Error("signature file not found");

  const blob = await downloadDocumentSignatureBlob(String(file.storage_key));

  const safeName = String(file.file_name || "document.pdf").replace(/["\r\n]/g, "").trim() || "document.pdf";

  return {
    ok: true,
    buffer: blob.buffer,
    contentType: file.mime_type || blob.contentType || "application/pdf",
    contentLength: blob.contentLength ?? blob.buffer.length,
    fileName: safeName,
    contentDisposition: `attachment; filename="${safeName}"`,
  };
}

async function storeSignatureFile(input: {
  code: string;
  signatureRequestId: string;
  fileName: string;
  buffer: Buffer;
}) {
  const uploaded = await uploadDocumentSignatureBlob({
    installationCode: input.code,
    signatureRequestId: input.signatureRequestId,
    fileName: input.fileName,
    contentType: "application/pdf",
    buffer: input.buffer,
  });

  try {
    const rows = await sqlQuery(insertSignatureStoredFileSql, {
      storageProvider: uploaded.storageProvider,
      storageContainer: uploaded.storageContainer,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      fileName: input.fileName,
      mimeType: "application/pdf",
      fileExtension: "pdf",
      fileSizeBytes: input.buffer.length,
      checksumSha256: crypto.createHash("sha256").update(input.buffer).digest("hex"),
      uploadedBy: "VALIDSIGN",
    });

    return String(rows?.[0]?.stored_file_id || "") || null;
  } catch (err) {
    try {
      await deleteDocumentSignatureBlob(uploaded.storageKey);
    } catch (cleanupErr) {
      console.error("[document signature] blob cleanup failed", cleanupErr);
    }
    throw err;
  }
}

// De callback zegt alleen dat er iets gebeurd is. Wie er precies getekend heeft halen we
// bij de bron op; dat is betrouwbaarder dan het raden uit een sessie-id.
async function syncSignersFromPackage(signatureRequestId: string, packageId: string) {
  let pkg: any;
  try {
    pkg = await validSign.getPackage(packageId);
  } catch (err) {
    console.error("[document signature] package read failed", err);
    return;
  }

  const signed = new Set<string>();
  for (const role of pkg?.roles || []) {
    for (const signer of role?.signers || []) {
      const email = String(signer?.email || "").trim().toLowerCase();
      if (!email) continue;
      const status = String(role?.signerStatus || signer?.status || "").toUpperCase();
      if (status.includes("COMPLETE") || status.includes("SIGNED")) signed.add(email);
    }
  }

  for (const email of signed) {
    await sqlQuery(setSignerStatusSql, {
      signatureRequestId,
      email,
      status: "SIGNED",
      statusDetail: null,
    });
  }
}

async function completeSignatureRequest(request: any) {
  const signatureRequestId = String(request.signature_request_id);
  const packageId = String(request.provider_package_id);
  const code = String(request.atrium_installation_code);

  const providerDocumentId = await validSign.getFirstDocumentId(packageId);
  const signedPdf = await validSign.downloadSignedDocument(packageId, providerDocumentId);

  let evidencePdf: Buffer | null = null;
  try {
    evidencePdf = await validSign.downloadEvidenceSummary(packageId);
  } catch (err) {
    // Zonder bewijssamenvatting is de ronde nog steeds afgerond; we noteren het gemis.
    console.error("[document signature] evidence summary unavailable", err);
  }

  const signedStoredFileId = await storeSignatureFile({
    code,
    signatureRequestId,
    fileName: "ondertekend-document.pdf",
    buffer: signedPdf,
  });

  const evidenceStoredFileId = evidencePdf
    ? await storeSignatureFile({
        code,
        signatureRequestId,
        fileName: "ondertekenbewijs.pdf",
        buffer: evidencePdf,
      })
    : null;

  await sqlQuery(markAllSignersSignedSql, { signatureRequestId });

  await sqlQuery(completeSignatureRequestSql, {
    signatureRequestId,
    signedStoredFileId,
    evidenceStoredFileId,
  });

  await writeEvent({
    signatureRequestId,
    documentId: String(request.document_id),
    eventType: "SIGNATURE_COMPLETED",
    eventBy: "VALIDSIGN",
    detail: evidenceStoredFileId
      ? "getekend document en bewijssamenvatting opgeslagen"
      : "getekend document opgeslagen; bewijssamenvatting niet beschikbaar",
  });
}

const CALLBACK_STATUS: Record<string, { status: string; reason: string }> = {
  PACKAGE_DECLINE: { status: "DECLINED", reason: "een ondertekenaar heeft geweigerd" },
  PACKAGE_EXPIRE: { status: "EXPIRED", reason: "de transactie is verlopen" },
  PACKAGE_OPT_OUT: { status: "DECLINED", reason: "een ondertekenaar heeft afgezien van ondertekening" },
  PACKAGE_TRASH: { status: "CANCELLED", reason: "de transactie is bij de leverancier weggegooid" },
  PACKAGE_DELETE: { status: "CANCELLED", reason: "de transactie is bij de leverancier verwijderd" },
  PACKAGE_DEACTIVATE: { status: "CANCELLED", reason: "de transactie is bij de leverancier stopgezet" },
};

export async function handleProviderCallback(payload: any) {
  const eventType = String(payload?.name || "").trim().toUpperCase();
  const packageId = String(payload?.packageId || "").trim();

  if (!eventType || !packageId) return { ok: true, handled: false, reason: "incomplete callback" };

  const rows = await sqlQuery(getSignatureRequestByPackageSql, { packageId });
  const request = rows?.[0];

  // Een pakket dat niet van Ember is, is geen fout; we bevestigen en doen niets.
  if (!request) return { ok: true, handled: false, reason: "unknown package" };

  const signatureRequestId = String(request.signature_request_id);
  const documentId = String(request.document_id);

  await writeEvent({
    signatureRequestId,
    documentId,
    eventType: `PROVIDER_${eventType}`,
    eventBy: "VALIDSIGN",
    detail: toNullableString(payload?.message, 1000),
    payloadJson: JSON.stringify(payload),
  });

  if (["DOCUMENT_SIGNED", "SIGNER_COMPLETE"].includes(eventType)) {
    await syncSignersFromPackage(signatureRequestId, packageId);
    return { ok: true, handled: true };
  }

  if (eventType === "EMAIL_BOUNCE") {
    const email = toNullableString(payload?.email || payload?.message, 320);
    if (email && looksLikeEmail(email)) {
      await sqlQuery(setSignerStatusSql, {
        signatureRequestId,
        email,
        status: "BOUNCED",
        statusDetail: "de uitnodiging kwam niet aan",
      });
    }
    return { ok: true, handled: true };
  }

  if (eventType === "PACKAGE_COMPLETE") {
    if (request.status === "COMPLETED") return { ok: true, handled: false, reason: "already completed" };

    await syncSignersFromPackage(signatureRequestId, packageId);

    try {
      await completeSignatureRequest(request);
    } catch (err: any) {
      const detail = err?.detail ? `${err.message}; ${err.detail}` : err?.message || String(err);
      console.error("[document signature] completion failed", err);

      await writeEvent({
        signatureRequestId,
        documentId,
        eventType: "SIGNATURE_COMPLETION_FAILED",
        eventBy: "VALIDSIGN",
        detail,
      });

      throw err;
    }

    return { ok: true, handled: true };
  }

  const mapped = CALLBACK_STATUS[eventType];
  if (mapped) {
    await sqlQuery(setSignatureRequestStatusSql, {
      signatureRequestId,
      status: mapped.status,
      closedReason: mapped.reason,
    });
    return { ok: true, handled: true };
  }

  return { ok: true, handled: false, reason: "event not relevant" };
}

export async function applyVersionSignatureDecision(
  code: string,
  documentId: string,
  payload: any,
  user: any
) {
  await assertInstallationWritable(code);

  const keepSigned = payload?.keep_signed === true;
  const reason = toNullableString(payload?.reason, 1000);

  if (keepSigned && !reason) throw new Error("reason required");

  await sqlQuery(applyVersionSignatureDecisionSql, {
    code,
    documentId,
    keepSigned: keepSigned ? 1 : 0,
    reason: reason ?? (keepSigned ? null : "opnieuw laten ondertekenen"),
    decidedBy: getUserAuditActor(user),
  });

  return getSignatureState(code, documentId);
}
