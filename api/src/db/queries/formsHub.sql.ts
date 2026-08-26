export const getFormsHubCatalogSql = `
select
  fd.form_id,
  fd.code,
  fd.name,
  fd.description,
  fd.official_document_number,
  fd.owner_department,
  fd.owner_display_name,
  fd.knowledge_base_reference,
  fd.requires_installation_review,
  fd.status,
  fd.sort_order,
  fv.form_version_id,
  fv.version,
  fv.version_label,
  fv.published_at,
  fv.effective_from,
  fv.change_summary,
  fv.issued_by,
  fv.knowledge_base_reference as version_knowledge_base_reference,
  context_rules.context_rules_json
from dbo.FormDefinition fd
outer apply (
  select top 1 v.*
  from dbo.FormDefinitionVersion v
  where v.form_id = fd.form_id
    and v.is_active = 1
    and v.published_at is not null
    and (v.effective_from is null or v.effective_from <= sysutcdatetime())
  order by v.version desc
) fv
outer apply (
  select (
    select
      r.context_type,
      r.is_required,
      r.is_primary,
      r.selection_order
    from dbo.FormDefinitionContextRule r
    where r.form_id = fd.form_id
      and r.is_active = 1
    order by r.selection_order, r.context_type
    for json path
  ) as context_rules_json
) context_rules
where fd.status = 'A'
  and fv.form_version_id is not null
order by fd.sort_order, fd.name, fd.code;
`;

