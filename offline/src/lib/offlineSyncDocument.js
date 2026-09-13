/* Het document dat Ember Offline terugstuurt.
 *
 * Eén contract, ember.form.answerfile.v2, gelezen door
 * api/src/services/offlineSyncService.ts. Die dienst geeft de antwoorden door aan
 * saveFormAnswers, dezelfde functie als de online runner, zodat de verdere verwerking van
 * een offline ingevuld formulier identiek is aan die van een online ingevuld formulier:
 * dezelfde revisiecontrole, dezelfde sleutelcontrole, dezelfde serverberekening en dezelfde
 * afgeleide opvolgpunten. De app rondt dus niets af; hij brengt het werk thuis en daarna
 * loopt het formulier de gewone weg.
 */

export const OFFLINE_RETURN_SCHEMA = "ember.form.answerfile.v2";

function tekst(waarde) {
  return waarde === null || waarde === undefined ? "" : String(waarde).trim();
}

/* De sleutel waarmee de server herhaalde pogingen herkent. Hij moet dus per apparaat en per
   pakket hetzelfde blijven zolang dat pakket bestaat; een nieuwe sleutel bij elke poging zou
   betekenen dat een tweede verzending alles nog eens aanmaakt. */
export function resolveClientSyncId(item) {
  const bestaand = tekst(item?.local_runtime?.client_sync_id);
  if (bestaand) return bestaand;

  const nieuw =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${tekst(item?.id) || "pakket"}-${Date.now()}`;

  return nieuw;
}

/* De plek op de tekening, als die is aangewezen.
   Alleen de vier velden die de server nodig heeft; de titel van de tekening staat er lokaal
   bij om te tonen, maar op kantoor is het document zelf de waarheid. */
function bouwPin(pin) {
  if (!pin) return null;

  const documentId = tekst(pin.document_id);
  const pagina = Number(pin.page_number);
  const x = Number(pin.x_normalized);
  const y = Number(pin.y_normalized);

  if (!documentId || !Number.isFinite(pagina) || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    document_id: documentId,
    page_number: Math.max(1, Math.round(pagina)),
    x_normalized: Math.min(Math.max(x, 0), 1),
    y_normalized: Math.min(Math.max(y, 0), 1),
  };
}

/* De punten die in het veld zijn opgeschreven.
   Het lokale id is de sleutel waarmee de server een herhaalde poging herkent; zonder titel
   is een punt niets, dus die rijen gaan er hier al uit in plaats van de hele verzending te
   laten stranden op een leeg punt. */
function bouwHandmatigePunten(item) {
  const ruw = item?.local_runtime?.manual_points;
  if (!Array.isArray(ruw)) return [];

  return ruw
    .filter((punt) => punt && tekst(punt.local_id) && tekst(punt.title))
    .map((punt) => ({
      local_id: tekst(punt.local_id),
      title: tekst(punt.title),
      description: tekst(punt.description) || null,
      category: tekst(punt.category) || null,
      priority: tekst(punt.priority) || "NORMAL",
      source_question_name: tekst(punt.source_question_name) || null,
      pin: bouwPin(punt.pin),
    }));
}

export function buildOfflineReturnDocument(item, { clientSyncId } = {}) {
  const pakket = item?.package_data || {};
  const instance = pakket.form_instance || {};

  const code =
    tekst(pakket?.installation?.atrium_installation_code) || tekst(item?.summary?.installation_code);

  const formInstanceId = Number(instance.form_instance_id ?? item?.summary?.form_instance_id);

  /* De revisie die het pakket zag toen het vertrok. Bewust die, en niet iets wat de app zelf
     bijhoudt: precies daarop controleert de server of er online intussen iets veranderd is. */
  const draftRev = instance.draft_rev;

  const antwoorden = item?.local_runtime?.answers_json;

  return {
    schema: OFFLINE_RETURN_SCHEMA,

    installation: { atrium_installation_code: code },

    form: {
      code: tekst(instance.form_code) || null,
      version_label: tekst(instance.version_label || instance.version) || null,
      form_version_id: tekst(instance.form_version_id) || null,
    },

    instance: {
      form_instance_id: Number.isFinite(formInstanceId) ? formInstanceId : null,
      expected_draft_rev: typeof draftRev === "number" ? draftRev : Number(draftRev),
      status: tekst(instance.status) || null,
    },

    payload: {
      answers_json: antwoorden && typeof antwoorden === "object" ? antwoorden : {},
    },

    sync: {
      client_sync_id: tekst(clientSyncId) || resolveClientSyncId(item),
      local_saved_at: tekst(item?.local_runtime?.last_local_saved_at) || null,
    },

    field_work: {
      manual_points: bouwHandmatigePunten(item),
    },

    meta: {
      client_id: "ember-offline",
      exported_by: tekst(pakket?.generated_by?.display_name) || null,
    },
  };
}
