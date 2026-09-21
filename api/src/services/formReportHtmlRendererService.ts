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
  if (Array.isArray(configured)) {
    return configured.map((value: any) => String(value || "").trim()).filter(Boolean);
  }

  return normalizeText(model?.form?.atrium_installation_code)
    ? ["brandbeveiliging", "service_onderhoud"]
    : [];
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
  if (!active.size) return "";

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

/* Sommige antwoorden komen als sleutel uit de bron; GEZONDHEIDSZORG_MET_BEDGEBIED hoort niet zo
   op papier. Alleen wat er echt als sleutel uitziet wordt leesbaar gemaakt: hoofdletters, cijfers
   en liggende streepjes, zonder spaties. Wat een mens heeft getypt blijft ongemoeid. */
function humanizeMachineToken(text: string) {
  /* Een sleutel bestaat uit hoofdletters, cijfers en liggende streepjes en niets anders; die
     test sluit meteen alles uit waar een spatie of een kleine letter in staat. */
  if (!text.includes("_")) return text;
  if (!/^[A-Z0-9_]+$/.test(text)) return text;

  return prettifyKey(text.toLowerCase());
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

  const text = humanizeMachineToken(normalizeText(textValue(value)));
  if (["JA", "NEE", "NVT"].includes(normalizeToken(text))) {
    return renderAssessmentChip(text);
  }
  return text ? escapeHtml(text) : `<span class="muted">-</span>`;
}

/* Een blok naam-waardeparen als één doorlopende tabel.

   Elke groep was eerst een eigen tabel met een kop ertussen. Dat gaf op de pagina Algemeen
   zeven losse kaders met evenzoveel onderbrekingen, terwijl het om één lijst gegevens gaat.
   Nu staat alles in één raster met tussenkoppen, zodat de kolomranden van boven tot onder
   doorlopen en de regelhoogte overal gelijk is.

   De groepen komen van de aanroeper, dus elk formulier kan dit gebruiken. */
function renderInfoGridSection(
  groups: Array<{ title?: string; rows: Array<{ label: string; value: any }> }>,
  sectionClassName = ""
) {
  const gevuldeGroepen = groups
    .map((groep) => ({ ...groep, rows: nonEmptyRows(groep.rows) }))
    .filter((groep) => groep.rows.length);

  if (!gevuldeGroepen.length) return "";

  const rijen = gevuldeGroepen
    .map((groep) => {
      const paren = Array.from({ length: Math.ceil(groep.rows.length / 2) }, (_, index) =>
        groep.rows.slice(index * 2, index * 2 + 2)
      );

      const kop = groep.title
        ? `<tr class="info-grid-group"><th colspan="4">${escapeHtml(groep.title)}</th></tr>`
        : "";

      return (
        kop +
        paren
          .map(
            (paar) => `
              <tr>
                <th>${escapeHtml(paar[0].label)}</th>
                <td>${renderValueCell(paar[0].value)}</td>
                ${
                  paar[1]
                    ? `<th>${escapeHtml(paar[1].label)}</th><td>${renderValueCell(paar[1].value)}</td>`
                    : `<th></th><td></td>`
                }
              </tr>
            `
          )
          .join("")
      );
    })
    .join("");

  return `
    <section class="info-section ${escapeHtml(sectionClassName)}">
      <table class="report-table info-grid-table">
        ${renderGridColGroup([5, 7, 5, 7])}
        <tbody>${rijen}</tbody>
      </table>
    </section>
  `;
}

