// Generic follow-up domain; external DTO names stay stable for the runner and monitor UI.

const followUpProjection = `
  a.follow_up_action_id,
  fs.form_instance_id,
  a.kind,
  fs.source_fingerprint,
  fs.source_question_name,
  fs.source_question_type,
  fs.source_row_index,
  fs.source_item_code,
  a.workflow_title,
  a.workflow_description,
  a.category,
  a.priority,
  a.responsibility_type,
  a.certificate_impact,
  a.certificate_impact_override,
  isnull(a.certificate_impact_override, a.certificate_impact) as effective_certificate_impact,
  a.status,
  a.internal_note as note,
  a.resolution_outcome
`;

export const getFormFollowUpsByInstanceSql = `
select
${followUpProjection}
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
where fs.form_instance_id = @formInstanceId
`;

export const insertFormFollowUpSql = `
declare @followUpActionId uniqueidentifier = newid();

insert into dbo.FollowUpAction
(
  follow_up_action_id, source_type, kind, workflow_title, workflow_description,
  category, certificate_impact, status, status_set_at, status_set_by, created_by
)
values
(
  @followUpActionId, N'FORM', @kind, @workflowTitle, @workflowDescription,
  @category, @certificateImpact, @initialStatus, sysutcdatetime(), @actor, @actor
);

insert into dbo.FollowUpActionFormSource
(
  follow_up_action_id, form_instance_id, source_kind, source_question_name, source_question_type,
  source_row_index, source_item_code, source_fingerprint, created_by
)
values
(
  @followUpActionId, @formInstanceId, @kind, @sourceQuestionName, @sourceQuestionType,
  @sourceRowIndex, @sourceItemCode, @sourceFingerprint, @actor
);

insert into dbo.FollowUpActionInstallationContext
(
  follow_up_action_id, installation_id, atrium_installation_code,
  is_primary, verified_at, created_by
)
select
  @followUpActionId,
  i.installation_id,
  i.atrium_installation_code,
  1,
  fic.last_verified_at,
  @actor
from dbo.FormInstanceContext fic
join dbo.Installation i
  on i.atrium_installation_code = fic.source_key
where fic.form_instance_id = @formInstanceId
  and fic.context_type = N'INSTALLATION';

insert into dbo.FollowUpActionAtriumContext
(
  follow_up_action_id, context_type, context_key, context_display_snapshot,
  source_snapshot_json, verified_at, created_by
)
select
  @followUpActionId,
  fic.context_type,
  fic.source_key,
  fic.display_label_snapshot,
  (
    select
      fic.source_system,
      fic.business_unit,
      fic.display_code_snapshot,
      json_query(fic.metadata_snapshot_json) as metadata
    for json path, without_array_wrapper
  ),
  fic.last_verified_at,
  @actor
from dbo.FormInstanceContext fic
where fic.form_instance_id = @formInstanceId
  and fic.context_type <> N'INSTALLATION';

insert into dbo.FollowUpActionEvent
  (follow_up_action_id, event_type, new_values_json, actor_display_name_snapshot)
values
  (@followUpActionId, N'CREATED',
   (select N'FORM' as source_type, @kind as kind, @initialStatus as status for json path, without_array_wrapper),
   @actor);
`;

export const insertManualFormFollowUpSql = `
declare @followUpActionId uniqueidentifier = newid();
declare @kindResolved nvarchar(30) = case when @kind = N'report-only' then N'report-only' else N'workflow' end;
declare @initialStatus nvarchar(30) = case when @kindResolved = N'report-only' then N'INFORMATIEF' else N'OPEN' end;

insert into dbo.FollowUpAction
(
  follow_up_action_id, source_type, kind, workflow_title, workflow_description,
  category, certificate_impact, status, status_set_at, status_set_by, created_by
)
values
(
  @followUpActionId, N'MANUAL', @kindResolved, @workflowTitle, @workflowDescription,
  case when @kindResolved = N'report-only' then N'rapportopmerking' else N'handmatig' end,
  @certificateImpact, @initialStatus, sysutcdatetime(), @actor, @actor
);

insert into dbo.FollowUpActionFormSource
(
  follow_up_action_id, form_instance_id, source_kind, source_question_name, source_question_type,
  source_row_index, source_item_code, source_fingerprint, created_by
)
values
(
  @followUpActionId, @formInstanceId, @kindResolved,
  case when @kindResolved = N'report-only' then N'Handmatige rapportopmerking' else N'Handmatig actiepunt' end,
  case when @kindResolved = N'report-only' then N'manual-report' else N'manual' end,
  null, null, @sourceFingerprint, @actor
);

insert into dbo.FollowUpActionInstallationContext
(
  follow_up_action_id, installation_id, atrium_installation_code,
  is_primary, verified_at, created_by
)
select @followUpActionId, i.installation_id, i.atrium_installation_code, 1, sysutcdatetime(), @actor
from dbo.Installation i
where i.atrium_installation_code = @atriumInstallationCode;

if @@rowcount = 0 throw 50000, 'installation context not found', 1;

insert into dbo.FollowUpActionEvent
  (follow_up_action_id, event_type, new_values_json, actor_display_name_snapshot)
values
  (@followUpActionId, N'CREATED',
   (select N'MANUAL' as source_type, @kindResolved as kind, @initialStatus as status for json path, without_array_wrapper),
   @actor);

select @followUpActionId as follow_up_action_id;
`;

