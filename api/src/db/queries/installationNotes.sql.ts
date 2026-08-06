export const getInstallationNotesSql = `
select
  n.installation_note_id,
  n.installation_id,
  n.atrium_installation_code,
  n.note_kind,
  n.body_markdown,
  n.author_user_object_id,
  n.author_display_name_snapshot,
  n.author_email_snapshot,
  n.is_archived,
  n.archived_at,
  n.archived_by,
  n.created_at,
  n.created_by,
  n.updated_at,
  n.updated_by
from dbo.InstallationNote n
where n.atrium_installation_code = @code
  and (@includeArchived = 1 or n.is_archived = 0)
  and (
    nullif(ltrim(rtrim(@noteKind)), N'') is null
    or n.note_kind = nullif(ltrim(rtrim(@noteKind)), N'')
  )
order by
  n.is_archived asc,
  coalesce(n.updated_at, n.created_at) desc,
  n.created_at desc;

select
  m.installation_note_id,
  m.installation_note_mention_id,
  m.mentioned_user_object_id,
  m.mentioned_display_name_snapshot,
  m.mentioned_email_snapshot,
  m.created_at,
  m.created_by
from dbo.InstallationNoteMention m
join dbo.InstallationNote n
  on n.installation_note_id = m.installation_note_id
where n.atrium_installation_code = @code
  and (@includeArchived = 1 or n.is_archived = 0)
  and (
    nullif(ltrim(rtrim(@noteKind)), N'') is null
    or n.note_kind = nullif(ltrim(rtrim(@noteKind)), N'')
  )
order by m.created_at asc;

select
  r.installation_note_id,
  r.installation_note_reaction_id,
  r.reaction_key,
  r.reactor_user_object_id,
  r.reactor_display_name_snapshot,
  r.reactor_email_snapshot,
  r.created_at,
  r.created_by
from dbo.InstallationNoteReaction r
join dbo.InstallationNote n
  on n.installation_note_id = r.installation_note_id
where n.atrium_installation_code = @code
  and (@includeArchived = 1 or n.is_archived = 0)
  and (
    nullif(ltrim(rtrim(@noteKind)), N'') is null
    or n.note_kind = nullif(ltrim(rtrim(@noteKind)), N'')
  )
order by r.created_at asc;
`;

export const insertInstallationNoteSql = `
insert into dbo.InstallationNote (
  installation_note_id,
  installation_id,
  atrium_installation_code,
  note_kind,
  body_markdown,
  author_user_object_id,
  author_display_name_snapshot,
  author_email_snapshot,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @installationNoteId,
  @installationId,
  @code,
  @noteKind,
  @bodyMarkdown,
  @authorUserObjectId,
  nullif(ltrim(rtrim(@authorDisplayNameSnapshot)), N''),
  nullif(ltrim(rtrim(@authorEmailSnapshot)), N''),
  sysutcdatetime(),
  @actor,
  sysutcdatetime(),
  @actor
);

select top 1
  n.installation_note_id,
  n.installation_id,
  n.atrium_installation_code,
  n.note_kind,
  n.body_markdown,
  n.author_user_object_id,
  n.author_display_name_snapshot,
  n.author_email_snapshot,
  n.is_archived,
  n.archived_at,
  n.archived_by,
  n.created_at,
  n.created_by,
  n.updated_at,
  n.updated_by
from dbo.InstallationNote n
where n.installation_note_id = @installationNoteId;
`;

export const replaceInstallationNoteMentionsSql = `
delete from dbo.InstallationNoteMention
where installation_note_id = @installationNoteId;

insert into dbo.InstallationNoteMention (
  installation_note_id,
  mentioned_user_object_id,
  mentioned_display_name_snapshot,
  mentioned_email_snapshot,
  created_at,
  created_by
)
select
  @installationNoteId,
  src.mentioned_user_object_id,
  nullif(ltrim(rtrim(src.mentioned_display_name_snapshot)), N''),
  nullif(ltrim(rtrim(src.mentioned_email_snapshot)), N''),
  sysutcdatetime(),
  @actor
from openjson(@mentionsJson)
with (
  mentioned_user_object_id nvarchar(200) '$.mentioned_user_object_id',
  mentioned_display_name_snapshot nvarchar(250) '$.mentioned_display_name_snapshot',
  mentioned_email_snapshot nvarchar(320) '$.mentioned_email_snapshot'
) src
where nullif(ltrim(rtrim(src.mentioned_user_object_id)), N'') is not null;

select
  m.installation_note_id,
  m.installation_note_mention_id,
  m.mentioned_user_object_id,
  m.mentioned_display_name_snapshot,
  m.mentioned_email_snapshot,
  m.created_at,
  m.created_by
from dbo.InstallationNoteMention m
where m.installation_note_id = @installationNoteId
order by m.created_at asc;
`;

