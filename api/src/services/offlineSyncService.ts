// /api/src/services/offlineSyncService.ts
//
// De terugweg van Ember Offline.
//
// Offline werk moet thuis kunnen komen, en dat kon tot nu toe niet. De enige importroute
// las een ander formaat dan de export schreef, vergeleek revisies met > in plaats van <>,
// accepteerde een lege revisie waarmee de controle volledig wegviel, en kon met een lege
// instance-id zelfs nieuwe instances en installaties aanmaken. Dat is precies de klasse
// fouten waarmee je stil werk overschrijft.
//
// Daarom staat hier geen tweede schrijfpad. Deze dienst leest één document, controleert het
// streng, en geeft het werk daarna door aan dezelfde functie die de online runner gebruikt:
// saveFormAnswers. Die eist expected_draft_rev, rekent calculated_json server-side opnieuw
// uit, en laat de afgeleide opvolgpunten door hun eigen fingerprintsync lopen. Wat offline
// is bedacht wordt dus online opnieuw gewogen; de server blijft de waarheid.

import {
  clearFormInstanceOfflineCheckout,
  getFormInstance,
  saveFormAnswers,
} from "./formsService.js";
import { addRunnerFollowUpPoint } from "./followUpService.js";
import {
  createDrawingPin,
  getDrawingPins,
  linkDrawingPinAction,
} from "./drawingPinService.js";

export const OFFLINE_RETURN_SCHEMA = "ember.form.answerfile.v2";

// Een pakket met duizend punten is geen veldwerk maar een ongeluk; dan stopt het hier.
const MAX_MANUAL_POINTS = 200;

/* De plek op de tekening die offline is aangewezen. Genormaliseerd, 0 tot 1, precies zoals
   de online pin; hier wordt hij pas een echte DrawingPin, aan het punt gehangen dat uit dit
   werk voortkomt. */
export type OfflinePointPin = {
  document_id: string;
  page_number: number;
  x_normalized: number;
  y_normalized: number;
};

export type OfflineManualPoint = {
  local_id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string | null;
  source_question_name: string | null;
  pin: OfflinePointPin | null;
};

export type OfflineReturnDocument = {
  schema: string;
  atrium_installation_code: string;
  form_instance_id: number;
  expected_draft_rev: number;
  /* De definitieversie waarvoor het pakket is gemaakt. Optioneel, want pakketten van voor
     package_version 0.2 kennen hem niet; staat hij er wel, dan moet hij kloppen. */
  expected_form_version_id: string | null;
  answers_json: Record<string, unknown>;
  client_sync_id: string;
  local_saved_at: string | null;
  manual_points: OfflineManualPoint[];
};

