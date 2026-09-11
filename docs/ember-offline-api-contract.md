# Ember Offline; eerste API- en packagecontracten

## Doel

Deze notitie beschrijft de eerste contracten die Ember Offline nodig heeft voor de POC.

Het doel is niet om direct alle endpoints definitief te maken, maar om duidelijk te krijgen:

- welke acties online Ember moet kunnen starten;
- welke data Ember Offline nodig heeft;
- welke sync terug verwacht wordt.

## Uitgangspunten

- online Ember blijft leidend voor formulieraanmaak;
- Ember Offline haalt alleen online klaargezette formulieren op;
- package-opbouw gebeurt server-side;
- offline bijlagen blijven buiten scope;
- online afronding blijft in gewone Ember.

## Hoofdacties

### 1. Klaarzetten voor offline

Actie vanuit online Ember:

- gebruiker kiest formulier;
- gebruiker kiest documenttypes;
- server maakt direct een offline package op basis van de actuele online data;
- gebruiker downloadt dit package lokaal in Ember Offline.

### 2. Offline package ophalen

Actie vanuit Ember Offline:

- app haalt alle voor deze gebruiker beschikbare offline packages op;
- app downloadt package en optionele documenten.

### 3. Lokale voortgang terugmelden

Actie vanuit Ember Offline:

- antwoorden terugsturen;
- online revision controleren;
- resultaat wordt:
  - geaccepteerd;
  - conflict;
  - niet meer geldig.

## Voorstel; online Ember acties

### UI-actie

Nieuwe actie in online Ember:

- `Klaarzetten voor Ember Offline`

Optionele vervolgprompt:

- documenttypes kiezen;
- samenvatting tonen van wat lokaal wordt meegenomen.

## Voorstel; endpoints

De exacte route-indeling kan later worden aangepast aan bestaande patronen. Dit is de functionele contractlaag.

### A. Formulier offline klaarzetten en package downloaden

```http
POST /installations/{atrium_installation_code}/forms/instances/{form_instance_id}/offline-package
```

Request:

```json
{
  "selected_document_type_keys": ["pve", "tekening", "blokschema"]
}
```

Response:

```json
{
  "file_name": "ember-offline-BOSCHBMI-42.json",
  "package": {
    "package_kind": "ember_offline_form_package",
    "package_version": "0.1",
    "generated_at": "2026-07-07T10:00:00Z",
    "generated_by": {
      "user_id": "guid",
      "display_name": "Jesse Veentjer"
    },
    "source": {
      "app": "ember",
      "mode": "online-preparation",
      "poc": true
    },
    "offline_constraints": {
      "supports_offline_attachments": false,
      "supports_offline_final_submit": false,
      "final_submit_requires_online": true
    },
    "installation": {},
    "form_instance": {},
    "runtime": {},
    "document_selection": {
      "selected_document_type_keys": ["pve", "tekening", "blokschema"]
    },
    "selected_documents": []
  }
}
```

### B. Beschikbare offline packages ophalen

```http
GET /me/offline-packages
```

Response:

```json
{
  "items": [
    {
      "offline_package_id": "guid",
      "form_id": "guid",
      "form_title": "Rapport van Onderhoud BMI",
      "form_version": "1.0",
      "installation_id": "guid",
      "atrium_installation_code": "BOSCHBMI",
      "installation_name": "Installatie COA Zoutkamp",
      "is_follow_up": false,
      "parent_form_id": null,
      "prepared_at": "2026-07-07T10:00:00Z",
      "revision_token": "...",
      "document_count": 7
    }
  ]
}
```

### C. Offline package downloaden

```http
GET /me/offline-packages/{offline_package_id}
```

Response:

```json
{
  "offline_package_id": "guid",
  "form": {
    "form_id": "guid",
    "form_definition_id": "guid",
    "title": "Rapport van Onderhoud BMI",
    "version": "1.0",
    "parent_form_id": null,
    "parent_instance_id": null
  },
  "installation": {
    "installation_id": "guid",
    "atrium_installation_code": "BOSCHBMI",
    "installation_name": "Installatie COA Zoutkamp",
    "bedrijf_unit": "Wardenburg"
  },
  "runtime": {
    "survey_json": {},
    "prefill": {},
    "context": {}
  },
  "documents": [
    {
      "document_id": "guid",
      "document_type_key": "blokschema",
      "title": "Blokschema (test 1)",
      "filename": "blokschema_1.pdf",
      "download_url": "/me/offline-packages/{offline_package_id}/documents/{document_id}"
    }
  ],
  "revision_token": "..."
}
```

