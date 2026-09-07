// Onbekende rollen zijn geen ontbrekende rollen. Dit legt het verschil vast dat 's ochtends
// het beeld gaf van een gebruiker zonder rechten terwijl er alleen een koude API was.

import assert from "node:assert/strict";
import test from "node:test";

import { requireRole } from "../src/middleware/roleMiddleware.js";

function nepResponse() {
  const opname: any = { status: null, body: null, headers: {} as Record<string, string> };

  return {
    opname,
    res: {
      setHeader(naam: string, waarde: string) {
        opname.headers[naam] = waarde;
      },
      status(code: number) {
        opname.status = code;
        return {
          json(body: any) {
            opname.body = body;
            return body;
          },
        };
      },
    },
  };
}

function roep(req: any, ...allowed: string[]) {
  const { opname, res } = nepResponse();
  let doorgelaten = false;

  requireRole(...allowed)(req, res, () => {
    doorgelaten = true;
  });

  return { ...opname, doorgelaten };
}

test("een rol die past laat door", () => {
  const uitkomst = roep({ roles: ["gebruiker"] }, "admin", "gebruiker");

  assert.equal(uitkomst.doorgelaten, true);
  assert.equal(uitkomst.status, null);
});

test("een rol die niet past is 403 forbidden", () => {
  const uitkomst = roep({ roles: ["documentbeheerder"] }, "admin");

  assert.equal(uitkomst.doorgelaten, false);
  assert.equal(uitkomst.status, 403);
  assert.equal(uitkomst.body.error, "forbidden");
});

test("geen enkele rol is ook 403; dat is een echt antwoord", () => {
  const uitkomst = roep({ roles: [] }, "admin", "gebruiker");

  assert.equal(uitkomst.status, 403);
  assert.equal(uitkomst.body.error, "forbidden");
});

test("onbekende rollen zijn 503 met Retry-After, niet 403", () => {
  const uitkomst = roep({ roles: [], rolesUnavailable: true }, "admin", "gebruiker");

  assert.equal(uitkomst.doorgelaten, false);
  assert.equal(uitkomst.status, 503);
  assert.equal(uitkomst.body.error, "roles_unavailable");
  assert.equal(uitkomst.headers["Retry-After"], "5");
  assert.match(uitkomst.body.message, /opstarten/i);
});

test("een passende rol gaat voor de onbekend-vlag", () => {
  // Een app-rol uit het token maakt de vlag irrelevant; dan is er niets onbekend.
  const uitkomst = roep({ roles: ["admin"], rolesUnavailable: true }, "admin");

  assert.equal(uitkomst.doorgelaten, true);
  assert.equal(uitkomst.status, null);
});
