import assert from "node:assert/strict";
import test from "node:test";
import {
  MINIMUM_CONTEXT_SEARCH_LENGTH,
  applyUnambiguousDerivedContexts,
  groupDerivedContexts,
  resetForPrimaryContext,
} from "../src/pages/Forms/formsHubContextState.js";

test("zoeklengte is drie tekens", () => {
  assert.equal(MINIMUM_CONTEXT_SEARCH_LENGTH, 3);
});

test("wisselen van hoofdcontext wist oude afgeleide keuzes", () => {
  const current = {
    WORK_ORDER: { source_key: "Wardenburg|1" },
    RELATION: { source_key: "Wardenburg|2", derivation_type: "DERIVED" },
    PROJECT: { source_key: "Wardenburg|3", derivation_type: "DERIVED" },
    INSTALLATION: { source_key: "I4", derivation_type: "DERIVED" },
    EMPLOYEE: { source_key: "user-5" },
  };
  const next = resetForPrimaryContext(current, "WORK_ORDER", { source_key: "Wardenburg|6" });
  assert.deepEqual(Object.keys(next).sort(), ["EMPLOYEE", "WORK_ORDER"]);
  assert.equal(next.WORK_ORDER.source_key, "Wardenburg|6");
});

test("één live afgeleide kandidaat wordt automatisch geselecteerd", () => {
  const grouped = groupDerivedContexts([
    { context_type: "WORK_ORDER", source_key: "Wardenburg|1" },
    { context_type: "RELATION", source_key: "Wardenburg|2" },
  ], new Set(["WORK_ORDER", "RELATION"]), "WORK_ORDER", "Wardenburg|1");
  const selected = applyUnambiguousDerivedContexts({ WORK_ORDER: { source_key: "Wardenburg|1" } }, grouped);
  assert.equal(selected.RELATION.source_key, "Wardenburg|2");
  assert.equal(selected.RELATION.derivation_type, "DERIVED");
});
