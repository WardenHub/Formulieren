//api/src/services/adminInstallationsService.ts
import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import {
  getAdminInstallationsCatalogSql,
  saveAdminInstallationTypesSql,
  saveAdminInstallationSectionsSql,
  saveAdminInstallationFieldsSql,
  saveAdminInstallationDocumentsSql,
  saveAdminInstallationExternalFieldsSql,
  saveAdminInstallationManagementPortalsSql,
  initializeInstallationTypesSql,
} from "../db/queries/adminInstallations.sql.js";

function getUserDisplayName(user: any) {
  return user?.name || user?.upn || user?.objectId || "unknown";
}

function normalizeNullableString(value: any) {
  if (value == null) return null;
  const txt = String(value).trim();
  return txt.length ? txt : null;
}

function normalizeNullableNumber(value: any) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizeBool(value: any, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return fallback;
}

function uniqueStrings(values: any[]) {
  return [...new Set((Array.isArray(values) ? values : []).map((x) => String(x || "").trim()).filter(Boolean))];
}

export async function getAdminInstallationsCatalog() {
  const result: any = await sqlQueryRaw(getAdminInstallationsCatalogSql);
  const recordsets = Array.isArray(result?.recordsets) ? result.recordsets : [];

  const installationTypes = Array.isArray(recordsets[0]) ? recordsets[0] : [];
  const installationTypeAtriumMappings = Array.isArray(recordsets[1]) ? recordsets[1] : [];
  const installationTypeInitializationAudits = Array.isArray(recordsets[2]) ? recordsets[2] : [];
  const installationTypeInitializationAuditDetails = Array.isArray(recordsets[3]) ? recordsets[3] : [];
  const sections = Array.isArray(recordsets[4]) ? recordsets[4] : [];
  const customFields = Array.isArray(recordsets[5]) ? recordsets[5] : [];
  const customFieldOptions = Array.isArray(recordsets[6]) ? recordsets[6] : [];
  const customFieldTypeLinks = Array.isArray(recordsets[7]) ? recordsets[7] : [];
  const documentTypes = Array.isArray(recordsets[8]) ? recordsets[8] : [];
  const documentTypeLinks = Array.isArray(recordsets[9]) ? recordsets[9] : [];
  const documentTypeRequirements = Array.isArray(recordsets[10]) ? recordsets[10] : [];
  const externalFields = Array.isArray(recordsets[11]) ? recordsets[11] : [];
  const externalFieldTypeLinks = Array.isArray(recordsets[12]) ? recordsets[12] : [];
  const documentTypeAttachmentParents = Array.isArray(recordsets[13]) ? recordsets[13] : [];
  const managementPortals = Array.isArray(recordsets[14]) ? recordsets[14] : [];
  const managementPortalTypeLinks = Array.isArray(recordsets[15]) ? recordsets[15] : [];

  return {
    installationTypes: installationTypes.map((r: any) => ({
      installation_type_key: r.installation_type_key,
      display_name: r.display_name,
      sort_order: r.sort_order == null ? null : Number(r.sort_order),
      is_active: r.is_active === false ? false : true,
    })),
    installationTypeAtriumMappings: installationTypeAtriumMappings.map((r: any) => ({
      mapping_id: r.mapping_id,
      installation_type_key: r.installation_type_key,
      atrium_installation_type_code: r.atrium_installation_type_code ?? "",
      atrium_installation_type_description: r.atrium_installation_type_description ?? null,
      is_active: r.is_active === false ? false : true,
      created_at: r.created_at ?? null,
      created_by: r.created_by ?? null,
      updated_at: r.updated_at ?? null,
      updated_by: r.updated_by ?? null,
    })),
    installationTypeInitializationAudits: installationTypeInitializationAudits.map((r: any) => ({
      run_id: r.run_id,
      trigger_source: r.trigger_source ?? null,
      triggered_by: r.triggered_by ?? null,
      status: r.status ?? null,
      started_at: r.started_at ?? null,
      completed_at: r.completed_at ?? null,
      inspected_count: Number(r.inspected_count ?? 0),
      updated_total: Number(r.updated_total ?? 0),
      updated_existing_count: Number(r.updated_existing_count ?? 0),
      inserted_overlay_count: Number(r.inserted_overlay_count ?? 0),
      skipped_already_typed_count: Number(r.skipped_already_typed_count ?? 0),
      skipped_historical_count: Number(r.skipped_historical_count ?? 0),
      skipped_not_current_count: Number(r.skipped_not_current_count ?? 0),
      unknown_no_mapping_count: Number(r.unknown_no_mapping_count ?? 0),
      mapping_target_missing_count: Number(r.mapping_target_missing_count ?? 0),
      error_message: r.error_message ?? null,
    })),
    installationTypeInitializationAuditDetails: installationTypeInitializationAuditDetails.map((r: any) => ({
      run_id: r.run_id,
      detail_kind: r.detail_kind ?? null,
      reason: r.reason ?? null,
      action_type: r.action_type ?? null,
      atrium_installation_type_code: r.atrium_installation_type_code ?? null,
      atrium_installation_type_description: r.atrium_installation_type_description ?? null,
      installation_type_key: r.installation_type_key ?? null,
      item_count: Number(r.item_count ?? 0),
    })),
    sections: sections.map((r: any) => ({
      section_key: r.section_key,
      section_name: r.section_name,
      section_description: r.section_description ?? null,
      sort_order: r.sort_order == null ? null : Number(r.sort_order),
    })),
    customFields: customFields.map((r: any) => ({
      field_key: r.field_key,
      display_name: r.display_name ?? "",
      data_type: r.data_type ?? "string",
      section_key: r.section_key ?? null,
      sort_order: r.sort_order == null ? null : Number(r.sort_order),
      is_active: r.is_active === false ? false : true,
    })),
    customFieldOptions: customFieldOptions.map((r: any) => ({
      field_key: r.field_key,
      option_value: r.option_value,
      option_label: r.option_label,
      sort_order: r.sort_order == null ? null : Number(r.sort_order),
      is_active: r.is_active === false ? false : true,
    })),
    customFieldTypeLinks: customFieldTypeLinks.map((r: any) => ({
      field_key: r.field_key,
      installation_type_key: r.installation_type_key,
    })),
    documentTypes: documentTypes.map((r: any) => ({
      document_type_key: r.document_type_key,
      document_type_name: r.document_type_name,
      section_key: r.section_key ?? null,
      sort_order: r.sort_order == null ? null : Number(r.sort_order),
      is_attachment_only: r.is_attachment_only === true,
      is_active: r.is_active === false ? false : true,
    })),
    documentTypeLinks: documentTypeLinks.map((r: any) => ({
      document_type_key: r.document_type_key,
      installation_type_key: r.installation_type_key,
    })),
    documentTypeRequirements: documentTypeRequirements.map((r: any) => ({
      document_type_key: r.document_type_key,
      installation_type_key: r.installation_type_key,
      is_required: r.is_required === true,
    })),
    externalFields: externalFields.map((r: any) => ({
      field_key: r.field_key,
      section_key: r.section_key ?? null,
      label: r.label ?? "",
      sort_order: r.sort_order == null ? null : Number(r.sort_order),
      source_type: r.source_type ?? null,
      fabric_table: r.fabric_table ?? null,
      fabric_column: r.fabric_column ?? null,
      notes: r.notes ?? null,
      is_active: r.is_active === false ? false : true,
    })),
    externalFieldTypeLinks: externalFieldTypeLinks.map((r: any) => ({
      field_key: r.field_key,
      installation_type_key: r.installation_type_key,
    })),
    documentTypeAttachmentParents: documentTypeAttachmentParents.map((r: any) => ({
      document_type_key: r.document_type_key,
      parent_document_type_key: r.parent_document_type_key,
    })),
    managementPortals: managementPortals.map((r: any) => ({
      portal_key: r.portal_key,
      display_name: r.display_name ?? "",
      notes: r.notes ?? null,
      installation_url_template: r.installation_url_template ?? null,
      sort_order: r.sort_order == null ? null : Number(r.sort_order),
      is_active: r.is_active === false ? false : true,
      created_at: r.created_at ?? null,
      created_by: r.created_by ?? null,
      updated_at: r.updated_at ?? null,
      updated_by: r.updated_by ?? null,
    })),
    managementPortalTypeLinks: managementPortalTypeLinks.map((r: any) => ({
      portal_key: r.portal_key,
      installation_type_key: r.installation_type_key,
    })),
  };
}

