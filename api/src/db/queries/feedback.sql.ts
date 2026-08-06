export const getMyUserFeedbackSql = `
select
  uf.feedback_id,
  uf.sentiment,
  uf.status,
  cast(case when exists (
    select 1 from dbo.UserFeedbackReply ur where ur.feedback_id = uf.feedback_id
  ) then 1 else 0 end as bit) as has_reply,
  uf.message_markdown,
  uf.user_object_id,
  uf.user_display_name_snapshot,
  uf.user_email_snapshot,
  uf.source_path,
  uf.installation_code,
  uf.form_instance_id,
  uf.parent_instance_id,
  uf.created_at,
  uf.created_by,
  uf.updated_at,
  uf.updated_by
from dbo.UserFeedback uf
where uf.user_object_id = @userObjectId
order by
  coalesce(uf.updated_at, uf.created_at) desc,
  uf.created_at desc;

select
  ur.feedback_reply_id,
  ur.feedback_id,
  ur.reply_markdown,
  ur.admin_user_object_id,
  ur.admin_display_name_snapshot,
  ur.admin_email_snapshot,
  ur.is_active,
  ur.created_at,
  ur.created_by,
  ur.updated_at,
  ur.updated_by
from dbo.UserFeedbackReply ur
join dbo.UserFeedback uf
  on uf.feedback_id = ur.feedback_id
where uf.user_object_id = @userObjectId
  and ur.is_active = 1
order by
  coalesce(ur.updated_at, ur.created_at) desc,
  ur.created_at desc;
`;

export const getAdminUserFeedbackSql = `
select
  uf.feedback_id,
  uf.sentiment,
  uf.status,
  cast(case when exists (
    select 1 from dbo.UserFeedbackReply ur where ur.feedback_id = uf.feedback_id
  ) then 1 else 0 end as bit) as has_reply,
  uf.message_markdown,
  uf.user_object_id,
  uf.user_display_name_snapshot,
  uf.user_email_snapshot,
  uf.source_path,
  uf.installation_code,
  uf.form_instance_id,
  uf.parent_instance_id,
  uf.created_at,
  uf.created_by,
  uf.updated_at,
  uf.updated_by
from dbo.UserFeedback uf
where (
    nullif(ltrim(rtrim(@status)), N'') is null
    or uf.status = nullif(ltrim(rtrim(@status)), N'')
  )
  and (
    nullif(ltrim(rtrim(@sentiment)), N'') is null
    or uf.sentiment = nullif(ltrim(rtrim(@sentiment)), N'')
  )
order by
  case when uf.status in (N'OPEN', N'IN_BEHANDELING') then 0 else 1 end,
  coalesce(uf.updated_at, uf.created_at) desc,
  uf.created_at desc;

select
  ur.feedback_reply_id,
  ur.feedback_id,
  ur.reply_markdown,
  ur.admin_user_object_id,
  ur.admin_display_name_snapshot,
  ur.admin_email_snapshot,
  ur.is_active,
  ur.created_at,
  ur.created_by,
  ur.updated_at,
  ur.updated_by
from dbo.UserFeedbackReply ur
join dbo.UserFeedback uf
  on uf.feedback_id = ur.feedback_id
where ur.is_active = 1
  and (
    nullif(ltrim(rtrim(@status)), N'') is null
    or uf.status = nullif(ltrim(rtrim(@status)), N'')
  )
  and (
    nullif(ltrim(rtrim(@sentiment)), N'') is null
    or uf.sentiment = nullif(ltrim(rtrim(@sentiment)), N'')
  )
order by
  coalesce(ur.updated_at, ur.created_at) desc,
  ur.created_at desc;
`;

export const getUserFeedbackByIdSql = `
select top 1
  uf.feedback_id,
  uf.sentiment,
  uf.status,
  cast(case when exists (
    select 1 from dbo.UserFeedbackReply ur where ur.feedback_id = uf.feedback_id
  ) then 1 else 0 end as bit) as has_reply,
  uf.message_markdown,
  uf.user_object_id,
  uf.user_display_name_snapshot,
  uf.user_email_snapshot,
  uf.source_path,
  uf.installation_code,
  uf.form_instance_id,
  uf.parent_instance_id,
  uf.created_at,
  uf.created_by,
  uf.updated_at,
  uf.updated_by
from dbo.UserFeedback uf
where uf.feedback_id = @feedbackId;

select top 1
  ur.feedback_reply_id,
  ur.feedback_id,
  ur.reply_markdown,
  ur.admin_user_object_id,
  ur.admin_display_name_snapshot,
  ur.admin_email_snapshot,
  ur.is_active,
  ur.created_at,
  ur.created_by,
  ur.updated_at,
  ur.updated_by
from dbo.UserFeedbackReply ur
where ur.feedback_id = @feedbackId
  and ur.is_active = 1
order by
  coalesce(ur.updated_at, ur.created_at) desc,
  ur.created_at desc;
`;

