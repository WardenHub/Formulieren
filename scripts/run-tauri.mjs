import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const workspaceRoot = process.cwd();
const tauriCliPath = path.join(
  workspaceRoot,
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js",
);

const env = { ...process.env };
const userProfile = env.USERPROFILE ?? env.HOME ?? "";
const cargoBinPath = userProfile ? path.join(userProfile, ".cargo", "bin") : "";
const localAppData = env.LOCALAPPDATA ?? "";

if (cargoBinPath && existsSync(path.join(cargoBinPath, "cargo.exe"))) {
  const currentPath = env.PATH ?? "";
  const pathParts = currentPath.split(path.delimiter).filter(Boolean);
  if (!pathParts.some((entry) => entry.toLowerCase() === cargoBinPath.toLowerCase())) {
    env.PATH = [cargoBinPath, ...pathParts].join(path.delimiter);
  }
}

if (!env.CARGO_TARGET_DIR && localAppData) {
  const cargoTargetDir = path.join(localAppData, "EmberOffline", "cargo-target");
  mkdirSync(cargoTargetDir, { recursive: true });
  env.CARGO_TARGET_DIR = cargoTargetDir;
}

const child = spawn(process.execPath, [tauriCliPath, ...process.argv.slice(2)], {
  cwd: workspaceRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
