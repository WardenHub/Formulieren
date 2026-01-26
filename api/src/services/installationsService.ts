import { sqlQuery } from "../db";
import {
  getInstallationSql,
  getCatalogSectionsSql,
  getCatalogFieldsSql,
  getCatalogDocumentTypesSql,
  getCustomValuesSql,
  upsertCustomValuesSql,
} from "../db/queries/installations.sql";

export async function getInstallationByCode(code: string) {
  const rows = await sqlQuery(getInstallationSql, { code });
  if (!rows.length) return { error: "not found" };
  return { installation: rows[0] };
}

export async function getCatalog() {
  const [sections, fields, documentTypes] = await Promise.all([
    sqlQuery(getCatalogSectionsSql),
    sqlQuery(getCatalogFieldsSql),
    sqlQuery(getCatalogDocumentTypesSql),
  ]);

  return { sections, fields, documentTypes };
}

export async function getCustomValues(code: string) {
  const values = await sqlQuery(getCustomValuesSql, { code });
  return { values };
}

function normalizeValueRow(v: any) {
  // ensure only provided typed columns are present; leave others null
  return {
    field_key: v.field_key,
    value_string: v.value_string ?? null,
    value_number: v.value_number ?? null,
    value_bool: v.value_bool ?? null,
    value_date: v.value_date ?? null,
    value_datetime: v.value_datetime ?? null,
    value_json: v.value_json ?? null,
  };
}

export async function upsertCustomValues(code: string, values: any[], user: any) {
  if (!Array.isArray(values)) {
    return { ok: false, error: "values must be an array" };
  }

  const cleaned = values
    .filter((v) => v && typeof v.field_key === "string" && v.field_key.trim().length)
    .map(normalizeValueRow);

  const valuesJson = JSON.stringify(cleaned);

  const result = await sqlQuery(upsertCustomValuesSql, {
    code,
    valuesJson,
  });

  return { ok: true, result };
}
