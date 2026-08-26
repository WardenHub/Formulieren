import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSelectedContexts,
  reconcileResolvedContexts,
} from "../src/services/formsHubContext.js";

const verifiedAt = "2026-08-24T10:00:00.000Z";
const relation = {
  context_type: "RELATION" as const,
  source_system: "ATRIUM_READER" as const,
  business_unit: "Wardenburg",
  source_key: "Wardenburg|10",
  display_code: "R10",
  display_label: "Relatie 10",
  metadata: {},
  source_modified_at: verifiedAt,
  last_verified_at: verifiedAt,
  verification_status: "VERIFIED" as const,
  relation_kind: "ATRIUM_RELATION",
};
const project = {
  ...relation,
  context_type: "PROJECT" as const,
  source_key: "Wardenburg|20",
  display_code: "WB20",
  display_label: "Project 20",
  relation_kind: "ATRIUM_PROJECT",
};
const workOrder = {
  ...relation,
  context_type: "WORK_ORDER" as const,
  source_key: "Wardenburg|30",
  display_code: "W30",
  display_label: "Werkbon 30",
  relation_kind: null,
};
const installation = {
  ...relation,
  context_type: "INSTALLATION" as const,
  source_system: "FABRIC_GOLD" as const,
  source_key: "I40",
  display_code: "I40",
  display_label: "Installatie 40",
  relation_kind: "ATRIUM_INSTALLATION",
};

test("normalisatie accepteert uitsluitend de vaste bron per contexttype", () => {
  assert.throws(() => normalizeSelectedContexts([
    { context_type: "WORK_ORDER", source_system: "FABRIC_GOLD", source_key: "Wardenburg|30" },
  ]), /ongeldige bron/);
});

test("een algemeen formulier zonder context blijft ondersteund", () => {
  const selected = normalizeSelectedContexts([]);
  assert.deepEqual(
    reconcileResolvedContexts(selected, [], new Set(), ""),
    []
  );
});

test("verdwenen stable key wordt geweigerd", () => {
  const selected = normalizeSelectedContexts([
    { context_type: "WORK_ORDER", source_system: "ATRIUM_READER", source_key: "Wardenburg|999" },
  ]);
  assert.throws(() => reconcileResolvedContexts(selected, [{
    selected: selected[0],
    correlationId: "corr-1",
    items: [workOrder],
  }], new Set(["WORK_ORDER"]), "Wardenburg"), /gewijzigd of verdwenen/);
});

test("inconsistente relatie en werkbon worden geweigerd", () => {
  const selected = normalizeSelectedContexts([
    { context_type: "RELATION", source_system: "ATRIUM_READER", source_key: "Wardenburg|99" },
    { context_type: "WORK_ORDER", source_system: "ATRIUM_READER", source_key: "Wardenburg|30" },
  ]);
  const wrongRelation = { ...relation, source_key: "Wardenburg|99" };
  assert.throws(() => reconcileResolvedContexts(selected, [
    { selected: selected[0], correlationId: "corr-r", items: [wrongRelation] },
    { selected: selected[1], correlationId: "corr-w", items: [workOrder, relation] },
  ], new Set(["RELATION", "WORK_ORDER"]), "Wardenburg"), /onderling inconsistent/);
});

test("werkbonresolve levert gecontroleerde snapshots en Reader-correlatie", () => {
  const selected = normalizeSelectedContexts([
    { context_type: "WORK_ORDER", source_system: "ATRIUM_READER", source_key: "Wardenburg|30" },
  ]);
  const resolved = reconcileResolvedContexts(selected, [{
    selected: selected[0],
    correlationId: "corr-workorder",
    items: [workOrder, project, relation, installation],
  }], new Set(["RELATION", "PROJECT", "WORK_ORDER", "INSTALLATION"]), "Wardenburg");

  assert.deepEqual(resolved.map((item) => item.context_type), ["RELATION", "PROJECT", "WORK_ORDER", "INSTALLATION"]);
  assert.equal(resolved.find((item) => item.context_type === "WORK_ORDER")?.derivation_type, "SELECTED");
  assert.equal(resolved.find((item) => item.context_type === "PROJECT")?.derivation_type, "DERIVED");
  assert.match(resolved.find((item) => item.context_type === "RELATION")?.metadata_json || "", /corr-workorder/);
});

test("een installatie buiten de gekozen werkbon wordt geweigerd", () => {
  const selected = normalizeSelectedContexts([
    { context_type: "WORK_ORDER", source_system: "ATRIUM_READER", source_key: "Wardenburg|30" },
    { context_type: "INSTALLATION", source_system: "FABRIC_GOLD", source_key: "I99" },
  ]);
  assert.throws(() => reconcileResolvedContexts(selected, [{
    selected: selected[0],
    correlationId: "corr-2",
    items: [workOrder, installation],
  }], new Set(["WORK_ORDER", "INSTALLATION"]), "Wardenburg"), /hoort niet bij/);
});
