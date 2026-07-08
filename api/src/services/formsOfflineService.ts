import * as installationsService from "./installationsService.js";
import * as formsService from "./formsService.js";

function safeParseJson(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toCleanString(value: any) {
  return String(value || "").trim();
}

function slugify(value: any, fallback = "formulier") {
  const text = toCleanString(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return text || fallback;
}

function getAuditActor(user: any) {
  return (
    toCleanString(user?.name_preference) ||
    toCleanString(user?.displayName) ||
    toCleanString(user?.email) ||
    toCleanString(user?.upn) ||
    "ember-offline"
  );
}

function normalizeSelectedKeys(value: any) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => toCleanString(item))
        .filter(Boolean)
    )
  );
}

export async function buildOfflineFormPackage(
  code: string,
  instanceId: number | string,
  payload: any,
  user: any
) {
  const cleanCode = toCleanString(code);
  const selectedDocumentTypeKeys = normalizeSelectedKeys(payload?.selected_document_type_keys);

  const [installationResult, formInstanceResult, catalogResult, documentsResult] = await Promise.all([
    installationsService.getInstallationByCode(cleanCode),
    formsService.getFormInstance(cleanCode, instanceId),
    installationsService.getCatalog(cleanCode),
    installationsService.getInstallationDocuments(cleanCode),
  ]);

  if (!installationResult?.installation) {
    return { error: "not found" };
  }

  if (formInstanceResult?.error === "not found" || !formInstanceResult?.item) {
    return { error: "not found" };
  }

  const item: any = formInstanceResult.item;
  const installation: any = installationResult.installation;
  const documentTypeRows = Array.isArray(catalogResult?.documentTypes) ? catalogResult.documentTypes : [];
  const documentTypeMap = new Map(
    documentTypeRows.map((row: any) => [toCleanString(row?.document_type_key), row])
  );

  const invalidKeys = selectedDocumentTypeKeys.filter((key) => !documentTypeMap.has(key));
  if (invalidKeys.length > 0) {
    return {
      ok: false,
      error: "ongeldige documenttypes geselecteerd",
      invalid_document_type_keys: invalidKeys,
    };
  }

  const groupedDocuments = Array.isArray(documentsResult?.documentTypes) ? documentsResult.documentTypes : [];
  const countsByType = new Map<string, number>();
  for (const group of groupedDocuments) {
    const key = toCleanString(group?.document_type_key);
    const docs = Array.isArray(group?.documents) ? group.documents : [];
    if (key) countsByType.set(key, docs.length);
  }

  const defaultSelectedKeys = documentTypeRows
    .filter((row: any) => row?.is_required === true && (countsByType.get(toCleanString(row?.document_type_key)) || 0) > 0)
    .map((row: any) => toCleanString(row?.document_type_key));

  const effectiveSelectedKeys =
    selectedDocumentTypeKeys.length > 0
      ? selectedDocumentTypeKeys
      : defaultSelectedKeys.length > 0
        ? defaultSelectedKeys
        : documentTypeRows
            .filter((row: any) => (countsByType.get(toCleanString(row?.document_type_key)) || 0) > 0)
            .map((row: any) => toCleanString(row?.document_type_key));

  const selectedDocuments = groupedDocuments
    .filter((group: any) => effectiveSelectedKeys.includes(toCleanString(group?.document_type_key)))
    .flatMap((group: any) => {
      const documentTypeKey = toCleanString(group?.document_type_key);
      const documentTypeName =
        toCleanString(group?.document_type_name) ||
        toCleanString(documentTypeMap.get(documentTypeKey)?.document_type_name);

      return (Array.isArray(group?.documents) ? group.documents : []).map((doc: any) => ({
        document_id: doc?.document_id ?? null,
        document_type_key: documentTypeKey,
        document_type_name: documentTypeName,
        title: doc?.title ?? null,
        note: doc?.note ?? null,
        document_number: doc?.document_number ?? null,
        document_date: doc?.document_date ?? null,
        revision: doc?.revision ?? null,
        has_file: doc?.has_file === true,
        file_name: doc?.file_name ?? null,
        mime_type: doc?.mime_type ?? null,
        file_size_bytes: doc?.file_size_bytes ?? null,
        uploaded_at: doc?.uploaded_at ?? null,
        uploaded_by: doc?.uploaded_by ?? null,
        download_endpoint:
          doc?.has_file === true && doc?.document_id != null
            ? `/installations/${encodeURIComponent(cleanCode)}/documents/${encodeURIComponent(doc.document_id)}/download`
            : null,
      }));
    });

  const availableDocumentTypes = documentTypeRows.map((row: any) => {
    const key = toCleanString(row?.document_type_key);
    const count = countsByType.get(key) || 0;
    return {
      document_type_key: key,
      document_type_name: row?.document_type_name ?? key,
      section_key: row?.section_key ?? null,
      sort_order: row?.sort_order ?? null,
      is_required: row?.is_required === true,
      is_attachment_only: row?.is_attachment_only === true,
      document_count: count,
      selected_by_default: effectiveSelectedKeys.includes(key),
    };
  });

  const packageData = {
    package_kind: "ember_offline_form_package",
    package_version: "0.1",
    generated_at: new Date().toISOString(),
    generated_by: getAuditActor(user),
    source: {
      app: "ember",
      mode: "online-preparation",
      poc: true,
    },
    offline_constraints: {
      supports_offline_attachments: false,
      supports_offline_final_submit: false,
      final_submit_requires_online: true,
    },
    installation: {
      installation_id: installation?.installation_id ?? item?.installation_id ?? null,
      atrium_installation_code: item?.atrium_installation_code ?? cleanCode,
      installation_name:
        installation?.installation_name ??
        installation?.installatie_naam ??
        item?.installation_name ??
        null,
      object_name: installation?.object_naam ?? installation?.object_name ?? null,
      object_address: installation?.object_adres ?? installation?.object_address ?? null,
      installation_status: item?.installation_status ?? installation?.installation_status ?? null,
      bedrijf_unit: item?.BedrijfUnit ?? installation?.BedrijfUnit ?? null,
    },
    form_instance: {
      form_instance_id: item?.form_instance_id ?? null,
      form_id: item?.form_id ?? null,
      form_code: item?.form_code ?? null,
      form_name: item?.form_name ?? null,
      version: item?.version ?? null,
      version_label: item?.version_label ?? null,
      status: item?.status ?? null,
      draft_rev: item?.draft_rev ?? null,
      instance_title: item?.instance_title ?? null,
      instance_note: item?.instance_note ?? null,
      parent_instance_id: item?.parent_instance_id ?? null,
      created_at: item?.created_at ?? null,
      updated_at: item?.updated_at ?? null,
      updated_by: item?.updated_by ?? null,
    },
    runtime: {
      survey_json: safeParseJson(item?.survey_json, null),
      answers_json: safeParseJson(item?.answers_json, {}),
      calculated_json: safeParseJson(item?.calculated_json, null),
      guidance_by_question: item?.guidance_by_question ?? {},
      guidance_by_matrix_row: item?.guidance_by_matrix_row ?? {},
    },
    document_selection: {
      available_document_types: availableDocumentTypes,
      selected_document_type_keys: effectiveSelectedKeys,
    },
    selected_documents: selectedDocuments,
  };

  const fileName = [
    "ember-offline",
    slugify(item?.form_name, item?.form_code || "formulier"),
    slugify(cleanCode, "installatie"),
    item?.form_instance_id ?? "instance",
  ].join("_") + ".json";

  return {
    ok: true,
    file_name: fileName,
    package: packageData,
  };
}
