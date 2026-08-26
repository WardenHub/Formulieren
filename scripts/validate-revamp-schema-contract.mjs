import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sqlRoot = path.resolve(root, "..", "..", "SQL DB");
const schemaPath = path.join(sqlRoot, "tabel-definities.sql");
const propertiesPath = path.join(sqlRoot, "Eigenschappen.sql");
const schema = fs.readFileSync(schemaPath, "utf8");
const properties = fs.readFileSync(propertiesPath, "utf8");

const requiredTables = [
  "StoredFile",
  "AtriumInstallationBase",
  "AtriumInstallationBestekParagraph",
  "FormInstanceContext",
  "InspectionCaseWorkOrderSnapshot",
  "FollowUpAction",
  "InstallationDocument",
  "DrawingPin",
  "InstallationCertificationRequirement",
  "InstallationCertificationRequirementEvent",
  "InstallationCertificate",
  "InstallationCertificateEvent",
  "InstallationCertificateScope",
  "CertificateSendHistory",
];

const requiredFragments = [
  "CONSTRAINT UQ_InstallationDocument_DocumentStoredFile",
  "CONSTRAINT FK_DrawingPin_ExactDocumentFile",
  "CONSTRAINT FK_InstallationCertificate_ExactDocumentFile",
  "CONSTRAINT CK_InstallationCertificate_document_file_pair",
  "CHECK (source_system IN (N'ATRIUM_READER', N'FABRIC_GOLD', N'EMBER_DIRECTORY', N'ENTRA'))",
  "CHECK (context_type IN (N'RELATION', N'PROJECT', N'WORK_ORDER', N'INSTALLATION', N'EMPLOYEE'))",
  "CHECK (certificate_type IN (N'MAINTENANCE', N'INSPECTION'))",
  "CHECK (record_status IN (N'CURRENT', N'HISTORICAL', N'REVOKED'))",
  "CHECK (verification_status IN (N'VERIFIED', N'UNVERIFIED', N'REJECTED'))",
  "CONSTRAINT CK_InstallationCertificate_legacy_unverified",
  "DF_AtriumInstallationBestekParagraph_received DEFAULT (sysutcdatetime())",
];

const failures = [];
for (const table of requiredTables) {
  const matches = schema.match(new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${table}\\s*\\(`, "gi")) || [];
  if (matches.length !== 1) failures.push(`dbo.${table}; verwacht 1 CREATE TABLE, gevonden ${matches.length}`);
  if (!schema.includes(`DROP TABLE dbo.${table};`)) failures.push(`dbo.${table}; DROP ontbreekt`);
}

for (const fragment of requiredFragments) {
  if (!schema.includes(fragment)) failures.push(`schemafragment ontbreekt: ${fragment}`);
}

for (const retiredTable of [
  "FormContextDirectoryEntry",
  "FormContextDirectoryRelation",
  "BestekParagraphStage",
  "BestekParagraphLoadAudit",
]) {
  if (new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${retiredTable}\\s*\\(`, "i").test(schema)) {
    failures.push(`vervallen directorytabel wordt nog aangemaakt: dbo.${retiredTable}`);
  }
  if (properties.includes(`DELETE FROM dbo.${retiredTable};`)) {
    failures.push(`vervallen directorytabel staat nog in seed-cleanup: dbo.${retiredTable}`);
  }
}

for (const retiredFragment of ["PromoteInstallationBestekParagraph", "snapshot-promotion", "sp_getapplock"]) {
  if (schema.includes(retiredFragment) || properties.includes(retiredFragment)) {
    failures.push(`vervallen snapshotcomponent aanwezig: ${retiredFragment}`);
  }
}

if (!/CONSTRAINT\s+PK_AtriumInstallationBestekParagraph\s+PRIMARY KEY\s*\(business_unit,\s*paragraph_key\)/i.test(schema)) {
  failures.push("AtriumInstallationBestekParagraph; business key moet business_unit + paragraph_key zijn");
}

for (const [label, content] of [["tabel-definities.sql", schema], ["Eigenschappen.sql", properties]]) {
  if (/software_wachtwoord/i.test(content)) failures.push(`${label}; bevat software_wachtwoord`);
  if (/\u2014/.test(content)) failures.push(`${label}; bevat een em dash`);
}

const storedFileCreate = schema.indexOf("CREATE TABLE dbo.StoredFile (");
const installationDocumentCreate = schema.indexOf("CREATE TABLE dbo.InstallationDocument (");
const drawingPinCreate = schema.indexOf("CREATE TABLE dbo.DrawingPin (");
const certificateCreate = schema.indexOf("CREATE TABLE dbo.InstallationCertificate (");
if (!(storedFileCreate >= 0 && storedFileCreate < installationDocumentCreate)) {
  failures.push("creatievolgorde; StoredFile moet voor InstallationDocument staan");
}
if (!(installationDocumentCreate >= 0 && installationDocumentCreate < drawingPinCreate && installationDocumentCreate < certificateCreate)) {
  failures.push("creatievolgorde; InstallationDocument moet voor DrawingPin en InstallationCertificate staan");
}

if (failures.length) {
  console.error("Revamp SQL-schema-/contractvalidatie mislukt:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Revamp SQL-schema-/contractvalidatie geldig; ${requiredTables.length} tabellen en ${requiredFragments.length} kerncontracten gecontroleerd.`);
