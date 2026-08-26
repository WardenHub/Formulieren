import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const emberRoot = path.resolve(root, "..", "..");
const deploymentRoot = path.resolve(
  process.env.USERPROFILE || "C:/Users/Jesse Veentjer",
  ".codex/projects/atrium-semantic-model-nl/deployment/ember-revamp",
);
const schema = fs.readFileSync(path.join(emberRoot, "SQL DB/tabel-definities.sql"), "utf8");
const properties = fs.readFileSync(path.join(emberRoot, "SQL DB/Eigenschappen.sql"), "utf8");
const baseline = JSON.parse(fs.readFileSync(
  path.join(deploymentRoot, "copyjob/Data-to-Ember-NL-Installationdata.remove-software-wachtwoord.json"), "utf8",
));
const proposed = JSON.parse(fs.readFileSync(
  path.join(deploymentRoot, "copyjob/Data-to-Ember-NL-two-activity.proposed.json"), "utf8",
));

const expectedColumns = [
  ["business_unit", "nvarchar(100) NOT NULL"], ["installation_code", "nvarchar(450) NOT NULL"],
  ["bestek_key", "nvarchar(450) NULL"], ["bestek_code", "nvarchar(200) NULL"],
  ["bestek_title", "nvarchar(500) NULL"], ["paragraph_key", "nvarchar(450) NOT NULL"],
  ["paragraph_code", "nvarchar(200) NULL"], ["paragraph_title", "nvarchar(500) NULL"],
  ["paragraph_type_code", "nvarchar(20) NULL"], ["paragraph_execution_mode", "nvarchar(40) NOT NULL"],
  ["is_periodic", "bit NULL"], ["is_periodic_executable", "bit NULL"],
  ["includes_maintenance", "bit NULL"], ["includes_fault_service", "bit NULL"],
  ["contract_type_key", "nvarchar(450) NULL"], ["contract_type_code", "nvarchar(100) NULL"],
  ["contract_type_description", "nvarchar(300) NULL"], ["contract_key", "nvarchar(450) NULL"],
  ["contract_historical", "nvarchar(20) NULL"], ["contract_start_date", "date NULL"],
  ["contract_end_date", "date NULL"], ["relation_key", "nvarchar(450) NULL"],
  ["debtor_relation_key", "nvarchar(450) NULL"], ["object_key", "nvarchar(450) NULL"],
  ["project_code", "nvarchar(200) NULL"], ["order_code", "nvarchar(200) NULL"],
  ["paragraph_start_date", "date NULL"], ["paragraph_plan_date", "date NULL"],
  ["paragraph_end_date", "date NULL"], ["calendar_unit", "nvarchar(50) NULL"],
  ["calendar_unit_count", "int NULL"], ["percentage_complete", "int NULL"],
  ["paragraph_blocked", "nvarchar(20) NULL"], ["document_status_code", "nvarchar(30) NULL"],
  ["paragraph_changed_at", "datetime2(3) NULL"], ["document_changed_at", "datetime2(3) NULL"],
  ["contract_changed_at", "datetime2(3) NULL"], ["source_modified_at", "datetime2(3) NULL"],
  ["fabric_loaded_at", "datetime2(3) NULL"],
];

const failures = [];
const blockMatch = schema.match(/CREATE TABLE dbo\.AtriumInstallationBestekParagraph \(([\s\S]*?)\n\);/);
if (!blockMatch) failures.push("actieve snapshottabel ontbreekt");
const block = blockMatch?.[1] || "";
for (const [name, type] of expectedColumns) {
  const expression = new RegExp(`^\\s*${name}\\s+${type.replace(/[()]/g, "\\$&")}\\s*,?\\s*$`, "mi");
  if (!expression.test(block)) failures.push(`kolomcontract wijkt af: ${name} ${type}`);
}
if (!/snapshot_received_at\s+datetime2\(3\)\s+NOT NULL[\s\S]*?DEFAULT \(sysutcdatetime\(\)\)/i.test(block)) {
  failures.push("snapshot_received_at mist de lokale sysutcdatetime-default");
}
if (!/PRIMARY KEY \(business_unit, paragraph_key\)/i.test(block)) failures.push("actieve business key wijkt af");
if (!/CHECK \(nullif\(ltrim\(rtrim\(installation_code\)\), N''\) IS NOT NULL\)/i.test(block)) {
  failures.push("installation_code is niet tegen leegte beschermd");
}

