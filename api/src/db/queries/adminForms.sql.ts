// /api/src/db/queries/adminForms.sql.ts

export const getAdminFormsListSql = `
;with version_stats as (
  select
    fv.form_id,
    max(fv.version) as latest_version,
    count(*) as version_count
  from dbo.FormDefinitionVersion fv
  group by fv.form_id
),
latest_version_row as (
  select
    fv.form_id,
    fv.version,
    fv.version_label,
    fv.survey_json,
    row_number() over (
      partition by fv.form_id
      order by fv.version desc, fv.version_label desc
    ) as rn
  from dbo.FormDefinitionVersion fv
)
select
  fd.form_id,
  fd.code,
  fd.name,
  fd.description,
  fd.document_profile_key,
  fd.certification_mark_key,
  fd.workflow_profile_key,
  fd.official_document_number,
  fd.owner_department,
  fd.owner_display_name,
  fd.knowledge_base_reference,
  fd.requires_installation_review,
  fd.status,
  fd.sort_order,
  isnull(vs.latest_version, 0) as latest_version,
  lvr.version_label as latest_version_label,
  isnull(vs.version_count, 0) as version_count
from dbo.FormDefinition fd
left join version_stats vs
  on vs.form_id = fd.form_id
left join latest_version_row lvr
  on lvr.form_id = fd.form_id
 and lvr.rn = 1
order by fd.sort_order asc, fd.name asc;
`;

export const getAdminFormDetailSql = `
select top 1
  fd.form_id,
  fd.code,
  fd.name,
  fd.description,
  fd.document_profile_key,
  fd.certification_mark_key,
  fd.workflow_profile_key,
  fd.official_document_number,
  fd.owner_department,
  fd.owner_display_name,
  fd.knowledge_base_reference,
  fd.requires_installation_review,
  fd.status,
  fd.sort_order,
  lvr.survey_json as active_survey_json
from dbo.FormDefinition fd
outer apply (
  select top 1
    fv.survey_json
  from dbo.FormDefinitionVersion fv
  where fv.form_id = fd.form_id
  order by fv.version desc
) lvr
where fd.form_id = @formId;

select
  fv.form_version_id,
  fv.form_id,
  fv.version,
  fv.version_label,
  fv.certification_mark_key,
  fv.published_at,
  fv.published_by,
  fv.survey_json
from dbo.FormDefinitionVersion fv
where fv.form_id = @formId
order by fv.version desc;

select
  fdt.installation_type_key
from dbo.FormDefinitionType fdt
where fdt.form_id = @formId
order by fdt.installation_type_key asc;

select top 1
  fpr.form_id,
  fpr.requires_type,
  fpr.perf_min_rows,
  fpr.perf_severity,
  fpr.energy_min_rows,
  fpr.energy_severity,
  fpr.custom_min_filled,
  fpr.custom_severity,
  fpr.is_active,
  fpr.created_at,
  fpr.created_by,
  fpr.updated_at,
  fpr.updated_by
from dbo.FormPreflightRule fpr
where fpr.form_id = @formId;

select
  r.context_type,
  r.is_required,
  r.is_primary,
  r.selection_order,
  r.is_active
from dbo.FormDefinitionContextRule r
where r.form_id = @formId
order by r.selection_order, r.context_type;

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
  r.sort_order,
  r.is_active
from dbo.FormDefinitionFollowUpRule r
where r.form_id = @formId
order by r.sort_order, r.form_follow_up_rule_id;

select
  role_code,
  display_name,
  description,
  is_active
from dbo.WorkflowRoleDefinition
where is_active = 1
order by display_name, role_code;

select
  certification_mark_key,
  authority_code,
  scheme_code,
  process_code,
  display_name,
  asset_file_name,
  source_url,
  sort_order,
  is_active
from dbo.CertificationMarkDefinition
where is_active = 1
   or certification_mark_key = (
     select certification_mark_key
     from dbo.FormDefinition
     where form_id = @formId
   )
order by authority_code, scheme_code, sort_order, display_name;
`;

