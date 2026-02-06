// /api/src/db/queries/forms.sql.ts
// =========================================================
// forms runtime - import answerfile v1
// =========================================================

export const importAnswerFileSql = `
-- expects:
--   @code nvarchar(...)
--   @formCode nvarchar(...)
--   @versionLabel nvarchar(...)
--   @formInstanceId uniqueidentifier (nullable)
--   @draftRev int (nullable)
--   @answersJson nvarchar(max)
--   @calculatedJson nvarchar(max) (nullable)
--   @updatedBy nvarchar(...)

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

-- ensure installation exists
if not exists (select 1 from dbo.Installation where atrium_installation_code = @code)
begin
  insert into dbo.Installation (
    installation_id,
    atrium_installation_code,
    installation_type_key,
    created_at,
    created_by,
    is_active
  )
  values (
    newid(),
    @code,
    null,
    sysutcdatetime(),
    @updatedBy,
    1
  );
end;

declare @installationId uniqueidentifier;
select top 1 @installationId = installation_id
from dbo.Installation
where atrium_installation_code = @code;

declare @formId uniqueidentifier;
select top 1 @formId = form_id
from dbo.FormDefinition
where code = @formCode
  and is_active = 1;

if @formId is null throw 50000, 'form not found', 1;

declare @formVersionId uniqueidentifier;
select top 1 @formVersionId = form_version_id
from dbo.FormDefinitionVersion
where form_id = @formId
  and version_label = @versionLabel;

if @formVersionId is null throw 50000, 'form version not found', 1;

declare @instanceId uniqueidentifier = @formInstanceId;

if @instanceId is null
begin
  -- create new instance
  set @instanceId = newid();

  insert into dbo.FormInstance (
    form_instance_id,
    form_version_id,
    installation_id,
    atrium_installation_code,
    status,
    draft_rev,
    created_at,
    created_by,
    updated_at,
    updated_by
  )
  values (
    @instanceId,
    @formVersionId,
    @installationId,
    @code,
    N'CONCEPT',
    0,
    sysutcdatetime(),
    @updatedBy,
    sysutcdatetime(),
    @updatedBy
  );
end
else
begin
  -- validate ownership
  if not exists (
    select 1
    from dbo.FormInstance
    where form_instance_id = @instanceId
      and atrium_installation_code = @code
  )
  begin
    throw 50000, 'form instance not found', 1;
  end;

  -- only editable when CONCEPT
  if exists (
    select 1
    from dbo.FormInstance
    where form_instance_id = @instanceId
      and atrium_installation_code = @code
      and status <> N'CONCEPT'
  )
  begin
    throw 50000, 'form instance not editable', 1;
  end;

  -- optional conflict check when draftRev provided
  if @draftRev is not null
  begin
    declare @currentRev int;
    select top 1 @currentRev = draft_rev
    from dbo.FormInstance
    where form_instance_id = @instanceId
      and atrium_installation_code = @code;

    if @currentRev > @draftRev
    begin
      throw 50000, 'draft_rev conflict', 1;
    end;
  end;
end;

-- upsert answers
if exists (select 1 from dbo.FormAnswer where form_instance_id = @instanceId)
begin
  update dbo.FormAnswer
  set
    answers_json = @answersJson,
    calculated_json = @calculatedJson,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  where form_instance_id = @instanceId;
end
else
begin
  insert into dbo.FormAnswer (
    form_instance_id,
    answers_json,
    calculated_json,
    updated_at,
    updated_by
  )
  values (
    @instanceId,
    @answersJson,
    @calculatedJson,
    sysutcdatetime(),
    @updatedBy
  );
end;

update dbo.FormInstance
set
  form_version_id = @formVersionId,
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy,
  draft_rev = draft_rev + 1
where form_instance_id = @instanceId
  and atrium_installation_code = @code;

select
  @instanceId as form_instance_id;
`;


