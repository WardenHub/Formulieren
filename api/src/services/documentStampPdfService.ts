import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const DOCUMENT_STAMP_TYPES = [
  "CALCULATIE",
  "GECONTROLEERD",
  "INGETROKKEN",
  "OPDRACHT",
  "UITGIFTE",
  "VERVALLEN",
] as const;

export type DocumentStampType = typeof DOCUMENT_STAMP_TYPES[number];

const STAMP_PAGE_INDEX: Record<DocumentStampType, number> = {
  CALCULATIE: 1,
  GECONTROLEERD: 2,
  INGETROKKEN: 3,
  OPDRACHT: 4,
  UITGIFTE: 5,
  VERVALLEN: 6,
};

// De grootste cropbox uit het officiele Wardenburg-stempelpakket. Alle zes
// sjablonen worden naar deze vaste verhouding geschaald, zodat de voorvertoning
// en de definitieve PDF exact dezelfde plaats innemen.
const STAMP_WIDTH = 148.451;
const STAMP_HEIGHT = 61.609;
const STAMP_ASPECT_RATIO = STAMP_WIDTH / STAMP_HEIGHT;

function normalizeRotation(value: number) {
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized)) throw new Error("pdf page rotation invalid");
  return normalized;
}

function visualPointToPdf(
  displayX: number,
  displayY: number,
  pageWidth: number,
  pageHeight: number,
  rotation: number,
  offsetX: number,
  offsetY: number
) {
  if (rotation === 0) return { x: offsetX + displayX, y: offsetY + pageHeight - displayY };
  if (rotation === 90) return { x: offsetX + displayY, y: offsetY + displayX };
  if (rotation === 180) return { x: offsetX + pageWidth - displayX, y: offsetY + displayY };
  return { x: offsetX + pageWidth - displayY, y: offsetY + pageHeight - displayX };
}

export function resolveStampPlacement(page: PDFPage, input: {
  xNormalized: number;
  yNormalized: number;
  widthNormalized: number;
}) {
  const crop = page.getCropBox();
  const rotation = normalizeRotation(page.getRotation().angle);
  const displayWidth = rotation === 90 || rotation === 270 ? crop.height : crop.width;
  const displayHeight = rotation === 90 || rotation === 270 ? crop.width : crop.height;
  const visualWidth = input.widthNormalized * displayWidth;
  const visualHeight = visualWidth / STAMP_ASPECT_RATIO;
  const heightNormalized = visualHeight / displayHeight;

  if (input.xNormalized < 0 || input.yNormalized < 0 || input.widthNormalized <= 0) {
    throw new Error("stamp position invalid");
  }
  if (input.xNormalized + input.widthNormalized > 1.000001 || input.yNormalized + heightNormalized > 1.000001) {
    throw new Error("stamp does not fit on page");
  }

  const visualLeft = input.xNormalized * displayWidth;
  const visualBottom = (input.yNormalized + heightNormalized) * displayHeight;
  const pdfBottomLeft = visualPointToPdf(
    visualLeft,
    visualBottom,
    crop.width,
    crop.height,
    rotation,
    crop.x,
    crop.y
  );

  return {
    x: pdfBottomLeft.x,
    y: pdfBottomLeft.y,
    width: visualWidth,
    height: visualHeight,
    rotation,
    heightNormalized,
  };
}

function fitText(font: PDFFont, value: string, maxWidth: number, fontSize: number) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (font.widthOfTextAtSize(clean, fontSize) <= maxWidth) return clean;

  let text = clean;
  while (text.length > 1 && font.widthOfTextAtSize(`${text}…`, fontSize) > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}

function formatStampDate(value: Date) {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

async function createStampTemplate(input: {
  stampType: DocumentStampType;
  displayName: string;
  jobTitle: string;
  stampedAt: Date;
}) {
  const [templateBytes, regularBytes] = await Promise.all([
    readFile(new URL("../../assets/stempels-Wardenburg-v0.1.pdf", import.meta.url)),
    readFile(new URL("../../fonts/calibri.ttf", import.meta.url)),
  ]);
  const officialDocument = await PDFDocument.load(templateBytes);
  const officialPage = officialDocument.getPage(STAMP_PAGE_INDEX[input.stampType]);
  const officialCrop = officialPage.getCropBox();
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const regular = await document.embedFont(regularBytes, { subset: true });
  const officialStamp = await document.embedPage(officialPage, {
    left: officialCrop.x,
    bottom: officialCrop.y,
    right: officialCrop.x + officialCrop.width,
    top: officialCrop.y + officialCrop.height,
  });
  const page = document.addPage([STAMP_WIDTH, STAMP_HEIGHT]);
  page.drawPage(officialStamp, {
    x: 0,
    y: 0,
    width: STAMP_WIDTH,
    height: STAMP_HEIGHT,
  });
  const blue = rgb(0.22, 0.28, 0.68);

  const rows = [
    formatStampDate(input.stampedAt),
    input.displayName,
    input.jobTitle,
  ];
  rows.forEach((value, index) => {
    page.drawText(fitText(regular, value, 91, 4.4), {
      x: 47,
      y: 22.2 - index * 8.3,
      size: 4.4,
      font: regular,
      color: blue,
    });
  });

  return { document, pageIndex: 0 };
}

export async function applyDocumentStamp(input: {
  sourcePdf: Buffer;
  stampType: DocumentStampType;
  pageNumber: number;
  xNormalized: number;
  yNormalized: number;
  widthNormalized: number;
  displayName: string;
  jobTitle: string;
  stampedAt: Date;
}) {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(new Uint8Array(input.sourcePdf));
  } catch {
    throw new Error("pdf unreadable or protected");
  }

  if (!DOCUMENT_STAMP_TYPES.includes(input.stampType)) throw new Error("stamp type invalid");
  if (!Number.isInteger(input.pageNumber) || input.pageNumber < 1 || input.pageNumber > source.getPageCount()) {
    throw new Error("stamp page invalid");
  }

  const page = source.getPage(input.pageNumber - 1);
  const placement = resolveStampPlacement(page, input);
  const stampTemplate = await createStampTemplate(input);
  const [stampPage] = await source.embedPdf(
    await stampTemplate.document.save(),
    [stampTemplate.pageIndex]
  );

  page.drawPage(stampPage, {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    rotate: degrees(placement.rotation),
  });

  return {
    buffer: Buffer.from(await source.save()),
    pageCount: source.getPageCount(),
    heightNormalized: placement.heightNormalized,
  };
}
