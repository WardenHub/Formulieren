// De twee helften van de terugweg moeten elkaar begrijpen.
//
// Ember Offline bouwt het document, deze API leest het. Die twee staan in verschillende
// projecten en worden door verschillende mensen aangeraakt; zonder een test die ze naast
// elkaar legt, merk je drift pas wanneer een monteur zijn werk niet kwijt kan. Daarom
// importeert deze test bewust over de projectgrens heen, net als calculationFields.test.ts.

import assert from "node:assert/strict";
import test from "node:test";

// Bewust het echte bestand uit de offline app.
import {
  OFFLINE_RETURN_SCHEMA as APP_SCHEMA,
  buildOfflineReturnDocument,
  resolveClientSyncId,
} from "../../offline/src/lib/offlineSyncDocument.js";

import {
  OFFLINE_RETURN_SCHEMA,
  parseOfflineReturnDocument,
} from "../src/services/offlineSyncService.js";

function lokaalItem(extra: any = {}) {
  return {
    id: "001065::4211",
    summary: { installation_code: "001065", form_instance_id: 4211 },
    package_data: {
      installation: { atrium_installation_code: "001065" },
      form_instance: {
        form_instance_id: 4211,
        form_code: "MAINT_BMI",
        version_label: "3.0",
        draft_rev: 7,
        status: "CONCEPT",
      },
      generated_by: { display_name: "Jesse Veentjer" },
    },
    local_runtime: {
      answers_json: { monteur: "Piet de Vries", centrale_schoon: true },
      last_local_saved_at: "2026-09-12T11:44:16.336Z",
      client_sync_id: "sync-abc",
    },
    ...extra,
  };
}

test("app en api gebruiken hetzelfde schema", () => {
  assert.equal(APP_SCHEMA, OFFLINE_RETURN_SCHEMA);
});

test("wat de app bouwt komt door de controle van de api", () => {
  const document = buildOfflineReturnDocument(lokaalItem());
  const gelezen = parseOfflineReturnDocument(document);

  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.atrium_installation_code, "001065");
  assert.equal(gelezen.document?.form_instance_id, 4211);
  assert.deepEqual(gelezen.document?.answers_json, {
    monteur: "Piet de Vries",
    centrale_schoon: true,
  });
});

test("de verwachte revisie komt uit het pakket en niet uit de app", () => {
  // Hierop controleert de server of er online intussen iets veranderd is. Zou de app zelf
  // een revisie verzinnen, dan is die controle waardeloos.
  const document = buildOfflineReturnDocument(lokaalItem());
  assert.equal(document.instance.expected_draft_rev, 7);

  const gelezen = parseOfflineReturnDocument(document);
  assert.equal(gelezen.document?.expected_draft_rev, 7);
});

test("revisie nul is een geldige verwachting", () => {
  const item = lokaalItem();
  item.package_data.form_instance.draft_rev = 0;

  const gelezen = parseOfflineReturnDocument(buildOfflineReturnDocument(item));
  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.expected_draft_rev, 0);
});

test("een pakket zonder revisie wordt geweigerd in plaats van als nul gelezen", () => {
  const item = lokaalItem();
  delete item.package_data.form_instance.draft_rev;

  const gelezen = parseOfflineReturnDocument(buildOfflineReturnDocument(item));
  assert.equal(gelezen.ok, false);
  assert.match(String(gelezen.error), /expected_draft_rev/i);
});

test("lege antwoorden mogen; dat is een concept dat nog niets bevat", () => {
  const item = lokaalItem();
  item.local_runtime.answers_json = {};

  const gelezen = parseOfflineReturnDocument(buildOfflineReturnDocument(item));
  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.deepEqual(gelezen.document?.answers_json, {});
});

