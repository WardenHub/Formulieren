import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.resolve(root, "..", "..", "SQL DB", "tabel-definities.sql");

const checks = [
  {
    name: "canonical drawing pin schema",
    file: schemaPath,
    patterns: [
      /CREATE TABLE dbo\.DrawingPin\s*\(/,
      /installation_document_id uniqueidentifier NOT NULL/,
      /stored_file_id uniqueidentifier NOT NULL/,
      /x_normalized decimal\(9,8\) NOT NULL/,
      /y_normalized decimal\(9,8\) NOT NULL/,
      /CHECK \(x_normalized >= 0 AND x_normalized <= 1\)/,
      /CHECK \(y_normalized >= 0 AND y_normalized <= 1\)/,
      /CREATE TABLE dbo\.FollowUpActionDrawingPinMap\s*\(/,
      /CONSTRAINT UQ_InstallationDocument_DocumentStoredFile[\s\S]*UNIQUE \(document_id, stored_file_id\)/,
      /CONSTRAINT FK_DrawingPin_ExactDocumentFile[\s\S]*FOREIGN KEY \(installation_document_id, stored_file_id\)[\s\S]*REFERENCES dbo\.InstallationDocument\(document_id, stored_file_id\)/,
    ],
  },
  {
    name: "drawing pin API",
    file: path.join(root, "api", "src", "db", "queries", "drawingPins.sql.ts"),
    patterns: [
      /lower\(coalesce\(sf\.mime_type, N''\)\) = N'application\/pdf'/,
      /convert\(varchar\(18\), p\.row_version, 1\)/,
      /drawing pin version conflict/,
      /ACTION_LINKED/,
      /ACTION_UNLINKED/,
      /source_type,[\s\S]*N'MANUAL'/,
      /p\.stored_file_id/,
      /d\.stored_file_id/,
    ],
  },
  {
    name: "physical deletion guard",
    file: path.join(root, "api", "src", "db", "queries", "installationLogbook.sql.ts"),
    patterns: [
      /from dbo\.DrawingPin p[\s\S]*p\.installation_document_id = d\.document_id/,
      /from dbo\.InstallationCertificate c[\s\S]*c\.installation_document_id = d\.document_id/,
      /audit_reference_count/,
    ],
  },
  {
    name: "PDF viewer uses normalized coordinates",
    file: path.join(root, "src", "pages", "Installations", "DrawingPinsTab.jsx"),
    patterns: [
      /pdfjs-dist/,
      /x_normalized: x/,
      /y_normalized: y/,
      /Number\(pin\.x_normalized\) \* 100/,
      /Number\(pin\.y_normalized\) \* 100/,
      /downloadInstallationDocumentFile/,
    ],
    forbidden: [/upload.*drawing/i, /copy.*pdf/i],
  },
  {
    name: "deterministic drawing navigation",
    file: path.join(root, "src", "pages", "Installations", "NotesTab.jsx"),
    patterns: [/tab=drawings&drawing=/, /&page=/, /&pin=/, /Toon op tekening/],
  },
  {
    name: "monitor drawing navigation",
    file: path.join(root, "src", "pages", "Monitor", "FormsMonitorDetailPage.jsx"),
    patterns: [/tab=drawings&drawing=/, /Open op tekening|Toon op tekening/],
  },
  {
    name: "bindende requirements",
    file: path.join(root, "docs", "requirements", "ember-installation-map-and-drawing-pins-2026-08-21.md"),
    patterns: [/Leaflet/, /Genormaliseerde x en y liggen tussen 0 en 1/, /StoredFile/, /FollowUpActionDrawingPinMap/],
  },
];

const failures = [];

for (const check of checks) {
  if (!fs.existsSync(check.file)) {
    failures.push(`${check.name}; bestand ontbreekt: ${check.file}`);
    continue;
  }
  const content = fs.readFileSync(check.file, "utf8");
  for (const pattern of check.patterns || []) {
    if (!pattern.test(content)) failures.push(`${check.name}; patroon ontbreekt: ${pattern}`);
  }
  for (const pattern of check.forbidden || []) {
    if (pattern.test(content)) failures.push(`${check.name}; verboden patroon gevonden: ${pattern}`);
  }
}

if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, "utf8");
  const start = schema.indexOf("CREATE TABLE dbo.DrawingPin (");
  const end = start >= 0 ? schema.indexOf("\nGO", start) : -1;
  const drawingPinBlock = start >= 0 && end > start ? schema.slice(start, end) : "";
  if (/viewport_x|viewport_y/i.test(drawingPinBlock)) {
    failures.push("canonical drawing pin schema; pin bevat een verboden viewportreferentie");
  }
}

if (failures.length) {
  console.error("Drawing-pinarchitectuur ongeldig:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Drawing-pinarchitectuur geldig; ${checks.length} controlesets geslaagd.`);
