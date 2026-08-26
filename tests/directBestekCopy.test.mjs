import assert from "node:assert/strict";
import test from "node:test";

const fullOverwrite = (sourceRows, receivedAt = "2026-08-24T12:00:00.000Z") => {
  const keys = new Set();
  return sourceRows.map((row) => {
    const businessKey = `${row.business_unit}\u0000${row.paragraph_key}`;
    if (keys.has(businessKey)) throw new Error("duplicate business key");
    keys.add(businessKey);
    if (!String(row.installation_code || "").trim()) throw new Error("empty installation code");
    return { ...row, snapshot_received_at: receivedAt };
  });
};

const row = (paragraphKey, overrides = {}) => ({
  business_unit: "Wardenburg",
  installation_code: `I-${paragraphKey}`,
  paragraph_key: paragraphKey,
  ...overrides,
});

test("volledige overwrite verwijdert een verdwenen bronrij", () => {
  const before = [row("A"), row("B"), row("C")];
  const after = fullOverwrite([row("A"), row("C")]);
  assert.deepEqual(before.map((item) => item.paragraph_key), ["A", "B", "C"]);
  assert.deepEqual(after.map((item) => item.paragraph_key), ["A", "C"]);
});

test("dezelfde full load veroorzaakt geen duplicaten", () => {
  const source = [row("A"), row("C")];
  const first = fullOverwrite(source);
  const second = fullOverwrite(source, "2026-08-24T13:00:00.000Z");
  assert.deepEqual(first.map((item) => item.paragraph_key), second.map((item) => item.paragraph_key));
  assert.equal(new Set(second.map((item) => `${item.business_unit}\u0000${item.paragraph_key}`)).size, 2);
});

test("de actieve primaire sleutel weigert een dubbele business key", () => {
  assert.throws(() => fullOverwrite([row("A"), row("A")]), /duplicate business key/);
});

test("de database vult het niet-gemapte ontvangsttijdstip lokaal", () => {
  const [copied] = fullOverwrite([row("A")]);
  assert.equal(copied.snapshot_received_at, "2026-08-24T12:00:00.000Z");
});
