# 🔥 Ember

![Status: proof of concept](https://img.shields.io/badge/status-proof%20of%20concept-amber?style=flat-square)
[![GitHub Actions: Verify](https://github.com/WardenHub/Formulieren/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/WardenHub/Formulieren/actions/workflows/verify.yml)
[![GitHub: Issues gemonitord](https://img.shields.io/badge/GitHub-Issues%20gemonitord-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/WardenHub/Formulieren/issues)
![Node.js 24](https://img.shields.io/badge/Node.js-24-339933?style=flat-square&logo=nodedotjs&logoColor=white)

[🐛 Probleem melden](https://github.com/WardenHub/Formulieren/issues/new) · [💡 Idee delen](https://github.com/WardenHub/Formulieren/issues/new) · [📖 Runtimeconventies](docs/ember-form-runtime-conventions.md)

**Ember is het formulierenplatform van Wardenburg voor het vastleggen, opvolgen en rapporteren van werkzaamheden aan beveiligingsinstallaties.** Het doel is om formulieren zo efficiënt mogelijk in te vullen, met de juiste informatie bij de hand en zo min mogelijk dubbel werk.

Het platform brengt formulieren, installatiegegevens, documenten, bevindingen en beoordeling bij elkaar. Gegevens uit Syntess Atrium en andere gekoppelde bronnen geven context aan het werk; de gebruiker legt de uitvoering en bevindingen vast in Ember.

Ember is in ontwikkeling als proof of concept. Deze repository bevat de webapplicatie en de API. Toegang is ingericht voor interne gebruikers; een afzonderlijke omgeving voor klanten en andere externe partijen is nog niet uitgewerkt.

## 📋 Wat je met Ember kunt doen

- **Formulieren invullen en hervatten.** Werken met vooringevulde gegevens, berekeningen, veldvalidatie, conceptopslag en versiegebonden formulieren.
- **Installaties raadplegen.** Installaties vinden via een overzicht of kaart en de bijbehorende gegevens, formulieren en documenten openen.
- **Bevindingen opvolgen.** Actiepunten uit formulierantwoorden laten ontstaan, punten vastleggen en opvolgen, en bij installatiegebonden formulieren foto's, bestanden en locaties op tekeningen koppelen.
- **Formulieren beoordelen.** Via de Monitor de voortgang, samenhang tussen vervolgformulieren en voorwaarden voor afronding bekijken en beheren.
- **Rapporten maken.** Ingevulde formulieren omzetten naar PDF-rapporten met de bijbehorende rapportopmaak en ondertekening.
- **Certificering en inspecties beheren.** Certificaten, inspectiedossiers en bijbehorende eisen in de installatiecontext samenbrengen.
- **Feedback geven.** Ervaringen, problemen en verbetervoorstellen vanuit de applicatie melden en de status en beheerreactie teruglezen.

Een gebruikelijke route is: installatie of formulier kiezen, een concept invullen, bevindingen aanvullen, indienen en beoordelen. Actiepunten kunnen al tijdens het opslaan van een concept ontstaan. Vanuit zo'n punt kan de gebruiker naar een installatietekening om een markering te plaatsen en daarna terugkeren naar het formulier.

## 🧩 Eén gedeelde formulierruntime

Een nieuw formulier wordt beschreven als een declaratieve definitie in `survey_json`. Er komt geen aparte React-pagina per formulier. De gedeelde runtime verzorgt het invullen; formulierspecifiek gedrag wordt vastgelegd in `ember.*`-metadata, bijvoorbeeld voor voorinvulling, berekeningen, weergave en het ontstaan van actiepunten.

Belangrijke uitgangspunten:

- Gebruiksgemak, herkenbare bediening en ondersteuning voor lichte en donkere weergave.
- Zo veel mogelijk dezelfde logica voor de normale runner en de ontwikkelpreview.
- Formulierversies en rapporten blijven herleidbaar; gepubliceerde definities worden als nieuwe versie uitgebracht.
- `instance_title`, `instance_note` en `parent_instance_id` horen bij de formulierinstance. Titel en notitie worden niet in `survey_json` opgeslagen.
- De server bepaalt toegang en berekende waarden; een schermcontrole vervangt geen API-controle.

Zie [de conventies van de formulierruntime](docs/ember-form-runtime-conventions.md) voor de metadata, ondersteunde vraagtypen en werkwijze bij nieuwe formulieren. De repository bevat ook [formulierfixtures](docs/fixtures/forms/README.md), waaronder het onderhoudsrapport BMI.

## 🛠️ Techniek en indeling

| Onderdeel | Invulling |
| --- | --- |
| Webapplicatie | React, Vite en SurveyJS met een eigen gedeelde Ember-renderer |
| API | Node.js, Express en TypeScript; entrypoint `api/src/server.ts` |
| Identiteit en toegang | Microsoft Entra ID; authenticatie en rollen via de API-middleware |
| Opslag | Azure SQL en Azure Blob Storage |
| Tekeningen en kaart | PDF.js en Leaflet |
| PDF-rapportage | HTML-rapportopmaak en Playwright |
| Hosting | Azure Static Web Apps en Azure App Service |

De belangrijkste mappen, gerekend vanaf deze repository:

```text
src/                  Webapplicatie, schermen en gedeelde componenten
src/pages/Forms/       Formulierrunner en gedeelde runtime
api/src/              API-routes, controllers, services en databasequeries
api/tests/            API-tests
docs/                 Runtimeconventies, architectuur en formulierfixtures
scripts/              Ontwikkelhulpmiddelen en architectuurvalidators
tests/                Frontendtests en visuele testschermen
.github/workflows/    Validatie en afzonderlijke deploymentworkflows
```

In de volledige Ember-werkmap staat deze repository onder `codebase/Formulieren/`. De databasebronbestanden staan daarbuiten in `SQL DB/tabel-definities.sql` en `SQL DB/Eigenschappen.sql`; migraties staan in `SQL DB/alter/`. Een losse GitHub-checkout bevat deze externe bestanden niet.

## 💻 Lokaal ontwikkelen

Gebruik **Node.js 24** en npm. Voor een werkende omgeving zijn daarnaast de lokaal ingerichte configuratie, toegang tot de benodigde diensten en de database nodig. Alleen de repository installeren levert geen zelfstandig ingerichte Ember-omgeving op. Bewaar geheimen buiten Git.

Installeer de afhankelijkheden vanuit de repositoryroot:

```sh
npm ci
npm --prefix api ci
```

Start de frontend en API in afzonderlijke terminals:

```sh
npm run dev
```

```sh
npm --prefix api run dev
```

De API gebruikt standaard poort `8080`. De ontwikkelscripts verzorgen waar nodig aanvullende voorbereiding, waaronder de browser die de API voor PDF-rapportage gebruikt.

## ✅ Wijzigingen controleren

Voer vanuit de repositoryroot de controles uit:

```sh
npm run verify
npm --prefix api run verify
```

De frontendcontrole omvat lint, tests, architectuurvalidators en een build. De API-controle omvat TypeScript-controle en tests. De [Verify-workflow](.github/workflows/verify.yml) voert deze controles ook uit bij pushes en pull requests naar `main`.

Een deel van de validators gebruikt bronnen buiten de repository:

- `EMBER_SQL_DB` wijst naar de map met de SQL-bronbestanden. Zonder die map slaan de betrokken validators hun controle over met een melding.
- `EMBER_EXTERNAL_ARTIFACTS` wijst naar aanvullende Atrium Reader- en Fabric-artifacten. Ontbrekende externe onderdelen worden gemeld en overgeslagen.
- `EMBER_EXTERNAL_STRICT=1` maakt ontbrekende vereiste externe bronnen een fout.

Een geslaagde controle met overgeslagen onderdelen bewijst die onderdelen niet. Controleer bij wijzigingen aan invullen, opslaan of beoordelen ook de echte gebruikersroute; statische controles alleen zijn daarvoor onvoldoende. Databasewijzigingen en publicatie worden afzonderlijk uitgevoerd volgens de projectafspraken.

## 💬 Feedback en GitHub Issues

**De [GitHub Issues](https://github.com/WardenHub/Formulieren/issues) worden gemonitord.** Gebruik ze om reproduceerbare fouten, technische verbeteringen en voorstellen voor het platform vast te leggen. Controleer eerst of er al een passend issue bestaat en vul dat zo nodig aan.

Vermeld bij een probleem wat je wilde doen, welke stappen je nam, wat je verwachtte en wat er werkelijk gebeurde. Voeg waar relevant de browser en een schermafbeelding toe, zonder persoonsgegevens, klantgegevens of geheimen.

Gebruikers kunnen ook rechtstreeks **Feedback** in Ember gebruiken. Die route kan de melding voorzien van pagina-, installatie- en formuliercontext. Beheerders kunnen de melding beoordelen, de status bijwerken en een reactie plaatsen die de gebruiker in Ember terugziet.

### Mogelijke koppeling tussen feedback en issues

Er is momenteel geen automatische koppeling tussen Ember-feedback en GitHub Issues. Een richting om samen uit te werken is:

1. De gebruiker meldt iets in Ember en blijft daar de terugkoppeling volgen.
2. Een beheerder beoordeelt de melding en koppelt deze aan een bestaand issue of maakt een nieuw issue met een gecontroleerde samenvatting.
3. Meerdere feedbackmeldingen kunnen naar hetzelfde issue verwijzen, zodat één probleem één ontwikkeltraject krijgt.
4. Ember toont de voortgang en een begrijpelijke terugkoppeling; technische discussie blijft in GitHub.

Dit is een voorstel, geen beschikbare functie. Nog te bepalen zijn welke gegevens gedeeld mogen worden, wie de koppeling beheert en hoe een opgelost issue wordt vertaald naar een wijziging die daadwerkelijk voor de gebruiker beschikbaar is.
