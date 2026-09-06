# Conventies van de Ember-formulierruntime

Dit document beschrijft hoe een formulier in Ember wordt gedefinieerd en wat de gedeelde
runtime daarmee doet. Het is beschrijvend, niet wensdenkend; alles hieronder staat zo in de
code en is per onderdeel terug te vinden op de genoemde plek.

De regel achter alles: **een nieuw formulier is een definitie, geen code.** Er komt geen
React-pagina per formulier en geen `if (formCode === ...)` in de gedeelde runtime. Wat een
formulier bijzonder maakt, staat in `survey_json` onder de sleutel `ember`.

## Waar een formulier woont

| Onderdeel | Plek |
|---|---|
| Definitie in de database | `dbo.FormDefinition` en `dbo.FormDefinitionVersion.survey_json` |
| Seed van de definitie | `SQL DB\Eigenschappen.sql` |
| Fixture in de repository | `docs/fixtures/forms/<CODE>.v<versie>.json` |
| Runtime | `src/pages/Forms/FormRunnerBase.jsx` plus `src/pages/Forms/shared/` |
| Renderer | `src/pages/Forms/shared/EmberRuntimeSurvey.jsx` |

De fixture en de seed moeten letterlijk gelijk zijn; `scripts/validate-form-fixtures.mjs`
vergelijkt ze byte voor byte en faalt anders. Elke pagina heeft een stabiele, unieke `name`.

`instance_title` en `instance_note` zijn metadata van een instance en staan **nooit** in
`survey_json`; de validator weigert dat expliciet.

## Welke vraagtypen de runtime kent

`FormRunnerBase.jsx` (`supportedTypes`) ondersteunt: `survey`, `page`, `panel`, `html`,
`text`, `comment`, `dropdown`, `radiogroup`, `boolean`, `matrixdynamic`, `paneldynamic`.

Komt er in een definitie een type buiten die verzameling voor, dan valt het hele formulier
terug op de SurveyJS-renderer (`<Survey model={model} />`). Dat is een werkende maar oudere
laag zonder de Ember-vormgeving, zonder de kaartweergave van matrices en zonder de
capaciteitswaarschuwing. Gebruik dus geen ander type zonder het eerst in de Ember-renderer
te ondersteunen.

## De ember-metadata

Alle sleutels hieronder komen voor in `MAINT_BMI` v3.0 en worden door de runtime of de API
werkelijk gelezen.

### `ember.layout` op een matrix

De weergavevariant van een `matrixdynamic`. Wordt gelezen door `getMatrixLayoutVariant`
(`EmberRuntimeSurvey.jsx`); een onbekende waarde valt terug op `default`.

| Waarde | Weergave |
|---|---|
| `assessment` | Beoordelingsregels; code, onderwerp, Ja/Nee/N.v.t. en een opmerking. Rijen zijn gememoïseerd; dit is de variant voor lange lijsten. |
| `energy-supply` | Kaarten met de accu- en voedingsregels, inclusief de capaciteitswaarschuwing. |
| `availability-periods` | Kaarten met begin- en eindtijd per buitenbedrijfstelling. |
| `performance-readonly` | Alleen-lezen tabel met prestatiegegevens uit Atrium. |
| `additional-remarks` | Vrije opmerkingen; de eerste lege regel wordt automatisch opgeruimd. |
| `default` | Kaarten per regel, kolommen zoals gedeclareerd. |

Eerder werd de variant geraden uit kolomnamen. Dat is bewust weg; raden betekende dat een
tweede formulier met dezelfde kolomnaam ongevraagd een andere weergave kreeg.

### `ember.bind` op een vraag

Prefill uit Atrium of uit de installatie. Gelezen door `collectEmberMeta`
(`src/pages/Forms/shared/prefill.jsx`) en verstuurd naar de prefill-route
(`api/src/routes/installations.ts`).

```json
"ember": {
  "bind": { "kind": "prefill", "key": "obj_adr_formatted", "mode": "once", "refreshable": true }
}
```

