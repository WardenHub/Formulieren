// api/src/services/formReportPdfService.ts
import fs from "node:fs";
import path from "node:path";
import pdfmake from "pdfmake";

import { sqlQuery } from "../db/index.js";
import { getFormReportPdfSql } from "../db/queries/formReportPdf.sql.js";
import {
  getActiveUserProfileSignatureSql,
  findUserProfileByActorSql,
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

function normalizeText(value: any) {
  const s = String(value || "").trim();
  return s.length ? s : null;
}

function firstText(...values: any[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
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
  if (typeof value === "boolean") return value ? "Ja" : "Nee";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  return "";
}

function answerValue(answers: any, names: any[]) {
  for (const name of names) {
    const key = normalizeText(name);
    if (!key) continue;

    const value = answers?.[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }

  return null;
}

function answerText(answers: any, ...names: any[]) {
  return valueText(answerValue(answers, names));
}

function answerDateText(answers: any, ...names: any[]) {
  const value = answerValue(answers, names);
  return formatDateValue(value);
}

function formatDateValue(value: any) {
  const raw = normalizeText(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}-${month}-${year}`;
  }

  if (/^\d{4}-\d{2}-\d{2}t/i.test(raw)) {
    const datePart = raw.slice(0, 10);
    const [year, month, day] = datePart.split("-");
    return `${day}-${month}-${year}`;
  }

  return raw;
}

function joinNonEmpty(parts: any[], separator = " ") {
  return parts.map((part) => normalizeText(part)).filter(Boolean).join(separator);
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

function profileDisplayName(row: any) {
  return firstText(
    row?.preferred_display_name,
    row?.display_name_snapshot,
    row?.email_snapshot
  );
}

async function getUserProfileByObjectId(userObjectId: string) {
  if (!userObjectId) return null;

  const rows = await sqlQuery(getUserProfileSql, { userObjectId });
  return rows?.[0] ?? null;
}

async function findUserProfileByActor(actorValue: string) {
  const actor = normalizeText(actorValue);
  if (!actor) return null;

  const rows = await sqlQuery(findUserProfileByActorSql, { actorValue: actor });
  return rows?.[0] ?? null;
}

async function getProfileName(user: any) {
  const userObjectId = actorObjectId(user);
  const profile = await getUserProfileByObjectId(userObjectId);

  return (
    profileDisplayName(profile) ||
    user?.name ||
    user?.email ||
    "Gebruiker"
  );
}

async function resolveReportSigner(item: any, answers: any, user: any) {
  const actorCandidates = [
    item?.submitted_by,
    item?.created_by,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  for (const actor of actorCandidates) {
    const profile = await findUserProfileByActor(String(actor));
    const userObjectId = normalizeText(profile?.user_object_id);
    if (!userObjectId) continue;

    const signatureDataUrl =
      String(profile?.signature_source_preference || "").toLowerCase() === "none"
        ? null
        : await getSignatureDataUrl(userObjectId);

    return {
      profileName: profileDisplayName(profile) || actor,
      signatureDataUrl,
      sourceActor: actor,
    };
  }

  return {
    profileName:
      firstText(
        answerText(answers, "onderhouder_naam", "Naamonderhouder", "Naam onderhouder"),
        item?.submitted_by,
        item?.created_by
      ) || await getProfileName(user),
    signatureDataUrl: null,
    sourceActor: null,
  };
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
      layout: fieldTableLayout({
        compact: !!options.compact,
      }),
      margin: options.margin || [0, 0, 0, 10],
    },
  ];
}

function fieldTableLayout(options: { compact?: boolean } = {}) {
  const padding = options.compact ? 4 : 6;

  return {
    hLineWidth: () => 0.6,
    vLineWidth: () => 0.6,
    hLineColor: () => "#d7dde6",
    vLineColor: () => "#d7dde6",
    paddingLeft: () => padding,
    paddingRight: () => padding,
    paddingTop: () => padding,
    paddingBottom: () => padding,
  };
}

function reportTableLayout() {
  return {
    hLineWidth: (i: number) => (i === 0 ? 0.8 : 0.6),
    vLineWidth: () => 0.6,
    hLineColor: () => "#cfd6df",
    vLineColor: () => "#cfd6df",
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  };
}

function fieldLabelCell(text: any) {
  return {
    text: valueText(text),
    style: "fieldLabel",
  };
}

function fieldValueCell(text: any, options: any = {}) {
  return {
    text: valueText(text),
    style: options.emphasis ? "fieldValueStrong" : "fieldValue",
  };
}

function blankFieldCell() {
  return {
    text: "",
    border: [false, false, false, false],
  };
}

function fieldGridSection(title: any, fields: any[], options: any = {}) {
  const cleanFields = (Array.isArray(fields) ? fields : []).filter(
    (field) => normalizeText(field?.label) && normalizeText(field?.value)
  );

  if (!cleanFields.length) return [];

  const body: any[] = [];

  for (let i = 0; i < cleanFields.length; i += 2) {
    const left = cleanFields[i];
    const right = cleanFields[i + 1] || null;

    body.push([
      fieldLabelCell(left.label),
      fieldValueCell(left.value, { emphasis: left.emphasis }),
      right ? fieldLabelCell(right.label) : blankFieldCell(),
      right ? fieldValueCell(right.value, { emphasis: right.emphasis }) : blankFieldCell(),
    ]);
  }

  return [
    {
      margin: options.margin || [0, 0, 0, 12],
      stack: [
        {
          text: valueText(title),
          style: "sectionBandTitle",
          margin: [0, 0, 0, 0],
        },
        {
          table: {
            widths: options.widths || [110, "*", 110, "*"],
            body,
          },
          layout: fieldTableLayout(),
        },
      ],
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

function buildGeneralInfoPages(item: any, answers: any, profileName: string) {
  const documentnummer = firstText(
    answers?.documentnummer,
    item?.form_instance_id
  );
  const onderhoudDatum = answerDateText(
    answers,
    "datum_onderhoud",
    "Datum_onderhoud_af_date",
    "datum onderhoud_2"
  );
  const opmaakDatum = firstText(
    answerDateText(answers, "datum_opmaak", "datum opmaak-v"),
    onderhoudDatum
  );
  const objectNaam = firstText(
    answerText(answers, "bouwwerk_naam", "installatie_naam"),
    item?.instance_title,
    item?.obj_naam,
    item?.installatie_naam
  );
  const objectAdres = buildAddress(item, answers);
  const gebruikerValue = joinNonEmpty([item?.gebruiker_code, item?.gebruiker_naam]);
  const beheerderValue = joinNonEmpty([item?.beheerder_code, item?.beheerder_naam]);
  const eigenaarValue = joinNonEmpty([item?.eigenaar_code, item?.eigenaar_naam]);
  const pveNummer = answerText(
    answers,
    "documentnummer_pve",
    "Documentnummer_PvE"
  );
  const pveDatum = answerDateText(
    answers,
    "datum_pve",
    "Datum_PvE_af_date"
  );
  const pveBedrijf = answerText(
    answers,
    "naam_bedrijf_pve",
    "Naam bedrijf_PvE"
  );
  const ontwerpNummer = answerText(
    answers,
    "tekeningnummer",
    "documentnummer_ontwerp_projectie"
  );
  const ontwerpDatum = answerDateText(
    answers,
    "datum_tekening",
    "Datum_Tekening_af_date"
  );
  const ontwerpBedrijf = answerText(
    answers,
    "naam_bedrijf_ontwerp_projectie",
    "Naam bedrijf_Ontwerp/Projectie"
  );
  const projecteringsdeskundige = answerText(
    answers,
    "naam_projecteringsdeskundige",
    "Naam projecteringsdeskundige"
  );
  const doormeldingBrand = joinNonEmpty([
    answerText(answers, "ontvangststation_doormelding_brand", "OntvangststationDoormelding brand"),
    answerText(answers, "telefoon_doormelding_brand", "TelefoonDoormelding brand"),
    answerText(answers, "meldcode_doormelding_brand", "MeldcodeDoormelding brand"),
  ], " ; ");
  const doormeldingStoring = joinNonEmpty([
    answerText(answers, "ontvangststation_doormelding_storing", "OntvangststationDoormelding storing"),
    answerText(answers, "telefoon_doormelding_storing", "TelefoonDoormelding storing"),
    answerText(answers, "meldcode_doormelding_storing", "MeldcodeDoormelding storing"),
  ], " ; ");

  const pageOneContent: any[] = [
    {
      text: "Gegevens",
      style: "chapterTitle",
      id: "gegevens",
    },
    ...fieldGridSection("Algemeen", [
      { label: "Documentnummer", value: documentnummer, emphasis: true },
      { label: "Datum onderhoud", value: onderhoudDatum },
      { label: "Datum opmaak", value: opmaakDatum },
      { label: "Status", value: statusLabel(item?.status) },
      { label: "Formulier", value: firstText(item?.form_name, item?.form_code) },
      { label: "Installatiecode", value: item?.atrium_installation_code },
    ]),
    ...fieldGridSection("Onderhoud", [
      { label: "Onderhoudsbedrijf BMI", value: answerText(answers, "onderhoudsbedrijf_naam", "Onderhoudsbedrijf BMI_", "NaamBrandmeldonderhoudsbedrijf") },
      { label: "Erkenningsnummer", value: firstText(answerText(answers, "erkenningsnummer", "Erkenningsnummer__"), "11008") },
      { label: "Naam onderhouder", value: firstText(answerText(answers, "onderhouder_naam", "Naamonderhouder", "Naam onderhouder_2"), profileName) },
      { label: "Opgesteld door", value: firstText(item?.submitted_by, item?.created_by) },
    ]),
    ...fieldGridSection("Bouwwerk", [
      { label: "Naam object", value: objectNaam },
      { label: "Adres", value: objectAdres },
      { label: "Gebruiker", value: gebruikerValue },
      { label: "Beheerder", value: beheerderValue },
      { label: "Eigenaar", value: eigenaarValue },
    ]),
  ];

  if (normalizeText(item?.instance_note)) {
    pageOneContent.push({
      text: valueText(item.instance_note),
      style: "noteBox",
      margin: [0, 2, 0, 0],
    });
  }

  const pageTwoSections: any[] = [
    ...fieldGridSection("Programma van Eisen", [
      { label: "Documentnummer", value: pveNummer },
      { label: "Datum", value: pveDatum },
      { label: "Naam bedrijf", value: pveBedrijf },
    ]),
    ...fieldGridSection("Ontwerp / projectie", [
      { label: "Documentnummer", value: ontwerpNummer },
      { label: "Datum", value: ontwerpDatum },
      { label: "Naam bedrijf", value: ontwerpBedrijf },
      { label: "Projecteringsdeskundige", value: projecteringsdeskundige },
    ]),
    ...fieldGridSection("Doormelding", [
      { label: "Brand", value: doormeldingBrand },
      { label: "Storing", value: doormeldingStoring },
    ]),
  ];

  if (!pageTwoSections.length) {
    return pageOneContent;
  }

  return [
    ...pageOneContent,
    {
      text: "Gegevens (vervolg)",
      style: "chapterTitle",
      pageBreak: "before",
      id: "gegevens_vervolg",
    },
    ...pageTwoSections,
  ];
}

function buildAppendixOverviewRows(answers: any) {
  const groups = Array.isArray(answers?.doc_groepen) ? answers.doc_groepen : [];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const rows: any[] = [];
  let rowIndex = 0;

  for (const group of groups) {
    const types = Array.isArray(group?.types) ? group.types : [];

    for (const type of types) {
      const docs = Array.isArray(type?.documents) ? type.documents : [];
      const docNumbers = Array.from(
        new Set(docs.map((doc: any) => valueText(doc?.doc_nummer)).filter(Boolean))
      ).join(", ");
      const docDates = Array.from(
        new Set(docs.map((doc: any) => formatDateValue(doc?.doc_datum)).filter(Boolean))
      ).join(", ");

      rows.push({
        appendix: letters[rowIndex] || String(rowIndex + 1),
        onderwerp: firstText(type?.doc_type_naam, group?.groep_naam, "Bijlage"),
        count: docs.length ? String(docs.length) : "",
        documentnummer: docNumbers,
        datum: docDates,
      });
      rowIndex += 1;
    }
  }

  return rows;
}

function appendixOverviewPage(answers: any) {
  const rows = buildAppendixOverviewRows(answers);

  const content: any[] = [
    {
      text: "Bijlageoverzicht",
      style: "chapterTitle",
      pageBreak: "before",
      id: "bijlagen",
    },
    {
      text: "Overzicht van de installatiedocumenten die aan deze rapportage ten grondslag liggen.",
      style: "bodyMuted",
      margin: [0, 0, 0, 12],
    },
  ];

  if (!rows.length) {
    content.push({
      text: "Geen installatiedocumenten beschikbaar.",
      style: "noteEmpty",
    });
    return content;
  }

  content.push({
    table: {
      headerRows: 1,
      widths: [40, "*", 42, 120, 74],
      body: [
        [
          { text: "Bijlage", style: "tableHeader" },
          { text: "Onderwerp", style: "tableHeader" },
          { text: "Aantal", style: "tableHeader" },
          { text: "Documentnummer", style: "tableHeader" },
          { text: "Datum", style: "tableHeader" },
        ],
        ...rows.map((row) => [
          { text: row.appendix, style: "tableCellCenter" },
          { text: row.onderwerp, style: "tableCell" },
          { text: row.count, style: "tableCellCenter" },
          { text: row.documentnummer, style: "tableCell" },
          { text: row.datum, style: "tableCell" },
        ]),
      ],
    },
    layout: reportTableLayout(),
  });

  return content;
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
        layout: reportTableLayout(),
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

function normalizeAssessmentValue(value: any) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;

  if (["ja", "yes", "y", "true", "1"].includes(raw)) {
    return { label: "Ja", style: "matrixChoiceYes" };
  }

  if (["nee", "no", "n", "false", "0"].includes(raw)) {
    return { label: "Nee", style: "matrixChoiceNo" };
  }

  if (["n.v.t.", "n.v.t", "nvt", "niet van toepassing"].includes(raw)) {
    return { label: "N.v.t.", style: "matrixChoiceNeutral" };
  }

  return null;
}

function matrixCellFor(columnName: string, rawValue: any) {
  const assessment = columnName.includes("voldoet")
    ? normalizeAssessmentValue(rawValue)
    : null;

  if (assessment) {
    return {
      text: assessment.label,
      style: assessment.style,
      alignment: "center",
    };
  }

  const text = valueText(rawValue);
  const isNo = String(rawValue || "").trim().toLowerCase() === "nee";

  return {
    text,
    style: isNo ? "negativeCell" : text ? "tableCell" : "tableCellMuted",
  };
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

  const title = labelForElement(element);
  const showTitle = title && !title.startsWith(name);

  const tableNode = {
    table: {
      headerRows: 1,
      keepWithHeaderRows: 1,
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
      body: [
        cols.map((c: any) => ({
          text: valueText(c.title || normalColumnName(c.name) || c.name),
          style: "tableHeader",
        })),
        ...cleanRows.map((row: any) =>
          cols.map((c: any) => matrixCellFor(String(c?.name || ""), row?.[c.name]))
        ),
      ],
    },
    layout: reportTableLayout(),
  };

  return [
    {
      stack: [
        ...(showTitle
          ? [
              {
                text: title,
                style: "subSectionTitle",
                margin: [0, 8, 0, 4],
              },
            ]
          : []),
        tableNode,
      ],
      unbreakable: cleanRows.length <= 8,
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
      layout: reportTableLayout(),
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
      const rendered = renderAdditionalRemarksPage(page, answers);
      if (rendered.length) content.push(...rendered);
      continue;
    }

    const elements = Array.isArray(page?.elements) ? page.elements : [];
    const rendered = elements.flatMap((el: any) => renderElement(el, answers));

    const hasRealContent = rendered.some((node: any) => {
      if (!node) return false;
      if (typeof node.text === "string" && node.text.trim()) return true;
      if (node.table) return true;
      if (node.stack && Array.isArray(node.stack) && node.stack.length > 0) return true;
      return false;
    });

    if (!hasRealContent) continue;

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
                      border: [false, false, false, false],
                    }))
                  : [
                      {
                        text: "Naam:",
                        style: "signatureField",
                        border: [false, false, false, false],
                      },
                    ],
              ],
            },
            layout: "noBorders",
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
    layout: reportTableLayout(),
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
      firstText(
        answerText(answers, "bouwwerk_straat", "Straat"),
        answerText(answers, "AdresEigenaargebruiker")
      ),
      [
        answerText(answers, "bouwwerk_postcode", "Postcode"),
        answerText(answers, "bouwwerk_plaats", "Plaats"),
      ]
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
  const mainTitle = firstText(cfg.coverMainTitle, "Rapport van Onderhoud") || "Rapport van Onderhoud";
  const subTitle = firstText(cfg.coverSubTitle, "Brandmeldinstallatie") || "Brandmeldinstallatie";
  const onderhoudDatum = answerDateText(
    answers,
    "datum_onderhoud",
    "Datum_onderhoud_af_date",
    "datum onderhoud_2"
  );
  const documentnummer = firstText(
    answers?.documentnummer,
    item.form_instance_id
  ) || "";
  const isDefinitief = String(item.status || "").toUpperCase() === "AFGEHANDELD";
  const objectNaam = firstText(
    answerText(answers, "bouwwerk_naam", "installatie_naam"),
    item.instance_title,
    item.obj_naam,
    item.installatie_naam
  ) || "Object";
  const adres = buildAddress(item, answers);
  const footerLeft = joinNonEmpty([
    item.form_name || surveyJson?.title || "Formulier",
    documentnummer,
  ], " · ");
  const createdOrSubmittedBy = firstText(item?.submitted_by, item?.created_by);

  return {
    pageSize: "A4",
    pageMargins: [36, 86, 36, 46],

    header(currentPage: number) {
      if (currentPage === 1) return {};

      return {
        margin: [36, 18, 36, 0],
        stack: [
          {
            columns: [
              logoDataUrl
                ? {
                    image: logoDataUrl,
                    width: 96,
                    margin: [0, 0, 10, 0],
                  }
                : {
                    width: 96,
                    text: "",
                  },
              {
                width: "*",
                stack: [
                  { text: mainTitle, style: "headerTitle" },
                  { text: subTitle, style: "headerSubTitle" },
                ],
              },
              {
                width: 180,
                stack: [
                  { text: objectNaam, style: "headerMetaStrong", alignment: "right" },
                  ...(adres
                    ? [{ text: adres, style: "headerMeta", alignment: "right" }]
                    : []),
                  {
                    text: joinNonEmpty([
                      statusLabel(item.status),
                      documentnummer ? `nr. ${documentnummer}` : null,
                    ], " · "),
                    style: "headerMeta",
                    alignment: "right",
                  },
                ],
              },
            ],
            columnGap: 14,
          },
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 9,
                x2: 523,
                y2: 9,
                lineWidth: 0.8,
                lineColor: "#d7dde6",
              },
            ],
          },
        ],
      };
    },

    footer(currentPage: number, pageCount: number) {
      return {
        columns: [
          { text: footerLeft, style: "footerText" },
          { text: `Pagina ${currentPage} van ${pageCount}`, alignment: "right", style: "footerText" },
        ],
        margin: [36, 0, 36, 16],
      };
    },

    content: [
      { text: "", id: "cover" },

      {
        text: !isDefinitief ? "CONCEPT-VERSIE!\nNIET GESCHIKT VOOR EXTERNE COMMUNICATIE" : "",
        style: "coverConcept",
        margin: [0, 18, 0, 0],
      },

      { text: mainTitle, style: "coverMainTitle" },
      { text: subTitle, style: "coverSubTitle" },

      {
        stack: [
          {
            text: objectNaam,
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
          ["Onderhoudsbedrijf BMI", answerText(answers, "onderhoudsbedrijf_naam", "Onderhoudsbedrijf BMI_", "NaamBrandmeldonderhoudsbedrijf")],
          ["Erkenningsnummer", firstText(answerText(answers, "erkenningsnummer", "Erkenningsnummer__"), "11008")],
          ["Datum onderhoud", onderhoudDatum],
          ["Naam onderhouder", profileName],
          ["Datum opmaak", firstText(answerDateText(answers, "datum_opmaak", "datum opmaak-v"), onderhoudDatum)],
          ["Documentnummer", documentnummer],
          ["Opgesteld door", createdOrSubmittedBy],
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

      ...buildGeneralInfoPages(item, answers, profileName),

      ...appendixOverviewPage(answers),

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

      headerTitle: { fontSize: 14, bold: true, color: DARK },
      headerSubTitle: { fontSize: 9.5, color: MID, margin: [0, 2, 0, 0] },
      headerMetaStrong: { fontSize: 9, bold: true, color: DARK },
      headerMeta: { fontSize: 8, color: MID, margin: [0, 2, 0, 0] },

      chapterTitle: { fontSize: 18, bold: true, color: DARK, margin: [0, 0, 0, 12] },
      sectionTitle: { fontSize: 12, bold: true, color: DARK },
      subSectionTitle: { fontSize: 10, bold: true, color: MID },
      sectionBandTitle: {
        fontSize: 10,
        bold: true,
        color: DARK,
        fillColor: "#e8edf4",
        margin: [0, 0, 0, 0],
      },

      tableHeader: { bold: true, color: "#ffffff", fillColor: MID, fontSize: 8 },
      tableCell: { fontSize: 8.25, color: DARK },
      tableCellMuted: { fontSize: 8.25, color: "#8a94a3" },
      tableCellCenter: { fontSize: 8.25, color: DARK, alignment: "center" },
      negativeCell: { fontSize: 8.25, bold: true, color: BRAND_RED },
      matrixChoiceYes: { fontSize: 8, bold: true, color: "#0f5132", fillColor: "#dff3e4" },
      matrixChoiceNo: { fontSize: 8, bold: true, color: "#842029", fillColor: "#f8d7da" },
      matrixChoiceNeutral: { fontSize: 8, bold: true, color: "#495057", fillColor: "#eef1f4" },

      kvLabel: { bold: true, color: MID, fontSize: 9, fillColor: "#eef2f6" },
      kvValue: { color: DARK, fontSize: 9 },
      kvLabelCompact: { bold: true, color: MID, fontSize: 8.5, fillColor: "#eef2f6" },
      kvValueCompact: { color: DARK, fontSize: 8.5 },
      fieldLabel: { fontSize: 8.25, bold: true, color: MID, fillColor: "#eef2f6" },
      fieldValue: { fontSize: 8.5, color: DARK },
      fieldValueStrong: { fontSize: 8.5, bold: true, color: DARK },

      tocNr: { bold: true, color: BRAND_RED, fontSize: 10 },
      tocText: { color: DARK, fontSize: 10 },

      noteBox: { fontSize: 9, color: "#333333", fillColor: "#f5f5f5", margin: [0, 4, 0, 0] },
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
  const signer = await resolveReportSigner(item, answers, user);
  const profileName = signer.profileName;
  const signatureDataUrl = signer.signatureDataUrl;

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
