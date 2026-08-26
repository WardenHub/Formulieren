import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const fixturesDirectory = path.join(repositoryRoot, "docs", "fixtures", "forms");
const propertiesPath = path.resolve(repositoryRoot, "..", "..", "SQL DB", "Eigenschappen.sql");
const propertiesSql = fs.readFileSync(propertiesPath, "utf8");
const fixtureNames = fs.readdirSync(fixturesDirectory).filter((name) => name.endsWith(".json"));

if (fixtureNames.length === 0) {
  throw new Error("No form fixtures were found");
}

function readSeedSurvey(fixtureName) {
  const marker = `Source fixture: docs/fixtures/forms/${fixtureName}`;
  const markerOffset = propertiesSql.indexOf(marker);
  if (markerOffset < 0) throw new Error(`${fixtureName}: source marker ontbreekt in Eigenschappen.sql`);

  const literalOffset = propertiesSql.indexOf("N'{", markerOffset);
  if (literalOffset < 0) throw new Error(`${fixtureName}: survey_json-literal ontbreekt in Eigenschappen.sql`);

  let value = "";
  for (let index = literalOffset + 2; index < propertiesSql.length; index += 1) {
    const character = propertiesSql[index];
    if (character !== "'") {
      value += character;
      continue;
    }
    if (propertiesSql[index + 1] === "'") {
      value += "'";
      index += 1;
      continue;
    }
    return JSON.parse(value);
  }

  throw new Error(`${fixtureName}: survey_json-literal is niet afgesloten in Eigenschappen.sql`);
}

const results = fixtureNames.map((fixtureName) => {
  const fixturePath = path.join(fixturesDirectory, fixtureName);
  const fixtureBytes = fs.readFileSync(fixturePath);
  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  const code = String(fixture?.form?.code || "").trim();
  const version = Number(fixture?.version?.version);
  const survey = fixture?.version?.survey_json;
  const seedSurvey = readSeedSurvey(fixtureName);

  if (!code) throw new Error(`${fixtureName}: form.code is required`);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`${fixtureName}: version.version must be a positive integer`);
  }
  if (!survey || !Array.isArray(survey.pages) || survey.pages.length === 0) {
    throw new Error(`${fixtureName}: survey_json.pages must be a non-empty array`);
  }
  if (Object.hasOwn(survey, "instance_title") || Object.hasOwn(survey, "instance_note")) {
    throw new Error(`${fixtureName}: instance metadata must not be stored in survey_json`);
  }

  const pageNames = survey.pages.map((page) => String(page?.name || "").trim());
  if (pageNames.some((name) => !name)) {
    throw new Error(`${fixtureName}: every page needs a stable name`);
  }
  if (new Set(pageNames).size !== pageNames.length) {
    throw new Error(`${fixtureName}: page names must be unique`);
  }

  const surveyText = JSON.stringify(survey);
  if (JSON.stringify(seedSurvey) !== surveyText) {
    throw new Error(`${fixtureName}: Eigenschappen.sql wijkt af van de repositoryfixture`);
  }
  return {
    fixture: fixtureName,
    code,
    version,
    pages: survey.pages.length,
    elements: survey.pages.reduce(
      (total, page) => total + (Array.isArray(page.elements) ? page.elements.length : 0),
      0,
    ),
    fixture_sha256: crypto.createHash("sha256").update(fixtureBytes).digest("hex").toUpperCase(),
    survey_sha256: crypto.createHash("sha256").update(Buffer.from(surveyText, "utf8")).digest("hex").toUpperCase(),
  };
});

process.stdout.write(`${JSON.stringify({ ok: true, fixtures: results }, null, 2)}\n`);
