import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const viteCliPath = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");

async function ensureFrontendDependencies() {
  if (fs.existsSync(viteCliPath)) {
    console.log("[dev] Frontend dependencies al beschikbaar.");
    return;
  }

  console.log("[dev] Frontend dependencies ontbreken; npm ci wordt gestart...");

  await new Promise((resolve, reject) => {
    const installer = spawn("npm", ["ci"], {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });

    installer.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`[dev] Frontend npm ci onderbroken door signaal ${signal}`));
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`[dev] Frontend npm ci faalde met exitcode ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
}

await ensureFrontendDependencies();

const child = spawn(process.execPath, [viteCliPath], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
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
