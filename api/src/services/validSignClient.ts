// api/src/services/validSignClient.ts
//
// Dunne client op de ValidSign REST API. ValidSign is een white-label OneSpan Sign;
// de sleutel is al base64 en gaat ongewijzigd mee als "Authorization: Basic <sleutel>".
// De sleutel komt uitsluitend uit de omgeving en wordt nergens gelogd.

const DEFAULT_BASE_URL = "https://my.validsign.eu/api";
const REQUEST_TIMEOUT_MS = 60000;

export type ValidSignAnchor = {
  text: string;
  index: number;
  width: number;
  height: number;
  anchorPoint: "TOPLEFT" | "TOPRIGHT" | "BOTTOMLEFT" | "BOTTOMRIGHT";
  characterIndex: number;
  leftOffset: number;
  topOffset: number;
};

export type ValidSignField = {
  type: "SIGNATURE" | "INPUT";
  subtype: string;
  binding?: string | null;
  extractAnchor?: ValidSignAnchor;
  page?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

export type ValidSignSigner = {
  roleKey: string;
  firstName: string;
  lastName: string;
  email: string;
  index: number;
  fields: ValidSignField[];
};

export class ValidSignError extends Error {
  status: number;
  detail: string | null;

  constructor(message: string, status: number, detail: string | null = null) {
    super(message);
    this.name = "ValidSignError";
    this.status = status;
    this.detail = detail;
  }
}

function baseUrl() {
  return String(process.env.VALIDSIGN_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

// De designer draait op de applicatie zelf, niet op het /api-pad eronder.
export function appUrl() {
  return baseUrl().replace(/\/api$/, "");
}

export function isConfigured() {
  return Boolean(String(process.env.VALIDSIGN_API_KEY || "").trim());
}

function authorizationHeader() {
  const key = String(process.env.VALIDSIGN_API_KEY || "").trim();
  if (!key) throw new Error("missing env var VALIDSIGN_API_KEY");
  return `Basic ${key}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Een foutmelding van de leverancier kan lang zijn en soms documentinhoud bevatten.
// We houden er een korte, leesbare kop van over voor de logs en het scherm.
function shortDetail(text: string) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  return compact.length > 300 ? `${compact.slice(0, 300)}...` : compact || null;
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetchWithTimeout(`${baseUrl()}${path}`, {
    ...init,
    headers: { Authorization: authorizationHeader(), ...(init.headers || {}) },
  });

  if (!response.ok) {
    const detail = shortDetail(await response.text().catch(() => ""));
    throw new ValidSignError(`validsign request failed (${response.status})`, response.status, detail);
  }

  return response;
}

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await request(path, init);
  return (await response.json()) as any;
}

async function requestBuffer(path: string) {
  const response = await request(path);
  return Buffer.from(await response.arrayBuffer());
}

export type DraftPackageInput = {
  name: string;
  description?: string | null;
  message?: string | null;
  documentName: string;
  pdf: Buffer;
  signers: ValidSignSigner[];
  signingOrderEnforced: boolean;
};

export function buildPackagePayload(input: Omit<DraftPackageInput, "pdf">) {
  return {
    name: input.name,
    type: "PACKAGE",
    status: "DRAFT",
    language: "nl",
    autocomplete: true,
    description: input.description || undefined,
    emailMessage: input.message || undefined,
    roles: input.signers.map((signer) => ({
      id: signer.roleKey,
      name: signer.roleKey,
      // Zonder afgedwongen volgorde krijgt iedereen index 0 en mag men door elkaar tekenen.
      index: input.signingOrderEnforced ? signer.index : 0,
      type: "SIGNER",
      signers: [
        {
          id: signer.roleKey,
          firstName: signer.firstName,
          lastName: signer.lastName,
          email: signer.email,
        },
      ],
    })),
    documents: [
      {
        id: "document1",
        name: input.documentName,
        index: 0,
        approvals: input.signers.map((signer) => ({
          role: signer.roleKey,
          fields: signer.fields,
        })),
      },
    ],
  };
}

export async function createDraftPackage(input: DraftPackageInput) {
  const payload = buildPackagePayload(input);

  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  form.append(
    "file",
    new Blob([new Uint8Array(input.pdf)], { type: "application/pdf" }),
    `${input.documentName}.pdf`
  );

  const created = await requestJson("/packages", { method: "POST", body: form });
  const packageId = String(created?.id || "").trim();
  if (!packageId) throw new Error("validsign returned no package id");

  return packageId;
}

export async function getPackage(packageId: string) {
  return requestJson(`/packages/${encodeURIComponent(packageId)}`);
}

// Levert een eenmalige designer-URL. Het token leeft dertig minuten en hoort daarom
// niet opgeslagen of gelogd te worden; de frontend gebruikt hem direct.
export async function createDesignerUrl(packageId: string) {
  const token = await requestJson("/authenticationTokens/sender", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId }),
  });

  const value = String(token?.value || "").trim();
  if (!value) throw new Error("validsign returned no sender token");

  const app = appUrl();
  const target = `${app}/a/transaction/${encodeURIComponent(packageId)}/designer`;

  return `${app}/auth?senderAuthenticationToken=${encodeURIComponent(value)}&target=${encodeURIComponent(target)}`;
}

export async function sendPackage(packageId: string) {
  await request(`/packages/${encodeURIComponent(packageId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "SENT" }),
  });
}

export async function getFirstDocumentId(packageId: string) {
  const pkg = await getPackage(packageId);
  const documentId = String(pkg?.documents?.[0]?.id || "").trim();
  if (!documentId) throw new Error("validsign package has no document");
  return documentId;
}

export async function downloadSignedDocument(packageId: string, documentId: string) {
  return requestBuffer(
    `/packages/${encodeURIComponent(packageId)}/documents/${encodeURIComponent(documentId)}/pdf`
  );
}

export async function downloadEvidenceSummary(packageId: string) {
  return requestBuffer(`/packages/${encodeURIComponent(packageId)}/evidence/summary`);
}

export async function getAuditTrail(packageId: string) {
  return requestJson(`/packages/${encodeURIComponent(packageId)}/audit`);
}
