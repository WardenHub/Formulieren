import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.resolve(root, "..", "..", "SQL DB", "tabel-definities.sql");
const propertiesPath = path.resolve(root, "..", "..", "SQL DB", "Eigenschappen.sql");
const readerPath = path.resolve(
  process.env.USERPROFILE || "C:/Users/Jesse Veentjer",
  ".codex/projects/atrium-semantic-model-nl/deployment/ember-revamp/reader/source-proposed",
);
const read = (relative) => fs.readFileSync(path.resolve(root, relative), "utf8");
const readReader = (relative) => fs.readFileSync(path.resolve(readerPath, relative), "utf8");
const schema = fs.readFileSync(schemaPath, "utf8");
const properties = fs.readFileSync(propertiesPath, "utf8");
const queries = read("api/src/db/queries/inspections.sql.ts");
const service = read("api/src/services/inspectionService.ts");
const client = read("api/src/services/atriumReaderClient.ts");
const routes = read("api/src/routes/inspections.ts");
const controller = read("api/src/controllers/inspectionsController.ts");
const detail = read("src/pages/Inspections/InspectionCasePage.jsx");
const list = read("src/pages/Inspections/InspectionsPage.jsx");
const installationDetail = read("src/pages/Installations/InstallationDetails.jsx");
const logbookQueries = read("api/src/db/queries/installationLogbook.sql.ts");
const followUpQueries = read("api/src/db/queries/formFollowUps.sql.ts");
const readerProgram = readReader("Program.cs");
const readerCatalog = readReader("QueryCatalog.cs");
const readerService = readReader("AtriumQueryService.cs");
const readerOptions = readReader("ReaderOptions.cs");
const readerManifest = JSON.parse(readReader("queries.json"));
const readerInspectionQuery = readReader("Queries/inspection-workorders-by-installations.sql");
const operationalQueries = read("api/src/db/queries/installationOperational.sql.ts");

const failures = [];
const expect = (label, source, fragments) => {
  for (const fragment of fragments) if (!source.includes(fragment)) failures.push(`${label}; ontbreekt: ${fragment}`);
};

expect("A-C signalering", queries, ["requirement_status=N'REQUIRED'", "inspection.signal_horizon_days", "@candidates table", "@grouped table", "@createdCases", "source_fingerprint"]);
expect("D-F Atriumstatus", service, ['status === "A"', 'status === "I"', 'status === "U"', 'return "PLANNED_UNCONFIRMED"', 'return "PLANNED_CONFIRMED"', 'return "EXECUTED"']);
expect("G checklistgate", queries, ["blocking inspection documents incomplete", "blocking checklist items incomplete"]);
expect("H inspectieactie", schema, ["FollowUpActionInspectionCaseSource", "source_type IN (N'FORM', N'MANUAL', N'INSPECTION_CASE', N'IMPORT')"]);
expect("I generieke zichtbaarheid", installationDetail, ['key: "inspections"']);
expect("I generieke followups", followUpQueries, ["FollowUpAction", "p.stored_file_id"]);
expect("J-K FAIL", queries, ["N'REPAIR_REQUIRED'", "N'REPAIR_ACTION_CREATED'", "N'INSPECTION_REPAIR_OWNER'"]);
expect("L herinspectie", queries, ["N'REINSPECTION'", "parent_inspection_case_id", "N'REINSPECTION_CREATED'"]);
expect("M PASS certificaat", queries, ["inspection certificate required for pass", "source_inspection_case_id=@caseId", "N'CERTIFICATE_RECEIVED'"]);
expect("N-O completion", queries, ["current inspection report required", "pass conclusion and certificate required", "resulting_certificate_id is not null"]);
expect("P-Q immutable bestanden", schema, ["FK_InspectionCaseDocumentPackageItem_ExactDocumentFile", "FK_InspectionCaseReport_ExactDocumentFile"]);
expect("P-Q installatie-integriteit", queries, ["all inspection package documents must belong to the case installation", "exact inspection report file not found for case installation", "exact inspection document file does not belong to case installation"]);
expect("R pinversie", schema, ["FK_DrawingPin_ExactDocumentFile"]);
expect("R pinactie", queries, ["p.stored_file_id", "drawing_pins_json"]);
expect("R bewaarguard", logbookQueries, ["dbo.DrawingPin", "dbo.InspectionCaseReport", "dbo.InspectionCaseDocumentPackageItem", "dbo.InspectionCaseDocumentRequirement"]);
expect("S concurrency", queries, ["convert(binary(8),@rowVersion,1)", "inspection case version conflict", "inspection checklist version conflict", "inspection package version conflict"]);

