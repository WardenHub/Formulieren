import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tsxCliPath = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");

const child = spawn(process.execPath, [tsxCliPath, "watch", "src/server.ts"], {
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