export const createAdminFormSql = `
declare @formId uniqueidentifier = newid();

if exists (
  select 1
  from dbo.FormDefinition
  where code = @code
)
begin
  throw 50000, 'form code already exists', 1;
end;

insert into dbo.FormDefinition (
  form_id,
  code,
  name,
  description,
  status,
  sort_order,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @formId,
  @code,
  @name,
  @description,
  'M',
  @sortOrder,
  sysutcdatetime(),
  @createdBy,
  null,
  null
);

insert into dbo.FormPreflightRule (
  form_id,
  requires_type,
  perf_min_rows,
  perf_severity,
  energy_min_rows,
  energy_severity,
  custom_min_filled,
  custom_severity,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @formId,
  1,
  null,
  N'warning',
  null,
  N'warning',
  null,
  N'warning',
  1,
  sysutcdatetime(),
  @createdBy,
  null,
  null
);

select
  @formId as form_id;
`;

export const saveAdminFormsOrderSql = `
if isjson(@itemsJson) <> 1
begin
  throw 50000, 'itemsJson must be valid json', 1;
end;

begin tran;

;with src as (
  select
    try_convert(uniqueidentifier, json_value(j.value, '$.form_id')) as form_id,
    try_convert(int, json_value(j.value, '$.sort_order')) as sort_order
  from openjson(@itemsJson) j
)
update fd
set
  fd.sort_order = src.sort_order,
  fd.updated_at = sysutcdatetime(),
  fd.updated_by = @updatedBy
from dbo.FormDefinition fd
join src
  on src.form_id = fd.form_id
where src.form_id is not null
  and src.sort_order is not null;

commit tran;

select cast(1 as bit) as ok;
`;