for (const permission of ["inspection.view", "inspection.create", "inspection.update", "inspection.assign", "inspection.refresh_workorder", "inspection.checklist.manage", "inspection.package.prepare", "inspection.package.send", "inspection.report.register", "inspection.conclusion.process", "inspection.reinspection.create", "inspection.complete", "inspection.audit.view"]) {
  if (!properties.includes(`N'${permission}'`)) failures.push(`T permissionseed ontbreekt: ${permission}`);
  if (!routes.includes(`"${permission}"`)) failures.push(`T routepermission ontbreekt: ${permission}`);
  if (!detail.includes(`"${permission}"`) && !list.includes(`"${permission}"`) && permission !== "inspection.view") failures.push(`T UI permission ontbreekt: ${permission}`);
}
expect("T gescheiden toewijzing", routes, ["controller.assignment"]);
expect("T gescheiden toewijzingsservice", service, ["updateInspectionAssignmentSql", "choose either an assigned user or an assigned role"]);
expect("T gescheiden toewijzingscontroller", controller, ["updateInspectionAssignment"]);

for (const event of ["CASE_CREATED", "STATUS_CHANGED", "WORK_ORDER_REFRESHED", "CHECKLIST_CHANGED", "DOCUMENT_PACKAGE_PREPARED", "DOCUMENT_PACKAGE_SENT", "REPORT_RECEIVED", "CONCLUSION_PASS", "CONCLUSION_FAIL", "REPAIR_ACTION_CREATED", "REINSPECTION_CREATED", "CASE_COMPLETED"]) {
  if (!schema.includes(`N'${event}'`)) failures.push(`U eventschema ontbreekt: ${event}`);
  if (!queries.includes(`N'${event}'`) && !event.startsWith("CHECKLIST") && !event.startsWith("STATUS")) failures.push(`U mutatie-event ontbreekt: ${event}`);
}

expect("typed Ember Readerclient", client, ["findRelations:", "findProjects:", "findWorkorders:", "resolveContext(typeValue", "getInspectionWorkorders(", "getWorkorder:", "async function run(", "MAXIMUM_ROWS = 25", "installationCodes: codes", "payload?.truncated"]);
if (/export\s+(async\s+)?function\s+run\b/.test(client) || /queryId\s*[:=].*req\.(body|query)/.test(client)) failures.push("Readerclient exposeert een generieke queryroute");

expect("Reader correlation", readerProgram, ["CorrelationIds.GetOrCreate", 'httpResponse.Headers["X-Correlation-ID"]', "correlationId"]);
expect("Reader gecontroleerde fouten", readerProgram, ['error = "invalid_request"', 'error = "unknown_query"', 'error = "atrium_query_failed"', 'error = "atrium_query_timeout"']);
if (readerProgram.includes("exceptionType") || readerProgram.includes("detail = exception.Message")) failures.push("Reader exposeert technische foutdetails");
expect("Reader bounded response", readerService, ["rows.Count >= _options.MaximumRows", "bool Truncated", "string CorrelationId", "rows.Count, _options.MaximumRows, truncated"]);
expect("Reader minimale typed parameters", readerService, ["JsonValueKind.Array", "OdbcType.Date", "OdbcType.NVarChar", "definition.MaximumItems", "definition.ItemMaximumLength"]);
expect("Reader catalogguards", readerCatalog, ["ValidateSelectOnly", "ProhibitedTokenRegex", "IsInsideContentRoot", "unsupported parameter type", "unsafe parameter bound"]);
expect("Reader requestcontract", readerOptions, ["IReadOnlyDictionary<string, JsonElement>"]);
expect("Reader inspectiequery", readerInspectionQuery, [
  "IN (@installationCodes)",
  "@businessUnit",
  "@dateFrom",
  "@dateTo",
  "JOIN AT_CONTRSRT CS2",
  "CS2.GC_CODE IN ('200', '201')",
]);
if (/CONTAINING\s+'(?:INSPECT|KEUR)'/i.test(readerInspectionQuery)) {
  failures.push("Reader inspectieclassificatie gebruikt nog titelherkenning");
}
expect("Reader Business Unit-allowlist", readerOptions, ["AllowedBusinessUnits"]);
expect("Reader Business Unit-validatie", readerService, ["ValidateBusinessUnit", "AllowedBusinessUnits"]);