function tekst(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function optioneleTekst(value: unknown, max: number) {
  const schoon = tekst(value);
  return schoon.length ? schoon.slice(0, max) : null;
}

function isGewoonObject(value: unknown) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type OfflineReturnParse =
  | { ok: true; document: OfflineReturnDocument; error?: undefined }
  | { ok: false; error: string; document?: undefined };

/* Leest en controleert het document dat Ember Offline terugstuurt. Puur; geen database, geen
   netwerk, zodat de regels afzonderlijk te testen zijn.

   Het envelopmodel is dat van api/src/contracts/answerfile.v1.json, met v2 als versie omdat
   er drie dingen bij horen die v1 niet heeft: een expliciete expected_draft_rev, een
   synchronisatiesleutel van de client, en het veldwerk dat offline is ontstaan. */
export function parseOfflineReturnDocument(raw: any): OfflineReturnParse {
  if (!isGewoonObject(raw)) return { ok: false, error: "het document ontbreekt" };

  const schema = tekst(raw.schema);
  if (schema !== OFFLINE_RETURN_SCHEMA) {
    return {
      ok: false,
      error: `verwacht schema ${OFFLINE_RETURN_SCHEMA}; dit document zegt ${schema || "niets"}`,
    };
  }

  const code = tekst(raw.installation?.atrium_installation_code);
  if (!code) return { ok: false, error: "installation.atrium_installation_code ontbreekt" };

  const instanceRuw = raw.instance?.form_instance_id;
  const instanceId = Number(instanceRuw);
  if (!Number.isSafeInteger(instanceId) || instanceId <= 0) {
    return { ok: false, error: "instance.form_instance_id ontbreekt of is ongeldig" };
  }

  /* Bewust verplicht en bewust niet uit instance.draft_rev overgenomen. De revisie die het
     pakket bij vertrek zag is de verwachting; hem uit hetzelfde document opnieuw lezen zou
     de controle betekenisloos maken. */
  const revisieRuw = raw.instance?.expected_draft_rev;

  /* Eerst kijken of er überhaupt een getal staat, en dan pas rekenen. Number(null) en
     Number("") geven beide 0, en revisie 0 is een geldige verwachting voor een nieuw
     concept; zonder deze stap glipt een ontbrekende revisie er dus door als nul en is de
     controle precies zo waardeloos als in de oude importroute. */
  const revisieIsGetal =
    typeof revisieRuw === "number" ||
    (typeof revisieRuw === "string" && tekst(revisieRuw) !== "" && Number.isFinite(Number(revisieRuw)));

  const expectedDraftRev = revisieIsGetal ? Number(revisieRuw) : Number.NaN;

  if (!Number.isSafeInteger(expectedDraftRev) || expectedDraftRev < 0) {
    return { ok: false, error: "instance.expected_draft_rev is verplicht" };
  }

  const answers = raw.payload?.answers_json;
  if (!isGewoonObject(answers)) {
    return { ok: false, error: "payload.answers_json ontbreekt of is geen object" };
  }

  const clientSyncId = tekst(raw.sync?.client_sync_id);
  if (!clientSyncId) return { ok: false, error: "sync.client_sync_id is verplicht" };

  const puntenRuw = raw.field_work?.manual_points;
  if (puntenRuw !== undefined && !Array.isArray(puntenRuw)) {
    return { ok: false, error: "field_work.manual_points moet een lijst zijn" };
  }

  const punten: OfflineManualPoint[] = [];
  const gezieneLokaleIds = new Set<string>();

  for (const [index, ruw] of (puntenRuw || []).entries()) {
    if (punten.length >= MAX_MANUAL_POINTS) {
      return { ok: false, error: `meer dan ${MAX_MANUAL_POINTS} punten in één sync` };
    }

    if (!isGewoonObject(ruw)) {
      return { ok: false, error: `manual_points[${index}] is geen object` };
    }

    const localId = tekst((ruw as any).local_id);
    if (!localId) return { ok: false, error: `manual_points[${index}].local_id ontbreekt` };

    // Twee keer dezelfde sleutel in één document betekent dat de client zijn eigen lijst
    // niet op orde heeft; dat is geen herhaalde sync en hoort niet stil te slagen.
    if (gezieneLokaleIds.has(localId)) {
      return { ok: false, error: `manual_points bevat local_id ${localId} twee keer` };
    }
    gezieneLokaleIds.add(localId);

    const title = tekst((ruw as any).title);
    if (!title) return { ok: false, error: `manual_points[${index}].title ontbreekt` };

    /* Een halve pin is erger dan geen pin: hij zou op kantoor op een willekeurige plek
       terechtkomen. Klopt hij niet, dan weigert het hele document, zodat de monteur het
       merkt terwijl hij er nog bij staat. */
    const pinRuw = (ruw as any).pin;
    let pin: OfflinePointPin | null = null;

    if (pinRuw != null) {
      if (!isGewoonObject(pinRuw)) {
        return { ok: false, error: `manual_points[${index}].pin is geen object` };
      }

      const documentId = tekst((pinRuw as any).document_id);
      if (!documentId) {
        return { ok: false, error: `manual_points[${index}].pin.document_id ontbreekt` };
      }

      const pagina = Number((pinRuw as any).page_number);
      if (!Number.isSafeInteger(pagina) || pagina < 1) {
        return { ok: false, error: `manual_points[${index}].pin.page_number is ongeldig` };
      }

      const x = Number((pinRuw as any).x_normalized);
      const y = Number((pinRuw as any).y_normalized);

      if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
        return { ok: false, error: `manual_points[${index}].pin ligt buiten de tekening` };
      }

      pin = { document_id: documentId.slice(0, 100), page_number: pagina, x_normalized: x, y_normalized: y };
    }

    punten.push({
      local_id: localId.slice(0, 200),
      title: title.slice(0, 300),
      description: optioneleTekst((ruw as any).description, 4000),
      category: optioneleTekst((ruw as any).category, 100),
      priority: optioneleTekst((ruw as any).priority, 30),
      source_question_name: optioneleTekst((ruw as any).source_question_name, 200),
      pin,
    });
  }

  return {
    ok: true,
    document: {
      schema,
      atrium_installation_code: code,
      form_instance_id: instanceId,
      expected_draft_rev: expectedDraftRev,
      expected_form_version_id: optioneleTekst(raw.form?.form_version_id, 100),
      answers_json: answers as Record<string, unknown>,
      client_sync_id: clientSyncId.slice(0, 200),
      local_saved_at: optioneleTekst(raw.sync?.local_saved_at, 40),
      manual_points: punten,
    },
  };
}

/* De sleutel waarmee een offline punt herkenbaar blijft. Eén keer bedacht op het apparaat,
   en daarna bij elke poging dezelfde, zodat de tweede sync niets dubbel aanmaakt. */
