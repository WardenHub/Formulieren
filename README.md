# Ember Offline

Ember Offline is de Tauri-desktopapp voor formulieren die eerst online lokaal worden klaargezet en daarna zonder internet kunnen worden ingevuld.

## Wat dit skelet nu al doet

- Ember Offline packages importeren vanuit json;
- lokaal opslaan via IndexedDB;
- offline werkvoorraad tonen;
- zoeken en filteren in de lokale werkvoorraad;
- lokale status van formulieren beheren;
- lokale overdrachtsnotities bewaren;
- lokale checklist bijhouden voor online afronding;
- een eerste echte offline SurveyJS-runner openen;
- antwoorden lokaal autosaven in IndexedDB;
- teruglinken naar online Ember voor afronding;
- documentselectie en runner-context tonen.
- met Microsoft aanmelden via de bestaande Ember API;
- installaties zoeken en bestaande, nieuwe of vervolgformulieren lokaal klaarzetten.

## Vervolgstappen

- sync terug naar Ember API;
- conflictcontrole;
- lokale werkmap en optionele documentdownload van installatiebestanden.

## Verwachte commando's zodra dependencies zijn geinstalleerd

```powershell
npm install
npm run tauri dev
```

`npm run tauri dev` start Vite zelf; een tweede terminal met `npm run dev` is dus niet nodig.

## Belangrijke notitie

De lokale werkvoorraad wordt op dit moment in IndexedDB bewaard. Zie [aanmelden-en-online-ophalen.md](docs/aanmelden-en-online-ophalen.md) voor de Entra-configuratie en een gerichte testprocedure.
