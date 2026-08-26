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
  'key: "certificates"',
  'label: "Certificaten"',
  "<CertificatesTab",
], "installation detail");

const legacyDryRun = read("docs/validation/atrium-legacy-certification-dry-run-2026-08-21.md");
assertIncludes(legacyDryRun, [
  "AT_INSTKEUR",
  "0",
  "Er is niets geïmporteerd",
  "UNVERIFIED",
], "legacy dry-run");

console.log("Certificeringsarchitectuur geldig; 7 controlesets geslaagd.");
