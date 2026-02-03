// /api/src/db/queries/energySupplyBrandTypes.sql.ts
// =========================================================
// energy supply brand types queries; aligned to tabel-definities.sql
// =========================================================

export const getEnergySupplyBrandTypesSql = `
select
  brand_type_key,
  display_name,
  default_capacity_ah,
  sort_order,
  is_active,
  created_at
from dbo.EnergySupplyBrandType
order by
  case when is_active = 1 then 0 else 1 end,
  case when sort_order is null then 999999 else sort_order end,
  display_name,
  brand_type_key;
`;

export const upsertEnergySupplyBrandTypesSql = `
-- expects params: @typesJson

set nocount on;

declare @actions table (action nvarchar(10));

merge dbo.EnergySupplyBrandType as tgt
using (
  select
    src.brand_type_key,
    src.display_name,
    src.default_capacity_ah,
    src.sort_order,
    isnull(src.is_active, 1) as is_active
  from openjson(@typesJson)
  with (
    brand_type_key nvarchar(200) '$.brand_type_key',
    display_name nvarchar(250) '$.display_name',
    default_capacity_ah decimal(18,3) '$.default_capacity_ah',
    sort_order int '$.sort_order',
    is_active bit '$.is_active'
  ) src
  where nullif(ltrim(rtrim(src.brand_type_key)), N'') is not null
    and nullif(ltrim(rtrim(src.display_name)), N'') is not null
) as s
on tgt.brand_type_key = s.brand_type_key
when matched then update set
  tgt.display_name = s.display_name,
  tgt.default_capacity_ah = s.default_capacity_ah,
  tgt.sort_order = s.sort_order,
  tgt.is_active = s.is_active
when not matched then insert (
  brand_type_key,
  display_name,
  default_capacity_ah,
  sort_order,
  is_active,
  created_at
) values (
  s.brand_type_key,
  s.display_name,
  s.default_capacity_ah,
  s.sort_order,
  s.is_active,
  sysutcdatetime()
)
output $action into @actions;

select
  (select count(*) from @actions) as affected_rows,
  (select count(*) from @actions where action = 'INSERT') as inserted_rows,
  (select count(*) from @actions where action = 'UPDATE') as updated_rows;
`;
