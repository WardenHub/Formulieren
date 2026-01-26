export function requireRole(...allowed: string[]) {
  return (req: any, res: any, next: any) => {
    const roles = req.roles || [];
    const ok = allowed.some((r) => roles.includes(r));
    if (!ok) return res.status(403).json({ error: "forbidden", required: allowed });
    next();
  };
}
