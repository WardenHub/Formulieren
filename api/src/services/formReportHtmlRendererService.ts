import type { Browser } from "playwright";
import { PDFDocument } from "pdf-lib";

import { buildFormReportResult, formatExportDate } from "./formReportExportModelService.js";

let browserPromise: Promise<Browser> | null = null;

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value: any) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function normalizeToken(value: any) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "");
}

function normalizeColumnToken(value: any) {
  return normalizeToken(value).replace(/[^A-Z0-9]/g, "");
}

function firstText(...values: any[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function versionLabel(value: any) {
  const text = normalizeText(value);
  if (!text) return "";
  return /^v/i.test(text) ? text : `v${text}`;
}

function compactVersionLabel(value: any) {
  const label = versionLabel(value);
  if (!label) return "";
  return label.replace(/^v(\d+)\.0$/i, "v$1");
}

function joinNonEmpty(values: any[], separator = " ; ") {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(separator);
}

function textValue(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nee";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  return "";
}

function displayText(value: any, fallback = "-") {
  const text = textValue(value);
  return normalizeText(text) || fallback;
}

function prettifyKey(value: any) {
  const raw = normalizeText(value);
  if (!raw) return "";
  return raw
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function stripHtml(value: any) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
}

function answerFor(answers: any, ...names: any[]) {
  for (const name of names) {
    const key = normalizeText(name);
    if (!key) continue;
    if (answers && Object.prototype.hasOwnProperty.call(answers, key)) {
      return answers[key];
    }
  }
  return undefined;
}

function answerText(answers: any, ...names: any[]) {
  for (const name of names) {
    const value = answerFor(answers, name);
    const text = textValue(value);
    if (normalizeText(text)) return text;
  }
  return "";
}

function answerDateText(answers: any, ...names: any[]) {
  for (const name of names) {
    const value = answerFor(answers, name);
    const text = formatExportDate(value);
    if (normalizeText(text)) return text;
  }
  return "";
}

function reportConfig(model: any) {
  return model?.surveyJson?.ember?.report || {};
}

function activeDisciplines(model: any) {
  const configured = reportConfig(model)?.activeDisciplines;
  return Array.isArray(configured) && configured.length
    ? configured.map((value: any) => String(value || "").trim()).filter(Boolean)
    : ["brandbeveiliging", "service_onderhoud"];
}

function isCertifiedMaintenanceReport(model: any) {
  return normalizeToken(model?.form?.document_profile_key) === "CERTIFIED_MAINTENANCE_REPORT";
}

function footerLeftLabel(model: any) {
  const formVersion = versionLabel(
    firstText(model?.form?.version_label, model?.form?.version, model?.form?.form_version)
  );
  const compactVersion = firstText(compactVersionLabel(formVersion), "v1");
  const officialNumber = normalizeText(model?.form?.official_document_number);
  const formName = firstText(model?.form?.name, model?.surveyJson?.title, "Formulier");
  const formNumber = firstText(model?.form?.id);

  return [
    officialNumber,
    formName,
    formNumber,
    compactVersion,
  ]
    .filter(Boolean)
    .join(" · ");
}

function isPrintableCustomerText(value: any) {
  const text = normalizeText(stripHtml(value)).toLowerCase();
  if (!text) return false;

  const blockedPatterns = [
    /de gegevens voor de calculaties zijn automatisch overgenomen uit de installatiepagina/i,
    /leg hieronder de perioden vast waarin melders niet beschikbaar waren/i,
    /gebruik daarna bovenaan voorinvulling vernieuwen/i,
    /nieuwe energievoorzieningen voeg je toe bij de installatie/i,
    /open installatie/i,
  ];

  return !blockedPatterns.some((pattern) => pattern.test(text));
}

function shouldHideGeneratedSubsectionTitle(value: any) {
  const token = normalizeToken(value);
  if (!token) return true;

  return [
    /ITEMS$/,
    /^BIJLAGE[A-Z0-9]*ITEMS$/,
    /^STUURFUNCTIEMATRIXDOCS[A-Z0-9]*$/,
    /^OVERIGITEMS$/,
    /^AANVULLENDEOPMERKINGENITEMS$/,
    /^ESHEADER$/,
  ].some((pattern) => pattern.test(token));
}

function isLandscapeSurveyPage(page: any) {
  const text = `${normalizeText(page?.title)} ${normalizeText(page?.name)}`.toLowerCase();
  return (
    text.includes("prestatie-eisen") ||
    text.includes("meetresultaten") ||
    text.includes("systeembeschikbaarheid")
  );
}

function coverDisciplineOrder() {
  return [
    "brandbeveiliging",
    "inbraakbeveiliging",
    "camera",
    "toegangscontrole",
    "telecom_zorg",
    "service_onderhoud",
  ];
}

function renderCoverIcons(model: any) {
  const icons = model?.assets?.disciplineIcons || {};
  const active = new Set(activeDisciplines(model));

  return `
    <div class="cover-icon-grid">
      ${coverDisciplineOrder()
        .map((key) => {
          const item = icons?.[key];
          const isActive = active.has(key);
          const image = isActive ? item?.colorDataUrl : item?.grayDataUrl;
          const label = firstText(item?.label, prettifyKey(key));

          return `
            <div class="cover-icon-card ${isActive ? "is-active" : "is-inactive"}">
              <div class="cover-icon-media">
                ${
                  image
                    ? `<img src="${image}" alt="${escapeHtml(label)}" />`
                    : `<div class="cover-icon-fallback"></div>`
                }
              </div>
              <div class="cover-icon-label">${escapeHtml(label)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildAddress(model: any) {
  const answers = model?.answers || {};
  return (
    [
      firstText(
        answerText(answers, "bouwwerk_straat", "Straat"),
        model?.installation?.formatted_address
      ),
      joinNonEmpty(
        [
          answerText(answers, "bouwwerk_postcode", "Postcode"),
          answerText(answers, "bouwwerk_plaats", "Plaats"),
        ],
        " "
      ),
    ]
      .filter(Boolean)
      .join(", ") || firstText(model?.installation?.formatted_address)
  );
}

function pdfHeaderTitles(model: any) {
  const cfg = reportConfig(model);
  const title = firstText(cfg.coverMainTitle, "Rapport van Onderhoud");
  const subtitle = firstText(cfg.coverSubTitle, model?.form?.name, model?.surveyJson?.title);

  if (normalizeToken(title) === normalizeToken(subtitle)) {
    return { title: subtitle, subtitle: "" };
  }

  return { title, subtitle };
}

function visibleSurveyPages(model: any) {
  const pages = Array.isArray(model?.surveyJson?.pages) ? model.surveyJson.pages : [];
  return pages.filter((page: any) => {
    const pageName = normalizeToken(page?.name);
    const pageTitle = normalizeToken(page?.title);
    if (!pageName && !pageTitle) return false;
    if (pageName === "DOCUMENTEN" || pageTitle === "DOCUMENTEN") return false;
    if (pageName === "GEGEVENS" || pageTitle === "GEGEVENS") return false;
    if (pageName === "GEGEVENSVERVOLG" || pageTitle === "GEGEVENSVERVOLG") return false;
    return true;
  });
}

function nonEmptyRows(rows: Array<{ label: string; value: any }>) {
  return rows.filter((row) => normalizeText(row?.label));
}

function renderValueCell(value: any) {
  if (Array.isArray(value)) {
    if (!value.length) return `<span class="muted">-</span>`;
    return `<ul class="value-list">${value
      .map((item) => `<li>${renderValueCell(item)}</li>`)
      .join("")}</ul>`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, itemValue]) => {
      if (Array.isArray(itemValue)) return itemValue.length > 0;
      if (itemValue && typeof itemValue === "object") return Object.keys(itemValue).length > 0;
      return normalizeText(textValue(itemValue)).length > 0;
    });

    if (!entries.length) return `<span class="muted">-</span>`;

    return `
      <div class="object-grid">
        ${entries
          .map(
            ([key, itemValue]) => `
              <div class="object-row">
                <div class="object-key">${escapeHtml(prettifyKey(key))}</div>
                <div class="object-value">${renderValueCell(itemValue)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  const text = normalizeText(textValue(value));
  return text ? escapeHtml(text) : `<span class="muted">-</span>`;
}

function renderInfoSection(title: string, rows: Array<{ label: string; value: any }>) {
  const safeRows = nonEmptyRows(rows);
  if (!safeRows.length) return "";

  return `
    <section class="info-section">
      <div class="section-heading">${escapeHtml(title)}</div>
      <div class="info-grid">
        ${safeRows
          .map(
            (row) => `
              <div class="info-card">
                <div class="info-label">${escapeHtml(row.label)}</div>
                <div class="info-value">${renderValueCell(row.value)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSummaryBand(model: any) {
  const summary = model?.followUps?.summary || {};
  const items = [
    { label: "Workflow open", value: Number(summary.open_count ?? 0) },
    { label: "Workflow afgerond", value: Number(summary.terminal_count ?? 0) },
    { label: "Rapportopmerkingen", value: Number(summary.informative_count ?? 0) },
    { label: "Workflow totaal", value: Number(summary.relevant_count ?? 0) },
  ];

  return `
    <section class="summary-band">
      ${items
        .map(
          (item) => `
            <div class="summary-item">
              <div class="summary-label">${escapeHtml(item.label)}</div>
              <div class="summary-value">${escapeHtml(String(item.value))}</div>
            </div>
          `
        )
        .join("")}
    </section>
  `;
}

function normalizedStatusLabel(value: any) {
  const token = normalizeToken(value);
  if (token === "OPEN") return "Open";
  if (token === "PLANNING_NODIG") return "Planning nodig";
  if (token === "WACHTENOPDERDEN") return "Wachten op derden";
  if (token === "GEPLAND") return "Gepland";
  if (token === "AFGEHANDELD") return "Afgehandeld";
  if (token === "AFGEWEZEN") return "Afgewezen";
  if (token === "VERVALLEN") return "Vervallen";
  if (token === "INGEDIEND") return "Ingediend";
  if (token === "INBEHANDELING") return "In behandeling";
  if (token === "CONCEPT") return "Concept";
  return displayText(value);
}

function effectiveCertificateImpact(item: any) {
  return normalizeToken(item?.effective_certificate_impact || item?.certificate_impact_override || item?.certificate_impact);
}

function isWorkflow(item: any) {
  return normalizeToken(item?.kind) === "WORKFLOW";
}

function isReportOnly(item: any) {
  return normalizeToken(item?.kind) === "REPORT-ONLY";
}

function isOpenWorkflow(item: any) {
  const status = normalizeToken(item?.status);
  return (
    isWorkflow(item) &&
    (status === "OPEN" || status === "PLANNING_NODIG" || status === "WACHTENOPDERDEN")
  );
}

function isResolvedWorkflow(item: any) {
  if (!isWorkflow(item)) return false;
  const status = normalizeToken(item?.status);
  const outcome = normalizeToken(item?.resolution_outcome);

  if (
    status === "OPEN" ||
    status === "PLANNING_NODIG" ||
    status === "WACHTENOPDERDEN" ||
    status === "GEPLAND"
  ) {
    return false;
  }
  if (outcome === "OPGELOST") return true;

  return false;
}

function blockingJudgementItems(model: any) {
  const items = Array.isArray(model?.followUps?.items) ? model.followUps.items : [];
  return items.filter((item: any) => {
    if (!isWorkflow(item)) return false;
    if (effectiveCertificateImpact(item) !== "YES") return false;
    return !isResolvedWorkflow(item);
  });
}

function reportOnlyItems(model: any) {
  const items = Array.isArray(model?.followUps?.items) ? model.followUps.items : [];
  return items.filter((item: any) => isReportOnly(item));
}

function workflowItems(model: any) {
  const items = Array.isArray(model?.followUps?.items) ? model.followUps.items : [];
  return items.filter((item: any) => isWorkflow(item));
}

function renderCoverPage(model: any) {
  const cfg = reportConfig(model);
  const reportTitle = firstText(cfg.coverMainTitle, "Rapport van Onderhoud");
  const reportSubTitle = firstText(cfg.coverSubTitle, model?.form?.name, model?.surveyJson?.title);
  const coverHeading = firstText(reportSubTitle, reportTitle);
  const objectTitle = firstText(
    model?.installation?.installation_name,
    model?.installation?.object_name,
    model?.form?.title,
    "Installatie"
  );
  const address = buildAddress(model);
  const isFinal = normalizeToken(model?.form?.status) === "AFGEHANDELD";
  const blockingItems = blockingJudgementItems(model);

  const metaRows = [
    { label: "Installatiecode", value: model?.form?.atrium_installation_code },
    { label: "Onderhoudsdatum", value: firstText(answerDateText(model?.answers, "datum_onderhoud", "Datum_onderhoud_af_date"), "-") },
    { label: "Status", value: normalizedStatusLabel(model?.form?.status) },
    { label: "Documentnummer", value: firstText(model?.form?.official_document_number, model?.form?.id, "-") },
  ];

  return `
    <main class="cover-page">
      <div class="cover-top"></div>

      <div class="cover-title-block">
        <div class="cover-title-logo">${model?.assets?.logoDataUrl ? `<img src="${model.assets.logoDataUrl}" alt="Bedrijfslogo" />` : ""}</div>
        <h1>${escapeHtml(coverHeading)}</h1>
        <div class="cover-object">${escapeHtml(objectTitle)}</div>
        ${address ? `<div class="cover-address">${escapeHtml(address)}</div>` : ""}
      </div>

      <div class="cover-spacer"></div>

      ${renderCoverIcons(model)}

      <div class="cover-bottom">
        ${
          !isFinal
            ? `<div class="cover-note is-concept">Conceptrapport; dit rapport is nog niet definitief afgerond.</div>`
            : ""
        }
        ${
          blockingItems.length
            ? `<div class="cover-note is-warning">Definitief oordeel nog niet mogelijk; er staan nog certificaatblokkerende actiepunten open.</div>`
            : ""
        }
        <div class="cover-facts-list">
          ${metaRows
            .map(
              (row) => `
                <div class="cover-fact-row">
                  <div class="cover-fact-label">${escapeHtml(row.label)}</div>
                  <div class="cover-fact-value">${escapeHtml(displayText(row.value))}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </main>
  `;
}

function renderOverviewPages(model: any) {
  const answers = model?.answers || {};
  const objectNaam = firstText(
    answerText(answers, "bouwwerk_naam", "installatie_naam"),
    model?.installation?.object_name,
    model?.installation?.installation_name
  );
  const objectAdres = buildAddress(model);

  const generalPage = `
    <section class="page-break-before report-page">
      <div class="page-title">Gegevens</div>
      ${renderInfoSection("Algemeen", [
        { label: "Documentnummer", value: firstText(answers?.documentnummer, model?.form?.official_document_number, model?.formInstanceId) },
        { label: "Datum onderhoud", value: answerDateText(answers, "datum_onderhoud", "Datum_onderhoud_af_date", "datum onderhoud_2") },
        { label: "Datum opmaak", value: firstText(answerDateText(answers, "datum_opmaak", "datum opmaak-v"), answerDateText(answers, "datum_onderhoud", "Datum_onderhoud_af_date", "datum onderhoud_2")) },
        { label: "Status", value: normalizedStatusLabel(model?.form?.status) },
        { label: "Formulier", value: firstText(model?.form?.name, model?.form?.code) },
        { label: "Installatiecode", value: model?.form?.atrium_installation_code },
      ])}
      ${renderInfoSection("Onderhoud", [
        { label: "Onderhoudsbedrijf BMI", value: answerText(answers, "onderhoudsbedrijf_naam", "Onderhoudsbedrijf BMI_", "NaamBrandmeldonderhoudsbedrijf") },
        { label: "Erkenningsnummer", value: firstText(answerText(answers, "erkenningsnummer", "Erkenningsnummer__"), "11008") },
        { label: "Naam onderhouder", value: firstText(answerText(answers, "onderhouder_naam", "Naamonderhouder", "Naam onderhouder_2"), model?.signer?.profileName, model?.viewer?.profile_name) },
        { label: "Opgesteld door", value: firstText(model?.item?.submitted_by, model?.item?.created_by) },
      ])}
      ${renderInfoSection("Bouwwerk", [
        { label: "Naam object", value: objectNaam },
        { label: "Adres", value: objectAdres },
        { label: "Gebruiker", value: joinNonEmpty([model?.installation?.gebruiker_code, model?.installation?.gebruiker_naam]) },
        { label: "Beheerder", value: joinNonEmpty([model?.installation?.beheerder_code, model?.installation?.beheerder_naam]) },
        { label: "Eigenaar", value: joinNonEmpty([model?.installation?.eigenaar_code, model?.installation?.eigenaar_naam]) },
      ])}
      ${normalizeText(model?.form?.note) ? `<div class="body-note">${escapeHtml(model.form.note)}</div>` : ""}
    </section>
  `;

  const vervolgSections = [
    renderInfoSection("Programma van Eisen", [
      { label: "Documentnummer", value: answerText(answers, "documentnummer_pve", "Documentnummer_PvE") },
      { label: "Datum", value: answerDateText(answers, "datum_pve", "Datum_PvE_af_date") },
      { label: "Naam bedrijf", value: answerText(answers, "naam_bedrijf_pve", "Naam bedrijf_PvE") },
    ]),
    renderInfoSection("Ontwerp / projectie", [
      { label: "Documentnummer", value: answerText(answers, "tekeningnummer", "documentnummer_ontwerp_projectie") },
      { label: "Datum", value: answerDateText(answers, "datum_tekening", "Datum_Tekening_af_date") },
      { label: "Naam bedrijf", value: answerText(answers, "naam_bedrijf_ontwerp_projectie", "Naam bedrijf_Ontwerp/Projectie") },
      { label: "Projecteringsdeskundige", value: answerText(answers, "naam_projecteringsdeskundige", "Naam projecteringsdeskundige") },
    ]),
    renderInfoSection("Doormelding", [
      {
        label: "Brand",
        value: joinNonEmpty(
          [
            answerText(answers, "ontvangststation_doormelding_brand", "OntvangststationDoormelding brand"),
            answerText(answers, "telefoon_doormelding_brand", "TelefoonDoormelding brand"),
            answerText(answers, "meldcode_doormelding_brand", "MeldcodeDoormelding brand"),
          ],
          " ; "
        ),
      },
      {
        label: "Storing",
        value: joinNonEmpty(
          [
            answerText(answers, "ontvangststation_doormelding_storing", "OntvangststationDoormelding storing"),
            answerText(answers, "telefoon_doormelding_storing", "TelefoonDoormelding storing"),
            answerText(answers, "meldcode_doormelding_storing", "MeldcodeDoormelding storing"),
          ],
          " ; "
        ),
      },
    ]),
  ]
    .filter(Boolean)
    .join("");

  const vervolgPage = vervolgSections
    ? `
      <section class="page-break-before report-page">
        <div class="page-title">Gegevens (vervolg)</div>
        ${vervolgSections}
      </section>
    `
    : "";

  return `${generalPage}${vervolgPage}`;
}

function renderAppendixOverviewPage(model: any) {
  const groups = Array.isArray(model?.installationDocuments?.groups) ? model.installationDocuments.groups : [];
  const rows = groups.flatMap((group: any) => {
    const docs = Array.isArray(group?.items) ? group.items : [];
    const documentNumbers = Array.from(new Set(docs.map((doc: any) => normalizeText(doc?.document_number)).filter(Boolean))).join(", ");
    const documentDates = Array.from(new Set(docs.map((doc: any) => formatExportDate(doc?.document_date)).filter(Boolean))).join(", ");

    return [
      {
        onderwerp: firstText(group?.name, "Bijlage"),
        count: docs.length || 0,
        documentNumbers,
        documentDates,
      },
    ];
  });

  return `
    <section class="page-break-before report-page">
      <div class="page-title">Bijlageoverzicht</div>
      <div class="page-intro">Overzicht van de installatiedocumenten die aan deze rapportage ten grondslag liggen.</div>
      ${
        rows.length
          ? `
            <table class="report-table appendix-table">
              <thead>
                <tr>
                  <th>Onderwerp</th>
                  <th>Aantal</th>
                  <th>Documentnummer</th>
                  <th>Datum</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(displayText(row.onderwerp))}</td>
                        <td class="align-center">${escapeHtml(String(row.count))}</td>
                        <td>${escapeHtml(displayText(row.documentNumbers))}</td>
                        <td>${escapeHtml(displayText(row.documentDates))}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          `
          : `<div class="empty-box">Geen installatiedocumenten beschikbaar.</div>`
      }
    </section>
  `;
}

function labelForElement(element: any) {
  return firstText(element?.title, prettifyKey(element?.name));
}

function renderSimpleField(label: string, value: any, options: { wide?: boolean } = {}) {
  const isLongLabel = !options.wide && normalizeText(label).length > 42;
  return `
    <div class="field-card ${options.wide ? "wide" : ""} ${isLongLabel ? "long-label" : ""}">
      ${
        options.wide
          ? `
            <div class="field-label">${escapeHtml(label)}</div>
            <div class="field-value">${renderValueCell(value)}</div>
          `
          : `
            <div class="field-label-inline">${escapeHtml(label)}</div>
            <div class="field-value-inline">${renderValueCell(value)}</div>
          `
      }
    </div>
  `;
}

function renderFullWidthSimpleFieldTable(label: string, value: any, dividerPercent: number) {
  const safeDivider = Math.max(20, Math.min(80, Number(dividerPercent) || 40));
  return `
    <table class="report-table single-field-table">
      <colgroup>
        <col style="width:${safeDivider}%">
        <col style="width:${100 - safeDivider}%">
      </colgroup>
      <tbody>
        <tr>
          <th>${escapeHtml(label)}</th>
          <td>${renderValueCell(value)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function splitColumnIndexForMatrixColumns(columns: any[]) {
  const firstVoldoetIndex = columns.findIndex((column: any) => normalizeColumnToken(column?.name).includes("VOLDOET"));
  if (firstVoldoetIndex > 0) return firstVoldoetIndex;

  const firstMetricIndex = columns.findIndex((column: any) => {
    const token = normalizeColumnToken(column?.name);
    return token === "A" || token === "H" || token === "V" || token === "L" || token === "ASP" || token === "INTERN" || token === "EXTERN" || token.includes("MAX");
  });
  if (firstMetricIndex > 0) return firstMetricIndex;

  const firstOpmerkingIndex = columns.findIndex((column: any) => normalizeColumnToken(column?.name).includes("OPMERKING"));
  if (firstOpmerkingIndex > 0) return firstOpmerkingIndex;

  return columns.length >= 2 ? 1 : null;
}

function renderAlignedSimpleFieldTable(label: string, value: any, referenceMatrix: any) {
  if (!referenceMatrix || normalizeText(referenceMatrix?.type).toLowerCase() !== "matrixdynamic") return "";

  const columns = matrixColumns(referenceMatrix);
  const splitIndex = splitColumnIndexForMatrixColumns(columns);
  if (!columns.length || !splitIndex || splitIndex >= columns.length) return "";

  return `
    <table class="report-table single-field-table">
      <colgroup>
        ${columns.map((column: any) => `<col style="width:${matrixColumnWidth(column, columns.length)}">`).join("")}
      </colgroup>
      <tbody>
        <tr>
          <th colspan="${splitIndex}">${escapeHtml(label)}</th>
          <td colspan="${columns.length - splitIndex}">${renderValueCell(value)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function sumColumnWidths(columns: any[]) {
  return columns.reduce((total: number, column: any) => {
    const widthText = String(matrixColumnWidth(column, columns.length) || "").replace("%", "").trim();
    const width = Number(widthText);
    return total + (Number.isFinite(width) ? width : 0);
  }, 0);
}

function normalizedPercentBefore(columns: any[], endExclusive: number) {
  const totalWidth = sumColumnWidths(columns);
  if (!totalWidth) return null;
  return (sumColumnWidths(columns.slice(0, endExclusive)) / totalWidth) * 100;
}

function percentWidth(value: any) {
  const widthText = String(value || "").replace("%", "").trim();
  const width = Number(widthText);
  return Number.isFinite(width) ? width : null;
}

function dividerPercentForMatrix(element: any) {
  if (!element || normalizeText(element?.type).toLowerCase() !== "matrixdynamic") {
    return null;
  }

  const columns = matrixColumns(element);
  if (!columns.length) return null;

  const splitIndex = splitColumnIndexForMatrixColumns(columns);
  return splitIndex ? normalizedPercentBefore(columns, splitIndex) ?? sumColumnWidths(columns.slice(0, splitIndex)) : 40;
}

function alignmentMatrixForAdjacent(previousElement: any, nextElement: any) {
  if (nextElement && normalizeText(nextElement?.type).toLowerCase() === "matrixdynamic") return nextElement;
  if (previousElement && normalizeText(previousElement?.type).toLowerCase() === "matrixdynamic") return previousElement;
  return null;
}

function alignmentPercentForAdjacentMatrix(previousElement: any, nextElement: any) {
  return dividerPercentForMatrix(alignmentMatrixForAdjacent(previousElement, nextElement)) ?? 40;
}

function matrixRows(element: any, answers: any) {
  const rows = answerFor(answers, element?.name);
  if (Array.isArray(rows)) return rows;
  if (Array.isArray(element?.defaultValue)) return element.defaultValue;
  return [];
}

function matrixColumns(element: any) {
  const explicitColumns = Array.isArray(element?.columns) ? element.columns.filter((column: any) => column?.visible !== false) : [];
  const fallbackColumns = [
    { name: "item_code", title: "Nr" },
    { name: "onderwerp", title: "Onderwerp" },
    { name: "voldoet", title: "Voldoet" },
    { name: "opmerking", title: "Opmerking" },
  ];
  return (explicitColumns.length ? explicitColumns : fallbackColumns).filter((column: any) => normalizeText(column?.name) && normalizeColumnToken(column?.name) !== "DOCTYPE");
}

function matrixColumnWidth(column: any, totalColumns: number) {
  const name = normalizeColumnToken(column?.name);
  const explicitWidth = percentWidth(column?.width);
  if (explicitWidth && explicitWidth > 0) {
    if (name.includes("ITEMCODE")) return `${Math.max(12, explicitWidth)}%`;
    if (name.includes("VOLDOET")) return `${Math.max(18, explicitWidth)}%`;
    if (name.includes("OPMERKING")) return `${Math.max(24, explicitWidth)}%`;
    if (name.includes("ONDERWERP") || name.includes("OMSCHRIJVING")) return `${Math.max(30, explicitWidth)}%`;
    return `${explicitWidth}%`;
  }

  if (name.includes("ITEMCODE")) return "12%";
  if (name.includes("VOLDOET")) return "18%";
  if (name.includes("OPMERKING")) return "30%";
  if (name.includes("GEBRUIKERSFUNCTIE")) return "12%";
  if (name === "LABEL") return "12%";
  if (name.includes("DOORMELDING")) return "13%";
  if (name === "A" || name === "H" || name === "V" || name === "L" || name === "ASP") return "7%";
  if (name === "INTERN" || name === "EXTERN") return "10%";
  if (name.includes("MAX")) return "10%";
  if (name.includes("ONDERWERP") || name.includes("OMSCHRIJVING")) return "42%";
  return `${Math.max(5, Math.floor(100 / Math.max(totalColumns, 1)))}%`;
}

function renderAssessmentChip(value: any) {
  const token = normalizeToken(value);
  const label = token === "NVT" ? "N.V.T." : displayText(value);
  const className =
    token === "JA" ? "is-yes" : token === "NEE" ? "is-no" : token === "NVT" ? "is-neutral" : "";
  return `<span class="assessment-chip ${className}">${escapeHtml(label)}</span>`;
}

function renderMatrixCell(column: any, row: any) {
  const columnName = normalizeColumnToken(column?.name);
  const value = row?.[column?.name];
  if (columnName.includes("VOLDOET")) {
    return `<td class="align-center">${renderAssessmentChip(value)}</td>`;
  }
  if (columnName.includes("ITEMCODE")) {
    return `<td class="align-center item-code-cell">${escapeHtml(displayText(value))}</td>`;
  }
  return `<td>${renderValueCell(value)}</td>`;
}

function isPrintableMatrixRow(row: any, columns: any[]) {
  if (!row || typeof row !== "object") return false;

  const topicColumns = columns.filter((column: any) => {
    const token = normalizeColumnToken(column?.name);
    return token.includes("ONDERWERP") || token.includes("OMSCHRIJVING") || token === "TITEL";
  });

  if (topicColumns.length && !topicColumns.some((column: any) => normalizeText(row?.[column?.name]))) {
    return false;
  }

  return columns.some((column: any) => {
    const token = normalizeColumnToken(column?.name);
    if (token === "DOCTYPE") return false;
    if (token.includes("ITEMCODE") || token === "NR" || token === "NUMMER") return false;
    return Boolean(normalizeText(row?.[column?.name]));
  });
}

function renderMatrixTableMarkup(columns: any[], rows: any[]) {
  return `
    <table class="report-table matrix-table">
      <colgroup>
        ${columns.map((column: any) => `<col style="width:${matrixColumnWidth(column, columns.length)}">`).join("")}
      </colgroup>
      <thead>
        <tr>
          ${columns.map((column: any) => `<th>${escapeHtml(displayText(column?.title || prettifyKey(column?.name)))}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row: any) => `
              <tr>
                ${columns.map((column: any) => renderMatrixCell(column, row)).join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderMatrixTable(element: any, answers: any, options: { nested?: boolean } = {}) {
  const columns = matrixColumns(element);
  const rows = matrixRows(element, answers)
    .filter((row: any) => isPrintableMatrixRow(row, columns));
  if (!rows.length) return "";

  const title = labelForElement(element);
  const visibleTitle = shouldHideGeneratedSubsectionTitle(title) ? "" : title;
  const isPrestatieEisenMatrix =
    columns.some((column: any) => normalizeColumnToken(column?.name).includes("GEBRUIKERSFUNCTIE")) &&
    columns.some((column: any) => normalizeColumnToken(column?.name) === "A") &&
    columns.some((column: any) => normalizeColumnToken(column?.name) === "ASP");

  const shouldSplitWideMatrix = columns.length >= 9;
  const keyColumns = shouldSplitWideMatrix
    ? isPrestatieEisenMatrix
      ? columns.filter((column: any) => {
          const token = normalizeColumnToken(column?.name);
          return token.includes("GEBRUIKERSFUNCTIE") || token === "LABEL";
        })
      : columns.filter((column: any) => {
          const token = normalizeColumnToken(column?.name);
          return token.includes("ITEMCODE") || token === "ONDERWERP" || token.includes("GEBRUIKERSFUNCTIE") || token === "LABEL" || token.includes("DOORMELDING");
        })
    : [];
  const baseKeyColumns = shouldSplitWideMatrix
    ? (keyColumns.length ? keyColumns : columns.slice(0, Math.min(2, columns.length)))
    : [];
  const remainderColumns = shouldSplitWideMatrix
    ? columns.filter((column: any) => !baseKeyColumns.includes(column))
    : [];

  if (shouldSplitWideMatrix && remainderColumns.length) {
    const chunks = isPrestatieEisenMatrix
      ? [
          remainderColumns.filter((column: any) => {
            const token = normalizeColumnToken(column?.name);
            return token.includes("DOORMELDING") || token === "A" || token === "H" || token === "V" || token === "L" || token === "ASP";
          }),
          remainderColumns.filter((column: any) => {
            const token = normalizeColumnToken(column?.name);
            return token === "INTERN" || token === "EXTERN" || token.includes("MAX");
          }),
        ].filter((chunk: any[]) => chunk.length)
      : (() => {
          const chunkSize = 5;
          const result = [];
          for (let index = 0; index < remainderColumns.length; index += chunkSize) {
            result.push(remainderColumns.slice(index, index + chunkSize));
          }
          return result;
        })();

    return `
      <section class="matrix-section ${options.nested ? "nested" : ""}">
        ${visibleTitle ? `<div class="subsection-title">${escapeHtml(visibleTitle)}</div>` : ""}
        ${chunks
          .map((chunk: any[], index: number) => {
            const chunkColumns = [...baseKeyColumns, ...chunk];
            const continuationTitle =
              isPrestatieEisenMatrix && index > 0
                ? `Prestatie-eisen ; componentaantallen en alarmgrenzen ; vervolg ${index + 1}`
                : `${visibleTitle || "Tabel"} ; vervolg ${index + 1}`;
            const chunkClass = isPrestatieEisenMatrix
              ? index === 0
                ? "is-prestatie-main"
                : "is-prestatie-followup"
              : "";
            return `
              <div class="matrix-split-block ${index > 0 ? "is-continuation" : ""} ${chunkClass}">
                ${
                  index > 0
                    ? `<div class="matrix-continuation-label">${escapeHtml(continuationTitle)}</div>`
                    : ""
                }
                ${renderMatrixTableMarkup(chunkColumns, rows)}
              </div>
            `;
          })
          .join("")}
      </section>
    `;
  }

  return `
    <section class="matrix-section ${options.nested ? "nested" : ""}">
      ${visibleTitle ? `<div class="subsection-title">${escapeHtml(visibleTitle)}</div>` : ""}
      ${renderMatrixTableMarkup(columns, rows)}
    </section>
  `;
}

function simpleFieldTypes() {
  return new Set(["text", "dropdown", "radiogroup", "comment", "boolean", "expression"]);
}

function renderPanel(element: any, answers: any, options: { dividerPercent?: number; alignmentMatrix?: any } = {}) {
  const children = Array.isArray(element?.elements) ? element.elements : [];
  const simpleRows = children.filter((child: any) => simpleFieldTypes().has(normalizeText(child?.type).toLowerCase()));
  const complexChildren = children.filter((child: any) => !simpleFieldTypes().has(normalizeText(child?.type).toLowerCase()));

  const simpleHtml = simpleRows.length
    ? `
      ${
        simpleRows.length === 1 && normalizeText(simpleRows[0]?.type).toLowerCase() !== "comment"
          ? firstText(renderAlignedSimpleFieldTable(labelForElement(simpleRows[0]), answerFor(answers, simpleRows[0]?.name), options.alignmentMatrix))
            || renderFullWidthSimpleFieldTable(
                labelForElement(simpleRows[0]),
                answerFor(answers, simpleRows[0]?.name),
                options.dividerPercent ?? 52
              )
          : `
            <div class="field-grid">
              ${simpleRows
                .map((child: any) =>
                  renderSimpleField(
                    labelForElement(child),
                    answerFor(answers, child?.name),
                    { wide: normalizeText(child?.type).toLowerCase() === "comment" }
                  )
                )
                .join("")}
            </div>
          `
      }
    `
    : "";

  const nextComplexElementFrom = (startIndex: number) => {
    for (let index = startIndex; index < complexChildren.length; index += 1) {
      const candidate = complexChildren[index];
      if (normalizeText(candidate?.type).toLowerCase() !== "html") return candidate;
    }
    return null;
  };

  let previousComplexElement: any = null;
  const complexHtml = complexChildren
    .map((child: any, index: number) => {
      const type = normalizeText(child?.type).toLowerCase();
      const nextComplexElement = nextComplexElementFrom(index + 1);
      const html = renderElement(child, answers, {
        dividerPercent: type === "panel" ? alignmentPercentForAdjacentMatrix(previousComplexElement, nextComplexElement) : undefined,
        alignmentMatrix: type === "panel" ? alignmentMatrixForAdjacent(previousComplexElement, nextComplexElement) : undefined,
      });
      if (type !== "html") {
        previousComplexElement = child;
      }
      return html;
    })
    .join("");
  const content = `${simpleHtml}${complexHtml}`;
  if (!normalizeText(stripHtml(content))) return "";

  return `
    <section class="panel-section">
      ${
        labelForElement(element) && !shouldHideGeneratedSubsectionTitle(labelForElement(element))
          ? `<div class="section-heading">${escapeHtml(labelForElement(element))}</div>`
          : ""
      }
      ${content}
    </section>
  `;
}

function renderPanelDynamic(element: any, answers: any) {
  const rows = answerFor(answers, element?.name);
  const items = Array.isArray(rows) ? rows.filter((row: any) => row && typeof row === "object") : [];
  if (!items.length) return "";

  const templateElements = Array.isArray(element?.templateElements)
    ? element.templateElements
    : Array.isArray(element?.template?.elements)
      ? element.template.elements
      : [];

  const title = labelForElement(element);
  const visibleTitle = shouldHideGeneratedSubsectionTitle(title) ? "" : title;

  return `
    <section class="paneldynamic-section">
      ${visibleTitle ? `<div class="section-heading">${escapeHtml(visibleTitle)}</div>` : ""}
      <div class="paneldynamic-list">
        ${items
          .map((row: any, index: number) => {
            const rowTitle = firstText(
              normalizeText(element?.templateTitle).replace(/\{panel\}/gi, String(index + 1)).replace(/\{panelIndex\}/gi, String(index + 1)),
              `${title || "Regel"} ${index + 1}`
            );

            return `
              <article class="paneldynamic-card">
                <div class="paneldynamic-card-head">
                  <div class="paneldynamic-index">${index + 1}</div>
                  <div class="paneldynamic-title">${escapeHtml(rowTitle)}</div>
                </div>
                <div class="field-grid">
                  ${templateElements.map((child: any) => renderPanelDynamicChild(child, row)).join("")}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderPanelDynamicChild(element: any, rowAnswers: any) {
  const type = normalizeText(element?.type).toLowerCase();

  if (type === "html") {
    const text = stripHtml(element?.html);
    if (!text || /vul per onderdeel in of het voldoet/i.test(text) || !isPrintableCustomerText(text)) return "";
    return `<div class="field-card wide note-card"><div class="field-value">${escapeHtml(text)}</div></div>`;
  }

  if (type === "panel") {
    return `<div class="wide">${renderPanel(element, rowAnswers)}</div>`;
  }

  if (type === "matrixdynamic") {
    return `<div class="wide">${renderMatrixTable(element, rowAnswers, { nested: true })}</div>`;
  }

  if (type === "paneldynamic") {
    return `<div class="wide">${renderPanelDynamic(element, rowAnswers)}</div>`;
  }

  return renderSimpleField(labelForElement(element), answerFor(rowAnswers, element?.name), {
    wide: type === "comment",
  });
}

function renderAdditionalRemarksPage(model: any, page: any) {
  const items = Array.isArray(model?.answers?.aanvullende_opmerkingen_items)
    ? model.answers.aanvullende_opmerkingen_items.filter((row: any) => {
        if (!row || typeof row !== "object") return false;
        return Boolean(
          normalizeText(row?.omschrijving) ||
          normalizeText(row?.gevolg_certificaat)
        );
      })
    : [];

  if (!items.length) {
    return "";
  }

  return `
    <section class="page-break-before report-page">
      <div class="page-title">${escapeHtml(firstText(page?.title, "Aanvullende opmerkingen"))}</div>
      <div class="page-intro">Leg hieronder aanvullende opmerkingen vast. Geef per opmerking aan of deze gevolg heeft voor het certificaat.</div>
      <div class="remarks-list">
        ${items
          .map(
            (item: any, index: number) => `
              <article class="remark-card">
                <div class="paneldynamic-card-head">
                  <div class="paneldynamic-index">${index + 1}</div>
                  <div class="paneldynamic-title">Aanvullende opmerking ${index + 1}</div>
                </div>
                <div class="remarks-grid">
                  ${renderSimpleField("Omschrijving", item?.omschrijving, { wide: true })}
                  ${renderSimpleField("Gevolg op certificaat", item?.gevolg_certificaat)}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderElement(element: any, answers: any, options: { dividerPercent?: number; alignmentMatrix?: any } = {}) {
  const type = normalizeText(element?.type).toLowerCase();

  if (type === "html") {
    const text = stripHtml(element?.html);
    if (!text || /vul per onderdeel in of het voldoet/i.test(text) || !isPrintableCustomerText(text)) return "";
    return `<div class="page-intro">${escapeHtml(text)}</div>`;
  }

  if (type === "panel") return renderPanel(element, answers, { dividerPercent: options.dividerPercent, alignmentMatrix: options.alignmentMatrix });
  if (type === "matrixdynamic") return renderMatrixTable(element, answers);
  if (type === "paneldynamic") return renderPanelDynamic(element, answers);

  if (simpleFieldTypes().has(type)) {
    return `<div class="field-grid">${renderSimpleField(labelForElement(element), answerFor(answers, element?.name), { wide: type === "comment" })}</div>`;
  }

  return "";
}

function renderSurveyPageElements(elements: any[], answers: any) {
  const parts: string[] = [];
  const bufferedSimpleFields: any[] = [];
  let previousComplexElement: any = null;

  const nextComplexElementFrom = (startIndex: number) => {
    for (let index = startIndex; index < elements.length; index += 1) {
      const candidate = elements[index];
      const type = normalizeText(candidate?.type).toLowerCase();
      if (!simpleFieldTypes().has(type)) {
        return candidate;
      }
    }
    return null;
  };

  const flushSimpleFields = (nextComplexElement: any = null) => {
    if (!bufferedSimpleFields.length) return;

    const renderAsSingleAlignedRow =
      bufferedSimpleFields.length === 1 &&
      normalizeText(bufferedSimpleFields[0]?.type).toLowerCase() !== "comment";

    if (renderAsSingleAlignedRow) {
      const singleField = bufferedSimpleFields[0];
      const alignmentMatrix = alignmentMatrixForAdjacent(previousComplexElement, nextComplexElement);
      parts.push(
        renderAlignedSimpleFieldTable(labelForElement(singleField), answerFor(answers, singleField?.name), alignmentMatrix) ||
          renderFullWidthSimpleFieldTable(
            labelForElement(singleField),
            answerFor(answers, singleField?.name),
            alignmentPercentForAdjacentMatrix(previousComplexElement, nextComplexElement)
          )
      );
      bufferedSimpleFields.length = 0;
      return;
    }

    parts.push(`
      <div class="field-grid">
        ${bufferedSimpleFields
          .map((element: any) => {
            const type = normalizeText(element?.type).toLowerCase();
            return renderSimpleField(labelForElement(element), answerFor(answers, element?.name), {
              wide: type === "comment",
            });
          })
          .join("")}
      </div>
    `);
    bufferedSimpleFields.length = 0;
  };

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const type = normalizeText(element?.type).toLowerCase();
    if (simpleFieldTypes().has(type)) {
      bufferedSimpleFields.push(element);
      continue;
    }

    flushSimpleFields(element);
    const nextComplexElement = nextComplexElementFrom(index + 1);
    parts.push(
      renderElement(element, answers, {
        dividerPercent: type === "panel" ? alignmentPercentForAdjacentMatrix(previousComplexElement, nextComplexElement) : undefined,
        alignmentMatrix: type === "panel" ? alignmentMatrixForAdjacent(previousComplexElement, nextComplexElement) : undefined,
      })
    );
    previousComplexElement = element;
  }

  flushSimpleFields();
  return parts.join("");
}

function renderSurveyPages(model: any) {
  const answers = model?.answers || {};
  const pages = visibleSurveyPages(model);

  return pages
    .map((page: any, index: number) => {
      const pageName = normalizeToken(page?.name);
      if (pageName === "AANVULLENDE_OPMERKINGEN") {
        return renderAdditionalRemarksPage(model, page);
      }

      const elements = Array.isArray(page?.elements) ? page.elements : [];
      const content = renderSurveyPageElements(elements, answers);
      if (!normalizeText(stripHtml(content))) return "";

      return `
        <section class="page-break-before report-page ${isLandscapeSurveyPage(page) ? "landscape-page" : ""}">
          <div class="page-title">${escapeHtml(firstText(page?.title, page?.name, `Pagina ${index + 1}`))}</div>
          ${content}
        </section>
      `;
    })
    .join("");
}

function buildFollowUpAttachmentMap(model: any) {
  const items = Array.isArray(model?.formInstanceDocuments?.items) ? model.formInstanceDocuments.items : [];
  const map = new Map<string, any[]>();

  for (const item of items) {
    const links = Array.isArray(item?.follow_ups) ? item.follow_ups : [];
    for (const link of links) {
      const actionId = normalizeText(link?.follow_up_action_id);
      const fingerprint = normalizeText(link?.source_fingerprint);

      for (const key of [actionId ? `id:${actionId}` : "", fingerprint ? `fp:${fingerprint}` : ""]) {
        if (!key) continue;
        const existing = map.get(key) || [];
        existing.push(item);
        map.set(key, existing);
      }
    }
  }

  return map;
}

function followUpDocumentsForItem(item: any, attachmentMap: Map<string, any[]>) {
  const byId = attachmentMap.get(`id:${normalizeText(item?.follow_up_action_id)}`) || [];
  const byFingerprint = attachmentMap.get(`fp:${normalizeText(item?.source_fingerprint)}`) || [];

  const deduped = new Map<string, any>();
  for (const doc of [...byId, ...byFingerprint]) {
    const key = normalizeText(doc?.form_instance_document_id) || normalizeText(doc?.file_name);
    if (!deduped.has(key)) deduped.set(key, doc);
  }

  return Array.from(deduped.values());
}

function renderAttachmentCard(item: any) {
  const hasPreview = normalizeText(item?.preview_data_url);
  const isVideo = normalizeText(item?.mime_type).toLowerCase().startsWith("video/");
  const meta = joinNonEmpty(
    [
      item?.document_number,
      formatExportDate(item?.document_date),
      item?.revision,
      item?.file_name,
    ],
    " ; "
  );

  return `
    <div class="attachment-card">
      ${
        hasPreview
          ? `<div class="attachment-preview"><img src="${item.preview_data_url}" alt="${escapeHtml(firstText(item?.title, item?.file_name, "Bijlage"))}" /></div>`
          : `<div class="attachment-preview placeholder">${isVideo ? "Video" : "Bijlage"}</div>`
      }
      <div class="attachment-body">
        <div class="attachment-title">${escapeHtml(firstText(item?.title, item?.file_name, "Bijlage"))}</div>
        ${meta ? `<div class="attachment-meta">${escapeHtml(meta)}</div>` : ""}
        ${normalizeText(item?.note) ? `<div class="attachment-note">${escapeHtml(item.note)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderFollowUpSection(title: string, intro: string, items: any[], attachmentMap: Map<string, any[]>, emptyText: string) {
  if (!items.length) {
    return "";
  }

  return `
    <section class="followup-section">
      <div class="section-heading">${escapeHtml(title)}</div>
      <div class="page-intro">${escapeHtml(intro)}</div>
      ${items
        .map((item: any) => {
          const linkedDocuments = followUpDocumentsForItem(item, attachmentMap);
          return `
            <article class="followup-card">
              <div class="followup-card-head">
                <div class="followup-title">${escapeHtml(firstText(item?.workflow_title, item?.workflow_description, "Actiepunt"))}</div>
                <div class="followup-status">${escapeHtml(normalizedStatusLabel(item?.status))}</div>
              </div>
              <div class="followup-grid">
                ${renderSimpleField("Type", isWorkflow(item) ? "Workflowactie" : "Rapportopmerking")}
                ${renderSimpleField("Categorie", item?.category)}
                ${renderSimpleField("Certificaatimpact", item?.effective_certificate_impact || item?.certificate_impact)}
                ${renderSimpleField("Uitkomst", item?.resolution_outcome)}
                ${renderSimpleField("Omschrijving", firstText(item?.workflow_description, item?.note), { wide: true })}
                ${renderSimpleField("Afhandelnotitie", item?.resolution_note, { wide: true })}
              </div>
              ${
                linkedDocuments.length
                  ? `
                    <div class="linked-documents">
                      <div class="linked-documents-title">Gekoppelde formulierbijlagen</div>
                      <div class="attachment-grid">
                        ${linkedDocuments.map((doc: any) => renderAttachmentCard(doc)).join("")}
                      </div>
                    </div>
                  `
                  : ""
              }
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderActionPointSummaryPage(model: any) {
  const allWorkflowItems = workflowItems(model);
  const attachmentMap = buildFollowUpAttachmentMap(model);
  const certificateItems = allWorkflowItems.filter((item: any) => effectiveCertificateImpact(item) === "YES");
  const reportItems = reportOnlyItems(model);
  const otherWorkflowItems = allWorkflowItems.filter((item: any) => effectiveCertificateImpact(item) !== "YES");

  const sections = [
    renderFollowUpSection(
      "Certificaatpunten",
      "Deze workflowactiepunten beïnvloeden het mogen afgeven van een definitief oordeel.",
      certificateItems,
      attachmentMap,
      "Er zijn geen certificaatpunten geregistreerd."
    ),
    renderFollowUpSection(
      "Workflowacties zonder certificaatimpact",
      "Deze acties horen bij de afhandeling van het rapport, maar blokkeren het certificaatoordeel niet rechtstreeks.",
      otherWorkflowItems,
      attachmentMap,
      "Er zijn geen aanvullende workflowacties zonder certificaatimpact."
    ),
    renderFollowUpSection(
      "Rapportopmerkingen",
      "Deze opmerkingen worden in het rapport getoond, maar tellen niet mee als certificeringsblokkade.",
      reportItems,
      attachmentMap,
      "Er zijn geen rapportopmerkingen geregistreerd."
    ),
  ].filter(Boolean);

  if (!sections.length) {
    return "";
  }

  return `
    <section class="page-break-before report-page">
      <div class="page-title">Actiepunten en bewijs</div>
      <div class="page-intro">Samenvatting van workflowacties, rapportopmerkingen en gekoppelde formulierbijlagen.</div>
      ${sections.join("")}
    </section>
  `;
}

function buildPdfHeaderTemplate(model: any) {
  const headerTitles = pdfHeaderTitles(model);
  const centerTitle = firstText(headerTitles.subtitle, headerTitles.title, model?.form?.name, model?.surveyJson?.title, "Rapport");
  const objectTitle = firstText(
    model?.installation?.installation_name,
    model?.installation?.object_name,
    model?.form?.title,
    "Installatie"
  );
  const address = buildAddress(model);
  const logo = normalizeText(model?.assets?.logoDataUrl);

  return `
    <style>
      .pdf-header {
        width: 100%;
        box-sizing: border-box;
        padding: 0 12mm;
        margin-top: -3mm;
        font-family: Calibri, Arial, sans-serif;
        color: #0f172a;
      }
      .pdf-header-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6mm;
        min-height: 14mm;
        padding: 0.4mm 0 0.6mm 0;
        border-bottom: 1px solid #d9d9d9;
      }
      .pdf-header-col {
        width: 33.333%;
        box-sizing: border-box;
      }
      .pdf-header-col.left {
        text-align: left;
      }
      .pdf-header-col.center {
        text-align: center;
      }
      .pdf-header-col.right {
        text-align: right;
        color: #878787;
        font-size: 8.8pt;
        line-height: 1.25;
        padding-right: 0;
        margin-right: -2mm;
      }
      .pdf-header-logo {
        display: block;
        width: 40mm;
        max-height: 14mm;
        object-fit: contain;
        object-position: left center;
        transform: translateX(-8mm);
        transform-origin: left center;
      }
      .pdf-header-title {
        font-size: 13pt;
        font-weight: 700;
        line-height: 1.1;
      }
      .pdf-header-meta-strong {
        color: #0f172a;
        font-weight: 700;
        margin-bottom: 0.8mm;
      }
    </style>
    <div class="pdf-header">
      <div class="pdf-header-inner">
        <div class="pdf-header-col left">
          ${logo ? `<img class="pdf-header-logo" src="${logo}" alt="Logo" />` : ""}
        </div>
        <div class="pdf-header-col center">
          <div class="pdf-header-title">${escapeHtml(centerTitle)}</div>
        </div>
        <div class="pdf-header-col right">
          <div class="pdf-header-meta-strong">${escapeHtml(objectTitle)}</div>
          ${address ? `<div>${escapeHtml(address)}</div>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderDocumentsPage(model: any) {
  const installationGroups = Array.isArray(model?.installationDocuments?.groups) ? model.installationDocuments.groups : [];
  const formDocuments = Array.isArray(model?.formInstanceDocuments?.items)
    ? model.formInstanceDocuments.items.filter((item: any) => !Array.isArray(item?.follow_ups) || item.follow_ups.length === 0)
    : [];

  return `
    <section class="page-break-before report-page">
      <div class="page-title">Documenten</div>
      <div class="page-intro">Installatiebestanden en overige formulierbijlagen die bij dit rapport horen.</div>

      ${
        installationGroups.length
          ? installationGroups
              .map(
                (group: any) => `
                  <section class="document-group no-break">
                    <div class="section-heading">${escapeHtml(firstText(group?.name, "Installatiebestanden"))}</div>
                    <table class="report-table document-table">
                      <thead>
                        <tr>
                          <th>Titel</th>
                          <th>Documentnr</th>
                          <th>Datum</th>
                          <th>Revisie</th>
                          <th>Bestand</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(Array.isArray(group?.items) ? group.items : [])
                          .map(
                            (item: any) => `
                              <tr>
                                <td>${escapeHtml(firstText(item?.title, item?.file_name, "Document"))}</td>
                                <td>${escapeHtml(displayText(item?.document_number))}</td>
                                <td>${escapeHtml(displayText(formatExportDate(item?.document_date)))}</td>
                                <td>${escapeHtml(displayText(item?.revision))}</td>
                                <td>${escapeHtml(displayText(item?.file_name))}</td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </section>
                `
              )
              .join("")
          : `<div class="empty-box">Geen installatiebestanden gevonden.</div>`
      }

      ${
        formDocuments.length
          ? `
            <section class="document-group no-break">
              <div class="section-heading">Overige formulierbijlagen</div>
              <div class="attachment-grid">
                ${formDocuments.map((item: any) => renderAttachmentCard(item)).join("")}
              </div>
            </section>
          `
          : ""
      }
    </section>
  `;
}

function defaultCertifiedSignatureBlocks() {
  return [
    {
      key: "verklaring",
      title: "Verklaring",
      text: "De opsteller verklaart dat de resultaten van het onderhoud en de controle in dit rapport zijn vastgelegd.",
      footerText: "",
    },
    {
      key: "aanvullende_werkzaamheden",
      title: "Aanvullende werkzaamheden uitgevoerd",
      text: "Ondergetekende verklaart dat de aanvullende werkzaamheden naar aanleiding van de geconstateerde bevindingen zijn uitgevoerd.",
      footerText: "",
    },
    {
      key: "oordeel",
      title: "Oordeel / definitief oordeel",
      text: "Ondergetekende verklaart namens het onderhoudsbedrijf dat het onderhoud van de brandmeldinstallatie is uitgevoerd en dat het uitgevoerde onderhoud voldoet aan de eisen zoals vastgelegd in NEN 2654-1.",
      footerText: "",
    },
  ];
}

function resolvedWorkflowCount(model: any) {
  return workflowItems(model).filter((item: any) => isResolvedWorkflow(item)).length;
}

function canShowSignatureForBlock(model: any, blockKey: string) {
  const isFinal = normalizeToken(model?.form?.status) === "AFGEHANDELD";
  if (!isFinal) {
    return {
      allowed: false,
      reason: "Ondertekening volgt nadat het formulier definitief is afgehandeld.",
    };
  }

  if (blockKey === "verklaring") {
    return {
      allowed: true,
      reason: "",
    };
  }

  if (blockKey === "aanvullende_werkzaamheden") {
    const totalWorkflow = workflowItems(model).length;
    const resolvedCount = resolvedWorkflowCount(model);
    return totalWorkflow > 0 && resolvedCount === totalWorkflow
      ? { allowed: true, reason: "" }
      : {
          allowed: false,
          reason: "Nog niet ondertekend; aanvullende werkzaamheden zijn nog niet voor alle workflowactiepunten inhoudelijk als opgelost geregistreerd.",
        };
  }

  if (blockKey === "oordeel") {
    return blockingJudgementItems(model).length === 0
      ? { allowed: true, reason: "" }
      : {
          allowed: false,
          reason: "Nog niet ondertekend; er zijn nog certificaatblokkerende workflowactiepunten die niet inhoudelijk als opgelost zijn geregistreerd.",
        };
  }

  return {
    allowed: true,
    reason: "",
  };
}

function signatureBlocks(model: any) {
  if (isCertifiedMaintenanceReport(model)) {
    return defaultCertifiedSignatureBlocks();
  }

  const configured = model?.surveyJson?.ember?.report?.signaturePage?.blocks;
  return Array.isArray(configured) && configured.length ? configured : defaultCertifiedSignatureBlocks().slice(0, 1);
}

function signatureClosingText(model: any) {
  const text = model?.surveyJson?.ember?.report?.signaturePage?.closingText;
  return Array.isArray(text) ? text : [];
}

function renderSignaturePage(model: any) {
  const blocks = signatureBlocks(model);
  const closing = signatureClosingText(model);
  const signerName = firstText(
    answerText(model?.answers, "onderhouder_naam", "Naamonderhouder", "Naam onderhouder_2"),
    model?.signer?.profileName,
    model?.viewer?.profile_name
  );
  const onderhoudDatum = answerDateText(model?.answers, "datum_onderhoud", "Datum_onderhoud_af_date", "datum onderhoud_2");

  return `
    <section class="page-break-before report-page">
      <div class="page-title">Ondertekening</div>
      <div class="signature-list">
        ${blocks
          .map((block: any) => {
            const blockKey = normalizeToken(block?.key || block?.title);
            const signatureState = canShowSignatureForBlock(model, blockKey === "AANVULLENDEWERKZAAMHEDEN" ? "aanvullende_werkzaamheden" : blockKey.toLowerCase());
            return `
              <article class="signature-block">
                <div class="signature-block-header">
                  <div>
                    <div class="signature-title">${escapeHtml(firstText(block?.title, "Ondertekening"))}</div>
                    ${
                      normalizeText(block?.text)
                        ? `<div class="signature-subtitle">${escapeHtml(firstText(block?.text))}</div>`
                        : ""
                    }
                  </div>
                  ${
                    signatureState.reason
                      ? `<div class="signature-state">${escapeHtml(signatureState.reason)}</div>`
                      : ""
                  }
                </div>
                <div class="signature-body">
                  <div class="signature-meta">
                    <div class="signature-field">
                      <div class="signature-field-label">Naam</div>
                      <div class="signature-field-value">${escapeHtml(displayText(signerName))}</div>
                    </div>
                    <div class="signature-field">
                      <div class="signature-field-label">Datum</div>
                      <div class="signature-field-value">${escapeHtml(displayText(onderhoudDatum))}</div>
                    </div>
                    <div class="signature-field">
                      <div class="signature-field-label">Handtekening</div>
                      <div class="signature-field-value">${signatureState.allowed && normalizeText(model?.signer?.signatureDataUrl) ? "Vastgelegd" : "Niet beschikbaar"}</div>
                    </div>
                  </div>
                  <div class="signature-box">
                    ${
                      signatureState.allowed && normalizeText(model?.signer?.signatureDataUrl)
                        ? `<img src="${model.signer.signatureDataUrl}" alt="Handtekening" />`
                        : `<div class="signature-empty"></div>`
                    }
                  </div>
                </div>
                ${block?.footerText ? `<div class="signature-footer">${escapeHtml(firstText(block.footerText))}</div>` : ""}
              </article>
            `;
          })
          .join("")}
      </div>
      ${
        closing.length
          ? `<div class="signature-closing">${closing.map((text: any) => `<p>${escapeHtml(textValue(text))}</p>`).join("")}</div>`
          : ""
      }
    </section>
  `;
}

function renderHtmlDocument(model: any) {
  const reportTitle = firstText(reportConfig(model)?.coverMainTitle, "Rapport van Onderhoud");
  const bodyContent = `
    ${renderActionPointSummaryPage(model)}
    ${renderAppendixOverviewPage(model)}
    ${renderSurveyPages(model)}
    ${renderSignaturePage(model)}
  `;

  return `
    <!doctype html>
    <html lang="nl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(reportTitle)}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }

          @page landscape {
            size: A4 landscape;
            margin: 0;
          }

          :root {
            --ink: #0f172a;
            --muted: #878787;
            --line: #d9d9d9;
            --panel: #f2f2f2;
            --panel-strong: #d9d9d9;
            --accent: #e62b27;
            --accent-soft: #fbe8e8;
            --success-soft: #edf8f4;
          }

          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; }
          body {
            font-family: Calibri, Arial, sans-serif;
            color: var(--ink);
            font-size: 10.5pt;
            line-height: 1.32;
          }

          .page-break-before { page-break-before: always; break-before: page; }
          .report-page { min-height: 1px; padding-top: 28mm; }

          .cover-page {
            min-height: 248mm;
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            gap: 9mm;
          }

          .cover-top {
            min-height: 2mm;
          }

          .cover-title-logo {
            min-height: 24mm;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 5mm;
          }

          .cover-title-logo img {
            max-width: 74mm;
            max-height: 24mm;
            object-fit: contain;
          }

          .cover-title-block {
            padding-top: 8mm;
            text-align: center;
          }

          .cover-kicker {
            color: var(--muted);
            font-size: 14pt;
            font-weight: 600;
            margin-bottom: 4mm;
          }

          .cover-title-block h1 {
            margin: 0 0 6mm 0;
            font-size: 31pt;
            line-height: 1.05;
          }

          .cover-object {
            font-size: 16pt;
            font-weight: 700;
            margin-bottom: 2mm;
          }

          .cover-address {
            font-size: 11pt;
            color: var(--muted);
          }

          .cover-spacer { min-height: 10mm; }

          .cover-bottom {
            padding-top: 6mm;
          }

          .cover-icon-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8mm 10mm;
            max-width: 132mm;
            margin: 0 auto;
          }

          .cover-icon-card {
            text-align: center;
          }

          .cover-icon-media {
            min-height: 23mm;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2mm;
          }

          .cover-icon-media img {
            max-width: 22mm;
            max-height: 22mm;
            object-fit: contain;
          }

          .cover-icon-fallback {
            width: 18mm;
            height: 18mm;
            background: #d9d9d9;
          }

          .cover-icon-label {
            font-size: 8.8pt;
            color: var(--muted);
          }

          .cover-icon-card.is-active .cover-icon-label {
            color: var(--ink);
            font-weight: 700;
          }

          .cover-facts-list {
            display: grid;
            gap: 1.8mm;
            max-width: 84mm;
            margin: 0 auto;
          }

          .cover-fact-row {
            display: grid;
            grid-template-columns: 38mm minmax(0, 1fr);
            gap: 4mm;
            align-items: baseline;
          }

          .cover-fact-label {
            color: var(--muted);
            font-size: 9pt;
            font-weight: 700;
          }

          .cover-fact-value {
            font-size: 10pt;
          }

          .cover-note {
            margin-bottom: 4mm;
            padding: 3.2mm 4mm;
            text-align: center;
          }

          .cover-note.is-warning {
            background: var(--accent-soft);
            color: #d1201f;
            font-weight: 700;
          }

          .cover-note.is-concept {
            background: #fff7e8;
            color: #8a5a00;
            font-weight: 700;
          }

          .info-grid,
          .field-grid,
          .remarks-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 3mm;
            align-items: stretch;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .single-field-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .single-field-table {
            width: 100%;
            table-layout: fixed;
          }

          .single-field-table th,
          .single-field-table td {
            vertical-align: middle;
            padding: 3.2mm 4mm;
          }

          .single-field-table th {
            background: var(--panel);
            color: var(--muted);
            font-size: 8.8pt;
            font-weight: 700;
            text-align: left;
          }

          .info-card,
          .field-card {
            border: 1px solid var(--line);
            background: white;
            min-height: 12mm;
            display: grid;
            grid-template-columns: minmax(28mm, 34%) minmax(0, 1fr);
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .field-card.long-label {
            grid-template-columns: minmax(44mm, 44%) minmax(0, 1fr);
          }

          .field-card.full-width-split {
            grid-column: 1 / -1;
            grid-template-columns: var(--field-divider, 40%) minmax(0, 1fr);
            width: 100%;
          }

          .field-card.wide {
            grid-column: 1 / -1;
            grid-template-columns: 1fr;
            min-height: 16mm;
          }

          .info-label,
          .field-label {
            padding: 2mm 3mm 1.4mm 3mm;
            font-size: 8.6pt;
            font-weight: 700;
            color: var(--muted);
            background: var(--panel);
            border-bottom: 1px solid var(--line);
          }

          .info-value,
          .field-value {
            padding: 2.6mm 3mm;
            white-space: pre-wrap;
            word-break: break-word;
            align-self: center;
          }

          .field-label-inline,
          .field-value-inline {
            padding: 2.4mm 3mm;
            min-height: 100%;
            display: flex;
            align-items: center;
          }

          .field-label-inline {
            background: var(--panel);
            border-right: 1px solid var(--line);
            color: var(--muted);
            font-size: 8.6pt;
            font-weight: 700;
          }

          .field-value-inline {
            white-space: pre-wrap;
            word-break: break-word;
          }

          .page-title {
            font-size: 22pt;
            font-weight: 700;
            line-height: 1.08;
            margin: 0 0 4mm 0;
            break-after: avoid;
            page-break-after: avoid;
          }

          .page-intro,
          .body-note {
            color: var(--muted);
            margin: 0 0 4mm 0;
            white-space: pre-wrap;
          }

          .body-note {
            border: 1px solid var(--line);
            background: var(--panel);
            padding: 4mm;
          }

          .section-heading {
            font-size: 14pt;
            font-weight: 700;
            margin: 0 0 3mm 0;
          }

          .subsection-title {
            font-size: 12.5pt;
            font-weight: 700;
            margin: 0 0 2.4mm 0;
            break-after: avoid;
            page-break-after: avoid;
          }

          .info-section,
          .followup-section,
          .document-group,
          .panel-section,
          .paneldynamic-section,
          .matrix-section {
            margin-bottom: 6mm;
          }

          .matrix-section {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .followup-section {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .followup-section > .section-heading,
          .followup-section > .page-intro,
          .document-group > .section-heading,
          .panel-section > .section-heading,
          .paneldynamic-section > .section-heading,
          .matrix-section > .subsection-title {
            break-after: avoid;
            page-break-after: avoid;
          }

          .section-heading + .field-grid,
          .section-heading + .paneldynamic-list,
          .section-heading + .report-table,
          .subsection-title + .report-table,
          .matrix-continuation-label + .report-table {
            break-before: avoid;
            page-break-before: avoid;
          }

          .followup-section .followup-card:first-of-type,
          .document-group > .report-table,
          .matrix-section > .report-table {
            break-before: avoid;
            page-break-before: avoid;
          }

          .no-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .summary-band {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 3mm;
            margin-top: 6mm;
          }

          .summary-item {
            border: 1px solid var(--line);
            background: var(--panel);
            padding: 3mm;
          }

          .summary-label {
            font-size: 8.5pt;
            color: var(--muted);
            margin-bottom: 1mm;
          }

          .summary-value {
            font-size: 15pt;
            font-weight: 700;
          }

          .report-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            border: 1px solid var(--line);
          }

          .report-table thead {
            display: table-header-group;
          }

          .report-table th,
          .report-table td {
            border: 1px solid var(--line);
            padding: 2.4mm 3mm;
            vertical-align: top;
            white-space: pre-wrap;
            word-break: normal;
            overflow-wrap: anywhere;
          }

          .matrix-table th,
          .matrix-table td {
            vertical-align: middle;
          }

          .report-table th {
            background: var(--panel);
            color: var(--muted);
            font-size: 8.8pt;
            font-weight: 700;
            text-align: left;
          }

          .align-center {
            text-align: center;
          }

          .report-table td.item-code-cell {
            white-space: nowrap;
            word-break: keep-all;
            overflow-wrap: normal;
          }

          .assessment-chip {
            display: inline-block;
            min-width: 18mm;
            padding: 1.2mm 2.2mm;
            border-radius: 999px;
            border: 1px solid var(--line);
            background: white;
            font-size: 9pt;
            font-weight: 700;
            text-align: center;
          }

          .assessment-chip.is-yes {
            border-color: #9ad8bb;
            background: var(--success-soft);
            color: #135f49;
          }

          .assessment-chip.is-no {
            border-color: #f0b0ab;
            background: #fff2f1;
            color: #9f2620;
          }

          .assessment-chip.is-neutral {
            color: #42546c;
            background: #f6f8fb;
          }

          .paneldynamic-list,
          .remarks-list,
          .signature-list {
            display: grid;
            gap: 5mm;
          }

          .paneldynamic-card,
          .remark-card,
          .followup-card,
          .signature-block {
            border: 1px solid var(--line);
            background: white;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .paneldynamic-card-head,
          .followup-card-head {
            display: flex;
            align-items: center;
            gap: 3mm;
            padding: 3mm 3.4mm 0 3.4mm;
          }

          .paneldynamic-index {
            width: 10mm;
            height: 10mm;
            border-radius: 999px;
            border: 1px solid var(--line);
            background: var(--panel);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            flex: 0 0 auto;
          }

          .paneldynamic-title,
          .followup-title {
            font-size: 12pt;
            font-weight: 700;
          }

          .followup-status {
            margin-left: auto;
            padding: 1.2mm 2.4mm;
            border-radius: 999px;
            border: 1px solid var(--line);
            background: var(--panel);
            font-size: 8.8pt;
            font-weight: 700;
          }

          .paneldynamic-card .field-grid,
          .followup-card .followup-grid,
          .remark-card .remarks-grid {
            padding: 3.4mm;
          }

          .followup-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 3mm;
          }

          .linked-documents {
            border-top: 1px solid var(--line);
            padding: 3.4mm;
          }

          .linked-documents-title {
            font-size: 10pt;
            font-weight: 700;
            margin-bottom: 3mm;
          }

          .attachment-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 3mm;
          }

          .attachment-card {
            display: grid;
            grid-template-columns: 32mm minmax(0, 1fr);
            gap: 3mm;
            border: 1px solid var(--line);
            background: var(--panel);
            min-height: 26mm;
          }

          .attachment-preview {
            background: #e8edf4;
            min-height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }

          .attachment-preview.placeholder {
            color: var(--muted);
            font-weight: 700;
          }

          .attachment-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }

          .attachment-preview img[src^="data:image/"] {
            background: white;
          }

          .attachment-body {
            padding: 2.8mm 3mm 2.8mm 0;
          }

          .attachment-title {
            font-weight: 700;
            margin-bottom: 1mm;
          }

          .attachment-meta,
          .attachment-note,
          .signature-field-label,
          .signature-footer,
          .muted {
            color: var(--muted);
          }

          .attachment-meta,
          .attachment-note,
          .signature-footer {
            font-size: 8.8pt;
          }

          .signature-list {
            display: grid;
            gap: 5mm;
          }

          .signature-block-header {
            display: flex;
            justify-content: space-between;
            gap: 4mm;
            align-items: flex-start;
            padding: 3.4mm 3.8mm 0 3.8mm;
          }

          .signature-title {
            font-size: 12pt;
            font-weight: 700;
          }

          .signature-subtitle {
            margin-top: 1.2mm;
            color: var(--muted);
            font-size: 9pt;
            line-height: 1.35;
          }

          .signature-state {
            max-width: 46mm;
            text-align: right;
            color: var(--muted);
            font-size: 8.8pt;
            font-weight: 700;
          }

          .signature-body {
            padding: 3.8mm;
          }

          .signature-meta {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 3mm;
            margin-bottom: 3.4mm;
          }

          .signature-field {
            border: 1px solid var(--line);
            background: var(--panel);
            padding: 3mm 3.2mm;
          }

          .signature-field-label {
            color: var(--muted);
            font-size: 8.5pt;
            font-weight: 700;
            margin-bottom: 1mm;
          }

          .signature-box {
            border: 1px solid var(--line);
            background: white;
            min-height: 28mm;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            padding: 3mm 5mm;
          }

          .signature-box img {
            max-width: 100%;
            max-height: 22mm;
            object-fit: contain;
            display: block;
          }

          .signature-empty {
            width: 72mm;
            height: 16mm;
            border-bottom: 1px solid #878787;
          }

          .signature-footer {
            padding: 0 3.8mm 3.8mm 3.8mm;
            color: var(--muted);
            font-size: 8.8pt;
          }

          .signature-closing p {
            margin: 0 0 3mm 0;
          }

          .object-grid {
            display: grid;
            gap: 1.4mm;
          }

          .object-row {
            display: grid;
            grid-template-columns: 36mm minmax(0, 1fr);
            gap: 2.5mm;
          }

          .object-key {
            font-weight: 700;
            color: var(--muted);
          }

          .value-list {
            margin: 0;
            padding-left: 4.6mm;
          }

          .empty-box {
            border: 1px solid var(--line);
            background: var(--panel);
            padding: 4mm;
            color: var(--muted);
          }

          .landscape-page {
            page: landscape;
          }

          .landscape-page .report-table {
            table-layout: auto;
          }

          .landscape-page .report-table th,
          .landscape-page .report-table td {
            font-size: 9pt;
            padding: 2.2mm 2.4mm;
          }

          .landscape-page .field-grid,
          .landscape-page .remarks-grid,
          .landscape-page .followup-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .matrix-split-block + .matrix-split-block {
            margin-top: 4mm;
          }

          .matrix-split-block.is-prestatie-main .report-table {
            table-layout: fixed;
          }

          .matrix-split-block.is-prestatie-followup .report-table {
            table-layout: fixed;
          }

          .matrix-split-block.is-prestatie-followup col:first-child {
            width: 18%;
          }

          .matrix-split-block.is-prestatie-followup col:nth-child(2) {
            width: 18%;
          }

          .matrix-split-block.is-prestatie-followup col:nth-child(3),
          .matrix-split-block.is-prestatie-followup col:nth-child(4),
          .matrix-split-block.is-prestatie-followup col:nth-child(5),
          .matrix-split-block.is-prestatie-followup col:nth-child(6) {
            width: 16%;
          }

          .matrix-continuation-label {
            margin: 0 0 2mm 0;
            color: var(--muted);
            font-size: 9pt;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        ${renderCoverPage(model)}
        ${bodyContent}
      </body>
    </html>
  `;
}

function renderBodyHtmlDocument(model: any) {
  const reportTitle = firstText(reportConfig(model)?.coverMainTitle, "Rapport van Onderhoud");
  const bodyContent = `
    ${renderActionPointSummaryPage(model)}
    ${renderAppendixOverviewPage(model)}
    ${renderSurveyPages(model)}
    ${renderSignaturePage(model)}
  `;

  return `
    <!doctype html>
    <html lang="nl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(reportTitle)}</title>
        <style>
          @page {
            size: A4;
          }

          @page landscape {
            size: A4 landscape;
          }

          :root {
            --ink: #0f172a;
            --muted: #878787;
            --line: #d9d9d9;
            --panel: #f2f2f2;
            --panel-strong: #d9d9d9;
            --accent: #e62b27;
            --accent-soft: #fbe8e8;
            --success-soft: #edf8f4;
          }

          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; }
          body {
            font-family: Calibri, Arial, sans-serif;
            color: var(--ink);
            font-size: 10.5pt;
            line-height: 1.32;
          }

          .page-break-before { page-break-before: always; break-before: page; }
          .report-page { min-height: 1px; }

          .cover-page {
            min-height: 248mm;
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            gap: 9mm;
          }

          .cover-top {
            min-height: 2mm;
          }

          .cover-title-logo {
            min-height: 24mm;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 5mm;
          }

          .cover-title-logo img {
            max-width: 74mm;
            max-height: 24mm;
            object-fit: contain;
          }

          .cover-title-block {
            padding-top: 8mm;
            text-align: center;
          }

          .cover-kicker {
            color: var(--muted);
            font-size: 14pt;
            font-weight: 600;
            margin-bottom: 4mm;
          }

          .cover-title-block h1 {
            margin: 0 0 6mm 0;
            font-size: 31pt;
            line-height: 1.05;
          }

          .cover-object {
            font-size: 16pt;
            font-weight: 700;
            margin-bottom: 2mm;
          }

          .cover-address {
            font-size: 11pt;
            color: var(--muted);
          }

          .cover-spacer { min-height: 10mm; }

          .cover-bottom {
            padding-top: 6mm;
          }

          .cover-icon-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8mm 10mm;
            max-width: 132mm;
            margin: 0 auto;
          }

          .cover-icon-card {
            text-align: center;
          }

          .cover-icon-media {
            min-height: 23mm;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2mm;
          }

          .cover-icon-media img {
            max-width: 22mm;
            max-height: 22mm;
            object-fit: contain;
          }

          .cover-icon-fallback {
            width: 18mm;
            height: 18mm;
            background: #d9d9d9;
          }

          .cover-icon-label {
            font-size: 8.8pt;
            color: var(--muted);
          }

          .cover-icon-card.is-active .cover-icon-label {
            color: var(--ink);
            font-weight: 700;
          }

          .cover-facts-list {
            display: grid;
            gap: 1.8mm;
            max-width: 84mm;
            margin: 0 auto;
          }

          .cover-fact-row {
            display: grid;
            grid-template-columns: 38mm minmax(0, 1fr);
            gap: 4mm;
            align-items: baseline;
          }

          .cover-fact-label {
            color: var(--muted);
            font-size: 9pt;
            font-weight: 700;
          }

          .cover-fact-value {
            font-size: 10pt;
          }

          .cover-note {
            margin-bottom: 4mm;
            padding: 3.2mm 4mm;
            text-align: center;
          }

          .cover-note.is-warning {
            background: var(--accent-soft);
            color: #d1201f;
            font-weight: 700;
          }

          .cover-note.is-concept {
            background: #fff7e8;
            color: #8a5a00;
            font-weight: 700;
          }

          .info-grid,
          .field-grid,
          .remarks-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 3mm;
            align-items: stretch;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .single-field-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .single-field-table {
            width: 100%;
            table-layout: fixed;
          }

          .single-field-table th,
          .single-field-table td {
            vertical-align: middle;
            padding: 3.2mm 4mm;
          }

          .single-field-table th {
            background: var(--panel);
            color: var(--muted);
            font-size: 8.8pt;
            font-weight: 700;
            text-align: left;
          }

          .info-card,
          .field-card {
            border: 1px solid var(--line);
            background: white;
            min-height: 12mm;
            display: grid;
            grid-template-columns: minmax(28mm, 34%) minmax(0, 1fr);
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .field-card.long-label {
            grid-template-columns: minmax(44mm, 44%) minmax(0, 1fr);
          }

          .field-card.full-width-split {
            grid-column: 1 / -1;
            grid-template-columns: var(--field-divider, 40%) minmax(0, 1fr);
            width: 100%;
          }

          .field-card.wide {
            grid-column: 1 / -1;
            grid-template-columns: 1fr;
            min-height: 16mm;
          }

          .info-label,
          .field-label {
            padding: 2mm 3mm 1.4mm 3mm;
            font-size: 8.6pt;
            font-weight: 700;
            color: var(--muted);
            background: var(--panel);
            border-bottom: 1px solid var(--line);
          }

          .info-value,
          .field-value {
            padding: 2.6mm 3mm;
            white-space: pre-wrap;
            word-break: break-word;
            align-self: center;
          }

          .field-label-inline,
          .field-value-inline {
            padding: 2.4mm 3mm;
            min-height: 100%;
            display: flex;
            align-items: center;
          }

          .field-label-inline {
            background: var(--panel);
            border-right: 1px solid var(--line);
            color: var(--muted);
            font-size: 8.6pt;
            font-weight: 700;
          }

          .field-value-inline {
            white-space: pre-wrap;
            word-break: break-word;
          }

          .page-title {
            font-size: 22pt;
            font-weight: 700;
            line-height: 1.08;
            margin: 0 0 4mm 0;
            break-after: avoid;
            page-break-after: avoid;
          }

          .page-intro,
          .body-note {
            color: var(--muted);
            margin: 0 0 4mm 0;
            white-space: pre-wrap;
          }

          .body-note {
            border: 1px solid var(--line);
            background: var(--panel);
            padding: 4mm;
          }

          .section-heading {
            font-size: 14pt;
            font-weight: 700;
            margin: 0 0 3mm 0;
          }

          .subsection-title {
            font-size: 12.5pt;
            font-weight: 700;
            margin: 0 0 2.4mm 0;
            break-after: avoid;
            page-break-after: avoid;
          }

          .info-section,
          .followup-section,
          .document-group,
          .panel-section,
          .paneldynamic-section,
          .matrix-section {
            margin-bottom: 6mm;
          }

          .matrix-section {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .followup-section {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .followup-section > .section-heading,
          .followup-section > .page-intro,
          .document-group > .section-heading,
          .panel-section > .section-heading,
          .paneldynamic-section > .section-heading,
          .matrix-section > .subsection-title {
            break-after: avoid;
            page-break-after: avoid;
          }

          .section-heading + .field-grid,
          .section-heading + .paneldynamic-list,
          .section-heading + .report-table,
          .subsection-title + .report-table,
          .matrix-continuation-label + .report-table {
            break-before: avoid;
            page-break-before: avoid;
          }

          .followup-section .followup-card:first-of-type,
          .document-group > .report-table,
          .matrix-section > .report-table {
            break-before: avoid;
            page-break-before: avoid;
          }

          .no-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .summary-band {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 3mm;
            margin-top: 6mm;
          }

          .summary-item {
            border: 1px solid var(--line);
            background: var(--panel);
            padding: 3mm;
          }

          .summary-label {
            font-size: 8.5pt;
            color: var(--muted);
            margin-bottom: 1mm;
          }

          .summary-value {
            font-size: 15pt;
            font-weight: 700;
          }

          .report-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            border: 1px solid var(--line);
          }

          .report-table thead {
            display: table-header-group;
          }

          .report-table th,
          .report-table td {
            border: 1px solid var(--line);
            padding: 2.4mm 3mm;
            vertical-align: top;
            white-space: pre-wrap;
            word-break: normal;
            overflow-wrap: anywhere;
          }

          .matrix-table th,
          .matrix-table td {
            vertical-align: middle;
          }

          .report-table th {
            background: var(--panel);
            color: var(--muted);
            font-size: 8.8pt;
            font-weight: 700;
            text-align: left;
          }

          .align-center {
            text-align: center;
          }

          .report-table td.item-code-cell {
            white-space: nowrap;
            word-break: keep-all;
            overflow-wrap: normal;
          }

          .assessment-chip {
            display: inline-block;
            min-width: 18mm;
            padding: 1.2mm 2.2mm;
            border-radius: 999px;
            border: 1px solid var(--line);
            background: white;
            font-size: 9pt;
            font-weight: 700;
            text-align: center;
          }

          .assessment-chip.is-yes {
            border-color: #9ad8bb;
            background: var(--success-soft);
            color: #135f49;
          }

          .assessment-chip.is-no {
            border-color: #f0b0ab;
            background: #fff2f1;
            color: #9f2620;
          }

          .assessment-chip.is-neutral {
            color: #42546c;
            background: #f6f8fb;
          }

          .paneldynamic-list,
          .remarks-list,
          .signature-list {
            display: grid;
            gap: 5mm;
          }

          .paneldynamic-card,
          .remark-card,
          .followup-card,
          .signature-block {
            border: 1px solid var(--line);
            background: white;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .paneldynamic-card-head,
          .followup-card-head {
            display: flex;
            align-items: center;
            gap: 3mm;
            padding: 3mm 3.4mm 0 3.4mm;
          }

          .paneldynamic-index {
            width: 10mm;
            height: 10mm;
            border-radius: 999px;
            border: 1px solid var(--line);
            background: var(--panel);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            flex: 0 0 auto;
          }

          .paneldynamic-title,
          .followup-title {
            font-size: 12pt;
            font-weight: 700;
          }

          .followup-status {
            margin-left: auto;
            padding: 1.2mm 2.4mm;
            border-radius: 999px;
            border: 1px solid var(--line);
            background: var(--panel);
            font-size: 8.8pt;
            font-weight: 700;
          }

          .paneldynamic-card .field-grid,
          .followup-card .followup-grid,
          .remark-card .remarks-grid {
            padding: 3.4mm;
          }

          .followup-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 3mm;
          }

          .linked-documents {
            border-top: 1px solid var(--line);
            padding: 3.4mm;
          }

          .linked-documents-title {
            font-size: 10pt;
            font-weight: 700;
            margin-bottom: 3mm;
          }

          .attachment-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 3mm;
          }

          .attachment-card {
            border: 1px solid var(--line);
            background: var(--panel);
            display: grid;
            grid-template-columns: 30mm minmax(0, 1fr);
            gap: 3mm;
            align-items: stretch;
            overflow: hidden;
          }

          .attachment-preview {
            min-height: 24mm;
            background: #dfe6ef;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--muted);
            font-size: 9pt;
            font-weight: 700;
          }

          .attachment-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .attachment-body {
            padding: 2.8mm 3mm 2.8mm 0;
          }

          .attachment-title {
            font-size: 10pt;
            font-weight: 700;
            margin-bottom: 1.2mm;
          }

          .attachment-meta,
          .attachment-note {
            font-size: 8.8pt;
            color: var(--muted);
          }

          .document-table th:nth-child(1) { width: 28%; }
          .document-table th:nth-child(2) { width: 18%; }
          .document-table th:nth-child(3) { width: 14%; }
          .document-table th:nth-child(4) { width: 10%; }
          .document-table th:nth-child(5) { width: 30%; }

          .appendix-table th:nth-child(1) { width: 34%; }
          .appendix-table th:nth-child(2) { width: 12%; }
          .appendix-table th:nth-child(3) { width: 30%; }
          .appendix-table th:nth-child(4) { width: 24%; }

          .appendix-table th:nth-child(1) { width: 34%; }
          .appendix-table th:nth-child(2) { width: 12%; }
          .appendix-table th:nth-child(3) { width: 30%; }
          .appendix-table th:nth-child(4) { width: 24%; }

          .signature-grid {
            display: grid;
            gap: 4mm;
          }

          .signature-block-header {
            display: flex;
            justify-content: space-between;
            gap: 4mm;
            align-items: flex-start;
            padding: 3.4mm 3.8mm 0 3.8mm;
          }

          .signature-title {
            font-size: 12pt;
            font-weight: 700;
          }

          .signature-subtitle {
            margin-top: 1.2mm;
            color: var(--muted);
            font-size: 9pt;
            line-height: 1.35;
          }

          .signature-state {
            max-width: 46mm;
            text-align: right;
            color: var(--muted);
            font-size: 8.8pt;
            font-weight: 700;
          }

          .signature-body {
            padding: 3.8mm;
          }

          .signature-meta {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 3mm;
            margin-bottom: 3.4mm;
          }

          .signature-box {
            border: 1px solid var(--line);
            min-height: 28mm;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            overflow: hidden;
            padding: 3mm 5mm;
          }

          .signature-box img {
            max-width: 100%;
            max-height: 22mm;
            object-fit: contain;
            display: block;
          }

          .signature-empty {
            width: 72mm;
            height: 16mm;
            border-bottom: 1px solid #878787;
          }

          .signature-footer {
            padding: 0 3.8mm 3.8mm 3.8mm;
            font-size: 8.8pt;
            color: var(--muted);
          }

          .signature-closing {
            margin-top: 6mm;
            color: var(--muted);
          }

          .value-list,
          .object-grid {
            margin: 0;
            padding: 0;
            list-style: none;
            display: grid;
            gap: 1.4mm;
          }

          .object-row {
            display: grid;
            grid-template-columns: 28mm minmax(0, 1fr);
            gap: 2mm;
          }

          .object-key {
            color: var(--muted);
            font-size: 8.4pt;
            font-weight: 700;
          }

          .muted {
            color: var(--muted);
          }

          .empty-box {
            border: 1px dashed var(--line);
            padding: 5mm;
            color: var(--muted);
            background: white;
          }

          .landscape-page {
            page: landscape;
          }

          .landscape-page .report-table {
            table-layout: auto;
          }

          .landscape-page .report-table th,
          .landscape-page .report-table td {
            font-size: 9pt;
            padding: 2.2mm 2.4mm;
          }

          .landscape-page .field-grid,
          .landscape-page .remarks-grid,
          .landscape-page .followup-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .matrix-split-block + .matrix-split-block {
            margin-top: 4mm;
          }

          .matrix-split-block.is-prestatie-followup col:first-child {
            width: 18%;
          }

          .matrix-split-block.is-prestatie-followup col:nth-child(2) {
            width: 18%;
          }

          .matrix-split-block.is-prestatie-followup col:nth-child(3),
          .matrix-split-block.is-prestatie-followup col:nth-child(4),
          .matrix-split-block.is-prestatie-followup col:nth-child(5),
          .matrix-split-block.is-prestatie-followup col:nth-child(6) {
            width: 16%;
          }

          .matrix-continuation-label {
            margin: 0 0 2mm 0;
            color: var(--muted);
            font-size: 9pt;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        ${bodyContent}
      </body>
    </html>
  `;
}

async function getBrowser() {
  if (!browserPromise) {
    const launchPromise = (async () => {
      if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
      }

      const { chromium } = await import("playwright");
      const executablePath = chromium.executablePath();

      console.log("[form report pdf] launching playwright chromium", {
        browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH,
        executablePath,
      });

      return chromium.launch({ headless: true });
    })();

    browserPromise = launchPromise.catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function tryBuildHtmlFormReportPdf(model: any): Promise<any> {
  const browser = await getBrowser();
  const coverPage = await browser.newPage();
  const bodyPage = await browser.newPage();

  try {
    const coverHtml = renderHtmlDocument(model);
    const bodyHtml = renderBodyHtmlDocument(model);
    await coverPage.setContent(coverHtml, { waitUntil: "load" });
    await bodyPage.setContent(bodyHtml, { waitUntil: "load" });

    const coverBuffer = Buffer.from(
      await coverPage.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: false,
        margin: {
          top: "0mm",
          right: "0mm",
          bottom: "0mm",
          left: "0mm",
        },
        pageRanges: "1",
      })
    );

    const bodyBuffer = Buffer.from(
      await bodyPage.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        margin: {
          top: "18mm",
          right: "12mm",
          bottom: "16mm",
          left: "12mm",
        },
        headerTemplate: buildPdfHeaderTemplate(model),
        footerTemplate: `
          <div style="width:100%;padding:0 12mm;font-size:8pt;color:#52627a;font-family:Calibri,Arial,sans-serif;box-sizing:border-box;">
            <div style="width:100%;display:flex;justify-content:space-between;align-items:center;">
              <span>${escapeHtml(footerLeftLabel(model))}</span>
              <span>Pagina <span class="pageNumber"></span> / <span class="totalPages"></span></span>
            </div>
          </div>
        `,
      })
    );

    const mergedPdf = await PDFDocument.create();
    for (const sourceBuffer of [coverBuffer, bodyBuffer]) {
      const sourcePdf = await PDFDocument.load(sourceBuffer);
      const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      for (const copiedPage of copiedPages) {
        mergedPdf.addPage(copiedPage);
      }
    }

    const buffer = Buffer.from(await mergedPdf.save());

    return buildFormReportResult(buffer, model);
  } finally {
    await coverPage.close();
    await bodyPage.close();
  }
}
