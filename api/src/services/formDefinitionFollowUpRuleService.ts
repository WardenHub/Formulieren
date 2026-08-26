import { sqlQuery } from "../db/index.js";
import {
  getFormDefinitionFollowUpRulesSql,
  upsertFormDefinitionFollowUpSql,
} from "../db/queries/formDefinitionFollowUpRules.sql.js";
import { getUserAuditActor } from "../utils/userIdentity.js";

type TriggerType = "ON_SUBMIT" | "ON_FINALIZE" | "CONDITIONAL";

type RuleRow = {
  form_follow_up_rule_id: string;
  trigger_type: TriggerType;
  condition_json: string | Record<string, any> | null;
  action_title_template: string;
  action_description_template: string | null;
  category: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  responsibility_type: "WARDENBURG" | "CUSTOMER" | "THIRD_PARTY" | "UNSPECIFIED";
  assigned_role_code: string | null;
  due_after_days: number | null;
  certificate_impact: "yes" | "no" | null;
  visibility: "INTERNAL_ONLY" | "CUSTOMER_VISIBLE";
};

export type DefinitionFollowUpPreview = {
  kind: "workflow";
  fingerprint: string;
  questionName: string;
  questionType: "definition-rule";
  rowIndex: null;
  itemCode: string;
  workflowTitle: string;
  workflowDescription: string | null;
  category: string | null;
  certificateImpact: "yes" | "no" | null;
  priority: string;
  responsibilityType: string;
  assignedRoleCode: string | null;
  dueAfterDays: number | null;
  customerVisible: boolean;
  triggerType: TriggerType;
};

function parsePositiveId(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseCondition(value: RuleRow["condition_json"]) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    throw new Error("FormDefinitionFollowUpRule condition_json is ongeldig");
  }
}

function comparable(value: any) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim().toLowerCase();
}

function getPath(root: any, path: unknown): any {
  const parts = String(path || "").split(".").map((item) => item.trim()).filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function evaluateLeaf(condition: any, answers: Record<string, any>) {
  const field = String(condition?.field || "").trim();
  if (!field) throw new Error("FormDefinitionFollowUpRule condition mist field");
  const operator = String(condition?.operator || "equals").trim().toLowerCase();
  const actual = getPath(answers, field);
  const expected = condition?.value;
  const actualComparable = comparable(actual);
  const expectedComparable = comparable(expected);

  switch (operator) {
    case "equals": return actualComparable === expectedComparable;
    case "not_equals": return actualComparable !== expectedComparable;
    case "contains": return actualComparable.includes(expectedComparable);
    case "in": return Array.isArray(expected) && expected.some((item) => comparable(item) === actualComparable);
    case "not_in": return Array.isArray(expected) && expected.every((item) => comparable(item) !== actualComparable);
    case "is_empty": return actual == null || actualComparable === "" || (Array.isArray(actual) && actual.length === 0);
    case "is_not_empty": return !(actual == null || actualComparable === "" || (Array.isArray(actual) && actual.length === 0));
    case "truthy": return ["true", "1", "yes", "ja", "y"].includes(actualComparable);
    case "falsy": return ["", "false", "0", "no", "nee", "n"].includes(actualComparable);
    case "greater_than": return Number(actual) > Number(expected);
    case "greater_or_equal": return Number(actual) >= Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    case "less_or_equal": return Number(actual) <= Number(expected);
    default: throw new Error(`FormDefinitionFollowUpRule operator ${operator} wordt niet ondersteund`);
  }
}

function evaluateCondition(condition: any, answers: Record<string, any>): boolean {
  if (!condition) return true;
  if (Array.isArray(condition.all)) return condition.all.every((item: any) => evaluateCondition(item, answers));
  if (Array.isArray(condition.any)) return condition.any.some((item: any) => evaluateCondition(item, answers));
  if (condition.not) return !evaluateCondition(condition.not, answers);
  return evaluateLeaf(condition, answers);
}

function renderTemplate(template: unknown, answers: Record<string, any>, maxLength: number) {
  const rendered = String(template || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, path) => {
    const value = getPath(answers, path);
    if (value == null) return "";
    if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }).trim();
  return rendered.slice(0, maxLength);
}

