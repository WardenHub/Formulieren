// api/src/services/installationsService.ts

import { sqlQuery, sqlQueryRaw } from "../db/index.js";
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

import {
  getNen2535CatalogSql,
  getInstallationPerformanceRequirementSql,
  upsertInstallationPerformanceRequirementSql,
  getNen2535MatrixForNormSql,
} from "../db/queries/nen2535.sql.js";

function roundNen(value: number) {
  if (value <= 1) return Math.ceil(value);
  return Math.round(value);
}

function calcMaxAllowed(normering_key: string, countsByRisk: Record<string, number>, mode: "internal" | "external") {
  const A = countsByRisk["A"] ?? 0;
  const B = countsByRisk["B"] ?? 0;
  const C = countsByRisk["C"] ?? 0;
  const D = countsByRisk["D"] ?? 0;
  const E = countsByRisk["E"] ?? 0;

  let between = 0;

  if (mode === "external") {
    between = ((A / 100) * 0.5) + ((B / 100) * 1) + ((C / 100) * 1.5);
    return roundNen(between);
  }

  if (normering_key === "NEN2535_2009_PLUS") {
    between =
      ((A / 100) * 0.5) +
      ((B / 100) * 1) +
      ((C / 100) * 1.5) +
      ((D / 100) * 2) +
      ((E / 100) * 3);
    return roundNen(between);
  }

  if (normering_key === "NEN2535_1996_2008") {
    between = ((A / 100) * 1) + ((B / 100) * 2) + ((C / 100) * 3);
    return roundNen(between);
  }

  return null;
}

function weightedDetectorCount(row: any) {
  const a = Number(row.automatic_detectors ?? 0);
  const h = Number(row.manual_call_points ?? 0);
  const v = Number(row.flame_detectors ?? 0);
  const l = Number(row.linear_smoke_detectors ?? 0);
  const asp = Number(row.aspirating_openings ?? 0);
  return a + h + (v * 5) + (l * 10) + asp;
}

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

export async function getNen2535Catalog() {
const rs: any = await sqlQueryRaw(getNen2535CatalogSql);
const recordsets = Array.isArray(rs?.recordsets) ? rs.recordsets : [];
const normeringen = Array.isArray(recordsets[0]) ? recordsets[0] : [];
const functies = Array.isArray(recordsets[1]) ? recordsets[1] : [];
const matrix = Array.isArray(recordsets[2]) ? recordsets[2] : [];
return { normeringen, functies, matrix };

}

export async function upsertInstallationPerformanceRequirements(code: string, payload: any, user: any) {
  const normering_key = String(payload?.normering_key || "").trim();
  const doormelding_mode = String(payload?.doormelding_mode || "").trim(); // header default/fallback
  const remarks = payload?.remarks ?? null;
  const rows = payload?.rows;

  if (!normering_key) return { ok: false, error: "normering_key is verplicht" };
  if (!["NEN2535_2009_PLUS", "NEN2535_1996_2008"].includes(normering_key)) {
    return { ok: false, error: "normering_key is ongeldig" };
  }

  if (!["GEEN", "ZONDER_VERTRAGING", "MET_VERTRAGING"].includes(doormelding_mode)) {
    return { ok: false, error: "doormelding_mode is ongeldig" };
  }

  if (!Array.isArray(rows)) return { ok: false, error: "rows must be an array" };

  const normalizeMode = (v: any) => {
    const s = String(v || "").trim();
    if (s === "MET_VERTRAGING") return "MET_VERTRAGING";
    if (s === "ZONDER_VERTRAGING") return "ZONDER_VERTRAGING";
    return "GEEN";
  };

  const matrixRows = await sqlQuery(getNen2535MatrixForNormSql, { normering_key });
  const allowedFunKeys = new Set((matrixRows as any[]).map((m) => String(m.gebruikersfunctie_key)));

  const toInt = (v: any, idx: number) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n) || n < 0) throw new Error(`row ${idx + 1}: aantallen moeten >= 0 zijn`);
    return Math.trunc(n);
  };

  const cleaned = rows.map((r: any, idx: number) => {
    const gebruikersfunctie_key = String(r?.gebruikersfunctie_key || "").trim();
    if (!gebruikersfunctie_key) throw new Error(`row ${idx + 1}: gebruikersfunctie_key ontbreekt`);
    if (!allowedFunKeys.has(gebruikersfunctie_key)) {
      throw new Error(`row ${idx + 1}: gebruikersfunctie_key niet toegestaan voor normering`);
    }

    const row_label = r?.row_label == null ? null : String(r.row_label).trim();
    const rowMode = normalizeMode(r?.doormelding_mode ?? doormelding_mode);

    return {
      // natuurlijke sleutel: (performance_requirement_id, gebruikersfunctie_key, row_label, doormelding_mode)
      gebruikersfunctie_key,
      row_label: row_label && row_label.length ? row_label : null,
      doormelding_mode: rowMode,

      automatic_detectors: toInt(r.automatic_detectors, idx),
      manual_call_points: toInt(r.manual_call_points, idx),
      flame_detectors: toInt(r.flame_detectors, idx),
      linear_smoke_detectors: toInt(r.linear_smoke_detectors, idx),
      aspirating_openings: toInt(r.aspirating_openings, idx),

      sort_order: Number.isFinite(Number(r.sort_order)) ? Math.trunc(Number(r.sort_order)) : idx + 1,
    };
  });

  const updatedBy = user?.name || user?.objectId || "unknown";
  const rowsJson = JSON.stringify(cleaned);

  const result = await sqlQuery(upsertInstallationPerformanceRequirementSql, {
    code,
    normering_key,
    doormelding_mode, // header: blijft bestaan als default/overzicht
    remarks,
    updatedBy,
    rowsJson,
  });

  const readback = await getInstallationPerformanceRequirements(code);

  return { ok: true, result, readback };
}

