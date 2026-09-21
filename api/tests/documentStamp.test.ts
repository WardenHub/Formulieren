import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { applyDocumentStamp } from "../src/services/documentStampPdfService.js";
import { isOriginalDocumentUploader } from "../src/services/documentStampPolicy.js";

async function sourceWithRotations() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const rotation of [0, 90, 180, 270]) {
    const page = document.addPage([600, 800]);
    page.setRotation(degrees(rotation));
    page.drawText(`Pagina rotatie ${rotation}`, { x: 42, y: 740, size: 20, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawRectangle({ x: 30, y: 30, width: 540, height: 700, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1 });
  }
  return Buffer.from(await document.save());
}

test("plaatst leesbare stempels op paginas met alle standaardrotaties", async () => {
  let buffer = await sourceWithRotations();
  const originalLength = buffer.length;

  for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
    const result = await applyDocumentStamp({
      sourcePdf: buffer,
      stampType: pageNumber === 2 ? "GECONTROLEERD" : "UITGIFTE",
      pageNumber,
      xNormalized: 0.58,
      yNormalized: 0.72,
      widthNormalized: 0.32,
      displayName: "Zoë van Dijk",
      jobTitle: "Projectcoördinator",
      stampedAt: new Date("2026-09-18T10:00:00Z"),
    });
    buffer = result.buffer;
  }

  const reopened = await PDFDocument.load(buffer);
  assert.equal(reopened.getPageCount(), 4);
  assert.ok(buffer.length > originalLength);

  const output = process.env.STAMP_QA_OUTPUT;
  if (output) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, buffer);
  }
});

test("weigert een stempel die buiten de pagina zou vallen", async () => {
  const buffer = await sourceWithRotations();
  await assert.rejects(
    applyDocumentStamp({
      sourcePdf: buffer,
      stampType: "CALCULATIE",
      pageNumber: 1,
      xNormalized: 0.9,
      yNormalized: 0.9,
      widthNormalized: 0.32,
      displayName: "Test",
      jobTitle: "Tester",
      stampedAt: new Date("2026-09-18T10:00:00Z"),
    }),
    /does not fit/
  );
});

test("herkent de oorspronkelijke uploader via object-id, e-mail en naam", () => {
  const user = {
    objectId: "A39C2C22-0650-4025-BBB4-6E46C5DF8A36",
    email: "tekenaar@wardenburg.nl",
    preferred_username: "tekenaar@wardenburg.nl",
    name: "J. Tekenaar",
  };

  assert.equal(isOriginalDocumentUploader(user, "a39c2c22-0650-4025-bbb4-6e46c5df8a36"), true);
  assert.equal(isOriginalDocumentUploader(user, " TEKENAAR@WARDENBURG.NL "), true);
  assert.equal(isOriginalDocumentUploader(user, "j. tekenaar"), true);
  assert.equal(isOriginalDocumentUploader(user, "controleur@wardenburg.nl"), false);
  assert.equal(isOriginalDocumentUploader(user, null), false);
});