export const getInstallationNoteByIdSql = `
select top 1
  n.installation_note_id,
  n.installation_id,
  n.atrium_installation_code,
  n.note_kind,
  n.body_markdown,
  n.author_user_object_id,
  n.author_display_name_snapshot,
  n.author_email_snapshot,
  n.is_archived,
  n.archived_at,
  n.archived_by,
  n.created_at,
  n.created_by,
  n.updated_at,
  n.updated_by
from dbo.InstallationNote n
where n.installation_note_id = @installationNoteId
  and n.atrium_installation_code = @code;
`;

export const updateInstallationNoteSql = `
update dbo.InstallationNote
set
  note_kind = @noteKind,
  body_markdown = @bodyMarkdown,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where installation_note_id = @installationNoteId
  and atrium_installation_code = @code;

select top 1
  n.installation_note_id,
  n.installation_id,
  n.atrium_installation_code,
  n.note_kind,
  n.body_markdown,
  n.author_user_object_id,
  n.author_display_name_snapshot,
  n.author_email_snapshot,
  n.is_archived,
  n.archived_at,
  n.archived_by,
  n.created_at,
  n.created_by,
  n.updated_at,
  n.updated_by
from dbo.InstallationNote n
where n.installation_note_id = @installationNoteId
  and n.atrium_installation_code = @code;
`;

export const archiveInstallationNoteSql = `
update dbo.InstallationNote
set
  is_archived = @archiveState,
  archived_at = case when @archiveState = 1 then sysutcdatetime() else null end,
  archived_by = case when @archiveState = 1 then @actor else null end,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where installation_note_id = @installationNoteId
  and atrium_installation_code = @code;

select top 1
  n.installation_note_id,
  n.installation_id,
  n.atrium_installation_code,
  n.note_kind,
  n.body_markdown,
  n.author_user_object_id,
  n.author_display_name_snapshot,
  n.author_email_snapshot,
  n.is_archived,
  n.archived_at,
  n.archived_by,
  n.created_at,
  n.created_by,
  n.updated_at,
  n.updated_by
from dbo.InstallationNote n
where n.installation_note_id = @installationNoteId
  and n.atrium_installation_code = @code;
`;

export const deleteInstallationNoteSql = `
delete from dbo.InstallationNoteReaction
where installation_note_id = @installationNoteId;

delete from dbo.InstallationNoteMention
where installation_note_id = @installationNoteId;

delete from dbo.UserNotificationEvent
where installation_note_id = @installationNoteId;

delete from dbo.InstallationNote
where installation_note_id = @installationNoteId
  and atrium_installation_code = @code;
`;

export const toggleInstallationNoteReactionSql = `
if exists (
  select 1
  from dbo.InstallationNoteReaction
  where installation_note_id = @installationNoteId
    and reaction_key = @reactionKey
    and reactor_user_object_id = @reactorUserObjectId
)
begin
  delete from dbo.InstallationNoteReaction
  where installation_note_id = @installationNoteId
    and reaction_key = @reactionKey
    and reactor_user_object_id = @reactorUserObjectId;

  select cast(0 as bit) as is_active;
end
else
begin
  insert into dbo.InstallationNoteReaction (
    installation_note_id,
    reaction_key,
    reactor_user_object_id,
    reactor_display_name_snapshot,
    reactor_email_snapshot,
    created_at,
    created_by
  )
  values (
    @installationNoteId,
    @reactionKey,
    @reactorUserObjectId,
    nullif(ltrim(rtrim(@reactorDisplayNameSnapshot)), N''),
    nullif(ltrim(rtrim(@reactorEmailSnapshot)), N''),
    sysutcdatetime(),
    @actor
  );

  select cast(1 as bit) as is_active;
end;

select
  r.installation_note_id,
  r.installation_note_reaction_id,
  r.reaction_key,
  r.reactor_user_object_id,
  r.reactor_display_name_snapshot,
  r.reactor_email_snapshot,
  r.created_at,
  r.created_by
from dbo.InstallationNoteReaction r
where r.installation_note_id = @installationNoteId
order by r.created_at asc;
`;

