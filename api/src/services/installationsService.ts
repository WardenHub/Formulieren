// api/src/services/installationsService.ts

import { sqlQuery } from "../db/index.js";
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
} from "../db/queries/installations.sql.js";

import {
  ensureInstallationSql,
  getInstallationTypesSql,
  setInstallationTypeSql,
} from "../db/queries/installationTypes.sql.js";

import {
  getEnergySupplyBrandTypesSql,
  upsertEnergySupplyBrandTypesSql,
} from "../db/queries/energySupplyBrandTypes.sql.js";

import {
  getInstallationEnergySuppliesSql,
  upsertInstallationEnergySuppliesSql,
  deleteInstallationEnergySupplySql,
} from "../db/queries/energySupplies.sql.js";

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

export async function setInstallationType(
  code: string,
  installation_type_key: string | null,
  updatedBy: string
) {
  const cleanCode = String(code || "").trim();
  const key = installation_type_key ? String(installation_type_key) : null;
  const who = updatedBy || "unknown";

  // 1) ensure ember row exists (or throw if code not in Atrium sync)
  await sqlQuery(ensureInstallationSql, {
    code: cleanCode,
    createdBy: who,
  });

  // 2) set type
  const rows = await sqlQuery(setInstallationTypeSql, {
    code: cleanCode,
    installation_type_key: key,
  });

  return {
    ok: true,
    result: rows?.[0] ?? { atrium_installation_code: cleanCode, installation_type_key: key },
  };
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

export async function getEnergySupplyBrandTypes() {
  const rows = await sqlQuery(getEnergySupplyBrandTypesSql);
  return { types: rows };
}

export async function upsertEnergySupplyBrandTypes(types: any[], user: any) {
  if (!Array.isArray(types)) {
    return { ok: false, error: "types must be an array" };
  }

  const cleaned = types
    .filter((t) => t && typeof t.brand_type_key === "string" && t.brand_type_key.trim().length)
    .map((t) => ({
      brand_type_key: String(t.brand_type_key).trim(),
      display_name: String(t.display_name ?? t.brand_type_key).trim(),
      default_capacity_ah: t.default_capacity_ah ?? null,
      sort_order: t.sort_order ?? null,
      is_active: t.is_active ?? true,
    }));

  const typesJson = JSON.stringify(cleaned);
  const updatedBy = user?.name || user?.objectId || "unknown";

  const result = await sqlQuery(upsertEnergySupplyBrandTypesSql, {
    typesJson,
    updatedBy,
  });

  return { ok: true, result };
}

export async function getInstallationEnergySupplies(code: string) {
  const rows = await sqlQuery(getInstallationEnergySuppliesSql, { code });
  return { items: rows };
}

export async function upsertInstallationEnergySupplies(code: string, items: any[], user: any) {
  if (!Array.isArray(items)) {
    return { ok: false, error: "items must be an array" };
  }

  const cleaned = items.map((x) => ({
    energy_supply_id: x.energy_supply_id ?? null,

    sort_order: x.sort_order ?? null,
    kind: x.kind ?? "battery_set",

    location_label: x.location_label ?? null,

    brand_type_key: x.brand_type_key ?? null,
    brand_type_manual: x.brand_type_manual ?? null,

    quantity: x.quantity ?? 1,
    configuration: x.configuration ?? "single",

    capacity_ah: x.capacity_ah ?? null,

    battery_date: x.battery_date ?? null,

    remarks: x.remarks ?? null,

    is_active: x.is_active ?? true,
  }));

  for (const it of cleaned) {
    const hasKey = it.brand_type_key && String(it.brand_type_key).trim().length > 0;
    const hasManual = it.brand_type_manual && String(it.brand_type_manual).trim().length > 0;

    if (hasKey && hasManual) {
      return { ok: false, error: "kies óf merk/type óf handmatig; niet allebei" };
    }
  }

  for (const it of cleaned) {
    if (it.quantity !== null && it.quantity !== undefined) {
      const q = Number(it.quantity);
      if (!Number.isFinite(q) || q < 1) return { ok: false, error: "quantity must be >= 1" };
      it.quantity = Math.trunc(q);
    } else {
      it.quantity = 1;
    }

    const cfg = String(it.configuration || "").toLowerCase();
    if (!["single", "series", "parallel", "unknown"].includes(cfg)) {
      return { ok: false, error: "configuration must be single; series; parallel; unknown" };
    }
    it.configuration = cfg;

    // plaatsingdatum is verplicht en moet YYYY-MM-DD blijven (geen normalisatie)
    const ds = it.battery_date ? String(it.battery_date).trim() : "";
    if (!ds) return { ok: false, error: "plaatsingdatum is verplicht" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return { ok: false, error: "plaatsingdatum is ongeldig" };
    it.battery_date = ds;
  }

  const itemsJson = JSON.stringify(cleaned);
  const updatedBy = user?.name || user?.objectId || "unknown";

  const result = await sqlQuery(upsertInstallationEnergySuppliesSql, {
    code,
    itemsJson,
    updatedBy,
  });

  return { ok: true, result };
}


export async function deleteInstallationEnergySupply(code: string, energy_supply_id: string, user: any) {
  const updatedBy = user?.name || user?.objectId || "unknown";

  const result = await sqlQuery(deleteInstallationEnergySupplySql, {
    code,
    energy_supply_id,
    updatedBy,
  });

  return { ok: true, result };
}
