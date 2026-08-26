import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaRoot = path.resolve(root, "..", "..", "SQL DB");
const deploymentRoot = path.resolve(
  process.env.USERPROFILE || "C:/Users/Jesse Veentjer",
  ".codex/projects/atrium-semantic-model-nl/deployment/ember-revamp",
);
const service = fs.readFileSync(path.join(root, "api/src/services/formsHubService.ts"), "utf8");
const queries = fs.readFileSync(path.join(root, "api/src/db/queries/formsHub.sql.ts"), "utf8");
const client = fs.readFileSync(path.join(root, "api/src/services/atriumReaderClient.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/pages/Forms/FormsHubPage.jsx"), "utf8");
const state = fs.readFileSync(path.join(root, "src/pages/Forms/formsHubContextState.js"), "utf8");
const schema = fs.readFileSync(path.join(schemaRoot, "tabel-definities.sql"), "utf8");
const properties = fs.readFileSync(path.join(schemaRoot, "Eigenschappen.sql"), "utf8");
const copyJob = JSON.parse(fs.readFileSync(
  path.join(deploymentRoot, "copyjob/Data-to-Ember-NL-two-activity.proposed.json"),
  "utf8",
));

const failures = [];
for (const retired of ["FormContextDirectoryEntry", "FormContextDirectoryRelation", "cacheFormsHubReaderContextSql", "resolveFormsHubContextSql"]) {
  if (service.includes(retired) || queries.includes(retired)) failures.push(`vervallen directorycontract aanwezig: ${retired}`);
}
if (/\bmerge\s+dbo\.FormContextDirectory/i.test(queries)) failures.push("directory-MERGE is nog aanwezig");
if (/CREATE\s+TABLE\s+dbo\.FormContextDirectory/i.test(schema)) failures.push("canoniek schema maakt nog een directorytabel aan");
if (/DELETE\s+FROM\s+dbo\.FormContextDirectory/i.test(properties)) failures.push("canonieke properties bevatten nog directory-seedcleanup");
for (const retained of ["FormInstanceContext", "InspectionCaseWorkOrderSnapshot", "AtriumInstallationBase", "AtriumInstallationBestekParagraph", "AtriumServiceClassification"]) {
  if (!schema.includes(`CREATE TABLE dbo.${retained} (`)) failures.push(`behouden snapshotmodel ontbreekt: ${retained}`);
}
if (!service.includes("atriumReaderClient.resolveContext")) failures.push("startflow bevat geen live Reader-resolve");
if (!service.includes("reconcileResolvedContexts")) failures.push("startflow bevat geen onderlinge contextvalidatie");
if (!queries.includes("begin transaction;") || !queries.includes("rollback transaction;")) failures.push("starttransactie is niet expliciet atomair");
if (!queries.includes("metadata_snapshot_json")) failures.push("FormInstanceContext-snapshot ontbreekt");
if (!queries.includes("insert into dbo.FormInstanceContext")) failures.push("atomische contextsnapshotinsert ontbreekt");
if (/Wardenburg\\\|/.test(client) || client.includes("^Wardenburg")) failures.push("Readerclient bevat een hardcoded Wardenburg-keyregex");
if (!client.includes("ATRIUM_READER_BUSINESS_UNIT")) failures.push("Readerclient mist expliciete Business Unit-configuratie");
if (!state.includes("MINIMUM_CONTEXT_SEARCH_LENGTH = 3")) failures.push("frontend minimumzoeklengte is niet drie");
if (!page.includes("resetForPrimaryContext")) failures.push("frontend wist afgeleide context niet bij hoofdcontextwissel");

const activities = Array.isArray(copyJob.activities) ? copyJob.activities : [];
const copyPairs = activities.map((activity) => [
  activity?.properties?.source?.datasetSettings?.table,
  activity?.properties?.destination?.datasetSettings?.table,
  activity?.properties?.destination?.writeBehavior,
]);
const expectedPairs = [
  ["InstallationBase", "AtriumInstallationBase", "Upsert"],
  ["InstallationBestekParagraphs", "AtriumInstallationBestekParagraph", "Overwrite"],
];
if (copyJob?.properties?.jobMode !== "Batch") failures.push("Copy Job is niet als full-copy Batch vastgelegd");
if (JSON.stringify(copyPairs) !== JSON.stringify(expectedPairs)) failures.push("Copy Job bevat niet exact de twee toegestane activiteiten");
if (/BestekParagraph(?:Snapshot)?(?:Stage|LoadAudit)|PromoteInstallationBestekParagraph/.test(JSON.stringify(copyJob))) {
  failures.push("Copy Job bevat een vervallen staging-, audit- of promotiecontract");
}
for (const retiredArtifact of [
  "gold/Ember.FormContextDirectory.proposed.sql",
  "gold/Ember.FormContextLinks.proposed.sql",
  "gold/validate-Ember.FormContextLinks.readonly.sql",
  "copyjob/Data-to-Ember-NL-with-context-directory.proposed.json",
]) {
  if (fs.existsSync(path.join(deploymentRoot, retiredArtifact))) failures.push(`vervallen deploymentartifact bestaat nog: ${retiredArtifact}`);
}

if (failures.length) {
  console.error("Realtime formuliercontextvalidatie mislukt:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Realtime formuliercontextarchitectuur geldig; geen persistente directoryfallback en atomische snapshots bevestigd.");
