/* /api/src/services/formAnswerKeyService.ts

   Controleert of de sleutels in answers_json horen bij de vragenlijst van de gebonden
   versie. Tot nu toe ging payload.answers_json met JSON.stringify rechtstreeks naar SQL;
   alle validatie waar de invuller op vertrouwt leefde in de browser. Wie de API direct
   aanroept, kon elke sleutel onder elke naam wegschrijven.

   Deze module beslist niets over de inhoud van een antwoord; alleen of de sleutel bestaat
   in de definitie. De waarde zelf blijft aan de vragenlijstvalidatie.

   Bewust log-eerst. EMBER_REJECT_UNKNOWN_ANSWER_KEYS=1 zet weigeren aan; zonder die vlag
   wordt alleen gemeld wat er langskomt, zodat een bestaand concept met een oude sleutel
   niet onverwacht vastloopt. Er worden nooit antwoordwaarden gelogd, alleen sleutelnamen. */

type KeyCheckResult = {
  checked: boolean;
  unknownKeys: string[];
  unknownRowKeys: string[];
  knownKeyCount: number;
};

function isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/* Alle vraagnamen van de definitie, plus per matrix- of paneelvraag de namen van de
   kolommen en de sjabloonvragen. Een matrixantwoord is een lijst rijobjecten die op
   kolomnaam zijn gesleuteld, dus die namen horen er ook bij. */
function collectDefinitionNames(surveyJson: any) {
  const questionNames = new Set<string>();
  const childNamesByQuestion = new Map<string, Set<string>>();
  const prefilledQuestions = new Set<string>();

  function collectChildNames(node: any): Set<string> {
    const names = new Set<string>();

    for (const column of Array.isArray(node?.columns) ? node.columns : []) {
      const name = String(column?.name || "").trim();
      if (name) names.add(name);
    }

    for (const element of Array.isArray(node?.templateElements) ? node.templateElements : []) {
      const name = String(element?.name || "").trim();
      if (name) names.add(name);
    }

    return names;
  }

  function walk(node: any) {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }

    if (!isPlainObject(node)) return;

    const name = String(node.name || "").trim();
    const type = String(node.type || "").trim().toLowerCase();

    // Een pagina en een paneel hebben ook een naam, maar zijn geen antwoordsleutel. Ze
    // worden wel doorlopen; hun vragen zitten eronder.
    if (name && type && type !== "page" && type !== "panel") {
      questionNames.add(name);

      const childNames = collectChildNames(node);
      if (childNames.size > 0) childNamesByQuestion.set(name, childNames);

      // Een vraag die door prefill wordt gevuld krijgt zijn rijen van de server, inclusief
      // velden die de definitie niet als kolom noemt; performance_data_view, es_regels en
      // doc_groepen doen dat alle drie. Die rijen tegen de kolomlijst houden zou elke
      // opslag van elk bestaand formulier als verdacht melden, en dat is ruis.
      if (String(node?.ember?.bind?.kind || "").trim().toLowerCase() === "prefill") {
        prefilledQuestions.add(name);
      }
    }

    walk(node.elements);
    walk(node.questions);
    walk(node.templateElements);
  }

  walk(surveyJson?.pages);

  return { questionNames, childNamesByQuestion, prefilledQuestions };
}

/* Sleutels die de runtime zelf naast de antwoorden zet en die geen vraag zijn. Ze staan
   hier met naam, zodat een onbekende sleutel echt onbekend is. */
const RESERVED_ANSWER_KEYS = new Set<string>([
  "__ember_meta",
  "__ember_prefill",
]);

export function checkAnswerKeys(surveyJson: any, answers: any): KeyCheckResult {
  const empty: KeyCheckResult = {
    checked: false,
    unknownKeys: [],
    unknownRowKeys: [],
    knownKeyCount: 0,
  };

  if (!isPlainObject(surveyJson) || !Array.isArray(surveyJson.pages)) return empty;
  if (!isPlainObject(answers)) return empty;

  const { questionNames, childNamesByQuestion, prefilledQuestions } = collectDefinitionNames(surveyJson);
  if (questionNames.size === 0) return empty;

  const unknownKeys: string[] = [];
  const unknownRowKeys: string[] = [];
  let knownKeyCount = 0;

  for (const [key, value] of Object.entries(answers)) {
    if (RESERVED_ANSWER_KEYS.has(key)) continue;

    if (!questionNames.has(key)) {
      unknownKeys.push(key);
      continue;
    }

    knownKeyCount += 1;

    // Rijen van een matrix of paneel; alleen controleren als de definitie kolommen of
    // sjabloonvragen noemt, anders weten we niets en beweren we niets.
    if (prefilledQuestions.has(key)) continue;

    const childNames = childNamesByQuestion.get(key);
    if (!childNames || childNames.size === 0) continue;
    if (!Array.isArray(value)) continue;

    for (const row of value) {
      if (!isPlainObject(row)) continue;

      for (const rowKey of Object.keys(row)) {
        if (childNames.has(rowKey)) continue;

        const label = `${key}.${rowKey}`;
        if (!unknownRowKeys.includes(label)) unknownRowKeys.push(label);
      }
    }
  }

  return {
    checked: true,
    unknownKeys,
    unknownRowKeys,
    knownKeyCount,
  };
}

export function shouldRejectUnknownAnswerKeys() {
  return String(process.env.EMBER_REJECT_UNKNOWN_ANSWER_KEYS || "").trim() === "1";
}

/* Meldt wat er langskomt. Alleen sleutelnamen; nooit een antwoordwaarde, want dat is
   inhoud van een inspectie en hoort niet in een logregel. */
export function reportUnknownAnswerKeys(
  stage: "save" | "submit",
  formInstanceId: number | string,
  result: KeyCheckResult
) {
  if (!result.checked) return;

  const unknown = [...result.unknownKeys, ...result.unknownRowKeys];
  if (unknown.length === 0) return;

  console.warn(
    `[forms] onbekende antwoordsleutels bij ${stage} van instance ${formInstanceId}; ` +
      `${unknown.length} van ${unknown.length + result.knownKeyCount}; ${unknown.slice(0, 40).join(", ")}`
  );
}

export function buildUnknownAnswerKeyMessage(result: KeyCheckResult) {
  const unknown = [...result.unknownKeys, ...result.unknownRowKeys];
  if (unknown.length === 0) return null;

  return (
    `answers_json bevat ${unknown.length} sleutel${unknown.length === 1 ? "" : "s"} ` +
    `die niet in deze formulierversie voorkomt; ${unknown.slice(0, 20).join(", ")}`
  );
}