const queryIds = readerManifest.queries.map((query) => query.id);
for (const queryId of ["healthcheck", "customer-search-by-email", "installation-context-by-code", "contract-context-by-relation-code", "current-workorders-by-relation-code", "recent-workorders-by-relation-code", "workorder-paragraphs-by-document-id", "workorder-solutions-by-document-id", "workorder-followups-by-document-id", "relation-search", "project-search", "workorder-search", "context-resolve", "inspection-workorders-by-installations", "workorder-by-key"]) {
  if (!queryIds.includes(queryId)) failures.push(`Readercatalogus mist query: ${queryId}`);
}
if (queryIds.length !== 15 || new Set(queryIds).size !== 15) failures.push("Readercatalogus moet exact 15 unieke querys bevatten");
const inspectionDefinition = readerManifest.queries.find((query) => query.id === "inspection-workorders-by-installations");
if (inspectionDefinition?.parameters?.find((parameter) => parameter.name === "installationCodes")?.type !== "stringList") failures.push("Reader inspectiequery mist bounded stringList");
for (const queryId of ["relation-search", "project-search", "workorder-search", "context-resolve", "inspection-workorders-by-installations", "workorder-by-key"]) {
  const definition = readerManifest.queries.find((query) => query.id === queryId);
  if (!definition?.parameters?.some((parameter) => parameter.name === "businessUnit")) {
    failures.push(`Readerquery mist server-gevalideerde Business Unit: ${queryId}`);
  }
}

expect("UI overzicht", list, ["inspection-grid__row", "Nieuwe case", "Signalen bijwerken", "inspection-scope-picker"]);
expect("UI detail", detail, ["Voorbereidingschecklist", "Documentpakket", "Inspectierapport", "PASS verwerken", "FAIL en herstelactie", "Herinspectie aanmaken", "Case afronden", "Toon op tekening"]);

expect("set-based inspectieoverzicht", queries, [
  "listInspectionOverviewSql",
  "from operational o",
  "o.certification_required=1 or c.inspection_case_id is not null",
  "@attentionFilter<>N'CERTIFICATE_MISSING'",
  "@attentionFilter<>N'PLANNING_MISSING'",
  "@attentionFilter<>N'DOCUMENTS_MISSING'",
  "@attentionFilter<>N'REPORT_MISSING'",
  "@attentionFilter<>N'REINSPECTION_REQUIRED'",
  "@attentionFilter<>N'OPEN_ACTIONS'",
]);
expect("gedeelde operationele CTE", operationalQueries, ["export const operationalCtes", "certificate_scope_status", "inspection_summary", "operational as ("]);
expect("overzichtservice", service, ["listInspectionOverview", "ATTENTION_FILTER_SET", "certificateExpiringDays", "listInspectionOverviewSql"]);
expect("gescheiden overzicht- en caseroutes", routes, ['router.get("/",', 'router.get("/cases",']);
expect("overzichtfilters", list, ["CERTIFICATE_MISSING", "PLANNING_MISSING", "APPOINTMENT_UNCONFIRMED", "DOCUMENTS_MISSING", "REPORT_MISSING", "REINSPECTION_REQUIRED", "OPEN_ACTIONS"]);

const inspectedArtifacts = [schema, properties, queries, operationalQueries, service, client, routes, controller, detail, list, readerProgram, readerCatalog, readerService, readerOptions, readerInspectionQuery];
if (/\u2014/.test(inspectedArtifacts.join("\n"))) failures.push("inspectie-artifact bevat een em dash");

if (failures.length) {
  console.error("Inspectiearchitectuurvalidatie mislukt:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Inspectiearchitectuur geldig; scenario's A tot en met U, immutable bestanden, permissions en de gedeelde typed Readercapability zijn structureel gevalideerd.");