function normalizedStatusLabel(value: any) {
  const token = normalizeToken(value);
  if (token === "INFORMATIEF") return "Informatief";
  if (token === "OPEN") return "Open";
  if (token === "PLANNING_NODIG") return "Planning nodig";
  if (token === "WACHTENOPDERDEN") return "Wachten op klant";
  if (token === "WACHTENOPINTERN") return "Wachten op intern";
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
          : token === "OPEN" || token === "PLANNING_NODIG" || token === "WACHTENOPDERDEN" || token === "WACHTENOPINTERN"
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

  const hasInstallationContext = Boolean(normalizeText(model?.form?.atrium_installation_code));
  const metaRows = hasInstallationContext
    ? [
        { label: "Installatiecode", value: model?.form?.atrium_installation_code },
        { label: "Onderhoudsdatum", value: firstText(answerDateText(model?.answers, "datum_onderhoud", "Datum_onderhoud_af_date"), "-") },
        { label: "Status", value: normalizedStatusLabel(model?.form?.status) },
        { label: "Documentnummer", value: firstText(model?.form?.official_document_number, model?.form?.id, "-") },
      ]
    : [
        { label: "Projectnummer", value: firstText(answerText(model?.answers, "projectnummer"), "-") },
        { label: "Project", value: firstText(answerText(model?.answers, "projectnaam"), "-") },
        { label: "Inspectiedatum", value: firstText(answerDateText(model?.answers, "datum_inspectie"), "-") },
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
      ${renderGridColGroup([safeDivider, 100 - safeDivider])}
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

  return `
    <section class="page-break-before report-page bmi-general-page">
      <div class="page-title">${escapeHtml(firstText(page?.title, "Algemeen"))}</div>
      ${renderInfoGridSection(
        [
          {
            rows: [
              { label: "Datum onderhoud", value: answerDateText(answers, "datum_onderhoud") },
              { label: "Documentnummer", value: firstText(answerText(answers, "documentnummer"), model?.form?.official_document_number) },
            ],
          },
          {
            title: "Bouwwerk",
            rows: [
              { label: "Naam", value: answerText(answers, "bouwwerk_naam") },
              { label: "Soort", value: answerText(answers, "bouwwerk_soort") },
              { label: "Eisende partij", value: answerText(answers, "eisende_partij") },
              { label: "Adres", value: joinNonEmpty([answerText(answers, "bouwwerk_straat"), joinNonEmpty([answerText(answers, "bouwwerk_postcode"), answerText(answers, "bouwwerk_plaats")], " ")], ", ") },
            ],
          },
          {
            title: "Onderhoudsbedrijf",
            rows: [
              { label: "Naam", value: answerText(answers, "onderhoudsbedrijf_naam") },
              { label: "Adres", value: joinNonEmpty([answerText(answers, "onderhoudsbedrijf_straat_huisnr"), answerText(answers, "onderhoudsbedrijf_postcode_plaats")], ", ") },
            ],
          },
          {
            title: "Brandmeldinstallatiebedrijf",
            rows: [
              { label: "Naam", value: answerText(answers, "brandmeldinstallatiebedrijf_naam") },
              { label: "Adres", value: joinNonEmpty([answerText(answers, "brandmeldinstallatiebedrijf_straat_huisnr"), answerText(answers, "brandmeldinstallatiebedrijf_postcode_plaats")], ", ") },
            ],
          },
          {
            title: "Eigenaar",
            rows: [
              { label: "Naam", value: answerText(answers, "eigenaar_naam") },
              { label: "Adres", value: answerText(answers, "eigenaar_adres") },
            ],
          },
          {
            title: "Gebruiker",
            rows: [
              { label: "Naam", value: answerText(answers, "gebruiker_naam") },
              { label: "Adres", value: answerText(answers, "gebruiker_adres") },
            ],
          },
          {
            title: "Doormelding",
            rows: [
              { label: "Kiezer", value: answerText(answers, "kiezer_omschrijving") },
              { label: "Lijnkeuze", value: answerText(answers, "kiezer_lijnkeuze") },
              { label: "Brand", value: joinNonEmpty([answerText(answers, "brand_ontvangststation"), answerText(answers, "brand_telefoon"), answerText(answers, "brand_meldcode")], " ; ") },
              { label: "Storing", value: joinNonEmpty([answerText(answers, "storing_ontvangststation"), answerText(answers, "storing_telefoon"), answerText(answers, "storing_meldcode")], " ; ") },
            ],
          },
        ],
        "general-info-section"
      )}
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

/* ------------------------------------------------------------------ Het kolomraster.

   Het rapport heeft één raster. Elke tabel, op welke pagina en uit welk formulier dan ook,
   legt zijn kolomranden op dezelfde ladder. Zonder dat staat er op een pagina een tabel van
   twee kolommen boven een van twaalf, met overal andere verticale lijnen; dat leest als
   rommel, hoe net de tabellen op zichzelf ook zijn.

   De ladder telt 24 modules over de tekstbreedte. Fijn genoeg voor een telkolom van één
   cijfer, grof genoeg om het raster te laten zien. Omdat het hier gebeurt en niet per
   formulier, krijgt een nieuw formulier dit gratis. */
const REPORT_GRID_MODULES = 24;

function snapWidthsToReportGrid(widths: number[]) {
  const veilig = widths.map((breedte) => (Number.isFinite(breedte) && breedte > 0 ? breedte : 1));
  const totaal = veilig.reduce((som, breedte) => som + breedte, 0) || 1;

  /* Meer kolommen dan modules; dan valt er niets te rasteren zonder kolommen te laten
     verdwijnen, dus blijven de verhoudingen staan. */
  if (veilig.length > REPORT_GRID_MODULES) {
    return veilig.map((breedte) => (breedte / totaal) * 100);
  }

  const ideaal = veilig.map((breedte) => (breedte / totaal) * REPORT_GRID_MODULES);
  const modules = ideaal.map((waarde) => Math.max(1, Math.round(waarde)));

  /* Afronden verschuift het totaal. Het verschil gaat naar de kolom waar de afronding het
     verst van de bedoelde breedte af zit, zodat de verhoudingen zo dicht mogelijk blijven. */
  let verschil = REPORT_GRID_MODULES - modules.reduce((som, waarde) => som + waarde, 0);

  while (verschil !== 0) {
    const richting = verschil > 0 ? 1 : -1;
    const kandidaten = modules
      .map((waarde, index) => ({ index, afwijking: ideaal[index] - waarde, waarde }))
      .filter((kandidaat) => (richting > 0 ? true : kandidaat.waarde > 1))
      .sort((links, rechts) =>
        richting > 0 ? rechts.afwijking - links.afwijking : links.afwijking - rechts.afwijking
      );

    if (!kandidaten.length) break;

    modules[kandidaten[0].index] += richting;
    verschil -= richting;
  }

  return modules.map((waarde) => (waarde / REPORT_GRID_MODULES) * 100);
}

/* Elke colgroup in het rapport loopt hierlangs. De maten mogen procenten, modules of ruwe
   verhoudingen zijn; wat eruit komt ligt altijd op het raster. */
function renderGridColGroup(widths: any[]) {
  return `<colgroup>${snapWidthsToReportGrid(widths.map((breedte) => percentWidth(breedte) ?? Number(breedte) ?? 1))
    .map((breedte) => `<col style="width:${breedte.toFixed(4)}%">`)
    .join("")}</colgroup>`;
}

/* De dichtheid volgt uit het aantal kolommen en niet uit het formulier. Twee tabellen met
   evenveel kolommen krijgen daardoor dezelfde regelhoogte en hetzelfde korps, waar ze ook
   staan; dat is wat een pagina rustig maakt. */
function tableDensityClass(columnCount: number) {
  if (columnCount >= 10) return "is-tight";
  if (columnCount >= 7) return "is-regular";
  return "is-roomy";
}

/* Css kan geen kolommen tellen, dus gebeurt het hier; één keer over het hele document, vlak
   voordat het naar de renderer gaat. Elke tabel die een colgroup van het raster heeft
   gekregen, krijgt zo de bijbehorende regelhoogte en het bijbehorende korps. Dat geldt ook
   voor formulieren die nog gemaakt moeten worden; daar is geen eigen printafspraak voor
   nodig. */
/* Een tabel die over de paginarand kan vallen draagt zijn eigen kop in de thead, zodat die op
   de volgende pagina meeloopt. Staat diezelfde tekst er vlak boven ook nog als kop, dan staat
   hij er twee keer. De kop erboven vervalt dan; de tabel houdt hem zelf vast. */
function dropDuplicateTableCaptions(html: string) {
  return html.replace(
    /<div class="(?:subsection-title|section-heading)">([^<]+)<\/div>(\s*<table[\s\S]{0,6000}?<tr class="matrix-continuation-row"><th colspan="\d+">)\1(<\/th>)/g,
    (_geheel: string, kop: string, tussen: string, slot: string) => `${tussen}${kop}${slot}`
  );
}

/* ------------------------------------------------------------------ Doorlopende kolomlijnen.

   Op het raster liggen is niet hetzelfde als uitlijnen. Twee tabellen kunnen elk keurig op de
   ladder delen en toch nergens samenvallen; dat is precies wat een pagina druk maakt.

   Daarom sluit elke tabel aan op de tabel die er direct boven staat. Snapte alles op de tabel
   met de meeste kolommen, dan vond een tabel van vier kolommen daar een passende lijn en de
   tabel van zes kolommen een andere; beide op het raster, maar niet op elkaar. Van boven naar
   beneden doorgeven houdt de lijnen van blok tot blok op hun plek, zonder dat er per formulier
   iets ingesteld hoeft te worden. */
function colGroupEdges(colgroep: string) {
  const breedtes = [...colgroep.matchAll(/width\s*:\s*([\d.]+)%/g)].map((treffer) => Number(treffer[1]));
  if (!breedtes.length) return null;

  const totaal = breedtes.reduce((som, breedte) => som + breedte, 0) || 100;
  const randen: number[] = [];
  let gelopen = 0;

  for (const breedte of breedtes) {
    gelopen += breedte;
    randen.push((gelopen / totaal) * REPORT_GRID_MODULES);
  }

  return randen.map((rand) => Math.round(rand));
}
/* Hoeveel een tabel zijn scheidingen mag verschuiven om aan te sluiten. Een tabel met brede
   kolommen mag verder opschuiven dan een tabel die al krap zit; anders zou een telkolom van
   één module zomaar verdwijnen. */
function alignToleranceFor(columns: number) {
  return Math.min(3, Math.max(1, Math.round(REPORT_GRID_MODULES / Math.max(columns, 1) / 2)));
}

function alignEdgesToSet(randen: number[], voorkeur: number[], reserve: number[], tolerantie: number) {
  const binnen = randen.slice(0, -1);
  const uitgelijnd: number[] = [];
  let ondergrens = 0;

  for (let index = 0; index < binnen.length; index += 1) {
    const rand = binnen[index];
    const ruimteErna = binnen.length - index;

    /* Een kandidaat moet voorbij de vorige scheiding liggen en genoeg ruimte overlaten voor de
       kolommen die nog komen, anders zou er een kolom wegvallen. */
    const bruikbaar = (doel: number) =>
      doel > ondergrens &&
      doel <= REPORT_GRID_MODULES - ruimteErna &&
      Math.abs(doel - rand) <= tolerantie;

    /* Eerst de lijnen van de tabel er direct boven, want daar plakt het oog aan vast. Zit daar
       niets bruikbaars, dan een lijn die eerder op de pagina al bestaat; dat houdt het aantal
       verschillende lijnen laag. Pas als dat ook niets oplevert blijft de scheiding staan. */
    const kies = (doelen: number[]) =>
      doelen
        .filter(bruikbaar)
        .sort((links, rechts) => Math.abs(links - rand) - Math.abs(rechts - rand) || links - rechts)[0];

    const gekozen = kies(voorkeur) ?? kies(reserve) ?? Math.max(rand, ondergrens + 1);
    uitgelijnd.push(gekozen);
    ondergrens = gekozen;
  }

  uitgelijnd.push(REPORT_GRID_MODULES);
  return uitgelijnd;
}

function edgesToColGroup(randen: number[]) {
  const cols = randen
    .map((rand, index) => rand - (index ? randen[index - 1] : 0))
    .map((modules) => `<col style="width:${((modules / REPORT_GRID_MODULES) * 100).toFixed(4)}%">`)
    .join("");

  return `<colgroup>${cols}</colgroup>`;
}

function alignTablesWithinPages(html: string) {
  /* Pagina's zijn te herkennen aan hun eigen klasse; secties binnen een pagina dragen die niet,
     dus dit knipt op paginagrens en niet op elke sectie. */
  const delen = html.split(/(?=<section class="page-break-before report-page)/);

  return delen
    .map((deel) => {
      const colgroepen = [...deel.matchAll(/<colgroup>[\s\S]*?<\/colgroup>/g)].map((treffer) => treffer[0]);
      if (colgroepen.length < 2) return deel;

      const uitgelijnd: number[][] = [];
      const pagina = new Set<number>();
      let vorige: number[] | null = null;

      for (const colgroep of colgroepen) {
        const randen = colGroupEdges(colgroep);
        if (!randen || randen.length < 2) {
          uitgelijnd.push(randen ?? []);
          continue;
        }

        const nieuw = vorige
          ? alignEdgesToSet(randen, vorige, [...pagina], alignToleranceFor(randen.length))
          : randen;

        for (const rand of nieuw) pagina.add(rand);
        uitgelijnd.push(nieuw);
        vorige = nieuw;
      }

      let teller = -1;
      return deel.replace(/<colgroup>[\s\S]*?<\/colgroup>/g, (colgroep) => {
        teller += 1;
        const randen = uitgelijnd[teller];
        return randen && randen.length >= 2 ? edgesToColGroup(randen) : colgroep;
      });
    })
    .join("");
}

function applyTableDensity(html: string) {
  return html.replace(
    /<table class="report-table([^"]*)">(\s*<colgroup>[\s\S]*?<\/colgroup>)/g,
    (geheel: string, klassen: string, colgroep: string) => {
      const kolommen = (colgroep.match(/<col\b/g) || []).length;
      if (!kolommen) return geheel;

      return `<table class="report-table${klassen} ${tableDensityClass(kolommen)}">${colgroep}`;
    }
  );
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
  return snapWidthsToReportGrid(rawWidths).map((width: number) => `${width.toFixed(4)}%`);
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
      <div class="section-heading">Energievoorzieningen</div>
      <table class="report-table energy-supply-table">
        ${renderGridColGroup(columns.map((column) => column.width))}
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
          ${renderGridColGroup([5, 7, 5, 7])}
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
        ${renderGridColGroup([2, 17, 5])}
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
        ${renderGridColGroup([10, 14])}
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
      ${renderGridColGroup([14, 42, 18, 26])}
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
      <table class="report-table compact-pair-table performance-norm-table">${renderGridColGroup([7, 17])}<tbody><tr><th>Geldende norm</th><td>${renderValueCell(answerFor(answers, "performance_normering_view"))}</td></tr></tbody></table>
      ${
        rows.length
          ? `
            <section class="bmi-performance-section">
              <div class="section-heading">Overzicht prestatie-eisen</div>
              <table class="report-table performance-requirements-table">
                ${renderGridColGroup(columns.map((column) => column.width))}
                <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.title)}</th>`).join("")}</tr></thead>
                <tbody>${rows.map((row: any) => `<tr>${columns.map((column) => `<td>${renderValueCell(row?.[column.key])}</td>`).join("")}</tr>`).join("")}</tbody>
              </table>
              <div class="performance-legend">A = automatische melders; H = handmelders; V = vlamdetectoren; L = lijnrookmelders; ASP = aspiratie openingen.</div>
            </section>
            <section class="bmi-performance-results">
              <div class="section-heading">Calculatie maximum aantal onterechte of ongewenste meldingen</div>
              <table class="report-table performance-results-table">${renderGridColGroup([5, 3, 5, 3, 5, 3])}<tbody><tr>
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
                ${renderGridColGroup([9, 8, 8, 9, 12, 12, 13, 29])}
                <thead>
                  <tr class="matrix-continuation-row"><th colspan="8">Perioden niet beschikbaar</th></tr>
                  <tr><th>Datum</th><th>Tijd begin</th><th>Tijd einde</th><th>Tijdsduur<br>(dagen)</th><th>Uren p.d.<br>niet beschikbaar</th><th># melders<br>niet beschikbaar</th><th># melduren<br>niet beschikbaar</th><th>Omschrijving</th></tr>
                </thead>
                <tbody>${a2Rows.map((row: any) => `<tr><td>${renderValueCell(row?.datum)}</td><td>${renderValueCell(row?.tijd_begin)}</td><td>${renderValueCell(row?.tijd_einde)}</td><td>${renderValueCell(row?.tijdsduur_dagen)}</td><td>${renderValueCell(row?.uren_pd_niet_beschikbaar)}</td><td>${renderValueCell(row?.melders_niet_beschikbaar)}</td><td>${renderValueCell(row?.melduren_niet_beschikbaar)}</td><td>${renderValueCell(row?.omschrijving)}</td></tr>`).join("")}</tbody>
              </table>
              <div class="availability-note">De melduren hebben een nummernotatie. Bijvoorbeeld; 0,5 melduren is gelijk aan 30 minuten.</div>
              <section class="availability-result-block pagination-keep-together">
                <div class="subsection-title">Resultaat systeembeschikbaarheid</div>
                <table class="report-table availability-result-table availability-result-vertical">${renderGridColGroup([10, 14])}<tbody>
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

  /* De verouderingsfactor stond als eigen tabel boven aan de pagina, terwijl het één vast
     getal is dat bij de accuberekening hoort. Als kleine cursieve aanduiding onder de tabel
     staat hij waar hij thuishoort zonder een regel van het rapport op te eisen. */
  const verouderingsfactor = normalizeText(displayText(answerFor(answers, "es_verouderingsfactor"), ""));

  return `
    <section class="page-break-before report-page landscape-page bmi-measurements-page">
      <div class="page-title">${escapeHtml(firstText(page?.title, "Meetresultaten (B)"))}</div>
      ${renderEnergySupplyMatrix({ name: "es_regels" }, answers)}
      <div class="availability-note">1 De accuspanning is gemeten na ten minste 1 uur op noodstroom (tijdstippen metingen t0 en t1 + waarden).</div>
      ${verouderingsfactor ? `<div class="factor-note">Verouderingsfactor ${escapeHtml(verouderingsfactor)}</div>` : ""}
      ${
        detectorRows.length
          ? `
            <section class="bmi-detectors-section">
              <div class="section-heading">Melders</div>
              <table class="report-table detector-table">
                ${renderGridColGroup([28, 14, 20, 12, 13, 13])}
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
      ${renderGridColGroup([42, 24, 18, 16])}
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
      const reportLayout = normalizeColumnToken(page?.ember?.report?.layout);
      const hasBooleanOnlyFields =
        regularElements.length > 0 &&
        regularElements.every((element: any) => normalizeText(element?.type).toLowerCase() === "boolean");
      const reportLayoutClass =
        reportLayout === "SINGLECOLUMNFIELDS" || hasBooleanOnlyFields ? "single-column-fields" : "";

      return `
        <section class="page-break-before report-page ${reportLayoutClass} ${isLandscapeSurveyPage(page) ? "landscape-page" : ""}">
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

/* De bijlage met actiepunten.

   Dit is het blad dat de klant in de praktijk als eerste pakt en dat bij ons de afspraak
   vastlegt. Het stond eerder als losse pagina vooraan in het rapport, midden in een
   normatief document, en was een vlakke tabel waarin niet te zien was wie aan zet was.

   Wat er nu in staat en waarom:

   - De groepering volgt de verantwoordelijke. Dat is de vraag waarop iedereen het blad
     leest: moet ik iets doen, of doen jullie het. Binnen een groep staat het zwaarste
     bovenaan; certificaatblokkerend eerst, daarna op volgorde van het rapport.
   - Certificaatblokkerend staat als eigen kolom en niet verstopt in een toelichting,
     want dat bepaalt of er wel of niet afgegeven kan worden.
   - Waar het zit komt uit de pin op de tekening. Zonder pin blijft het leeg in plaats van
     dat er een streepje staat te suggereren dat er niets is.
   - Informatieve punten staan onderaan in een eigen blok; ze horen erbij maar vragen niets.

   De bijlage draait in twee vormen. In het rapport sluit hij de rij, zodat het officiële
   deel aaneengesloten blijft. Los mee te sturen krijgt hij een eigen kop met installatie en
   datum, want dan staat hij zonder voorblad op tafel. */

/* De naam van het uitvoerende bedrijf. Wardenburg en Hefas staan in dezelfde database en
   gebruiken hetzelfde rapport; zonder naam zou er "wij" staan op een blad dat los bij een
   klant op tafel ligt. Is de bedrijfsnaam onbekend, dan blijft het bij de neutrale term. */
function executingCompanyName(model: any) {
  const unit = normalizeText(model?.installation?.company_unit);
  return unit || "het onderhoudsbedrijf";
}

function responsibilityGroups(model: any): Array<{ key: string; title: string; tone: string }> {
  const bedrijf = executingCompanyName(model);

  return [
    {
      key: "KLANT",
      title: "Door opdrachtgever uit te voeren",
      tone: "is-customer",
    },
    {
      key: "INTERN",
      title: `Door ${bedrijf} uit te voeren`,
      tone: "is-internal",
    },
    {
      key: "DERDE",
      title: "Door een derde partij uit te voeren",
      tone: "is-third",
    },
    {
      key: "ONBEPAALD",
      title: "Nog te bepalen wie uitvoert",
      tone: "is-open",
    },
  ];
}

/* Een omschrijving uit het veld kan regeleinden bevatten; die horen te blijven staan. Losse
   lege regels vallen weg, anders staat er een gat midden in de tabel. */
function renderMultilineText(value: any) {
  const tekst = normalizeText(textValue(value));
  if (!tekst) return "";

  return tekst
    .split(/\r?\n/)
    .map((regel) => regel.trim())
    .filter(Boolean)
    .map((regel) => escapeHtml(regel))
    .join("<br />");
}

function actionPointDueDate(value: any) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  const dag = String(parsed.getUTCDate()).padStart(2, "0");
  const maand = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  return `${dag}-${maand}-${parsed.getUTCFullYear()}`;
}

