export const getFormDefinitionFollowUpRulesSql = `
select
  r.form_follow_up_rule_id,
  r.trigger_type,
  r.condition_json,
  r.action_title_template,
  r.action_description_template,
  r.category,
  r.priority,
  r.responsibility_type,
  r.assigned_role_code,
  r.due_after_days,
  r.certificate_impact,
  r.visibility,
  r.sort_order
from dbo.FormInstance fi
join dbo.FormDefinitionVersion fv on fv.form_version_id = fi.form_version_id
join dbo.FormDefinitionFollowUpRule r on r.form_id = fv.form_id
where fi.form_instance_id = @formInstanceId
  and r.is_active = 1
  and r.trigger_type in (
    select upper(ltrim(rtrim(convert(nvarchar(20), [value]))))
    from openjson(@triggersJson)
  )
order by r.sort_order, r.form_follow_up_rule_id;
`;

export const upsertFormDefinitionFollowUpSql = `
set xact_abort on;

declare @followUpActionId uniqueidentifier;
declare @existingStatus nvarchar(30);
declare @now datetime2(3) = sysutcdatetime();

select top 1
  @followUpActionId = a.follow_up_action_id,
  @existingStatus = a.status
from dbo.FollowUpAction a
join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
where fs.form_instance_id = @formInstanceId
  and fs.source_kind = N'workflow'
  and fs.source_fingerprint = @sourceFingerprint;

begin transaction;

if @followUpActionId is null
begin
  set @followUpActionId = newid();

  insert into dbo.FollowUpAction
  (
    follow_up_action_id, source_type, kind, workflow_title, workflow_description,
    category, priority, responsibility_type, certificate_impact,
    status, status_set_at, status_set_by,
    assignment_type, assigned_role_code, due_date, customer_visible,
    created_by
  )
  values
  (
    @followUpActionId, N'FORM', N'workflow', @workflowTitle, @workflowDescription,
    @category, @priority, @responsibilityType, @certificateImpact,
    N'OPEN', @now, @actor,
    case when @assignedRoleCode is null then N'NONE' else N'ROLE' end,
    @assignedRoleCode,
    case when @dueAfterDays is null then null else dateadd(day, @dueAfterDays, convert(date, @now)) end,
    @customerVisible,
    @actor
  );

  insert into dbo.FollowUpActionFormSource
  (
    follow_up_action_id, form_instance_id, source_kind,
    source_question_name, source_question_type, source_row_index,
    source_item_code, source_fingerprint, created_by
  )
  values
  (
    @followUpActionId, @formInstanceId, N'workflow',
    @sourceQuestionName, N'definition-rule', null,
    @sourceItemCode, @sourceFingerprint, @actor
  );

  insert into dbo.FollowUpActionInstallationContext
  (
    follow_up_action_id, installation_id, atrium_installation_code,
    is_primary, display_snapshot, verified_at, created_by
  )
  select
    @followUpActionId, i.installation_id, i.atrium_installation_code,
    1, fic.display_label_snapshot, fic.last_verified_at, @actor
  from dbo.FormInstanceContext fic
  join dbo.Installation i on i.atrium_installation_code = fic.source_key
  where fic.form_instance_id = @formInstanceId
    and fic.context_type = N'INSTALLATION';

  insert into dbo.FollowUpActionAtriumContext
  (
    follow_up_action_id, context_type, context_key, context_display_snapshot,
    source_snapshot_json, verified_at, created_by
  )
  select
    @followUpActionId, fic.context_type, fic.source_key, fic.display_label_snapshot,
    (
      select fic.source_system, fic.business_unit, fic.display_code_snapshot,
             json_query(fic.metadata_snapshot_json) as metadata
      for json path, without_array_wrapper
    ),
    fic.last_verified_at, @actor
  from dbo.FormInstanceContext fic
  where fic.form_instance_id = @formInstanceId
    and fic.context_type <> N'INSTALLATION';

  insert into dbo.FollowUpActionEvent
    (follow_up_action_id, event_type, new_values_json, actor_display_name_snapshot)
  values
    (@followUpActionId, N'CREATED',
     (select N'FORM' as source_type, N'definition-rule' as source_kind,
             @triggerType as trigger_type, N'OPEN' as status,
             @assignedRoleCode as assigned_role_code
      for json path, without_array_wrapper),
     @actor);
end
else if @existingStatus not in (N'AFGEHANDELD', N'AFGEWEZEN', N'VERVALLEN')
begin
  declare @oldValues nvarchar(max) = (
    select workflow_title, workflow_description, category, priority,
           responsibility_type, certificate_impact, assignment_type,
           assigned_role_code, due_date, customer_visible
    from dbo.FollowUpAction
    where follow_up_action_id = @followUpActionId
    for json path, without_array_wrapper
  );

  update dbo.FollowUpAction
  set workflow_title = @workflowTitle,
      workflow_description = @workflowDescription,
      category = @category,
      priority = @priority,
      responsibility_type = @responsibilityType,
      certificate_impact = @certificateImpact,
      assignment_type = case when @assignedRoleCode is null then N'NONE' else N'ROLE' end,
      assigned_user_object_id = null,
      assigned_role_code = @assignedRoleCode,
      assigned_display_name_snapshot = null,
      assigned_email_snapshot = null,
      due_date = case
        when due_date is not null then due_date
        when @dueAfterDays is null then null
        else dateadd(day, @dueAfterDays, convert(date, created_at))
      end,
      customer_visible = @customerVisible,
      updated_at = @now,
      updated_by = @actor
  where follow_up_action_id = @followUpActionId;

  insert into dbo.FollowUpActionEvent
    (follow_up_action_id, event_type, old_values_json, new_values_json, actor_display_name_snapshot)
  values
    (@followUpActionId, N'DEFINITION_RULE_REAPPLIED', @oldValues,
     (select @triggerType as trigger_type, @workflowTitle as workflow_title,
             @workflowDescription as workflow_description, @category as category,
             @priority as priority, @responsibilityType as responsibility_type,
             @assignedRoleCode as assigned_role_code, @customerVisible as customer_visible
      for json path, without_array_wrapper),
     @actor);
end;

commit transaction;

select @followUpActionId as follow_up_action_id,
       case when @existingStatus is null then N'INSERTED'
            when @existingStatus in (N'AFGEHANDELD', N'AFGEWEZEN', N'VERVALLEN') then N'UNCHANGED_TERMINAL'
            else N'UPDATED' end as sync_result;
`;