export async function saveAdminInstallationTypes(items: any[], user: any) {
  const normalized = (Array.isArray(items) ? items : []).map((x, index) => ({
    installation_type_key: normalizeNullableString(x?.installation_type_key),
    display_name: normalizeNullableString(x?.display_name),
    sort_order: normalizeNullableNumber(x?.sort_order ?? (index + 1) * 10),
    is_active: normalizeBool(x?.is_active, true),
    atrium_mappings: (Array.isArray(x?.atrium_mappings) ? x.atrium_mappings : []).map((m: any) => ({
      atrium_installation_type_code: normalizeNullableString(m?.atrium_installation_type_code),
      atrium_installation_type_description: normalizeNullableString(m?.atrium_installation_type_description),
      is_active: normalizeBool(m?.is_active, true),
    })),
  }));

  if (normalized.length === 0) {
    return { ok: false, error: "geen geldige installatiesoorten ontvangen" };
  }

  const seenAtriumCodes = new Map<string, string>();

  for (const item of normalized) {
    if (!item.installation_type_key) return { ok: false, error: "installation_type_key is verplicht" };
    if (!item.display_name) return { ok: false, error: "display_name is verplicht" };

    for (const mapping of item.atrium_mappings) {
      if (!mapping.atrium_installation_type_code) {
        return {
          ok: false,
          error: `atrium_installation_type_code is verplicht voor ${item.installation_type_key}`,
        };
      }

      const existingOwner = seenAtriumCodes.get(mapping.atrium_installation_type_code);
      if (existingOwner && existingOwner !== item.installation_type_key) {
        return {
          ok: false,
          error: `Atrium-code ${mapping.atrium_installation_type_code} is dubbel gekoppeld aan ${existingOwner} en ${item.installation_type_key}`,
        };
      }

      seenAtriumCodes.set(mapping.atrium_installation_type_code, item.installation_type_key);
    }
  }

  await sqlQuery(saveAdminInstallationTypesSql, {
    itemsJson: JSON.stringify(normalized),
    updatedBy: getUserDisplayName(user),
  });

  return await getAdminInstallationsCatalog();
}