/* Waar het punt zit, volgens de markering op de tekening. Meerdere pins worden samengevat;
   een lijst van vijf plekken in een tabelcel leest niemand meer. */
function actionPointLocation(item: any) {
  const raw = item?.drawing_pins ?? item?.drawing_pins_json;
  let pins: any[] = [];

  if (Array.isArray(raw)) pins = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) pins = parsed;
    } catch {
      pins = [];
    }
  }

  if (!pins.length) return "";

  const eerste = pins[0];
  const tekening = normalizeText(eerste?.document_title) || normalizeText(eerste?.title);
  const pagina = Number(eerste?.page_number);
  const delen = [tekening, Number.isFinite(pagina) && pagina > 0 ? `pagina ${pagina}` : ""].filter(Boolean);
  const plek = delen.join(", ");

  if (pins.length === 1) return plek || "Op tekening";
  return `${plek || "Op tekening"} en ${pins.length - 1} meer`;
}

/* Staat de code al vooraan in de titel, dan hoeft hij er niet nog een keer boven. De code
   moet dan wel als los deel vooraan staan; "C2" telt in "C2 - Doormelding" maar niet in
   "C20 storing". */
function titleStartsWithCode(titel: string, code: string) {
  const kleineTitel = normalizeText(titel).toLowerCase();
  const kleineCode = normalizeText(code).toLowerCase();

  if (!kleineCode || !kleineTitel.startsWith(kleineCode)) return false;

  const rest = kleineTitel.slice(kleineCode.length);

  return !/^[a-z0-9]/.test(rest);
}

