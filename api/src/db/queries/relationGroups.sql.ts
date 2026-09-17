/* Het relatiegroepfilter. Eén tekst, inmiddels drie gebruikers; de installatielijst, de
   installatiekaart en de formuliermonitor.

   @relationGroupsJson is een JSON-array met relatiegroepsleutels. Leeg of null betekent geen
   filter. @relationGroupRolesJson zegt via welke objectrollen een installatie bij de groep
   hoort; intern staan alle vier aan, zodat "toon alles van RUG" ook echt alles toont. Voor
   externe toegang hoort die lijst smaller te zijn, en dat is precies waarom het een parameter
   is en geen vaste regel in de query.

   De resolver is bewust een exists en geen join; een installatie kan via meerdere rollen aan
   dezelfde groep hangen en mag daardoor niet dubbel in de lijst komen.

   De queries dragen een plaatshouder in plaats van het filter zelf. Reden: SQL Server bindt
   tabelnamen bij het compileren, ook in een tak die door @relationGroupsJson is null nooit
   wordt uitgevoerd. Zolang dbo.AtriumRelationGroupMember nog niet bestaat, zou de hele
   installatiekaart daarmee omvallen op een naam die niemand nodig had.

   Staat er geen groep in het filter, dan komt er (1 = 1) te staan en noemt de query de
   relatiegroeptabellen niet. Dat maakt de volgorde van uitrollen ongevaarlijk.

   Het alias is de kant van de installatie; die moet BedrijfUnit en de vier object_*_gcid
   kolommen in beeld hebben. Dat is dbo.AtriumInstallationBase, hoe de query hem ook noemt. */

export const RELATION_GROUP_FILTER_PLACEHOLDER = "@@relationGroupFilter@@";

export function withRelationGroupFilter(sql: string, alias: string, active: boolean) {
  const fragment = active ? buildRelationGroupFilterSql(alias) : "(1 = 1)";
  return sql.split(RELATION_GROUP_FILTER_PLACEHOLDER).join(fragment);
}

export function buildRelationGroupFilterSql(alias: string) {
  return `(
    @relationGroupsJson is null
    or exists (
      select 1
      from dbo.AtriumRelationGroupMember m
      cross apply (values
        (N'GEBRUIKER', ${alias}.object_gebruiker_gcid),
        (N'EIGENAAR', ${alias}.object_eigenaar_gcid),
        (N'BEHEERDER', ${alias}.object_beheerder_gcid),
        (N'DEBITEUR', ${alias}.object_debiteur_gcid)
      ) as rol(rol_code, relation_key)
      where m.business_unit = ${alias}.BedrijfUnit
        and m.relation_group_key in (select value from openjson(@relationGroupsJson))
        and m.relation_key = rol.relation_key
        and rol.rol_code in (select value from openjson(@relationGroupRolesJson))
    )
  )`;
}

/* De spiegels komen uit Fabric en kunnen in een omgeving ontbreken. Elk scherm dat op een
   groep wil filteren vraagt dit eerst, en laat het filter dan gewoon weg. */
export const getRelationGroupTablesAvailableSql = `
select cast(case
  when object_id(N'dbo.AtriumRelationGroup', N'U') is null then 0
  when object_id(N'dbo.AtriumRelationGroupMember', N'U') is null then 0
  else 1
end as bit) as available;
`;
