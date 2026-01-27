process.env.DOTENV_CONFIG_QUIET = "true";
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// force load /api/.env regardless of cwd
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
