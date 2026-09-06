# Ember formulierfixtures

Deze map bevat bewust geselecteerde formulierdefinities die na een lege POC-reset reproduceerbaar moeten kunnen worden teruggezet.

## MAINT_BMI versie 3.0

- Bron: `ember-sql-db`, geëxporteerd op 5 september 2026 uit de actieve versie.
- Formulier: `MAINT_BMI`; Rapport van Onderhoud BMI.
- SurveyJS: 8 pagina's en 36 elementen op het hoogste paginaniveau.
- Fixture SHA-256: `7F86A9028A118A7F27D6C1CAF41C775C68F69D3CA10CFE20D616F55C14A81B2E`.
- Survey JSON UTF-8 SHA-256: `9C3C9D8BAC113577AB009AD4C328CD52A27D5C4CF55197AF83065E336578CF17`.
- De fixture bevat geen formulierinstanties, antwoorden, opvolgacties of bestanden.
- `instance_title` en `instance_note` zijn niet in `survey_json` opgenomen.

Versie 3.0 vervangt de eerdere fixture van versie 1.0. Ten opzichte daarvan bevat de
definitie `ember.layout` per matrix, `ember.calculations` voor de beschikbaarheidsuren,
`ember.consistency` op de prestatie-eisen, en `hele_dag` als eigen kolom bij de perioden
niet beschikbaar. Een fixture volgt altijd de actieve versie; oudere versies blijven in de
database staan en worden nooit teruggeschreven.

`Eigenschappen.sql` bevat dezelfde formulierdefinitie en SurveyJS-versie als actieve seed. De bronhashes staan bij het seedblok, zodat een reset geen handmatige formulierimport nodig heeft.

Valideer alle fixtures vanuit de repositoryroot met:

```powershell
npm run fixtures:validate
```