export function buildOfflinePointFingerprint(clientSyncSubject: string, localId: string) {
  return `offline:${tekst(clientSyncSubject) || "onbekend"}:${tekst(localId)}`;
}

function vertaalFout(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("draft_rev conflict")) return "conflict";
  if (lower.includes("form instance not editable")) return "not_editable";
  if (lower.includes("form instance not found")) return "not_found";
  if (lower.includes("atrium installation not found")) return "not_found";

  return null;
}

async function beschrijfHuidigeStand(code: string, instanceId: number) {
  try {
    const res: any = await getFormInstance(code, instanceId);
    const item: any = res?.item ?? null;

    if (!item) return null;

    return {
      draft_rev: item.draft_rev ?? null,
      form_version_id: item.form_version_id ?? null,
      version_label: item.version_label ?? null,
      status: item.status ?? null,
      updated_at: item.updated_at ?? item.answers_updated_at ?? null,
      updated_by: item.updated_by ?? item.answers_updated_by ?? null,
    };
  } catch {
    // De stand erbij zoeken is een service aan de gebruiker, geen voorwaarde; zonder die
    // gegevens is het nog steeds een conflict.
    return null;
  }
}

/* Zet de plek die offline is aangewezen op de tekening, en hangt hem aan het punt.
 *
 * Eerst kijken of die koppeling er al is. Een tweede verzending van hetzelfde werk mag geen
 * tweede pin opleveren; de punten zelf zijn idempotent via hun fingerprint, en zonder deze
 * controle zou de tekening bij elke poging voller lopen.
 *
 * Een pin die niet lukt is hinderlijk maar niet erg: het punt staat er, met titel en
 * omschrijving. Daarom geeft deze functie een uitkomst terug in plaats van te gooien. */
async function zorgVoorPin(
  code: string,
  followUpActionId: any,
  pin: OfflinePointPin,
  user: any
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  const actionId = tekst(followUpActionId);
  if (!actionId) return { ok: false, created: false, error: "het punt heeft geen id gekregen" };

  try {
    const bestaand: any = await getDrawingPins(code, pin.document_id, true);
    const alGekoppeld = (bestaand?.pins || []).some((kandidaat: any) =>
      (kandidaat?.follow_up_actions || []).some(
        (actie: any) => tekst(actie?.follow_up_action_id) === actionId
      )
    );

    if (alGekoppeld) return { ok: true, created: false };

    const gemaakt: any = await createDrawingPin(
      code,
      pin.document_id,
      {
        page_number: pin.page_number,
        x_normalized: pin.x_normalized,
        y_normalized: pin.y_normalized,
        // Het label komt van het punt zelf; twee keer dezelfde tekst onderhouden loopt uit elkaar.
        label: tekst((pin as any).label) || "Punt uit het veld",
        description: null,
        pin_kind: "NOTE",
      },
      user
    );

    const pinId = tekst(gemaakt?.pin?.drawing_pin_id);
    if (!pinId) return { ok: false, created: false, error: "de pin is niet aangemaakt" };

    await linkDrawingPinAction(code, pinId, actionId, user);
    return { ok: true, created: true };
  } catch (err: any) {
    return { ok: false, created: false, error: err?.message || String(err) };
  }
}

/* Neemt offline werk terug in. De antwoorden gaan via saveFormAnswers, dus met dezelfde
   revisiecontrole, dezelfde sleutelcontrole en dezelfde serverberekening als online. Daarna
   komen de punten die de monteur zelf heeft toegevoegd; die zijn per stuk idempotent. */
