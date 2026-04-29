// api/src/services/formReportPdfService.ts
import fs from "node:fs";
import path from "node:path";
import pdfmake from "pdfmake";

import { sqlQuery } from "../db/index.js";
import { getFormReportPdfSql } from "../db/queries/formReportPdf.sql.js";
import {
  getActiveUserProfileSignatureSql,
  getUserProfileSql,
} from "../db/queries/profile.sql.js";
import { downloadUserProfileSignatureBlob } from "./blobStorageService.js";

const BRAND_RED = "#ed1c24";
const DARK = "#222222";
const MID = "#555555";
const LIGHT = "#f3f5fa";

const DISCIPLINE_ASSETS: Record<string, { color: string; gray: string; label: string }> = {
  brandbeveiliging: {
    color: "WB-Brandbeveiliging.jpg",
    gray: "WB-Brandbeveiliging-grijs.jpg",
    label: "Brandbeveiliging",
  },
  inbraakbeveiliging: {
    color: "WB-Inbraakbeveiliging.jpg",
    gray: "WB-Inbraakbeveiliging-grijs.jpg",
    label: "Inbraakbeveiliging",
  },
  camera: {
    color: "WB-Camera.jpg",
    gray: "WB-Camera-grijs.jpg",
    label: "Camerabeveiliging",
  },
  toegangscontrole: {
    color: "WB-Toegangscontrole.png",
    gray: "WB-Toegangscontrole-grijs.png",
    label: "Toegangscontrole",
  },
  telecom_zorg: {
    color: "WB-TelecomZorg.jpg",
    gray: "WB-TelecomZorg-grijs.png",
    label: "Telecom & Zorg",
  },
  service_onderhoud: {
    color: "WB-ServiceOnderhoud-grijs.jpg",
    gray: "WB-ServiceOnderhoud-grijs.jpg",
    label: "Service & Onderhoud",
  },
};

function parseJson(value: any, fallback: any) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function safeFilePart(value: any) {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function valueText(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  return "";
}

function stripHtml(html: any) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function actorObjectId(user: any) {
  return String(user?.objectId || "").trim();
}

function statusLabel(status: any) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "AFGEHANDELD") return "Definitief";
  if (s === "IN_BEHANDELING") return "In behandeling";
  if (s === "INGEDIEND") return "Ingediend";
  if (s === "CONCEPT") return "Concept";
  if (s === "INGETROKKEN") return "Ingetrokken";
  return s || "Onbekend";
}

function answerFor(answers: any, name: any) {
  const key = String(name || "");
  if (!key) return "";
  return answers?.[key];
}

function labelForElement(element: any) {
  return valueText(element?.title || element?.name || "");
}

