import { randomUUID } from "node:crypto";

import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import {
  getAdminUserFeedbackSql,
  getActiveUserFeedbackReplySql,
  getMyUserFeedbackSql,
  getUserFeedbackByIdSql,
  insertUserFeedbackReplySql,
  insertUserFeedbackSql,
  updateUserFeedbackReplySql,
  updateUserFeedbackStatusSql,
} from "../db/queries/feedback.sql.js";
import {
  getUserAuditActor,
  getUserDisplayNameSnapshot,
  getUserEmail,
  getUserObjectId,
} from "../utils/userIdentity.js";

const FEEDBACK_SENTIMENTS = new Set(["positive", "negative"]);
const FEEDBACK_STATUSES = new Set(["OPEN", "IN_BEHANDELING", "BEANTWOORD", "GESLOTEN"]);

function normalizeOptionalString(value: any) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function normalizeOptionalBigInt(value: any) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("invalid feedback context id");
  }
  return parsed;
}

function normalizeSentiment(value: any) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!FEEDBACK_SENTIMENTS.has(normalized)) {
    throw new Error("invalid feedback sentiment");
  }
  return normalized;
}

function normalizeStatus(value: any) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!FEEDBACK_STATUSES.has(normalized)) {
    throw new Error("invalid feedback status");
  }
  return normalized;
}

function normalizeReplyBody(value: any) {
  const body = String(value ?? "").trim();
  if (!body) {
    throw new Error("feedback reply required");
  }
  return body;
}

function mapFeedbackRow(row: any) {
  return {
    feedback_id: row.feedback_id,
    sentiment: row.sentiment ?? "positive",
    status: row.status ?? "OPEN",
    message_markdown: row.message_markdown ?? null,
    user_object_id: row.user_object_id ?? null,
    user_display_name_snapshot: row.user_display_name_snapshot ?? null,
    user_email_snapshot: row.user_email_snapshot ?? null,
    source_path: row.source_path ?? null,
    installation_code: row.installation_code ?? null,
    form_instance_id: row.form_instance_id == null ? null : Number(row.form_instance_id),
    parent_instance_id: row.parent_instance_id == null ? null : Number(row.parent_instance_id),
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
  };
}

function mapFeedbackReplyRow(row: any) {
  return {
    feedback_reply_id: row.feedback_reply_id,
    feedback_id: row.feedback_id,
    reply_markdown: row.reply_markdown ?? "",
    admin_user_object_id: row.admin_user_object_id ?? null,
    admin_display_name_snapshot: row.admin_display_name_snapshot ?? null,
    admin_email_snapshot: row.admin_email_snapshot ?? null,
    is_active: row.is_active === true || row.is_active === 1,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
  };
}

function mapFeedbackRecordsets(recordsets: any[]) {
  const feedbackRows = Array.isArray(recordsets?.[0]) ? recordsets[0] : [];
  const replyRows = Array.isArray(recordsets?.[1]) ? recordsets[1] : [];

  const byId = new Map<string, any>();
  for (const row of feedbackRows) {
    const item = mapFeedbackRow(row);
    byId.set(String(item.feedback_id), {
      ...item,
      active_reply: null,
    });
  }

  for (const row of replyRows) {
    const reply = mapFeedbackReplyRow(row);
    const target = byId.get(String(reply.feedback_id));
    if (!target) continue;
    target.active_reply = reply;
  }

  const items = [...byId.values()];
  return {
    items,
    summary: {
      total_count: items.length,
      open_count: items.filter((item) =>
        ["OPEN", "IN_BEHANDELING"].includes(String(item.status || "").trim().toUpperCase())
      ).length,
      answered_count: items.filter((item) => String(item.status || "").trim().toUpperCase() === "BEANTWOORD").length,
      closed_count: items.filter((item) => String(item.status || "").trim().toUpperCase() === "GESLOTEN").length,
      positive_count: items.filter((item) => item.sentiment === "positive").length,
      negative_count: items.filter((item) => item.sentiment === "negative").length,
    },
  };
}

async function getFeedbackItemOrThrow(feedbackId: string) {
  const result: any = await sqlQueryRaw(getUserFeedbackByIdSql, {
    feedbackId,
  });
  const feedbackRows = Array.isArray(result?.recordsets?.[0]) ? result.recordsets[0] : [];
  const replyRows = Array.isArray(result?.recordsets?.[1]) ? result.recordsets[1] : [];
  const feedbackRow = feedbackRows[0] ?? null;

  if (!feedbackRow?.feedback_id) {
    throw new Error("feedback not found");
  }

  return {
    ...mapFeedbackRow(feedbackRow),
    active_reply: replyRows[0] ? mapFeedbackReplyRow(replyRows[0]) : null,
  };
}