export const updateFormFollowUpContentSql = `
declare @oldValues nvarchar(max) = (
  select a.kind, a.workflow_title, a.workflow_description, a.category, a.certificate_impact,
         fs.source_question_name, fs.source_question_type, fs.source_row_index, fs.source_item_code
  from dbo.FollowUpAction a
  join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
  where a.follow_up_action_id = @followUpActionId
  for json path, without_array_wrapper
);

update dbo.FollowUpAction
set kind = @kind, workflow_title = @workflowTitle,
    workflow_description = @workflowDescription, category = @category,
    certificate_impact = @certificateImpact,
    updated_at = sysutcdatetime(), updated_by = @actor
where follow_up_action_id = @followUpActionId;

update dbo.FollowUpActionFormSource
set source_kind = @kind,
    source_question_name = @sourceQuestionName, source_question_type = @sourceQuestionType,
    source_row_index = @sourceRowIndex, source_item_code = @sourceItemCode
where follow_up_action_id = @followUpActionId;

insert into dbo.FollowUpActionEvent
  (follow_up_action_id, event_type, old_values_json, new_values_json, actor_display_name_snapshot)
values
  (@followUpActionId, N'CONTENT_UPDATED', @oldValues,
   (select @kind as kind, @workflowTitle as workflow_title, @workflowDescription as workflow_description,
           @category as category, @certificateImpact as certificate_impact,
           @sourceQuestionName as source_question_name, @sourceQuestionType as source_question_type,
           @sourceRowIndex as source_row_index, @sourceItemCode as source_item_code
    for json path, without_array_wrapper), @actor);
`;

export const markFormFollowUpVervallenSql = `
declare @oldStatus nvarchar(30) = (select status from dbo.FollowUpAction where follow_up_action_id = @followUpActionId);

update dbo.FollowUpAction
set status = N'VERVALLEN', status_set_at = sysutcdatetime(), status_set_by = @actor,
    updated_at = sysutcdatetime(), updated_by = @actor
where follow_up_action_id = @followUpActionId
  and status in (N'OPEN', N'PLANNING_NODIG', N'WACHTENOPDERDEN', N'GEPLAND', N'INFORMATIEF');

if @@rowcount > 0
  insert into dbo.FollowUpActionEvent
    (follow_up_action_id, event_type, old_values_json, new_values_json, actor_display_name_snapshot)
  values
    (@followUpActionId, N'STATUS_CHANGED',
     (select @oldStatus as status for json path, without_array_wrapper),
     (select N'VERVALLEN' as status for json path, without_array_wrapper), @actor);
`;

export const getFormFollowUpSummaryByInstanceSql = `
select
  count(*) as total_count,
  sum(case when a.kind = N'workflow' and sd.is_actionable = 1 then 1 else 0 end) as open_count,
  sum(case when a.kind = N'workflow' and sd.is_terminal = 1 then 1 else 0 end) as terminal_count,
  sum(case when a.kind = N'report-only' then 1 else 0 end) as informative_count,
  sum(case when a.kind = N'workflow' then 1 else 0 end) as relevant_count
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
join dbo.FollowUpStatusDefinition sd on sd.status_code = a.status
where fs.form_instance_id = @formInstanceId
`;

const chainCte = `
;with current_form as (
  select top 1 form_instance_id, parent_instance_id
  from dbo.FormInstance where form_instance_id = @formInstanceId
),
ancestor_forms as (
  select form_instance_id, parent_instance_id from current_form
  union all
  select parent.form_instance_id, parent.parent_instance_id
  from dbo.FormInstance parent join ancestor_forms child on child.parent_instance_id = parent.form_instance_id
),
root_form as (
  select top 1 form_instance_id as root_form_instance_id
  from ancestor_forms order by case when parent_instance_id is null then 0 else 1 end
),
chain_form_ids as (
  select fi.form_instance_id
  from dbo.FormInstance fi join root_form root on root.root_form_instance_id = fi.form_instance_id
  union all
  select child.form_instance_id
  from dbo.FormInstance child join chain_form_ids parent on child.parent_instance_id = parent.form_instance_id
)
`;