export const getFormsHubInstancesSql = `
;with actor_candidates as (
  select distinct lower(ltrim(rtrim(convert(nvarchar(320), [value])))) as actor
  from openjson(isnull(@actorCandidatesJson, N'[]'))
  where nullif(ltrim(rtrim(convert(nvarchar(320), [value]))), N'') is not null
),
base as (
  select
    fi.form_instance_id,
    fi.status,
    fi.instance_title,
    fi.instance_note,
    fi.parent_instance_id,
    fi.atrium_installation_code,
    fi.created_at,
    fi.created_by,
    fi.updated_at,
    fi.updated_by,
    fi.submitted_at,
    fi.submitted_by,
    fi.assigned_user_object_id,
    fi.assigned_display_name_snapshot,
    fi.assigned_email_snapshot,
    fd.code as form_code,
    fd.name as form_name,
    fd.official_document_number,
    fd.requires_installation_review,
    fv.version,
    fv.version_label,
    primary_context.context_type as primary_context_type,
    primary_context.display_code_snapshot as primary_context_code,
    primary_context.display_label_snapshot as primary_context_label,
    context_columns.relation_code,
    context_columns.relation_label,
    context_columns.project_code,
    context_columns.project_label,
    context_columns.work_order_code,
    context_columns.work_order_label,
    context_columns.installation_code,
    context_columns.installation_label,
    context_columns.employee_code,
    context_columns.employee_label,
    isnull(current_actions.new_follow_up_count, 0) as new_follow_up_count,
    isnull(installation_actions.open_installation_point_count, 0) as open_installation_point_count,
    case
      when fd.requires_installation_review = 0 then N'NIET_VAN_TOEPASSING'
      when fi.atrium_installation_code is null then N'CONTEXT_ONTBREEKT'
      when review_state.completed_at is null then N'ONTBREEKT'
      when review_state.last_action_change_at > review_state.completed_at then N'VEROUDERD'
      else N'VOLTOOID'
    end as follow_up_review_status,
    contexts.contexts_json
  from dbo.FormInstance fi
  join dbo.FormDefinitionVersion fv on fv.form_version_id = fi.form_version_id
  join dbo.FormDefinition fd on fd.form_id = fv.form_id
  outer apply (
    select top 1 fic.context_type, fic.display_code_snapshot, fic.display_label_snapshot
    from dbo.FormInstanceContext fic
    where fic.form_instance_id = fi.form_instance_id
      and fic.is_primary = 1
  ) primary_context
  outer apply (
    select (
      select
        fic.context_type,
        fic.source_system,
        fic.business_unit,
        fic.source_key,
        fic.display_code_snapshot,
        fic.display_label_snapshot,
        fic.is_primary,
        fic.derivation_type,
        fic.last_verified_at,
        fic.verification_status
      from dbo.FormInstanceContext fic
      where fic.form_instance_id = fi.form_instance_id
      order by fic.is_primary desc, fic.context_type, fic.display_label_snapshot
      for json path
    ) as contexts_json
  ) contexts
  outer apply (
    select
      max(case when fic.context_type = N'RELATION' then fic.display_code_snapshot end) as relation_code,
      max(case when fic.context_type = N'RELATION' then fic.display_label_snapshot end) as relation_label,
      max(case when fic.context_type = N'PROJECT' then fic.display_code_snapshot end) as project_code,
      max(case when fic.context_type = N'PROJECT' then fic.display_label_snapshot end) as project_label,
      max(case when fic.context_type = N'WORK_ORDER' then fic.display_code_snapshot end) as work_order_code,
      max(case when fic.context_type = N'WORK_ORDER' then fic.display_label_snapshot end) as work_order_label,
      max(case when fic.context_type = N'INSTALLATION' then fic.display_code_snapshot end) as installation_code,
      max(case when fic.context_type = N'INSTALLATION' then fic.display_label_snapshot end) as installation_label,
      max(case when fic.context_type = N'EMPLOYEE' then fic.display_code_snapshot end) as employee_code,
      max(case when fic.context_type = N'EMPLOYEE' then fic.display_label_snapshot end) as employee_label
    from dbo.FormInstanceContext fic
    where fic.form_instance_id = fi.form_instance_id
  ) context_columns
  outer apply (
    select count(*) as new_follow_up_count
    from dbo.FollowUpAction a
    join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
    where fs.form_instance_id = fi.form_instance_id
      and a.kind = N'workflow'
      and a.status <> N'VERVALLEN'
  ) current_actions
  outer apply (
    select count(distinct a.follow_up_action_id) as open_installation_point_count
    from dbo.FollowUpAction a
    join dbo.FollowUpStatusDefinition sd on sd.status_code = a.status
    join dbo.FollowUpActionInstallationContext ic on ic.follow_up_action_id = a.follow_up_action_id
    where ic.atrium_installation_code = fi.atrium_installation_code
      and a.kind = N'workflow'
      and sd.is_actionable = 1
  ) installation_actions
  outer apply (
    select
      latest.completed_at,
      (
        select max(coalesce(a.updated_at, a.created_at))
        from dbo.FollowUpAction a
        join dbo.FollowUpStatusDefinition sd on sd.status_code = a.status
        join dbo.FollowUpActionInstallationContext ic on ic.follow_up_action_id = a.follow_up_action_id
        where ic.atrium_installation_code = fi.atrium_installation_code
          and a.kind = N'workflow'
          and sd.requires_review = 1
      ) as last_action_change_at
    from (select 1 as anchor) anchor
    outer apply (
      select top 1 b.completed_at
      from dbo.FollowUpReviewBatch b
      where b.atrium_installation_code = fi.atrium_installation_code
        and b.status = N'COMPLETED'
      order by b.completed_at desc, b.follow_up_review_batch_id desc
    ) latest
  ) review_state
  where
    @mine = 0
    or exists (
      select 1
      from actor_candidates ac
      where ac.actor = lower(ltrim(rtrim(isnull(fi.created_by, N''))))
         or ac.actor = lower(ltrim(rtrim(isnull(fi.assigned_user_object_id, N''))))
         or ac.actor = lower(ltrim(rtrim(isnull(fi.assigned_email_snapshot, N''))))
    )
)
select *
from base b
where (@status is null or b.status = @status)
  and (@formCode is null or b.form_code = @formCode)
  and (@dateFrom is null or b.created_at >= @dateFrom)
  and (@dateTo is null or b.created_at < dateadd(day, 1, @dateTo))
  and (@hasOpenPoints is null or (@hasOpenPoints = 1 and b.open_installation_point_count > 0) or (@hasOpenPoints = 0 and b.open_installation_point_count = 0))
  and (@reviewStatus is null or b.follow_up_review_status = @reviewStatus)
  and (
    @contextQ is null
    or isnull(b.relation_code, N'') like N'%' + @contextQ + N'%'
    or isnull(b.relation_label, N'') like N'%' + @contextQ + N'%'
    or isnull(b.project_code, N'') like N'%' + @contextQ + N'%'
    or isnull(b.project_label, N'') like N'%' + @contextQ + N'%'
    or isnull(b.work_order_code, N'') like N'%' + @contextQ + N'%'
    or isnull(b.work_order_label, N'') like N'%' + @contextQ + N'%'
    or isnull(b.installation_code, N'') like N'%' + @contextQ + N'%'
    or isnull(b.installation_label, N'') like N'%' + @contextQ + N'%'
    or isnull(b.employee_code, N'') like N'%' + @contextQ + N'%'
    or isnull(b.employee_label, N'') like N'%' + @contextQ + N'%'
  )
  and (
    @q is null
    or b.form_name like N'%' + @q + N'%'
    or b.form_code like N'%' + @q + N'%'
    or isnull(b.instance_title, N'') like N'%' + @q + N'%'
    or isnull(b.primary_context_code, N'') like N'%' + @q + N'%'
    or isnull(b.primary_context_label, N'') like N'%' + @q + N'%'
  )
order by isnull(b.updated_at, b.created_at) desc, b.form_instance_id desc;
`;