export async function saveAdminInstallationSections(items: any[], user: any) {
  const normalized = (Array.isArray(items) ? items : []).map((x, index) => ({
    section_key: normalizeNullableString(x?.section_key),
    section_name: normalizeNullableString(x?.section_name),
    section_description: normalizeNullableString(x?.section_description),
    sort_order: normalizeNullableNumber(x?.sort_order ?? (index + 1) * 10),
  }));

  if (normalized.length === 0) {
    return { ok: false, error: "geen geldige secties ontvangen" };
  }

  for (const item of normalized) {
    if (!item.section_key) return { ok: false, error: "section_key is verplicht" };
    if (!item.section_name) return { ok: false, error: "section_name is verplicht" };
  }

  await sqlQuery(saveAdminInstallationSectionsSql, {
    itemsJson: JSON.stringify(normalized),
    updatedBy: getUserDisplayName(user),
  });

  return await getAdminInstallationsCatalog();
}

export async function saveAdminInstallationFields(items: any[], user: any) {
  const normalized = (Array.isArray(items) ? items : []).map((x, index) => ({
    field_key: normalizeNullableString(x?.field_key),
    display_name: normalizeNullableString(x?.display_name),
    data_type: normalizeNullableString(x?.data_type) || "string",
    section_key: normalizeNullableString(x?.section_key),
    sort_order: normalizeNullableNumber(x?.sort_order ?? (index + 1) * 10),
    is_active: normalizeBool(x?.is_active, true),
    options: (Array.isArray(x?.options) ? x.options : []).map((o: any, optionIndex: number) => ({
      option_value: normalizeNullableString(o?.option_value),
      option_label: normalizeNullableString(o?.option_label),
      sort_order: normalizeNullableNumber(o?.sort_order ?? (optionIndex + 1) * 10),
      is_active: normalizeBool(o?.is_active, true),
    })),
    applicability_type_keys: uniqueStrings(x?.applicability_type_keys),
  }));

  if (normalized.length === 0) {
    return { ok: false, error: "geen geldige eigenschappen ontvangen" };
  }

  for (const item of normalized) {
    if (!item.field_key) return { ok: false, error: "field_key is verplicht" };
    if (!item.display_name) return { ok: false, error: "display_name is verplicht" };
    if (!["string", "number", "bool", "date", "json"].includes(item.data_type)) {
      return { ok: false, error: `ongeldig data_type voor ${item.field_key}` };
    }

    for (const option of item.options) {
      if (!option.option_value) return { ok: false, error: `option_value ontbreekt bij ${item.field_key}` };
      if (!option.option_label) return { ok: false, error: `option_label ontbreekt bij ${item.field_key}` };
    }
  }

  await sqlQuery(saveAdminInstallationFieldsSql, {
    itemsJson: JSON.stringify(normalized),
    updatedBy: getUserDisplayName(user),
  });

  return await getAdminInstallationsCatalog();
}