export async function getMyFeedback(user: any) {
  const userObjectId = normalizeOptionalString(getUserObjectId(user));
  if (!userObjectId) throw new Error("missing user object id");

  const result: any = await sqlQueryRaw(getMyUserFeedbackSql, {
    userObjectId,
  });

  return mapFeedbackRecordsets(result?.recordsets || []);
}

export async function createMyFeedback(payload: any, user: any) {
  const userObjectId = normalizeOptionalString(getUserObjectId(user));
  if (!userObjectId) throw new Error("missing user object id");

  const feedbackId = randomUUID();

  await sqlQuery(insertUserFeedbackSql, {
    feedbackId,
    sentiment: normalizeSentiment(payload?.sentiment),
    messageMarkdown: normalizeOptionalString(payload?.message_markdown ?? payload?.message ?? payload?.text),
    userObjectId,
    userDisplayNameSnapshot: normalizeOptionalString(getUserDisplayNameSnapshot(user)),
    userEmailSnapshot: normalizeOptionalString(getUserEmail(user)),
    sourcePath: normalizeOptionalString(payload?.source_path),
    installationCode: normalizeOptionalString(payload?.installation_code),
    formInstanceId: normalizeOptionalBigInt(payload?.form_instance_id),
    parentInstanceId: normalizeOptionalBigInt(payload?.parent_instance_id),
    actor: getUserAuditActor(user),
  });

  return {
    ok: true,
    item: await getFeedbackItemOrThrow(feedbackId),
  };
}

export async function getAdminFeedback(query: any) {
  const status = normalizeOptionalString(query?.status);
  const sentiment = normalizeOptionalString(query?.sentiment);

  const result: any = await sqlQueryRaw(getAdminUserFeedbackSql, {
    status: status ? normalizeStatus(status) : null,
    sentiment: sentiment ? normalizeSentiment(sentiment) : null,
  });

  return mapFeedbackRecordsets(result?.recordsets || []);
}

export async function updateAdminFeedbackStatus(feedbackId: string, payload: any, user: any) {
  const cleanFeedbackId = String(feedbackId || "").trim();
  if (!cleanFeedbackId) throw new Error("feedback not found");

  await getFeedbackItemOrThrow(cleanFeedbackId);

  await sqlQuery(updateUserFeedbackStatusSql, {
    feedbackId: cleanFeedbackId,
    status: normalizeStatus(payload?.status),
    actor: getUserAuditActor(user),
  });

  return {
    ok: true,
    item: await getFeedbackItemOrThrow(cleanFeedbackId),
  };
}

export async function upsertAdminFeedbackReply(feedbackId: string, payload: any, user: any) {
  const cleanFeedbackId = String(feedbackId || "").trim();
  if (!cleanFeedbackId) throw new Error("feedback not found");

  const existingFeedback = await getFeedbackItemOrThrow(cleanFeedbackId);
  const replyMarkdown = normalizeReplyBody(payload?.reply_markdown ?? payload?.reply ?? payload?.message);
  const actorUserObjectId = normalizeOptionalString(getUserObjectId(user));
  const actorDisplayNameSnapshot = normalizeOptionalString(getUserDisplayNameSnapshot(user));
  const actorEmailSnapshot = normalizeOptionalString(getUserEmail(user));
  const actor = getUserAuditActor(user);

  const activeReplyRows = await sqlQuery(getActiveUserFeedbackReplySql, {
    feedbackId: cleanFeedbackId,
  });
  const activeReply = activeReplyRows?.[0] ?? null;

  if (activeReply?.feedback_reply_id) {
    await sqlQuery(updateUserFeedbackReplySql, {
      feedbackReplyId: activeReply.feedback_reply_id,
      replyMarkdown,
      adminUserObjectId: actorUserObjectId,
      adminDisplayNameSnapshot: actorDisplayNameSnapshot,
      adminEmailSnapshot: actorEmailSnapshot,
      actor,
    });
  } else {
    await sqlQuery(insertUserFeedbackReplySql, {
      feedbackReplyId: randomUUID(),
      feedbackId: cleanFeedbackId,
      replyMarkdown,
      adminUserObjectId: actorUserObjectId,
      adminDisplayNameSnapshot: actorDisplayNameSnapshot,
      adminEmailSnapshot: actorEmailSnapshot,
      actor,
    });
  }

  if (String(existingFeedback.status || "").trim().toUpperCase() !== "GESLOTEN") {
    await sqlQuery(updateUserFeedbackStatusSql, {
      feedbackId: cleanFeedbackId,
      status: "BEANTWOORD",
      actor,
    });
  }

  return {
    ok: true,
    item: await getFeedbackItemOrThrow(cleanFeedbackId),
  };
}