export const saveAdminFormConfigSql = `
set xact_abort on;

if not exists (
  select 1
  from dbo.FormDefinition
  where form_id = @formId
)
begin
  throw 50000, 'form not found', 1;
end;

if @status not in ('A', 'M', 'I')
begin
  throw 50000, 'invalid form status', 1;
end;

if @certificationMarkKey is not null and not exists (
  select 1
  from dbo.CertificationMarkDefinition cmd
  where cmd.certification_mark_key = @certificationMarkKey
    and (
      cmd.is_active = 1
      or exists (
        select 1
        from dbo.FormDefinition fd
        where fd.form_id = @formId
          and fd.certification_mark_key = cmd.certification_mark_key
      )
    )
)
begin
  throw 50000, 'unknown or inactive certification mark', 1;
end;

if @perfSeverity not in (N'blocking', N'warning')
begin
  throw 50000, 'invalid perf severity', 1;
end;

if @energySeverity not in (N'blocking', N'warning')
begin
  throw 50000, 'invalid energy severity', 1;
end;

if @customSeverity not in (N'blocking', N'warning')
begin
  throw 50000, 'invalid custom severity', 1;
end;

if @applicabilityJson is not null and isjson(@applicabilityJson) <> 1
begin
  throw 50000, 'applicabilityJson must be valid json', 1;
end;

if isjson(@contextRulesJson) <> 1
begin
  throw 50000, 'contextRulesJson must be valid json', 1;
end;

if isjson(@followUpRulesJson) <> 1
begin
  throw 50000, 'followUpRulesJson must be valid json', 1;
end;

declare @contextRules table (
  context_type nvarchar(30) not null,
  is_required bit not null,
  is_primary bit not null,
  selection_order int not null,
  is_active bit not null
);

insert into @contextRules
select
  upper(ltrim(rtrim(convert(nvarchar(30), json_value(j.value, '$.context_type'))))),
  isnull(try_convert(bit, json_value(j.value, '$.is_required')), 0),
  isnull(try_convert(bit, json_value(j.value, '$.is_primary')), 0),
  isnull(try_convert(int, json_value(j.value, '$.selection_order')), 0),
  isnull(try_convert(bit, json_value(j.value, '$.is_active')), 1)
from openjson(@contextRulesJson) j;

if exists (
  select 1 from @contextRules
  where context_type not in (N'RELATION', N'PROJECT', N'WORK_ORDER', N'INSTALLATION', N'EMPLOYEE')
     or selection_order < 0
     or (is_primary = 1 and is_active = 0)
     or (is_required = 1 and is_active = 0)
)
begin
  throw 50000, 'invalid context rule', 1;
end;

if exists (select context_type from @contextRules group by context_type having count(*) > 1)
begin
  throw 50000, 'duplicate context type', 1;
end;

if (select count(*) from @contextRules where is_primary = 1 and is_active = 1) > 1
begin
  throw 50000, 'only one active primary context is allowed', 1;
end;

if exists (select 1 from @contextRules where is_active = 1)
   and not exists (select 1 from @contextRules where is_primary = 1 and is_active = 1)
begin
  throw 50000, 'an active context configuration requires one primary context', 1;
end;

declare @followUpRules table (
  form_follow_up_rule_id uniqueidentifier not null,
  trigger_type nvarchar(20) not null,
  condition_json nvarchar(max) null,
  action_title_template nvarchar(300) not null,
  action_description_template nvarchar(2000) null,
  category nvarchar(100) null,
  priority nvarchar(20) not null,
  responsibility_type nvarchar(30) not null,
  assigned_role_code nvarchar(100) null,
  due_after_days int null,
  certificate_impact nvarchar(20) null,
  visibility nvarchar(30) not null,
  sort_order int not null,
  is_active bit not null
);

insert into @followUpRules
select
  coalesce(try_convert(uniqueidentifier, json_value(j.value, '$.form_follow_up_rule_id')), newid()),
  upper(ltrim(rtrim(convert(nvarchar(20), json_value(j.value, '$.trigger_type'))))),
  nullif(ltrim(rtrim(convert(nvarchar(max), json_query(j.value, '$.condition')))), N''),
  ltrim(rtrim(convert(nvarchar(300), json_value(j.value, '$.action_title_template')))),
  nullif(ltrim(rtrim(convert(nvarchar(2000), json_value(j.value, '$.action_description_template')))), N''),
  nullif(ltrim(rtrim(convert(nvarchar(100), json_value(j.value, '$.category')))), N''),
  upper(isnull(nullif(ltrim(rtrim(convert(nvarchar(20), json_value(j.value, '$.priority')))), N''), N'NORMAL')),
  upper(isnull(nullif(ltrim(rtrim(convert(nvarchar(30), json_value(j.value, '$.responsibility_type')))), N''), N'WARDENBURG')),
  nullif(ltrim(rtrim(convert(nvarchar(100), json_value(j.value, '$.assigned_role_code')))), N''),
  try_convert(int, json_value(j.value, '$.due_after_days')),
  lower(nullif(ltrim(rtrim(convert(nvarchar(20), json_value(j.value, '$.certificate_impact')))), N'')),
  upper(isnull(nullif(ltrim(rtrim(convert(nvarchar(30), json_value(j.value, '$.visibility')))), N''), N'INTERNAL_ONLY')),
  isnull(try_convert(int, json_value(j.value, '$.sort_order')), 0),
  isnull(try_convert(bit, json_value(j.value, '$.is_active')), 1)
from openjson(@followUpRulesJson) j;

if exists (
  select 1 from @followUpRules
  where trigger_type not in (N'ON_SUBMIT', N'ON_FINALIZE', N'CONDITIONAL')
     or nullif(action_title_template, N'') is null
     or priority not in (N'LOW', N'NORMAL', N'HIGH', N'CRITICAL')
     or responsibility_type not in (N'WARDENBURG', N'CUSTOMER', N'THIRD_PARTY', N'UNSPECIFIED')
     or due_after_days < 0
     or (certificate_impact is not null and certificate_impact not in (N'yes', N'no'))
     or visibility not in (N'INTERNAL_ONLY', N'CUSTOMER_VISIBLE')
     or sort_order < 0
     or (condition_json is not null and isjson(condition_json) <> 1)
     or (trigger_type = N'CONDITIONAL' and condition_json is null)
)
begin
  throw 50000, 'invalid follow-up rule', 1;
end;

if exists (
  select 1
  from @followUpRules r
  where r.assigned_role_code is not null
    and not exists (
      select 1 from dbo.WorkflowRoleDefinition wr
      where wr.role_code = r.assigned_role_code and wr.is_active = 1
    )
)
begin
  throw 50000, 'follow-up rule refers to an unknown active workflow role', 1;
end;

if exists (select form_follow_up_rule_id from @followUpRules group by form_follow_up_rule_id having count(*) > 1)
begin
  throw 50000, 'duplicate follow-up rule id', 1;
end;

begin tran;

update dbo.FormDefinition
set
  name = @name,
  description = @description,
  document_profile_key = @documentProfileKey,
  certification_mark_key = @certificationMarkKey,
  workflow_profile_key = @workflowProfileKey,
  official_document_number = @officialDocumentNumber,
  owner_department = @ownerDepartment,
  owner_display_name = @ownerDisplayName,
  knowledge_base_reference = @knowledgeBaseReference,
  requires_installation_review = @requiresInstallationReview,
  status = @status,
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
where form_id = @formId;

delete from dbo.FormDefinitionType
where form_id = @formId;

if @applicabilityJson is not null
begin
  insert into dbo.FormDefinitionType (
    form_id,
    installation_type_key
  )
  select
    @formId,
    src.installation_type_key
  from (
    select distinct
      convert(nvarchar(50), j.value) as installation_type_key
    from openjson(@applicabilityJson) j
  ) src
  where exists (
    select 1
    from dbo.InstallationType it
    where it.installation_type_key = src.installation_type_key
  );
end;

if exists (
  select 1
  from dbo.FormPreflightRule
  where form_id = @formId
)
begin
  update dbo.FormPreflightRule
  set
    requires_type = @requiresType,
    perf_min_rows = @perfMinRows,
    perf_severity = @perfSeverity,
    energy_min_rows = @energyMinRows,
    energy_severity = @energySeverity,
    custom_min_filled = @customMinFilled,
    custom_severity = @customSeverity,
    is_active = @preflightIsActive,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  where form_id = @formId;
end
else
begin
  insert into dbo.FormPreflightRule (
    form_id,
    requires_type,
    perf_min_rows,
    perf_severity,
    energy_min_rows,
    energy_severity,
    custom_min_filled,
    custom_severity,
    is_active,
    created_at,
    created_by,
    updated_at,
    updated_by
  )
  values (
    @formId,
    @requiresType,
    @perfMinRows,
    @perfSeverity,
    @energyMinRows,
    @energySeverity,
    @customMinFilled,
    @customSeverity,
    @preflightIsActive,
    sysutcdatetime(),
    @updatedBy,
    null,
    null
  );
end;

delete from dbo.FormDefinitionContextRule
where form_id = @formId;

insert into dbo.FormDefinitionContextRule (
  form_id, context_type, is_required, is_primary, selection_order,
  is_active, created_at, created_by
)
select
  @formId, context_type, is_required, is_primary, selection_order,
  is_active, sysutcdatetime(), @updatedBy
from @contextRules;

delete from dbo.FormDefinitionFollowUpRule
where form_id = @formId;

insert into dbo.FormDefinitionFollowUpRule (
  form_follow_up_rule_id, form_id, trigger_type, condition_json,
  action_title_template, action_description_template, category, priority,
  responsibility_type, assigned_role_code, due_after_days, certificate_impact,
  visibility, sort_order, is_active, created_at, created_by
)
select
  form_follow_up_rule_id, @formId, trigger_type, condition_json,
  action_title_template, action_description_template, category, priority,
  responsibility_type, assigned_role_code, due_after_days, certificate_impact,
  visibility, sort_order, is_active, sysutcdatetime(), @updatedBy
from @followUpRules;

commit tran;

select cast(1 as bit) as ok;
`;

