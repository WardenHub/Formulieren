// De tijdelijke vinkjes op de tekening. Ze staan bewust alleen op het toestel, dus de enige
// plek waar iets mis kan gaan is het lezen en schrijven zelf. Dit legt vast dat rommel in de
// opslag het formulier nooit kan breken, en dat wissen ook echt wist.

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

// Een minimale localStorage, want node heeft er geen.
const opslag = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (opslag.has(key) ? opslag.get(key) : null),
    setItem: (key, value) => opslag.set(key, String(value)),
    removeItem: (key) => opslag.delete(key),
  },
};

const {
  buildCheckedPointsKey,
  clearCheckedPoints,
  normalizeCheckedPoint,
  readCheckedPoints,
  saveCheckedPoints,
} = await import("../src/pages/Forms/shared/checkedPoints.js");

beforeEach(() => opslag.clear());

test("een sleutel hoort bij een instantie, en zonder instantie is er geen sleutel", () => {
  assert.equal(buildCheckedPointsKey("abc"), "ember.formrunner.checked-points.abc");
  assert.equal(buildCheckedPointsKey(""), "");
  assert.equal(buildCheckedPointsKey(null), "");
});

test("bewaren en teruglezen levert dezelfde punten op", () => {
  saveCheckedPoints("abc", [{ id: "1", documentId: "doc", page: 2, x: 0.25, y: 0.75 }]);
  const terug = readCheckedPoints("abc");

  assert.equal(terug.length, 1);
  assert.deepEqual(
    { ...terug[0] },
    { id: "1", documentId: "doc", page: 2, x: 0.25, y: 0.75 }
  );
});

test("punten buiten de tekening worden geweigerd", () => {
  // De coördinaten zijn genormaliseerd; alles buiten 0 tot 1 kan niet van deze pagina komen.
  assert.equal(normalizeCheckedPoint({ x: 1.4, y: 0.5 }), null);
  assert.equal(normalizeCheckedPoint({ x: -0.1, y: 0.5 }), null);
  assert.equal(normalizeCheckedPoint({ x: 0.5 }), null);
  assert.equal(normalizeCheckedPoint({}), null);
});

test("een punt zonder pagina belandt op pagina 1", () => {
  assert.equal(normalizeCheckedPoint({ x: 0.5, y: 0.5 }).page, 1);
  assert.equal(normalizeCheckedPoint({ x: 0.5, y: 0.5, page: 0 }).page, 1);
  assert.equal(normalizeCheckedPoint({ x: 0.5, y: 0.5, page: 3 }).page, 3);
});

test("rommel in de opslag levert een lege lijst op en geen fout", () => {
  opslag.set("ember.formrunner.checked-points.abc", "{niet eens json");
  assert.deepEqual(readCheckedPoints("abc"), []);

  opslag.set("ember.formrunner.checked-points.abc", JSON.stringify({ geen: "lijst" }));
  assert.deepEqual(readCheckedPoints("abc"), []);

  opslag.set("ember.formrunner.checked-points.abc", JSON.stringify([{ x: 9, y: 9 }, { x: 0.2, y: 0.2 }]));
  assert.equal(readCheckedPoints("abc").length, 1);
});

test("een lege lijst bewaren haalt de sleutel weg in plaats van hem leeg te laten staan", () => {
  saveCheckedPoints("abc", [{ x: 0.1, y: 0.1 }]);
  assert.equal(opslag.size, 1);

  saveCheckedPoints("abc", []);
  assert.equal(opslag.size, 0);
});

test("wissen laat niets achter", () => {
  saveCheckedPoints("abc", [{ x: 0.1, y: 0.1 }]);
  clearCheckedPoints("abc");

  assert.deepEqual(readCheckedPoints("abc"), []);
  assert.equal(opslag.size, 0);
});

test("een opslag die niets mag bewaren breekt niets", () => {
  const origineel = globalThis.window.localStorage.setItem;
  globalThis.window.localStorage.setItem = () => {
    throw new Error("quota");
  };

  assert.equal(saveCheckedPoints("abc", [{ x: 0.1, y: 0.1 }]), false);
  assert.deepEqual(readCheckedPoints("abc"), []);

  globalThis.window.localStorage.setItem = origineel;
});
