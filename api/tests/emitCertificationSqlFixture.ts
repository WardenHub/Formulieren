import { readFileSync } from "node:fs";
import { certificationPolicyCtes } from "../src/db/queries/certificationPolicy.sql.js";
let policy = certificationPolicyCtes.replaceAll("@certificateExpiringDays", "90");
for (const [original, fixture] of Object.entries({
  "dbo.InstallationCertificateScope": "fixture_scope",
  "dbo.InstallationCertificationRequirement": "fixture_requirement",
  "dbo.InstallationCertificate": "fixture_certificate",
  "dbo.Installation": "fixture_installation",
  "dbo.StoredFile": "fixture_file",
})) policy = policy.replaceAll(original, fixture);
console.log(readFileSync(new URL("./certificationPolicySql.fixture.sql", import.meta.url), "utf8").replace("{{POLICY}}", policy));