export async function saveAdminInstallationDocuments(items: any[], user: any) {
  const normalized = (Array.isArray(items) ? items : []).map((x, index) => ({
    document_type_key: normalizeNullableString(x?.document_type_key),
    document_type_name: normalizeNullableString(x?.document_type_name),
    section_key: normalizeNullableString(x?.section_key),
    sort_order: normalizeNullableNumber(x?.sort_order ?? (index + 1) * 10),
    is_attachment_only: normalizeBool(x?.is_attachment_only, false),
    is_active: normalizeBool(x?.is_active, true),
    applicability_type_keys: uniqueStrings(x?.applicability_type_keys),
    desired_type_keys: uniqueStrings(x?.desired_type_keys ?? x?.required_type_keys),
    attachment_parent_type_keys: uniqueStrings(x?.attachment_parent_type_keys),
  }));

  if (normalized.length === 0) {
    return { ok: false, error: "geen geldige documenttypes ontvangen" };
  }

  for (const item of normalized) {
    if (!item.document_type_key) return { ok: false, error: "document_type_key is verplicht" };
    if (!item.document_type_name) return { ok: false, error: "document_type_name is verplicht" };

    if (item.is_attachment_only && item.desired_type_keys.length > 0) {
      return {
        ok: false,
        error: `attachment-only documenttype ${item.document_type_key} mag niet als los verplicht documenttype worden ingesteld`,
      };
    }

    if (!item.is_attachment_only && item.attachment_parent_type_keys.length > 0) {
      return {
        ok: false,
        error: `attachment_parent_type_keys is alleen toegestaan voor attachment-only documenttypes; ${item.document_type_key}`,
      };
    }

    if (item.is_attachment_only && item.attachment_parent_type_keys.length === 0) {
      return {
        ok: false,
        error: `attachment-only documenttype ${item.document_type_key} moet minimaal een parent documenttype hebben`,
      };
    }

    const applicabilitySet = new Set(item.applicability_type_keys);
    for (const typeKey of item.desired_type_keys) {
      if (applicabilitySet.size > 0 && !applicabilitySet.has(typeKey)) {
        return {
          ok: false,
          error: `desired_type_keys bevat ${typeKey} voor ${item.document_type_key}, maar dat type is niet van toepassing`,
        };
      }
    }

    for (const parentTypeKey of item.attachment_parent_type_keys) {
      if (parentTypeKey === item.document_type_key) {
        return {
          ok: false,
          error: `documenttype ${item.document_type_key} kan geen bijlage van zichzelf zijn`,
        };
      }
    }
  }

  await sqlQuery(saveAdminInstallationDocumentsSql, {
    itemsJson: JSON.stringify(normalized),
    updatedBy: getUserDisplayName(user),
  });

  return await getAdminInstallationsCatalog();
}

