import { sqlQuery } from "../db/index.js";
import { certificateWarningDays } from "./certificationPolicy.js";
import {
  getInstallationMapViewportSql,
  getInstallationOperationalRowsSql,
  getInstallationRelationGroupsSql,
  getRelationGroupTablesAvailableSql,
  getRelationGroupsForInstallationSql,
  withRelationGroupFilter,
} from "../db/queries/installationOperational.sql.js";
import { RELATION_GROUP_ROLES, normalizeRelationGroupKeys } from "./relationGroupScope.js";

/* De rollenlijst en het opschonen van de keuze staan sinds 17 september 2026 in
   relationGroupScope.ts, omdat de formuliermonitor dezelfde regels gebruikt. */
export { RELATION_GROUP_ROLES };

export type InstallationOperationalFilters = {
  q?: string | null;
  take?: number;
  onlyCurrent?: boolean;
  installationType?: string | null;
  installationTypes?: string | string[] | null;
  businessUnits?: string | string[] | null;
  relationGroups?: string | string[] | null;
  fields?: string | null;
  coordinateMode?: "ALL" | "WITH" | "WITHOUT";
  followUpMode?: "ALL" | "OPEN" | "NONE" | "OVERDUE";
  openFormsOnly?: boolean;
  missingDocumentsOnly?: boolean;
  maintenanceStatus?: "ACTIVE" | "INACTIVE" | "UNKNOWN" | null;
  inspectionServiceStatus?: "ACTIVE" | "INACTIVE" | "UNKNOWN" | null;
  monitoringServiceStatus?: "ACTIVE" | "INACTIVE" | "UNKNOWN" | null;
  certificationRequiredOnly?: boolean;
  certificateType?: "MAINTENANCE" | "INSPECTION" | null;
  certificateStatus?: "VALID" | "EXPIRING" | "EXPIRED" | "MISSING" | "REVOKED" | "UNKNOWN" | "CONTRACT_ENDED" | "NOT_REQUIRED" | null;
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
const CERTIFICATE_STATUSES = new Set(["VALID", "EXPIRING", "EXPIRED", "MISSING", "REVOKED", "UNKNOWN", "CONTRACT_ENDED", "NOT_REQUIRED"]);
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

/* Meerdere installatiesoorten in één keer. Het scherm kon er maar één meegeven en haalde
   daarom bij twee of meer soorten alles op om zelf te filteren; dat was 25000 rijen en
   tientallen megabytes voor een lijst die vijfhonderd regels toont. */
function normalizeInstallationTypes(filters: InstallationOperationalFilters) {
  const raw = filters.installationTypes ?? filters.installationType ?? "";
  const list = Array.isArray(raw) ? raw : String(raw).split(",");

  const types = Array.from(
    new Set(
      list
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );

  return types.slice(0, 50);
}

/* Wardenburg en Hefas zijn twee bedrijfsonderdelen in dezelfde database. Hefas leest nu nul
   rijen en gaat naar verwachting rond maart 2027 live; het filter is er daarom nu al, zodat
   er straks niets aan de keten hoeft te veranderen. Meerdere onderdelen tegelijk kunnen, net
   als bij installatiesoorten. */
function normalizeBusinessUnits(filters: InstallationOperationalFilters) {
  const raw = filters.businessUnits ?? "";
  const list = Array.isArray(raw) ? raw : String(raw).split(",");

  const units = Array.from(
    new Set(list.map((value) => String(value || "").trim()).filter(Boolean))
  );

  return units.slice(0, 20);
}

function queryParams(filters: InstallationOperationalFilters, installationCode: string | null) {
  const q = String(filters.q ?? "").trim();
  const installationTypes = normalizeInstallationTypes(filters);
  const installationType = installationTypes.length === 1 ? installationTypes[0] : "";

  return {
    installationCode,
    take: Math.max(1, Math.min(25000, Math.trunc(Number(filters.take || 20000)))),
    qLike: q ? `%${q}%` : null,
    onlyCurrent: boolValue(filters.onlyCurrent, true),
    installationType: installationType || null,
    // Als er meer dan één soort is gekozen gaat de hele lijst als json mee; de query filtert
    // er zelf op in plaats van dat het scherm alles ophaalt.
    installationTypesJson: installationTypes.length > 1 ? JSON.stringify(installationTypes) : null,
    businessUnitsJson: (() => {
      const units = normalizeBusinessUnits(filters);
      return units.length ? JSON.stringify(units) : null;
    })(),
    relationGroupsJson: (() => {
      const groups = normalizeRelationGroupKeys(filters.relationGroups);
      return groups.length ? JSON.stringify(groups) : null;
    })(),
    relationGroupRolesJson: JSON.stringify(RELATION_GROUP_ROLES),
    coordinateMode: enumValue(filters.coordinateMode, COORDINATE_MODES, "ALL"),
    followUpMode: enumValue(filters.followUpMode, FOLLOW_UP_MODES, "ALL"),
    openFormsOnly: boolValue(filters.openFormsOnly),
    missingDocumentsOnly: boolValue(filters.missingDocumentsOnly),
    maintenanceStatus: enumValue(filters.maintenanceStatus, SERVICE_STATUSES, null),
    inspectionServiceStatus: enumValue(filters.inspectionServiceStatus, SERVICE_STATUSES, null),
    monitoringServiceStatus: enumValue(filters.monitoringServiceStatus, SERVICE_STATUSES, null),
    certificationRequiredOnly: boolValue(filters.certificationRequiredOnly),
    certificateType: enumValue(filters.certificateType, new Set(["MAINTENANCE", "INSPECTION"]), null),
    certificateStatus: enumValue(filters.certificateStatus, CERTIFICATE_STATUSES, null),
    activeInspectionOnly: boolValue(filters.activeInspectionOnly),
    certificateExpiringDays: certificateWarningDays(),
  };
}

/* Wat een popup per installatie nodig heeft; code, naam en soort. De volledige rij ging
   eerder mee, ook nog eens genest per marker. */
function toMarkerInstallation(row: any) {
  return {
    atrium_installation_code: row?.atrium_installation_code ?? null,
    installation_name: row?.installation_name ?? null,
    installation_type_key: row?.installation_type_key ?? null,
    installation_type_name: row?.installation_type_name ?? null,
    attention_status: row?.attention_status ?? null,
    open_follow_up_count: row?.open_follow_up_count ?? 0,
  };
}

function groupMapRows(rows: any[], slimInstallations = true) {
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
    group.installations.push(slimInstallations ? toMarkerInstallation(item) : item);
  }

  return { markers: [...markerGroups.values()], withoutCoordinates };
}

export async function getInstallationOperationalSummary(code: string) {
  const cleanCode = String(code || "").trim();
  if (!cleanCode) throw new Error("installation code required");

  const rows = await sqlQuery(
    withRelationGroupFilter(getInstallationOperationalRowsSql, "o", false),
    queryParams({ take: 1, onlyCurrent: false }, cleanCode)
  );
  const item = rows?.[0] ? normalizeRow(rows[0]) : null;
  if (!item) return { item };

  return { item: { ...item, relation_groups: await listRelationGroupsForInstallation(cleanCode) } };
}

/* De relatiegroepen waar één installatie bij hoort. Bestaan de spiegels nog niet, dan levert
   dit een lege lijst en blijft het scherm gewoon werken; dat is dezelfde afspraak als bij de
   filterlijst. */
async function listRelationGroupsForInstallation(installationCode: string) {
  const [availability] = (await sqlQuery(getRelationGroupTablesAvailableSql, {})) || [];
  if (!availability?.available) return [];

  const rows = await sqlQuery(getRelationGroupsForInstallationSql, {
    installationCode,
    relationGroupRolesJson: JSON.stringify(RELATION_GROUP_ROLES),
  });

  return (rows || []).map((row: any) => ({
    business_unit: row.business_unit ?? null,
    relation_group_key: row.relation_group_key ?? null,
    relation_group_code: row.relation_group_code ?? null,
    relation_group_name: row.relation_group_name ?? null,
    relation_name: row.relation_name ?? null,
    roles: String(row.roles || "").split(",").filter(Boolean),
    fabric_loaded_at: row.fabric_loaded_at ?? null,
  }));
}

/* Wat een lijstkaart en een marker werkelijk laten zien. Een rij heeft achtenveertig velden
   en die gingen alle mee; vijfhonderd rijen was daarmee ruim twee megabyte, terwijl het
   scherm er eenentwintig van gebruikt. Wie de volledige rij nodig heeft vraagt hem op per
   installatie, en dat doet het detailscherm al. */
const LIST_FIELDS = [
  "atrium_installation_code",
  "installation_id",
  "installation_name",
  "installation_status",
  "installation_type_key",
  "installation_type_name",
  "object_gcid",
  "object_name",
  "formatted_address",
  "latitude",
  "longitude",
  "has_valid_coordinates",
  "marker_group_key",
  "relation_name",
  "attention_status",
  "attention_reason",
  "open_follow_up_count",
  "overdue_follow_up_count",
  "open_form_count",
  "missing_required_document_count",
  "has_maintenance_service",
  "maintenance_contract_status",
  "has_inspection_service",
  "inspection_service_status",
  "has_monitoring_service",
  "monitoring_service_status",
  "certification_required",
  "certificate_status",
];

function toListRow(row: any) {
  const slim: Record<string, any> = {};
  for (const field of LIST_FIELDS) slim[field] = row?.[field] ?? null;
  return slim;
}

export async function getInstallationMap(filters: InstallationOperationalFilters = {}) {
  const params = queryParams(filters, null);
  const rows = await sqlQuery(
    withRelationGroupFilter(getInstallationOperationalRowsSql, "o", Boolean(params.relationGroupsJson)),
    params
  );
  const items = (rows || []).map(normalizeRow);
  // fields=full geeft de volledige rij terug voor wie dat nodig heeft; standaard gaat de
  // uitgeklede vorm mee, want dat is wat de lijst en de kaart tonen.
  const wantsFullRows = String(filters.fields || "").trim().toLowerCase() === "full";
  const grouped = groupMapRows(items, !wantsFullRows);

  return {
    items: wantsFullRows ? items : items.map(toListRow),
    markers: grouped.markers,
    // Deze rijen worden met dezelfde lijstkaart getoond, dus dezelfde uitgeklede vorm.
    without_coordinates: wantsFullRows
      ? grouped.withoutCoordinates
      : grouped.withoutCoordinates.map(toListRow),
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

  // Search results need the concrete installation list for each marker; the
  // full map query already groups by exact coordinates and avoids the
  // representative-only viewport projection.
  if (q) {
    const result = await getInstallationMap({ ...filters, take: Math.min(750, Math.max(25, Number(filters.take || 750))) });

    // Bij zoeken hoort er ook een lijst onder de kaart. Die kwam eerder uit de geneste
    // installaties van de markers, en die dragen alleen wat een popup nodig heeft; de
    // lijstkaarten misten daardoor hun labels. De lijstrijen gaan nu apart mee.
    return {
      markers: result.markers,
      items: result.items,
      meta: {
        query_mode: "search",
        truncated: result.items.length >= Number(filters.take || 750),
      },
    };
  }

  const zoom = Math.round(boundedNumber(filters.zoom, 7, 5, 19));
  const cellSize = q || zoom >= 15 ? 0.000001
    : zoom >= 13 ? 0.002
      : zoom >= 11 ? 0.008
        : zoom >= 9 ? 0.03
          : zoom >= 7 ? 0.12
            : 0.35;
  /* Hoeveel installaties per marker meegaan hangt af van hoe ver je uitgezoomd bent. Op
     landniveau valt een rastercel met honderden installaties samen in één cirkel; een popup
     die er vijfentwintig willekeurige van opsomt helpt niemand, en het maakte de eerste
     kaartweergave megabytes groot. Uitgezoomd sturen we dus geen lijst en zegt de popup
     alleen hoeveel het zijn; vanaf zoom 15 is een cel één adres en is de lijst precies wat
     je wil zien. Het werkelijke aantal staat altijd in installation_count. */
  const maxPerMarker = zoom >= 15 ? 50 : zoom >= 13 ? 25 : zoom >= 11 ? 10 : 0;

  const params = queryParams({
    ...filters,
    take: Math.min(750, Math.max(25, Number(filters.take || 750))),
  }, null);

  const startedAt = Date.now();
  const rows = await sqlQuery(
    withRelationGroupFilter(getInstallationMapViewportSql, "a", Boolean(params.relationGroupsJson)),
    {
    ...params,
    north: boundedNumber(filters.north, 53.8, -90, 90),
    south: boundedNumber(filters.south, 50.5, -90, 90),
    east: boundedNumber(filters.east, 7.4, -180, 180),
    west: boundedNumber(filters.west, 3.1, -180, 180),
    zoom,
    cellSize,
    maxPerMarker,
    }
  );

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
        installations: parseJsonArray(row.installations_json),
        representative_installation_code: undefined,
        representative_installation_name: undefined,
      };
    }),
    meta: {
      zoom,
      cell_size: cellSize,
      max_per_marker: maxPerMarker,
      query_ms: Date.now() - startedAt,
      truncated: Number(rows?.length || 0) >= Number(params.take),
    },
  };
}

