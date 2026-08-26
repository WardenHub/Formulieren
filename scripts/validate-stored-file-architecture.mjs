import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sqlRoot = path.resolve(repoRoot, "..", "..", "SQL DB");
const schemaPath = path.join(sqlRoot, "tabel-definities.sql");
const seedsPath = path.join(sqlRoot, "Eigenschappen.sql");
const queryRoot = path.join(repoRoot, "api", "src", "db", "queries");

const domainTables = [
  "UserProfileAvatar",
  "UserProfileSignature",
  "InstallationDocument",
  "InstallationProgramming",
  "FormGuidanceMediaAsset",
  "FormInstanceDocument",
  "FormAssistantAudio",
];

const physicalColumns = [
  "storage_provider",
  "storage_container",
  "storage_key",
  "storage_url",
  "file_name",
  "mime_type",
  "file_extension",
  "file_size_bytes",
  "checksum_sha256",
  "file_last_modified_at",
  "file_last_modified_by",
];

const requiredStoredFileColumns = [
  "stored_file_id",
  "storage_provider",
  "storage_container",
  "storage_key",
  "storage_url",
  "file_name",
  "mime_type",
  "file_extension",
  "file_size_bytes",
  "checksum_sha256",
  "uploaded_at",
  "uploaded_by",
  "is_deleted",
  "deleted_at",
  "deleted_by",
];

function fail(message) {
  console.error(`[stored-file architecture] ${message}`);
  process.exitCode = 1;
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`required file missing: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function tableBody(sql, tableName) {
  const pattern = new RegExp(
    `CREATE\\s+TABLE\\s+dbo\\.${tableName}\\s*\\(([\\s\\S]*?)\\n\\);\\s*\\nGO`,
    "i"
  );
  return sql.match(pattern)?.[1] ?? null;
}

function listFilesRecursively(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFilesRecursively(fullPath) : [fullPath];
  });
}

const schema = readRequired(schemaPath);
const seeds = readRequired(seedsPath);
const storedFileBody = tableBody(schema, "StoredFile");

if (!storedFileBody) {
  fail("dbo.StoredFile ontbreekt in tabel-definities.sql");
} else {
  for (const column of requiredStoredFileColumns) {
    if (!new RegExp(`^\\s*${column}\\s+`, "im").test(storedFileBody)) {
      fail(`dbo.StoredFile mist kolom ${column}`);
    }
  }
}

for (const tableName of domainTables) {
  const body = tableBody(schema, tableName);
  if (!body) {
    fail(`dbo.${tableName} ontbreekt in tabel-definities.sql`);
    continue;
  }

  if (!/^\s*stored_file_id\s+/im.test(body)) {
    fail(`dbo.${tableName} mist stored_file_id`);
  }

  for (const column of physicalColumns) {
    if (new RegExp(`^\\s*${column}\\s+`, "im").test(body)) {
      fail(`dbo.${tableName} bevat nog fysieke bestandskolom ${column}`);
    }
  }
}

for (const [label, contents] of [
  ["tabel-definities.sql", schema],
  ["Eigenschappen.sql", seeds],
]) {
  if (/software_wachtwoord/i.test(contents)) {
    fail(`${label} bevat nog software_wachtwoord`);
  }
}

const staleAliasPattern = new RegExp(
  `\\b(?:d|p|gma)\\.(?:${physicalColumns.join("|")})\\b`,
  "i"
);
const staleInsertPattern = new RegExp(
  `insert\\s+into\\s+dbo\\.(${domainTables.join("|")})\\s*\\(([\\s\\S]*?)\\)\\s*(?:values|select)`,
  "gi"
);

for (const filePath of listFilesRecursively(queryRoot).filter((item) => item.endsWith(".ts"))) {
  const contents = readRequired(filePath);
  const relative = path.relative(repoRoot, filePath);

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (staleAliasPattern.test(line)) {
      fail(`${relative}:${index + 1} verwijst nog rechtstreeks naar een fysieke domeinkolom`);
    }
  }

  for (const match of contents.matchAll(staleInsertPattern)) {
    const columns = match[2]
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const stale = columns.filter((column) => physicalColumns.includes(column));
    if (stale.length) {
      fail(`${relative} schrijft ${match[1]} nog met ${stale.join(", ")}`);
    }
  }
}

if (!process.exitCode) {
  console.log(
    `[stored-file architecture] OK; ${domainTables.length} domeintabellen verwijzen uitsluitend via stored_file_id`
  );
}
