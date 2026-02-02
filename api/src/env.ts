// /api/src/env.ts
process.env.DOTENV_CONFIG_QUIET = "true";

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// load /api/.env when present (local/dev). in azure, app settings provide env vars.
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

