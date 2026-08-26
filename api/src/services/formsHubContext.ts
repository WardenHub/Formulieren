import type { AtriumContext, AtriumContextType } from "./atriumReaderClient.js";

export const FORM_CONTEXT_TYPES = [
  "RELATION",
  "PROJECT",
  "WORK_ORDER",
  "INSTALLATION",
  "EMPLOYEE",
] as const;

export type FormContextType = typeof FORM_CONTEXT_TYPES[number];
export type SelectedFormContext = {
  context_type: FormContextType;
  source_system: "ATRIUM_READER" | "FABRIC_GOLD" | "EMBER_DIRECTORY";
  source_key: string;
};

export type ResolvedFormContext = {
  context_type: FormContextType;
  source_system: "ATRIUM_READER" | "FABRIC_GOLD" | "EMBER_DIRECTORY";
  business_unit: string | null;
  source_key: string;
  display_code: string | null;
  display_label: string | null;
  metadata_json: string | null;
  source_modified_at: string | null;
  last_verified_at: string | null;
  verification_status: "VERIFIED";
  derivation_type: "SELECTED" | "DERIVED";
};

export type ReaderResolution = {
  selected: SelectedFormContext;
  correlationId: string;
  items: AtriumContext[];
};

const ATRIUM_TYPES = new Set<FormContextType>(["RELATION", "PROJECT", "WORK_ORDER"]);
const TYPE_SET = new Set<string>(FORM_CONTEXT_TYPES);
const SOURCE_BY_TYPE: Record<FormContextType, Set<string>> = {
  RELATION: new Set(["ATRIUM_READER"]),
  PROJECT: new Set(["ATRIUM_READER"]),
  WORK_ORDER: new Set(["ATRIUM_READER"]),
  INSTALLATION: new Set(["FABRIC_GOLD"]),
  EMPLOYEE: new Set(["EMBER_DIRECTORY"]),
};
const SPECIFICITY: Record<AtriumContextType, number> = {
  RELATION: 1,
  PROJECT: 2,
  WORK_ORDER: 3,
};

function cleanRequired(value: unknown, maximumLength: number, label: string) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error(`${label} ontbreekt`);
  if (clean.length > maximumLength) throw new Error(`${label} is te lang`);
  return clean;
}

export function normalizeSelectedContexts(value: unknown): SelectedFormContext[] {
  if (!Array.isArray(value)) return [];
  if (value.length > FORM_CONTEXT_TYPES.length) throw new Error("te veel contexten geselecteerd");

  const seen = new Set<string>();
  return value.map((item: any) => {
    const context_type = cleanRequired(item?.context_type, 30, "contexttype").toUpperCase() as FormContextType;
    const source_system = cleanRequired(item?.source_system, 30, "bronsysteem").toUpperCase();
    const source_key = cleanRequired(item?.source_key, 450, "contextsleutel");
    if (!TYPE_SET.has(context_type)) throw new Error("ongeldig contexttype");
    if (!SOURCE_BY_TYPE[context_type].has(source_system)) throw new Error("ongeldige bron voor contexttype");
    if (seen.has(context_type)) throw new Error("contexttype is dubbel geselecteerd");
    seen.add(context_type);
    return { context_type, source_system, source_key } as SelectedFormContext;
  });
}

export function selectedAtriumContexts(contexts: SelectedFormContext[]) {
  return contexts.filter((item) => ATRIUM_TYPES.has(item.context_type));
}

function exactBusinessUnit(value: unknown, authorizedBusinessUnit: string) {
  return String(value ?? "").trim().toLocaleLowerCase("nl-NL") === authorizedBusinessUnit.toLocaleLowerCase("nl-NL");
}

function contextIdentity(item: { context_type: string; source_key: string }) {
  return `${item.context_type}:${item.source_key}`;
}

