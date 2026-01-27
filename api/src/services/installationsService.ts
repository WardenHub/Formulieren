import { sqlQuery } from "../db";
import {
  getInstallationSql,
  getCustomValuesSql,
  getCatalogSectionsSql,
  getCatalogExternalFieldsSql,
  getCatalogCustomFieldsSql,
  getCatalogDocumentTypesSql,
  upsertCustomValuesSql,
} from "../db/queries/installations.sql";

export async function getInstallationByCode(code: string) {
  const rows = await sqlQuery(getInstallationSql, { code });
  if (!rows.length) return { error: "not found" };
  return { installation: rows[0] };
}

export async function getCatalog() {
  const [sections, externalFields, customFields, documentTypes] = await Promise.all([
    sqlQuery(getCatalogSectionsSql),
    sqlQuery(getCatalogExternalFieldsSql),
    sqlQuery(getCatalogCustomFieldsSql),
    sqlQuery(getCatalogDocumentTypesSql),
  ]);

  const fields = [...externalFields, ...customFields];

  return { sections, fields, documentTypes };
}

export async function getCustomValues(code: string) {
  const values = await sqlQuery(getCustomValuesSql, { code });
  return { values };
}

export async function upsertCustomValues(code: string, values: any[], user: any) {
  if (!Array.isArray(values)) {
    return { ok: false, error: "values must be an array" };
  }

  const cleaned = values
    .filter((v) => v && typeof v.field_key === "string" && v.field_key.trim().length)
    .map((v) => ({
      field_key: v.field_key,
      value_string: v.value_string ?? null,
      value_number: v.value_number ?? null,
      value_bool: v.value_bool ?? null,
      value_date: v.value_date ?? null,
      value_json: v.value_json ?? null,
    }));

  const valuesJson = JSON.stringify(cleaned);

  const updatedBy = user?.name || user?.objectId || "unknown";

  const result = await sqlQuery(upsertCustomValuesSql, {
    code,
    valuesJson,
    updatedBy,
  });

  return { ok: true, result };
}