export const getFormFollowUpSummaryByChainSql = `
${chainCte}
select
  count(*) as total_count,
  sum(case when a.kind = N'workflow' and sd.is_actionable = 1 then 1 else 0 end) as open_count,
  sum(case when a.kind = N'workflow' and sd.is_terminal = 1 then 1 else 0 end) as terminal_count,
  sum(case when a.kind = N'report-only' then 1 else 0 end) as informative_count,
  sum(case when a.kind = N'workflow' then 1 else 0 end) as relevant_count
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
join chain_form_ids cf on cf.form_instance_id = fs.form_instance_id
join dbo.FollowUpStatusDefinition sd on sd.status_code = a.status
`;

const monitorProjection = `
  a.follow_up_action_id,
  fs.form_instance_id,
  a.kind,
  a.workflow_title,
  a.workflow_description,
  a.category,
  a.priority,
  a.responsibility_type,
  a.certificate_impact,
  a.certificate_impact_override,
  isnull(a.certificate_impact_override, a.certificate_impact) as effective_certificate_impact,
  a.status,
  a.internal_note as note,
  coalesce(a.assigned_display_name_snapshot, a.assigned_email_snapshot, a.assigned_role_code) as assigned_to,
  a.due_date,
  a.resolution_note,
  a.resolution_outcome,
  a.resolved_at,
  a.resolved_by,
  a.created_at,
  a.created_by,
  a.updated_at,
  a.updated_by,
  fs.source_question_name,
  fs.source_question_type,
  fs.source_row_index,
  fs.source_item_code,
  coalesce((
    select
      p.drawing_pin_id,
      p.installation_document_id,
      p.stored_file_id,
      p.page_number,
      p.label as pin_label,
      d.title as drawing_title,
      sf.file_name as drawing_file_name
    from dbo.FollowUpActionDrawingPinMap pin_map
    join dbo.DrawingPin p
      on p.drawing_pin_id = pin_map.drawing_pin_id
     and p.is_deleted = 0
    join dbo.InstallationDocument d
      on d.document_id = p.installation_document_id
    left join dbo.StoredFile sf
      on sf.stored_file_id = p.stored_file_id
     and sf.is_deleted = 0
    where pin_map.follow_up_action_id = a.follow_up_action_id
    order by d.title, p.page_number, p.label
    for json path
  ), N'[]') as drawing_pins_json
`;

export const getFormFollowUpsMonitorByInstanceSql = `
select
${monitorProjection}
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
join dbo.FollowUpStatusDefinition sd on sd.status_code = a.status
where fs.form_instance_id = @formInstanceId
order by sd.is_terminal asc, sd.sort_order asc, a.created_at desc, a.follow_up_action_id desc
`;

export const getFormFollowUpsMonitorByChainSql = `
${chainCte},
chain_forms as (
  select fi.form_instance_id, fi.parent_instance_id, fi.atrium_installation_code,
         fd.code as form_code, fd.name as form_name, fv.version_label,
         case when fi.form_instance_id = @formInstanceId then N'current'
              when fi.form_instance_id = root.root_form_instance_id then N'parent'
              else N'child' end as source_relation
  from dbo.FormInstance fi
  join chain_form_ids cfi on cfi.form_instance_id = fi.form_instance_id
  join dbo.FormDefinitionVersion fv on fv.form_version_id = fi.form_version_id
  join dbo.FormDefinition fd on fd.form_id = fv.form_id
  cross join root_form root
)
select
${monitorProjection},
  cf.form_instance_id as source_form_instance_id,
  cf.source_relation as source_form_relation,
  cf.atrium_installation_code as source_atrium_installation_code,
  cf.form_code as source_form_code,
  cf.form_name as source_form_name,
  cf.version_label as source_version_label
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
join chain_forms cf on cf.form_instance_id = fs.form_instance_id
join dbo.FollowUpStatusDefinition sd on sd.status_code = a.status
order by sd.is_terminal asc, sd.sort_order asc,
         case cf.source_relation when N'current' then 0 when N'parent' then 1 else 2 end,
         a.created_at desc, a.follow_up_action_id desc
`;