export const searchFormsHubContextSql = `
if @contextType = N'INSTALLATION'
begin
  select top (50)
    N'INSTALLATION' as context_type,
    N'FABRIC_GOLD' as source_system,
    ab.BedrijfUnit as business_unit,
    ab.installatie_code as source_key,
    ab.installatie_code as display_code,
    coalesce(nullif(ab.installatie_naam, N''), nullif(ab.obj_naam, N''), ab.installatie_code) as display_label,
    (select ab.object_code, ab.obj_naam, ab.obj_adr_formatted, ab.installatietype_code,
            ab.installatietype_omschrijving for json path, without_array_wrapper) as metadata_json,
    cast(null as datetime2(3)) as source_modified_at,
    sysutcdatetime() as last_verified_at,
    N'VERIFIED' as verification_status
  from dbo.AtriumInstallationBase ab
  where (@businessUnit is null or ab.BedrijfUnit = @businessUnit)
    and (
      ab.installatie_code like N'%' + @q + N'%'
      or isnull(ab.installatie_naam, N'') like N'%' + @q + N'%'
      or isnull(ab.obj_naam, N'') like N'%' + @q + N'%'
      or isnull(ab.obj_adr_formatted, N'') like N'%' + @q + N'%'
    )
  order by coalesce(nullif(ab.installatie_naam, N''), nullif(ab.obj_naam, N''), ab.installatie_code);
  return;
end;

if @contextType = N'EMPLOYEE'
begin
  select top (50)
    N'EMPLOYEE' as context_type,
    N'EMBER_DIRECTORY' as source_system,
    cast(null as nvarchar(30)) as business_unit,
    up.user_object_id as source_key,
    up.email_snapshot as display_code,
    coalesce(nullif(up.preferred_display_name, N''), nullif(up.display_name_snapshot, N''), up.email_snapshot) as display_label,
    (select up.email_snapshot, up.display_name_snapshot, up.preferred_display_name
       for json path, without_array_wrapper) as metadata_json,
    up.updated_at as source_modified_at,
    sysutcdatetime() as last_verified_at,
    N'VERIFIED' as verification_status
  from dbo.UserProfile up
  where up.user_object_id is not null
    and (
      isnull(up.preferred_display_name, N'') like N'%' + @q + N'%'
      or isnull(up.display_name_snapshot, N'') like N'%' + @q + N'%'
      or isnull(up.email_snapshot, N'') like N'%' + @q + N'%'
    )
  order by coalesce(nullif(up.preferred_display_name, N''), nullif(up.display_name_snapshot, N''), up.email_snapshot);
  return;
end;

throw 50000, 'context type requires a live Reader lookup', 1;
`;

export const getFormsHubStartRulesSql = `
select
  r.context_type,
  r.is_required,
  r.is_primary,
  r.selection_order
from dbo.FormDefinition fd
join dbo.FormDefinitionContextRule r on r.form_id = fd.form_id
where fd.code = @formCode
  and fd.status = N'A'
  and r.is_active = 1
order by r.selection_order, r.context_type;
`;