### D. Offline documentdownload

```http
GET /me/offline-packages/{offline_package_id}/documents/{document_id}
```

Response:

- bestandstream

## Voorstel; lokale sync terug

### E. Offline concept terugmelden

```http
POST /forms/{form_id}/offline-sync
```

Request:

```json
{
  "offline_package_id": "guid",
  "revision_token": "...",
  "local_saved_at": "2026-07-07T13:00:00Z",
  "answers": {},
  "metadata": {
    "offline_status": "ready_for_online_finish"
  }
}
```

Response bij succes:

```json
{
  "result": "accepted",
  "form_id": "guid",
  "new_revision_token": "...",
  "open_online_url": "/monitor/formulieren/2"
}
```

Response bij conflict:

```json
{
  "result": "conflict",
  "form_id": "guid",
  "changed_by": {
    "user_id": "guid",
    "display_name": "Jesse Veentjer"
  },
  "changed_at": "2026-07-07T12:59:00Z",
  "open_online_url": "/monitor/formulieren/2"
}
```

## Huidige situatie in Ember

Dit deel is al gebouwd in de online Ember-app:

- actie in `installaties > formulieren`;
- knop `Ember Offline` per formulierregel;
- modal waarin documenttypes gekozen worden;
- backend package-opbouw in de bestaande API;
- download van een json package voor lokaal gebruik.

De huidige backendroute is dus geen losse generieke `/forms/offline-packages` route; maar een installatie- en formuliergebonden route die netjes aansluit op de bestaande Ember-architectuur.

## Revision token

Voor de POC hoeft dit technisch niet perfect fancy te zijn.

Een revision token mag bijvoorbeeld gebaseerd zijn op:

- `updated_at`;
- `rowversion`;
- of een samengestelde hash van relevante velden.

Belangrijkste eis:

- als online formulier sinds download is aangepast, moet Ember Offline dat kunnen zien.

## Wat terug moet naar online

Voor de POC is het verstandig om alleen dit terug te sturen:

- ingevulde antwoorden;
- beperkte lokale metadata;
- laatste lokale opslagtijd;
- gebruikte revision token.

Niet terug in de POC:

- offline bestanden;
- offline foto’s;
- offline workflowmutaties buiten formulierdata.

## Formulierstatus in online Ember na sync

Bij een geaccepteerde offline sync hoeft het formulier nog niet automatisch ingediend te worden.

Betere POC-richting:

- online formulier wordt bijgewerkt als concept;
- gebruiker ziet dat lokaal werk is binnengekomen;
- gebruiker rondt online af.

Dit past bij de gewenste gebruikerstekst:

- `Ik heb lokaal mijn werk gedaan`
- `Laatste stap online afronden`

## Nodige documenttypebron

De keuzelijst voor offline documenttypes moet niet hardcoded in Ember Offline staan.

Voor de POC komt die lijst nu uit bestaande Ember-bronnen:

- installatiecatalogus;
- installatiebestanden;
- bestaande documenttypes in Ember.

Daaruit leiden we in de online UI af:

- `document_type_key`
- `label`
- `is_critical`
- `sort_order`

Een latere nette API-richting blijft wenselijk:

```http
GET /document-types/offline-eligible
```

Response:

```json
{
  "items": [
    {
      "document_type_key": "pve",
      "label": "PvE",
      "is_critical": true,
      "sort_order": 10
    }
  ]
}
```

## Belangrijke validaties

Bij `Klaarzetten voor Ember Offline` moet de API minimaal controleren:

- formulier bestaat;
- gebruiker mag formulier zien;
- formulier is geschikt om offline mee te nemen;
- package is gebaseerd op actuele online data;
- alleen actuele installatiebestanden worden meegenomen;
- historische documenten worden uitgesloten.

## Open contractvragen

Deze punten moeten we nog beslissen voor implementatie:

- krijgt één formulier meerdere offline packages of maar één actieve;
- of documentbestanden als losse downloads of als zip geleverd worden;
- of sync altijd direct terugschrijft, of eerst previewcontrole doet;
- of de online Ember UI een aparte `offline klaarzetten` statusbadge krijgt.

## Aanbevolen vervolgstap

De eerstvolgende concrete bouwstap is:

1. Ember Offline app-shell opzetten in `codebase/ember-offline/`;
2. json package lokaal kunnen importeren en opslaan;
3. lokale werkvoorraad tonen;
4. daarna de runner-integratie toevoegen.
