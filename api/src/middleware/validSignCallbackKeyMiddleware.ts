import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// ValidSign stuurt de bij hem ingestelde callback-key mee als "Authorization: Basic <key>".
// Dat is geen echte basic-auth; de waarde wordt letterlijk doorgegeven. Niet elke build
// zet er "Basic" voor, dus we accepteren de kale waarde ook; welk voorvoegsel er staat
// zegt niets over of de sleutel klopt.
function providedKeys(req: Request) {
  const header = req.header("authorization");
  const raw = Array.isArray(header) ? String(header[0] || "") : String(header || "");
  const value = raw.trim();
  if (!value) return [];

  const match = value.match(/^Basic\s+(.+)$/i);
  return match ? [match[1].trim()] : [value];
}

// Een gewone stringvergelijking stopt bij het eerste verschil en verraadt daarmee hoeveel
// tekens al kloppen. Eerst hashen maakt beide kanten even lang, zodat timingSafeEqual ook
// werkt wanneer de lengtes verschillen.
function keysMatch(provided: string, configured: string) {
  const providedHash = crypto.createHash("sha256").update(provided, "utf8").digest();
  const configuredHash = crypto.createHash("sha256").update(configured, "utf8").digest();

  return crypto.timingSafeEqual(providedHash, configuredHash);
}

export function requireValidSignCallbackKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = String(process.env.VALIDSIGN_CALLBACK_KEY || "").trim();

  // Zonder ingestelde sleutel staat de route open voor iedereen die het adres raadt.
  // Dan weigeren we liever alles dan dat we een onbekende afzender vertrouwen.
  if (!configuredKey) {
    return res.status(500).json({ error: "validsign callback key not configured" });
  }

  const kandidaten = providedKeys(req);

  if (!kandidaten.some((kandidaat) => keysMatch(kandidaat, configuredKey))) {
    return res.status(401).json({ error: "invalid callback key" });
  }

  return next();
}
