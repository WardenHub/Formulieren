import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const playwrightBrowsersPath = path.join(rootDir, "playwright-browsers");
const playwrightRuntimeRoot = path.join(rootDir, "playwright-runtime");
const executablePathFile = path.join(playwrightRuntimeRoot, "browser-executable.txt");
const runtimeLibPath = path.join(playwrightRuntimeRoot, "lib");
const fontconfigRoot = path.join(playwrightRuntimeRoot, "fontconfig");

function existingPath(candidate) {
  if (!candidate) return "";
  return fs.existsSync(candidate) ? candidate : "";
}

function remapExecutablePath(rawValue) {
  const candidate = String(rawValue || "").trim();
  if (!candidate) return "";
  if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;

  const normalizedCandidate = candidate.replace(/\\/g, "/");
  const marker = "/playwright-browsers/";
  const markerIndex = normalizedCandidate.indexOf(marker);
  if (markerIndex >= 0) {
    const suffix = normalizedCandidate.slice(markerIndex + marker.length);
    const remapped = path.join(playwrightBrowsersPath, ...suffix.split("/"));
    if (fs.existsSync(remapped)) return remapped;
  }

  const rootedCandidate = path.join(rootDir, candidate);
  return existingPath(rootedCandidate);
}

function readExecutablePath() {
  if (!fs.existsSync(executablePathFile)) {
    throw new Error(`browser executable manifest ontbreekt: ${executablePathFile}`);
  }

  const executablePath = remapExecutablePath(fs.readFileSync(executablePathFile, "utf8"));
  if (!executablePath) {
    throw new Error(`browser executable kon niet worden herleid vanuit ${executablePathFile}`);
  }

  return executablePath;
}

function buildLaunchEnv() {
  const env = { ...process.env };
  const runtimeHome = path.join(os.tmpdir(), "ember-playwright-check-home");
  fs.mkdirSync(runtimeHome, { recursive: true });

  env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersPath;
  env.PLAYWRIGHT_RUNTIME_ROOT = playwrightRuntimeRoot;
  env.PLAYWRIGHT_EXECUTABLE_PATH_FILE = executablePathFile;
  env.PLAYWRIGHT_SKIP_SYSTEM_DEPS = "1";
  env.HOME = runtimeHome;
  env.XDG_CACHE_HOME = path.join(runtimeHome, ".cache");
  env.XDG_CONFIG_HOME = path.join(runtimeHome, ".config");
  env.XDG_RUNTIME_DIR = path.join(runtimeHome, ".runtime");
  env.XDG_DATA_HOME = path.join(runtimeHome, ".local", "share");

  if (fs.existsSync(runtimeLibPath)) {
    const currentLd = String(env.LD_LIBRARY_PATH || "").trim();
    env.LD_LIBRARY_PATH = currentLd ? `${runtimeLibPath}:${currentLd}` : runtimeLibPath;
  }

  const fontsConf = path.join(fontconfigRoot, "etc", "fonts", "fonts.conf");
  if (fs.existsSync(fontsConf)) {
    env.FONTCONFIG_SYSROOT = fontconfigRoot;
    env.FONTCONFIG_PATH = path.join(fontconfigRoot, "etc", "fonts");
    env.FONTCONFIG_FILE = fontsConf;
  }

  return env;
}

const executablePath = readExecutablePath();
process.env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersPath;

const { chromium } = await import("playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath,
  env: buildLaunchEnv(),
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ],
});

const page = await browser.newPage();
await page.setContent("<html><body><h1>Ember Playwright check</h1><p>runtime ok</p></body></html>");
const pdf = await page.pdf({ format: "A4", printBackground: true });

if (!pdf || !pdf.length) {
  throw new Error("pdf check gaf een leeg resultaat terug");
}

console.log("chromium ok", {
  executablePath,
  bytes: pdf.length,
});

await page.close();
await browser.close();