test("de synchronisatiesleutel blijft gelijk bij een herhaalde poging", () => {
  // Hierop rust de idempotentie aan de serverkant; een nieuwe sleutel per poging zou
  // betekenen dat een tweede verzending alles opnieuw aanmaakt.
  const item = lokaalItem();

  assert.equal(resolveClientSyncId(item), "sync-abc");
  assert.equal(buildOfflineReturnDocument(item).sync.client_sync_id, "sync-abc");
  assert.equal(
    buildOfflineReturnDocument(item).sync.client_sync_id,
    buildOfflineReturnDocument(item).sync.client_sync_id
  );
});

test("zonder opgeslagen sleutel verzint de app er een, en die is bruikbaar", () => {
  const item = lokaalItem();
  delete item.local_runtime.client_sync_id;

  const eerste = resolveClientSyncId(item);
  assert.ok(eerste.length > 0);

  const gelezen = parseOfflineReturnDocument(buildOfflineReturnDocument(item, { clientSyncId: eerste }));
  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.client_sync_id, eerste);
});

test("zonder punten in het veld blijft de lijst leeg", () => {
  const document = buildOfflineReturnDocument(lokaalItem());

  assert.deepEqual(document.field_work.manual_points, []);
  assert.equal(parseOfflineReturnDocument(document).ok, true);
});

test("punten uit het veld reizen mee en komen door de controle", () => {
  const item = lokaalItem();
  item.local_runtime.manual_points = [
    {
      local_id: "p-1",
      title: "Melder ruimte 12 reageert niet",
      description: "Bij test geen signaal.",
      priority: "HIGH",
    },
  ];

  const document = buildOfflineReturnDocument(item);
  const gelezen = parseOfflineReturnDocument(document);

  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.manual_points.length, 1);
  assert.equal(gelezen.document?.manual_points[0].local_id, "p-1");
  assert.equal(gelezen.document?.manual_points[0].priority, "HIGH");
});

test("een punt zonder titel of zonder lokaal id gaat er aan de clientkant al uit", () => {
  // De server zou zo'n punt weigeren, en daarmee de hele verzending. Werk dat wel klopt mag
  // niet stranden op een half ingevulde regel die de monteur zelf heeft laten staan.
  const item = lokaalItem();
  item.local_runtime.manual_points = [
    { local_id: "p-1", title: "   " },
    { local_id: "", title: "geen id" },
    { local_id: "p-2", title: "deze klopt" },
  ];

  const gelezen = parseOfflineReturnDocument(buildOfflineReturnDocument(item));

  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.manual_points.length, 1);
  assert.equal(gelezen.document?.manual_points[0].title, "deze klopt");
});

test("het lokale id blijft de sleutel waarop de server herhaling herkent", () => {
  const item = lokaalItem();
  item.local_runtime.manual_points = [{ local_id: "p-9", title: "Accu vervangen" }];

  const eerste = buildOfflineReturnDocument(item);
  const tweede = buildOfflineReturnDocument(item);

  assert.equal(eerste.field_work.manual_points[0].local_id, tweede.field_work.manual_points[0].local_id);
});

test("de definitieversie uit het pakket reist mee terug", () => {
  // Hierop controleert de server of de vragen zelf niet zijn veranderd. Zonder deze waarde
  // zou een formulier dat online een nieuwe versie kreeg stil op de oude sleutels landen.
  const item = lokaalItem();
  item.package_data.form_instance.form_version_id = "6f1b2c44-0000-4000-8000-000000000001";

  const document = buildOfflineReturnDocument(item);
  assert.equal(document.form.form_version_id, "6f1b2c44-0000-4000-8000-000000000001");

  const gelezen = parseOfflineReturnDocument(document);
  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.expected_form_version_id, "6f1b2c44-0000-4000-8000-000000000001");
});

test("een ouder pakket zonder versie wordt gewoon aangenomen", () => {
  // Pakketten van voor package_version 0.2 kennen die versie niet; die mogen niet stranden.
  const gelezen = parseOfflineReturnDocument(buildOfflineReturnDocument(lokaalItem()));

  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.expected_form_version_id, null);
});