function renderActionPointRows(items: any[], nummering: Map<any, number>, kolommen: { plek: boolean; termijn: boolean }) {
  return items
    .map((item: any) => {
      const titel = firstText(item?.workflow_title, item?.workflow_description, item?.note, "Actiepunt");
      const toelichting =
        normalizeText(item?.workflow_description) && normalizeText(item?.workflow_title)
          ? `<span class="action-point-description">${renderMultilineText(item.workflow_description)}</span>`
          : "";
      /* De code uit het rapport staat klein boven de titel; die beantwoordt de vraag waar het
         punt vandaan komt. Begint de titel zelf al met die code, dan zou hij er twee keer
         staan en vervalt de regel erboven. */
      const code = normalizeText(item?.source_item_code);
      const herkomst = code && !titleStartsWithCode(titel, code) ? code : "";
      const plek = actionPointLocation(item);
      const termijn = actionPointDueDate(item?.due_date);
      const afhandeling = firstText(item?.resolution_note, item?.resolution_outcome, "");

      return `
        <tr>
          <td class="align-center item-code-cell">${nummering.get(item) ?? ""}</td>
          <td class="action-point-cell">${herkomst ? `<span class="action-point-origin">${escapeHtml(herkomst)}</span>` : ""}<span class="action-point-title">${escapeHtml(titel)}</span>${toelichting}${afhandeling ? `<span class="action-point-resolution"><span>Afhandeling</span> ${renderMultilineText(afhandeling)}</span>` : ""}</td>
          ${kolommen.plek ? `<td>${plek ? escapeHtml(plek) : ""}</td>` : ""}
          <td class="align-center">${renderCertificateImpactChip(item?.effective_certificate_impact || item?.certificate_impact)}</td>
          ${kolommen.termijn ? `<td class="align-center action-point-due">${escapeHtml(termijn)}</td>` : ""}
          <td class="align-center">${renderFollowUpStatusChip(item?.status)}</td>
        </tr>
      `;
    })
    .join("");
}

/* De kop van een blok binnen een tabel.

   Hij staat in de thead en niet erboven, zodat Chromium hem herhaalt wanneer het blok over de
   paginarand valt; een vervolgpagina zegt dan nog steeds waar de regels bij horen. De
   actiepuntenbijlage en de documentenpagina gebruiken hem allebei, en elk blok dat later
   bijkomt kan hem overnemen. */
function renderTableGroupHead(options: {
  title: string;
  columns: number;
  count?: number;
  countLabel?: [string, string];
  intro?: string;
}) {
  const aantal =
    options.count == null || !options.countLabel
      ? ""
      : options.count === 1
        ? `1 ${options.countLabel[0]}`
        : `${options.count} ${options.countLabel[1]}`;

  return `
    <tr class="table-group-row">
      <th colspan="${options.columns}">
        <span class="table-group-title">${escapeHtml(options.title)}</span>
        ${aantal ? `<span class="table-group-count">${escapeHtml(aantal)}</span>` : ""}
        ${options.intro ? `<span class="table-group-intro">${escapeHtml(options.intro)}</span>` : ""}
      </th>
    </tr>
  `;
}

function renderActionPointTable(
  items: any[],
  nummering: Map<any, number>,
  kolommen: { plek: boolean; termijn: boolean },
  groep: { title: string; intro?: string }
) {
  /* De kolommen staan één keer beschreven; de colgroup, de koprij en de cellen komen er alle
     drie uit voort, zodat ze niet uit elkaar kunnen lopen wanneer een kolom wegvalt. */
  const kolomlijst = [
    { titel: "Nr.", breedte: 2, gecentreerd: true },
    { titel: "Actiepunt", breedte: 10, gecentreerd: false },
    ...(kolommen.plek ? [{ titel: "Waar", breedte: 4, gecentreerd: false }] : []),
    { titel: "Blokkeert certificaat", breedte: 3, gecentreerd: true },
    ...(kolommen.termijn ? [{ titel: "Uiterlijke uitvoerdatum", breedte: 4, gecentreerd: true }] : []),
    { titel: "Status", breedte: 5, gecentreerd: true },
  ];

  return `
    <table class="report-table action-points-table">
      ${renderGridColGroup(kolomlijst.map((kolom) => kolom.breedte))}
      <thead>
        ${renderTableGroupHead({
          title: groep.title,
          columns: kolomlijst.length,
          count: items.length,
          countLabel: ["punt", "punten"],
          intro: groep.intro,
        })}
        <tr>
          ${kolomlijst
            .map((kolom) => `<th class="${kolom.gecentreerd ? "align-center" : ""}">${escapeHtml(kolom.titel)}</th>`)
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${renderActionPointRows(items, nummering, kolommen)}
      </tbody>
    </table>
  `;
}

