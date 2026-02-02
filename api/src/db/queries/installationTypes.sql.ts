// /api/src/db/queries/installationTypes.sql.ts
// =========================================================
// installation types queries; aligned to tabel-definities.sql
// =========================================================

export const ensureInstallationSql = `
-- expects: @code, @createdBy

-- 1) validate installation exists in ERP sync table
if not exists (
  select 1
  from dbo.AtriumInstallationBase a
  where a.installatie_code = @code
)
begin
  throw 50000, 'atrium installation not found', 1;
end;

-- 2) create ember installation row if missing
if not exists (
  select 1
  from dbo.Installation i
  where i.atrium_installation_code = @code
)
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

select top 1
  installation_id,
  atrium_installation_code,
  installation_type_key
from dbo.Installation
where atrium_installation_code = @code;
`;


export const getInstallationTypesSql = `
select
  it.installation_type_key,
  it.display_name,
  it.sort_order,
  it.is_active,
  it.created_at
from dbo.InstallationType it
order by
  case when it.sort_order is null then 999999 else it.sort_order end,
  it.installation_type_key
`;

export const setInstallationTypeSql = `
-- expects: @code, @installation_type_key

update i
set installation_type_key = @installation_type_key
from dbo.Installation i
where i.atrium_installation_code = @code;

if @@rowcount = 0
begin
  throw 50000, 'ember installation row missing', 1;
end;

select
  i.atrium_installation_code,
  i.installation_type_key
from dbo.Installation i
where i.atrium_installation_code = @code;
`;

