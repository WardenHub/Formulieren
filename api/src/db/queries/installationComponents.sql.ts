// /api/src/db/queries/installationComponents.sql.ts
// =========================================================
// installation components (Atrium sync mirror)
// read-only; aligned to tabel-definities.sql
// =========================================================

export const getInstallationComponentsSql = `
set nocount on;

-- validate atrium installation exists
if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

select
  c.component_id,
  c.atrium_installation_code,
  c.object_code,

  c.install_status,
  c.instcomp_regel_nr,
  c.instcomp_regel_type,
  c.instcomp_aantal,
  c.instcomp_omschrijving,
  c.instcomp_serienr,
  c.instcomp_locatie,

  c.instcomp_datum_plaatsing,
  c.instcomp_datum_garantie,

  c.instcomp_artikeltype,

  c.artikel_code,
  c.artikel_omschrijving,
  c.artikel_artikeltype,

  c.handart_code,
  c.handart_omschrijving,

  c.tarief_code,
  c.tarief_omschrijving,

  c.source_instcomp_gcid,
  c.data_loaded_at
from dbo.AtriumInstallationComponent c
where c.atrium_installation_code = @code
order by
  case when c.instcomp_regel_nr is null then 2147483647 else c.instcomp_regel_nr end,
  c.component_id;
`;