export async function applyOfflineReturnDocument(
  code: string,
  instanceId: number | string,
  raw: any,
  user: any
) {
  const gelezen = parseOfflineReturnDocument(raw);
  if (!gelezen.ok) return { ok: false, result: "invalid", error: gelezen.error };

  const document = gelezen.document as OfflineReturnDocument;
  const routeCode = tekst(code);
  const routeInstanceId = Number(instanceId);

  /* Het document moet over hetzelfde formulier gaan als de route. Zonder deze controle kan
     een verkeerd gekozen pakket antwoorden op een andere installatie of een ander formulier
     zetten, en dat is stil verlies van werk. */
  if (routeCode && routeCode !== document.atrium_installation_code) {
    return {
      ok: false,
      result: "invalid",
      error: `het document hoort bij installatie ${document.atrium_installation_code} en niet bij ${routeCode}`,
    };
  }

  if (Number.isSafeInteger(routeInstanceId) && routeInstanceId !== document.form_instance_id) {
    return {
      ok: false,
      result: "invalid",
      error: `het document hoort bij formulier ${document.form_instance_id} en niet bij ${routeInstanceId}`,
    };
  }

  /* De antwoorden zijn ingevuld tegen de definitie die in het pakket zat. Is die online
     intussen vervangen, dan gaan dezelfde antwoordsleutels over andere vragen; dat is geen
     revisieconflict maar iets ernstigers, want draft_rev kan ongewijzigd zijn. Alleen
     controleren wanneer het pakket de versie meedraagt, zodat oudere pakketten blijven
     werken. */
  if (document.expected_form_version_id) {
    const stand = await beschrijfHuidigeStand(document.atrium_installation_code, document.form_instance_id);
    const huidigeVersie = tekst(stand?.form_version_id);

    if (huidigeVersie && huidigeVersie !== document.expected_form_version_id) {
      return {
        ok: false,
        result: "version_changed",
        error:
          "dit formulier heeft online een nieuwe versie gekregen sinds het pakket is opgehaald",
        current: stand,
        expected_form_version_id: document.expected_form_version_id,
      };
    }
  }

  let saved: any;

  try {
    saved = await saveFormAnswers(
      document.atrium_installation_code,
      document.form_instance_id,
      {
        answers_json: document.answers_json,
        expected_draft_rev: document.expected_draft_rev,
      },
      user
    );
  } catch (err: any) {
    const soort = vertaalFout(err?.message || String(err));
    if (!soort) throw err;

    return {
      ok: false,
      result: soort,
      form_instance_id: document.form_instance_id,
      client_sync_id: document.client_sync_id,
      current: await beschrijfHuidigeStand(
        document.atrium_installation_code,
        document.form_instance_id
      ),
    };
  }

  if (saved?.ok === false) {
    return { ok: false, result: "invalid", error: saved.error || "antwoorden geweigerd" };
  }

  /* items draagt per punt terug welk actiepunt het geworden is. Daar hangt de app zijn
     foto's aan; zonder die koppeling zou een foto bij het verkeerde punt kunnen landen of
     helemaal nergens. */
  const punten = {
    created: 0,
    existing: 0,
    items: [] as { local_id: string; follow_up_action_id: any; created: boolean }[],
    failed: [] as { local_id: string; error: string }[],
    pins_created: 0,
    pins_failed: [] as { local_id: string; error: string }[],
  };

  for (const punt of document.manual_points) {
    try {
      const uitkomst: any = await addRunnerFollowUpPoint({
        formInstanceId: document.form_instance_id,
        title: punt.title,
        description: punt.description,
        category: punt.category,
        priority: punt.priority ?? undefined,
        sourceQuestionName: punt.source_question_name,
        clientFingerprint: buildOfflinePointFingerprint(document.client_sync_id, punt.local_id),
        user,
      });

      if (uitkomst?.ok === false) {
        punten.failed.push({ local_id: punt.local_id, error: String(uitkomst.error || "geweigerd") });
        continue;
      }

      const aangemaakt = uitkomst?.created !== false;
      if (aangemaakt) punten.created += 1;
      else punten.existing += 1;

      punten.items.push({
        local_id: punt.local_id,
        follow_up_action_id: uitkomst?.follow_up_action_id ?? null,
        created: aangemaakt,
      });

      if (punt.pin) {
        const pinUitkomst = await zorgVoorPin(
          document.atrium_installation_code,
          uitkomst?.follow_up_action_id,
          { ...punt.pin, label: punt.title } as any,
          user
        );

        if (pinUitkomst.ok && pinUitkomst.created) punten.pins_created += 1;
        if (!pinUitkomst.ok) {
          punten.pins_failed.push({ local_id: punt.local_id, error: String(pinUitkomst.error || "geweigerd") });
        }
      }
    } catch (err: any) {
      /* Een punt dat niet landt mag de antwoorden niet ongedaan maken; die staan al vast en
         zijn het werk van de monteur. Het punt komt terug in de uitkomst zodat de app het
         opnieuw kan aanbieden. */
      punten.failed.push({ local_id: punt.local_id, error: err?.message || String(err) });
    }
  }

  /* Het werk is thuis, dus het formulier staat niet langer in het veld. Lukt het weghalen
     van dat merkteken niet, dan is dat hinderlijk op kantoor maar geen reden om de monteur
     te vertellen dat zijn werk niet is aangekomen. */
  const checkout = await clearFormInstanceOfflineCheckout(
    document.atrium_installation_code,
    document.form_instance_id
  );

  const stand = await beschrijfHuidigeStand(
    document.atrium_installation_code,
    document.form_instance_id
  );

  return {
    ok: true,
    result: "accepted",
    checkout_cleared: checkout.ok === true,
    form_instance_id: document.form_instance_id,
    client_sync_id: document.client_sync_id,
    draft_rev: stand?.draft_rev ?? null,
    points: punten,
    follow_up_sync: saved?.follow_up_sync ?? null,
    // Afronden blijft online; dit is de plek waar dat gebeurt.
    open_online_url: `/installaties/${encodeURIComponent(document.atrium_installation_code)}/formulieren/${document.form_instance_id}`,
  };
}