export async function saveAdminInstallationExternalFields(items: any[], user: any) {
  const normalized = (Array.isArray(items) ? items : []).map((x, index) => ({
    field_key: normalizeNullableString(x?.field_key),
    section_key: normalizeNullableString(x?.section_key),
    label: normalizeNullableString(x?.label),
    sort_order: normalizeNullableNumber(x?.sort_order ?? (index + 1) * 10),
    source_type: normalizeNullableString(x?.source_type) || "fabric",
    fabric_table: normalizeNullableString(x?.fabric_table),
    fabric_column: normalizeNullableString(x?.fabric_column),
    notes: normalizeNullableString(x?.notes),
    is_active: normalizeBool(x?.is_active, true),
    applicability_type_keys: uniqueStrings(x?.applicability_type_keys),
  }));

  if (normalized.length === 0) {
    return { ok: false, error: "geen geldige atriumvelden ontvangen" };
  }

  for (const item of normalized) {
    if (!item.field_key) return { ok: false, error: "field_key is verplicht" };
    if (!item.label) return { ok: false, error: `label is verplicht voor ${item.field_key}` };
    if (!item.source_type) return { ok: false, error: `source_type is verplicht voor ${item.field_key}` };
    if (!item.fabric_table) return { ok: false, error: `fabric_table is verplicht voor ${item.field_key}` };
    if (!item.fabric_column) return { ok: false, error: `fabric_column is verplicht voor ${item.field_key}` };
  }

  await sqlQuery(saveAdminInstallationExternalFieldsSql, {
    itemsJson: JSON.stringify(normalized),
    updatedBy: getUserDisplayName(user),
  });

  return await getAdminInstallationsCatalog();
}

export async function saveAdminInstallationManagementPortals(items: any[], user: any) {
  const normalized = (Array.isArray(items) ? items : []).map((x, index) => ({
    portal_key: normalizeNullableString(x?.portal_key),
    display_name: normalizeNullableString(x?.display_name),
    notes: normalizeNullableString(x?.notes),
    installation_url_template: normalizeNullableString(x?.installation_url_template),
    sort_order: normalizeNullableNumber(x?.sort_order ?? (index + 1) * 10),
    is_active: normalizeBool(x?.is_active, true),
    applicability_type_keys: uniqueStrings(x?.applicability_type_keys),
  }));

  if (normalized.length === 0) {
    return { ok: false, error: "geen geldige beheerportalen ontvangen" };
  }

  for (const item of normalized) {
    if (!item.portal_key) return { ok: false, error: "portal_key is verplicht" };
    if (!item.display_name) return { ok: false, error: `display_name is verplicht voor ${item.portal_key}` };
  }

  await sqlQuery(saveAdminInstallationManagementPortalsSql, {
    itemsJson: JSON.stringify(normalized),
    updatedBy: getUserDisplayName(user),
  });

  return await getAdminInstallationsCatalog();
}

export async function initializeInstallationTypesFromAtrium(user: any, triggerSource = "admin") {
  const normalizedTriggerSource = normalizeNullableString(triggerSource) || "admin";
  const result: any = await sqlQueryRaw(initializeInstallationTypesSql, {
    updatedBy: getUserDisplayName(user),
    triggerSource: normalizedTriggerSource,
  });

  const recordsets = Array.isArray(result?.recordsets) ? result.recordsets : [];
  const summary = Array.isArray(recordsets[0]) ? recordsets[0][0] ?? null : null;
  const appliedGroups = Array.isArray(recordsets[1]) ? recordsets[1] : [];
  const unknownGroups = Array.isArray(recordsets[2]) ? recordsets[2] : [];
  const skippedGroups = Array.isArray(recordsets[3]) ? recordsets[3] : [];
  const mappings = Array.isArray(recordsets[4]) ? recordsets[4] : [];

  return {
    ok: true,
    summary: summary ?? {
      run_id: null,
      trigger_source: normalizedTriggerSource,
      updated_total: 0,
      updated_existing_count: 0,
      inserted_overlay_count: 0,
      skipped_already_typed_count: 0,
      skipped_historical_count: 0,
      skipped_not_current_count: 0,
      unknown_no_mapping_count: 0,
      mapping_target_missing_count: 0,
      inspected_count: 0,
    },
    appliedGroups,
    unknownGroups,
    skippedGroups,
    mappings,
  };
}
