import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_ROOT_ACTIONS,
  ROOT_MENU_ID,
  actionsForMenu,
  clampRadialMenuCenter,
  findParentMenuId,
  menuMetrics,
  prepareRootActions,
  splitRadialLabel,
} from "../src/components/radial/radialActionMenuModel.js";

const actions = [
  { id: "pin", label: "Pin" },
  { id: "note", label: "Opmerking" },
  { id: "defect", label: "Tekortkoming" },
];

test("toont de drie DrawingPin-rootacties zonder geometrieconfiguratie", () => {
  assert.deepEqual(actionsForMenu(actions).map((action) => action.id), ["pin", "note", "defect"]);
  assert.deepEqual(menuMetrics(false, { width: 900, height: 600 }), {
    innerRadius: 52,
    outerRadius: 128,
    boundaryPadding: 10,
  });
});

test("een vierde actie verandert alleen de actionconfig", () => {
  const fourActions = [...actions, { id: "info", label: "Informatie" }];
  assert.equal(actionsForMenu(fourActions).length, 4);
  assert.deepEqual(
    menuMetrics(false, { width: 900, height: 600 }),
    menuMetrics(false, { width: 900, height: 600 }),
  );
});

test("meer dan zes rootacties worden in een Meer-submenu gegroepeerd", () => {
  const manyActions = Array.from({ length: 8 }, (_, index) => ({
    id: `action-${index + 1}`,
    label: `Actie ${index + 1}`,
  }));
  const prepared = prepareRootActions(manyActions);
  assert.equal(prepared.length, MAX_ROOT_ACTIONS);
  assert.equal(prepared.at(-1).id, "__more__");
  assert.equal(prepared.at(-1).children.length, 3);
  assert.deepEqual(
    actionsForMenu(prepared, "__more__").map((action) => action.id),
    ["action-6", "action-7", "action-8"],
  );
  assert.equal(findParentMenuId(prepared, "__more__"), ROOT_MENU_ID);
});

test("submenu's hebben een eenduidige terugroute", () => {
  const nested = [
    ...actions,
    {
      id: "more",
      label: "Meer",
      children: [
        { id: "edit", label: "Bewerken" },
        {
          id: "status",
          label: "Status",
          children: [
            { id: "open", label: "Open" },
            { id: "done", label: "Afgerond" },
          ],
        },
      ],
    },
  ];
  assert.equal(findParentMenuId(nested, "more"), ROOT_MENU_ID);
  assert.equal(findParentMenuId(nested, "status"), "more");
  assert.deepEqual(actionsForMenu(nested, "status").map((action) => action.id), ["open", "done"]);
});

test("het menu-center blijft binnen midden, randen en hoeken", () => {
  const size = { width: 900, height: 600 };
  const radius = 128;
  assert.deepEqual(clampRadialMenuCenter({ x: 450, y: 300 }, size, radius), { x: 450, y: 300 });
  assert.deepEqual(clampRadialMenuCenter({ x: 0, y: 0 }, size, radius), { x: 138, y: 138 });
  assert.deepEqual(clampRadialMenuCenter({ x: 900, y: 600 }, size, radius), { x: 762, y: 462 });
  assert.deepEqual(clampRadialMenuCenter({ x: 900, y: 0 }, size, radius), { x: 762, y: 138 });
  assert.deepEqual(clampRadialMenuCenter({ x: 0, y: 600 }, size, radius), { x: 138, y: 462 });
});

test("lange labels worden binnen het segment over twee regels verdeeld", () => {
  assert.deepEqual(splitRadialLabel("Pin"), ["Pin"]);
  assert.deepEqual(splitRadialLabel("Tekortkoming"), ["Tekort", "koming"]);
  assert.deepEqual(splitRadialLabel("Status wijzigen"), ["Status", "wijzigen"]);
});

test("light, dark en system volgen de bestaande Ember-profielvoorkeur live", async () => {
  class TestMediaQuery extends EventTarget {
    constructor(matches) {
      super();
      this.matches = matches;
    }

    setMatches(matches) {
      this.matches = matches;
      this.dispatchEvent(new Event("change"));
    }
  }

  const mediaQuery = new TestMediaQuery(true);
  const browserWindow = new EventTarget();
  browserWindow.matchMedia = () => mediaQuery;
  globalThis.window = browserWindow;
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };

  const appearance = await import(`../src/theme/appearance.js?test=${Date.now()}`);
  assert.equal(appearance.applyAppearancePreference("light").effective, "light");
  assert.equal(appearance.applyAppearancePreference("dark").effective, "dark");
  assert.equal(appearance.applyAppearancePreference("system").effective, "light");

  const stopWatching = appearance.watchSystemAppearancePreference();
  mediaQuery.setMatches(false);
  assert.equal(document.documentElement.dataset.appearance, "dark");
  stopWatching();

  delete globalThis.localStorage;
  delete globalThis.document;
  delete globalThis.window;
});

test("de bestaande DrawingPin-interactie en versiecontracten blijven aangesloten", async () => {
  const source = await readFile(
    new URL("../src/pages/Installations/DrawingPinsTab.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /onContextMenu=\{openQuickMenu\}/);
  assert.match(source, /event\.pointerType === "mouse" \|\| readOnly \|\| placing/);
  assert.match(source, /window\.setTimeout\(\(\) => \{[\s\S]*?showQuickMenu\(position, triggerElement\);[\s\S]*?\}, 550\)/);
  assert.match(source, /x_normalized: Math\.min\(1, Math\.max\(0, \(event\.clientX - rect\.left\) \/ rect\.width\)\)/);
  assert.match(source, /y_normalized: Math\.min\(1, Math\.max\(0, \(event\.clientY - rect\.top\) \/ rect\.height\)\)/);
  assert.match(source, /page_number: pageNumber/);
  assert.match(source, /boundaryElement=\{boundaryElement\}/);
  assert.match(source, /setBoundaryElement\(element\)/);
  assert.match(source, /downloadInstallationDocumentFile\(code, selectedDocumentId\)/);
  assert.match(source, /createDrawingPin\(code, selectedDocumentId, draft\)/);
  assert.match(source, /quickActionKind === "defect"/);
  assert.match(source, /newFollowUpPin/);
  assert.match(source, /selectedDrawing\?\.is_current_version === false/);
});