function renderActionPointsAppendix(model: any, options: { standalone?: boolean } = {}) {
  const alle = (Array.isArray(model?.followUps?.items) ? model.followUps.items : []).filter(
    (item: any) => normalizeToken(item?.status) !== "AFGEWEZEN"
  );

  if (!alle.length) return "";

  const informatief = alle.filter((item: any) => normalizeToken(item?.status) === "INFORMATIEF");
  const teDoen = alle.filter((item: any) => normalizeToken(item?.status) !== "INFORMATIEF");

  /* Binnen een groep eerst wat het certificaat tegenhoudt; dat is waar het gesprek over gaat.
     Daarna de volgorde van het rapport zelf, zodat een punt terug te vinden is. */
  const blokkeert = (item: any) =>
    normalizeColumnToken(item?.effective_certificate_impact || item?.certificate_impact) === "YES" ? 0 : 1;

  const groepen = responsibilityGroups(model).map((groep) => {
    const items = teDoen
      .filter((item: any) => {
        const soort = normalizeToken(item?.responsibility_type) || "ONBEPAALD";
        return soort === groep.key;
      })
      .map((item: any, index: number) => ({ item, index }))
      .sort((links: any, rechts: any) => blokkeert(links.item) - blokkeert(rechts.item) || links.index - rechts.index)
      .map(({ item }: any) => item);

    return { ...groep, items };
  }).filter((groep) => groep.items.length);

  /* Doorlopende nummering over de hele bijlage; zo kun je naar "punt 4" verwijzen zonder te
     zeggen in welk blok dat staat. */
  const nummering = new Map<any, number>();
  let teller = 0;
  for (const groep of groepen) for (const item of groep.items) nummering.set(item, ++teller);
  for (const item of informatief) nummering.set(item, ++teller);

  const blokkerend = teDoen.filter((item: any) => blokkeert(item) === 0).length;
  const voorKlant = groepen.find((groep) => groep.key === "KLANT")?.items.length ?? 0;
  const voorOns = groepen.find((groep) => groep.key === "INTERN")?.items.length ?? 0;

  const kolommen = {
    plek: alle.some((item: any) => Boolean(actionPointLocation(item))),
    termijn: alle.some((item: any) => Boolean(actionPointDueDate(item?.due_date))),
  };

  const attachmentMap = buildFollowUpAttachmentMap(model);
  const bewijs = [...groepen.flatMap((groep) => groep.items), ...informatief].flatMap((item: any) =>
    followUpDocumentsForItem(item, attachmentMap).map((document: any) => ({ document, nummer: nummering.get(item) }))
  );

  const installatie = firstText(
    model?.installation?.installation_name,
    model?.installation?.object_name,
    model?.item?.atrium_installation_code,
    ""
  );
  const adres = buildAddress(model);

  return `
    <section class="page-break-before report-page action-points-appendix">
      <div class="appendix-header">
        <div class="appendix-eyebrow">Bijlage</div>
        <div class="page-title">Actiepunten</div>
        ${
          options.standalone
            ? `<div class="appendix-context">${[installatie, adres]
                .map((deel: any) => normalizeText(displayText(deel)))
                .filter((deel: string) => deel && deel !== "-")
                .map((deel: string) => escapeHtml(deel))
                .join(" &middot; ")}</div>`
            : ""
        }
        <div class="page-intro">Deze lijst hoort bij het onderhoudsrapport en bevat de actiepunten uit dat rapport. Per punt staat wie het uitvoert en of het de afgifte van een certificaat blokkeert.</div>
      </div>

      <section class="appendix-summary">
        <div class="appendix-summary__title">Samenvatting</div>
        <dl class="appendix-summary__list">
          <div class="appendix-summary__row">
            <dt>Openstaande punten</dt>
            <dd>${teDoen.length}</dd>
          </div>
          <div class="appendix-summary__row${blokkerend ? " is-alert" : ""}">
            <dt>Waarvan certificaatblokkerend</dt>
            <dd>${blokkerend}</dd>
          </div>
          <div class="appendix-summary__row">
            <dt>Door opdrachtgever uit te voeren</dt>
            <dd>${voorKlant}</dd>
          </div>
          <div class="appendix-summary__row">
            <dt>Door ${escapeHtml(executingCompanyName(model))} uit te voeren</dt>
            <dd>${voorOns}</dd>
          </div>
          ${informatief.length ? `
          <div class="appendix-summary__row is-muted">
            <dt>Ter informatie</dt>
            <dd>${informatief.length}</dd>
          </div>` : ""}
        </dl>
      </section>

      ${groepen
        .map(
          (groep) => `
            <section class="appendix-group ${groep.tone}">
              ${renderActionPointTable(groep.items, nummering, kolommen, groep)}
            </section>
          `
        )
        .join("")}

      ${
        informatief.length
          ? `
            <section class="appendix-group is-info">
              ${renderActionPointTable(informatief, nummering, kolommen, {
                title: "Ter informatie",
                intro: "Deze punten blokkeren de afgifte van een certificaat niet.",
              })}
            </section>
          `
          : ""
      }

      ${
        bewijs.length
          ? `
            <section class="evidence-section appendix-evidence">
              <div class="section-heading">Bewijsstukken</div>
              <div class="attachment-grid">
                ${bewijs
                  .map(
                    ({ document, nummer }: any) =>
                      `<div><div class="evidence-label">Punt ${nummer}</div>${renderAttachmentCard(document)}</div>`
                  )
                  .join("")}
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
  const documentGroups = installationGroups.filter((group: any) => Array.isArray(group?.items) && group.items.length);
  const documentCount = documentGroups.reduce((total: number, group: any) => total + group.items.length, 0);

  const formDocuments = Array.isArray(model?.formInstanceDocuments?.items)
    ? model.formInstanceDocuments.items.filter((item: any) => !Array.isArray(item?.follow_ups) || item.follow_ups.length === 0)
    : [];

  const chunks = <T>(items: T[], size: number) =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
  const attachmentBlocks = chunks(formDocuments, 2);

  /* De documentsoort stond op elke regel opnieuw; bij negen plattegronden staat er negen keer
     "Plattegronden". De soort is geen eigenschap van een regel maar de kop van een blok, dus
     hij staat nu één keer boven zijn documenten en loopt mee over de paginarand. */
  const kolomlijst = [
    { titel: "Titel", breedte: 9, gecentreerd: false },
    { titel: "Documentnr", breedte: 4, gecentreerd: false },
    { titel: "Datum", breedte: 3, gecentreerd: true },
    { titel: "Revisie", breedte: 2, gecentreerd: true },
    { titel: "Bestand", breedte: 6, gecentreerd: false },
  ];

  const renderDocumentGroup = (group: any) => `
    <table class="report-table document-table pagination-splittable-table">
      ${renderGridColGroup(kolomlijst.map((kolom) => kolom.breedte))}
      <thead>
        ${renderTableGroupHead({
          title: firstText(group?.name, "Overig"),
          columns: kolomlijst.length,
          count: group.items.length,
          countLabel: ["document", "documenten"],
        })}
        <tr>
          ${kolomlijst
            .map((kolom) => `<th class="${kolom.gecentreerd ? "align-center" : ""}">${escapeHtml(kolom.titel)}</th>`)
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${group.items
          .map(
            (item: any) => `
              <tr>
                <td>${escapeHtml(firstText(item?.title, item?.file_name, "Document"))}</td>
                <td>${escapeHtml(displayText(item?.document_number))}</td>
                <td class="align-center">${escapeHtml(displayText(formatExportDate(item?.document_date)))}</td>
                <td class="align-center">${escapeHtml(displayText(item?.revision))}</td>
                <td class="document-file-cell">${escapeHtml(displayText(item?.file_name))}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;

  return `
    <section class="page-break-before report-page ${documentCount ? "landscape-page" : ""} documents-page">
      <div class="page-title">Documenten</div>
      <div class="page-intro">Installatiebestanden en overige formulierbijlagen die bij dit rapport horen.</div>
      ${
        documentCount
          ? documentGroups.map(renderDocumentGroup).join("")
          : `<div class="page-note">Er zijn geen installatiebestanden aan dit rapport gekoppeld.</div>`
      }
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

function canShowSignatureForBlock(
  model: any,
  blockKey: string,
  signerRole: string = "OPSTELLER",
  blockSigner: any = null
) {
  const isFinal = normalizeToken(model?.form?.status) === "AFGEHANDELD";
  if (!isFinal) {
    return {
      allowed: false,
      reason: "Ondertekening volgt nadat het formulier definitief is afgehandeld.",
    };
  }

  /*  Het tweede ondertekenblok hoort bij het definitief maken. Staat dat moment niet
      vastgelegd, dan is er niemand om onder dit blok te zetten; dat is het geval bij
      formulieren die definitief werden voordat het afrondmoment werd bijgehouden. Dan
      liever een leeg vak dan de naam van de opsteller onder de beoordeling.  */
  if (signerRole === "AFRONDER" && !blockSigner?.present) {
    return { allowed: false, reason: "" };
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
  return Array.isArray(configured) && configured.length
    ? configured
    : [
        {
          key: "verklaring",
          title: "Verklaring",
          text: "De opsteller verklaart dat de resultaten en bevindingen in dit formulier zijn vastgelegd.",
          footerText: "",
        },
      ];
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

/*  Welke van de twee ondertekenmomenten bij dit blok hoort. Zegt het blok niets, dan is het
    de opsteller; dat houdt het BMI-onderhoudsrapport en elk ander bestaand rapport precies
    zoals het was.  */
function blockSignerRole(block: any) {
  const declared = normalizeToken(block?.signerRole);
  return declared === "AFRONDER" ? "AFRONDER" : "OPSTELLER";
}

/*  De ondertekenaar van een blok, met de naam en de datum van dat moment.

    De handtekening komt altijd live uit het profiel van die persoon; er wordt niets
    gesnapshot. Heeft iemand geen handtekening in zijn profiel, dan blijft het vak leeg en
    wordt er met de hand ondertekend.  */
function resolveBlockSigner(model: any, role: string) {
  if (role === "AFRONDER") {
    const afronder = model?.signers?.AFRONDER || null;
    return {
      name: normalizeText(afronder?.profileName),
      signatureDataUrl: normalizeText(afronder?.signatureDataUrl),
      dateText: formatExportDate(model?.signers?.finalizedAt),
      present: Boolean(afronder),
    };
  }

  const opsteller = model?.signers?.OPSTELLER || model?.signer || null;
  const name = firstText(
    answerText(model?.answers, "onderhouder_naam", "Naamonderhouder", "Naam onderhouder_2"),
    answerText(model?.answers, "ondertekening_inspecteur", "naam_inspecteur"),
    opsteller?.profileName,
    model?.viewer?.profile_name
  );

  return {
    name,
    signatureDataUrl: normalizeText(opsteller?.signatureDataUrl),
    dateText: answerDateText(
      model?.answers,
      "datum_onderhoud",
      "Datum_onderhoud_af_date",
      "datum onderhoud_2",
      "datum_ondertekening_inspecteur",
      "datum_inspectie"
    ),
    present: Boolean(opsteller),
  };
}

function renderSignaturePage(model: any) {
  const blocks = signatureBlocks(model);
  const closing = signatureClosingText(model);
  const signerName = firstText(
    answerText(model?.answers, "onderhouder_naam", "Naamonderhouder", "Naam onderhouder_2"),
    answerText(model?.answers, "ondertekening_inspecteur", "naam_inspecteur"),
    model?.signer?.profileName,
    model?.viewer?.profile_name
  );
  const onderhoudDatum = answerDateText(
    model?.answers,
    "datum_onderhoud",
    "Datum_onderhoud_af_date",
    "datum onderhoud_2",
    "datum_ondertekening_inspecteur",
    "datum_inspectie"
  );

  return `
    <section class="page-break-before report-page">
      <div class="page-title">Ondertekening</div>
      <div class="signature-list">
        ${blocks
          .map((block: any) => {
            const blockKey = normalizeToken(block?.key || block?.title);
            const signerRole = blockSignerRole(block);
            const blockSigner = resolveBlockSigner(model, signerRole);
            const signatureState = canShowSignatureForBlock(
              model,
              blockKey === "AANVULLENDEWERKZAAMHEDEN" ? "aanvullende_werkzaamheden" : blockKey.toLowerCase(),
              signerRole,
              blockSigner
            );
            const signatureDataUrl = blockSigner.signatureDataUrl;
            const signatureNotice = normalizeText(signatureState.reason);

            /* Definitief is definitief. Staat het formulier vast en heeft de indiener geen
               handtekening in zijn profiel, dan blijft het vak leeg; geen "nog niet
               ondertekend" en geen regel erboven die dat herhaalt. Een leeg vak van 28 mm
               is bovendien precies genoeg om het rapport uit te printen en er met de hand
               een krabbel onder te zetten.

               Is het formulier nog niet definitief, dan blijft de uitleg wel staan; dat is
               een tussenstand en dan hoort de lezer te weten waarom er niets staat. */
            const toonHandtekening = signatureState.allowed && Boolean(signatureDataUrl);
            const toonUitleg = !signatureState.allowed && Boolean(signatureNotice);
            return `
              <article class="signature-block">
                <div class="signature-block-header">
                  <div class="signature-title">${escapeHtml(firstText(block?.title, "Ondertekening"))}</div>
                </div>
                ${
                  normalizeText(block?.text)
                    ? `<div class="signature-subtitle">${escapeHtml(firstText(block?.text))}</div>`
                    : ""
                }
                <div class="signature-body">
                  <table class="report-table signature-meta-table">
                    ${renderGridColGroup([8, 8, 8])}
                    <tbody>
                      <tr>
                        <th>Naam</th>
                        <th>Datum</th>
                        <th>Handtekening</th>
                      </tr>
                      <tr>
                        <td>${escapeHtml(displayText(blockSigner.name || signerName))}</td>
                        <td>${escapeHtml(displayText(blockSigner.dateText || onderhoudDatum))}</td>
                        <td>${toonHandtekening ? "Vastgelegd" : ""}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div class="signature-box">
                    ${
                      toonHandtekening
                        ? `<img src="${signatureDataUrl}" alt="Handtekening" />`
                        : toonUitleg
                          ? `<div class="signature-empty">${escapeHtml(signatureNotice)}</div>`
                          : ""
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
    ${renderSurveyPages(model)}
    ${renderSignaturePage(model)}
    ${renderActionPointsAppendix(model, { standalone: false })}
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
          .report-page { min-height: 1px; padding: 5mm 1mm 0 0; }

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

          .report-page.single-column-fields .field-grid {
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
            max-width: 100%;
            box-sizing: border-box;
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

/* Het rapportblad; alle pagina's van het rapport delen deze schil en dus deze stylesheet.
   De uitvoer gaat langs twee bewerkingen: dubbele blokkoppen vervallen en elke tabel krijgt
   de dichtheidsklasse die bij zijn aantal kolommen hoort. */
function renderBodyDocumentShell(model: any, bodyContent: string) {
  const reportTitle = firstText(reportConfig(model)?.coverMainTitle, "Rapport van Onderhoud");

  const html = `
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
          .report-page { min-height: 1px; padding: 5mm 1mm 0 0; }

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

          .report-page.single-column-fields .field-grid {
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
            font-size: 13.5pt;
            font-weight: 700;
            margin: 0 0 3mm 0;
          }

          .subsection-title {
            font-size: 10.5pt;
            color: var(--muted);
            font-weight: 700;
            margin: 0 0 2.4mm 0;
            break-after: avoid;
            page-break-after: avoid;
          }

          /* Elk blok op een pagina houdt afstand van wat eraan voorafgaat. De koppen zaten met
             hun ruimte in hun eigen sectie, dus een kop die als eerste in een nieuwe sectie
             stond plakte tegen de tabel of de voetnoot erboven. De afstand hoort bij het blok
             zelf; dan geldt hij voor elk formulier, ook voor blokken die nog niet bestaan. */
          .report-page > * + section,
          .report-page > * + .section-heading,
          .report-page > * + .subsection-title,
          .report-page > * + table,
          .report-page section > * + .section-heading,
          .report-page section > * + .subsection-title {
            margin-top: 7mm;
          }

          /* Onder de paginatitel begint de inhoud meteen; die ruimte staat al in de titel. */
          .report-page > .page-title + * {
            margin-top: 0;
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
            max-width: 100%;
            box-sizing: border-box;
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
            vertical-align: middle;
            white-space: pre-wrap;
            word-break: normal;
            overflow-wrap: anywhere;
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
            min-width: 14mm;
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


          .info-table th { width: 34%; }

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

          /* ------------------------------------------------------ Eén ritme voor alle tabellen.

             De dichtheid komt uit het aantal kolommen en niet uit het formulier, zodat twee
             tabellen met evenveel kolommen er hetzelfde uitzien waar ze ook staan. De
             minimumhoogte maakt een regel van één tekstregel overal even hoog; dat is wat
             opeenvolgende tabellen op een pagina rustig maakt in plaats van hakkelig. */
          .report-table th,
          .report-table td {
            height: 9mm;
          }

          /* ------------------------------------------------------ Etiketten in een tabelregel.

             Een etiket maakte de regel hoger dan een regel met alleen tekst, waardoor de
             hoogte van rij tot rij sprong; precies dat maakt een pagina onrustig. Het etiket
             past nu binnen de minimumhoogte van een regel. Een etiket met een lang opschrift
             mag nog wel groeien, anders zou de tekst eruit lopen. */
          .assessment-chip,
          .availability-value {
            box-sizing: border-box;
            min-height: 4.4mm;
            padding: 0 2.4mm;
            line-height: 1.15;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }


          /* In een dichte tabel is een vaste minimumbreedte te veel gevraagd; het etiket duwde
             de tabel dan breder dan zijn buren op dezelfde pagina. Daar krimpt het mee. */
          .report-table.is-regular .assessment-chip,
          .report-table.is-tight .assessment-chip {
            min-width: 0;
            padding: 0 1.4mm;
          }
          .report-table.is-roomy th,
          .report-table.is-roomy td {
            font-size: 9pt;
            padding: 2.2mm 2.8mm;
            line-height: 1.3;
          }

          .report-table.is-regular th,
          .report-table.is-regular td {
            font-size: 8.2pt;
            padding: 1.9mm 2.2mm;
            line-height: 1.25;
          }

          .report-table.is-tight th,
          .report-table.is-tight td {
            font-size: 7.6pt;
            padding: 1.5mm 1.6mm;
            line-height: 1.2;
          }

          /* Smalle kolommen hebben koppen van twee of drie regels nodig; die mogen breken op
             een spatie, maar niet midden in een woord. */
          .report-table.is-regular th,
          .report-table.is-tight th {
            white-space: normal;
            word-break: normal;
            overflow-wrap: normal;
          }

          /* ------------------------------------------------------ Naam-waardeparen.

             Eén doorlopend raster met tussenkoppen in plaats van een reeks losse tabellen. */

          /* De waarde is waar het om gaat; het opschrift ervoor mag een toon zachter. */
          .info-grid-table tbody th {
            color: var(--muted);
            font-weight: 400;
          }

          .info-grid-table td {
            font-weight: 700;
          }

          /* De tussenkop was een witte regel en las daardoor als een gat in de tabel in plaats
             van als een kop. Een gevulde band met een stevige lijn erboven zet de groep af
             tegen wat eraan voorafgaat; kleine kapitalen maken hem herkenbaar zonder hem
             groter te maken dan de gegevens eronder. */

          .table-detail { margin-top: 1.3mm; color: var(--muted); font-size: 8.8pt; }
          .evidence-section { margin-top: 6mm; }
          .evidence-label { margin: 0 0 1.4mm; color: var(--muted); font-size: 8.5pt; font-weight: 700; }

          /* Bijlage met actiepunten.

             Het blad moet op zichzelf kunnen staan, want het gaat los mee naar de klant en
             wordt naast het rapport gelegd. Vandaar een eigen kop, een strip met de cijfers
             waar het gesprek over gaat, en blokken per verantwoordelijke met een gekleurde
             rand zodat je in een oogopslag ziet wie aan zet is. */
          .action-points-appendix .appendix-header {
            padding-bottom: 3mm;
            margin-bottom: 5mm;
            border-bottom: 0.8mm solid var(--accent);
          }

          .appendix-eyebrow {
            font-size: 9pt;
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 1.5mm;
          }

          .action-points-appendix .appendix-header .page-title {
            margin-bottom: 2mm;
          }

          .appendix-context {
            font-weight: 700;
            margin-bottom: 2mm;
          }

          .action-points-appendix .appendix-header .page-intro {
            margin-bottom: 0;
          }

          /* De samenvatting leest als een kerngetallenoverzicht in een rapport en niet als een
             rij knoppen; geen kaders om de cijfers, nadruk komt van de typografie. Het
             blokkerende aantal is het enige dat opvalt, want daar gaat het gesprek over. */
          .appendix-summary {
            margin-bottom: 7mm;
            padding: 3.5mm 0 1mm;
            border-top: 0.5pt solid var(--line);
            border-bottom: 0.5pt solid var(--line);
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .appendix-summary__title {
            font-size: 8.4pt;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--muted);
            margin-bottom: 2.5mm;
          }

          .appendix-summary__list {
            margin: 0;
            padding: 0;
          }

          .appendix-summary__row {
            display: flex;
            align-items: baseline;
            gap: 3mm;
            padding: 1.3mm 0;
          }

          .appendix-summary__row dt {
            margin: 0;
            flex: 1 1 auto;
          }

          /* Een stippellijn tussen naam en getal, zoals in een inhoudsopgave; dat leest als
             document en houdt de cijfers op één lijn. */
          .appendix-summary__row dt::after {
            content: "";
            display: inline-block;
            width: 0;
          }

          .appendix-summary__row dd {
            margin: 0;
            flex: 0 0 14mm;
            text-align: right;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
          }

          .appendix-summary__row.is-alert dt,
          .appendix-summary__row.is-alert dd {
            color: var(--accent);
            font-weight: 700;
          }

          .appendix-summary__row.is-muted dt,
          .appendix-summary__row.is-muted dd {
            color: var(--muted);
            font-weight: 400;
          }

          .appendix-summary__row.is-muted dd {
            font-weight: 700;
          }

          /* De omschrijving van een actiepunt.

             Tabelcellen in het rapport staan op pre-wrap voor antwoorden met eigen regels. In
             deze tabel gaf dat de inspringing van de opmaak terug als witruimte, waardoor
             regels onnodig hoog werden. Hier dus normaal, met eigen regeleinden. */
          /* De groepskop staat in de thead en niet erboven, zodat Chromium hem herhaalt wanneer
             een blok over de paginarand valt. Zonder dat begint een volgende pagina met een
             tabel die niet zegt wie de punten uitvoert. */
          /* ------------------------------------------------------ De kop van een blok.

             Eén uiterlijk voor elke tussenkop in een tabel, of het nu de groepen op Algemeen
             zijn, de documentsoorten of de blokken in de actiepuntenbijlage. Een gevulde band
             met een stevige lijn erboven zet de groep af tegen wat eraan voorafgaat; kleine
             kapitalen maken hem herkenbaar zonder hem groter te maken dan de gegevens
             eronder. */
          .report-table tr.table-group-row th,
          .info-grid-table .info-grid-group th {
            width: auto;
            height: auto;
            background: var(--panel-strong);
            color: var(--ink);
            font-size: 8.4pt;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            text-align: left;
            white-space: normal;
            border-top: 1.4pt solid var(--ink);
            border-left: 0;
            border-right: 0;
            padding: 1.8mm 2.8mm;
          }

          .table-group-count {
            margin-left: 3mm;
            font-weight: 400;
            letter-spacing: 0.04em;
            text-transform: none;
            color: var(--muted);
          }

          .table-group-intro {
            display: block;
            margin-top: 1.2mm;
            font-size: 8.4pt;
            font-weight: 400;
            letter-spacing: 0;
            text-transform: none;
            color: var(--muted);
          }

          .action-points-table td,
          .action-points-table th {
            white-space: normal;
          }

          .action-point-cell {
            line-height: 1.35;
          }

          .action-point-origin {
            display: block;
            font-size: 8pt;
            font-weight: 700;
            color: var(--muted);
            margin-bottom: 0.6mm;
          }

          .action-point-title {
            display: block;
            font-weight: 700;
          }

          .action-point-description {
            display: block;
            margin-top: 0.8mm;
            color: var(--muted);
            font-size: 8.8pt;
          }

          .action-point-resolution {
            display: block;
            margin-top: 1.2mm;
            font-size: 8.8pt;
          }

          .action-point-resolution span {
            font-weight: 700;
            color: var(--muted);
          }

          .appendix-group {
            margin-bottom: 6mm;
            padding-left: 3.5mm;
            border-left: 1mm solid var(--line);
          }

          .appendix-group.is-customer { border-left-color: var(--accent); }
          .appendix-group.is-internal { border-left-color: #0f172a; }
          .appendix-group.is-third { border-left-color: #878787; }
          .appendix-group.is-open { border-left-color: #c7c7c7; }
          .appendix-group.is-info { border-left-color: #e2e2e2; }

          .action-point-due {
            white-space: nowrap;
          }

          .appendix-evidence {
            break-before: auto;
          }



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
          .availability-value.is-yes { background: var(--success-soft); color: #135f49; border: 1px solid #9ad8bb; }
          .availability-value.is-no { background: #fff2f1; color: #9f2620; border: 1px solid #f0b0ab; }

          .compact-pair-table { margin-bottom: 4mm; }
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
          .performance-requirements-table th:nth-child(1),
          .performance-requirements-table th:nth-child(2),
          .performance-requirements-table td:nth-child(1),
          .performance-requirements-table td:nth-child(2) { white-space: pre-wrap; overflow-wrap: anywhere; }
          .performance-legend,
          .availability-note { margin-top: 3mm; color: var(--muted); font-size: 9pt; }
          .system-availability-table th {
            line-height: 1.2;
            white-space: normal;
            word-break: normal;
            overflow-wrap: normal;
          }
          .system-availability-table td:last-child { white-space: pre-wrap; overflow-wrap: anywhere; }
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

          /* De kop van een ondertekenblok volgt dezelfde band als de tussenkoppen in de
             tabellen; zo ziet een blok op deze pagina er hetzelfde uit als een blok elders in
             het rapport. De toelichting staat eronder, buiten de band, omdat het een zin is
             en geen opschrift. */
          .signature-block-header {
            display: flex;
            justify-content: space-between;
            gap: 4mm;
            align-items: baseline;
            background: var(--panel-strong);
            border-bottom: 1px solid var(--line);
            padding: 1.8mm 3.8mm;
          }

          .signature-title {
            font-size: 8.4pt;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--ink);
          }

          .signature-subtitle {
            padding: 3mm 3.8mm 0 3.8mm;
            color: var(--muted);
            font-size: 9pt;
            line-height: 1.35;
          }

          .signature-state {
            max-width: 46mm;
            text-align: right;
            color: var(--muted);
            font-size: 8.4pt;
            font-weight: 700;
          }

          /* Het ondertekenblok volgt hetzelfde kolomraster als de rest van het rapport; de
             naam-, datum- en handtekeningkolom stonden in een eigen css-raster en kwamen
             daardoor nergens op een lijn uit. Als tabel loopt het blok mee in de uitlijning
             per pagina.

             De blokinhoud loopt van rand tot rand, zodat de tabel en het handtekeningvak
             precies op de rand van de kaart staan; eerder zat er een tweede lijn een paar
             millimeter naar binnen en dat las als een kader in een kader. */
          .signature-body {
            padding: 0;
          }

          .signature-meta-table {
            border-left: 0;
            border-right: 0;
            border-top: 0;
          }

          .signature-box {
            border: 0;
            border-bottom: 1px solid var(--line);
            min-height: 26mm;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            overflow: hidden;
            padding: 3mm 5mm;
          }
          .signature-meta {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 3mm;
            margin-bottom: 3.4mm;
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

          /* Een kleine cursieve aanduiding onder een tabel; een vast gegeven dat erbij hoort
             maar geen eigen regel in het rapport verdient. */
          .factor-note {
            margin-top: 1.5mm;
            color: var(--muted);
            font-size: 8.4pt;
            font-style: italic;
          }

          /* Een losse mededeling op een pagina; geen kader, want er staat niets in dat kader
             hoeft te worden. */
          .page-note {
            color: var(--muted);
            margin-bottom: 5mm;
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

  return applyTableDensity(alignTablesWithinPages(dropDuplicateTableCaptions(html)));
}

/* Het volledige rapport. De bijlage met actiepunten sluit de rij; een normatief document
   hoort niet halverwege onderbroken te worden door een eigen hoofdstuk, dus de lijst staat
   achteraan in plaats van vooraan. */
function renderBodyHtmlDocument(model: any) {
  return renderBodyDocumentShell(
    model,
    `
      ${renderSurveyPages(model)}
      ${renderSignaturePage(model)}
      ${renderActionPointsAppendix(model, { standalone: false })}
    `
  );
}

/* Dezelfde bijlage, maar als zelfstandig document om los mee te sturen. */
export function renderActionPointsDocument(model: any) {
  return renderBodyDocumentShell(model, renderActionPointsAppendix(model, { standalone: true }));
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

/**
 * Rendert een los HTML-document naar pdf op dezelfde gedeelde browser.
 * Bedoeld voor kleinere documenten zoals het inspectiedossier; het
 * formulierrapport houdt zijn eigen voorblad- en bodyroute.
 */
export async function renderHtmlToPdf(
  html: string,
  options: { headerTemplate?: string; footerTemplate?: string; margin?: Record<string, string> } = {}
): Promise<Buffer> {
  const browser = await getBrowser();
  await primeHtmlFormReportRenderer(browser);
  const page = await withTimeout("pdf page creation", browser.newPage(), FORM_REPORT_RENDER_STEP_TIMEOUT_MS);
  page.setDefaultTimeout(FORM_REPORT_RENDER_STEP_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(FORM_REPORT_RENDER_STEP_TIMEOUT_MS);

  try {
    await withTimeout("pdf html content", page.setContent(html, { waitUntil: "domcontentloaded" }), FORM_REPORT_RENDER_STEP_TIMEOUT_MS);
    await waitForDocumentFonts(page, "document");
    const useHeaderFooter = Boolean(options.headerTemplate || options.footerTemplate);
    return Buffer.from(
      await withTimeout(
        "pdf render",
        page.pdf({
          format: "A4",
          printBackground: true,
          displayHeaderFooter: useHeaderFooter,
          ...(useHeaderFooter ? { headerTemplate: options.headerTemplate || "<span></span>", footerTemplate: options.footerTemplate || "<span></span>" } : {}),
          margin: options.margin || { top: "18mm", right: "12mm", bottom: "16mm", left: "12mm" },
        }),
        FORM_REPORT_RENDER_STEP_TIMEOUT_MS
      )
    );
  } finally {
    await page.close().catch(() => {});
  }
}

/* De actiepuntenbijlage als los document.

   Nancy typte deze lijst met de hand over in een mail; dit is hetzelfde blad dat achterin
   het rapport staat, maar dan zelfstandig, met installatie en adres in de kop zodat het
   losgeknipt nog steeds te plaatsen is. Kop, voet en marges zijn gelijk aan het rapport,
   zodat het er niet uitziet als een ander document van een andere partij.

   Levert null wanneer er geen actiepunten zijn; dan valt er niets mee te sturen en hoort de
   knop niet te doen alsof. */
export async function tryBuildActionPointsPdf(model: any): Promise<Buffer | null> {
  const html = renderActionPointsDocument(model);
  if (!normalizeText(html)) return null;

  return await renderHtmlToPdf(html, {
    headerTemplate: buildPdfHeaderTemplate(model),
    footerTemplate: `
      <div style="width:100%;padding:0 12mm;font-size:8pt;color:#52627a;font-family:Calibri,Arial,sans-serif;box-sizing:border-box;">
        <div style="width:100%;display:flex;justify-content:space-between;align-items:center;">
          <span>${escapeHtml(footerLeftLabel(model))}</span>
          <span>Pagina <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>
      </div>
    `,
    margin: {
      top: "24mm",
      right: "12mm",
      bottom: "16mm",
      left: "12mm",
    },
  });
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
