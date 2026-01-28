// api/src/services/installationsService.ts

import { sqlQuery } from "../db";
import {
  getInstallationSql,
  getCustomValuesSql,
  getCatalogSectionsSql,
  getCatalogExternalFieldsSql,
  getCatalogCustomFieldsSql,
  getCatalogDocumentTypesSql,
  upsertCustomValuesSql,
  getInstallationDocumentsSql, 
  upsertInstallationDocumentsSql,
  searchInstallationsSql
} from "../db/queries/installations.sql";

import {
  getInstallationTypesSql,
  setInstallationTypeSql,
} from "../db/queries/installationTypes.sql";

export async function getInstallationByCode(code: string) {
  const rows = await sqlQuery(getInstallationSql, { code });
  if (!rows.length) return { error: "not found" };
  return { installation: rows[0] };
}

export async function getCatalog(code: string) {
  // haal type op (kan null zijn)
  const instRows = await sqlQuery(
    `select top 1 installation_type_key
     from dbo.Installation
     where atrium_installation_code = @code`,
    { code }
  );

  const installationTypeKey = instRows?.[0]?.installation_type_key ?? null;

  const [sections, externalFields, customFields, documentTypes] = await Promise.all([
    sqlQuery(getCatalogSectionsSql),
    sqlQuery(getCatalogExternalFieldsSql),

    // belangrijk: param altijd meegeven (ook null)
    sqlQuery(getCatalogCustomFieldsSql, { installationTypeKey }),

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

export async function getInstallationDocuments(code: string) {
  const rows = await sqlQuery(getInstallationDocumentsSql, { code });

  const byType = new Map<
    string,
    {
      document_type_key: string;
      document_type_name: string;
      section_key: string | null;
      sort_order: number | null;
      documents: any[];
    }
  >();

  for (const r of rows as any[]) {
    if (!byType.has(r.document_type_key)) {
      byType.set(r.document_type_key, {
        document_type_key: r.document_type_key,
        document_type_name: r.document_type_name,
        section_key: r.section_key ?? null,
        sort_order: r.sort_order ?? null,
        documents: [],
      });
    }

    if (r.document_id) {
      byType.get(r.document_type_key)!.documents.push({
        document_id: r.document_id,
        document_type_key: r.document_type_key,
        document_is_active: r.document_is_active,
        title: r.title,
        document_number: r.document_number,
        document_date: r.document_date,
        revision: r.revision,
        created_at: r.created_at,
        created_by: r.created_by,
      });
    }
  }

  return {
    code,
    documentTypes: Array.from(byType.values()),
  };
}

export async function upsertInstallationDocuments(code: string, documents: any[], user: any) {
  if (!Array.isArray(documents)) {
    return { ok: false, error: "documents must be an array" };
  }

  const cleaned = documents
    .filter((d) => d && typeof d.document_type_key === "string" && d.document_type_key.trim().length)
    .map((d) => ({
      document_id: d.document_id ?? null,
      document_type_key: String(d.document_type_key),

      title: d.title ?? null,
      document_number: d.document_number ?? null,
      document_date: d.document_date ?? null,
      revision: d.revision ?? null,

      file_name: d.file_name ?? null,
      mime_type: d.mime_type ?? null,
      file_size_bytes: d.file_size_bytes ?? null,

      storage_provider: d.storage_provider ?? null,
      storage_key: d.storage_key ?? null,
      storage_url: d.storage_url ?? null,
      checksum_sha256: d.checksum_sha256 ?? null,

      source_system: d.source_system ?? null,
      source_reference: d.source_reference ?? null,

      is_active: d.is_active ?? true,
    }));

  const documentsJson = JSON.stringify(cleaned);
  const updatedBy = user?.name || user?.objectId || "unknown";

  const result = await sqlQuery(upsertInstallationDocumentsSql, {
    code,
    documentsJson,
    updatedBy,
  });

  return { ok: true, result };
}


export async function getInstallationTypes() {
  const rows = await sqlQuery(getInstallationTypesSql);
  return { types: rows };
}

export async function setInstallationType(code: string, installation_type_key: string | null) {
  const key = installation_type_key ? String(installation_type_key) : null;

  const result = await sqlQuery(setInstallationTypeSql, {
    code,
    installation_type_key: key,
  });

  return { ok: true, result: result?.[0] || null };
}

export async function searchInstallations(q: string | null, take = 25) {
  const clean = q ? String(q).trim() : "";

  if (!clean) {
    return { items: [] };
  }

  const rows = await sqlQuery(searchInstallationsSql, {
    take,
    q: clean,
    qLike: `%${clean}%`,
    qPrefix: `${clean}%`,
  });

  return { items: rows };
}

