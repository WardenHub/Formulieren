import test from "node:test";
import assert from "node:assert/strict";
import { addPointToDocumentLinks, findCreatedPointDocument, savePointDrawing } from "../src/pages/Forms/shared/pointEvidence.js";

test("koppelen bewaart andere punten en het bestaande primaire bewijs", () => {
  const before = [{ follow_up_action_id: "A", is_primary: 1 }, { follow_up_action_id: "B", is_primary: 0 }];
  const result = addPointToDocumentLinks(before, "C");
  assert.deepEqual(result, [{ follow_up_action_id: "A", is_primary: true }, { follow_up_action_id: "B", is_primary: false }, { follow_up_action_id: "C", is_primary: false }]);
  assert.equal(before.length, 2);
  assert.deepEqual(addPointToDocumentLinks(result, "a"), result);
});

test("upload kiest nooit een oudere lege documentregel", () => {
  const before = [{ form_instance_document_id: "OLD", file_name: null }];
  const created = { form_instance_document_id: "NEW", file_name: null };
  assert.equal(findCreatedPointDocument(before, [...before, created]), created);
  assert.throws(() => findCreatedPointDocument(before, before), /niet eenduidig/);
  assert.throws(() => findCreatedPointDocument(before, [created, { form_instance_document_id: "OTHER" }]), /niet eenduidig/);
});

test("na een koppelstoring gebruikt opnieuw opslaan dezelfde pin en rowversion", async () => {
  let draft = { label: "Tekortkoming", page_number: 2, x_normalized: 0.25, y_normalized: 0.75 };
  let creates = 0;
  let updates = 0;
  let links = 0;
  const options = {
    code: "01", documentId: "EXACT-PDF", actionId: "POINT",
    createPin: async (code, document, payload) => {
      creates += 1;
      assert.equal(document, "EXACT-PDF");
      return { pin: { ...payload, drawing_pin_id: "PIN", row_version: "0x01" } };
    },
    updatePin: async (code, id, payload) => {
      updates += 1;
      assert.equal(id, "PIN");
      assert.equal(payload.row_version, "0x01");
      return { pin: { ...payload, row_version: "0x02" } };
    },
    linkPin: async (code, id, point) => {
      links += 1;
      assert.equal(id, "PIN");
      assert.equal(point, "POINT");
      if (links === 1) throw new Error("tijdelijke koppelstoring");
    },
    onSaved: (pin) => { draft = pin; },
  };
  await assert.rejects(savePointDrawing({ ...options, draft }), /koppelstoring/);
  assert.equal(draft.drawing_pin_id, "PIN");
  const saved = await savePointDrawing({ ...options, draft });
  assert.equal(saved.row_version, "0x02");
  assert.deepEqual([creates, updates, links], [1, 1, 2]);
});

test("mislukte opslag koppelt niets en meldt geen succes", async () => {
  let sideEffects = 0;
  await assert.rejects(savePointDrawing({
    draft: {}, code: "01", documentId: "PDF", actionId: "POINT",
    createPin: async () => { throw new Error("opslaan mislukt"); },
    linkPin: async () => { sideEffects += 1; }, onSaved: () => { sideEffects += 1; },
  }), /opslaan mislukt/);
  assert.equal(sideEffects, 0);
});

test("opslaan zonder opvolgcontext blijft een gewone pinbewerking", async () => {
  const pin = { drawing_pin_id: "PIN", page_number: 4 };
  const result = await savePointDrawing({ draft: pin, updatePin: async () => ({ pin }), onSaved: () => {}, linkPin: () => { assert.fail("geen koppeling verwacht"); } });
  assert.equal(result, pin);
});
