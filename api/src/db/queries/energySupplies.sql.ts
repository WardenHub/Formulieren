// /api/src/db/queries/energySupplies.sql.ts
// =========================================================
// installation energy supplies queries; aligned to tabel-definities.sql
// =========================================================

export const getInstallationEnergySuppliesSql = `
select
  es.energy_supply_id,
  es.atrium_installation_code,
  es.installation_id,

  es.sort_order,
  es.kind,

  es.location_label,

  es.brand_type_key,
  es.brand_type_manual,

  es.quantity,
  es.configuration,

  es.capacity_ah,

  es.battery_date,

  es.remarks,

  es.is_active,
  es.created_at,
  es.created_by,
  es.updated_at,
  es.updated_by
from dbo.InstallationEnergySupply es
where es.atrium_installation_code = @code
  and es.is_active = 1
order by
  case when es.sort_order is null then 999999 else es.sort_order end,
  es.created_at;
`;

export const upsertInstallationEnergySuppliesSql = `
-- expects params: @code, @itemsJson, @updatedBy

set nocount on;

-- 1) validate atrium installation exists
if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

-- 2) lazy create ember overlay row if missing
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

-- 3) load installation context
declare @installation_id uniqueidentifier;
declare @atrium_installation_code nvarchar(64);

select
  @installation_id = i.installation_id,
  @atrium_installation_code = i.atrium_installation_code
from dbo.Installation i
where i.atrium_installation_code = @code;

if @installation_id is null
begin
  throw 50000, 'installation not found', 1;
end;

-- 4) soft delete items not present anymore (replace list semantics)
declare @incoming table (energy_supply_id uniqueidentifier);

insert into @incoming(energy_supply_id)
select src.energy_supply_id
from openjson(@itemsJson)
with (
  energy_supply_id uniqueidentifier '$.energy_supply_id'
) src
where src.energy_supply_id is not null;

update es
set es.is_active = 0,
    es.updated_at = sysutcdatetime(),
    es.updated_by = @updatedBy
from dbo.InstallationEnergySupply es
where es.atrium_installation_code = @code
  and es.is_active = 1
  and not exists (select 1 from @incoming i where i.energy_supply_id = es.energy_supply_id);

-- 5) upsert incoming list
declare @actions table (action nvarchar(10));

merge dbo.InstallationEnergySupply as tgt
using (
  select
    isnull(src.energy_supply_id, newid()) as energy_supply_id,
    @installation_id as installation_id,
    @atrium_installation_code as atrium_installation_code,

    src.sort_order,
    isnull(nullif(ltrim(rtrim(src.kind)), N''), N'battery_set') as kind,

    nullif(ltrim(rtrim(src.location_label)), N'') as location_label,

    nullif(ltrim(rtrim(src.brand_type_key)), N'') as brand_type_key,
    nullif(ltrim(rtrim(src.brand_type_manual)), N'') as brand_type_manual,

    isnull(src.quantity, 1) as quantity,
    isnull(nullif(ltrim(rtrim(src.configuration)), N''), N'single') as configuration,

    src.capacity_ah,

    src.battery_date,

    nullif(ltrim(rtrim(src.remarks)), N'') as remarks,

    isnull(src.is_active, 1) as is_active
  from openjson(@itemsJson)
  with (
    energy_supply_id uniqueidentifier '$.energy_supply_id',

    sort_order int '$.sort_order',
    kind nvarchar(30) '$.kind',

    location_label nvarchar(100) '$.location_label',

    brand_type_key nvarchar(200) '$.brand_type_key',
    brand_type_manual nvarchar(200) '$.brand_type_manual',

    quantity int '$.quantity',
    configuration nvarchar(30) '$.configuration',

    capacity_ah decimal(18,3) '$.capacity_ah',

    battery_date date '$.battery_date',

    remarks nvarchar(2000) '$.remarks',

    is_active bit '$.is_active'
  ) src
) as s
on tgt.energy_supply_id = s.energy_supply_id
and tgt.atrium_installation_code = @code

when matched then update set
  tgt.installation_id = s.installation_id,
  tgt.atrium_installation_code = s.atrium_installation_code,

  tgt.sort_order = s.sort_order,
  tgt.kind = s.kind,

  tgt.location_label = s.location_label,

  tgt.brand_type_key = s.brand_type_key,
  tgt.brand_type_manual = s.brand_type_manual,

  tgt.quantity = s.quantity,
  tgt.configuration = s.configuration,

  tgt.capacity_ah = s.capacity_ah,

  tgt.battery_date = s.battery_date,

  tgt.remarks = s.remarks,

  tgt.is_active = s.is_active,
  tgt.updated_at = sysutcdatetime(),
  tgt.updated_by = @updatedBy

when not matched then insert (
  energy_supply_id,
  installation_id,
  atrium_installation_code,

  sort_order,
  kind,

  location_label,

  brand_type_key,
  brand_type_manual,

  quantity,
  configuration,

  capacity_ah,

  battery_date,

  remarks,

  is_active,
  created_at,
  created_by
) values (
  s.energy_supply_id,
  s.installation_id,
  s.atrium_installation_code,

  s.sort_order,
  s.kind,

  s.location_label,

  s.brand_type_key,
  s.brand_type_manual,

  s.quantity,
  s.configuration,

  s.capacity_ah,

  s.battery_date,

  s.remarks,

  s.is_active,
  sysutcdatetime(),
  @updatedBy
)
output $action into @actions;

select
  (select count(*) from @actions) as affected_rows,
  (select count(*) from @actions where action = 'INSERT') as inserted_rows,
  (select count(*) from @actions where action = 'UPDATE') as updated_rows;
`;

export const deleteInstallationEnergySupplySql = `
-- expects params: @code, @energy_supply_id, @updatedBy

update es
set es.is_active = 0,
    es.updated_at = sysutcdatetime(),
    es.updated_by = @updatedBy
from dbo.InstallationEnergySupply es
where es.atrium_installation_code = @code
  and es.energy_supply_id = @energy_supply_id;
`;
