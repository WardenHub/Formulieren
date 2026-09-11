const EMBER_ONLINE_BASE =
  window?.location?.hostname === "localhost"
    ? "http://localhost:5173"
    : "https://ember.wardenburg.nl";

const OFFLINE_STATUS_META = {
  klaargezet: { label: "Klaargezet", tone: "neutral" },
  lokaal_in_bewerking: { label: "Lokaal in bewerking", tone: "info" },
  lokaal_afgerond: { label: "Lokaal afgerond", tone: "success" },
  wacht_op_online_afronden: { label: "Wacht op online afronden", tone: "warning" },
  gesynchroniseerd: { label: "Gesynchroniseerd", tone: "success" },
  conflict: { label: "Conflict", tone: "danger" },
};

function toCleanString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toDisplayTitle(pkg) {
  return (
    toCleanString(pkg?.form_instance?.instance_title) ||
    toCleanString(pkg?.form_instance?.form_name) ||
    toCleanString(pkg?.form_instance?.form_code) ||
    "Offline formulier"
  );
}

function toSurveyPageCount(pkg) {
  const pages = pkg?.runtime?.survey_json?.pages;
  return Array.isArray(pages) ? pages.length : 0;
}

function buildRoute(pkg) {
  const instanceId = pkg?.form_instance?.form_instance_id;
  if (instanceId == null) return EMBER_ONLINE_BASE;
  return `${EMBER_ONLINE_BASE}/monitor/formulieren/${encodeURIComponent(instanceId)}`;
}

export function getOfflineStatusMeta(status) {
  return OFFLINE_STATUS_META[status] || OFFLINE_STATUS_META.klaargezet;
}

export function normalizeOfflinePackage(rawPackage, sourceFileName) {
  if (!rawPackage || typeof rawPackage !== "object") {
    throw new Error("Het gekozen bestand bevat geen geldig Ember Offline package.");
  }

  if (rawPackage.package_kind !== "ember_offline_form_package") {
    throw new Error("Dit bestand is geen Ember Offline formulierpackage.");
  }

  const formInstanceId = rawPackage?.form_instance?.form_instance_id;
  const installationCode =
    toCleanString(rawPackage?.installation?.atrium_installation_code) || "installatie";

  if (formInstanceId == null) {
    throw new Error("Het offline package mist een form_instance_id.");
  }

  const now = new Date().toISOString();
  const id = `${installationCode}::${formInstanceId}`;
  const existingAnswers = rawPackage?.runtime?.answers_json;

  return {
    id,
    source_file_name: sourceFileName || `ember-offline-${id}.json`,
    imported_at: now,
    local_updated_at: now,
    local_status: "klaargezet",
    needs_online_finish: false,
    has_conflict: false,
    summary: {
      title: toDisplayTitle(rawPackage),
      form_instance_id: formInstanceId,
      form_code: toCleanString(rawPackage?.form_instance?.form_code),
      form_version: toCleanString(rawPackage?.form_instance?.version_label || rawPackage?.form_instance?.version),
      installation_code: installationCode,
      installation_name:
        toCleanString(rawPackage?.installation?.installation_name) ||
        toCleanString(rawPackage?.installation?.object_name) ||
        "Onbekende installatie",
      object_name: toCleanString(rawPackage?.installation?.object_name),
      object_address: toCleanString(rawPackage?.installation?.object_address),
      bedrijf_unit: toCleanString(rawPackage?.installation?.bedrijf_unit),
      installation_status: toCleanString(rawPackage?.installation?.installation_status),
      selected_document_count: Array.isArray(rawPackage?.selected_documents) ? rawPackage.selected_documents.length : 0,
      selected_document_type_count: Array.isArray(rawPackage?.document_selection?.selected_document_type_keys)
        ? rawPackage.document_selection.selected_document_type_keys.length
        : 0,
      survey_page_count: toSurveyPageCount(rawPackage),
      route_url: buildRoute(rawPackage),
    },
    package_data: rawPackage,
    local_runtime: {
      answers_json: existingAnswers && typeof existingAnswers === "object" ? existingAnswers : {},
      last_local_saved_at: null,
      runner_notes: "",
      checklist: {
        package_checked: false,
        documents_checked: false,
        ready_for_online_finish: false,
      },
    },
  };
}

export function mergeOfflinePackage(existingItem, nextItem) {
  if (!existingItem) return nextItem;
  return {
    ...nextItem,
    imported_at: existingItem.imported_at || nextItem.imported_at,
    local_updated_at: new Date().toISOString(),
    local_status: existingItem.local_status || nextItem.local_status,
    needs_online_finish: existingItem.needs_online_finish || false,
    has_conflict: existingItem.has_conflict || false,
    local_runtime: {
      answers_json:
        existingItem?.local_runtime?.answers_json && Object.keys(existingItem.local_runtime.answers_json).length > 0
          ? existingItem.local_runtime.answers_json
          : nextItem?.local_runtime?.answers_json || {},
      last_local_saved_at: existingItem?.local_runtime?.last_local_saved_at || null,
      runner_notes: existingItem?.local_runtime?.runner_notes || "",
      checklist: {
        package_checked: Boolean(existingItem?.local_runtime?.checklist?.package_checked),
        documents_checked: Boolean(existingItem?.local_runtime?.checklist?.documents_checked),
        ready_for_online_finish: Boolean(existingItem?.local_runtime?.checklist?.ready_for_online_finish),
      },
    },
  };
}

export function buildOfflineCounts(items) {
  return items.reduce(
    (acc, item) => {
      const key = item?.local_status || "klaargezet";
      acc.total += 1;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {
      total: 0,
      klaargezet: 0,
      lokaal_in_bewerking: 0,
      lokaal_afgerond: 0,
      wacht_op_online_afronden: 0,
      gesynchroniseerd: 0,
      conflict: 0,
    }
  );
}

export function statusOptionsForItem(item) {
  const current = item?.local_status || "klaargezet";
  const options = [
    "klaargezet",
    "lokaal_in_bewerking",
    "lokaal_afgerond",
    "wacht_op_online_afronden",
    "gesynchroniseerd",
    "conflict",
  ];

  return options.map((key) => ({
    key,
    current: key === current,
    ...getOfflineStatusMeta(key),
  }));
}
