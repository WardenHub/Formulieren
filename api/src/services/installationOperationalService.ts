import { sqlQuery } from "../db/index.js";
import { getInstallationMapViewportSql, getInstallationOperationalRowsSql } from "../db/queries/installationOperational.sql.js";

export type InstallationOperationalFilters = {
  q?: string | null;
  take?: number;
  onlyCurrent?: boolean;
  installationType?: string | null;
  coordinateMode?: "ALL" | "WITH" | "WITHOUT";
  followUpMode?: "ALL" | "OPEN" | "NONE" | "OVERDUE";
  openFormsOnly?: boolean;
  missingDocumentsOnly?: boolean;
  maintenanceStatus?: "ACTIVE" | "INACTIVE" | "UNKNOWN" | null;
  inspectionServiceStatus?: "ACTIVE" | "INACTIVE" | "UNKNOWN" | null;
  monitoringServiceStatus?: "ACTIVE" | "INACTIVE" | "UNKNOWN" | null;
  certificationRequiredOnly?: boolean;
  certificateStatus?: "VALID" | "EXPIRING" | "EXPIRED" | "MISSING" | "REVOKED" | "UNKNOWN" | null;
  activeInspectionOnly?: boolean;
};

export type InstallationMapViewportFilters = InstallationOperationalFilters & {
  north?: number;
  south?: number;
  east?: number;
  west?: number;
  zoom?: number;
};

const SERVICE_STATUSES = new Set(["ACTIVE", "INACTIVE", "UNKNOWN"]);
const CERTIFICATE_STATUSES = new Set(["VALID", "EXPIRING", "EXPIRED", "MISSING", "REVOKED", "UNKNOWN"]);
const COORDINATE_MODES = new Set(["ALL", "WITH", "WITHOUT"]);
const FOLLOW_UP_MODES = new Set(["ALL", "OPEN", "NONE", "OVERDUE"]);

function enumValue(value: unknown, allowed: Set<string>, fallback: string | null) {
  const clean = String(value ?? "").trim().toUpperCase();
  return allowed.has(clean) ? clean : fallback;
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const clean = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "ja"].includes(clean)) return true;
  if (["0", "false", "no", "nee"].includes(clean)) return false;
  return fallback;
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeRow(row: any) {
  return {
    ...row,
    open_follow_up_count: Number(row.open_follow_up_count || 0),
    overdue_follow_up_count: Number(row.overdue_follow_up_count || 0),
    customer_action_required_count: Number(row.customer_action_required_count || 0),
    third_party_action_required_count: Number(row.third_party_action_required_count || 0),
    certificate_blocking_follow_up_count: Number(row.certificate_blocking_follow_up_count || 0),
    open_form_count: Number(row.open_form_count || 0),
    required_document_count: Number(row.required_document_count || 0),
    missing_required_document_count: Number(row.missing_required_document_count || 0),
    active_inspection_case_count: Number(row.active_inspection_case_count || 0),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    service_badges: parseJsonArray(row.service_badges_json),
    service_badges_json: undefined,
  };
}

function queryParams(filters: InstallationOperationalFilters, installationCode: string | null) {
  const q = String(filters.q ?? "").trim();
  const installationType = String(filters.installationType ?? "").trim();
  const configuredHorizon = Number(process.env.CERTIFICATE_EXPIRING_HORIZON_DAYS || 90);

  return {
    installationCode,
    take: Math.max(1, Math.min(25000, Math.trunc(Number(filters.take || 20000)))),
    qLike: q ? `%${q}%` : null,
    onlyCurrent: boolValue(filters.onlyCurrent, true),
    installationType: installationType || null,
    coordinateMode: enumValue(filters.coordinateMode, COORDINATE_MODES, "ALL"),
    followUpMode: enumValue(filters.followUpMode, FOLLOW_UP_MODES, "ALL"),
    openFormsOnly: boolValue(filters.openFormsOnly),
    missingDocumentsOnly: boolValue(filters.missingDocumentsOnly),
    maintenanceStatus: enumValue(filters.maintenanceStatus, SERVICE_STATUSES, null),
    inspectionServiceStatus: enumValue(filters.inspectionServiceStatus, SERVICE_STATUSES, null),
    monitoringServiceStatus: enumValue(filters.monitoringServiceStatus, SERVICE_STATUSES, null),
    certificationRequiredOnly: boolValue(filters.certificationRequiredOnly),
    certificateStatus: enumValue(filters.certificateStatus, CERTIFICATE_STATUSES, null),
    activeInspectionOnly: boolValue(filters.activeInspectionOnly),
    certificateExpiringDays: Number.isFinite(configuredHorizon)
      ? Math.max(1, Math.min(730, Math.trunc(configuredHorizon)))
      : 90,
  };
}