export const startFormsHubInstanceSql = `
set xact_abort on;
begin try
begin transaction;

declare @formId uniqueidentifier;
declare @formVersionId uniqueidentifier;

select top 1 @formId = fd.form_id
from dbo.FormDefinition fd
where fd.code = @formCode
  and fd.status = 'A';

if @formId is null throw 50000, 'form not found', 1;

select top 1 @formVersionId = fv.form_version_id
from dbo.FormDefinitionVersion fv
where fv.form_id = @formId
  and fv.is_active = 1
  and fv.published_at is not null
  and (fv.effective_from is null or fv.effective_from <= sysutcdatetime())
order by fv.version desc;

if @formVersionId is null throw 50000, 'form has no active published version', 1;
if isjson(@contextsJson) <> 1 throw 50000, 'invalid contexts', 1;

declare @selected table (
  context_type nvarchar(30) not null,
  source_system nvarchar(30) not null,
  business_unit nvarchar(50) null,
  source_key nvarchar(450) not null,
  display_code nvarchar(250) null,
  display_label nvarchar(500) null,
  metadata_json nvarchar(max) null,
  source_modified_at datetime2(3) null,
  last_verified_at datetime2(3) null,
  verification_status nvarchar(20) not null,
  derivation_type nvarchar(20) not null,
  primary key (context_type)
);

insert into @selected (
  context_type, source_system, business_unit, source_key,
  display_code, display_label, metadata_json, source_modified_at,
  last_verified_at, verification_status, derivation_type
)
select
  upper(ltrim(rtrim(context_type))),
  upper(ltrim(rtrim(source_system))),
  nullif(ltrim(rtrim(business_unit)), N''),
  ltrim(rtrim(source_key)),
  nullif(ltrim(rtrim(display_code)), N''),
  nullif(ltrim(rtrim(display_label)), N''),
  metadata_json,
  source_modified_at,
  last_verified_at,
  upper(ltrim(rtrim(verification_status))),
  upper(ltrim(rtrim(derivation_type)))
from openjson(@contextsJson)
with (
  context_type nvarchar(30) '$.context_type',
  source_system nvarchar(30) '$.source_system',
  business_unit nvarchar(50) '$.business_unit',
  source_key nvarchar(450) '$.source_key',
  display_code nvarchar(250) '$.display_code',
  display_label nvarchar(500) '$.display_label',
  metadata_json nvarchar(max) '$.metadata_json',
  source_modified_at datetime2(3) '$.source_modified_at',
  last_verified_at datetime2(3) '$.last_verified_at',
  verification_status nvarchar(20) '$.verification_status',
  derivation_type nvarchar(20) '$.derivation_type'
)
where nullif(ltrim(rtrim(context_type)), N'') is not null
  and nullif(ltrim(rtrim(source_system)), N'') is not null
  and nullif(ltrim(rtrim(source_key)), N'') is not null
  and nullif(ltrim(rtrim(verification_status)), N'') is not null
  and nullif(ltrim(rtrim(derivation_type)), N'') is not null;

if (select count(*) from openjson(@contextsJson)) <> (select count(*) from @selected)
  throw 50000, 'resolved context payload contains incomplete or duplicate rows', 1;

if exists (
  select 1 from @selected s
  where s.context_type not in (N'RELATION', N'PROJECT', N'WORK_ORDER', N'INSTALLATION', N'EMPLOYEE')
     or s.verification_status <> N'VERIFIED'
     or s.derivation_type not in (N'SELECTED', N'DERIVED')
     or (s.metadata_json is not null and isjson(s.metadata_json) <> 1)
     or (s.context_type in (N'RELATION', N'PROJECT', N'WORK_ORDER') and (
          s.source_system <> N'ATRIUM_READER'
          or s.business_unit <> @authorizedBusinessUnit
          or s.source_key not like @authorizedBusinessUnit + N'|%'
          or s.display_label is null
          or s.last_verified_at is null
        ))
     or (s.context_type = N'INSTALLATION' and (
          s.source_system <> N'FABRIC_GOLD'
          or s.business_unit <> @authorizedBusinessUnit
        ))
     or (s.context_type = N'EMPLOYEE' and s.source_system <> N'EMBER_DIRECTORY')
) throw 50000, 'resolved context contract invalid', 1;

if exists (
  select 1
  from @selected s
  where not exists (
    select 1
    from dbo.FormDefinitionContextRule r
    where r.form_id = @formId
      and r.context_type = s.context_type
      and r.is_active = 1
  )
) throw 50000, 'context type not allowed for form', 1;

if exists (
  select 1
  from dbo.FormDefinitionContextRule r
  where r.form_id = @formId
    and r.is_active = 1
    and r.is_required = 1
    and not exists (select 1 from @selected s where s.context_type = r.context_type)
) throw 50000, 'required context missing', 1;

declare @primaryContextType nvarchar(30);
select @primaryContextType = r.context_type
from dbo.FormDefinitionContextRule r
where r.form_id = @formId
  and r.is_active = 1
  and r.is_primary = 1;

if @primaryContextType is not null
  and not exists (select 1 from @selected where context_type = @primaryContextType)
  throw 50000, 'primary context missing', 1;

declare @resolved table (
  context_type nvarchar(30) not null primary key,
  source_system nvarchar(30) not null,
  business_unit nvarchar(50) null,
  source_key nvarchar(450) not null,
  display_code nvarchar(250) null,
  display_label nvarchar(500) not null,
  metadata_json nvarchar(max) null,
  source_modified_at datetime2(3) null,
  last_verified_at datetime2(3) null,
  verification_status nvarchar(20) not null
);

insert into @resolved
select
  s.context_type,
  N'FABRIC_GOLD',
  ab.BedrijfUnit,
  ab.installatie_code,
  ab.installatie_code,
  coalesce(nullif(ab.installatie_naam, N''), nullif(ab.obj_naam, N''), ab.installatie_code),
  (select ab.object_code, ab.obj_naam, ab.obj_adr_formatted, ab.installatietype_code,
          ab.installatietype_omschrijving,
          json_value(s.metadata_json, '$.reader_correlation_id') as reader_correlation_id
     for json path, without_array_wrapper),
  null,
  sysutcdatetime(),
  N'VERIFIED'
from @selected s
join dbo.AtriumInstallationBase ab
 on s.context_type = N'INSTALLATION'
 and s.source_system = N'FABRIC_GOLD'
 and ab.installatie_code = s.source_key
 and ab.BedrijfUnit = @authorizedBusinessUnit;

insert into @resolved
select
  s.context_type,
  N'EMBER_DIRECTORY',
  null,
  up.user_object_id,
  up.email_snapshot,
  coalesce(nullif(up.preferred_display_name, N''), nullif(up.display_name_snapshot, N''), up.email_snapshot),
  (select up.email_snapshot, up.display_name_snapshot, up.preferred_display_name
     for json path, without_array_wrapper),
  up.updated_at,
  sysutcdatetime(),
  N'VERIFIED'
from @selected s
join dbo.UserProfile up
  on s.context_type = N'EMPLOYEE'
 and s.source_system = N'EMBER_DIRECTORY'
 and up.user_object_id = s.source_key;

insert into @resolved
select
  s.context_type,
  s.source_system,
  s.business_unit,
  s.source_key,
  s.display_code,
  s.display_label,
  s.metadata_json,
  s.source_modified_at,
  s.last_verified_at,
  s.verification_status
from @selected s
where s.context_type in (N'RELATION', N'PROJECT', N'WORK_ORDER');

if (select count(*) from @resolved) <> (select count(*) from @selected)
  throw 50000, 'resolved context not found in an approved live or local source', 1;

declare @installationId uniqueidentifier = null;
declare @installationCode nvarchar(450) = null;

select @installationCode = source_key
from @resolved
where context_type = N'INSTALLATION';

if @installationCode is not null
begin
  if not exists (select 1 from dbo.Installation where atrium_installation_code = @installationCode)
  begin
    insert into dbo.Installation (
      installation_id, atrium_installation_code, installation_type_key,
      created_at, created_by, is_active
    )
    values (newid(), @installationCode, null, sysutcdatetime(), @createdBy, 1);
  end;

  select @installationId = installation_id
  from dbo.Installation
  where atrium_installation_code = @installationCode;
end;

insert into dbo.FormInstance (
  form_version_id, installation_id, atrium_installation_code, status,
  instance_title, instance_note, parent_instance_id, draft_rev,
  created_at, created_by
)
values (
  @formVersionId, @installationId, @installationCode, N'CONCEPT',
  @instanceTitle, @instanceNote, @parentInstanceId, 0,
  sysutcdatetime(), @createdBy
);

declare @instanceId bigint = cast(scope_identity() as bigint);

insert into dbo.FormInstanceContext (
  form_instance_id, context_type, source_system, business_unit, source_key,
  display_code_snapshot, display_label_snapshot, metadata_snapshot_json,
  is_primary, derivation_type, selected_at, selected_by,
  source_modified_at, last_verified_at, verification_status
)
select
  @instanceId, r.context_type, r.source_system, r.business_unit, r.source_key,
  r.display_code, r.display_label, r.metadata_json,
  case when r.context_type = @primaryContextType then 1 else 0 end,
  s.derivation_type, sysutcdatetime(), @createdBy,
  r.source_modified_at, r.last_verified_at, r.verification_status
from @resolved r
join @selected s on s.context_type = r.context_type;

insert into dbo.FormAnswer (
  form_instance_id, answers_json, calculated_json, updated_at, updated_by
)
values (@instanceId, N'{}', null, sysutcdatetime(), @createdBy);

commit transaction;

select
  @instanceId as form_instance_id,
  @formVersionId as form_version_id,
  @formId as form_id,
  @installationCode as atrium_installation_code;
end try
begin catch
  if @@trancount > 0 rollback transaction;
  throw;
end catch;
`;