test("een plek op de tekening reist mee zonder de lokale bijnaam", () => {
  // De titel van de tekening staat er op het apparaat bij om te tonen; op kantoor is het
  // document zelf de waarheid, dus die tekst hoort niet mee terug.
  const item = lokaalItem();
  item.local_runtime.manual_points = [
    {
      local_id: "p-1",
      title: "Melder ruimte 12",
      pin: {
        document_id: "11111111-2222-3333-4444-555555555555",
        document_title: "Plattegrond begane grond",
        page_number: 2,
        x_normalized: 0.245833,
        y_normalized: 0.74411,
      },
    },
  ];

  const document = buildOfflineReturnDocument(item);
  const pin = document.field_work.manual_points[0].pin;

  assert.deepEqual(pin, {
    document_id: "11111111-2222-3333-4444-555555555555",
    page_number: 2,
    x_normalized: 0.245833,
    y_normalized: 0.74411,
  });

  const gelezen = parseOfflineReturnDocument(document);
  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.manual_points[0].pin?.page_number, 2);
});

test("een punt zonder plek op de tekening heeft gewoon geen pin", () => {
  const item = lokaalItem();
  item.local_runtime.manual_points = [{ local_id: "p-1", title: "Melder ruimte 12" }];

  const gelezen = parseOfflineReturnDocument(buildOfflineReturnDocument(item));
  assert.equal(gelezen.ok, true, gelezen.ok ? "" : gelezen.error);
  assert.equal(gelezen.document?.manual_points[0].pin, null);
});

test("een plek buiten de tekening wordt geweigerd in plaats van rechtgetrokken", () => {
  // Rechttrekken zou een pin op de rand zetten alsof dat de bedoeling was; beter is dat de
  // monteur het merkt terwijl hij er nog bij staat.
  const gelezen = parseOfflineReturnDocument({
    schema: OFFLINE_RETURN_SCHEMA,
    installation: { atrium_installation_code: "001065" },
    instance: { form_instance_id: 4211, expected_draft_rev: 1 },
    payload: { answers_json: {} },
    sync: { client_sync_id: "sync-1" },
    field_work: {
      manual_points: [
        {
          local_id: "p-1",
          title: "Buiten beeld",
          pin: {
            document_id: "11111111-2222-3333-4444-555555555555",
            page_number: 1,
            x_normalized: 1.4,
            y_normalized: 0.5,
          },
        },
      ],
    },
  });

  assert.equal(gelezen.ok, false);
  assert.match(String(gelezen.error), /buiten de tekening/i);
});

test("een pin zonder tekening of zonder pagina wordt geweigerd", () => {
  const basis = {
    schema: OFFLINE_RETURN_SCHEMA,
    installation: { atrium_installation_code: "001065" },
    instance: { form_instance_id: 4211, expected_draft_rev: 1 },
    payload: { answers_json: {} },
    sync: { client_sync_id: "sync-1" },
  };

  const zonderDocument = parseOfflineReturnDocument({
    ...basis,
    field_work: {
      manual_points: [
        { local_id: "p-1", title: "Punt", pin: { page_number: 1, x_normalized: 0.5, y_normalized: 0.5 } },
      ],
    },
  });
  assert.equal(zonderDocument.ok, false);
  assert.match(String(zonderDocument.error), /document_id/);

  const zonderPagina = parseOfflineReturnDocument({
    ...basis,
    field_work: {
      manual_points: [
        {
          local_id: "p-1",
          title: "Punt",
          pin: { document_id: "11111111-2222-3333-4444-555555555555", page_number: 0, x_normalized: 0.5, y_normalized: 0.5 },
        },
      ],
    },
  });
  assert.equal(zonderPagina.ok, false);
  assert.match(String(zonderPagina.error), /page_number/);
});
