// api/src/db/queries/formFollowUps.sql.ts
export const getFormFollowUpsByInstanceSql = `
select
  follow_up_action_id,
  form_instance_id,
  kind,
  source_fingerprint,
  source_question_name,
  source_question_type,
  source_row_index,
  source_item_code,
  workflow_title,
  workflow_description,
  category,
  certificate_impact,
  certificate_impact_override,
  isnull(certificate_impact_override, certificate_impact) as effective_certificate_impact,
  status,
  note,
  resolution_outcome
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

  kind,
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

  @kind,
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
  kind = @kind,
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
  sum(case when kind = N'workflow' and status in (N'OPEN', N'WACHTENOPDERDEN') then 1 else 0 end) as open_count,
  sum(case when kind = N'workflow' and status in (N'AFGEHANDELD', N'AFGEWEZEN', N'VERVALLEN') then 1 else 0 end) as terminal_count,
  sum(case when kind = N'report-only' then 1 else 0 end) as informative_count,
  sum(case when kind = N'workflow' then 1 else 0 end) as relevant_count
from dbo.FormFollowUpAction
where form_instance_id = @formInstanceId
`;

export const getFormFollowUpSummaryByChainSql = `
;with current_form as (
  select top 1
    form_instance_id,
    parent_instance_id
  from dbo.FormInstance
  where form_instance_id = @formInstanceId
),
ancestor_forms as (
  select
    form_instance_id,
    parent_instance_id
  from current_form

  union all

  select
    parent.form_instance_id,
    parent.parent_instance_id
  from dbo.FormInstance parent
  join ancestor_forms child
    on child.parent_instance_id = parent.form_instance_id
),
root_form as (
  select
    top 1 form_instance_id as root_form_instance_id
  from ancestor_forms
  order by case when parent_instance_id is null then 0 else 1 end
),
chain_forms as (
  select fi.form_instance_id
  from dbo.FormInstance fi
  join root_form root
    on root.root_form_instance_id = fi.form_instance_id

  union all

  select child.form_instance_id
  from dbo.FormInstance child
  join chain_forms parent
    on child.parent_instance_id = parent.form_instance_id
)
select
  count(*) as total_count,
  sum(case when fua.kind = N'workflow' and fua.status in (N'OPEN', N'WACHTENOPDERDEN') then 1 else 0 end) as open_count,
  sum(case when fua.kind = N'workflow' and fua.status in (N'AFGEHANDELD', N'AFGEWEZEN', N'VERVALLEN') then 1 else 0 end) as terminal_count,
  sum(case when fua.kind = N'report-only' then 1 else 0 end) as informative_count,
  sum(case when fua.kind = N'workflow' then 1 else 0 end) as relevant_count
from dbo.FormFollowUpAction fua
join chain_forms cf
  on cf.form_instance_id = fua.form_instance_id
`;

