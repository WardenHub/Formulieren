// /api/src/db/queries/installationTypes.sql.ts
// =========================================================
// installation types queries; aligned to tabel-definities.sql
// =========================================================

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
-- expects params: @code, @installation_type_key

update i
set installation_type_key = @installation_type_key
from dbo.Installation i
where i.atrium_installation_code = @code;

if @@rowcount = 0
begin
  throw 50000, 'installation not found', 1;
end;

select
  i.atrium_installation_code,
  i.installation_type_key
from dbo.Installation i
where i.atrium_installation_code = @code;
`;
