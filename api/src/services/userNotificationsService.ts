import { sqlQuery } from "../db/index.js";
import {
  getUserNotificationEventsSql,
  getUserNotificationSummarySql,
  markAllUserNotificationsReadSql,
  markUserNotificationReadSql,
} from "../db/queries/userNotifications.sql.js";
import { getUserObjectId } from "../utils/userIdentity.js";

function normalizeTake(value: any) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 100);
}

function normalizeSkip(value: any) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeOnlyUnread(value: any) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "unread";
}

function buildNotificationHref(row: any) {
  const targetPath = String(row?.target_path || "").trim();
  if (targetPath) return targetPath;

  const code = String(row?.atrium_installation_code || "").trim();
  const formInstanceId = Number(row?.form_instance_id || 0);

  if (
    (row?.event_type === "INSTALLATION_NOTE_MENTION" ||
      row?.event_type === "INSTALLATION_NOTE_REACTION") &&
    code
  ) {
    const noteId = String(row?.installation_note_id || "").trim();
    const noteQuery = noteId ? `&note=${encodeURIComponent(noteId)}` : "";
    return `/installaties/${encodeURIComponent(code)}?tab=notes&subtab=notes${noteQuery}`;
  }

  if (row?.event_type === "FORM_FOLLOWUP_ASSIGNED" && formInstanceId > 0) {
    const followUpId = String(row?.follow_up_action_id || "").trim();
    const actionQuery = followUpId ? `&followUp=${encodeURIComponent(followUpId)}` : "";
    return `/monitor/formulieren/${formInstanceId}?tab=actiepunten${actionQuery}`;
  }

  if (code) {
    return `/installaties/${encodeURIComponent(code)}`;
  }

  return null;
}

function buildNotificationKind(row: any) {
  if (row?.event_type === "INSTALLATION_NOTE_MENTION") return "mention";
  if (row?.event_type === "INSTALLATION_NOTE_REACTION") return "reaction";
  if (row?.event_type === "FORM_FOLLOWUP_ASSIGNED") return "workflow";
  return "system";
}

function mapNotificationRow(row: any) {
  return {
    notification_event_id: row?.notification_event_id,
    event_type: row?.event_type ?? null,
    kind: buildNotificationKind(row),
    is_unread: !!row?.is_unread,
    summary_text: row?.summary_text ?? "",
    reaction_key: row?.reaction_key ?? null,
    actor: {
      user_object_id: row?.actor_user_object_id ?? null,
      display_name_snapshot: row?.actor_display_name_snapshot ?? null,
      email_snapshot: row?.actor_email_snapshot ?? null,
    },
    recipient: {
      user_object_id: row?.recipient_user_object_id ?? null,
      display_name_snapshot: row?.recipient_display_name_snapshot ?? null,
      email_snapshot: row?.recipient_email_snapshot ?? null,
    },
    related: {
      installation_id: row?.installation_id ?? null,
      atrium_installation_code: row?.atrium_installation_code ?? null,
      form_instance_id: row?.form_instance_id == null ? null : Number(row.form_instance_id),
      follow_up_action_id: row?.follow_up_action_id ?? null,
      installation_note_id: row?.installation_note_id ?? null,
    },
    target_path: row?.target_path ?? null,
    href: buildNotificationHref(row),
    created_at: row?.created_at ?? null,
    read_at: row?.read_at ?? null,
  };
}

export async function getMyNotifications(query: any, user: any) {
  const recipientUserObjectId = String(getUserObjectId(user) || "").trim();
  if (!recipientUserObjectId) throw new Error("missing user object id");

  const take = normalizeTake(query?.take);
  const skip = normalizeSkip(query?.skip);
  const onlyUnread = normalizeOnlyUnread(query?.unread);

  const [summaryRows, itemRows] = await Promise.all([
    sqlQuery(getUserNotificationSummarySql, {
      recipientUserObjectId,
    }),
    sqlQuery(getUserNotificationEventsSql, {
      recipientUserObjectId,
      onlyUnread: onlyUnread ? 1 : 0,
      skip,
      take,
    }),
  ]);

  const summaryRow: any = summaryRows?.[0] ?? {};

  return {
    summary: {
      total_count: Number(summaryRow?.total_count ?? 0),
      unread_count: Number(summaryRow?.unread_count ?? 0),
    },
    items: (itemRows || []).map(mapNotificationRow),
    filters: {
      unread_only: onlyUnread,
      take,
      skip,
    },
  };
}

export async function markMyNotificationRead(notificationEventId: string, user: any) {
  const recipientUserObjectId = String(getUserObjectId(user) || "").trim();
  if (!recipientUserObjectId) throw new Error("missing user object id");

  const cleanId = String(notificationEventId || "").trim();
  if (!cleanId) throw new Error("missing notification event id");

  const rows = await sqlQuery(markUserNotificationReadSql, {
    notificationEventId: cleanId,
    recipientUserObjectId,
  });

  const row: any = rows?.[0] ?? null;
  if (!row?.notification_event_id) {
    throw new Error("notification event not found");
  }

  return {
    notification_event_id: row.notification_event_id,
    read_at: row.read_at ?? null,
  };
}

export async function markAllMyNotificationsRead(user: any) {
  const recipientUserObjectId = String(getUserObjectId(user) || "").trim();
  if (!recipientUserObjectId) throw new Error("missing user object id");

  await sqlQuery(markAllUserNotificationsReadSql, {
    recipientUserObjectId,
  });

  const summaryRows = await sqlQuery(getUserNotificationSummarySql, {
    recipientUserObjectId,
  });
  const summaryRow: any = summaryRows?.[0] ?? {};

  return {
    summary: {
      total_count: Number(summaryRow?.total_count ?? 0),
      unread_count: Number(summaryRow?.unread_count ?? 0),
    },
  };
}
