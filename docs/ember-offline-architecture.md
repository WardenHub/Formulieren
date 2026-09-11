# Ember Offline; architectuur eerste uitwerking

## Doel van deze notitie

Deze notitie vertaalt de POC-keuzes voor Ember Offline naar een eerste technische en UX-architectuur, zodat we daarna gericht kunnen bouwen zonder opnieuw te moeten gokken over verantwoordelijkheden.

Deze notitie bouwt voort op:

- [ember-offline-poc.md](./ember-offline-poc.md)

## Hoofdprincipe

Ember Offline is geen tweede losse formulierengine.

Ember Offline is:

- een lokale Tauri-shell;
- met lokale opslag;
- met synchronisatielogica;
- die zo veel mogelijk dezelfde formulierdefinitie en runtime-uitgangspunten gebruikt als gewone Ember.

De online Ember-omgeving blijft leidend voor:

- formulieraanmaak;
- vervolgformulieraanmaak;
- server-side pre-flight;
- definitieve indiening;
- workflowafhandeling;
- documentbeheer;
- conflictwaarheid.

## Architectuurlagen

### 1. Online Ember

Verantwoordelijk voor:

- installatie zoeken;
- formulier aanmaken;
- vervolgformulier aanmaken;
- `Klaarzetten voor Ember Offline`;
- package samenstellen;
- revisie- en conflictinformatie;
- online afronden na offline werk.

### 2. Ember API

Verantwoordelijk voor:

- package-opbouw;
- afleveren van formuliercontext;
- afleveren van geselecteerde installatiebestanden;
- statusvergelijking tussen lokaal en online;
- terugontvangen van offline ingevulde antwoorden;
- bepalen of sync direct kan of als conflict moet eindigen.

### 3. Ember Offline app

Verantwoordelijk voor:

- lokale werkvoorraad;
- lokale opslag;
- offline invullen;
- lokale statusvoering;
- sync starten wanneer er verbinding is;
- gebruiker teruggeleiden naar online Ember.

### 4. Shared form runtime

Verantwoordelijk voor:

- interpretatie van survey json;
- navigatie;
- vraagweergave;
- lokale validatie;
- consistente Ember-patronen in de runner.

## Gewenste mapopzet

Voor de eerste opzet lijkt deze structuur logisch:

```text
codebase/ember-offline/
  docs/
  src/
  src-tauri/
  package.json
  shared/
  tooling/
```

### `docs/`

Voor:

- scope;
- architectuur;
- API-contracten;
- synclogica;
- deploymentnotities.

### `src/` en `src-tauri/`

Voor de Tauri-shell en de offline UI.

Bijvoorbeeld later:

```text
codebase/ember-offline/
  src/
  src-tauri/
  package.json
```

Voor de eerste bouwstap houden we dit expres nog klein:

```text
codebase/ember-offline/
  README.md
  src/
  src-tauri/
```

### `shared/`

Alleen voor code die bewust gedeeld kan worden tussen online Ember en Ember Offline.

Denk aan:

- vraagrendering;
- modelbouw;
- gedeelde form utilities;
- local-only adapters rond bestaande runtime-logica.

### `tooling/`

Voor:

- packaging;
- Intune deployment artifacts;
- installer scripts;
- silent install notities.

## UX-hoofdschermen

### Scherm 1; Online werkvoorraad

Doel:

- zien welke formulieren online beschikbaar zijn om lokaal klaar te zetten;
- installatie kiezen;
- bestaand formulier selecteren;
- vervolgformulier selecteren als het al online bestaat.

Belangrijke acties:

- `Synchroniseren`
- `Klaarzetten`
- `Installatiebestanden kiezen`

### Scherm 2; Offline werkvoorraad

Doel:

- lokaal beschikbare formulieren zien;
- status zien;
- snel verder kunnen werken.

Belangrijke kolommen of tags:

- installatie;
- formulier;
- lokale status;
- laatst gewijzigd;
- klaar voor online afronden.

Belangrijke acties:

- `Open formulier`
- `Open offline werkmap`
- `Verwijderen van apparaat`

### Scherm 3; Offline runner

Doel:

- formulier invullen zonder internet;
- lokaal opslaan;
- markeren als afgerond.

Belangrijke acties:

- `Opslaan`
- `Later verder`
- `Lokaal afgerond`

### Scherm 4; Synchronisatie

Doel:

