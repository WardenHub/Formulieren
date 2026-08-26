import crypto from "node:crypto";

export type AtriumContextType = "RELATION" | "PROJECT" | "WORK_ORDER";
export type AtriumContext = {
  context_type: AtriumContextType | "INSTALLATION";
  source_system: "ATRIUM_READER" | "FABRIC_GOLD";
  business_unit: string | null;
  source_key: string;
  display_code: string | null;
  display_label: string;
  metadata: Record<string, unknown>;
  source_modified_at: string | null;
  last_verified_at: string;
  verification_status: "VERIFIED";
  relation_kind?: string | null;
};

export class AtriumReaderError extends Error {
  constructor(
    public readonly category: "CONFIGURATION" | "VALIDATION" | "TIMEOUT" | "UNAVAILABLE" | "BAD_RESPONSE",
    message: string,
  ) {
    super(message);
  }
}

const MAXIMUM_ROWS = 25;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function baseUrl() {
  const value = String(process.env.ATRIUM_READER_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!value) throw new AtriumReaderError("CONFIGURATION", "Atrium Reader configuration missing");
  return value;
}

function timeoutMs() {
  const value = Number(process.env.ATRIUM_READER_TIMEOUT_MS || 10000);
  return Number.isFinite(value) ? Math.max(1000, Math.min(30000, Math.trunc(value))) : 10000;
}

function configuredBusinessUnits() {
  return String(process.env.ATRIUM_READER_ALLOWED_BUSINESS_UNITS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getAuthorizedAtriumBusinessUnit() {
  const businessUnit = String(process.env.ATRIUM_READER_BUSINESS_UNIT || "").trim();
  if (!businessUnit) {
    throw new AtriumReaderError("CONFIGURATION", "Atrium Reader Business Unit configuration missing");
  }
  const allowlist = configuredBusinessUnits();
  if (allowlist.length && !allowlist.some((value) => value.toLocaleLowerCase("nl-NL") === businessUnit.toLocaleLowerCase("nl-NL"))) {
    throw new AtriumReaderError("CONFIGURATION", "Atrium Reader Business Unit is not authorized");
  }
  return businessUnit;
}

function lowerRow(row: any) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value]));
}

function cleanText(value: unknown, maximumLength: number, required = false) {
  const clean = String(value ?? "").trim();
  if (required && !clean) throw new AtriumReaderError("BAD_RESPONSE", "Reader required field missing");
  return clean.slice(0, maximumLength) || null;
}

function safeCorrelationId(value: unknown, fallback: string) {
  const candidate = String(value || "").trim();
  return SAFE_CORRELATION_ID.test(candidate) ? candidate : fallback;
}

function dependencyLog(values: Record<string, unknown>) {
  console.info("[atrium-reader]", JSON.stringify(values));
}