export const insertUserNotificationEventSql = `
insert into dbo.UserNotificationEvent (
  notification_event_id,
  event_type,
  recipient_user_object_id,
  recipient_display_name_snapshot,
  recipient_email_snapshot,
  actor_user_object_id,
  actor_display_name_snapshot,
  actor_email_snapshot,
  installation_id,
  atrium_installation_code,
  form_instance_id,
  follow_up_action_id,
  installation_note_id,
  reaction_key,
  summary_text,
  target_path,
  created_at,
  read_at
)
values (
  @notificationEventId,
  @eventType,
  @recipientUserObjectId,
  nullif(ltrim(rtrim(@recipientDisplayNameSnapshot)), N''),
  nullif(ltrim(rtrim(@recipientEmailSnapshot)), N''),
  nullif(ltrim(rtrim(@actorUserObjectId)), N''),
  nullif(ltrim(rtrim(@actorDisplayNameSnapshot)), N''),
  nullif(ltrim(rtrim(@actorEmailSnapshot)), N''),
  @installationId,
  @code,
  @formInstanceId,
  @followUpActionId,
  @installationNoteId,
  nullif(ltrim(rtrim(@reactionKey)), N''),
  @summaryText,
  nullif(ltrim(rtrim(@targetPath)), N''),
  sysutcdatetime(),
  null
);
`;

export const markInstallationNoteNotificationsReadSql = `
update dbo.UserNotificationEvent
set read_at = coalesce(read_at, sysutcdatetime())
where recipient_user_object_id = @recipientUserObjectId
  and atrium_installation_code = @code
  and event_type in (N'INSTALLATION_NOTE_MENTION', N'INSTALLATION_NOTE_REACTION')
  and read_at is null;
`;

export const getInstallationWorkflowItemsSql = `
select
  fwa.follow_up_action_id,
  fwa.form_instance_id,
  fwa.installation_id,
  fwa.atrium_installation_code,
  fwa.source_question_name,
  fwa.source_question_type,
  fwa.source_row_index,
  fwa.source_item_code,
  fwa.kind,
  fwa.workflow_title,
  fwa.workflow_description,
  fwa.category,
  fwa.certificate_impact,
  fwa.certificate_impact_override,
  fwa.status,
  fwa.status_set_at,
  fwa.status_set_by,
  fwa.assigned_to,
  fwa.due_date,
  fwa.note,
  fwa.resolution_note,
  fwa.resolution_outcome,
  fwa.resolved_at,
  fwa.resolved_by,
  fwa.created_at,
  fwa.created_by,
  fwa.updated_at,
  fwa.updated_by,
  fi.form_instance_id as instance_number,
  fd.code as form_code,
  fi.status as form_status,
  fi.parent_instance_id,
  coalesce(
    nullif(ltrim(rtrim(fi.instance_title)), N''),
    nullif(ltrim(rtrim(fd.name)), N''),
    nullif(ltrim(rtrim(fd.code)), N''),
    convert(nvarchar(50), fi.form_instance_id)
  ) as form_title
from dbo.FormFollowUpAction fwa
join dbo.FormInstance fi
  on fi.form_instance_id = fwa.form_instance_id
join dbo.FormDefinitionVersion fdv
  on fdv.form_version_id = fi.form_version_id
join dbo.FormDefinition fd
  on fd.form_id = fdv.form_id
where fwa.atrium_installation_code = @code
order by
  case
    when fwa.status in (N'OPEN', N'PLANNING_NODIG', N'WACHTENOPDERDEN') then 0
    when fwa.status = N'GEPLAND' then 1
    else 2
  end,
  coalesce(fwa.updated_at, fwa.created_at) desc,
  fwa.created_at desc;
`;