// =========================================================
// forms catalog for an installation (data-driven)
// - returns forms + whether applicable for current installation_type_key
// - if a form has NO mappings in FormDefinitionType => always applicable
// =========================================================

export const getFormsCatalogForInstallationSql = `
-- expects: @code

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

;with inst as (
  select top 1
    i.installation_id,
    i.atrium_installation_code,
    i.installation_type_key
  from dbo.Installation i
  where i.atrium_installation_code = @code
),
forms as (
  select
    fd.form_id,
    fd.code,
    fd.name,
    fd.is_active
  from dbo.FormDefinition fd
  where fd.is_active = 1
),
form_map_counts as (
  select
    f.form_id,
    count(fdt.installation_type_key) as mapping_count
  from forms f
  left join dbo.FormDefinitionType fdt
    on fdt.form_id = f.form_id
  group by f.form_id
),
app as (
  select
    f.form_id,
    case
      when f.is_active = 0 then 0
      when isnull(mc.mapping_count, 0) = 0 then 1
      when exists (
        select 1
        from dbo.FormDefinitionType fdt
        cross join inst i
        where fdt.form_id = f.form_id
          and fdt.installation_type_key = i.installation_type_key
      ) then 1
      else 0
    end as is_applicable,
    isnull(mc.mapping_count, 0) as mapping_count
  from forms f
  left join form_map_counts mc on mc.form_id = f.form_id
)
select
  f.form_id,
  f.code,
  f.name,
  a.is_applicable,
  a.mapping_count
from forms f
left join app a on a.form_id = f.form_id
order by f.name asc;
`;

// =========================================================
// forms runtime - read instance (survey + answers)
// =========================================================

export const getFormInstanceSql = `
-- expects:
--   @code nvarchar(...)
--   @instanceId uniqueidentifier

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

select top 1
  fi.form_instance_id,
  fi.atrium_installation_code,
  fi.installation_id,
  fi.form_version_id,
  fi.status,
  fi.draft_rev,
  fi.locked_by,
  fi.lock_expires_at,
  fi.created_at,
  fi.created_by,
  fi.updated_at,
  fi.updated_by,
  fi.submitted_at,
  fi.submitted_by,

  fd.code as form_code,
  fd.name as form_name,

  fv.version,
  fv.version_label,
  fv.published_at,
  fv.published_by,
  fv.survey_json,

  fa.answers_json,
  fa.calculated_json,
  fa.updated_at as answers_updated_at,
  fa.updated_by as answers_updated_by

from dbo.FormInstance fi
join dbo.FormDefinitionVersion fv
  on fv.form_version_id = fi.form_version_id
join dbo.FormDefinition fd
  on fd.form_id = fv.form_id
left join dbo.FormAnswer fa
  on fa.form_instance_id = fi.form_instance_id
where fi.form_instance_id = @instanceId
  and fi.atrium_installation_code = @code;
`;


// =========================================================
// forms runtime - start (create or resume concept instance)
// =========================================================