export const createAdminFormVersionSql = `
set xact_abort on;
begin transaction;

if not exists (
  select 1
  from dbo.FormDefinition
  where form_id = @formId
)
begin
  throw 50000, 'form not found', 1;
end;

if isjson(@surveyJson) <> 1
begin
  throw 50000, 'survey_json is not valid json', 1;
end;

declare @nextVersion int;
select @nextVersion = isnull(max(version), 0) + 1
from dbo.FormDefinitionVersion
where form_id = @formId;

declare @versionLabel nvarchar(20) = concat(convert(nvarchar(10), @nextVersion), N'.0');
declare @formVersionId uniqueidentifier = newid();
declare @replacesFormVersionId uniqueidentifier = null;

select top 1 @replacesFormVersionId = form_version_id
from dbo.FormDefinitionVersion
where form_id = @formId
  and is_active = 1
order by version desc;

update dbo.FormDefinitionVersion
set is_active = 0
where form_id = @formId
  and is_active = 1;

insert into dbo.FormDefinitionVersion (
  form_version_id,
  form_id,
  version,
  version_label,
  survey_json,
  certification_mark_key,
  published_at,
  published_by,
  effective_from,
  issued_by,
  replaces_form_version_id,
  is_active
)
values (
  @formVersionId,
  @formId,
  @nextVersion,
  @versionLabel,
  @surveyJson,
  (select certification_mark_key from dbo.FormDefinition where form_id = @formId),
  sysutcdatetime(),
  @publishedBy,
  sysutcdatetime(),
  @publishedBy,
  @replacesFormVersionId,
  1
);

commit transaction;

select
  @formVersionId as form_version_id,
  @nextVersion as version,
  @versionLabel as version_label;
`;
