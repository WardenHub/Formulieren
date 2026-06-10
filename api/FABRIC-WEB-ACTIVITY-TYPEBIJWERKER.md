# Fabric Web Activity; installatie typebijwerker

## Doel

Na een succesvolle Fabric sync van:

- `Ember.InstallationBase` -> `dbo.AtriumInstallationBase`
- `Ember.InstallationComponents` -> `dbo.AtriumInstallationComponent`

roept Fabric Ember aan om lege installatietypes automatisch te vullen.

De job is idempotent:

- werkt alleen op `installation_type_key IS NULL`
- werkt alleen op actuele installaties; `installation_status = 'N'`
- overschrijft nooit handmatige keuzes
- slaat historische installaties over

## Ember endpoint

- methode; `POST`
- pad; `/internal/maintenance/installations/type-initialization/run`

Voorbeeld:

`https://<jouw-ember-api>/internal/maintenance/installations/type-initialization/run`

## Verplichte header

Gebruik een aparte maintenance key:

- headernaam; `x-ember-maintenance-key`
- waarde; de waarde van `MAINTENANCE_API_KEY` in de Ember API config

Daarnaast:

- `Content-Type: application/json`

## Request body

```json
{
  "trigger_source": "fabric"
}
```

Als `trigger_source` ontbreekt, gebruikt de route standaard `fabric`.

## Verwachte response

Bij succes geeft Ember JSON terug zoals:

```json
{
  "ok": true,
  "summary": {
    "run_id": "....",
    "trigger_source": "fabric",
    "updated_total": 2460,
    "updated_existing_count": 0,
    "inserted_overlay_count": 2460,
    "skipped_already_typed_count": 2,
    "skipped_historical_count": 5448,
    "skipped_not_current_count": 0,
    "unknown_no_mapping_count": 8663,
    "mapping_target_missing_count": 0,
    "inspected_count": 16573
  },
  "appliedGroups": [],
  "unknownGroups": [],
  "skippedGroups": [],
  "mappings": []
}
```

## Benodigde API config

Zet in de Ember API app settings of `.env`:

```env
MAINTENANCE_API_KEY=<kies-een-lange-willekeurige-geheime-waarde>
```

Aanbevolen:

- minimaal 32 willekeurige tekens
- apart secret; niet hergebruiken voor andere integraties
- opslaan als secret in Azure of Fabric-config; niet hardcoden in documentatie of notebooks

## Fabric pipeline opzet

Voorkeursvolgorde:

1. Copy activity voor `InstallationBase`
2. Copy activity voor `InstallationComponents`
3. Web activity; alleen bij succesvolle afronding van beide voorgaande stappen

## Fabric Web activity voorbeeld

### URL

`https://<jouw-ember-api>/internal/maintenance/installations/type-initialization/run`

### Method

`POST`

### Headers

```json
{
  "Content-Type": "application/json",
  "x-ember-maintenance-key": "<secret>"
}
```

### Body

```json
{
  "trigger_source": "fabric"
}
```

### Timeout

Gebruik een ruime timeout, bijvoorbeeld 2 tot 5 minuten, afhankelijk van de dataset.

## Handmatige test

### PowerShell

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "x-ember-maintenance-key" = "<secret>"
}

$body = @{
  trigger_source = "fabric"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://<jouw-ember-api>/internal/maintenance/installations/type-initialization/run" `
  -Headers $headers `
  -Body $body
```

## Audit controle

Na een succesvolle run:

```sql
select top 20 *
from dbo.InstallationTypeInitializationAudit
order by started_at desc;

select top 100 *
from dbo.InstallationTypeInitializationAuditDetail
order by run_id desc;
```

Je hoort daar `trigger_source = 'fabric'` terug te zien.

## Foutcodes

- `401`; maintenance key ontbreekt of is onjuist
- `500`; maintenance key niet geconfigureerd of interne verwerkingsfout

## Beheeradvies

- gebruik deze route alleen voor server-to-server integratie
- roteer de maintenance key als hij ooit gedeeld of gelekt is
- laat Fabric deze route pas aanroepen nadat de copy jobs echt geslaagd zijn