function groupMapRows(rows: any[]) {
  const markerGroups = new Map<string, any>();
  const withoutCoordinates: any[] = [];

  for (const item of rows) {
    if (!item.has_valid_coordinates) {
      withoutCoordinates.push(item);
      continue;
    }

    const key = String(item.marker_group_key || item.atrium_installation_code);
    let group = markerGroups.get(key);
    if (!group) {
      group = {
        marker_group_key: key,
        object_gcid: item.object_gcid || null,
        object_code: item.object_code || null,
        object_name: item.object_name || item.installation_name || item.atrium_installation_code,
        formatted_address: item.formatted_address || null,
        latitude: item.latitude,
        longitude: item.longitude,
        relation: item.gebruiker_naam || item.eigenaar_naam || item.debiteur_naam || null,
        attention_status: item.attention_status,
        attention_reason: item.attention_reason,
        open_follow_up_count: 0,
        overdue_follow_up_count: 0,
        open_form_count: 0,
        missing_required_document_count: 0,
        installation_count: 0,
        installations: [],
      };
      markerGroups.set(key, group);
    }

    group.installation_count += 1;
    group.open_follow_up_count += item.open_follow_up_count;
    group.overdue_follow_up_count += item.overdue_follow_up_count;
    group.open_form_count += item.open_form_count;
    group.missing_required_document_count += item.missing_required_document_count;
    if (item.attention_status === "CRITICAL") {
      group.attention_status = "CRITICAL";
      group.attention_reason = item.attention_reason;
    } else if (item.attention_status === "ATTENTION" && group.attention_status !== "CRITICAL") {
      group.attention_status = "ATTENTION";
      group.attention_reason = item.attention_reason;
    }
    group.installations.push(item);
  }

  return { markers: [...markerGroups.values()], withoutCoordinates };
}

export async function getInstallationOperationalSummary(code: string) {
  const cleanCode = String(code || "").trim();
  if (!cleanCode) throw new Error("installation code required");

  const rows = await sqlQuery(getInstallationOperationalRowsSql, queryParams({ take: 1, onlyCurrent: false }, cleanCode));
  const item = rows?.[0] ? normalizeRow(rows[0]) : null;
  return { item };
}

export async function getInstallationMap(filters: InstallationOperationalFilters = {}) {
  const rows = await sqlQuery(getInstallationOperationalRowsSql, queryParams(filters, null));
  const items = (rows || []).map(normalizeRow);
  const grouped = groupMapRows(items);

  return {
    items,
    markers: grouped.markers,
    without_coordinates: grouped.withoutCoordinates,
    summary: {
      result_count: items.length,
      marker_count: grouped.markers.length,
      without_coordinates_count: grouped.withoutCoordinates.length,
      critical_count: items.filter((item) => item.attention_status === "CRITICAL").length,
      attention_count: items.filter((item) => item.attention_status === "ATTENTION").length,
      open_follow_up_count: items.reduce((sum, item) => sum + item.open_follow_up_count, 0),
      overdue_follow_up_count: items.reduce((sum, item) => sum + item.overdue_follow_up_count, 0),
      open_form_count: items.reduce((sum, item) => sum + item.open_form_count, 0),
      missing_required_document_count: items.reduce(
        (sum, item) => sum + item.missing_required_document_count,
        0
      ),
    },
  };
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function getInstallationMapViewport(filters: InstallationMapViewportFilters = {}) {
  const q = String(filters.q || "").trim();
  if (q && q.length < 2) return { markers: [], meta: { minimum_search_length: 2 } };

  const zoom = Math.round(boundedNumber(filters.zoom, 7, 5, 19));
  const cellSize = q || zoom >= 15 ? 0.000001
    : zoom >= 13 ? 0.002
      : zoom >= 11 ? 0.008
        : zoom >= 9 ? 0.03
          : zoom >= 7 ? 0.12
            : 0.35;
  const params = queryParams({
    ...filters,
    take: Math.min(750, Math.max(25, Number(filters.take || 750))),
  }, null);

  const startedAt = Date.now();
  const rows = await sqlQuery(getInstallationMapViewportSql, {
    ...params,
    north: boundedNumber(filters.north, 53.8, -90, 90),
    south: boundedNumber(filters.south, 50.5, -90, 90),
    east: boundedNumber(filters.east, 7.4, -180, 180),
    west: boundedNumber(filters.west, 3.1, -180, 180),
    zoom,
    cellSize,
  });

  return {
    markers: (rows || []).map((row: any) => {
      const installationCount = Number(row.installation_count || 0);
      return {
        ...row,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        installation_count: installationCount,
        open_follow_up_count: Number(row.open_follow_up_count || 0),
        overdue_follow_up_count: Number(row.overdue_follow_up_count || 0),
        installations: installationCount === 1 && row.representative_installation_code
          ? [{
              atrium_installation_code: row.representative_installation_code,
              installation_name: row.representative_installation_name,
              installation_type_key: row.installation_type_key,
              installation_type_name: row.installation_type_name,
            }]
          : [],
        representative_installation_code: undefined,
        representative_installation_name: undefined,
      };
    }),
    meta: {
      zoom,
      cell_size: cellSize,
      query_ms: Date.now() - startedAt,
      truncated: Number(rows?.length || 0) >= Number(params.take),
    },
  };
}