- `kind` zegt welke bron; `prefill` is de enige die vandaag bestaat.
- `key` is de sleutel in het prefill-antwoord; de server bepaalt wat die sleutel oplevert.
- `mode` `once` vult alleen een leeg veld, en laat wat de gebruiker zelf typte staan.
- `refreshable` bepaalt of de waarde bij een latere prefill-ronde opnieuw mag worden gezet.

### `ember.choices` op een vraag

Keuzelijst uit een gebonden bron in plaats van een vaste lijst.

```json
"ember": { "choices": { "key": "installatietypes", "mode": "list", "valueField": "code", "textField": "omschrijving" } }
```

### `ember.filter` naast een `bind`

Filtert een array-antwoord op een veld. `applyArrayFilter` (`prefill.jsx`) kijkt naar
`panelField` (of `field`) en `equals`.

### `ember.calculations` op survey-niveau

Een lijst rekenregels die mogen draaien, met de vragen die ze bewaken.

```json
"ember": { "calculations": [ { "id": "energy-supply-capacity", "watch": ["es_regels"] } ] }
```

De implementatie staat twee keer, en dat is opzettelijk:

- `src/pages/Forms/shared/calculations.jsx` voor het scherm, zodat de gebruiker de uitkomst
  direct ziet;
- `api/src/services/formCalculationsService.ts` als gezaghebbende berekening bij opslaan.

**Wijzig er nooit één zonder de andere.** Alleen de id's die in `ember.calculations` staan
worden gedraaid; een definitie die een onbekende id noemt, krijgt niets.

De rekenregel is domeinlogica en blijft code. **Welke vragen en kolommen die regel voedt is
declaratief**, met `fields`:

```json
"ember": { "calculations": [
  { "id": "energy-supply-capacity",
    "watch": ["accu_regels"],
    "fields": {
      "rows": "accu_regels",
      "capacityAh": "accu_capaciteit",
      "count": "accu_aantal",
      "requiredAh": "accu_benodigd"
    } }
] }
```

Wat een definitie niet noemt, valt terug op de namen van MAINT_BMI; die staan in
`src/pages/Forms/shared/calculationFields.js` en, voor de server, in
`api/src/services/formCalculationFields.ts`. Die twee lijsten moeten gelijk blijven en
`api/tests/calculationFields.test.ts` faalt zodra ze uit elkaar lopen.

Bij het publiceren wordt `fields` gecontroleerd: een sleutel die de berekening niet kent en
een naam die niet in de vragenlijst voorkomt, worden geweigerd. Een tweede
onderhoudsformulier met eigen kolomnamen vraagt daarmee geen wijziging in de gedeelde
runtime.

### `ember.capacityWarning` op een matrix

Wijst de twee kolommen aan die vergeleken moeten worden voor de waarschuwing
"accucapaciteit te laag": `requiredColumn` en `actualColumn`. De waarschuwing werkt op de
modelwaarden; hij hangt niet meer aan een DOM-tabel, want die tabel bestaat in deze runtime
niet.

### `ember.consistency` op survey-niveau

Regels die een antwoord tegen een ander antwoord houden. Geëvalueerd door
`evaluateConsistencyRules` (`src/pages/Forms/shared/validation.jsx`).

### `ember.groups` op een matrix

Bundelt kolommen onder een kop binnen een regelkaart:

```json
"ember": { "groups": [ { "id": "capaciteit", "label": "Capaciteit", "columns": ["es_aantal", "es_capaciteit_ah"] } ] }
```

### `ember.followUp` op een vraag

Hieruit ontstaan actiepunten. Gelezen door `api/src/services/followUpExtractor.ts`.

```json
"ember": {
  "followUp": {
    "mode": "matrix-rows",
    "kind": "workflow",
    "condition": { "column": "beoordeling", "equals": "Nee" },
    "category": "MAINTENANCE",
    "certificateImpact": "NONE",
    "itemCodeField": "code",
    "descriptionField": "opmerking",
    "workflowtitleField": "onderwerp",
    "priority": "NORMAL",
    "responsibility": "INTERN",
    "dueInDays": null
  }
}
```