export const insertUserFeedbackSql = `
insert into dbo.UserFeedback (
  feedback_id,
  sentiment,
  status,
  message_markdown,
  user_object_id,
  user_display_name_snapshot,
  user_email_snapshot,
  source_path,
  installation_code,
  form_instance_id,
  parent_instance_id,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @feedbackId,
  @sentiment,
  N'OPEN',
  nullif(ltrim(rtrim(@messageMarkdown)), N''),
  @userObjectId,
  nullif(ltrim(rtrim(@userDisplayNameSnapshot)), N''),
  nullif(ltrim(rtrim(@userEmailSnapshot)), N''),
  nullif(ltrim(rtrim(@sourcePath)), N''),
  nullif(ltrim(rtrim(@installationCode)), N''),
  @formInstanceId,
  @parentInstanceId,
  sysutcdatetime(),
  @actor,
  sysutcdatetime(),
  @actor
);
`;

export const updateUserFeedbackStatusSql = `
update dbo.UserFeedback
set
  status = @status,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where feedback_id = @feedbackId;
`;

export const updateMyUserFeedbackSql = `
update dbo.UserFeedback
set
  sentiment = @sentiment,
  message_markdown = nullif(ltrim(rtrim(@messageMarkdown)), N''),
  updated_at = sysutcdatetime(),
  updated_by = @actor
where feedback_id = @feedbackId
  and user_object_id = @userObjectId;
`;

export const deleteUserFeedbackSql = `
set xact_abort on;
begin transaction;

delete ur
from dbo.UserFeedbackReply ur
join dbo.UserFeedback uf on uf.feedback_id = ur.feedback_id
where uf.feedback_id = @feedbackId
  and (@userObjectId is null or uf.user_object_id = @userObjectId);

delete from dbo.UserFeedback
where feedback_id = @feedbackId
  and (@userObjectId is null or user_object_id = @userObjectId);

commit transaction;
`;

export const getActiveUserFeedbackReplySql = `
select top 1
  ur.feedback_reply_id,
  ur.feedback_id,
  ur.reply_markdown,
  ur.admin_user_object_id,
  ur.admin_display_name_snapshot,
  ur.admin_email_snapshot,
  ur.is_active,
  ur.created_at,
  ur.created_by,
  ur.updated_at,
  ur.updated_by
from dbo.UserFeedbackReply ur
where ur.feedback_id = @feedbackId
  and ur.is_active = 1
order by
  coalesce(ur.updated_at, ur.created_at) desc,
  ur.created_at desc;
`;

export const insertUserFeedbackReplySql = `
insert into dbo.UserFeedbackReply (
  feedback_reply_id,
  feedback_id,
  reply_markdown,
  admin_user_object_id,
  admin_display_name_snapshot,
  admin_email_snapshot,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @feedbackReplyId,
  @feedbackId,
  @replyMarkdown,
  @adminUserObjectId,
  nullif(ltrim(rtrim(@adminDisplayNameSnapshot)), N''),
  nullif(ltrim(rtrim(@adminEmailSnapshot)), N''),
  1,
  sysutcdatetime(),
  @actor,
  sysutcdatetime(),
  @actor
);
`;

export const updateUserFeedbackReplySql = `
update dbo.UserFeedbackReply
set
  reply_markdown = @replyMarkdown,
  admin_user_object_id = @adminUserObjectId,
  admin_display_name_snapshot = nullif(ltrim(rtrim(@adminDisplayNameSnapshot)), N''),
  admin_email_snapshot = nullif(ltrim(rtrim(@adminEmailSnapshot)), N''),
  updated_at = sysutcdatetime(),
  updated_by = @actor
where feedback_reply_id = @feedbackReplyId;
`;
