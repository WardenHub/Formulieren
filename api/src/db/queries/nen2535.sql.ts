// /api/src/db/queries/nen2535.sql.ts
// =========================================================
// NEN2535 prestatie-eisen queries; aligned to tabel-definities.sql
// =========================================================

export const getNen2535CatalogSql = `
select
  n.normering_key,
  n.display_name as normering_name,
  n.sort_order,
  n.is_active,
  n.created_at
from dbo.Nen2535Normering n
where n.is_active = 1
order by n.sort_order, n.normering_key;

select
  g.gebruikersfunctie_key,
  g.display_name as default_name,
  g.sort_order,
  g.is_active,
  g.created_at
from dbo.Nen2535Gebruikersfunctie g
where g.is_active = 1
order by g.sort_order, g.gebruikersfunctie_key;

select
  m.normering_key,
  m.gebruikersfunctie_key,
  m.display_name as matrix_name,
  m.risk_internal,
  m.risk_external,
  m.sort_order,
  m.is_active
from dbo.Nen2535RiskClassMatrix m
where m.is_active = 1
order by m.normering_key, m.sort_order, m.gebruikersfunctie_key;
`;

export const getInstallationPerformanceRequirementSql = `
-- params: @code

select top 1
  pr.performance_requirement_id,
  pr.atrium_installation_code,
  pr.installation_id,
  pr.normering_key,
  pr.doormelding_mode,
  pr.remarks,
  pr.is_active,
  pr.created_at,
  pr.created_by,
  pr.updated_at,
  pr.updated_by
from dbo.InstallationPerformanceRequirement pr
where pr.atrium_installation_code = @code
  and pr.is_active = 1
order by pr.created_at desc;

select
  r.performance_requirement_row_id,
  r.performance_requirement_id,
  r.gebruikersfunctie_key,
  r.row_label,
  r.doormelding_mode,
  r.automatic_detectors,
  r.manual_call_points,
  r.flame_detectors,
  r.linear_smoke_detectors,
  r.aspirating_openings,
  r.sort_order,
  r.created_at,
  r.created_by,
  r.updated_at,
  r.updated_by
from dbo.InstallationPerformanceRequirementRow r
join dbo.InstallationPerformanceRequirement pr
  on pr.performance_requirement_id = r.performance_requirement_id
where pr.atrium_installation_code = @code
  and pr.is_active = 1
order by r.sort_order, r.created_at;
`;