async function run(queryId: string, parameters: Record<string, unknown>) {
  const requestedCorrelationId = crypto.randomUUID();
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  let logged = false;

  try {
    const response = await fetch(`${baseUrl()}/api/v1/queries/${encodeURIComponent(queryId)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": requestedCorrelationId,
      },
      body: JSON.stringify({ parameters }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let payload: any;
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new AtriumReaderError("BAD_RESPONSE", "Atrium Reader returned invalid JSON");
    }

    const correlationId = safeCorrelationId(
      payload?.correlationId ?? payload?.CorrelationId ?? response.headers.get("x-correlation-id"),
      requestedCorrelationId,
    );
    if (!response.ok) {
      const category = response.status === 400
        ? "VALIDATION"
        : response.status === 504 || payload?.error === "atrium_query_timeout"
          ? "TIMEOUT"
          : "UNAVAILABLE";
      dependencyLog({ event: "dependency", queryId, correlationId, status: "failed", category, durationMs: Date.now() - startedAt });
      logged = true;
      throw new AtriumReaderError(category, `Atrium Reader request failed (${response.status})`);
    }

    const rows = Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload?.Rows) ? payload.Rows : null;
    const returnedQueryId = String(payload?.queryId ?? payload?.QueryId ?? "");
    const maximumRows = Number(payload?.maximumRows ?? payload?.MaximumRows);
    const rowCount = Number(payload?.rowCount ?? payload?.RowCount);
    const truncated = payload?.truncated ?? payload?.Truncated;
    if (
      !rows
      || returnedQueryId !== queryId
      || !Number.isInteger(maximumRows)
      || maximumRows < 1
      || maximumRows > MAXIMUM_ROWS
      || !Number.isInteger(rowCount)
      || rowCount !== rows.length
      || rows.length > maximumRows
      || typeof truncated !== "boolean"
    ) {
      throw new AtriumReaderError("BAD_RESPONSE", "Atrium Reader response contract invalid");
    }

    dependencyLog({ event: "dependency", queryId, correlationId, status: "success", durationMs: Date.now() - startedAt, rowCount, truncated });
    logged = true;
    return { correlationId, rows, rowCount, maximumRows, truncated, verifiedAt: new Date().toISOString() };
  } catch (error: any) {
    const mapped = error instanceof AtriumReaderError
      ? error
      : error?.name === "AbortError"
        ? new AtriumReaderError("TIMEOUT", "Atrium Reader timeout")
        : new AtriumReaderError("UNAVAILABLE", "Atrium Reader unavailable");
    if (!logged) {
      dependencyLog({ event: "dependency", queryId, correlationId: requestedCorrelationId, status: "failed", category: mapped.category, durationMs: Date.now() - startedAt });
    }
    throw mapped;
  } finally {
    clearTimeout(timer);
  }
}

function searchTerm(value: unknown) {
  const clean = String(value ?? "").trim();
  if (clean.length < 3 || clean.length > 50) throw new AtriumReaderError("VALIDATION", "search term must contain 3 to 50 characters");
  return clean;
}

function sourceKey(value: unknown) {
  const clean = String(value ?? "").trim();
  const separator = clean.indexOf("|");
  const businessUnit = separator > 0 ? clean.slice(0, separator) : "";
  const key = separator > 0 ? clean.slice(separator + 1) : "";
  if (
    businessUnit.toLocaleLowerCase("nl-NL") !== getAuthorizedAtriumBusinessUnit().toLocaleLowerCase("nl-NL")
    || !key
    || key.length > 39
    || key.includes("|")
  ) throw new AtriumReaderError("VALIDATION", "Atrium source key invalid");
  return clean;
}

function contextType(value: unknown): AtriumContextType {
  const clean = String(value ?? "").trim().toUpperCase();
  if (!["RELATION", "PROJECT", "WORK_ORDER"].includes(clean)) throw new AtriumReaderError("VALIDATION", "Atrium context type invalid");
  return clean as AtriumContextType;
}

function context(row: any): AtriumContext {
  const value = lowerRow(row);
  const type = cleanText(value.context_type, 30, true)!.toUpperCase() as AtriumContextType;
  const businessUnit = cleanText(value.business_unit, 50, true)!;
  if (businessUnit.toLocaleLowerCase("nl-NL") !== getAuthorizedAtriumBusinessUnit().toLocaleLowerCase("nl-NL")) {
    throw new AtriumReaderError("BAD_RESPONSE", "Reader returned an unauthorized Business Unit");
  }
  return {
    context_type: type,
    source_system: "ATRIUM_READER",
    business_unit: businessUnit,
    source_key: sourceKey(value.source_key),
    display_code: cleanText(value.display_code, 200),
    display_label: cleanText(value.display_label, 500, true)!,
    metadata: {
      postcode: cleanText(value.postcode, 20),
      plaats: cleanText(value.plaats, 100),
      status_code: cleanText(value.status_code, 30),
      planned_status_code: cleanText(value.planned_status_code, 30),
      relation_source_key: cleanText(value.relation_source_key, 50),
      relation_code: cleanText(value.relation_code, 50),
      relation_name: cleanText(value.relation_name, 500),
      project_source_key: cleanText(value.project_source_key, 50),
      project_code: cleanText(value.project_code, 50),
    },
    source_modified_at: value.source_modified_at ? String(value.source_modified_at) : null,
    last_verified_at: value.last_verified_at ? String(value.last_verified_at) : new Date().toISOString(),
    verification_status: "VERIFIED",
  };
}

async function search(queryId: string, term: unknown) {
  const result = await run(queryId, {
    businessUnit: getAuthorizedAtriumBusinessUnit(),
    searchTerm: searchTerm(term),
  });
  return { ...result, items: result.rows.map(context) };
}

export const atriumReaderClient = {
  findRelations: (term: unknown) => search("relation-search", term),
  findProjects: (term: unknown) => search("project-search", term),
  findWorkorders: (term: unknown) => search("workorder-search", term),

  async resolveContext(typeValue: unknown, keyValue: unknown) {
    const type = contextType(typeValue);
    const key = sourceKey(keyValue);
    const result = await run("context-resolve", {
      businessUnit: getAuthorizedAtriumBusinessUnit(),
      contextType: type,
      sourceKey: key,
    });
    const primary = result.rows.map(context);
    const row = lowerRow(result.rows[0]);
    const related: AtriumContext[] = [];

    const add = (relatedType: AtriumContextType, relatedKey: any, code: any, label: any, kind: string) => {
      if (!relatedKey || relatedKey === key) return;
      related.push({
        context_type: relatedType,
        source_system: "ATRIUM_READER",
        business_unit: cleanText(row.business_unit, 50),
        source_key: sourceKey(relatedKey),
        display_code: cleanText(code, 200),
        display_label: cleanText(label || code, 500, true)!,
        metadata: {},
        source_modified_at: row.source_modified_at ? String(row.source_modified_at) : null,
        last_verified_at: row.last_verified_at ? String(row.last_verified_at) : new Date().toISOString(),
        verification_status: "VERIFIED",
        relation_kind: kind,
      });
    };

    add("RELATION", row.relation_source_key, row.relation_code, row.relation_name, "ATRIUM_RELATION");
    add("PROJECT", row.project_source_key, row.project_code, row.project_code, "ATRIUM_PROJECT");
    add("WORK_ORDER", row.work_order_source_key, row.work_order_code, row.work_order_code, "ATRIUM_WORK_ORDER");
    for (const code of String(row.installation_codes || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 25)) {
      related.push({
        context_type: "INSTALLATION",
        source_system: "FABRIC_GOLD",
        business_unit: cleanText(row.business_unit, 50),
        source_key: code.slice(0, 450),
        display_code: code.slice(0, 200),
        display_label: code.slice(0, 500),
        metadata: {},
        source_modified_at: row.source_modified_at ? String(row.source_modified_at) : null,
        last_verified_at: row.last_verified_at ? String(row.last_verified_at) : new Date().toISOString(),
        verification_status: "VERIFIED",
        relation_kind: "ATRIUM_INSTALLATION",
      });
    }
    return { ...result, items: [...primary, ...related] };
  },

  async getInspectionWorkorders(installationCodes: string[], dateWindowDays: number) {
    const codes = [...new Set((installationCodes || []).map((code) => String(code || "").trim()).filter(Boolean))];
    if (!codes.length || codes.length > 25 || codes.some((code) => code.length > 20)) {
      throw new AtriumReaderError("VALIDATION", "1 to 25 installation codes required");
    }
    const days = Math.max(1, Math.min(3650, Math.trunc(dateWindowDays)));
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - days * 86400000);
    return run("inspection-workorders-by-installations", {
      businessUnit: getAuthorizedAtriumBusinessUnit(),
      installationCodes: codes,
      dateFrom: dateFrom.toISOString().slice(0, 10),
      dateTo: dateTo.toISOString().slice(0, 10),
    });
  },

  getWorkorder: (key: unknown) => run("workorder-by-key", {
    businessUnit: getAuthorizedAtriumBusinessUnit(),
    sourceKey: sourceKey(key),
  }),
};