export async function getInstallationPerformanceRequirements(code: string) {
  const rs: any = await sqlQueryRaw(getInstallationPerformanceRequirementSql, { code });

  const header = rs?.recordsets?.[0]?.[0] ?? null;
  const rows = rs?.recordsets?.[1] ?? [];

  if (!header) {
    return { code, performanceRequirement: null, rows: [], calculated: null };
  }

  const normKey = String(header.normering_key || "").trim();

  const matrixRows = await sqlQuery(getNen2535MatrixForNormSql, { normering_key: normKey });
  const matrixByKey = new Map<string, any>();
  for (const m of matrixRows as any[]) matrixByKey.set(String(m.gebruikersfunctie_key), m);

  type Mode = "GEEN" | "ZONDER_VERTRAGING" | "MET_VERTRAGING";

  const emptyRisk = () => ({ A: 0, B: 0, C: 0, D: 0, E: 0 });

  const byMode: Record<
    Mode,
    { internal: Record<string, number>; external: Record<string, number> }
  > = {
    GEEN: { internal: emptyRisk(), external: emptyRisk() },
    ZONDER_VERTRAGING: { internal: emptyRisk(), external: emptyRisk() },
    MET_VERTRAGING: { internal: emptyRisk(), external: emptyRisk() },
  };

  const normalizeMode = (v: any): Mode => {
    const s = String(v || "").trim();
    if (s === "MET_VERTRAGING") return "MET_VERTRAGING";
    if (s === "ZONDER_VERTRAGING") return "ZONDER_VERTRAGING";
    return "GEEN";
  };

  const enrichedRows = (rows as any[]).map((r) => {
    const m = matrixByKey.get(String(r.gebruikersfunctie_key)) || null;
    const w = weightedDetectorCount(r);

    const mode: Mode = normalizeMode(r.doormelding_mode);

    const ri = m?.risk_internal ?? null;
    const re = m?.risk_external ?? null;

    // extern telt altijd mee (alle modes)
    if (re && byMode[mode].external[re] !== undefined) byMode[mode].external[re] += w;

    // intern telt alléén mee bij MET_VERTRAGING
    if (mode === "MET_VERTRAGING") {
      if (ri && byMode[mode].internal[ri] !== undefined) byMode[mode].internal[ri] += w;
    }

    return {
      ...r,
      doormelding_mode: mode,
      matrix_name: m?.matrix_name ?? null,
      risk_internal: ri,
      risk_external: re,
      weighted_count: w,
      // handig voor UI: of intern relevant is voor deze regel
      intern_enabled: mode === "MET_VERTRAGING",
    };
  });

  const calcForMode = (mode: Mode) => {
    const maxExtern = calcMaxAllowed(normKey, byMode[mode].external, "external");

    // intern alleen bij MET_VERTRAGING
    const maxIntern = mode === "MET_VERTRAGING"
      ? calcMaxAllowed(normKey, byMode[mode].internal, "internal")
      : null;

    return {
      riskTotals: {
        internal: mode === "MET_VERTRAGING" ? byMode[mode].internal : null,
        external: byMode[mode].external,
      },
      maxAllowed: {
        internal: maxIntern,
        external: maxExtern,
      },
    };
  };

  return {
    code,
    performanceRequirement: header,
    rows: enrichedRows,
    calculated: {
      byMode: {
        GEEN: calcForMode("GEEN"),
        ZONDER_VERTRAGING: calcForMode("ZONDER_VERTRAGING"),
        MET_VERTRAGING: calcForMode("MET_VERTRAGING"),
      },
    },
  };
}