export const startFormInstanceSql = `
-- expects:
--   @code nvarchar(...)
--   @formCode nvarchar(...)
--   @createdBy nvarchar(...)

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

-- ensure ember installation overlay exists
if not exists (select 1 from dbo.Installation where atrium_installation_code = @code)
begin
  insert into dbo.Installation (
    installation_id,
    atrium_installation_code,
    installation_type_key,
    created_at,
    created_by,
    is_active
  )
  values (
    newid(),
    @code,
    null,
    sysutcdatetime(),
    @createdBy,
    1
  );
end;

declare @installationId uniqueidentifier;
select top 1 @installationId = i.installation_id
from dbo.Installation i
where i.atrium_installation_code = @code;

declare @formId uniqueidentifier;
select top 1 @formId = fd.form_id
from dbo.FormDefinition fd
where fd.code = @formCode
  and fd.is_active = 1;

if @formId is null
begin
  throw 50000, 'form not found', 1;
end;

-- pick latest version (highest version)
declare @formVersionId uniqueidentifier;
select top 1 @formVersionId = fv.form_version_id
from dbo.FormDefinitionVersion fv
where fv.form_id = @formId
order by fv.version desc;

if @formVersionId is null
begin
  throw 50000, 'form has no versions', 1;
end;

-- resume: if an existing CONCEPT instance exists for this installation + form_version -> return it
declare @existingInstanceId uniqueidentifier;
select top 1 @existingInstanceId = fi.form_instance_id
from dbo.FormInstance fi
where fi.installation_id = @installationId
  and fi.form_version_id = @formVersionId
  and fi.status = N'CONCEPT'
order by fi.created_at desc;

if @existingInstanceId is not null
begin
  select
    @existingInstanceId as form_instance_id,
    @formVersionId as form_version_id,
    @formId as form_id;
  return;
end;

declare @instanceId uniqueidentifier = newid();

insert into dbo.FormInstance (
  form_instance_id,
  form_version_id,
  installation_id,
  atrium_installation_code,
  status,
  locked_by,
  lock_expires_at,
  draft_rev,
  created_at,
  created_by,
  updated_at,
  updated_by,
  submitted_at,
  submitted_by
)
values (
  @instanceId,
  @formVersionId,
  @installationId,
  @code,
  N'CONCEPT',
  null,
  null,
  0,
  sysutcdatetime(),
  @createdBy,
  null,
  null,
  null,
  null
);

insert into dbo.FormAnswer (
  form_instance_id,
  answers_json,
  calculated_json,
  updated_at,
  updated_by
)
values (
  @instanceId,
  N'{}',
  null,
  sysutcdatetime(),
  @createdBy
);

select
  @instanceId as form_instance_id,
  @formVersionId as form_version_id,
  @formId as form_id;
`;


// =========================================================
// form start preflight (data-driven; 1 rule row per form_id)
// =========================================================

