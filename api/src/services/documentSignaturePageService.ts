// api/src/services/documentSignaturePageService.ts
//
// Bouwt de ondertekenpagina die Ember achter een aangeleverd document plakt, en levert
// de ankers waarmee ValidSign de handtekeningvakken plaatst. Zo hoeft niemand
// coordinaten op te geven voor een document waarvan we de opmaak niet kennen.

import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { renderHtmlToPdf } from "./formReportHtmlRendererService.js";
import type { ValidSignAnchor } from "./validSignClient.js";

export type SignaturePageSigner = {
  order: number;
  fullName: string;
  capacity: string | null;
};

export type SignaturePageDocument = {
  title: string;
  installationCode: string;
  installationName: string | null;
  revision: string | null;
  documentNumber: string | null;
};

// De ankers zijn machinemarkeringen, geen leesbare tekst. Ze staan in wit op wit zodat de
// pagina er netjes uitziet en de tekstlaag toch doorzoekbaar blijft voor de plaatsing.
export function signatureAnchorText(order: number) {
  return `EMBERSIG${order}`;
}

export function dateAnchorText(order: number) {
  return `EMBERDATE${order}`;
}

function anchor(text: string, width: number, height: number): ValidSignAnchor {
  return {
    text,
    index: 0,
    width,
    height,
    // Het anker staat precies op de linkerbovenhoek van het bedoelde vak, dus geen offsets.
    anchorPoint: "TOPLEFT",
    characterIndex: 0,
    leftOffset: 0,
    topOffset: 0,
  };
}

export function signatureFieldAnchor(order: number) {
  return anchor(signatureAnchorText(order), 180, 44);
}

export function dateFieldAnchor(order: number) {
  return anchor(dateAnchorText(order), 110, 14);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(value);
}

function signerBlock(signer: SignaturePageSigner) {
  return `
    <div class="onderteken">
      <div class="vak"><span class="anker">${signatureAnchorText(signer.order)}</span></div>
      <div class="lijn"></div>
      <div class="regel"><span class="veld">Naam</span>${escapeHtml(signer.fullName)}</div>
      <div class="regel"><span class="veld">Hoedanigheid</span>${escapeHtml(signer.capacity || "-")}</div>
      <div class="regel"><span class="veld">Datum</span><span class="anker">${dateAnchorText(signer.order)}</span></div>
    </div>`;
}

export function buildSignaturePageHtml(input: {
  document: SignaturePageDocument;
  signers: SignaturePageSigner[];
  pageCount: number;
  checksum: string;
  createdAt: Date;
}) {
  const { document: doc, signers, pageCount, checksum, createdAt } = input;

  const kenmerk = [doc.documentNumber, doc.revision ? `revisie ${doc.revision}` : null]
    .filter(Boolean)
    .join("; ");

  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>Ondertekening</title><style>
  @page { size: A4; margin: 20mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11pt; color: #1b2431; }
  h1 { font-size: 16pt; margin: 0 0 6mm; }
  .kader { border: 1px solid #c8d2dd; padding: 4mm 5mm; margin-bottom: 7mm; font-size: 10pt; }
  .kader div { margin: 1.2mm 0; }
  .kader span.veld { display: inline-block; width: 34mm; color: #5b6878; }
  p.uitleg { line-height: 1.5; margin: 0 0 8mm; }
  .onderteken { margin-bottom: 12mm; page-break-inside: avoid; }
  .vak { height: 16mm; }
  .lijn { border-bottom: 1px solid #1b2431; width: 72mm; }
  .regel { font-size: 10pt; margin-top: 1.8mm; }
  .regel span.veld { display: inline-block; width: 30mm; color: #5b6878; }
  /* Machinemarkering voor de plaatsing; onzichtbaar op papier, wel in de tekstlaag. */
  .anker { color: #ffffff; font-size: 7pt; }
</style></head><body>

<h1>Ondertekening</h1>

<div class="kader">
  <div><span class="veld">Document</span>${escapeHtml(doc.title)}</div>
  <div><span class="veld">Installatie</span>${escapeHtml(doc.installationCode)}${doc.installationName ? ` ${escapeHtml(doc.installationName)}` : ""}</div>
  ${kenmerk ? `<div><span class="veld">Kenmerk</span>${escapeHtml(kenmerk)}</div>` : ""}
  <div><span class="veld">Aantal pagina's</span>${pageCount}</div>
  <div><span class="veld">Controlegetal</span>${escapeHtml(checksum.slice(0, 32))}</div>
  <div><span class="veld">Aangemaakt</span>${escapeHtml(formatDate(createdAt))}</div>
</div>

<p class="uitleg">Door ondertekening verklaren onderstaande partijen akkoord te gaan met de inhoud
van het hierboven aangeduide document. Het controlegetal hoort bij het bestand zoals het bij
deze ondertekening is aangeboden.</p>

${signers.map(signerBlock).join("")}

</body></html>`;
}

// pdf-lib weigert een beveiligd of beschadigd bestand. Dat is geen serverfout maar iets
// wat de gebruiker moet zien, dus geven we er een eigen boodschap aan.
async function loadPdf(buffer: Buffer, wat: string) {
  try {
    return await PDFDocument.load(new Uint8Array(buffer));
  } catch {
    throw new Error(`pdf unreadable: ${wat}`);
  }
}

export async function appendSignaturePage(input: {
  sourcePdf: Buffer;
  document: SignaturePageDocument;
  signers: SignaturePageSigner[];
}) {
  const source = await loadPdf(input.sourcePdf, "source document");
  const pageCount = source.getPageCount();
  const checksum = crypto.createHash("sha256").update(input.sourcePdf).digest("hex");

  const html = buildSignaturePageHtml({
    document: input.document,
    signers: input.signers,
    pageCount,
    checksum,
    createdAt: new Date(),
  });

  const signaturePagePdf = await renderHtmlToPdf(html, {
    margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
  });

  const signaturePage = await loadPdf(signaturePagePdf, "signature page");
  const copied = await source.copyPages(signaturePage, signaturePage.getPageIndices());
  for (const page of copied) source.addPage(page);

  return {
    pdf: Buffer.from(await source.save()),
    sourcePageCount: pageCount,
    checksum,
  };
}

export async function readPageCount(buffer: Buffer) {
  const pdf = await loadPdf(buffer, "source document");
  return pdf.getPageCount();
}
