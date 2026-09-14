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
  /* De lange druk is de enige manier om het menu met een vinger te openen. Hij duurt nog
     steeds 550 ms, maar verdraagt sinds 14 september 2026 wat trilling: zonder speling viel
     hij bij twee pixels beweging al weg en bleef de tablet met lege handen achter. */
  assert.match(source, /const LONG_PRESS_MS = 550;/);
  assert.match(source, /const LONG_PRESS_SLOP = 10;/);
  assert.match(source, /window\.setTimeout\(\(\) => \{[\s\S]*?showQuickMenu\(position, triggerElement\);[\s\S]*?\}, LONG_PRESS_MS\)/);
  assert.match(source, /Math\.hypot\(event\.clientX - press\.x, event\.clientY - press\.y\) <= LONG_PRESS_SLOP/);
  // Een tweede vinger is knijpen en dus geen lange druk.
  assert.match(source, /if \(longPressRef\.current\) \{ cancelLongPress\(\); return; \}/);
  // Slepen van een pin rekent nog steeds rechtstreeks vanuit de gebeurtenis.
  assert.match(source, /x_normalized: Math\.min\(1, Math\.max\(0, \(event\.clientX - rect\.left\) \/ rect\.width\)\)/);
  assert.match(source, /y_normalized: Math\.min\(1, Math\.max\(0, \(event\.clientY - rect\.top\) \/ rect\.height\)\)/);
  // en een positie op de tekening komt uit een punt, zodat ook een knop er een kan opvragen.
  assert.match(source, /function positionFromClientPoint\(clientX, clientY\)/);
  assert.match(source, /const normalizedX = Math\.min\(1, Math\.max\(0, \(clientX - rect\.left\) \/ rect\.width\)\);/);
  assert.match(source, /page_number: pageNumber/);
  assert.match(source, /boundaryElement=\{boundaryElement\}/);
  assert.match(source, /setBoundaryElement\(element\)/);
  /* Het menu hangt aan de shell en niet aan de pagina. Stond het in de pinlaag, dan schaalde
     het mee met de zoom (bij 300 procent een ring van 768 pixels) en klemde het tegen de
     pagina in plaats van tegen wat je ziet, waardoor de helft buiten beeld viel en pannen om
     erbij te komen het menu sloot. Vandaar de grens op de shell en het anker in
     shell-coordinaten. */
  assert.match(source, /const connectShellElement = useCallback\(\(element\) => \{[\s\S]*?shellRef\.current = element;[\s\S]*?setBoundaryElement\(element\);/);
  assert.match(source, /anchorPosition=\{quickMenu \? \{ x: quickMenu\.shell_x, y: quickMenu\.shell_y \} : null\}/);
  // En een markering houdt haar maat op het scherm; het anker draait de zoom terug.
  assert.match(source, /const markerScale = zoom > 0 \? 1 \/ zoom : 1;/);
  assert.match(source, /"--drawing-marker-scale": markerScale/);
  assert.match(source, /downloadInstallationDocumentFile\(code, selectedDocumentId\)/);
  /* Het opslaan van een pin liep hier eerst als createDrawingPin(code, selectedDocumentId,
     draft) in dit bestand zelf. Sinds de driedelige beoordelingsronde gaat het via de
     gedeelde savePointDrawing, die zijn afhankelijkheden meekrijgt; het gedrag zelf staat in
     tests/pointEvidence.test.mjs. Wat hier vast moet liggen is dus alleen dat deze tab die
     helper gebruikt en er de echte API-functies en de gekozen tekening in stopt, en niet
     opnieuw zijn eigen schrijfpad krijgt. */
  assert.match(source, /savePointDrawing\(\{/);
  assert.match(source, /createPin: createDrawingPin/);
  assert.match(source, /updatePin: updateDrawingPin/);
  assert.match(source, /documentId: selectedDocumentId/);
  // De snelactie heette eerder quickActionKind en de opvolgactie newFollowUpPin. Beide zijn
  // hernoemd; de test controleerde daarmee namen in plaats van gedrag en viel stil om.
  // Wat werkelijk vast moet liggen is de afbeelding van snelactie naar pinsoort en het
  // bestaan van de opvolgactie vanaf een pin.
  assert.match(source, /pin_kind: kind === "defect" \? "DEFICIENCY"/);
  assert.match(source, /createManualFollowUpForDrawingPin\(code, pin\.drawing_pin_id, draft\)/);
  assert.match(source, /selectedDrawing\?\.is_current_version === false/);
});
