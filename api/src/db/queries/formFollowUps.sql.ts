// api/src/db/queries/formFollowUps.sql.ts
export const getFormFollowUpsByInstanceSql = `
select
  follow_up_action_id,
  form_instance_id,
  source_fingerprint,
  source_question_name,
  source_question_type,
  source_row_index,
  source_item_code,
  workflow_title,
  workflow_description,
  category,
  certificate_impact,
  status,
  note
from dbo.FormFollowUpAction
where form_instance_id = @formInstanceId
`;

export const insertFormFollowUpSql = `
insert into dbo.FormFollowUpAction
(
  form_instance_id,
  installation_id,
  atrium_installation_code,

  source_question_name,
  source_question_type,
  source_row_index,
  source_item_code,
  source_fingerprint,

  workflow_title,
  workflow_description,
  category,
  certificate_impact,

  status,
  status_set_at,
  status_set_by,

  created_by
)
values
(
  @formInstanceId,
  @installationId,
  @atriumCode,

  @sourceQuestionName,
  @sourceQuestionType,
  @sourceRowIndex,
  @sourceItemCode,
  @sourceFingerprint,

  @workflowTitle,
  @workflowDescription,
  @category,
  @certificateImpact,

  @initialStatus,
  sysutcdatetime(),
  @actor,

  @actor
)
`;

export const updateFormFollowUpContentSql = `
update dbo.FormFollowUpAction
set
  source_question_name = @sourceQuestionName,
  source_question_type = @sourceQuestionType,
  source_row_index = @sourceRowIndex,
  source_item_code = @sourceItemCode,
  workflow_title = @workflowTitle,
  workflow_description = @workflowDescription,
  category = @category,
  certificate_impact = @certificateImpact,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where follow_up_action_id = @followUpActionId
`;

export const markFormFollowUpVervallenSql = `
update dbo.FormFollowUpAction
set
  status = N'VERVALLEN',
  status_set_at = sysutcdatetime(),
  status_set_by = @actor,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where follow_up_action_id = @followUpActionId
  and status in (N'OPEN', N'WACHTENOPDERDEN', N'INFORMATIEF')
`;

export const getFormFollowUpSummaryByInstanceSql = `
select
  count(*) as total_count,
  sum(case when status in (N'OPEN', N'WACHTENOPDERDEN') then 1 else 0 end) as open_count,
  sum(case when status in (N'AFGEHANDELD', N'AFGEWEZEN', N'VERVALLEN', N'INFORMATIEF') then 1 else 0 end) as terminal_count,
  sum(case when status = N'INFORMATIEF' then 1 else 0 end) as informative_count,
  sum(case when status <> N'INFORMATIEF' then 1 else 0 end) as relevant_count
from dbo.FormFollowUpAction
where form_instance_id = @formInstanceId
`;

export const getFormFollowUpsMonitorByInstanceSql = `
select
  follow_up_action_id,
  form_instance_id,
  workflow_title,
  workflow_description,
  category,
  certificate_impact,
  status,
  note,
  assigned_to,
  due_date,
  resolution_note,
  resolved_at,
  resolved_by,
  created_at,
  created_by,
  updated_at,
  updated_by,
  source_question_name,
  source_question_type,
  source_row_index,
  source_item_code
from dbo.FormFollowUpAction
where form_instance_id = @formInstanceId
order by
  case when status in (N'OPEN', N'WACHTENOPDERDEN') then 0 else 1 end,
  created_at desc,
  follow_up_action_id desc
`;

export const getFormFollowUpByIdSql = `
select top 1
  fua.follow_up_action_id,
  fua.form_instance_id,
  fua.status,
  fua.note,
  fua.workflow_title,
  fua.resolution_note,
  fi.status as form_status
from dbo.FormFollowUpAction fua
join dbo.FormInstance fi
  on fi.form_instance_id = fua.form_instance_id
where fua.follow_up_action_id = @followUpActionId
`;

export const updateFormFollowUpStatusSql = `
update dbo.FormFollowUpAction
set
  status = @nextStatus,
  status_set_at = sysutcdatetime(),
  status_set_by = @actor,
  resolution_note = @resolutionNote,
  resolved_at = case when @isResolved = 1 then sysutcdatetime() else null end,
  resolved_by = case when @isResolved = 1 then @actor else null end,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where follow_up_action_id = @followUpActionId;

select top 1
  follow_up_action_id,
  form_instance_id,
  status,
  note,
  resolution_note,
  resolved_at,
  resolved_by,
  updated_at,
  updated_by
from dbo.FormFollowUpAction
where follow_up_action_id = @followUpActionId
`;

export const updateFormFollowUpNoteSql = `
update dbo.FormFollowUpAction
set
  note = @note,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where follow_up_action_id = @followUpActionId;

select top 1
  follow_up_action_id,
  form_instance_id,
  status,
  note,
  updated_at,
  updated_by
from dbo.FormFollowUpAction
where follow_up_action_id = @followUpActionId
`;