export const getFormStartPreflightSql = `
-- expects:
--   @code nvarchar(...)
--   @formCode nvarchar(...)
--   @createdBy nvarchar(...)

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

;with inst as (
  select top 1
    i.installation_id,
    i.atrium_installation_code,
    i.installation_type_key
  from dbo.Installation i
  where i.atrium_installation_code = @code
),
form_def as (
  select top 1
    fd.form_id,
    fd.code,
    fd.name,
    fd.is_active
  from dbo.FormDefinition fd
  where fd.code = @formCode
),
form_map_counts as (
  select
    fd.form_id,
    count(fdt.installation_type_key) as mapping_count
  from form_def fd
  left join dbo.FormDefinitionType fdt
    on fdt.form_id = fd.form_id
  group by fd.form_id
),
form_app as (
  select
    fd.form_id,
    case
      when fd.form_id is null then 0
      when fd.is_active = 0 then 0
      when isnull(mc.mapping_count, 0) = 0 then 1
      when exists (
        select 1
        from dbo.FormDefinitionType fdt
        cross join inst i
        where fdt.form_id = fd.form_id
          and fdt.installation_type_key = i.installation_type_key
      ) then 1
      else 0
    end as form_is_applicable
  from form_def fd
  left join form_map_counts mc on mc.form_id = fd.form_id
),
rules as (
  -- 1 row per form_id; optional (kan ontbreken -> defaults)
  select top 1
    r.form_id,
    r.requires_type,

    r.perf_min_rows,
    lower(nullif(r.perf_severity, N'')) as perf_severity,

    r.energy_min_rows,
    lower(nullif(r.energy_severity, N'')) as energy_severity,

    r.custom_min_filled,
    lower(nullif(r.custom_severity, N'')) as custom_severity
  from dbo.FormPreflightRule r
  cross join form_def fd
  where r.form_id = fd.form_id
    and r.is_active = 1
),
perf_counts as (
  -- 0 als er geen installation record is
  select
    count(*) as perf_row_count
  from dbo.InstallationPerformanceRequirementRow prr
  join dbo.InstallationPerformanceRequirement pr
    on pr.performance_requirement_id = prr.performance_requirement_id
   and pr.is_active = 1
  join inst i
    on i.installation_id = pr.installation_id
),
energy_counts as (
  select
    count(*) as energy_row_count
  from dbo.InstallationEnergySupply es
  join inst i
    on i.installation_id = es.installation_id
  where es.is_active = 1
),
custom_counts as (
  -- aantal toepasselijke custom fields (op basis van type) + hoeveel gevuld
  select
    count(*) as custom_applicable_count,
    sum(case
      when
        nullif(ltrim(rtrim(isnull(v.value_string, N''))), N'') is not null
        or v.value_number is not null
        or v.value_bool is not null
        or v.value_date is not null
        or nullif(ltrim(rtrim(isnull(v.value_json, N''))), N'') is not null
      then 1 else 0 end
    ) as custom_filled_count
  from dbo.InstallationCustomFieldDefinition d
  cross join inst i
  left join dbo.InstallationCustomFieldDefinitionType dt
    on dt.field_key = d.field_key
   and dt.installation_type_key = i.installation_type_key
  left join dbo.InstallationCustomFieldValue v
    on v.installation_id = i.installation_id
   and v.field_key = d.field_key
  where d.is_active = 1
    and (
      -- als er geen mappings bestaan voor dit field -> altijd applicable
      not exists (
        select 1
        from dbo.InstallationCustomFieldDefinitionType dt2
        where dt2.field_key = d.field_key
      )
      -- of mapping bestaat en matcht huidig type
      or dt.field_key is not null
    )
)
select
  -- installation
  @code as atrium_installation_code,
  i.installation_id,
  i.installation_type_key,

  -- form
  case when fd.form_id is null then 0 else 1 end as form_exists,
  fa.form_is_applicable,

  -- rule defaults (als rule ontbreekt)
  cast(isnull(r.requires_type, 1) as bit) as requires_type,

  r.perf_min_rows,
  isnull(r.perf_severity, N'warning') as perf_severity,

  r.energy_min_rows,
  isnull(r.energy_severity, N'warning') as energy_severity,

  r.custom_min_filled,
  isnull(r.custom_severity, N'warning') as custom_severity,

  -- counts
  isnull(p.perf_row_count, 0) as perf_row_count,
  isnull(e.energy_row_count, 0) as energy_row_count,
  isnull(c.custom_applicable_count, 0) as custom_applicable_count,
  isnull(c.custom_filled_count, 0) as custom_filled_count

from (select 1 as one) x
left join inst i on 1=1
left join form_def fd on 1=1
left join form_app fa on fa.form_id = fd.form_id
left join rules r on r.form_id = fd.form_id
left join perf_counts p on 1=1
left join energy_counts e on 1=1
left join custom_counts c on 1=1;
`;

// =========================================================
// forms runtime - reopen (set status back to CONCEPT)
// =========================================================

export const reopenFormInstanceSql = `
-- expects: @code, @instanceId, @updatedBy

declare @status nvarchar(30);
select top 1 @status = status
from dbo.FormInstance
where form_instance_id = @instanceId
  and atrium_installation_code = @code;

if @status is null throw 50000, 'form instance not found', 1;

-- disallow reopen when AFGEHANDELD
if @status = N'AFGEHANDELD' throw 50000, 'invalid status transition', 1;

-- only show button for statuses != CONCEPT and != AFGEHANDELD (frontend rule),
-- but backend stays safe:
-- allow from INGEDIEND / IN_BEHANDELING / INGETROKKEN back to CONCEPT
if @status not in (N'INGEDIEND', N'IN_BEHANDELING', N'INGETROKKEN')
begin
  throw 50000, 'invalid status transition', 1;
end;

update dbo.FormInstance
set
  status = N'CONCEPT',
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy,
  draft_rev = draft_rev + 1
where form_instance_id = @instanceId
  and atrium_installation_code = @code;

select
  @instanceId as form_instance_id,
  N'CONCEPT' as status;
`;
