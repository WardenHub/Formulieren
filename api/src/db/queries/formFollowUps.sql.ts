// /api/src/db/queries/formFollowUps.sql.ts

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
  status
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