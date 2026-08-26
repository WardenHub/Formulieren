import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sqlRoot = path.resolve(repoRoot, "..", "..", "SQL DB");
const schemaPath = path.join(sqlRoot, "tabel-definities.sql");
const seedsPath = path.join(sqlRoot, "Eigenschappen.sql");
const runtimeRoots = [path.join(repoRoot, "api", "src"), path.join(repoRoot, "src")];

const requiredTables = [
  "FollowUpStatusDefinition",
  "FollowUpAction",
  "FollowUpActionFormSource",
  "FollowUpActionInstallationContext",
  "FollowUpActionAtriumContext",
  "FollowUpActionAttachmentMap",
  "FollowUpActionEvent",
  "FollowUpReviewBatch",
  "FollowUpCategoryRule",
  "FollowUpActionReview",
  "WorkflowRoleDefinition",
  "WorkflowRoleMember",
  "FormDefinitionFollowUpRule",
];

const requiredStatuses = [
  "OPEN",
  "PLANNING_NODIG",
  "GEPLAND",
  "WACHTENOPDERDEN",
  "AFGEHANDELD",
  "AFGEWEZEN",
  "VERVALLEN",
  "INFORMATIEF",
];

function fail(message) {
  console.error(`[follow-up architecture] ${message}`);
  process.exitCode = 1;
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`required file missing: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function listFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

const schema = readRequired(schemaPath);
const seeds = readRequired(seedsPath);

for (const table of requiredTables) {
  if (!new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${table}\\s*\\(`, "i").test(schema)) {
    fail(`dbo.${table} ontbreekt in tabel-definities.sql`);
  }
}

if (/CREATE\s+TABLE\s+dbo\.(?:FormFollowUpAction|FormInstanceDocumentFollowUpActionMap)\b/i.test(schema)) {
  fail("het schema maakt nog een legacy-opvolgtabel aan");
}

for (const status of requiredStatuses) {
  if (!new RegExp(`N'${status}'`).test(seeds)) {
    fail(`status ${status} ontbreekt in Eigenschappen.sql`);
  }
}

if (!/FollowUpStatusDefinition[\s\S]*is_actionable[\s\S]*is_terminal[\s\S]*requires_review/i.test(schema)) {
  fail("centrale statussemantiek is onvolledig");
}

if (!/FollowUpActionAttachmentMap[\s\S]*stored_file_id/i.test(schema)) {
  fail("opvolgbijlagen verwijzen niet naar StoredFile");
}

if (!/FollowUpAction[\s\S]*priority[\s\S]*responsibility_type[\s\S]*assigned_role_code/i.test(schema)) {
  fail("het generieke actiemodel mist prioriteit, verantwoordelijkheid of workflowrol");
}

if (!/KAM_COORDINATOR/.test(seeds)) {
  fail("de functionele workflowrol KAM_COORDINATOR ontbreekt in de seeds");
}

const definitionRuleService = readRequired(path.join(repoRoot, "api", "src", "services", "formDefinitionFollowUpRuleService.ts"));
for (const trigger of ["ON_SUBMIT", "ON_FINALIZE", "CONDITIONAL"]) {
  if (!definitionRuleService.includes(trigger)) {
    fail(`formulierworkflows ondersteunen ${trigger} niet`);
  }
}

if (!/FollowUpActionReview[\s\S]*status_at_review[\s\S]*customer_discussed[\s\S]*override_reason/i.test(schema)) {
  fail("het immutable reviewbewijs mist verplichte reviewvelden");
}

const runtimeFiles = runtimeRoots
  .flatMap(listFiles)
  .filter((filePath) => /\.(?:ts|tsx|js|jsx)$/.test(filePath))
  .filter((filePath) => !filePath.endsWith("installationNotes.sql-ZwarteLaptop.ts"));

for (const filePath of runtimeFiles) {
  const contents = readRequired(filePath);
  if (/dbo\.(?:FormFollowUpAction|FormInstanceDocumentFollowUpActionMap)\b/i.test(contents)) {
    fail(`${path.relative(repoRoot, filePath)} verwijst nog naar een legacy-opvolgtabel`);
  }
}

const followUpQueries = readRequired(path.join(repoRoot, "api", "src", "db", "queries", "formFollowUps.sql.ts"));
for (const eventType of ["CREATED", "CONTENT_UPDATED", "STATUS_CHANGED", "NOTE_UPDATED", "CERTIFICATE_IMPACT_CHANGED"]) {
  if (!followUpQueries.includes(`N'${eventType}'`)) {
    fail(`eventtype ${eventType} ontbreekt in de action-writes`);
  }
}

const formQueries = readRequired(path.join(repoRoot, "api", "src", "db", "queries", "forms.sql.ts"));
if (!formQueries.includes("N'ATTACHMENTS_REPLACED'")) {
  fail("wijzigingen aan opvolgbijlagen worden niet geaudit");
}

if (!process.exitCode) {
  console.log(`[follow-up architecture] OK; ${requiredTables.length} canonieke tabellen en ${requiredStatuses.length} statussen gevalideerd`);
}
