import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const playwrightBrowsersPath = path.join(rootDir, "playwright-browsers");

process.env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersPath;

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });

console.log("chromium ok");

await browser.close();
