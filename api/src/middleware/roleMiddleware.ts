// src/middleware/roleMiddleware.ts

export function requireRole(...allowed: string[]) {
  return (req: any, res: any, next: any) => {
    const roles = req.roles || [];
    const ok = allowed.some((r) => roles.includes(r));
    if (ok) return next();

    /* Onbekende rollen zijn geen ontbrekende rollen. Kon de groepslookup niet worden
       uitgevoerd, dan is dit een tijdelijke storing; 403 zou de gebruiker vertellen dat hij
       geen rechten heeft en dat is onwaar. 503 met Retry-After zegt wat er echt aan de hand
       is en laat de frontend het netjes opnieuw proberen. */
    if (req.rolesUnavailable) {
      res.setHeader("Retry-After", "5");
      return res.status(503).json({
        error: "roles_unavailable",
        message:
          "Je rollen zijn nu niet op te halen; Ember is nog aan het opstarten. " +
          "Dit lost zichzelf op zodra de dienst warm is.",
      });
    }

    return res.status(403).json({ error: "forbidden", required: allowed });
  };
}
