import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.resolve(root, "..", "..", "SQL DB", "tabel-definities.sql");

function read(relativePath) {
  return fs.readFileSync(path.resolve(root, relativePath), "utf8");
}

function assertIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(`${label}: ontbreekt: ${fragment}`);
    }
  }
}

const schema = fs.readFileSync(schemaPath, "utf8");
const queries = read("api/src/db/queries/certificates.sql.ts");
const service = read("api/src/services/certificationService.ts");
const routes = read("api/src/routes/installations.ts");
const tab = read("src/pages/Installations/CertificatesTab.jsx");
const detail = read("src/pages/Installations/InstallationDetails.jsx");
const adminFormsQuery = read("api/src/db/queries/adminForms.sql.ts");
const adminFormsService = read("api/src/services/adminFormsService.ts");
const adminFormsTab = read("src/pages/Admin/AdminFormsConfigTab.jsx");
const reportQuery = read("api/src/db/queries/formReportPdf.sql.ts");
const reportModel = read("api/src/services/formReportExportModelService.ts");
const reportRenderer = read("api/src/services/formReportHtmlRendererService.ts");
const properties = fs.readFileSync(path.resolve(root, "..", "..", "SQL DB", "Eigenschappen.sql"), "utf8");
const markMigration = fs.readFileSync(
  path.resolve(root, "..", "..", "SQL DB", "alter", "2026-08-28-certification-mark-catalog.sql"),
  "utf8"
);

assertIncludes(schema, [
  "CREATE TABLE dbo.InstallationCertificationRequirement (",
  "CREATE TABLE dbo.InstallationCertificationRequirementEvent (",
  "CREATE TABLE dbo.InstallationCertificate (",
  "CREATE TABLE dbo.InstallationCertificateEvent (",
  "CREATE TABLE dbo.InstallationCertificateScope (",
  "CREATE TABLE dbo.CertificateSendHistory (",
  "stored_file_id uniqueidentifier NULL",
  "CONSTRAINT FK_InstallationCertificate_ExactDocumentFile",
  "CONSTRAINT CK_InstallationCertificate_document_file_pair",
  "N'BMI', N'OAI_A', N'OAI_B', N'OAI_PZI'",
  "N'REQUIRED', N'NOT_REQUIRED', N'UNKNOWN'",
  "N'MAINTENANCE', N'INSPECTION'",
  "N'CURRENT', N'HISTORICAL', N'REVOKED'",
  "N'VERIFIED', N'UNVERIFIED', N'REJECTED'",
  "CONSTRAINT CK_InstallationCertificate_legacy_unverified",
  "CREATE TABLE dbo.CertificationMarkDefinition (",
  "certification_mark_key nvarchar(100) NULL",
  "FK_FormDefinition_CertificationMark",
  "FK_FormDefinitionVersion_CertificationMark",
], "schema");

assertIncludes(queries, [
  "InstallationCertificationRequirementEvent",
  "InstallationCertificateEvent",
  "CertificateSendHistory",
  "N'MANUAL'",
  "validity_status",
  "convert(varchar(18), c.row_version, 1)",
  "c.stored_file_id",
  "d.stored_file_id",
], "queries");

assertIncludes(service, [
  "CERTIFICATE_EXPIRY_WARNING_DAYS",
  "buildScopeSummary",
  'certificateStatus = relevant.length ? "UNKNOWN" : "MISSING"',
  "assertInstallationWritable",
], "service");

assertIncludes(routes, [
  '"/:code/certification"',
  '"/:code/certification/requirements/:scope"',
  '"/:code/certificates"',
  '"/:code/certificates/:certificateId/send-history"',
], "routes");

assertIncludes(tab, [
  "Certificeringsplicht wordt handmatig vastgesteld",
  "niet afgeleid uit Atrium-contracten",
  "Certificaat registreren",
  "Verzending registreren",
  "Dossierhistorie",
], "frontend");

assertIncludes(detail, [
  'key: "certification"',
  'label: "Certificering"',
  "<CertificationTab",
], "installation detail");

assertIncludes(adminFormsQuery, [
  "fd.certification_mark_key",
  "fv.certification_mark_key",
  "from dbo.CertificationMarkDefinition",
  "unknown or inactive certification mark",
  "(select certification_mark_key from dbo.FormDefinition where form_id = @formId)",
], "form administration query");

assertIncludes(adminFormsService, [
  "certificationMarkRows",
  "certification_marks:",
  "certificationMarkKey",
], "form administration service");

assertIncludes(adminFormsTab, [
  "Certificeringsbeeldmerk",
  "Geen beeldmerk op het voorblad",
  "selectedForm.certification_marks",
], "form administration frontend");

assertIncludes(reportQuery, [
  "fv.certification_mark_key",
  "left join dbo.CertificationMarkDefinition cmd",
  "certification_mark_asset_file_name",
], "report query");

assertIncludes(reportModel, [
  'ext === ".svg"',
  "certificationMarkAsset",
  "certificationMark: certificationMarkAsset(item)",
], "report export model");

assertIncludes(reportRenderer, [
  "cover-certification-mark",
  "model.assets.certificationMark.dataUrl",
], "report cover");

assertIncludes(properties, [
  "CCV_BMI_INSTALLATION",
  "CCV_BMI_DELIVERY",
  "CCV_BMI_MAINTENANCE",
  "ccv/CCV-Onderhoud.svg",
], "initial properties");

assertIncludes(markMigration, [
  "IF OBJECT_ID(N'dbo.CertificationMarkDefinition', N'U') IS NULL",
  "IF COL_LENGTH(N'dbo.FormDefinition', N'certification_mark_key') IS NULL",
  "IF COL_LENGTH(N'dbo.FormDefinitionVersion', N'certification_mark_key') IS NULL",
  "WHERE code = N'MAINT_BMI'",
], "certification mark migration");

for (const fileName of [
  "CCV-Installatie.svg",
  "CCV-Installatie.jpg",
  "CCV-Levering.svg",
  "CCV-Levering.jpg",
  "CCV-Onderhoud.svg",
  "CCV-Onderhoud.jpg",
]) {
  const assetPath = path.resolve(root, "src", "assets", "pdf", "ccv", fileName);
  if (!fs.existsSync(assetPath) || fs.statSync(assetPath).size === 0) {
    throw new Error(`certificeringsbeeldmerk ontbreekt of is leeg: ${fileName}`);
  }
}

const legacyDryRun = read("docs/validation/atrium-legacy-certification-dry-run-2026-08-21.md");
assertIncludes(legacyDryRun, [
  "AT_INSTKEUR",
  "0",
  "Er is niets geïmporteerd",
  "UNVERIFIED",
], "legacy dry-run");

console.log("Certificeringsarchitectuur geldig; certificaten en uitbreidbare PDF-beeldmerken gecontroleerd.");