export const upsertInstallationPerformanceRequirementSql = `
-- params:
-- @code, @normering_key, @doormelding_mode, @remarks, @updatedBy, @rowsJson
-- rowsJson schema:
-- [{
--   gebruikersfunctie_key,
--   row_label?,
--   doormelding_mode?,               -- GEEN|ZONDER_VERTRAGING|MET_VERTRAGING (per row)
--   automatic_detectors,
--   manual_call_points,
--   flame_detectors,
--   linear_smoke_detectors,
--   aspirating_openings,
--   sort_order
-- }]

set nocount on;

-- ensure installation exists (throws if not in Atrium)
if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

-- ensure Installation overlay exists
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

declare @installation_id uniqueidentifier;

select top 1 @installation_id = i.installation_id
from dbo.Installation i
where i.atrium_installation_code = @code;

if (@installation_id is null)
begin
  throw 51000, 'installation not found', 1;
end;

-- get active header; if none create
declare @pr_id uniqueidentifier;

select top 1 @pr_id = pr.performance_requirement_id
from dbo.InstallationPerformanceRequirement pr
where pr.atrium_installation_code = @code
  and pr.is_active = 1
order by pr.created_at desc;

if (@pr_id is null)
begin
  declare @newHeader table (performance_requirement_id uniqueidentifier);

  insert into dbo.InstallationPerformanceRequirement (
    installation_id,
    atrium_installation_code,
    normering_key,
    doormelding_mode,
    remarks,
    is_active,
    created_at,
    created_by
  )
  output inserted.performance_requirement_id into @newHeader(performance_requirement_id)
  values (
    @installation_id,
    @code,
    @normering_key,
    @doormelding_mode,
    @remarks,
    1,
    sysutcdatetime(),
    @updatedBy
  );

  select top 1 @pr_id = performance_requirement_id from @newHeader;
end
else
begin
  update dbo.InstallationPerformanceRequirement
  set
    normering_key = @normering_key,
    doormelding_mode = @doormelding_mode,
    remarks = @remarks,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  where performance_requirement_id = @pr_id;
end;

-- parse rows (matchen op functie+label+mode)
declare @rows table (
  gebruikersfunctie_key nvarchar(60) not null,
  row_label nvarchar(100) null,
  row_label_key nvarchar(100) not null,          -- null -> '' voor matching
  doormelding_mode nvarchar(30) not null,
  automatic_detectors int not null,
  manual_call_points int not null,
  flame_detectors int not null,
  linear_smoke_detectors int not null,
  aspirating_openings int not null,
  sort_order int not null
);

insert into @rows (
  gebruikersfunctie_key,
  row_label,
  row_label_key,
  doormelding_mode,
  automatic_detectors,
  manual_call_points,
  flame_detectors,
  linear_smoke_detectors,
  aspirating_openings,
  sort_order
)
select
  src.gebruikersfunctie_key,
  nullif(ltrim(rtrim(src.row_label)), N'') as row_label,
  isnull(nullif(ltrim(rtrim(src.row_label)), N''), N'') as row_label_key,

  -- per-row mode; fallback op header-param; final fallback = GEEN
  coalesce(
    nullif(ltrim(rtrim(src.doormelding_mode)), N''),
    nullif(ltrim(rtrim(@doormelding_mode)), N''),
    N'GEEN'
  ) as doormelding_mode,

  isnull(src.automatic_detectors, 0),
  isnull(src.manual_call_points, 0),
  isnull(src.flame_detectors, 0),
  isnull(src.linear_smoke_detectors, 0),
  isnull(src.aspirating_openings, 0),
  isnull(src.sort_order, 9999)
from openjson(@rowsJson)
with (
  gebruikersfunctie_key nvarchar(60) '$.gebruikersfunctie_key',
  row_label nvarchar(100) '$.row_label',
  doormelding_mode nvarchar(30) '$.doormelding_mode',
  automatic_detectors int '$.automatic_detectors',
  manual_call_points int '$.manual_call_points',
  flame_detectors int '$.flame_detectors',
  linear_smoke_detectors int '$.linear_smoke_detectors',
  aspirating_openings int '$.aspirating_openings',
  sort_order int '$.sort_order'
) src
where nullif(ltrim(rtrim(src.gebruikersfunctie_key)), N'') is not null;

-- upsert rows on (header + functie + label + mode)
merge dbo.InstallationPerformanceRequirementRow as tgt
using (
  select
    @pr_id as performance_requirement_id,
    r.gebruikersfunctie_key,
    r.row_label,
    r.row_label_key,
    r.doormelding_mode,
    r.automatic_detectors,
    r.manual_call_points,
    r.flame_detectors,
    r.linear_smoke_detectors,
    r.aspirating_openings,
    r.sort_order
  from @rows r
) as s
on  tgt.performance_requirement_id = s.performance_requirement_id
and tgt.gebruikersfunctie_key = s.gebruikersfunctie_key
and isnull(tgt.row_label, N'') = s.row_label_key
and tgt.doormelding_mode = s.doormelding_mode
when matched then update set
  tgt.row_label = s.row_label,
  tgt.doormelding_mode = s.doormelding_mode,
  tgt.automatic_detectors = s.automatic_detectors,
  tgt.manual_call_points = s.manual_call_points,
  tgt.flame_detectors = s.flame_detectors,
  tgt.linear_smoke_detectors = s.linear_smoke_detectors,
  tgt.aspirating_openings = s.aspirating_openings,
  tgt.sort_order = s.sort_order,
  tgt.updated_at = sysutcdatetime(),
  tgt.updated_by = @updatedBy
when not matched then insert (
  performance_requirement_id,
  gebruikersfunctie_key,
  row_label,
  doormelding_mode,
  automatic_detectors,
  manual_call_points,
  flame_detectors,
  linear_smoke_detectors,
  aspirating_openings,
  sort_order,
  created_at,
  created_by
) values (
  s.performance_requirement_id,
  s.gebruikersfunctie_key,
  s.row_label,
  s.doormelding_mode,
  s.automatic_detectors,
  s.manual_call_points,
  s.flame_detectors,
  s.linear_smoke_detectors,
  s.aspirating_openings,
  s.sort_order,
  sysutcdatetime(),
  @updatedBy
);

-- delete rows not in payload (zelfde natuurlijke sleutel: functie+label+mode)
delete tgt
from dbo.InstallationPerformanceRequirementRow tgt
where tgt.performance_requirement_id = @pr_id
  and not exists (
    select 1
    from @rows r
    where r.gebruikersfunctie_key = tgt.gebruikersfunctie_key
      and r.row_label_key = isnull(tgt.row_label, N'')
      and r.doormelding_mode = tgt.doormelding_mode
  );

select
  @pr_id as performance_requirement_id,
  @code as atrium_installation_code,
  @normering_key as normering_key,
  @doormelding_mode as doormelding_mode;
`;

export const getNen2535MatrixForNormSql = `
-- params: @normering_key
select
  m.normering_key,
  m.gebruikersfunctie_key,
  m.display_name as matrix_name,
  m.risk_internal,
  m.risk_external,
  m.sort_order,
  m.is_active
from dbo.Nen2535RiskClassMatrix m
where m.normering_key = @normering_key
  and m.is_active = 1
order by m.sort_order, m.gebruikersfunctie_key;
`;
