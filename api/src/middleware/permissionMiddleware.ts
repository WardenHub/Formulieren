import type { NextFunction, Request, Response } from "express";
import { sqlQuery } from "../db/index.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const permissionCache = new Map<string, { expiresAt: number; permissions: string[] }>();

export async function getPermissionsForRoles(roles: string[]) {
  const normalized = [...new Set((roles || []).map((role) => String(role || "").trim()).filter(Boolean))].sort();
  if (!normalized.length) return [];
  const cacheKey = normalized.join("|");
  const cached = permissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.permissions;

  const rows = await sqlQuery<{ permission_code: string }>(`
    select distinct rp.permission_code
    from dbo.ApplicationRolePermission rp
    join dbo.ApplicationPermissionDefinition p
      on p.permission_code = rp.permission_code
     and p.is_active = 1
    where rp.application_role in (select [value] from openjson(@rolesJson));
  `, { rolesJson: JSON.stringify(normalized) });
  const permissions = (rows || []).map((row) => String(row.permission_code));
  permissionCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, permissions });
  return permissions;
}

export function requirePermission(permission: string) {
  return async (req: Request & { roles?: string[] }, res: Response, next: NextFunction) => {
    try {
      const permissions = await getPermissionsForRoles(req.roles || []);
      if (!permissions.includes(permission)) {
        return res.status(403).json({ error: "forbidden", required_permission: permission });
      }
      (req as any).permissions = permissions;
      return next();
    } catch (error) {
      console.error("permission resolution failed", error);
      return res.status(503).json({ error: "permission resolution unavailable" });
    }
  };
}
