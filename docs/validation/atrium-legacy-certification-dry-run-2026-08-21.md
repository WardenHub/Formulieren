# Atrium legacy-certificaten; gecontroleerde dry-run

Datum: 21 augustus 2026

## Doel

Vaststellen of Atrium actuele legacy-certificaatregistraties bevat die als kandidaten voor een eenmalige Ember-import kunnen dienen. Deze controle schrijft niets naar Atrium, Ember, Fabric of Blob Storage.

## Veiligheidsbewijs

- Verbinding: lokale ODBC-DSN `fbodbc1` via de Wardenburg-VPN.
- Transactie: door de Atrium read-only tool bevestigd als `MON$READ_ONLY = 1`.
- Toegang: `ReadOnly=Y` en ODBC access mode `READ_ONLY`.
- Querytype: uitsluitend begrensde `SELECT`-queries.
- Historische filtering: niet toegepast op `AT_INSTKEUR`, omdat de tabel geen historische-statuskolom heeft en bovendien leeg is.

## Ontdekte bronstructuur

De Atrium-metadata bevat:

- `AT_INSTKEUR`; installatiekeuring met installatie-, document-, werkbon-, datum- en nummerreferenties;
- `AT_CERTIFIC`; certificaatdefinities;
- `AT_CERTKOP`; koppeling van certificaatdefinitie aan relatie;
- `AT_CERTWERK`; koppeling van certificaatdefinitie aan werk;
- `AT_CERTWGRP`; koppeling van certificaatdefinitie aan werkgroep.

`AT_INSTKEUR.EXTDOC_GC_ID` kan technisch naar `AT_EXTDOC.DOCUMENT_GC_ID` verwijzen. `AT_INSTKEUR.INSTALL_GC_ID` kan technisch naar `AT_INSTALL.GC_ID` verwijzen. Omdat er geen bronrijen zijn, is deze joinrichting alleen structureel vastgesteld en niet met inhoudelijke voorbeelden bevestigd.

## Dry-runresultaat

| Tabel | Rijen |
|---|---:|
| `AT_INSTKEUR` | 0 |
| `AT_CERTIFIC` | 6 |
| `AT_CERTKOP` | 0 |
| `AT_CERTWERK` | 0 |
| `AT_CERTWGRP` | 0 |

Er zijn op dit moment geen installatiegebonden legacy-certificaten of -keuringen die verantwoord naar Ember kunnen worden geïmporteerd.

## Besluit

- Er is niets geïmporteerd.
- Er worden geen certificeringsplichten uit Atrium-contracten of certificaatdefinities afgeleid.
- De zes rijen in `AT_CERTIFIC` zijn uitsluitend definities en geen bewijsstukken of installatiegebonden waarheid.
- Wanneer `AT_INSTKEUR` later gegevens bevat, volgt opnieuw een dry-run met installatiesleutel-, document-, datum-, duplicaat- en bronbestandsvalidatie.
- Een toekomstige import schrijft uitsluitend `source_type = LEGACY_IMPORT` en `verification_status = UNVERIFIED`; menselijke verificatie blijft verplicht.