for (const retired of [
  "BestekParagraphStage",
  "BestekParagraphLoadAudit",
  "PromoteInstallationBestekParagraph",
]) {
  if (schema.includes(retired) || properties.includes(retired)) failures.push(`vervallen SQL-component aanwezig: ${retired}`);
}

const activities = proposed.activities || [];
const pairs = activities.map((activity) => [
  activity?.properties?.source?.datasetSettings?.table,
  activity?.properties?.destination?.datasetSettings?.table,
  activity?.properties?.destination?.writeBehavior,
]);
const expectedPairs = [
  ["InstallationBase", "AtriumInstallationBase", "Upsert"],
  ["InstallationBestekParagraphs", "AtriumInstallationBestekParagraph", "Overwrite"],
];
if (proposed?.properties?.jobMode !== "Batch") failures.push("Copy Job staat niet op Batch");
if (JSON.stringify(pairs) !== JSON.stringify(expectedPairs)) failures.push("Copy Job-activiteiten wijken af");

if (activities.length === 2 && baseline.activities?.length === 1) {
  const first = activities[0]?.properties || {};
  const old = baseline.activities[0]?.properties || {};
  for (const property of ["destination", "translator", "typeConversionSettings", "enableStaging"]) {
    try { assert.deepEqual(first[property], old[property]); }
    catch { failures.push(`bestaande InstallationBase-activiteit wijzigde onnodig: ${property}`); }
  }
  if (JSON.stringify(first.source?.datasetSettings) !== JSON.stringify(old.source?.datasetSettings)) {
    failures.push("bestaande InstallationBase-brondataset wijzigde onnodig");
  }
  if (first.source?.changeDataSettings) failures.push("Batch-activiteit bevat nog incrementele bronmetadata");
}

const mappings = activities[1]?.properties?.translator?.mappings || [];
const sourceNames = mappings.map((mapping) => mapping?.source?.name);
const destinationNames = mappings.map((mapping) => mapping?.destination?.name);
const expectedNames = expectedColumns.map(([name]) => name);
if (JSON.stringify(sourceNames) !== JSON.stringify(expectedNames)) failures.push("bronmapping bevat niet exact de 39 velden in contractvolgorde");
if (JSON.stringify(destinationNames) !== JSON.stringify(expectedNames)) failures.push("doelmapping bevat niet exact de 39 velden in contractvolgorde");
if (sourceNames.includes("snapshot_received_at") || destinationNames.includes("snapshot_received_at")) {
  failures.push("snapshot_received_at mag niet vanuit Fabric worden gemapt");
}
if (activities[1]?.properties?.enableStaging !== false) failures.push("Fabric interne staging moet uit staan");
if (activities[1]?.properties?.typeConversionSettings?.typeConversion?.allowDataTruncation !== false) {
  failures.push("stille datatruncatie moet uit staan");
}

const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(full) : [full];
});
for (const sourceRoot of [path.join(root, "api/src"), path.join(root, "src")]) {
  for (const full of sourceFiles(sourceRoot)) {
    const content = fs.readFileSync(full, "utf8");
    if (/BestekParagraph(?:Snapshot)?(?:Stage|LoadAudit)|PromoteInstallationBestekParagraph/.test(content)) {
      failures.push(`consumer gebruikt vervallen snapshotcomponent: ${path.relative(root, full)}`);
    }
  }
}

if (failures.length) {
  console.error("Directe bestek-Copy-Jobvalidatie mislukt:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Directe bestek-Copy-Job geldig; Batch, twee activiteiten, 39 mappings, actieve overwrite en lokale ontvangsttijd bevestigd.");