export const getFormsHubInstanceSql = `
select top 1
  fi.form_instance_id,
  fi.form_version_id,
  fi.installation_id,
  fi.atrium_installation_code,
  fi.status,
  fi.instance_title,
  fi.instance_note,
  fi.parent_instance_id,
  fi.draft_rev,
  fi.locked_by,
  fi.lock_expires_at,
  fi.created_at,
  fi.created_by,
  fi.updated_at,
  fi.updated_by,
  fi.submitted_at,
  fi.submitted_by,
  fd.form_id,
  fd.code as form_code,
  fd.name as form_name,
  fd.description as form_description,
  fd.official_document_number,
  fd.requires_installation_review,
  fv.version,
  fv.version_label,
  fv.published_at,
  fv.published_by,
  fv.survey_json,
  fa.answers_json,
  fa.calculated_json,
  fa.updated_at as answers_updated_at,
  fa.updated_by as answers_updated_by,
  contexts.contexts_json
from dbo.FormInstance fi
join dbo.FormDefinitionVersion fv on fv.form_version_id = fi.form_version_id
join dbo.FormDefinition fd on fd.form_id = fv.form_id
left join dbo.FormAnswer fa on fa.form_instance_id = fi.form_instance_id
outer apply (
  select (
    select
      fic.context_type,
      fic.source_system,
      fic.business_unit,
      fic.source_key,
      fic.display_code_snapshot,
      fic.display_label_snapshot,
      fic.metadata_snapshot_json,
      fic.is_primary,
      fic.derivation_type,
      fic.selected_at,
      fic.selected_by,
      fic.source_modified_at,
      fic.last_verified_at,
      fic.verification_status
    from dbo.FormInstanceContext fic
    where fic.form_instance_id = fi.form_instance_id
    order by fic.is_primary desc, fic.context_type, fic.display_label_snapshot
    for json path
  ) as contexts_json
) contexts
where fi.form_instance_id = @instanceId;
`;

