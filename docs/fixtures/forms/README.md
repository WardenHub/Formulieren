# Ember formulierfixtures

Deze map bevat bewust geselecteerde formulierdefinities die na een lege POC-reset reproduceerbaar moeten kunnen worden teruggezet.

## MAINT_BMI versie 1.0

- Bron: `ember-sql-db`, geëxporteerd op 21 augustus 2026.
- Formulier: `MAINT_BMI`; Rapport van Onderhoud BMI.
- SurveyJS: 8 pagina's en 36 elementen op het hoogste paginaniveau.
- Fixture SHA-256: `49BD22CDE9D456A6E1E0E772CB5E2A24A398E260CBE584A35F9C70AEA2A6FF6A`.
- Survey JSON UTF-8 SHA-256: `B2238EA0A60675DB81D3337204A31A1E180E09C250CB0315B5142B3CA3C1490D`.
- De fixture bevat geen formulierinstanties, antwoorden, opvolgacties of bestanden.
- `instance_title` en `instance_note` zijn niet in `survey_json` opgenomen.

`Eigenschappen.sql` bevat dezelfde formulierdefinitie en SurveyJS-versie als actieve seed. De bronhashes staan bij het seedblok, zodat een reset geen handmatige formulierimport nodig heeft.

Valideer alle fixtures vanuit de repositoryroot met:

```powershell
npm run fixtures:validate
```
