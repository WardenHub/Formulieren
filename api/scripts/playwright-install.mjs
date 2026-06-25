import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const playwrightCliPath = path.join(rootDir, "node_modules", "playwright", "cli.js");
const playwrightBrowsersPath = path.join(rootDir, "playwright-browsers");

await new Promise((resolve, reject) => {
  const installer = spawn(process.execPath, [playwrightCliPath, "install", "chromium"], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
    },
  });

  installer.on("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`Playwright install onderbroken door signaal ${signal}`));
      return;
    }

    if ((code ?? 1) !== 0) {
      reject(new Error(`Playwright install faalde met exitcode ${code ?? 1}`));
      return;
    }

    resolve();
  });
});
