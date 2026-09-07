// De regel "is dit de API die nog niet warm is" staat op één plek, en drie schermen
// vertrouwen erop. Dit legt vast wat er wel en niet opnieuw wordt geprobeerd, want te veel
// opnieuw proberen verbergt een echt verlopen sessie en te weinig laat de gebruiker
// 's ochtends met een lege app zitten.

import assert from "node:assert/strict";
import test from "node:test";

import {
  WARMUP_RETRY_DELAYS_MS,
  describeApiFailure,
  isApiStartingError,
  isUnauthorizedError,
  shouldRetryApiError,
  warmupRetryDelayMs,
} from "../src/api/apiWarmup.js";

function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

test("503 wordt altijd opnieuw geprobeerd", () => {
  const fout = apiError("roles_unavailable", 503);

  assert.equal(isApiStartingError(fout), true);
  assert.equal(shouldRetryApiError(fout, 0), true);
  assert.equal(shouldRetryApiError(fout, 25), true);
});

test("401 wordt een paar keer geprobeerd en dan niet meer", () => {
  const fout = apiError("unauthorized", 401);

  assert.equal(isUnauthorizedError(fout), true);
  assert.equal(shouldRetryApiError(fout, 0), true);
  assert.equal(shouldRetryApiError(fout, 2), true);
  assert.equal(shouldRetryApiError(fout, 3), false);
});

test("een 401 zonder status wordt op de boodschap herkend", () => {
  // Oudere plekken gooien nog een kale Error("unauthorized").
  assert.equal(shouldRetryApiError(new Error("unauthorized"), 0), true);
});

test("403 en gewone fouten worden niet opnieuw geprobeerd", () => {
  assert.equal(shouldRetryApiError(apiError("forbidden", 403), 0), false);
  assert.equal(shouldRetryApiError(apiError("Request failed (500)", 500), 0), false);
  assert.equal(shouldRetryApiError(new Error("Ongeldige JSON"), 0), false);
});

test("de tussenpozen lopen op en blijven daarna gelijk", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 99].map(warmupRetryDelayMs),
    [
      ...WARMUP_RETRY_DELAYS_MS,
      WARMUP_RETRY_DELAYS_MS.at(-1),
      WARMUP_RETRY_DELAYS_MS.at(-1),
    ]
  );

  for (let i = 1; i < WARMUP_RETRY_DELAYS_MS.length; i += 1) {
    assert.ok(WARMUP_RETRY_DELAYS_MS[i] > WARMUP_RETRY_DELAYS_MS[i - 1]);
  }
});

test("de tekst voor de gebruiker noemt geen foutcodes", () => {
  assert.match(describeApiFailure(apiError("roles_unavailable", 503)), /opstarten/i);
  assert.match(describeApiFailure(apiError("auth_unavailable", 503)), /opstarten/i);
  assert.match(describeApiFailure(apiError("unauthorized", 401)), /sessie/i);
  assert.match(describeApiFailure(apiError("forbidden", 403)), /rechten/i);

  // Stuurt de API zelf een leesbare uitleg mee, dan gaat die voor.
  assert.equal(
    describeApiFailure(apiError("De dienst is nog aan het opstarten.", 503)),
    "De dienst is nog aan het opstarten."
  );

  // En een onbekende fout blijft leesbaar in plaats van leeg.
  assert.equal(describeApiFailure(new Error("")), "Onbekende fout");
});
