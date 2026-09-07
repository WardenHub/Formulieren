/* Eén plek voor de vraag: is dit de API die nog niet warm is, of is het een echte fout?

   Ember draait op een App Service die in rust gaat; Always On staat uit. De eerste aanvraag
   van de dag wekt hem, en zolang dat loopt kan de API drie dingen antwoorden die er alle
   drie uitzien als "je mag dit niet": 401 omdat hij de inlogdienst nog niet kon bereiken,
   503 omdat de rollen nog niet op te halen zijn, of niets omdat de verbinding wegvalt.

   Vragen daarom niet één keer, maar blijven vragen. Vijf minuten lang, met steeds langere
   tussenpozen. Wie na vijf minuten nog niets heeft, heeft geen koude start maar een storing,
   en dan hoort er een andere melding te staan met een andere uitweg. */

export const WARMUP_WINDOW_MS = 5 * 60 * 1000;
export const WARMUP_RETRY_DELAYS_MS = [1500, 3000, 6000, 10000, 15000, 20000];

function errorText(error) {
  // Een Error zonder boodschap levert via String(error) de tekst "Error" op; dat is geen
  // uitleg om aan iemand te tonen, dus die valt hier weg.
  if (error && typeof error === "object") return String(error.message || "").trim();
  return String(error ?? "").trim();
}

export function isUnauthorizedError(error) {
  return Number(error?.status || 0) === 401 || errorText(error).toLowerCase() === "unauthorized";
}

export function isApiStartingError(error) {
  return Number(error?.status || 0) === 503;
}

/* De browser had geen token om mee te sturen. Dat is geen opstartende API maar een sessie
   die opnieuw moet; blijven proberen helpt daar niet. src/api/http.js zet deze vlag. */
export function isSessionError(error) {
  return isUnauthorizedError(error) && error?.payload?.token_sent === false;
}

// Fouten die vanzelf overgaan zodra de dienst er weer is. 403 hoort er niet bij; dat is een
// antwoord. 500 ook niet; dat is een fout in de API en die gaat niet weg door te wachten.
const HEALABLE_STATUSES = new Set([401, 408, 425, 429, 502, 503, 504]);

export function shouldRetryApiError(error) {
  if (isSessionError(error)) return false;

  const status = Number(error?.status || 0);
  if (status) return HEALABLE_STATUSES.has(status);

  // Geen status betekent dat het verzoek de API niet heeft bereikt; een slapende instance
  // laat de verbinding vallen en dat is juist het geval waarvoor dit bestaat.
  return true;
}

/* Houdt bij hoe lang er al geprobeerd wordt en hoe lang de volgende pauze duurt. Bewust een
   fabriek en geen losse functie met een teller per scherm; het venster van vijf minuten en
   de reeks tussenpozen horen op één plek te staan. */
export function createApiWarmupRetry({ windowMs = WARMUP_WINDOW_MS, now = () => Date.now() } = {}) {
  let eersteFoutOp = null;
  let pogingen = 0;

  return {
    /* Geeft het aantal milliseconden tot de volgende poging, of null als er geen poging
       meer volgt. */
    planNext(error) {
      if (!shouldRetryApiError(error)) return null;

      if (eersteFoutOp === null) eersteFoutOp = now();
      if (now() - eersteFoutOp >= windowMs) return null;

      const index = Math.min(pogingen, WARMUP_RETRY_DELAYS_MS.length - 1);
      pogingen += 1;
      return WARMUP_RETRY_DELAYS_MS[index];
    },
    reset() {
      eersteFoutOp = null;
      pogingen = 0;
    },
    elapsedMs() {
      return eersteFoutOp === null ? 0 : now() - eersteFoutOp;
    },
    attempts() {
      return pogingen;
    },
  };
}

export function describeApiFailure(error) {
  const status = Number(error?.status || 0);
  const raw = errorText(error);
  const code = raw.toLowerCase();

  if (isSessionError(error)) {
    return "Je sessie is verlopen; log opnieuw in om verder te gaan.";
  }

  if (isApiStartingError(error)) {
    // De API stuurt bij 503 zelf een Nederlandse uitleg mee; alleen de kale foutcodes
    // vervangen we door iets leesbaars.
    return code === "roles_unavailable" || code === "auth_unavailable" || !raw
      ? "Ember is nog aan het opstarten; dit probeert automatisch opnieuw."
      : raw;
  }

  if (isUnauthorizedError(error)) {
    return "De API accepteert de aanmelding nog niet; dit probeert automatisch opnieuw.";
  }

  if (status === 403 || code === "forbidden") {
    return "Je hebt hier geen rechten voor.";
  }

  return raw || "Onbekende fout";
}

/* Eén regel techniek voor de gebruiker en voor de melding naar IT. Ember is een intern
   platform; de statuscode erbij zetten scheelt een half uur zoeken. */
export function describeApiFailureDetail(error, path = "") {
  const delen = [];
  const status = Number(error?.status || 0);

  if (status) delen.push(`HTTP ${status}`);
  if (path) delen.push(path);

  const raw = errorText(error);
  if (raw && raw !== String(status)) delen.push(raw);

  if (error?.payload?.token_sent === false) delen.push("geen token meegestuurd");
  if (error?.correlationId) delen.push(`correlatie ${error.correlationId}`);

  return delen.join("; ");
}