async function loadRules(formInstanceId: number, triggers: TriggerType[]) {
  const rows = await sqlQuery(getFormDefinitionFollowUpRulesSql, {
    formInstanceId,
    triggersJson: JSON.stringify(triggers),
  });
  return (Array.isArray(rows) ? rows : []) as RuleRow[];
}

function toPreview(rule: RuleRow, answers: Record<string, any>): DefinitionFollowUpPreview | null {
  const condition = parseCondition(rule.condition_json);
  if (rule.trigger_type === "CONDITIONAL" && !condition) {
    throw new Error("CONDITIONAL FormDefinitionFollowUpRule mist condition_json");
  }
  if (!evaluateCondition(condition, answers)) return null;
  const ruleId = String(rule.form_follow_up_rule_id).trim();
  const title = renderTemplate(rule.action_title_template, answers, 300);
  if (!title) throw new Error(`FormDefinitionFollowUpRule ${ruleId} levert geen actietitel op`);
  const description = renderTemplate(rule.action_description_template, answers, 2000) || null;
  return {
    kind: "workflow",
    fingerprint: `definition-rule|${ruleId}|${rule.trigger_type}`,
    questionName: `@definition-rule:${ruleId}`,
    questionType: "definition-rule",
    rowIndex: null,
    itemCode: ruleId,
    workflowTitle: title,
    workflowDescription: description,
    category: rule.category || null,
    certificateImpact: rule.certificate_impact || null,
    priority: rule.priority || "NORMAL",
    responsibilityType: rule.responsibility_type || "WARDENBURG",
    assignedRoleCode: rule.assigned_role_code || null,
    dueAfterDays: rule.due_after_days == null ? null : Number(rule.due_after_days),
    customerVisible: rule.visibility === "CUSTOMER_VISIBLE",
    triggerType: rule.trigger_type,
  };
}

export async function previewDefinitionFollowUps(input: {
  formInstanceId: unknown;
  answers: Record<string, any>;
  triggers?: TriggerType[];
}) {
  const formInstanceId = parsePositiveId(input.formInstanceId);
  if (formInstanceId == null) throw new Error("previewDefinitionFollowUps: form_instance_id ontbreekt");
  const triggers: TriggerType[] = input.triggers?.length
    ? input.triggers
    : ["ON_SUBMIT", "CONDITIONAL"];
  const rules = await loadRules(formInstanceId, triggers);
  return rules.map((rule) => toPreview(rule, input.answers || {})).filter(Boolean) as DefinitionFollowUpPreview[];
}

export async function syncDefinitionFollowUps(input: {
  formInstanceId: unknown;
  answers: Record<string, any>;
  user: any;
  triggers?: TriggerType[];
}) {
  const formInstanceId = parsePositiveId(input.formInstanceId);
  if (formInstanceId == null) throw new Error("syncDefinitionFollowUps: form_instance_id ontbreekt");
  const items = await previewDefinitionFollowUps({ formInstanceId, answers: input.answers, triggers: input.triggers });
  const actor = getUserAuditActor(input.user);
  const counts = { inserted: 0, updated: 0, unchanged_terminal: 0 };
  for (const item of items) {
    const rows = await sqlQuery(upsertFormDefinitionFollowUpSql, {
      formInstanceId,
      sourceFingerprint: item.fingerprint,
      sourceQuestionName: item.questionName,
      sourceItemCode: item.itemCode,
      triggerType: item.triggerType,
      workflowTitle: item.workflowTitle,
      workflowDescription: item.workflowDescription,
      category: item.category,
      priority: item.priority,
      responsibilityType: item.responsibilityType,
      assignedRoleCode: item.assignedRoleCode,
      dueAfterDays: item.dueAfterDays,
      certificateImpact: item.certificateImpact,
      customerVisible: item.customerVisible ? 1 : 0,
      actor,
    });
    const result = String(rows?.[0]?.sync_result || "").toLowerCase();
    if (result === "inserted") counts.inserted += 1;
    else if (result === "updated") counts.updated += 1;
    else if (result === "unchanged_terminal") counts.unchanged_terminal += 1;
  }
  return { ok: true, count: items.length, counts, items };
}
