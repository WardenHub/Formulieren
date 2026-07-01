// /api/src/db/queries/userNotifications.sql.ts

export const getUserNotificationSummarySql = `
select
  total_count = count_big(1),
  unread_count = sum(case when une.read_at is null then 1 else 0 end)
from dbo.UserNotificationEvent une
where une.recipient_user_object_id = @recipientUserObjectId;
`;

export const getUserNotificationEventsSql = `
with notification_source as (
  select
    une.notification_event_id,
    une.event_type,
    une.recipient_user_object_id,
    une.recipient_display_name_snapshot,
    une.recipient_email_snapshot,
    une.actor_user_object_id,
    une.actor_display_name_snapshot,
    une.actor_email_snapshot,
    une.installation_id,
    une.atrium_installation_code,
    une.form_instance_id,
    une.follow_up_action_id,
    une.installation_note_id,
    une.reaction_key,
    une.summary_text,
    une.target_path,
    une.created_at,
    une.read_at
  from dbo.UserNotificationEvent une
  where une.recipient_user_object_id = @recipientUserObjectId
    and (
      @onlyUnread = 0
      or une.read_at is null
    )
)
select
  ns.notification_event_id,
  ns.event_type,
  ns.recipient_user_object_id,
  ns.recipient_display_name_snapshot,
  ns.recipient_email_snapshot,
  ns.actor_user_object_id,
  ns.actor_display_name_snapshot,
  ns.actor_email_snapshot,
  ns.installation_id,
  ns.atrium_installation_code,
  ns.form_instance_id,
  ns.follow_up_action_id,
  ns.installation_note_id,
  ns.reaction_key,
  ns.summary_text,
  ns.target_path,
  ns.created_at,
  ns.read_at,
  is_unread = cast(case when ns.read_at is null then 1 else 0 end as bit)
from notification_source ns
order by
  case when ns.read_at is null then 0 else 1 end,
  ns.created_at desc
offset @skip rows
fetch next @take rows only;
`;

export const markUserNotificationReadSql = `
update dbo.UserNotificationEvent
set read_at = coalesce(read_at, sysutcdatetime())
where notification_event_id = @notificationEventId
  and recipient_user_object_id = @recipientUserObjectId;

select top 1
  une.notification_event_id,
  une.read_at
from dbo.UserNotificationEvent une
where une.notification_event_id = @notificationEventId
  and une.recipient_user_object_id = @recipientUserObjectId;
`;

export const markAllUserNotificationsReadSql = `
update dbo.UserNotificationEvent
set read_at = coalesce(read_at, sysutcdatetime())
where recipient_user_object_id = @recipientUserObjectId
  and read_at is null;
`;
