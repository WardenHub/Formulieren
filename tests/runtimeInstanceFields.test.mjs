// tests/runtimeInstanceFields.test.mjs
//
// buildRuntimeMergedData schreef documentnummer altijd mee, ook bij een formulier waarvan
// de definitie die vraag niet kent. Zo kwamen er antwoorden zonder vraag in answers_json
// terecht; onzichtbaar in het rapport en bij elke opslag opnieuw meegeschreven.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/pages/Forms/shared/runtimeBuilder.jsx", import.meta.url),
  "utf8"
);

test("documentnummer wordt alleen gevuld als de definitie die vraag kent", () => {
  // De samenvoeging voor de runtime controleert nu of de vraag bestaat.
  assert.match(source, /const hasDocumentnummerQuestion = Boolean\(model\?\.getQuestionByName\?\.\("documentnummer"\)\)/);
  assert.match(source, /if \(hasDocumentnummerQuestion && documentnummer !== null\) \{\s*mergedData\.documentnummer = documentnummer;/);

  // En er blijft geen onvoorwaardelijke variant achter.
  assert.doesNotMatch(source, /if \(documentnummer !== null\) \{\s*mergedData\.documentnummer = documentnummer;/);
});

test("applyRuntimeInstanceFields blijft dezelfde grens gebruiken", () => {
  assert.match(source, /if \(documentnummerQuestion && documentnummer !== null\) \{\s*model\.setValue\("documentnummer", documentnummer\);/);
});
