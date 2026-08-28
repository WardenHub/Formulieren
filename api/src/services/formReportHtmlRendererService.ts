import fs from "node:fs";
import path from "node:path";
import type { Browser } from "playwright";
import {
  markRuntimeRendererFailed,
  markRuntimeRendererReady,
  markRuntimeRendererWarmUp,
} from "./runtimeStatusService.js";
import { PDFDocument } from "pdf-lib";

import { buildFormReportResult, formatExportDate } from "./formReportExportModelService.js";

let browserPromise: Promise<Browser> | null = null;
let browserWarmUpPromise: Promise<void> | null = null;
let rendererPrimePromise: Promise<void> | null = null;

type RenderProgressReporter = (phase: string, message: string, progress?: number) => void;

function positiveNumber(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const runtimeNodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
const isLocalDevelopmentRuntime = runtimeNodeEnv === "development" || runtimeNodeEnv === "dev" || !!process.env.TSX_WATCH;
const isHostedRuntime =
  !!normalizeText(process.env.WEBSITE_INSTANCE_ID) ||
  !!normalizeText(process.env.WEBSITE_SITE_NAME) ||
  !!normalizeText(process.env.WEBSITE_HOSTNAME);
const PLAYWRIGHT_LAUNCH_TIMEOUT_MS = positiveNumber(
  process.env.FORM_REPORT_PLAYWRIGHT_LAUNCH_TIMEOUT_MS,
  isLocalDevelopmentRuntime ? 12000 : 30000
);
const FORM_REPORT_RENDER_STEP_TIMEOUT_MS = positiveNumber(
  process.env.FORM_REPORT_RENDER_STEP_TIMEOUT_MS,
  isLocalDevelopmentRuntime ? 30000 : 45000
);

async function withTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function existingPath(value: any) {
  const candidate = normalizeText(value);
  if (!candidate) return "";
  return fs.existsSync(candidate) ? candidate : "";
}

function resolveBundledRuntimeRoot() {
  const candidates = [
    normalizeText(process.env.PLAYWRIGHT_RUNTIME_ROOT),
    "/home/site/wwwroot/playwright-runtime",
    path.join(process.cwd(), "playwright-runtime"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return "";
}

function remapBundledExecutablePath(value: any) {
  const candidate = normalizeText(value);
  if (!candidate) return "";

  const direct = existingPath(candidate);
  if (direct) return direct;

  const runtimeRoot = resolveBundledRuntimeRoot();
  const browsersRootCandidates = [
    normalizeText(process.env.PLAYWRIGHT_BROWSERS_PATH),
    "/home/site/wwwroot/playwright-browsers",
    path.join(process.cwd(), "playwright-browsers"),
  ].filter(Boolean);

  if (runtimeRoot && !path.isAbsolute(candidate)) {
    const rootedCandidate = existingPath(path.join(process.cwd(), candidate));
    if (rootedCandidate) return rootedCandidate;
  }

  const normalizedCandidate = candidate.replace(/\\/g, "/");
  const marker = "/playwright-browsers/";
  const markerIndex = normalizedCandidate.indexOf(marker);
  if (markerIndex >= 0) {
    const suffix = normalizedCandidate.slice(markerIndex + marker.length);
    for (const browsersRoot of browsersRootCandidates) {
      const remapped = existingPath(path.join(browsersRoot, ...suffix.split("/")));
      if (remapped) return remapped;
    }
  }

  return "";
}

function readPlaywrightExecutablePathFile() {
  const candidateFiles = [
    normalizeText(process.env.PLAYWRIGHT_EXECUTABLE_PATH_FILE),
    "/home/site/wwwroot/playwright-runtime/browser-executable.txt",
    path.join(process.cwd(), "playwright-runtime", "browser-executable.txt"),
  ].filter(Boolean);

  for (const candidateFile of candidateFiles) {
    try {
      if (!fs.existsSync(candidateFile)) continue;
      const executablePath = remapBundledExecutablePath(fs.readFileSync(candidateFile, "utf8"));
      if (executablePath) return executablePath;
    } catch {
      // ignore read failures; other candidates may still work
    }
  }

  return "";
}

function resolvePlaywrightExecutablePath() {
  const explicit =
    existingPath(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) ||
    existingPath(process.env.PLAYWRIGHT_EXECUTABLE_PATH) ||
    existingPath(process.env.CHROME_EXECUTABLE_PATH);
  if (explicit) return explicit;

  const bundledExecutable = readPlaywrightExecutablePathFile();
  const rootedExecutable = resolvePlaywrightExecutablePathFromRoots([
    normalizeText(process.env.PLAYWRIGHT_BROWSERS_PATH),
    "/home/site/wwwroot/playwright-browsers",
    path.join(process.cwd(), "playwright-browsers"),
  ]);

  if (isHostedRuntime) {
    return bundledExecutable || rootedExecutable;
  }

  return "";
}

function hasUsablePlaywrightBrowserRoot(rootPath: any) {
  const root = normalizeText(rootPath);
  if (!root) return false;
  if (!fs.existsSync(root)) return false;
  return Boolean(resolvePlaywrightExecutablePathFromRoots([root]));
}

let preparedPlaywrightRuntimeLibPath = "";

function isUnsafePlaywrightRuntimeLibrary(fileName: string) {
  return [
    /^libc\.so(\..+)?$/i,
    /^libpthread\.so(\..+)?$/i,
    /^libdl\.so(\..+)?$/i,
    /^librt\.so(\..+)?$/i,
    /^libm\.so(\..+)?$/i,
    /^ld-linux.*\.so(\..+)?$/i,
    /^ld-musl.*\.so(\..+)?$/i,
  ].some((pattern) => pattern.test(fileName));
}

function resolvePlaywrightRuntimeLibPath() {
  if (preparedPlaywrightRuntimeLibPath && fs.existsSync(preparedPlaywrightRuntimeLibPath)) {
    return preparedPlaywrightRuntimeLibPath;
  }

  const candidates = [
    normalizeText(process.env.PLAYWRIGHT_RUNTIME_LIB_PATH),
    "/home/site/wwwroot/playwright-runtime/lib",
    path.join(process.cwd(), "playwright-runtime", "lib"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;

    const fileNames = fs
      .readdirSync(candidate, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    const safeFileNames = fileNames.filter((fileName) => !isUnsafePlaywrightRuntimeLibrary(fileName));
    const ignoredFileNames = fileNames.filter((fileName) => isUnsafePlaywrightRuntimeLibrary(fileName));

    if (!safeFileNames.length) {
      if (ignoredFileNames.length) {
        console.warn("[form report pdf] playwright runtime lib path only contains ignored core libraries", {
          runtimeLibPath: candidate,
          ignoredFiles: ignoredFileNames,
        });
      }
      continue;
    }

    const sanitizedRuntimeDir = path.join(
      process.env.TMPDIR || process.env.TEMP || process.env.TMP || "/tmp",
      "ember-playwright-runtime-libs"
    );
    fs.mkdirSync(sanitizedRuntimeDir, { recursive: true });

    for (const existingEntry of fs.readdirSync(sanitizedRuntimeDir, { withFileTypes: true })) {
      if (!existingEntry.isFile()) continue;
      fs.rmSync(path.join(sanitizedRuntimeDir, existingEntry.name), { force: true });
    }

    for (const fileName of safeFileNames) {
      fs.copyFileSync(path.join(candidate, fileName), path.join(sanitizedRuntimeDir, fileName));
    }

    if (ignoredFileNames.length) {
      console.warn("[form report pdf] playwright runtime lib path contained ignored core libraries", {
        runtimeLibPath: candidate,
        ignoredFiles: ignoredFileNames,
      });
    }

    preparedPlaywrightRuntimeLibPath = sanitizedRuntimeDir;
    return preparedPlaywrightRuntimeLibPath;
  }

  return "";
}

function resolvePlaywrightExecutablePathFromRoots(roots: any[]) {
  const browserRoots = roots.filter(Boolean);

  for (const root of browserRoots) {
    const directHeadlessShellCandidates = [
      path.join(root, "chromium_headless_shell", "chrome-headless-shell-linux64", "chrome-headless-shell"),
    ];
    const directChromeCandidates = [
      path.join(root, "chromium", "chrome-linux64", "chrome"),
      path.join(root, "chromium", "chrome-win", "chrome.exe"),
      path.join(root, "chromium", "chrome-win64", "chrome.exe"),
      path.join(root, "chromium", "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
    ];
    for (const candidate of [...directHeadlessShellCandidates, ...directChromeCandidates]) {
      if (fs.existsSync(candidate)) return candidate;
    }

    try {
      const entries = fs
        .readdirSync(root, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            (entry.name.startsWith("chromium_headless_shell-") || entry.name.startsWith("chromium-"))
        )
        .sort((a, b) => b.name.localeCompare(a.name));

      for (const entry of entries) {
        const base = path.join(root, entry.name);
        const nestedHeadlessShellCandidates = [
          path.join(base, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        ];
        const nestedChromeCandidates = [
          path.join(base, "chrome-linux64", "chrome"),
          path.join(base, "chrome-win", "chrome.exe"),
          path.join(base, "chrome-win64", "chrome.exe"),
          path.join(base, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        ];
        for (const candidate of [...nestedHeadlessShellCandidates, ...nestedChromeCandidates]) {
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch {
      // ignore lookup failures; launch will fall back to Playwright defaults
    }
  }

  return "";
}

function clearBrowserPromise() {
  browserPromise = null;
}

function resolveBundledFontconfigRoot() {
  const runtimeRoot = resolveBundledRuntimeRoot();
  if (!runtimeRoot) return "";

  const candidate = path.join(runtimeRoot, "fontconfig");
  return fs.existsSync(path.join(candidate, "etc", "fonts", "fonts.conf")) ? candidate : "";
}

function ensurePlaywrightRuntimeHome() {
  const baseDir = path.join(
    process.env.TMPDIR || process.env.TEMP || process.env.TMP || "/tmp",
    "ember-playwright-home"
  );

  for (const candidate of [
    baseDir,
    path.join(baseDir, ".cache"),
    path.join(baseDir, ".config"),
    path.join(baseDir, ".runtime"),
    path.join(baseDir, ".local"),
    path.join(baseDir, ".local", "share"),
    path.join(baseDir, ".local", "share", "pki"),
    path.join(baseDir, ".local", "share", "pki", "nssdb"),
  ]) {
    fs.mkdirSync(candidate, { recursive: true });
  }

  return baseDir;
}

function buildPlaywrightLaunchEnv(runtimeLibPath: string) {
  const env: Record<string, string> = {
    ...process.env,
  } as Record<string, string>;

  const runtimeHome = ensurePlaywrightRuntimeHome();
  if (runtimeLibPath) {
    env.LD_LIBRARY_PATH = `${runtimeLibPath}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}`;
  }

  const fontconfigRoot = resolveBundledFontconfigRoot();
  if (fontconfigRoot) {
    env.FONTCONFIG_SYSROOT = fontconfigRoot;
    env.FONTCONFIG_PATH = path.join(fontconfigRoot, "etc", "fonts");
    env.FONTCONFIG_FILE = path.join(fontconfigRoot, "etc", "fonts", "fonts.conf");
  } else {
    env.FONTCONFIG_PATH = normalizeText(process.env.FONTCONFIG_PATH) || "/etc/fonts";
    env.FONTCONFIG_FILE = normalizeText(process.env.FONTCONFIG_FILE) || "/etc/fonts/fonts.conf";
  }

  env.HOME = runtimeHome;
  env.XDG_CACHE_HOME = path.join(runtimeHome, ".cache");
  env.XDG_CONFIG_HOME = path.join(runtimeHome, ".config");
  env.XDG_RUNTIME_DIR = path.join(runtimeHome, ".runtime");
  env.XDG_DATA_HOME = path.join(runtimeHome, ".local", "share");

  return env;
}

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
  return (
    normalizeToken(model?.form?.document_profile_key) === "CERTIFIED_MAINTENANCE_REPORT" ||
    normalizeToken(model?.form?.code) === "MAINT_BMI"
  );
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
  if (["JA", "NEE", "NVT"].includes(normalizeToken(text))) {
    return renderAssessmentChip(text);
  }
  return text ? escapeHtml(text) : `<span class="muted">-</span>`;
}

function renderInfoSection(title: string, rows: Array<{ label: string; value: any }>) {
  const safeRows = nonEmptyRows(rows);
  if (!safeRows.length) return "";

  return `
    <section class="info-section">
      <div class="section-heading">${escapeHtml(title)}</div>
      <table class="report-table info-table">
        <tbody>
        ${safeRows
          .map(
            (row) => `
              <tr>
                <th>${escapeHtml(row.label)}</th>
                <td>${renderValueCell(row.value)}</td>
              </tr>
            `
          )
          .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderInfoPairsSection(title: string, rows: Array<{ label: string; value: any }>, sectionClassName = "") {
  const safeRows = nonEmptyRows(rows);
  if (!safeRows.length) return "";

  const pairs = Array.from({ length: Math.ceil(safeRows.length / 2) }, (_, index) => safeRows.slice(index * 2, index * 2 + 2));
  return `
    <section class="info-section ${escapeHtml(sectionClassName)}">
      ${title ? `<div class="section-heading">${escapeHtml(title)}</div>` : ""}
      <table class="report-table info-pairs-table">
        <tbody>
          ${pairs
            .map(
              (pair) => `
                <tr>
                  <th>${escapeHtml(pair[0].label)}</th>
                  <td>${renderValueCell(pair[0].value)}</td>
                  ${
                    pair[1]
                      ? `<th>${escapeHtml(pair[1].label)}</th><td>${renderValueCell(pair[1].value)}</td>`
                      : `<td colspan="3"></td>`
                  }
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
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
  if (token === "INFORMATIEF") return "Informatief";
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

function renderFollowUpStatusChip(value: any) {
  const token = normalizeToken(value);
  const className =
    token === "INFORMATIEF"
      ? "is-informative"
      : token === "AFGEHANDELD"
        ? "is-yes"
        : token === "AFGEWEZEN" || token === "VERVALLEN"
          ? "is-neutral"
          : token === "OPEN" || token === "PLANNING_NODIG" || token === "WACHTENOPDERDEN"
            ? "is-no"
            : "is-neutral";
  return `<span class="assessment-chip status-chip ${className}">${escapeHtml(normalizedStatusLabel(value))}</span>`;
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
        <div class="cover-footer-grid">
          <div class="cover-certification-mark">
            ${
              model?.assets?.certificationMark?.dataUrl
                ? `<img src="${model.assets.certificationMark.dataUrl}" alt="${escapeHtml(firstText(model.assets.certificationMark.displayName, "Certificeringsbeeldmerk"))}" />`
                : ""
            }
          </div>
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
          <div class="cover-footer-balance" aria-hidden="true"></div>
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
        ${matrixColumnWidths(columns).map((width: string) => `<col style="width:${width}">`).join("")}
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
  return matrixColumnWidths(columns).reduce((total: number, widthText: string) => {
    const width = Number(String(widthText || "").replace("%", "").trim());
    return total + (Number.isFinite(width) ? width : 0);
  }, 0);
}

function renderBmiGeneralPage(model: any, page: any) {
  const answers = model?.answers || {};
  const renderGroup = (title: string, rows: Array<{ label: string; value: any }>) => renderInfoPairsSection(title, rows, "general-info-section");

  return `
    <section class="page-break-before report-page bmi-general-page">
      <div class="page-title">${escapeHtml(firstText(page?.title, "Algemeen"))}</div>
      ${renderGroup("", [
        { label: "Datum onderhoud", value: answerDateText(answers, "datum_onderhoud") },
        { label: "Documentnummer", value: firstText(answerText(answers, "documentnummer"), model?.form?.official_document_number) },
      ])}
      ${renderGroup("Bouwwerk", [
        { label: "Naam", value: answerText(answers, "bouwwerk_naam") },
        { label: "Soort", value: answerText(answers, "bouwwerk_soort") },
        { label: "Eisende partij", value: answerText(answers, "eisende_partij") },
        { label: "Adres", value: joinNonEmpty([answerText(answers, "bouwwerk_straat"), joinNonEmpty([answerText(answers, "bouwwerk_postcode"), answerText(answers, "bouwwerk_plaats")], " ")], ", ") },
      ])}
      ${renderGroup("Onderhoudsbedrijf", [
        { label: "Naam", value: answerText(answers, "onderhoudsbedrijf_naam") },
        { label: "Adres", value: joinNonEmpty([answerText(answers, "onderhoudsbedrijf_straat_huisnr"), answerText(answers, "onderhoudsbedrijf_postcode_plaats")], ", ") },
      ])}
      ${renderGroup("Brandmeldinstallatiebedrijf", [
        { label: "Naam", value: answerText(answers, "brandmeldinstallatiebedrijf_naam") },
        { label: "Adres", value: joinNonEmpty([answerText(answers, "brandmeldinstallatiebedrijf_straat_huisnr"), answerText(answers, "brandmeldinstallatiebedrijf_postcode_plaats")], ", ") },
      ])}
      ${renderGroup("Eigenaar", [
        { label: "Naam", value: answerText(answers, "eigenaar_naam") },
        { label: "Adres", value: answerText(answers, "eigenaar_adres") },
      ])}
      ${renderGroup("Gebruiker", [
        { label: "Naam", value: answerText(answers, "gebruiker_naam") },
        { label: "Adres", value: answerText(answers, "gebruiker_adres") },
      ])}
      ${renderGroup("Doormelding", [
        { label: "Kiezer", value: answerText(answers, "kiezer_omschrijving") },
        { label: "Lijnkeuze", value: answerText(answers, "kiezer_lijnkeuze") },
        { label: "Brand", value: joinNonEmpty([answerText(answers, "brand_ontvangststation"), answerText(answers, "brand_telefoon"), answerText(answers, "brand_meldcode")], " ; ") },
        { label: "Storing", value: joinNonEmpty([answerText(answers, "storing_ontvangststation"), answerText(answers, "storing_telefoon"), answerText(answers, "storing_meldcode")], " ; ") },
      ])}
    </section>
  `;
}

function normalizedPercentBefore(columns: any[], endExclusive: number) {
  const widths = matrixColumnWidths(columns);
  return widths.slice(0, endExclusive).reduce((total: number, widthText: string) => {
    const width = Number(String(widthText || "").replace("%", "").trim());
    return total + (Number.isFinite(width) ? width : 0);
  }, 0);
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

function firstMatrixInElement(element: any): any {
  if (!element || typeof element !== "object") return null;
  if (normalizeText(element?.type).toLowerCase() === "matrixdynamic") return element;

  const children = Array.isArray(element?.elements) ? element.elements : [];
  for (const child of children) {
    const matrix = firstMatrixInElement(child);
    if (matrix) return matrix;
  }

  return null;
}

function lastMatrixInElement(element: any): any {
  if (!element || typeof element !== "object") return null;
  if (normalizeText(element?.type).toLowerCase() === "matrixdynamic") return element;

  const children = Array.isArray(element?.elements) ? element.elements : [];
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const matrix = lastMatrixInElement(children[index]);
    if (matrix) return matrix;
  }

  return null;
}

function alignmentMatrixForAdjacent(previousElement: any, nextElement: any) {
  return firstMatrixInElement(nextElement) || lastMatrixInElement(previousElement) || null;
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
    if (name.includes("ITEMCODE")) return `${Math.max(14, explicitWidth)}%`;
    if (name.includes("VOLDOET")) return `${Math.max(18, explicitWidth)}%`;
    if (name.includes("OPMERKING")) return `${Math.max(24, explicitWidth)}%`;
    if (name.includes("ONDERWERP") || name.includes("OMSCHRIJVING")) return `${Math.max(30, explicitWidth)}%`;
    return `${explicitWidth}%`;
  }

  if (name.includes("ITEMCODE")) return "14%";
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

function matrixColumnWidths(columns: any[]) {
  const rawWidths = columns.map((column: any) => {
    const width = Number(String(matrixColumnWidth(column, columns.length) || "").replace("%", "").trim());
    return Number.isFinite(width) && width > 0 ? width : 1;
  });
  const totalWidth = rawWidths.reduce((total: number, width: number) => total + width, 0) || 1;

  return rawWidths.map((width: number) => `${((width / totalWidth) * 100).toFixed(4)}%`);
}

function renderAssessmentChip(value: any) {
  const token = normalizeToken(value);
  const label = token === "NVT" ? "N.V.T." : displayText(value);
  const className =
    token === "JA" ? "is-yes" : token === "NEE" ? "is-no" : token === "NVT" ? "is-neutral" : "";
  return `<span class="assessment-chip ${className}">${escapeHtml(label)}</span>`;
}

function renderCertificateImpactChip(value: any) {
  const token = normalizeColumnToken(value);
  if (token === "YES" || token === "JA") return `<span class="assessment-chip is-no">Ja</span>`;
  if (token === "NO" || token === "NEE") return `<span class="assessment-chip is-yes">Nee</span>`;
  return escapeHtml(displayText(value));
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

function matrixRenderClass(element: any) {
  const token = normalizeColumnToken(`${element?.name || ""} ${labelForElement(element)}`);
  if (token.includes("PRESTATIEEIS")) return "is-prestatie-eisen";
  if (token.includes("SYSTEEMBESCHIKBAARHEID") || token.includes("PERIODENNIETBESCHIKBAAR")) return "is-systeembeschikbaarheid";
  if (token.includes("MEETRESULTAAT")) return "is-meetresultaten";
  return "";
}

function matrixContinuationTitle(element: any, title: string) {
  const token = normalizeColumnToken(`${element?.name || ""} ${title}`);
  if (token.includes("PERIODENNIETBESCHIKBAAR")) return "Perioden niet beschikbaar (vervolg)";
  return "";
}

function renderMatrixTableMarkup(columns: any[], rows: any[], options: { continuationTitle?: string } = {}) {
  return `
    <table class="report-table matrix-table">
      <colgroup>
        ${matrixColumnWidths(columns).map((width: string) => `<col style="width:${width}">`).join("")}
      </colgroup>
      <thead>
        ${
          options.continuationTitle
            ? `<tr class="matrix-continuation-row"><th colspan="${columns.length}">${escapeHtml(options.continuationTitle)}</th></tr>`
            : ""
        }
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

function renderEnergySupplyMatrix(element: any, answers: any) {
  const rows = matrixRows(element, answers).filter((row: any) => row && typeof row === "object");
  if (!rows.length) return "";

  const columns = [
    { key: "es_locatie", title: "Locatie", width: "12%" },
    { key: "es_datum", title: "Plaatsingsdatum", width: "9%" },
    { key: "es_merk_type", title: "Merk/type", width: "9%" },
    { key: "es_aantal", title: "Aantal", width: "5%" },
    { key: "es_capaciteit_ah", title: "Cap. per accu", width: "7%" },
    { key: "es_schakeling", title: "Schakeling", width: "8%" },
    { key: "es_effectieve_ah", title: "Aanwezig", width: "7%" },
    { key: "es_benodigd_ah", title: "Benodigd", width: "7%" },
    { key: "es_alarmstroom_ma", title: "Alarm", width: "6%" },
    { key: "es_ruststroom_ma", title: "Rust", width: "6%" },
    { key: "es_overbrugging_uren", title: "Overbrugging", width: "8%" },
    { key: "es_opmerking", title: "Opmerking", width: "16%" },
  ];

  return `
    <section class="matrix-section is-energy-supply">
      <div class="subsection-title">Energievoorzieningen</div>
      <table class="report-table energy-supply-table">
        <colgroup>${columns.map((column) => `<col style="width:${column.width}">`).join("")}</colgroup>
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.title)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row: any) => `<tr>${columns.map((column) => `<td>${renderValueCell(row?.[column.key])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </section>
  `;
}

function renderMatrixTable(element: any, answers: any, options: { nested?: boolean } = {}) {
  const columns = matrixColumns(element);
  const rows = matrixRows(element, answers)
    .filter((row: any) => isPrintableMatrixRow(row, columns));
  if (!rows.length) return "";

  if (normalizeColumnToken(`${element?.name || ""} ${labelForElement(element)}`) === "ESREGELSENERGIEVOORZIENINGEN") {
    return renderEnergySupplyMatrix(element, answers);
  }

  const rawTitle = labelForElement(element);
  const title = normalizeColumnToken(rawTitle) === "OVERZICHTPRESTATIEEISENPERREGEL" ? "Overzicht prestatie-eisen" : rawTitle;
  const visibleTitle = shouldHideGeneratedSubsectionTitle(title) ? "" : title;
  const isPrestatieEisenMatrix =
    columns.some((column: any) => normalizeColumnToken(`${column?.name || ""} ${column?.title || ""}`).includes("GEBRUIKERSFUNCTIE")) &&
    columns.some((column: any) => normalizeColumnToken(`${column?.name || ""} ${column?.title || ""}`) === "A" || normalizeColumnToken(column?.title) === "A") &&
    columns.some((column: any) => normalizeColumnToken(`${column?.name || ""} ${column?.title || ""}`).includes("ASP"));
  const renderClass = matrixRenderClass(element);
  const continuationTitle = matrixContinuationTitle(element, visibleTitle);

  const shouldSplitWideMatrix = columns.length >= 9 && !isPrestatieEisenMatrix;
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
      <section class="matrix-section ${options.nested ? "nested" : ""} ${renderClass}">
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
                ${renderMatrixTableMarkup(chunkColumns, rows, { continuationTitle: index > 0 ? continuationTitle : "" })}
              </div>
            `;
          })
          .join("")}
      </section>
    `;
  }

  return `
    <section class="matrix-section ${options.nested ? "nested" : ""} ${renderClass}">
      ${visibleTitle ? `<div class="subsection-title">${escapeHtml(visibleTitle)}</div>` : ""}
      ${renderMatrixTableMarkup(columns, rows, { continuationTitle })}
    </section>
  `;
}

function simpleFieldTypes() {
  return new Set(["text", "dropdown", "radiogroup", "comment", "boolean", "expression"]);
}

function renderPanel(element: any, answers: any, options: { dividerPercent?: number; alignmentMatrix?: any } = {}) {
  if (normalizeColumnToken(element?.name) === "A2RESULTAATPANEL") {
    const pveValue = answerFor(answers, "a2_systeembeschikbaarheid_pve");
    const actualValue = answerFor(answers, "a2_systeembeschikbaarheid_geconstateerd");
    const pve = availabilityNumber(pveValue);
    const actual = availabilityNumber(actualValue);
    const actualClass = pve != null && actual != null ? (actual >= pve ? "is-yes" : "is-no") : "";
    return `
      <section class="panel-section a2-result-section">
        <div class="section-heading">${escapeHtml(labelForElement(element))}</div>
        <table class="report-table availability-result-table">
          <tbody><tr>
            <th>Melduren buiten werking</th><td>${renderValueCell(answerFor(answers, "a2_melduren_buiten_werking"))}</td>
            <th>Aantal melders</th><td>${renderValueCell(answerFor(answers, "a2_aantal_melders"))}</td>
          </tr><tr>
            <th>Systeembeschikbaarheid volgens PvE</th><td>${renderValueCell(pveValue)}</td>
            <th>Geconstateerde systeembeschikbaarheid</th><td><span class="availability-value ${actualClass}">${escapeHtml(displayText(actualValue))}</span></td>
          </tr></tbody>
        </table>
      </section>
    `;
  }

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
  const elementToken = normalizeColumnToken(`${element?.name || ""} ${title}`);

  if (elementToken.includes("ENERGIEVOORZIEN")) {
    const visibleFields = templateElements.filter((child: any) => simpleFieldTypes().has(normalizeText(child?.type).toLowerCase()));
    const locationField = visibleFields.find((child: any) => normalizeColumnToken(`${child?.name || ""} ${labelForElement(child)}`).includes("LOCATIE"));
    const otherFields = visibleFields.filter((child: any) => child !== locationField);
    return `
      <section class="paneldynamic-section energy-supply-section">
        ${visibleTitle ? `<div class="section-heading">${escapeHtml(visibleTitle)}</div>` : ""}
        <table class="report-table energy-supply-table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Locatie</th>
              ${otherFields.map((child: any) => `<th>${escapeHtml(labelForElement(child))}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (row: any, index: number) => `
                  <tr>
                    <td class="align-center item-code-cell">${index + 1}</td>
                    <td>${renderValueCell(locationField ? answerFor(row, locationField?.name) : "")}</td>
                    ${otherFields.map((child: any) => `<td>${renderValueCell(answerFor(row, child?.name))}</td>`).join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `;
  }

  if (elementToken.includes("STUURFUNCTIEMATRIXDOC")) {
    const visibleFields = templateElements.filter((child: any) => simpleFieldTypes().has(normalizeText(child?.type).toLowerCase()));
    return `
      <section class="paneldynamic-section compact-document-section">
        <table class="report-table compact-document-table">
          <thead>
            <tr>
              <th>Document</th>
              ${visibleFields.map((child: any) => `<th>${escapeHtml(labelForElement(child))}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (row: any, index: number) => `
                  <tr>
                    <td>${escapeHtml(`${title || "Document"} ${index + 1}`)}</td>
                    ${visibleFields.map((child: any) => `<td>${renderValueCell(answerFor(row, child?.name))}</td>`).join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `;
  }

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
      <div class="page-intro">Overzicht van de aanvullende opmerkingen en het eventuele gevolg voor het certificaat.</div>
      <table class="report-table remarks-table">
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Omschrijving</th>
            <th>Gevolg op certificaat</th>
          </tr>
        </thead>
        <tbody>
        ${items
          .map(
            (item: any, index: number) => `
              <tr>
                <td class="align-center item-code-cell">${index + 1}</td>
                <td>${renderValueCell(item?.omschrijving)}</td>
                <td class="align-center">${renderCertificateImpactChip(item?.gevolg_certificaat)}</td>
              </tr>
            `
          )
          .join("")}
        </tbody>
      </table>
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

function availabilityNumber(value: any) {
  const match = normalizeText(value).replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function renderSystemAvailabilityResult(elements: any[], answers: any) {
  const fields = elements.filter((element: any) => simpleFieldTypes().has(normalizeText(element?.type).toLowerCase()));
  const pveField = fields.find((element: any) => normalizeColumnToken(`${element?.name || ""} ${labelForElement(element)}`).includes("PVE"));
  const actualField = fields.find((element: any) => normalizeColumnToken(`${element?.name || ""} ${labelForElement(element)}`).includes("GECONSTATEERDE"));
  if (!pveField && !actualField) return "";

  const pveValue = pveField ? answerFor(answers, pveField?.name) : "";
  const actualValue = actualField ? answerFor(answers, actualField?.name) : "";
  const pve = availabilityNumber(pveValue);
  const actual = availabilityNumber(actualValue);
  const actualClass = pve != null && actual != null ? (actual >= pve ? "is-yes" : "is-no") : "";

  return `
    <section class="availability-result-block pagination-keep-together">
      <div class="subsection-title">Resultaat systeembeschikbaarheid</div>
      <table class="report-table availability-result-table availability-result-vertical">
        <tbody>
          <tr>
            <th>${escapeHtml(pveField ? labelForElement(pveField) : "PvE systeembeschikbaarheid")}</th><td>${renderValueCell(pveValue)}</td>
          </tr>
          <tr>
            <th>${escapeHtml(actualField ? labelForElement(actualField) : "Geconstateerde systeembeschikbaarheid")}</th><td><span class="availability-value ${actualClass}">${escapeHtml(displayText(actualValue))}</span></td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function bmiRows(value: any) {
  return Array.isArray(value) ? value.filter((row: any) => row && typeof row === "object") : [];
}

function renderBmiFindingTable(rows: any[]) {
  const printableRows = rows.filter((row: any) => normalizeText(row?.onderwerp));
  if (!printableRows.length) return "";

  return `
    <table class="report-table bmi-findings-table">
      <colgroup><col style="width:14%"><col style="width:42%"><col style="width:18%"><col style="width:26%"></colgroup>
      <thead><tr><th>Nr</th><th>Onderwerp</th><th>Voldoet</th><th>Opmerking</th></tr></thead>
      <tbody>
        ${printableRows
          .map(
            (row: any) => `
              <tr>
                <td class="align-center item-code-cell">${escapeHtml(displayText(firstText(row?.item_code, row?.nr)))}</td>
                <td>${renderValueCell(row?.onderwerp)}</td>
                <td class="align-center">${renderAssessmentChip(row?.voldoet)}</td>
                <td>${renderValueCell(row?.opmerking)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderPerformanceRequirementsPage(model: any, page: any) {
  const answers = model?.answers || {};
  const rows = bmiRows(answerFor(answers, "performance_data_view"));
  const columns = [
    { key: "pr_gebruikersfunctie_naam", title: "Gebruikersfunctie", width: "20%" },
    { key: "pr_label", title: "Label", width: "16%" },
    { key: "pr_doormelding_label", title: "Doormelding", width: "14%" },
    { key: "pr_aantal_auto", title: "A", width: "5%" },
    { key: "pr_aantal_hand", title: "H", width: "5%" },
    { key: "pr_aantal_vlam", title: "V", width: "5%" },
    { key: "pr_aantal_lijn", title: "L", width: "5%" },
    { key: "pr_aantal_asp", title: "ASP", width: "6%" },
    { key: "pr_risico_intern", title: "Intern", width: "7%" },
    { key: "pr_risico_extern", title: "Extern", width: "7%" },
    { key: "pr_max_intern", title: "Max intern", width: "8%" },
    { key: "pr_max_extern", title: "Max extern", width: "8%" },
  ];
  const a1Rows = bmiRows(answerFor(answers, "a1_items"));
  const a2Rows = bmiRows(answerFor(answers, "a2_buitenbedrijfstellingen"));
  const beheerRows = bmiRows(answerFor(answers, "a_beheer_items"));
  const pveValue = answerFor(answers, "a2_systeembeschikbaarheid_pve");
  const actualValue = answerFor(answers, "a2_systeembeschikbaarheid_geconstateerd");
  const pve = availabilityNumber(pveValue);
  const actual = availabilityNumber(actualValue);
  const actualClass = pve != null && actual != null ? (actual >= pve ? "is-yes" : "is-no") : "";

  const overviewPage = `
    <section class="page-break-before report-page landscape-page bmi-performance-page">
      <div class="page-title">${escapeHtml(firstText(page?.title, "Prestatie-eisen (A)"))}</div>
      <table class="report-table compact-pair-table performance-norm-table"><tbody><tr><th>Geldende norm</th><td>${renderValueCell(answerFor(answers, "performance_normering_view"))}</td></tr></tbody></table>
      ${
        rows.length
          ? `
            <section class="bmi-performance-section">
              <div class="subsection-title">Overzicht prestatie-eisen</div>
              <table class="report-table performance-requirements-table">
                <colgroup>${columns.map((column) => `<col style="width:${column.width}">`).join("")}</colgroup>
                <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.title)}</th>`).join("")}</tr></thead>
                <tbody>${rows.map((row: any) => `<tr>${columns.map((column) => `<td>${renderValueCell(row?.[column.key])}</td>`).join("")}</tr>`).join("")}</tbody>
              </table>
              <div class="performance-legend">A = automatische melders; H = handmelders; V = vlamdetectoren; L = lijnrookmelders; ASP = aspiratie openingen.</div>
            </section>
            <section class="bmi-performance-results">
              <div class="section-heading">Calculatie maximum aantal onterechte of ongewenste meldingen</div>
              <table class="report-table performance-results-table"><tbody><tr>
                <th>Met vertraging; intern</th><td>${renderValueCell(answerFor(answers, "performance_total_max_met_intern_view"))}</td>
                <th>Met vertraging; extern</th><td>${renderValueCell(answerFor(answers, "performance_total_max_met_extern_view"))}</td>
                <th>Zonder vertraging; extern</th><td>${renderValueCell(answerFor(answers, "performance_total_max_zonder_extern_view"))}</td>
              </tr></tbody></table>
            </section>
          `
          : ""
      }
      ${a1Rows.length ? `<section class="bmi-findings-section"><div class="section-heading">A1; Ongewenste en onterechte meldingen</div>${renderBmiFindingTable(a1Rows)}</section>` : ""}
    </section>
  `;

  const detailPage =
    a2Rows.length || beheerRows.length
      ? `
          <section class="page-break-before report-page bmi-performance-detail-page">
            <div class="page-title">${escapeHtml(`${firstText(page?.title, "Prestatie-eisen (A)")}; vervolg`)}</div>
            ${
              a2Rows.length
                ? `
            <section class="bmi-availability-section">
              <div class="section-heading">A2; Systeembeschikbaarheid</div>
              <div class="subsection-title">Perioden niet beschikbaar</div>
              <table class="report-table system-availability-table">
                <colgroup><col style="width:9%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:12%"><col style="width:12%"><col style="width:13%"><col style="width:29%"></colgroup>
                <thead>
                  <tr class="matrix-continuation-row"><th colspan="8">Perioden niet beschikbaar</th></tr>
                  <tr><th>Datum</th><th>Tijd begin</th><th>Tijd einde</th><th>Tijdsduur<br>(dagen)</th><th>Uren p.d.<br>niet beschikbaar</th><th># melders<br>niet beschikbaar</th><th># melduren<br>niet beschikbaar</th><th>Omschrijving</th></tr>
                </thead>
                <tbody>${a2Rows.map((row: any) => `<tr><td>${renderValueCell(row?.datum)}</td><td>${renderValueCell(row?.tijd_begin)}</td><td>${renderValueCell(row?.tijd_einde)}</td><td>${renderValueCell(row?.tijdsduur_dagen)}</td><td>${renderValueCell(row?.uren_pd_niet_beschikbaar)}</td><td>${renderValueCell(row?.melders_niet_beschikbaar)}</td><td>${renderValueCell(row?.melduren_niet_beschikbaar)}</td><td>${renderValueCell(row?.omschrijving)}</td></tr>`).join("")}</tbody>
              </table>
              <div class="availability-note">De melduren hebben een nummernotatie. Bijvoorbeeld; 0,5 melduren is gelijk aan 30 minuten.</div>
              <section class="availability-result-block pagination-keep-together">
                <div class="subsection-title">Resultaat systeembeschikbaarheid</div>
                <table class="report-table availability-result-table availability-result-vertical"><tbody>
                  <tr><th>Melduren buiten werking</th><td>${renderValueCell(answerFor(answers, "a2_melduren_buiten_werking"))}</td></tr>
                  <tr><th>Aantal melders</th><td>${renderValueCell(answerFor(answers, "a2_aantal_melders"))}</td></tr>
                  <tr><th>Systeembeschikbaarheid volgens PvE</th><td>${renderValueCell(pveValue)}</td></tr>
                  <tr><th>Geconstateerde systeembeschikbaarheid</th><td><span class="availability-value ${actualClass}">${escapeHtml(displayText(actualValue))}</span></td></tr>
                </tbody></table>
              </section>
            </section>
          `
                : ""
            }
            ${
              beheerRows.length
                ? `
            <section class="bmi-findings-section">
              <div class="section-heading">Beoordeling prestatie-eisen en beheer</div>
              ${normalizeText(firstText(answerFor(answers, "advies_aan_beheerder"), answerFor(answers, "advies_beheerder_gebruiker"))) ? `<div class="advice-block"><div class="advice-label">Advies aan beheerder</div><div class="advice-value">${renderValueCell(firstText(answerFor(answers, "advies_aan_beheerder"), answerFor(answers, "advies_beheerder_gebruiker")))}</div></div>` : ""}
              ${renderBmiFindingTable(beheerRows)}
            </section>
          `
                : ""
            }
          </section>
        `
      : "";

  return `${overviewPage}${detailPage}`;
}

function renderMeasurementResultsPage(model: any, page: any) {
  const answers = model?.answers || {};
  const detectorRows = bmiRows(answerFor(answers, "melders_regels"));
  return `
    <section class="page-break-before report-page landscape-page bmi-measurements-page">
      <div class="page-title">${escapeHtml(firstText(page?.title, "Meetresultaten (B)"))}</div>
      <table class="report-table compact-pair-table aging-factor-table"><tbody><tr><th>Verouderingsfactor</th><td>${renderValueCell(answerFor(answers, "es_verouderingsfactor"))}</td></tr></tbody></table>
      ${renderEnergySupplyMatrix({ name: "es_regels" }, answers)}
      <div class="availability-note">1 De accuspanning is gemeten na ten minste 1 uur op noodstroom (tijdstippen metingen t0 en t1 + waarden).</div>
      ${
        detectorRows.length
          ? `
            <section class="bmi-detectors-section">
              <div class="subsection-title">Melders</div>
              <table class="report-table detector-table">
                <colgroup><col style="width:28%"><col style="width:14%"><col style="width:20%"><col style="width:12%"><col style="width:13%"><col style="width:13%"></colgroup>
                <thead><tr><th>Meldertype</th><th>Meldernummer</th><th>Ruimte</th><th>Instelling</th><th>Tijd van</th><th>Tijd t/m</th></tr></thead>
                <tbody>${detectorRows.map((row: any) => `<tr><td>${renderValueCell(row?.meldertype)}</td><td>${renderValueCell(row?.meldernummer)}</td><td>${renderValueCell(row?.ruimte)}</td><td>${renderValueCell(row?.instelling)}</td><td>${renderValueCell(row?.tijd_van)}</td><td>${renderValueCell(row?.tijd_tot)}</td></tr>`).join("")}</tbody>
              </table>
            </section>
          `
          : ""
      }
    </section>
  `;
}

function renderStuurfunctiematrixDocumentRows(rows: any[]) {
  if (!rows.length) return "";
  return `
    <table class="report-table compact-document-table">
      <colgroup><col style="width:42%"><col style="width:24%"><col style="width:18%"><col style="width:16%"></colgroup>
      <thead><tr><th>Titel</th><th>Documentnr</th><th>Datum</th><th>Revisie</th></tr></thead>
      <tbody>${rows.map((row: any) => `<tr><td>${renderValueCell(row?.doc_titel)}</td><td>${renderValueCell(row?.doc_nummer)}</td><td>${renderValueCell(row?.doc_datum)}</td><td>${renderValueCell(row?.doc_revisie)}</td></tr>`).join("")}</tbody>
    </table>
  `;
}

function renderSteeringFindingsPage(model: any, page: any, appendix: "c" | "d") {
  const answers = model?.answers || {};
  const matrixRows = bmiRows(answerFor(answers, `stuurfunctiematrix_docs_${appendix}`));
  const findingRows = bmiRows(answerFor(answers, `bijlage_${appendix}_items`));
  return `
    <section class="${appendix === "c" ? "page-break-before " : ""}report-page bmi-steering-page bmi-steering-page-${appendix}">
      ${appendix === "d" ? renderContinuationHeaderAnchor(model) : ""}
      <div class="page-title">${escapeHtml(firstText(page?.title, appendix === "c" ? "Bevindingen ten aanzien van sturingen (C)" : "Bevindingen ten aanzien van gestuurde voorzieningen (D)"))}</div>
      ${matrixRows.length ? `<section class="bmi-steering-document"><div class="section-heading">Stuurfunctiematrix</div>${renderStuurfunctiematrixDocumentRows(matrixRows)}</section>` : ""}
      ${findingRows.length ? `<section class="bmi-findings-section">${renderBmiFindingTable(findingRows)}<div class="availability-note">Bij ‘Nee’ altijd invullen bij Opmerking.${appendix === "d" ? " Alleen de regels D11 t/m D20 (Overige..) zijn invulbaar." : ""}</div></section>` : ""}
    </section>
  `;
}

function surveyElementsDeep(elements: any[]): any[] {
  return (Array.isArray(elements) ? elements : []).flatMap((element: any) => [
    element,
    ...surveyElementsDeep(element?.elements),
    ...surveyElementsDeep(element?.templateElements),
  ]);
}

function emberDirectiveHasValue(element: any, directive: "bind" | "followUp", property: string, expectedValue: string) {
  const value = element?.ember?.[directive];
  if (value && typeof value === "object") {
    return normalizeToken(value?.[property]) === normalizeToken(expectedValue);
  }

  const text = normalizeText(value);
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*=\\s*${expectedValue}(?=\\s*;|\\s*$)`, "i");
  return pattern.test(text.replace(/^@\{\s*|\s*\}$/g, ""));
}

function pageUsesEmberBinding(page: any, key: string) {
  return surveyElementsDeep(page?.elements).some((element: any) => emberDirectiveHasValue(element, "bind", "key", key));
}

function pageUsesEmberFollowUpCategory(page: any, category: string) {
  return surveyElementsDeep(page?.elements).some((element: any) => emberDirectiveHasValue(element, "followUp", "category", category));
}

function bmiPageRenderBlock(page: any) {
  // These bindings are the same semantic hooks Ember already uses to obtain installation data.
  if (pageUsesEmberBinding(page, "doc_groepen")) return "documents";
  if (pageUsesEmberBinding(page, "performance_data") || pageUsesEmberBinding(page, "performance_normering")) return "performance-requirements";
  if (pageUsesEmberBinding(page, "es_regels")) return "measurement-results";
  if (pageUsesEmberFollowUpCategory(page, "bijlage_c")) return "steering-findings-c";
  if (pageUsesEmberFollowUpCategory(page, "bijlage_d")) return "steering-findings-d";

  // Compatibility with existing published BMI forms that predate the Ember hooks above.
  const pageName = normalizeToken(page?.name);
  const pageTitle = normalizeToken(page?.title);
  if (pageName === "ALGEMEEN" || pageTitle === "ALGEMEEN") return "general";
  if (pageName === "DOCUMENTEN" || pageTitle === "DOCUMENTEN") return "documents";
  if (pageName === "AANVULLENDE_OPMERKINGEN") return "additional-remarks";
  if (pageName === "BIJLAGE_A_PRESTATIE_EISEN") return "performance-requirements";
  if (pageName === "MEETRESULTATEN_B") return "measurement-results";
  if (pageName === "BIJLAGE_C_STURINGEN") return "steering-findings-c";
  if (pageName === "BIJLAGE_D_GESTUURDE_VOORZIENINGEN") return "steering-findings-d";
  return "";
}

function renderSurveyPages(model: any) {
  const answers = model?.answers || {};
  const pages = visibleSurveyPages(model);

  return pages
    .map((page: any, index: number) => {
      const renderBlock = bmiPageRenderBlock(page);
      if (renderBlock === "general") {
        return renderBmiGeneralPage(model, page);
      }
      if (renderBlock === "documents") {
        return renderDocumentsPage(model);
      }
      if (renderBlock === "additional-remarks") {
        return renderAdditionalRemarksPage(model, page);
      }
      if (renderBlock === "performance-requirements") {
        return renderPerformanceRequirementsPage(model, page);
      }
      if (renderBlock === "measurement-results") {
        return renderMeasurementResultsPage(model, page);
      }
      if (renderBlock === "steering-findings-c") {
        return renderSteeringFindingsPage(model, page, "c");
      }
      if (renderBlock === "steering-findings-d") {
        return renderSteeringFindingsPage(model, page, "d");
      }

      const elements = Array.isArray(page?.elements) ? page.elements : [];
      const isSystemAvailabilityPage = normalizeColumnToken(`${page?.name || ""} ${page?.title || ""}`).includes("SYSTEEMBESCHIKBAARHEID");
      const regularElements = isSystemAvailabilityPage
        ? elements.filter((element: any) => !normalizeColumnToken(`${element?.name || ""} ${labelForElement(element)}`).includes("SYSTEEMBESCHIKBAARHEID"))
        : elements;
      const content = `${renderSurveyPageElements(regularElements, answers)}${
        isSystemAvailabilityPage ? renderSystemAvailabilityResult(elements, answers) : ""
      }`;
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

function renderActionPointSummaryPage(model: any) {
  const items = (Array.isArray(model?.followUps?.items) ? model.followUps.items : [])
    .filter((item: any) => normalizeToken(item?.status) !== "AFGEWEZEN")
    .map((item: any, index: number) => ({ item, index }))
    .sort((left: any, right: any) => {
      const leftInformative = normalizeToken(left.item?.status) === "INFORMATIEF" ? 1 : 0;
      const rightInformative = normalizeToken(right.item?.status) === "INFORMATIEF" ? 1 : 0;
      return leftInformative - rightInformative || left.index - right.index;
    })
    .map(({ item }: any) => item);
  const attachmentMap = buildFollowUpAttachmentMap(model);
  if (!items.length) {
    return "";
  }

  const evidence = items.flatMap((item: any, index: number) =>
    followUpDocumentsForItem(item, attachmentMap).map((document: any) => ({ document, index: index + 1 }))
  );

  return `
    <section class="page-break-before report-page">
      <div class="page-title">Actiepunten</div>
      <div class="page-intro">Deze actiepunten beinvloeden het afgeven van een positieve beoordeling.</div>
      <table class="report-table action-points-table">
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Actiepunt</th>
            <th>Status</th>
            <th>Certificaatimpact</th>
            <th>Afhandeling</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item: any, index: number) => `
                <tr>
                  <td class="align-center item-code-cell">${index + 1}</td>
                  <td><strong>${escapeHtml(firstText(item?.workflow_title, item?.workflow_description, item?.note, "Actiepunt"))}</strong>${normalizeText(item?.workflow_description) && normalizeText(item?.workflow_title) ? `<div class="table-detail">${renderValueCell(item.workflow_description)}</div>` : ""}</td>
                  <td class="align-center">${renderFollowUpStatusChip(item?.status)}</td>
                  <td class="align-center">${renderCertificateImpactChip(item?.effective_certificate_impact || item?.certificate_impact)}</td>
                  <td>${renderValueCell(firstText(item?.resolution_note, item?.resolution_outcome))}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
      ${
        evidence.length
          ? `
            <section class="evidence-section">
              <div class="section-heading">Bewijsstukken</div>
              <div class="attachment-grid">
                ${evidence.map(({ document, index }: any) => `<div><div class="evidence-label">Actiepunt ${index}</div>${renderAttachmentCard(document)}</div>`).join("")}
              </div>
            </section>
          `
          : ""
      }
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
        margin-top: 0;
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

function renderContinuationHeaderAnchor(model: any) {
  void model;
  return `<div class="continuation-header-anchor" aria-hidden="true"></div>`;
}

function renderDocumentsPage(model: any) {
  const installationGroups = Array.isArray(model?.installationDocuments?.groups) ? model.installationDocuments.groups : [];
  const installationDocuments = installationGroups.flatMap((group: any) =>
    (Array.isArray(group?.items) ? group.items : []).map((item: any) => ({ ...item, document_type: firstText(group?.name, "Overig") }))
  );
  const formDocuments = Array.isArray(model?.formInstanceDocuments?.items)
    ? model.formInstanceDocuments.items.filter((item: any) => !Array.isArray(item?.follow_ups) || item.follow_ups.length === 0)
    : [];

  const chunks = <T>(items: T[], size: number) =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
  const attachmentBlocks = chunks(formDocuments, 2);
  const renderDocumentTable = (items: any[]) => `
    <table class="report-table document-table pagination-splittable-table">
      <thead>
        <tr>
          <th>Documentsoort</th>
          <th>Titel</th>
          <th>Documentnr</th>
          <th>Datum</th>
          <th>Revisie</th>
          <th>Bestand</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item: any) => `
              <tr>
                <td>${escapeHtml(item.document_type)}</td>
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
  `;

  return `
    <section class="page-break-before report-page landscape-page documents-page">
      <div class="page-title">Documenten</div>
      <div class="page-intro">Installatiebestanden en overige formulierbijlagen die bij dit rapport horen.</div>
      ${installationDocuments.length ? renderDocumentTable(installationDocuments) : `<div class="empty-box">Geen installatiebestanden gevonden.</div>`}
      ${attachmentBlocks
      .map(
        (items: any[], index: number) => `
          <section class="document-attachments pagination-keep-together">
            <div class="section-heading pagination-keep-with-next">${index ? "Overige formulierbijlagen (vervolg)" : "Overige formulierbijlagen"}</div>
            <div class="attachment-grid">${items.map((item: any) => renderAttachmentCard(item)).join("")}</div>
          </section>
        `
      )
      .join("")}
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
  // Het BMI-onderhoudsrapport heeft drie vaste ondertekeningsblokken. De
  // configuratie bevat daarnaast een historische afsluitende verklaring die
  // inhoudelijk met die blokken overlapt; toon die niet nogmaals.
  if (isCertifiedMaintenanceReport(model)) return [];

  const text = model?.surveyJson?.ember?.report?.signaturePage?.closingText;
  const blockTexts = new Set(signatureBlocks(model).map((block: any) => normalizeToken(block?.text)));
  return Array.isArray(text)
    ? text.filter((item: any) => {
        const token = normalizeToken(item);
        return token && !blockTexts.has(token);
      })
    : [];
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
            const signatureDataUrl = normalizeText(model?.signer?.signatureDataUrl);
            const signatureNotice = firstText(signatureState.reason, "Nog niet ondertekend");
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
                      <div class="signature-field-value">${signatureState.allowed && signatureDataUrl ? "Vastgelegd" : "Niet ondertekend"}</div>
                    </div>
                  </div>
                  <div class="signature-box">
                    ${
                      signatureState.allowed && signatureDataUrl
                        ? `<img src="${signatureDataUrl}" alt="Handtekening" />`
                        : `<div class="signature-empty">${escapeHtml(signatureNotice)}</div>`
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
          .report-page { min-height: 1px; padding-top: 5mm; }

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

          .cover-footer-grid {
            display: grid;
            grid-template-columns: 28mm minmax(0, 84mm) 28mm;
            gap: 5mm;
            align-items: end;
            justify-content: center;
          }

          .cover-certification-mark,
          .cover-footer-balance {
            width: 28mm;
            min-height: 1px;
          }

          .cover-certification-mark img {
            display: block;
            width: auto;
            max-width: 26mm;
            max-height: 31mm;
            object-fit: contain;
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
            width: 84mm;
            margin: 0;
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

          .matrix-section,
          .document-group {
            break-inside: auto;
            page-break-inside: auto;
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

          .report-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
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

          .assessment-chip.is-informative {
            color: #155b87;
            border-color: #9bc8e1;
            background: #edf7fc;
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
            max-width: 86mm;
            color: var(--muted);
            font-size: 9pt;
            font-weight: 700;
            line-height: 1.35;
            text-align: center;
            white-space: pre-wrap;
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
          .report-page { min-height: 1px; padding-top: 5mm; }

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

          .cover-footer-grid {
            display: grid;
            grid-template-columns: 28mm minmax(0, 84mm) 28mm;
            gap: 5mm;
            align-items: end;
            justify-content: center;
          }

          .cover-certification-mark,
          .cover-footer-balance {
            width: 28mm;
            min-height: 1px;
          }

          .cover-certification-mark img {
            display: block;
            width: auto;
            max-width: 26mm;
            max-height: 31mm;
            object-fit: contain;
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
            width: 84mm;
            margin: 0;
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

          .matrix-section,
          .document-group {
            break-inside: auto;
            page-break-inside: auto;
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

          .report-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
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

          .assessment-chip.is-informative {
            color: #155b87;
            border-color: #9bc8e1;
            background: #edf7fc;
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

          .info-table th { width: 34%; }
          .info-table td { vertical-align: middle; }
          .info-pairs-table th { width: 17%; vertical-align: middle; }
          .info-pairs-table td { width: 33%; vertical-align: middle; }

          .bmi-general-page {
            padding-top: 1mm;
          }

          .bmi-general-page .page-title {
            font-size: 20pt;
            margin-bottom: 3mm;
          }

          .bmi-general-page .general-info-section {
            margin-bottom: 3.4mm;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .bmi-general-page .general-info-section .section-heading {
            font-size: 11.5pt;
            line-height: 1.2;
            margin: 0 0 1.5mm;
          }

          .bmi-general-page .general-info-section .info-pairs-table th,
          .bmi-general-page .general-info-section .info-pairs-table td {
            padding: 2.1mm 3mm;
            line-height: 1.28;
          }

          .bmi-general-page .general-info-section .info-pairs-table th {
            font-size: 8.5pt;
          }

          /* PDF pagination policy: move complete information blocks when possible. */
          .pagination-keep-together,
          .info-section,
          .followup-section,
          .panel-section,
          .paneldynamic-section,
          .matrix-section,
          .document-group {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .pagination-keep-with-next {
            break-after: avoid-page;
            page-break-after: avoid;
          }

          .pagination-splittable-table {
            break-inside: auto;
            page-break-inside: auto;
          }

          .pagination-splittable-table thead {
            display: table-header-group;
          }

          .document-attachments {
            margin-top: 6mm;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .document-attachments > .section-heading,
          .document-attachments .attachment-grid,
          .document-attachments .attachment-card {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .continuation-header-anchor { height: 6mm; }

          .action-points-table th:nth-child(1),
          .remarks-table th:nth-child(1) { width: 8%; }
          .action-points-table th:nth-child(2) { width: 35%; }
          .action-points-table th:nth-child(3) { width: 16%; }
          .action-points-table th:nth-child(4) { width: 18%; }
          .action-points-table th:nth-child(5) { width: 23%; }
          .remarks-table th:nth-child(2) { width: 70%; }
          .remarks-table th:nth-child(3) { width: 22%; }
          .table-detail { margin-top: 1.3mm; color: var(--muted); font-size: 8.8pt; }
          .evidence-section { margin-top: 6mm; }
          .evidence-label { margin: 0 0 1.4mm; color: var(--muted); font-size: 8.5pt; font-weight: 700; }

          .document-table th:nth-child(1) { width: 16%; }
          .document-table th:nth-child(2) { width: 23%; }
          .document-table th:nth-child(3) { width: 15%; }
          .document-table th:nth-child(4) { width: 12%; }
          .document-table th:nth-child(5) { width: 10%; }
          .document-table th:nth-child(6) { width: 24%; }

          .energy-supply-table th,
          .energy-supply-table td,
          .compact-document-table th,
          .compact-document-table td { font-size: 8.4pt; padding: 1.8mm 2mm; }
          .energy-supply-table th {
            line-height: 1.2;
            white-space: normal;
            word-break: normal;
            overflow-wrap: normal;
          }
          .matrix-continuation-row th { color: var(--ink); font-size: 9pt; text-align: left; }
          .availability-result-block { margin-top: 5mm; }
          .availability-result-block .availability-result-table { margin-top: 0; }
          .availability-result-table { margin-top: 5mm; }
          .availability-result-table th { width: 20%; }
          .availability-result-table td { width: 30%; vertical-align: middle; }
          .availability-result-table.availability-result-vertical th { width: 42%; }
          .availability-result-table.availability-result-vertical td { width: 58%; }
          .availability-value { display: inline-block; padding: 1.2mm 2.2mm; border-radius: 999px; font-weight: 700; }
          .availability-value.is-yes { background: var(--success-soft); color: #135f49; border: 1px solid #9ad8bb; }
          .availability-value.is-no { background: #fff2f1; color: #9f2620; border: 1px solid #f0b0ab; }

          .compact-pair-table { margin-bottom: 4mm; }
          .compact-pair-table th { width: 28%; }
          .bmi-performance-section,
          .bmi-performance-results,
          .bmi-findings-section,
          .bmi-availability-section,
          .bmi-detectors-section,
          .bmi-steering-document { margin-bottom: 6mm; }
          .performance-requirements-table,
          .system-availability-table,
          .energy-supply-table,
          .detector-table { table-layout: fixed; }
          .performance-requirements-table th,
          .performance-requirements-table td { font-size: 7.7pt; padding: 1.5mm 1.4mm; white-space: nowrap; overflow-wrap: normal; }
          .performance-requirements-table th:nth-child(1),
          .performance-requirements-table th:nth-child(2),
          .performance-requirements-table td:nth-child(1),
          .performance-requirements-table td:nth-child(2) { white-space: pre-wrap; overflow-wrap: anywhere; }
          .performance-legend,
          .availability-note { margin-top: 3mm; color: var(--muted); font-size: 9pt; }
          .performance-results-table th { width: 17%; }
          .performance-results-table td { width: 16.333%; vertical-align: middle; }
          .system-availability-table th,
          .system-availability-table td { font-size: 8pt; padding: 1.6mm 1.7mm; }
          .system-availability-table th {
            line-height: 1.2;
            white-space: normal;
            word-break: normal;
            overflow-wrap: normal;
          }
          .system-availability-table td:last-child { white-space: pre-wrap; overflow-wrap: anywhere; }
          .bmi-findings-table th,
          .bmi-findings-table td { vertical-align: middle; }
          .advice-block { margin: 0 0 3mm 0; }
          .advice-label {
            background: var(--panel);
            border: 1px solid var(--line);
            color: var(--muted);
            font-size: 8.8pt;
            font-weight: 700;
            padding: 2.4mm 3mm;
            break-after: avoid;
            page-break-after: avoid;
          }
          .advice-value { border: 1px solid var(--line); border-top: 0; padding: 2.4mm 3mm; white-space: pre-wrap; }
          .bmi-steering-page-c { break-after: page; page-break-after: always; }

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
            max-width: 86mm;
            color: var(--muted);
            font-size: 9pt;
            font-weight: 700;
            line-height: 1.35;
            text-align: center;
            white-space: pre-wrap;
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

          .landscape-page .matrix-section.is-prestatie-eisen .report-table {
            table-layout: fixed;
          }

          .landscape-page .matrix-section.is-prestatie-eisen .report-table th,
          .landscape-page .matrix-section.is-prestatie-eisen .report-table td {
            font-size: 7.7pt;
            padding: 1.5mm 1.5mm;
          }

          .landscape-page .matrix-section.is-prestatie-eisen .report-table td:nth-child(1),
          .landscape-page .matrix-section.is-prestatie-eisen .report-table td:nth-child(2) {
            white-space: pre-wrap;
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

async function getBrowser(reportProgress?: RenderProgressReporter) {
  if (!browserPromise) {
    const launchPromise = (async () => {
      const launchStartedAt = Date.now();
      const configuredBrowsersPath = normalizeText(process.env.PLAYWRIGHT_BROWSERS_PATH);
      if (configuredBrowsersPath && !hasUsablePlaywrightBrowserRoot(configuredBrowsersPath)) {
        delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      }

      const { chromium } = await import("playwright");
      const explicitExecutablePath = resolvePlaywrightExecutablePath();
      const playwrightExecutablePath =
        typeof chromium.executablePath === "function" ? chromium.executablePath() : "";
      const executablePath = explicitExecutablePath || playwrightExecutablePath;
      const activeBrowsersPath = normalizeText(process.env.PLAYWRIGHT_BROWSERS_PATH) || null;

      markRuntimeRendererWarmUp("playwright");
      reportProgress?.("warming_renderer", "PDF-engine wordt geladen", 8);
      console.log("[form report pdf] launching playwright chromium", {
        browsersPath: activeBrowsersPath,
        executablePath,
      });

      const launchOptions: any = {
        headless: true,
        timeout: PLAYWRIGHT_LAUNCH_TIMEOUT_MS,
        dumpio: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
        ],
      };
      const runtimeLibPath = resolvePlaywrightRuntimeLibPath();
      launchOptions.env = buildPlaywrightLaunchEnv(runtimeLibPath);
      if (runtimeLibPath) {
        console.log("[form report pdf] using scoped playwright runtime libs", { runtimeLibPath });
      }
      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }

      const browser = await withTimeout(
        "playwright chromium launch",
        chromium.launch(launchOptions),
        PLAYWRIGHT_LAUNCH_TIMEOUT_MS + 5000
      );
      console.log("[form report pdf] playwright chromium launched", {
        elapsedMs: Date.now() - launchStartedAt,
      });
      browser.on("disconnected", () => {
        clearBrowserPromise();
        const err = new Error("Playwright browser disconnected");
        markRuntimeRendererFailed(err);
        console.warn("[form report pdf] playwright browser disconnected");
      });
      const probePage = await withTimeout(
        "playwright probe page creation",
        browser.newPage(),
        FORM_REPORT_RENDER_STEP_TIMEOUT_MS
      );
      await withTimeout(
        "playwright probe page close",
        probePage.close(),
        FORM_REPORT_RENDER_STEP_TIMEOUT_MS
      );
      markRuntimeRendererReady();
      reportProgress?.("renderer_ready", "PDF-engine is klaar", 18);
      return browser;
    })();

    browserPromise = launchPromise.catch((err) => {
      clearBrowserPromise();
      markRuntimeRendererFailed(err);
      throw err;
    });
  }
  return browserPromise;
}

async function waitForDocumentFonts(page: any, label: string) {
  await withTimeout(
    `${label} fonts ready`,
    page.evaluate(async () => {
      const maybeFonts = (document as any).fonts;
      if (maybeFonts?.ready) {
        await maybeFonts.ready;
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }),
    FORM_REPORT_RENDER_STEP_TIMEOUT_MS
  );
}

function buildWarmUpHtmlDocument() {
  return `<!doctype html>
    <html lang="nl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          html, body {
            margin: 0;
            padding: 0;
            font-family: Calibri, Arial, sans-serif;
            color: #18233a;
            background: #ffffff;
          }
          body {
            padding: 12mm;
          }
          .warmup-card {
            border: 1px solid #d3dae6;
            background: #f7f9fc;
            padding: 8mm;
          }
          .warmup-title {
            font-size: 18pt;
            font-weight: 700;
            margin: 0 0 3mm;
          }
          .warmup-copy {
            font-size: 10pt;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <section class="warmup-card">
          <h1 class="warmup-title">Ember PDF warm-up</h1>
          <p class="warmup-copy">Deze pagina primeert de HTML renderer voor de eerste echte export.</p>
        </section>
      </body>
    </html>`;
}

async function primeHtmlFormReportRenderer(browser: Browser) {
  if (rendererPrimePromise) return rendererPrimePromise;

  rendererPrimePromise = (async () => {
    const warmPage = await withTimeout(
      "playwright warm-up page creation",
      browser.newPage(),
      FORM_REPORT_RENDER_STEP_TIMEOUT_MS
    );

    warmPage.setDefaultTimeout(FORM_REPORT_RENDER_STEP_TIMEOUT_MS);
    warmPage.setDefaultNavigationTimeout(FORM_REPORT_RENDER_STEP_TIMEOUT_MS);

    try {
      const warmHtml = buildWarmUpHtmlDocument();
      await withTimeout(
        "warm-up html content",
        warmPage.setContent(warmHtml, { waitUntil: "domcontentloaded" }),
        FORM_REPORT_RENDER_STEP_TIMEOUT_MS
      );
      await waitForDocumentFonts(warmPage, "warm-up");
      await withTimeout(
        "warm-up pdf render",
        warmPage.pdf({
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
        }),
        FORM_REPORT_RENDER_STEP_TIMEOUT_MS
      );
    } finally {
      await warmPage.close().catch(() => {});
    }
  })()
    .finally(() => {
      rendererPrimePromise = null;
    });

  return rendererPrimePromise;
}

export function warmUpHtmlFormReportRenderer() {
  if (browserWarmUpPromise) return browserWarmUpPromise;

  const warmUpStartedAt = Date.now();
  browserWarmUpPromise = getBrowser()
    .then(async (browser) => {
      await primeHtmlFormReportRenderer(browser);
      console.log("[form report pdf] html renderer warm-up ready", {
        elapsedMs: Date.now() - warmUpStartedAt,
      });
    })
    .catch((err) => {
      console.warn("[form report pdf] html renderer warm-up failed", err);
      throw err;
    })
    .finally(() => {
      browserWarmUpPromise = null;
    });

  return browserWarmUpPromise;
}

export async function tryBuildHtmlFormReportPdf(model: any, reportProgress?: RenderProgressReporter): Promise<any> {
  const browser = await getBrowser(reportProgress);
  await primeHtmlFormReportRenderer(browser);
  reportProgress?.("creating_pages", "Werkbladen worden voorbereid", 24);
  console.log("[form report pdf] creating playwright pages");
  const coverPage = await withTimeout(
    "playwright cover page creation",
    browser.newPage(),
    FORM_REPORT_RENDER_STEP_TIMEOUT_MS
  );
  const bodyPage = await withTimeout(
    "playwright body page creation",
    browser.newPage(),
    FORM_REPORT_RENDER_STEP_TIMEOUT_MS
  );

  coverPage.setDefaultTimeout(FORM_REPORT_RENDER_STEP_TIMEOUT_MS);
  coverPage.setDefaultNavigationTimeout(FORM_REPORT_RENDER_STEP_TIMEOUT_MS);
  bodyPage.setDefaultTimeout(FORM_REPORT_RENDER_STEP_TIMEOUT_MS);
  bodyPage.setDefaultNavigationTimeout(FORM_REPORT_RENDER_STEP_TIMEOUT_MS);

  try {
    console.log("[form report pdf] rendering html strings");
    reportProgress?.("rendering_html", "Rapportopmaak wordt opgebouwd", 36);
    const coverHtml = renderHtmlDocument(model);
    const bodyHtml = renderBodyHtmlDocument(model);
    console.log("[form report pdf] setting cover html");
    await withTimeout(
      "cover html content",
      coverPage.setContent(coverHtml, { waitUntil: "domcontentloaded" }),
      FORM_REPORT_RENDER_STEP_TIMEOUT_MS
    );
    await waitForDocumentFonts(coverPage, "cover");
    console.log("[form report pdf] setting body html");
    await withTimeout(
      "body html content",
      bodyPage.setContent(bodyHtml, { waitUntil: "domcontentloaded" }),
      FORM_REPORT_RENDER_STEP_TIMEOUT_MS
    );
    await waitForDocumentFonts(bodyPage, "body");

    console.log("[form report pdf] rendering cover pdf");
    reportProgress?.("rendering_cover", "Voorblad wordt gerenderd", 54);
    const coverBuffer = Buffer.from(
      await withTimeout(
        "cover pdf render",
        coverPage.pdf({
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
        }),
        FORM_REPORT_RENDER_STEP_TIMEOUT_MS
      )
    );

    console.log("[form report pdf] rendering body pdf");
    reportProgress?.("rendering_body", "Pdf-pagina's worden gerenderd", 74);
    const bodyBuffer = Buffer.from(
      await withTimeout(
        "body pdf render",
        bodyPage.pdf({
          format: "A4",
          printBackground: true,
          displayHeaderFooter: true,
          margin: {
            top: "24mm",
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
        }),
        FORM_REPORT_RENDER_STEP_TIMEOUT_MS
      )
    );

    console.log("[form report pdf] merging pdf pages");
    reportProgress?.("merging_pdf", "Pagina's worden samengevoegd", 90);
    const mergedPdf = await PDFDocument.create();
    for (const sourceBuffer of [coverBuffer, bodyBuffer]) {
      const sourcePdf = await PDFDocument.load(sourceBuffer);
      const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      for (const copiedPage of copiedPages) {
        mergedPdf.addPage(copiedPage);
      }
    }

    const buffer = Buffer.from(await mergedPdf.save());
    console.log("[form report pdf] html pdf ready", { bytes: buffer.length });
    reportProgress?.("ready", "Download wordt klaargezet", 100);

    return buildFormReportResult(buffer, model);
  } finally {
    await coverPage.close();
    await bodyPage.close();
  }
}
