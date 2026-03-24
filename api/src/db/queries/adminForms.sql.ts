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

begin tran;

update dbo.FormDefinition
set
  name = @name,
  description = @description,
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

commit tran;

select cast(1 as bit) as ok;
`;

export const createAdminFormVersionSql = `
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

insert into dbo.FormDefinitionVersion (
  form_version_id,
  form_id,
  version,
  version_label,
  survey_json,
  published_at,
  published_by
)
values (
  @formVersionId,
  @formId,
  @nextVersion,
  @versionLabel,
  @surveyJson,
  sysutcdatetime(),
  @publishedBy
);

select
  @formVersionId as form_version_id,
  @nextVersion as version,
  @versionLabel as version_label;
`;