export const updateFormsHubInstanceMetadataSql = `
declare @trimmedTitle nvarchar(200) = nullif(ltrim(rtrim(@instanceTitle)), N'');
declare @trimmedNote nvarchar(max) = nullif(ltrim(rtrim(@instanceNote)), N'');

declare @status nvarchar(30);
declare @currentRev int;
select @status = status, @currentRev = draft_rev
from dbo.FormInstance
where form_instance_id = @instanceId
  and atrium_installation_code is null;

if @status is null throw 50000, 'form instance not found', 1;
if @status <> N'CONCEPT' throw 50000, 'form instance not editable', 1;
if @currentRev <> @expectedDraftRev throw 50000, 'draft_rev conflict', 1;

if @parentInstanceId is not null
begin
  if @parentInstanceId = @instanceId throw 50000, 'parent form instance invalid', 1;

  if not exists (
    select 1
    from dbo.FormInstance parent_fi
    where parent_fi.form_instance_id = @parentInstanceId
      and parent_fi.atrium_installation_code is null
      and exists (
        select 1
        from dbo.FormInstanceContext child_context
        join dbo.FormInstanceContext parent_context
          on parent_context.form_instance_id = parent_fi.form_instance_id
         and parent_context.is_primary = 1
         and parent_context.context_type = child_context.context_type
         and parent_context.source_system = child_context.source_system
         and parent_context.source_key = child_context.source_key
        where child_context.form_instance_id = @instanceId
          and child_context.is_primary = 1
      )
  ) throw 50000, 'parent form instance not found in same primary context', 1;
end;

update dbo.FormInstance
set
  instance_title = @trimmedTitle,
  instance_note = @trimmedNote,
  parent_instance_id = @parentInstanceId,
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy,
  draft_rev = draft_rev + 1
where form_instance_id = @instanceId
  and atrium_installation_code is null;

select form_instance_id, instance_title, instance_note, parent_instance_id,
       draft_rev, updated_at, updated_by
from dbo.FormInstance
where form_instance_id = @instanceId;
`;

