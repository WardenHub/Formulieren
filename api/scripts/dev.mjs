import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tsxCliPath = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const playwrightCliPath = path.join(rootDir, "node_modules", "playwright", "cli.js");
const typescriptCliPath = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");

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
  const browserEnv = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: "0",
  };

  const { chromium } = await import("playwright");
  const executablePath = chromium.executablePath();

  if (executablePath && fs.existsSync(executablePath)) {
    return;
  }

  console.log("[dev] Playwright Chromium ontbreekt; installatie wordt gestart...");

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

const child = spawn(process.execPath, [tsxCliPath, "watch", "src/server.ts"], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    PLAYWRIGHT_BROWSERS_PATH: "0",
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