export function reconcileResolvedContexts(
  selected: SelectedFormContext[],
  resolutions: ReaderResolution[],
  allowedTypes: Set<string>,
  authorizedBusinessUnit: string,
): ResolvedFormContext[] {
  const selectedByType = new Map(selected.map((item) => [item.context_type, item]));
  const selectedReader = selectedAtriumContexts(selected);
  if (resolutions.length !== selectedReader.length) throw new Error("live Atrium-validatie is onvolledig");

  for (const resolution of resolutions) {
    const primary = resolution.items.find((item) =>
      item.context_type === resolution.selected.context_type
      && item.source_key === resolution.selected.source_key
    );
    if (!primary) throw new Error("geselecteerde Atriumcontext is gewijzigd of verdwenen");
    if (!exactBusinessUnit(primary.business_unit, authorizedBusinessUnit)) {
      throw new Error("geselecteerde Atriumcontext hoort niet bij de geautoriseerde Business Unit");
    }
    if (resolution.items.some((item) => !exactBusinessUnit(item.business_unit, authorizedBusinessUnit))) {
      throw new Error("live Atrium-resolve bevat een afwijkende Business Unit");
    }
  }

  const authoritative = [...resolutions].sort((left, right) =>
    SPECIFICITY[right.selected.context_type as AtriumContextType]
    - SPECIFICITY[left.selected.context_type as AtriumContextType]
  )[0];
  const authoritativeItems = authoritative?.items ?? [];
  const authoritativeIds = new Set(authoritativeItems.map(contextIdentity));
  for (const item of selectedReader) {
    if (!authoritativeIds.has(contextIdentity(item))) {
      throw new Error("geselecteerde relatie, project en werkbon zijn onderling inconsistent");
    }
  }

  const result: ResolvedFormContext[] = [];
  const addReader = (item: AtriumContext) => {
    if (!allowedTypes.has(item.context_type)) return;
    const selectedItem = selectedByType.get(item.context_type as FormContextType);
    if (selectedItem && selectedItem.source_key !== item.source_key) {
      throw new Error("geselecteerde relatie, project, werkbon of installatie is onderling inconsistent");
    }
    const metadata = {
      ...(item.metadata || {}),
      relation_kind: item.relation_kind ?? null,
      reader_correlation_id: authoritative?.correlationId ?? null,
    };
    result.push({
      context_type: item.context_type as FormContextType,
      source_system: item.source_system,
      business_unit: authorizedBusinessUnit,
      source_key: item.source_key,
      display_code: item.display_code,
      display_label: item.display_label,
      metadata_json: JSON.stringify(metadata),
      source_modified_at: item.source_modified_at,
      last_verified_at: item.last_verified_at,
      verification_status: "VERIFIED",
      derivation_type: selectedItem ? "SELECTED" : "DERIVED",
    });
  };

  for (const type of ["RELATION", "PROJECT", "WORK_ORDER"] as const) {
    const candidates = authoritativeItems.filter((item) => item.context_type === type);
    if (candidates.length > 1) throw new Error(`live Atrium-resolve bevat meerdere ${type}-contexten`);
    if (candidates[0]) addReader(candidates[0]);
  }

  const installationCandidates = authoritativeItems.filter((item) => item.context_type === "INSTALLATION");
  const selectedInstallation = selectedByType.get("INSTALLATION");
  if (selectedInstallation) {
    if (authoritative && !installationCandidates.some((item) => item.source_key === selectedInstallation.source_key)) {
      throw new Error("geselecteerde installatie hoort niet bij de gekozen Atriumcontext");
    }
    result.push({
      context_type: "INSTALLATION",
      source_system: "FABRIC_GOLD",
      business_unit: authorizedBusinessUnit,
      source_key: selectedInstallation.source_key,
      display_code: null,
      display_label: null,
      metadata_json: authoritative ? JSON.stringify({ reader_correlation_id: authoritative.correlationId }) : null,
      source_modified_at: null,
      last_verified_at: authoritative ? new Date().toISOString() : null,
      verification_status: "VERIFIED",
      derivation_type: "SELECTED",
    });
  } else if (allowedTypes.has("INSTALLATION") && installationCandidates.length === 1) {
    const candidate = installationCandidates[0];
    result.push({
      context_type: "INSTALLATION",
      source_system: "FABRIC_GOLD",
      business_unit: authorizedBusinessUnit,
      source_key: candidate.source_key,
      display_code: null,
      display_label: null,
      metadata_json: JSON.stringify({ reader_correlation_id: authoritative?.correlationId ?? null }),
      source_modified_at: candidate.source_modified_at,
      last_verified_at: candidate.last_verified_at,
      verification_status: "VERIFIED",
      derivation_type: "DERIVED",
    });
  }

  const selectedEmployee = selectedByType.get("EMPLOYEE");
  if (selectedEmployee) {
    result.push({
      context_type: "EMPLOYEE",
      source_system: "EMBER_DIRECTORY",
      business_unit: null,
      source_key: selectedEmployee.source_key,
      display_code: null,
      display_label: null,
      metadata_json: null,
      source_modified_at: null,
      last_verified_at: null,
      verification_status: "VERIFIED",
      derivation_type: "SELECTED",
    });
  }

  const deduplicated = new Map<FormContextType, ResolvedFormContext>();
  for (const item of result) {
    const previous = deduplicated.get(item.context_type);
    if (previous && previous.source_key !== item.source_key) throw new Error("contextresolve levert conflicterende contexten");
    deduplicated.set(item.context_type, item);
  }
  return [...deduplicated.values()];
}
