import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const playwrightBrowsersPath = path.join(rootDir, "playwright-browsers");
const tsxCliPath = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const playwrightCliPath = path.join(rootDir, "node_modules", "playwright", "cli.js");
const typescriptCliPath = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");
const windowsDevScriptPath = path.join(__dirname, "start-api-dev.ps1");

async function ensureApiDependencies() {
  if (fs.existsSync(tsxCliPath) && fs.existsSync(playwrightCliPath) && fs.existsSync(typescriptCliPath)) {
    console.log("[dev] API dependencies al beschikbaar.");
    return;
  }

  console.log("[dev] API dependencies ontbreken; npm ci wordt gestart...");

  await new Promise((resolve, reject) => {
    const installer = spawn("npm", ["ci"], {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });

    installer.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`[dev] API npm ci onderbroken door signaal ${signal}`));
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`[dev] API npm ci faalde met exitcode ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
}

async function ensurePlaywrightChromium() {
  const { chromium } = await import("playwright");
  const executablePath = chromium.executablePath();

  if (executablePath && fs.existsSync(executablePath)) {
    return;
  }

  console.log("[dev] Playwright Chromium ontbreekt; installatie wordt gestart...");

  const browserEnv = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
  };

  await new Promise((resolve, reject) => {
    const installer = spawn(process.execPath, [playwrightCliPath, "install", "chromium"], {
      cwd: rootDir,
      stdio: "inherit",
      env: browserEnv,
    });

    installer.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`[dev] Playwright install onderbroken door signaal ${signal}`));
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`[dev] Playwright install faalde met exitcode ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
}

await ensureApiDependencies();
await ensurePlaywrightChromium();

const powershellLookup = process.platform === "win32"
  ? spawnSync("where.exe", ["pwsh.exe"], { encoding: "utf8", windowsHide: true })
  : null;
const powershellCommand = String(powershellLookup?.stdout || "").split(/\r?\n/).find(Boolean) || "powershell.exe";
const childCommand = process.platform === "win32" ? powershellCommand : process.execPath;
const childArgs = process.platform === "win32"
  ? [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      windowsDevScriptPath,
      "-NodePath",
      process.execPath,
      "-TsxCliPath",
      tsxCliPath,
      "-PlaywrightBrowsersPath",
      playwrightBrowsersPath,
    ]
  : [tsxCliPath, "watch", "src/server.ts"];

const child = spawn(childCommand, childArgs, {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
  },
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
