import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

function normalizeHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

// Een gewone stringvergelijking stopt bij het eerste verschil en verraadt daarmee hoeveel
// tekens al kloppen. Eerst hashen maakt beide kanten even lang, zodat timingSafeEqual ook
// werkt wanneer de lengtes verschillen.
function keysMatch(provided: string, configured: string) {
  const providedHash = crypto.createHash("sha256").update(provided, "utf8").digest();
  const configuredHash = crypto.createHash("sha256").update(configured, "utf8").digest();

  return crypto.timingSafeEqual(providedHash, configuredHash);
}

export function requireMaintenanceKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = String(process.env.MAINTENANCE_API_KEY || "").trim();

  if (!configuredKey) {
    return res.status(500).json({
      error: "maintenance api key not configured",
    });
  }

  const providedKey = normalizeHeaderValue(req.header("x-ember-maintenance-key"));

  if (!providedKey || !keysMatch(providedKey, configuredKey)) {
    return res.status(401).json({
      error: "invalid maintenance key",
    });
  }

  return next();
}