export const getFormFollowUpByIdSql = `
select top 1
  a.follow_up_action_id, fs.form_instance_id, a.kind, a.status,
  a.assigned_role_code,
  a.internal_note as note, a.workflow_title, a.certificate_impact,
  a.certificate_impact_override,
  isnull(a.certificate_impact_override, a.certificate_impact) as effective_certificate_impact,
  a.resolution_outcome, a.resolution_note,
  fi.status as form_status, ab.installation_status
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
join dbo.FormInstance fi on fi.form_instance_id = fs.form_instance_id
left join dbo.AtriumInstallationBase ab on ab.installatie_code = fi.atrium_installation_code
where a.follow_up_action_id = @followUpActionId
`;

export const getFormInstanceWorkflowRoleAccessSql = `
select cast(case when exists (
  select 1
  from dbo.FollowUpAction a
  join dbo.FollowUpActionFormSource fs
    on fs.follow_up_action_id = a.follow_up_action_id
  where fs.form_instance_id = @formInstanceId
    and a.assigned_role_code = @workflowRoleCode
) then 1 else 0 end as bit) as has_access;
`;

export const updateFormFollowUpStatusSql = `
declare @oldValues nvarchar(max) = (
  select status, resolution_note, resolution_outcome, resolved_at, resolved_by
  from dbo.FollowUpAction where follow_up_action_id = @followUpActionId
  for json path, without_array_wrapper
);

update dbo.FollowUpAction
set status = @nextStatus, status_set_at = sysutcdatetime(), status_set_by = @actor,
    resolution_note = @resolutionNote,
    resolved_at = case when @isResolved = 1 then sysutcdatetime() else null end,
    resolved_by = case when @isResolved = 1 then @actor else null end,
    updated_at = sysutcdatetime(), updated_by = @actor
where follow_up_action_id = @followUpActionId;

insert into dbo.FollowUpActionEvent
  (follow_up_action_id, event_type, old_values_json, new_values_json, actor_display_name_snapshot)
values
  (@followUpActionId, N'STATUS_CHANGED', @oldValues,
   (select @nextStatus as status, @resolutionNote as resolution_note,
           case when @isResolved = 1 then @actor else null end as resolved_by
    for json path, without_array_wrapper), @actor);

select top 1 a.follow_up_action_id, fs.form_instance_id, a.kind, a.status,
  a.internal_note as note, a.resolution_outcome, a.resolution_note,
  a.resolved_at, a.resolved_by, a.updated_at, a.updated_by
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
where a.follow_up_action_id = @followUpActionId
`;

export const updateFormFollowUpNoteSql = `
declare @oldNote nvarchar(4000) = (select internal_note from dbo.FollowUpAction where follow_up_action_id = @followUpActionId);

update dbo.FollowUpAction
set internal_note = @note, updated_at = sysutcdatetime(), updated_by = @actor
where follow_up_action_id = @followUpActionId;

insert into dbo.FollowUpActionEvent
  (follow_up_action_id, event_type, old_values_json, new_values_json, actor_display_name_snapshot)
values
  (@followUpActionId, N'NOTE_UPDATED',
   (select @oldNote as note for json path, without_array_wrapper),
   (select @note as note for json path, without_array_wrapper), @actor);

select top 1 a.follow_up_action_id, fs.form_instance_id, a.kind, a.status,
  a.internal_note as note, a.resolution_outcome, a.updated_at, a.updated_by
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
where a.follow_up_action_id = @followUpActionId
`;

export const updateFormFollowUpCertificateImpactSql = `
declare @oldImpact nvarchar(20) = (select certificate_impact_override from dbo.FollowUpAction where follow_up_action_id = @followUpActionId);

update dbo.FollowUpAction
set certificate_impact_override = @certificateImpactOverride,
    updated_at = sysutcdatetime(), updated_by = @actor
where follow_up_action_id = @followUpActionId and kind = N'workflow';

if @@rowcount > 0
  insert into dbo.FollowUpActionEvent
    (follow_up_action_id, event_type, old_values_json, new_values_json, actor_display_name_snapshot)
  values
    (@followUpActionId, N'CERTIFICATE_IMPACT_CHANGED',
     (select @oldImpact as certificate_impact_override for json path, without_array_wrapper),
     (select @certificateImpactOverride as certificate_impact_override for json path, without_array_wrapper), @actor);

select top 1 a.follow_up_action_id, fs.form_instance_id, a.kind,
  a.certificate_impact, a.certificate_impact_override,
  isnull(a.certificate_impact_override, a.certificate_impact) as effective_certificate_impact,
  a.updated_at, a.updated_by
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
where a.follow_up_action_id = @followUpActionId
`;