- `kind` `workflow` levert een punt dat opgevolgd en beoordeeld moet worden; `report-only`
  levert een punt dat alleen in het rapport staat.
- `condition` bepaalt wanneer een punt ontstaat.
- De `*Field`-sleutels wijzen naar kolommen of vragen; hun waarde komt in het punt terecht.
- `priority` mag `LOW`, `NORMAL`, `HIGH` of `CRITICAL` zijn; leeg betekent `NORMAL`.
- `responsibility` mag `INTERN`, `KLANT`, `DERDE` of `ONBEPAALD` zijn; leeg betekent `INTERN`.
- `dueInDays` is een heel getal van 1 tot 365, of leeg. Leeg betekent geen deadline; de
  monteur geeft geen datum op.

De extractor negeert een waarde die hij niet kent, want stil gokken is erger dan de default.
Daarom controleert `validateSurveyJson` (`api/src/services/adminFormsService.ts`) deze drie
velden bij het publiceren en weigert een typefout. Dat is de enige plek waar zo'n fout
zichtbaar wordt; zonder die controle deed hij stil niets.

### `ember.report` op survey-niveau

Wat het PDF-rapport nodig heeft: `activeDisciplines` en `signaturePage`.

### `ember.inputMode` en `ember.enterKeyHint` op een vraag of kolom

Welk toetsenbord een telefoon opent. Standaard leidt het vraagtype: `number` wordt
`decimal`, `tel` wordt `tel`, de rest krijgt niets. Een definitie kan het overschrijven
zonder het type te veranderen, voor een tekstveld waar toch cijfers in horen.

## Wat de runtime zelf doet, en niet per formulier

- **Paginanavigatie.** `FormPageStepper` staat onder elke pagina met Vorige, Volgende,
  Opslaan en op de laatste pagina Indienen. De genummerde pills bovenin blijven bestaan om
  gericht te springen.
- **Fouten per veld.** Een veld dat is ingevuld en weer verlaten toont zijn eigen fout;
  een veld waar nog nooit in is getypt blijft stil tot Controleer of Indienen.
- **Conceptbehoud.** Antwoorden worden gedebounced naar IndexedDB geschreven
  (`src/pages/Forms/shared/draftStore.js`) onder `(form_instance_id, draft_rev)` en bij
  openen zichtbaar teruggezet. Alleen bij status `CONCEPT`.
- **Opslagconflict.** Bij een `draft_rev`-conflict worden de lokale antwoorden op de
  nieuwste revisie geschreven; het werk van de gebruiker wordt nooit weggegooid.
- **Keuzerijen** zijn een radiogroep met pijltjestoetsen, niet een serie schakelknoppen.
- **Een bestaand concept hervatten** wordt gemeld met datum en persoon, met een knop om
  alsnog een nieuw formulier te beginnen. Twee losse bezoeken delen dus niet stil één rij.
- **Focus.** Na een paginawissel gaat de focus naar het eerste veld van de nieuwe pagina, en
  de dialogen houden de focus vast en geven hem bij sluiten terug.
- **Regelkaarten en beoordelingsregels zijn gememoïseerd** op de inhoud van de rij. Typen in
  de ene regel hertekent de andere regels niet.

## Bij het toevoegen van een formulier

1. Schrijf de definitie; gebruik alleen ondersteunde vraagtypen en zet alles wat bijzonder
   is in `ember.*`.
2. Zet de fixture in `docs/fixtures/forms/` en dezelfde JSON in `SQL DB\Eigenschappen.sql`.
3. Draai `npm run fixtures:validate`; die vergelijkt fixture en seed en controleert de
   paginanamen.
4. Draai `npm run verify` voor lint, tests, alle architectuurvalidators en de build.
5. Publiceer de versie via de beheerroute, met een `change_summary`. Bij het publiceren
   worden de `ember.followUp`-waarden gecontroleerd.

Blijkt er iets nodig dat niet in `ember.*` past, dan is de juiste stap het uitbreiden van de
metadata en de gedeelde runtime; niet een formulier-specifieke uitzondering.