export const getFormFollowUpsMonitorByInstanceSql = `
select
  follow_up_action_id,
  form_instance_id,
  kind,
  workflow_title,
  workflow_description,
  category,
  certificate_impact,
  certificate_impact_override,
  isnull(certificate_impact_override, certificate_impact) as effective_certificate_impact,
  status,
  note,
  assigned_to,
  due_date,
  resolution_note,
  resolution_outcome,
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

export const getFormFollowUpsMonitorByChainSql = `
;with current_form as (
  select top 1
    form_instance_id,
    parent_instance_id
  from dbo.FormInstance
  where form_instance_id = @formInstanceId
),
ancestor_forms as (
  select
    form_instance_id,
    parent_instance_id
  from current_form

  union all

  select
    parent.form_instance_id,
    parent.parent_instance_id
  from dbo.FormInstance parent
  join ancestor_forms child
    on child.parent_instance_id = parent.form_instance_id
),
root_form as (
  select
    top 1 form_instance_id as root_form_instance_id
  from ancestor_forms
  order by case when parent_instance_id is null then 0 else 1 end
),
chain_form_ids as (
  select fi.form_instance_id
  from dbo.FormInstance fi
  join root_form root
    on root.root_form_instance_id = fi.form_instance_id

  union all

  select child.form_instance_id
  from dbo.FormInstance child
  join chain_form_ids parent
    on child.parent_instance_id = parent.form_instance_id
),
chain_forms as (
  select
    fi.form_instance_id,
    fi.parent_instance_id,
    fi.atrium_installation_code,
    fd.code as form_code,
    fd.name as form_name,
    fv.version_label,
    case
      when fi.form_instance_id = @formInstanceId then N'current'
      when fi.form_instance_id = root.root_form_instance_id then N'parent'
      else N'child'
    end as source_relation
  from dbo.FormInstance fi
  join chain_form_ids cfi
    on cfi.form_instance_id = fi.form_instance_id
  join dbo.FormDefinitionVersion fv
    on fv.form_version_id = fi.form_version_id
  join dbo.FormDefinition fd
    on fd.form_id = fv.form_id
  cross join root_form root
)
select
  fua.follow_up_action_id,
  fua.form_instance_id,
  cf.form_instance_id as source_form_instance_id,
  cf.source_relation as source_form_relation,
  cf.atrium_installation_code as source_atrium_installation_code,
  cf.form_code as source_form_code,
  cf.form_name as source_form_name,
  cf.version_label as source_version_label,
  fua.kind,
  fua.workflow_title,
  fua.workflow_description,
  fua.category,
  fua.certificate_impact,
  fua.certificate_impact_override,
  isnull(fua.certificate_impact_override, fua.certificate_impact) as effective_certificate_impact,
  fua.status,
  fua.note,
  fua.assigned_to,
  fua.due_date,
  fua.resolution_note,
  fua.resolution_outcome,
  fua.resolved_at,
  fua.resolved_by,
  fua.created_at,
  fua.created_by,
  fua.updated_at,
  fua.updated_by,
  fua.source_question_name,
  fua.source_question_type,
  fua.source_row_index,
  fua.source_item_code
from dbo.FormFollowUpAction fua
join chain_forms cf
  on cf.form_instance_id = fua.form_instance_id
order by
  case when fua.status in (N'OPEN', N'WACHTENOPDERDEN') then 0 else 1 end,
  case cf.source_relation when N'current' then 0 when N'parent' then 1 else 2 end,
  fua.created_at desc,
  fua.follow_up_action_id desc
`;

export const getFormFollowUpByIdSql = `
select top 1
  fua.follow_up_action_id,
  fua.form_instance_id,
  fua.kind,
  fua.status,
  fua.note,
  fua.workflow_title,
  fua.certificate_impact,
  fua.certificate_impact_override,
  isnull(fua.certificate_impact_override, fua.certificate_impact) as effective_certificate_impact,
  fua.resolution_outcome,
  fua.resolution_note,
  fi.status as form_status,
  ab.installation_status
from dbo.FormFollowUpAction fua
join dbo.FormInstance fi
  on fi.form_instance_id = fua.form_instance_id
left join dbo.AtriumInstallationBase ab
  on ab.installatie_code = fi.atrium_installation_code
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
  kind,
  status,
  note,
  resolution_outcome,
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
  kind,
  status,
  note,
  resolution_outcome,
  updated_at,
  updated_by
from dbo.FormFollowUpAction
where follow_up_action_id = @followUpActionId
`;

export const updateFormFollowUpCertificateImpactSql = `
update dbo.FormFollowUpAction
set
  certificate_impact_override = @certificateImpactOverride,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where follow_up_action_id = @followUpActionId
  and kind = N'workflow';

select top 1
  follow_up_action_id,
  form_instance_id,
  kind,
  certificate_impact,
  certificate_impact_override,
  isnull(certificate_impact_override, certificate_impact) as effective_certificate_impact,
  updated_at,
  updated_by
from dbo.FormFollowUpAction
where follow_up_action_id = @followUpActionId
`;
