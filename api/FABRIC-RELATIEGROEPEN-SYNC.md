# Fabric sync; relatiegroepen naar Ember

## Doel

Relatiegroepen uit Atrium beschikbaar maken in Ember, zodat de installatiekaart op een
concern kan filteren en een externe gebruiker straks toegang kan krijgen tot alles van zijn
relatiegroep.

De keten is dezelfde als die van `Ember.InstallationBase`; zie
`FABRIC-WEB-ACTIVITY-TYPEBIJWERKER.md` voor de bestaande pipeline waar dit bij hoort.

```
Atrium            AT_RELGROEP, AT_RELRLGRP, AT_RELATIE
  -> Fabric RAW   AT_RELGROEP_WB/_HF, AT_RELRLGRP_WB/_HF, AT_RELATIE_WB/_HF
  -> Fabric Silver Master.relatiegroepen, Master.relatierelatiegroepen, Master.relaties
  -> Fabric Gold  Master.Dim_RelatieGroepen, Master.Bridge_RelatieRelatieGroepen
                  Ember.RelationGroups, Ember.RelationGroupMembers
  -> Ember SQL    dbo.AtriumRelationGroup, dbo.AtriumRelationGroupMember
```

## Twee copy activities

Voeg ze toe aan dezelfde pipeline die `Ember.InstallationBase` overzet, vóór de web activity.

| Bron (Atrium_NL_DM) | Doel (ember-sql-db) | Schrijfwijze |
|---|---|---|
| `Ember.RelationGroups` | `dbo.AtriumRelationGroup` | truncate, daarna insert |
| `Ember.RelationGroupMembers` | `dbo.AtriumRelationGroupMember` | truncate, daarna insert |

**Beide copy jobs filteren op `relation_group_purpose = 'ORGANISATIE'`.** Atrium gebruikt
dezelfde groepentabel ook voor selecties ("Top 25 debiteuren"), branches ("Architect") en bij
Hefas voor partnerrollen ("Dealer 3"). Alleen een organisatie is een klant met eigen gebouwen.
De views filteren daar bewust niet op, zodat rapportage dezelfde views kan gebruiken. Filtert
de job niet, dan staan er in Ember groepen die geen klant zijn, en bij de leden zelfs leden
zonder groep.

`relation_group_purpose` gaat **niet** mee in de mapping; de Ember-spiegels hebben die kolom
niet. Verwijder die regel in de kolomtoewijzing, net als `snapshot_received_at`.

De overige kolomnamen zijn aan beide kanten gelijk, dus daarvoor volstaat de automatische
mapping:

```
business_unit        -> business_unit
relation_group_key   -> relation_group_key
relation_group_code  -> relation_group_code
relation_group_name  -> relation_group_name
relation_group_kind  -> relation_group_kind
is_intercompany      -> is_intercompany
source_modified_at   -> source_modified_at
fabric_loaded_at     -> fabric_loaded_at
```

en voor de leden:

```
business_unit        -> business_unit
relation_group_key   -> relation_group_key
relation_key         -> relation_key
relation_code        -> relation_code
relation_name        -> relation_name
source_modified_at   -> source_modified_at
fabric_loaded_at     -> fabric_loaded_at
```

`snapshot_received_at` staat niet in de mapping; die vult de database zelf met de
standaardwaarde, zodat altijd te zien is wanneer Ember de rij binnenkreeg.

## Volgorde en omvang

Groepen eerst, leden daarna. Er is bewust geen foreign key tussen de twee, zodat een sync niet
kan vastlopen op laadvolgorde, maar een lid zonder groep hoort nergens en levert in Ember
niets op.

Huidige omvang voor beide bedrijfsonderdelen samen, gemeten op 12 september 2026:

- actuele groepen; 168, waarvan 98 een organisatie
- leden van organisaties; 1955 relaties

Dat is klein genoeg voor een volledige herlading per run; er is geen watermerk nodig.

## Wat Ember ermee doet

`relation_key` heeft dezelfde vorm als de objectrollen in `dbo.AtriumInstallationBase`,
bijvoorbeeld `Wardenburg|119173`. De resolver koppelt een groep daarmee aan installaties via
`object_gebruiker_gcid`, `object_eigenaar_gcid`, `object_beheerder_gcid` en
`object_debiteur_gcid`. Welke van die vier meetellen is een parameter
(`@relationGroupRolesJson`); intern staan ze alle vier aan.

De filters staan in `api/src/db/queries/installationOperational.sql.ts`, in
`buildRelationGroupFilterSql`. Eén tekst, gebruikt door de lijstquery en de kaartquery, met
`api/tests/relationGroupFilter.test.ts` als bewaking daarop.

## Wat er niet in zit

- Historische groepen en historische relaties. De Gold-views laten ze weg, zodat een groep die
  in Atrium vervalt bij de volgende sync uit Ember verdwijnt in plaats van stil door te lopen.
- Groepen die geen organisatie zijn, mits de copy job op `relation_group_purpose` filtert.
  `relation_group_kind` is de genormaliseerde soort uit Atrium en doet dat werk niet; "Top 100
  klanten" draagt dezelfde soort als "RUG". De indeling staat in `Master.RelatieGroep_Doel` en
  is met de hand gemaakt, want de bron kent geen veld dat dit onderscheid maakt.
- Een oordeel over wie toegang mag krijgen. Dat blijft een aparte keuze per groep in Ember
  zelf; een indeling in Fabric zegt wat een groep is, niet wie hem mag zien.
