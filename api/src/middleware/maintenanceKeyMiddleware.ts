import type { Request, Response, NextFunction } from "express";

function normalizeHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export function requireMaintenanceKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = String(process.env.MAINTENANCE_API_KEY || "").trim();

  if (!configuredKey) {
    return res.status(500).json({
      error: "maintenance api key not configured",
    });
  }

  const providedKey = normalizeHeaderValue(req.header("x-ember-maintenance-key"));

  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({
      error: "invalid maintenance key",
    });
  }

  return next();
}