/* De relatiegroepen voor het filter. Alleen groepen die installaties opleveren, met het
   aantal erbij, zodat het scherm "RUG (345)" kan tonen en niemand op een lege groep klikt.

   fabric_loaded_at is het moment waarop Fabric deze groep in Ember heeft gezet. Dat hoort
   zichtbaar te zijn: de groepen komen uit Atrium en zijn dus zo actueel als de laatste sync. */
export async function listInstallationRelationGroups(filters: InstallationOperationalFilters = {}) {
  const [availability] = (await sqlQuery(getRelationGroupTablesAvailableSql, {})) || [];

  // Voor de eerste sync bestaan de spiegels nog niet. Dat is geen fout; het filter hoort dan
  // gewoon niet in beeld te komen.
  if (!availability?.available) {
    return { groups: [], meta: { group_count: 0, fabric_loaded_at: null, roles: RELATION_GROUP_ROLES, available: false } };
  }

  const rows = await sqlQuery(getInstallationRelationGroupsSql, {
    onlyCurrent: boolValue(filters.onlyCurrent, true),
    businessUnitsJson: (() => {
      const units = normalizeBusinessUnits(filters);
      return units.length ? JSON.stringify(units) : null;
    })(),
    relationGroupRolesJson: JSON.stringify(RELATION_GROUP_ROLES),
  });

  const groups = (rows || []).map((row: any) => ({
    business_unit: row.business_unit ?? null,
    relation_group_key: row.relation_group_key ?? null,
    relation_group_code: row.relation_group_code ?? null,
    relation_group_name: row.relation_group_name ?? null,
    relation_group_kind: row.relation_group_kind ?? null,
    installation_count: Number(row.installation_count || 0),
    fabric_loaded_at: row.fabric_loaded_at ?? null,
  }));

  const loadedAt = groups
    .map((group) => group.fabric_loaded_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return {
    groups,
    meta: {
      group_count: groups.length,
      // De oudste sync bepaalt hoe oud het beeld is; de nieuwste zegt wanneer er voor het
      // laatst iets is binnengekomen. Het scherm toont de laatste.
      fabric_loaded_at: loadedAt,
      roles: RELATION_GROUP_ROLES,
      available: true,
    },
  };
}