- zien wat terug kan naar Ember;
- conflicten tonen;
- bulk terug naar online.

Belangrijke acties:

- `Controleer online`
- `Stuur antwoorden terug`
- `Open in Ember`
- `Open alle klaarstaande formulieren online`

## Lokale statemachine

Een lokaal formulierrecord doorloopt in de POC ongeveer dit pad:

```text
Klaargezet
-> Lokaal in bewerking
-> Lokaal afgerond
-> Wacht op online afronden
-> Gesynchroniseerd
```

Alternatieve tak:

```text
Klaargezet
-> Lokaal in bewerking
-> Conflict
```

## Minimale datamodellen

### Lokaal formulierrecord

Velden die we minimaal nodig lijken te hebben:

- `local_form_id`
- `online_form_id`
- `installation_id`
- `atrium_installation_code`
- `form_definition_id`
- `form_title`
- `form_version`
- `parent_form_id`
- `is_follow_up`
- `downloaded_at`
- `last_local_saved_at`
- `last_online_revision_token`
- `local_status`
- `needs_online_finish`
- `has_conflict`

### Lokaal package

Een package bevat minimaal:

- formuliermetadata;
- survey json;
- prefill/context;
- installatie-identiteit;
- geselecteerde documentmetadata;
- optionele lokale documentbestanden.

## Synchronisatiestrategie

### Richting 1; online naar lokaal

Wanneer gebruiker `Klaarzetten voor Ember Offline` kiest:

- haal package op van de API;
- sla package lokaal op;
- sla een revision token of vergelijkbare online versie-indicator op.

### Richting 2; lokaal terug naar online

Wanneer gebruiker weer online is:

- app controleert revision token;
- als geen wijziging online; antwoorden kunnen terug;
- als wel wijziging online; markeer `Conflict`.

Voor de POC hoeft dit nog geen definitieve submit te zijn.

Het mag ook:

- antwoorden terugzetten als conceptdata;
- daarna gebruiker naar online Ember sturen voor laatste controle.

Dat is waarschijnlijk de veiligste eerste route.

## Conflictbeleid

Voor de POC:

- conflict op formulierversie of online laatste wijziging is genoeg;
- geen veld-merge;
- wel duidelijke vergelijking op hoofdniveau.

Gebruiker krijgt:

- wie online gewijzigd heeft;
- wanneer dat gebeurd is;
- keuze wat te doen.

## Bestandspakket; installatiebestanden

Offline meenemen van installatiebestanden moet opt-in zijn.

Daarom:

- gebruiker kiest documenttypes;
- kritieke types worden voorgeselecteerd of subtiel benadrukt;
- alleen actuele bestanden tellen mee;
- historische bestanden niet.

Bewuste POC-grens:

- we nemen géén formulierbijlagen offline mee;
- we nemen géén nieuwe offline bijlagen op.

## Authenticatie-aanpak

### Online gedrag

Wanneer verbinding aanwezig is:

- Ember Offline gebruikt SSO;
- haalt packages op;
- controleert conflictsituaties;
- opent online Ember waar nodig.

### Offline gedrag

Wanneer verbinding wegvalt:

- bestaande lokaal opgeslagen formulieren blijven bruikbaar;
- geen nieuwe authenticatie nodig;
- geen calls naar API verplichten.

### Terug online

Als sessie verlopen is:

- eerst opnieuw aanmelden;
- daarna sync hervatten.

## Deployment-aanpak

Doel:

- één installer;
- silent install ondersteund;
- uitrolbaar via Intune;
- lokale werkmap in app-data;
- geen losse browser of extra helper-app nodig.

## Bewuste POC-beperkingen

We houden de eerste versie klein:

- geen offline aanmaak;
- geen offline submit;
- geen offline bijlagen;
- geen zware merge;
- geen tweede workflow-engine.

Dat is geen tekortkoming; dit is precies wat de POC veilig maakt.

## Aanbevolen technische vervolgstap

Voor implementatie is dit de beste volgorde:

1. API-package-contract vastleggen;
2. online Ember actie `Klaarzetten voor Ember Offline` ontwerpen;
3. lokaal datamodel uitwerken;
4. Tauri app skeleton opzetten;
5. package import in lokale werkvoorraad tonen;
6. pas daarna runner-integratie doen.

Als we deze volgorde aanhouden, blijven online en offline netjes aan elkaar gekoppeld zonder dat we later moeten terugverbouwen.