export const saveFormsHubAnswersSql = `
declare @currentRev int;
declare @status nvarchar(30);

select @currentRev = draft_rev, @status = status
from dbo.FormInstance
where form_instance_id = @instanceId
  and atrium_installation_code is null;

if @status is null throw 50000, 'form instance not found', 1;
if @status <> N'CONCEPT' throw 50000, 'form instance not editable', 1;
if @currentRev <> @expectedDraftRev throw 50000, 'draft_rev conflict', 1;
if isjson(@answersJson) <> 1 throw 50000, 'answers_json is invalid', 1;
if @calculatedJson is not null and isjson(@calculatedJson) <> 1
  throw 50000, 'calculated_json is invalid', 1;

update dbo.FormAnswer
set answers_json = @answersJson,
    calculated_json = @calculatedJson,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
where form_instance_id = @instanceId;

if @@rowcount = 0
  insert into dbo.FormAnswer (
    form_instance_id, answers_json, calculated_json, updated_at, updated_by
  ) values (
    @instanceId, @answersJson, @calculatedJson, sysutcdatetime(), @updatedBy
  );

update dbo.FormInstance
set draft_rev = draft_rev + 1,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
where form_instance_id = @instanceId
  and atrium_installation_code is null;

select @instanceId as form_instance_id, @expectedDraftRev + 1 as draft_rev;
`;

export const submitFormsHubInstanceSql = `
declare @status nvarchar(30);
select @status = status
from dbo.FormInstance
where form_instance_id = @instanceId
  and atrium_installation_code is null;

if @status is null throw 50000, 'form instance not found', 1;
if @status <> N'CONCEPT' throw 50000, 'invalid status transition', 1;

update dbo.FormInstance
set status = N'INGEDIEND', submitted_at = sysutcdatetime(), submitted_by = @actor,
    updated_at = sysutcdatetime(), updated_by = @actor
where form_instance_id = @instanceId
  and atrium_installation_code is null;

select @instanceId as form_instance_id, N'INGEDIEND' as status;
`;

export const withdrawFormsHubInstanceSql = `
declare @status nvarchar(30);
select @status = status
from dbo.FormInstance
where form_instance_id = @instanceId
  and atrium_installation_code is null;

if @status is null throw 50000, 'form instance not found', 1;
if @status not in (N'CONCEPT', N'INGEDIEND') throw 50000, 'invalid status transition', 1;

update dbo.FormInstance
set status = N'INGETROKKEN', updated_at = sysutcdatetime(), updated_by = @actor
where form_instance_id = @instanceId
  and atrium_installation_code is null;

select @instanceId as form_instance_id, N'INGETROKKEN' as status;
`;

export const reopenFormsHubInstanceSql = `
declare @status nvarchar(30);
select @status = status
from dbo.FormInstance
where form_instance_id = @instanceId
  and atrium_installation_code is null;

if @status is null throw 50000, 'form instance not found', 1;
if @status = N'AFGEHANDELD' throw 50000, 'invalid status transition', 1;
if @status not in (N'INGEDIEND', N'IN_BEHANDELING', N'INGETROKKEN')
  throw 50000, 'invalid status transition', 1;

update dbo.FormInstance
set status = N'CONCEPT', updated_at = sysutcdatetime(), updated_by = @actor,
    draft_rev = draft_rev + 1
where form_instance_id = @instanceId
  and atrium_installation_code is null;

select @instanceId as form_instance_id, N'CONCEPT' as status;
`;