function readImageDataUrl(filePath: string) {
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function readLogoDataUrl() {
  const candidates = [
    path.join(process.cwd(), "src", "assets", "pdf", "Wardenburg_logo.png"),
    path.join(process.cwd(), "src", "assets", "Wardenburg_logo.jpg"),
    path.join(process.cwd(), "src", "assets", "Wardenburg_logo.png"),
    path.join(process.cwd(), "assets", "pdf", "Wardenburg_logo.png"),
    path.join(process.cwd(), "assets", "pdf", "Wardenburg_logo.jpg"),
    path.join(process.cwd(), "..", "src", "assets", "pdf", "Wardenburg_logo.png"),
    path.join(process.cwd(), "..", "src", "assets", "Wardenburg_logo.png"),
  ];

  const logoPath = candidates.find((p) => fs.existsSync(p));
  return logoPath ? readImageDataUrl(logoPath) : null;
}

function readPdfAsset(fileName: string) {
  const candidates = [
    path.join(process.cwd(), "src", "assets", "pdf", fileName),
    path.join(process.cwd(), "assets", "pdf", fileName),
    path.join(process.cwd(), "..", "src", "assets", "pdf", fileName),
  ];

  const filePath = candidates.find((p) => fs.existsSync(p));
  return filePath ? readImageDataUrl(filePath) : null;
}

function assertFontFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing PDF font file: ${filePath}`);
  }
}

function configurePdfMakeFonts() {
  const fontDir = path.join(process.cwd(), "fonts");

  const regular = path.join(fontDir, "Calibri.ttf");
  const bold = path.join(fontDir, "Calibri Bold.ttf");
  const italic = path.join(fontDir, "Calibri Italic.ttf");
  const boldItalic = path.join(fontDir, "Calibri Bold Italic.ttf");

  [regular, bold, italic, boldItalic].forEach(assertFontFile);

  pdfmake.addFonts({
    Calibri: {
      normal: regular,
      bold,
      italics: italic,
      bolditalics: boldItalic,
    },
  });
}

function configurePdfMakeUrlPolicy() {
  const anyPdfMake = pdfmake as any;
  if (typeof anyPdfMake.setUrlAccessPolicy === "function") {
    anyPdfMake.setUrlAccessPolicy(() => false);
  }
}

async function getSignatureDataUrl(userObjectId: string) {
  if (!userObjectId) return null;

  const rows = await sqlQuery(getActiveUserProfileSignatureSql, { userObjectId });
  const row = rows?.[0] ?? null;
  if (!row?.storage_key) return null;

  const blob = await downloadUserProfileSignatureBlob(String(row.storage_key));
  const contentType = blob.contentType || row.mime_type || "image/png";

  return `data:${contentType};base64,${blob.buffer.toString("base64")}`;
}

async function getProfileName(user: any) {
  const userObjectId = actorObjectId(user);
  if (!userObjectId) return user?.name || user?.email || "Gebruiker";

  const rows = await sqlQuery(getUserProfileSql, { userObjectId });
  const row = rows?.[0] ?? null;

  return (
    row?.preferred_display_name ||
    row?.display_name_snapshot ||
    user?.name ||
    user?.email ||
    "Gebruiker"
  );
}

async function pdfBuffer(docDefinition: any) {
  configurePdfMakeFonts();
  configurePdfMakeUrlPolicy();

  const pdf = pdfmake.createPdf(docDefinition);
  const buffer = await pdf.getBuffer();

  return Buffer.from(buffer);
}

function keyValueTable(rows: any[], options: any = {}) {
  const body = rows
    .filter((r) => valueText(r?.[1]))
    .map((r) => [
      { text: valueText(r[0]), style: options.compact ? "kvLabelCompact" : "kvLabel" },
      { text: valueText(r[1]), style: options.compact ? "kvValueCompact" : "kvValue" },
    ]);

  if (!body.length) return [];

  return [
    {
      table: {
        widths: [options.labelWidth || 145, "*"],
        body,
      },
      layout: "noBorders",
      margin: options.margin || [0, 0, 0, 10],
    },
  ];
}

function shouldSkipReportPage(page: any) {
  const name = String(page?.name || "").trim().toLowerCase();
  return name === "documenten";
}

function visibleSurveyPages(surveyJson: any) {
  const pages = Array.isArray(surveyJson?.pages) ? surveyJson.pages : [];
  return pages.filter((p: any) => !shouldSkipReportPage(p));
}

function tocRows(surveyJson: any) {
  const pages = visibleSurveyPages(surveyJson);

  return [
    { nr: "1", title: "Voorblad", id: "cover" },
    { nr: "2", title: "Inhoudsopgave", id: "toc" },
    { nr: "3", title: "Status installatiedocumenten", id: "installatiedocumenten" },
    ...pages.map((p: any, idx: number) => ({
      nr: String(idx + 4),
      title: valueText(p.title || p.name || `Pagina ${idx + 1}`),
      id: `survey_${p.name || idx}`,
    })),
    {
      nr: String(pages.length + 4),
      title: "Ondertekening",
      id: "ondertekening",
    },
  ];
}

function tocTable(surveyJson: any) {
  return {
    table: {
      widths: [38, "*"],
      body: tocRows(surveyJson).map((r) => [
        { text: r.nr, style: "tocNr" },
        { text: r.title, style: "tocText", linkToDestination: r.id },
      ]),
    },
    layout: "tocLayout",
  };
}

function documentStatusSection(answers: any) {
  const groups = Array.isArray(answers?.doc_groepen) ? answers.doc_groepen : [];

  const content: any[] = [
    {
      text: "Status installatiedocumenten",
      style: "chapterTitle",
      pageBreak: "before",
      id: "installatiedocumenten",
    },
    {
      text: "Onderstaand overzicht is gebaseerd op de installatiedocumenten die bij het formulier beschikbaar waren.",
      style: "bodyMuted",
      margin: [0, 0, 0, 12],
    },
  ];

  if (!groups.length) {
    content.push({ text: "Geen installatiedocumenten beschikbaar.", style: "bodyMuted" });
    return content;
  }

  for (const group of groups) {
    content.push({
      text: `${valueText(group.groep_naam)} (${Number(group.count_total || 0)})`,
      style: "sectionTitle",
      margin: [0, 12, 0, 5],
    });

    const types = Array.isArray(group.types) ? group.types : [];
    for (const type of types) {
      const docs = Array.isArray(type.documents) ? type.documents : [];

      content.push({
        text: `${valueText(type.doc_type_naam)} (${docs.length})`,
        style: "subSectionTitle",
        margin: [0, 5, 0, 3],
      });

      if (!docs.length) {
        content.push({ text: "Geen documenten.", style: "bodyMuted" });
        continue;
      }

      content.push({
        table: {
          headerRows: 1,
          widths: ["*", 105, 68, 46],
          body: [
            [
              { text: "Titel", style: "tableHeader" },
              { text: "Documentnr", style: "tableHeader" },
              { text: "Datum", style: "tableHeader" },
              { text: "Revisie", style: "tableHeader" },
            ],
            ...docs.map((d: any) => [
              { text: valueText(d.doc_titel), style: "tableCell" },
              { text: valueText(d.doc_nummer), style: "tableCell" },
              { text: valueText(d.doc_datum), style: "tableCell" },
              { text: valueText(d.doc_revisie), style: "tableCell" },
            ]),
          ],
        },
        layout: "tableLayout",
        margin: [0, 0, 0, 8],
      });
    }
  }

  return content;
}

function normalColumnName(name: any) {
  const n = String(name || "");
  if (n === "item_code") return "Nr";
  if (n === "onderwerp") return "Onderwerp";
  if (n === "voldoet") return "Voldoet";
  if (n === "opmerking") return "Opmerking";
  return "";
}

function matrixTable(element: any, answers: any) {
  const name = String(element?.name || "");
  const rows = Array.isArray(answerFor(answers, name))
    ? answerFor(answers, name)
    : Array.isArray(element?.defaultValue)
      ? element.defaultValue
      : [];

  const cleanRows = rows.filter((row: any) => {
    if (!row || typeof row !== "object") return false;
    return Object.values(row).some((v) => valueText(v));
  });

  if (!cleanRows.length) return [];

  const columns = Array.isArray(element?.columns) ? element.columns : [];
  const visibleColumns = columns.filter((c: any) => c?.visible !== false);

  const fallbackColumns = [
    { name: "item_code", title: "Nr" },
    { name: "onderwerp", title: "Onderwerp" },
    { name: "voldoet", title: "Voldoet" },
    { name: "opmerking", title: "Opmerking" },
  ];

  const cols = (visibleColumns.length ? visibleColumns : fallbackColumns).filter((c: any) => {
    const n = String(c?.name || "");
    return n && n !== "doc_type";
  });

  const body = [
    cols.map((c: any) => ({
      text: valueText(c.title || normalColumnName(c.name) || c.name),
      style: "tableHeader",
    })),
    ...cleanRows.map((row: any) =>
      cols.map((c: any) => {
        const val = valueText(row?.[c.name]);
        const isNo = String(row?.[c.name] || "").toLowerCase() === "nee";

        return {
          text: val,
          style: isNo ? "negativeCell" : "tableCell",
        };
      })
    ),
  ];

  return [
    {
      text: labelForElement(element).startsWith(name) ? "" : labelForElement(element),
      style: "subSectionTitle",
      margin: [0, 8, 0, 4],
    },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: cols.map((c: any) => {
          const n = String(c.name || "");
          if (n.includes("item_code")) return 34;
          if (n.includes("voldoet")) return 52;
          if (n.includes("opmerking")) return "*";
          if (n.includes("onderwerp")) return "*";
          if (n.includes("omschrijving")) return "*";
          return "auto";
        }),
        body,
      },
      layout: "tableLayout",
      margin: [0, 0, 0, 8],
    },
  ];
}

function simpleQuestionRows(elements: any[], answers: any) {
  return elements
    .map((element) => [labelForElement(element), valueText(answerFor(answers, element?.name))])
    .filter((row) => row[0] && row[1]);
}

function simpleQuestion(element: any, answers: any) {
  const txt = valueText(answerFor(answers, element?.name));
  if (!txt) return [];

  return keyValueTable([[labelForElement(element), txt]], {
    compact: true,
    labelWidth: 155,
    margin: [0, 0, 0, 7],
  });
}

function renderPanel(element: any, answers: any): any[] {
  const children = Array.isArray(element?.elements) ? element.elements : [];
  const simpleChildren = children.filter((child: any) =>
    ["text", "dropdown", "radiogroup", "comment", "boolean"].includes(
      String(child?.type || "").toLowerCase()
    )
  );

  const complexChildren = children.filter((child: any) =>
    !["text", "dropdown", "radiogroup", "comment", "boolean"].includes(
      String(child?.type || "").toLowerCase()
    )
  );

  const content: any[] = [];

  const rows = simpleQuestionRows(simpleChildren, answers);
  if (rows.length) {
    content.push(...keyValueTable(rows, { compact: true, labelWidth: 155, margin: [0, 0, 0, 8] }));
  }

  content.push(...complexChildren.flatMap((child: any) => renderElement(child, answers)));

  if (!content.length) return [];

  return [
    {
      text: labelForElement(element),
      style: "sectionTitle",
      margin: [0, 14, 0, 7],
    },
    {
      stack: content,
      margin: [0, 0, 0, 2],
    },
  ];
}

function renderAdditionalRemarksPage(page: any, answers: any): any[] {
  const items = Array.isArray(answers?.aanvullende_opmerkingen_items)
    ? answers.aanvullende_opmerkingen_items
    : [];

  const cleanItems = items.filter((row: any) =>
    valueText(row?.omschrijving) || valueText(row?.gevolg_certificaat)
  );

  if (!cleanItems.length) {
    return [
      {
        text: valueText(page.title || "Aanvullende opmerkingen"),
        style: "chapterTitle",
        pageBreak: "before",
        id: `survey_${page.name || "aanvullende_opmerkingen"}`,
      },
      {
        text: "Er zijn geen aanvullende opmerkingen gemaakt.",
        style: "noteEmpty",
        margin: [0, 8, 0, 0],
      },
    ];
  }

  return [
    {
      text: valueText(page.title || "Aanvullende opmerkingen"),
      style: "chapterTitle",
      pageBreak: "before",
      id: `survey_${page.name || "aanvullende_opmerkingen"}`,
    },
    {
      table: {
        headerRows: 1,
        widths: ["*", 90],
        body: [
          [
            { text: "Omschrijving", style: "tableHeader" },
            { text: "Gevolg certificaat", style: "tableHeader" },
          ],
          ...cleanItems.map((row: any) => [
            { text: valueText(row.omschrijving), style: "tableCell" },
            { text: valueText(row.gevolg_certificaat), style: "tableCell" },
          ]),
        ],
      },
      layout: "tableLayout",
    },
  ];
}

function renderElement(element: any, answers: any): any[] {
  const type = String(element?.type || "").toLowerCase();

  if (type === "html") {
    const text = stripHtml(element?.html);
    if (!text) return [];
    if (/vul per onderdeel in of het voldoet/i.test(text)) return [];
    return [{ text, style: "noteBox", margin: [0, 6, 0, 8] }];
  }

  if (type === "panel") return renderPanel(element, answers);

  if (type === "matrixdynamic") return matrixTable(element, answers);

  if (
    type === "text" ||
    type === "dropdown" ||
    type === "radiogroup" ||
    type === "comment" ||
    type === "boolean"
  ) {
    return simpleQuestion(element, answers);
  }

  if (type === "paneldynamic") return [];

  return [];
}

function renderSurveyPages(surveyJson: any, answers: any) {
  const pages = Array.isArray(surveyJson?.pages) ? surveyJson.pages : [];
  const content: any[] = [];

  for (const [index, page] of pages.entries()) {
    if (shouldSkipReportPage(page)) continue;

    const pageName = String(page?.name || "").trim().toLowerCase();
    if (pageName === "aanvullende_opmerkingen") {
      content.push(...renderAdditionalRemarksPage(page, answers));
      continue;
    }

    const elements = Array.isArray(page?.elements) ? page.elements : [];
    const rendered = elements.flatMap((el: any) => renderElement(el, answers));

    if (!rendered.length) continue;

    content.push({
      text: valueText(page.title || page.name),
      style: "chapterTitle",
      pageBreak: "before",
      id: `survey_${page.name || index}`,
    });

    content.push(...rendered);
  }

  return content;
}

function coverIcon(key: string, activeDisciplines: string[]) {
  const cfg = DISCIPLINE_ASSETS[key];
  const active = activeDisciplines.includes(key);
  const asset = readPdfAsset(active ? cfg.color : cfg.gray);

  return {
    width: 92,
    stack: [
      asset
        ? {
            image: asset,
            width: 78,
            height: 78,
            alignment: "center",
            margin: [0, 0, 0, 6],
          }
        : {
            canvas: [
              {
                type: "rect",
                x: 7,
                y: 0,
                w: 78,
                h: 78,
                color: active ? BRAND_RED : "#d9d9d9",
              },
            ],
            margin: [0, 0, 0, 6],
          },
      {
        text: cfg.label,
        alignment: "center",
        fontSize: 10,
        color: active ? "#111111" : "#9a9a9a",
      },
    ],
  };
}

function coverIcons(activeDisciplines: string[]) {
  return {
    margin: [0, 52, 0, 22],
    stack: [
      {
        columns: [
          { width: "*", text: "" },
          coverIcon("brandbeveiliging", activeDisciplines),
          coverIcon("inbraakbeveiliging", activeDisciplines),
          coverIcon("camera", activeDisciplines),
          { width: "*", text: "" },
        ],
        columnGap: 26,
        margin: [0, 0, 0, 24],
      },
      {
        columns: [
          { width: "*", text: "" },
          coverIcon("toegangscontrole", activeDisciplines),
          coverIcon("telecom_zorg", activeDisciplines),
          coverIcon("service_onderhoud", activeDisciplines),
          { width: "*", text: "" },
        ],
        columnGap: 26,
      },
    ],
  };
}

function reportConfig(surveyJson: any) {
  return surveyJson?.ember?.report || {};
}

function signatureBlocks(surveyJson: any) {
  const blocks = surveyJson?.ember?.report?.signaturePage?.blocks;
  return Array.isArray(blocks) ? blocks : [];
}

function signatureClosingText(surveyJson: any) {
  const text = surveyJson?.ember?.report?.signaturePage?.closingText;
  return Array.isArray(text) ? text : [];
}

function renderSignatureBlock(block: any, answers: any, signatureDataUrl: string | null) {
  const fields = Array.isArray(block?.fields) ? block.fields : [];

  return {
    margin: [0, 0, 0, 10],
    table: {
      widths: ["*"],
      body: [
        [
          {
            text: valueText(block?.title || "Verklaring"),
            style: "signatureBlockTitle",
            fillColor: "#d9d9d9",
          },
        ],
        [
          {
            text: valueText(block?.text),
            style: "signatureBlockText",
            fillColor: "#f5f5f5",
          },
        ],
        [
          {
            table: {
              widths: fields.length > 1 ? fields.map(() => "*") : ["*"],
              body: [
                fields.length
                  ? fields.map((field: any) => ({
                      text: `${valueText(field.label)}: ${valueText(answerFor(answers, field.answer))}`,
                      style: "signatureField",
                    }))
                  : [{ text: "Naam:", style: "signatureField" }],
              ],
            },
            layout: "tableLayout",
          },
        ],
        [
          {
            text: valueText(block?.signatureLabel || "Handtekening"),
            style: "signatureLabel",
            fillColor: "#eeeeee",
          },
        ],
        [
          signatureDataUrl
            ? {
                image: signatureDataUrl,
                fit: [180, 80],
                margin: [8, 8, 8, 36],
              }
            : {
                text: "",
                margin: [8, 8, 8, 90],
              },
        ],
        ...(valueText(block?.footerText)
          ? [[{ text: valueText(block.footerText), style: "signatureFooter", fillColor: "#f5f5f5" }]]
          : []),
      ],
    },
    layout: "tableLayout",
  };
}

function signaturePage(surveyJson: any, answers: any, profileName: string, signatureDataUrl: string | null) {
  const blocks = signatureBlocks(surveyJson);
  const closing = signatureClosingText(surveyJson);

  const defaultBlock = {
    title: "Verklaring",
    text: "De opsteller verklaart dat dit rapport naar waarheid is ingevuld.",
    fields: [
      { label: "Naam onderhouder", answer: "onderhouder_naam" },
      { label: "Datum", answer: "datum_onderhoud" },
    ],
    signatureLabel: "Handtekening",
  };

  const enrichedAnswers = {
    ...answers,
    onderhouder_naam: answers?.onderhouder_naam || profileName,
  };

  return [
    { text: "Ondertekening", style: "chapterTitle", pageBreak: "before", id: "ondertekening" },
    ...(blocks.length ? blocks : [defaultBlock]).map((block: any) =>
      renderSignatureBlock(block, enrichedAnswers, signatureDataUrl)
    ),
    ...closing.map((text: any) => ({
      text: valueText(text),
      style: "signatureClosingText",
      margin: [0, 8, 0, 0],
    })),
  ];
}

function buildAddress(item: any, answers: any) {
  return (
    [
      valueText(answers.bouwwerk_straat),
      [valueText(answers.bouwwerk_postcode), valueText(answers.bouwwerk_plaats)]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", ") || valueText(item.obj_adr_formatted)
  );
}

function buildDocDefinition(args: {
  item: any;
  surveyJson: any;
  answers: any;
  logoDataUrl: string | null;
  profileName: string;
  signatureDataUrl: string | null;
}) {
  const { item, surveyJson, answers, logoDataUrl, profileName, signatureDataUrl } = args;

  const cfg = reportConfig(surveyJson);
  const activeDisciplines = Array.isArray(cfg.activeDisciplines)
    ? cfg.activeDisciplines.map((x: any) => String(x || "").trim()).filter(Boolean)
    : ["brandbeveiliging", "service_onderhoud"];

  const onderhoudDatum = valueText(answers.datum_onderhoud);
  const documentnummer = valueText(answers.documentnummer || item.form_instance_id);
  const isDefinitief = String(item.status || "").toUpperCase() === "AFGEHANDELD";
  const objectNaam = valueText(answers.bouwwerk_naam || item.obj_naam || item.installatie_naam);
  const adres = buildAddress(item, answers);
  const footerLeft = `${item.form_name || surveyJson?.title || "Formulier"} ; ${documentnummer}`;

  return {
    pageSize: "A4",
    pageMargins: [36, 60, 36, 52],

    header(currentPage: number) {
      if (currentPage === 1) return {};

      return logoDataUrl
        ? {
            image: logoDataUrl,
            width: 112,
            margin: [36, 14, 0, 0],
          }
        : {};
    },

    footer(currentPage: number, pageCount: number) {
      return {
        columns: [
          { text: footerLeft, style: "footerText" },
          { text: `${currentPage} / ${pageCount}`, alignment: "right", style: "footerText" },
        ],
        margin: [36, 0, 36, 18],
      };
    },

    content: [
      { text: "", id: "cover" },

      {
        text: !isDefinitief ? "CONCEPT-VERSIE!\nNIET GESCHIKT VOOR EXTERNE COMMUNICATIE" : "",
        style: "coverConcept",
        margin: [0, 18, 0, 0],
      },

      { text: "Rapport van Onderhoud", style: "coverMainTitle" },
      { text: "Brandmeldinstallatie", style: "coverSubTitle" },

      {
        stack: [
          {
            text: objectNaam || "Object",
            style: "coverObjectName",
          },
          adres
            ? {
                text: adres,
                style: "coverObjectAddress",
                margin: [0, 4, 0, 0],
              }
            : {},
        ],
        margin: [95, 48, 95, 0],
      },

      coverIcons(activeDisciplines),

      {
        text: !isDefinitief
          ? "De noodzakelijke basisgegevens zijn niet volledig definitief gemaakt. Dit rapport is een concept en niet geschikt voor externe communicatie."
          : "",
        style: "coverWarningText",
        margin: [0, 0, 0, 18],
      },

      ...keyValueTable(
        [
          ["Onderhoudsbedrijf BMI", valueText(answers.onderhoudsbedrijf_naam)],
          ["Erkenningsnummer", valueText(answers.erkenningsnummer || "11008")],
          ["Datum onderhoud", onderhoudDatum],
          ["Naam onderhouder", profileName],
          ["Datum opmaak", onderhoudDatum],
          ["Documentnummer", documentnummer],
        ],
        {
          compact: true,
          labelWidth: 130,
          margin: [140, 2, 120, 0],
        }
      ),

      {
        text: !isDefinitief ? "CONCEPT-VERSIE!" : "",
        style: "coverConceptBottom",
        absolutePosition: { x: 0, y: 760 },
      },

      { text: "", pageBreak: "after" },

      { text: "Inhoudsopgave", style: "chapterTitle", id: "toc" },
      tocTable(surveyJson),

      ...documentStatusSection(answers),

      ...renderSurveyPages(surveyJson, answers),

      ...signaturePage(surveyJson, answers, profileName, signatureDataUrl),
    ],

    styles: {
      coverConcept: {
        fontSize: 16,
        bold: true,
        color: BRAND_RED,
        alignment: "center",
        lineHeight: 1.2,
      },
      coverConceptBottom: {
        fontSize: 16,
        bold: true,
        color: BRAND_RED,
        alignment: "center",
        lineHeight: 1.2,
      },
      coverMainTitle: {
        fontSize: 31,
        bold: true,
        color: "#000000",
        alignment: "center",
        margin: [0, 14, 0, 2],
      },
      coverSubTitle: {
        fontSize: 20,
        color: "#000000",
        alignment: "center",
      },
      coverObjectName: {
        fontSize: 11,
        color: "#222222",
        alignment: "center",
      },
      coverObjectAddress: {
        fontSize: 9,
        color: "#666666",
        alignment: "center",
      },
      coverWarningText: {
        fontSize: 10,
        bold: true,
        color: "#000000",
        alignment: "center",
        lineHeight: 1.15,
      },
      noteEmpty: {
        fontSize: 9,
        color: "#666666",
        italics: true,
      },

      chapterTitle: { fontSize: 18, bold: true, color: DARK, margin: [0, 0, 0, 12] },
      sectionTitle: { fontSize: 12, bold: true, color: DARK },
      subSectionTitle: { fontSize: 10, bold: true, color: MID },

      tableHeader: { bold: true, color: "#ffffff", fillColor: MID, fontSize: 7.5 },
      tableCell: { fontSize: 7.5, color: DARK },
      negativeCell: { fontSize: 7.5, bold: true, color: BRAND_RED },

      kvLabel: { bold: true, color: MID, fontSize: 9 },
      kvValue: { color: DARK, fontSize: 9 },
      kvLabelCompact: { bold: true, color: MID, fontSize: 8.5 },
      kvValueCompact: { color: DARK, fontSize: 8.5 },

      tocNr: { bold: true, color: BRAND_RED, fontSize: 10 },
      tocText: { color: DARK, fontSize: 10 },

      noteBox: { fontSize: 9, color: "#333333", fillColor: "#f5f5f5" },
      bodyMuted: { fontSize: 9, color: "#666666" },

      signatureBlockTitle: { fontSize: 12, bold: true, color: "#000000" },
      signatureBlockText: { fontSize: 8.5, color: "#000000" },
      signatureField: { fontSize: 8.5, color: "#000000" },
      signatureLabel: { fontSize: 10, bold: true, color: "#000000" },
      signatureFooter: { fontSize: 8, color: "#000000" },
      signatureClosingText: { fontSize: 8.5, color: "#000000", lineHeight: 1.12 },

      footerText: { fontSize: 8, color: "#777777" },
    },

    defaultStyle: {
      font: "Calibri",
      fontSize: 9,
      lineHeight: 1.15,
    },
  };
}

export async function buildFormReportPdf(formInstanceIdRaw: any, user: any) {
  const formInstanceId = Number(formInstanceIdRaw);
  if (!Number.isInteger(formInstanceId) || formInstanceId <= 0) {
    return { error: "not found" };
  }

  const rows = await sqlQuery(getFormReportPdfSql, { formInstanceId });
  const item = rows?.[0] ?? null;
  if (!item) return { error: "not found" };

  const surveyJson = parseJson(item.survey_json, {});
  const answers = parseJson(item.answers_json, {});

  const logoDataUrl = readLogoDataUrl();
  const profileName = await getProfileName(user);
  const signatureDataUrl = await getSignatureDataUrl(actorObjectId(user));

  const docDefinition = buildDocDefinition({
    item,
    surveyJson,
    answers,
    logoDataUrl,
    profileName,
    signatureDataUrl,
  });

  const buffer = await pdfBuffer(docDefinition);

  const onderhoudDatum = valueText(answers.datum_onderhoud) || "zonder-datum";
  const fileName = `${[
    safeFilePart(item.form_name || item.form_code || "formulier"),
    safeFilePart(item.atrium_installation_code),
    safeFilePart(onderhoudDatum),
  ]
    .filter(Boolean)
    .join("_")}.pdf`;

  return {
    ok: true,
    buffer,
    contentType: "application/pdf",
    contentLength: buffer.length,
    fileName,
    contentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
  };
}