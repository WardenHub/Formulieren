/* Eén plek voor de vraag: is dit de API die nog niet warm is, of is het een echte fout?

   Ember draait op een App Service die 's nachts in rust gaat. De eerste aanvraag van de dag
   wekt hem, en zolang dat loopt kan de API drie dingen antwoorden die er alle drie uitzien
   als "je mag dit niet": 401 omdat hij Entra nog niet kon bereiken, 503 omdat de rollen nog
   niet op te halen zijn, of niets omdat de verbinding wegvalt. Alleen het eerste geval
   verdient een nieuwe inlog; de andere lossen zichzelf op door even te wachten.

   Deze module beslist dat op één plek, zodat elk scherm hetzelfde doet. */

export const WARMUP_RETRY_DELAYS_MS = [1500, 3000, 6000, 12000, 20000];

// Een 401 kan ook een echt verlopen sessie zijn; die gaat niet weg door te wachten. Daarom
// een paar pogingen en dan ophouden, in plaats van eindeloos doorvragen.
const MAX_UNAUTHORIZED_RETRIES = 3;

export function warmupRetryDelayMs(attempt) {
  const index = Math.min(Math.max(0, Number(attempt) || 0), WARMUP_RETRY_DELAYS_MS.length - 1);
  return WARMUP_RETRY_DELAYS_MS[index];
}

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

export function shouldRetryApiError(error, attempt = 0) {
  if (isApiStartingError(error)) return true;
  if (isUnauthorizedError(error)) return Number(attempt) < MAX_UNAUTHORIZED_RETRIES;
  return false;
}

export function describeApiFailure(error) {
  const status = Number(error?.status || 0);
  const raw = errorText(error);
  const code = raw.toLowerCase();

  if (isApiStartingError(error)) {
    // De API stuurt bij 503 zelf een Nederlandse uitleg mee; alleen de kale foutcodes
    // vervangen we door iets leesbaars.
    return code === "roles_unavailable" || code === "auth_unavailable" || !raw
      ? "Ember is nog aan het opstarten; dit probeert automatisch opnieuw."
      : raw;
  }

  if (isUnauthorizedError(error)) {
    return "Je sessie wordt nog gecontroleerd; dit probeert automatisch opnieuw. Blijft dit staan, log dan opnieuw in.";
  }

  if (status === 403 || code === "forbidden") {
    return "Je hebt hier geen rechten voor.";
  }

  return raw || "Onbekende fout";
}
