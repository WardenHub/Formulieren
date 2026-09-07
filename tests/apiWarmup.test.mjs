// De regel "is dit de API die nog niet warm is" staat op één plek, en drie schermen
// vertrouwen erop. Dit legt vast wat er wel en niet opnieuw wordt geprobeerd, en dat het
// vijf minuten volhoudt; te kort en de gebruiker ziet rood terwijl de dienst nog opstart,
// te lang en een echte storing blijft verstopt achter een spinner.

import assert from "node:assert/strict";
import test from "node:test";

import {
  WARMUP_RETRY_DELAYS_MS,
  WARMUP_WINDOW_MS,
  createApiWarmupRetry,
  describeApiFailure,
  describeApiFailureDetail,
  isApiStartingError,
  isSessionError,
  isUnauthorizedError,
  shouldRetryApiError,
} from "../src/api/apiWarmup.js";

function apiError(message, status, payload = null) {
  const error = new Error(message);
  error.status = status;
  if (payload) error.payload = payload;
  return error;
}

test("het venster is vijf minuten", () => {
  assert.equal(WARMUP_WINDOW_MS, 5 * 60 * 1000);
});

test("401 en 503 gaan vanzelf over en worden opnieuw geprobeerd", () => {
  assert.equal(isApiStartingError(apiError("roles_unavailable", 503)), true);
  assert.equal(isUnauthorizedError(apiError("unauthorized", 401)), true);
  assert.equal(shouldRetryApiError(apiError("roles_unavailable", 503)), true);
  assert.equal(shouldRetryApiError(apiError("unauthorized", 401)), true);
  assert.equal(shouldRetryApiError(apiError("bad gateway", 502)), true);
});

test("een verzoek dat de API niet bereikt wordt opnieuw geprobeerd", () => {
  // Een slapende instance laat de verbinding vallen; dan is er geen statuscode.
  assert.equal(shouldRetryApiError(new TypeError("Failed to fetch")), true);
});

test("403 en een fout in de API gaan niet weg door te wachten", () => {
  assert.equal(shouldRetryApiError(apiError("forbidden", 403)), false);
  assert.equal(shouldRetryApiError(apiError("Request failed (500)", 500), 0), false);
  assert.equal(shouldRetryApiError(apiError("not found", 404)), false);
});

test("zonder token is het de sessie en niet de dienst", () => {
  const fout = apiError("unauthorized", 401, { token_sent: false });

  assert.equal(isSessionError(fout), true);
  assert.equal(shouldRetryApiError(fout), false);
  assert.match(describeApiFailure(fout), /sessie/i);

  // Met token is het wel iets om opnieuw te proberen.
  const metToken = apiError("unauthorized", 401, { token_sent: true });
  assert.equal(isSessionError(metToken), false);
  assert.equal(shouldRetryApiError(metToken), true);
});

test("de tussenpozen lopen op en blijven daarna gelijk", () => {
  let klok = 0;
  const herkansing = createApiWarmupRetry({ now: () => klok });
  const fout = apiError("unauthorized", 401);
  const gezien = [];

  for (let i = 0; i < WARMUP_RETRY_DELAYS_MS.length + 2; i += 1) {
    gezien.push(herkansing.planNext(fout));
  }

  assert.deepEqual(gezien, [
    ...WARMUP_RETRY_DELAYS_MS,
    WARMUP_RETRY_DELAYS_MS.at(-1),
    WARMUP_RETRY_DELAYS_MS.at(-1),
  ]);

  for (let i = 1; i < WARMUP_RETRY_DELAYS_MS.length; i += 1) {
    assert.ok(WARMUP_RETRY_DELAYS_MS[i] > WARMUP_RETRY_DELAYS_MS[i - 1]);
  }
});

test("na vijf minuten volgt er geen poging meer", () => {
  let klok = 1000;
  const herkansing = createApiWarmupRetry({ now: () => klok });
  const fout = apiError("roles_unavailable", 503);

  assert.notEqual(herkansing.planNext(fout), null);

  klok += WARMUP_WINDOW_MS - 1;
  assert.notEqual(herkansing.planNext(fout), null, "binnen het venster blijft het proberen");

  klok += 2;
  assert.equal(herkansing.planNext(fout), null, "daarna niet meer");
  assert.ok(herkansing.elapsedMs() >= WARMUP_WINDOW_MS);
});

test("een gelukte poging zet de klok terug", () => {
  let klok = 0;
  const herkansing = createApiWarmupRetry({ now: () => klok });
  const fout = apiError("unauthorized", 401);

  herkansing.planNext(fout);
  klok += WARMUP_WINDOW_MS;
  herkansing.reset();

  assert.equal(herkansing.elapsedMs(), 0);
  assert.equal(herkansing.attempts(), 0);
  assert.equal(herkansing.planNext(fout), WARMUP_RETRY_DELAYS_MS[0]);
});

test("de tekst voor de gebruiker noemt geen foutcodes", () => {
  assert.match(describeApiFailure(apiError("roles_unavailable", 503)), /opstarten/i);
  assert.match(describeApiFailure(apiError("auth_unavailable", 503)), /opstarten/i);
  assert.match(describeApiFailure(apiError("forbidden", 403)), /rechten/i);

  // Stuurt de API zelf een leesbare uitleg mee, dan gaat die voor.
  assert.equal(
    describeApiFailure(apiError("De dienst is nog aan het opstarten.", 503)),
    "De dienst is nog aan het opstarten."
  );

  assert.equal(describeApiFailure(new Error("")), "Onbekende fout");
});

test("de technische regel is bruikbaar in een melding naar IT", () => {
  const regel = describeApiFailureDetail(
    apiError("unauthorized", 401, { token_sent: false }),
    "/me"
  );

  assert.match(regel, /HTTP 401/);
  assert.match(regel, /\/me/);
  assert.match(regel, /geen token/);
});
