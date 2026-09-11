# Ember Offline POC

## Doel

Ember Offline is een laptop-first aanvulling op Ember waarmee gebruikers formulieren lokaal kunnen voorbereiden en invullen wanneer er tijdelijk geen internetverbinding beschikbaar is.

De POC richt zich bewust op een minimale maar bruikbare keten:

- formulieren online klaarzetten;
- formulieren lokaal downloaden;
- formulieren offline invullen;
- lokale voortgang bewaren;
- later weer online afronden in gewone Ember.

De POC doet dus nadrukkelijk nog niet alles offline.

## Productkader

### Primair platform

- Windows laptop is het POC-doel;
- iPad blijft een latere doelrichting;
- architectuur moet herbruikbaar blijven voor een latere tabletvariant.

### Vorm

- Tauri desktop-app;
- uitrol via Intune;
- installer moet ook silent install ondersteunen;
- geen losse extra programma-installaties voor eindgebruikers.

### Naam

- productnaam: `Ember Offline`

## Kernbesluit

Nieuwe formulieren worden in de POC niet offline aangemaakt.

De online Ember-omgeving blijft leidend voor:

- nieuw formulier aanmaken;
- vervolgformulier aanmaken;
- pre-flight checks;
- server-side aanmaaklogica;
- bestaande validaties rond formulierstart.

Ember Offline haalt alleen formulieren op die online al zijn klaargezet.

Dit voorkomt dubbele waarheid in aanmaaklogica en houdt de POC regressie-veilig.

## Gewenste gebruikersflow

### 1. Online voorbereiden

Gebruiker werkt online in gewone Ember of in Ember Offline terwijl er verbinding is.

Mogelijke flow:

1. Open installatie in Ember.
2. Maak nieuw formulier of vervolgformulier aan.
3. Kies `Ember Offline`.
4. Kies welke documenttypes lokaal mee moeten.
5. Download het offline package.
6. Open dit package in Ember Offline.

### 2. Offline werken

In Ember Offline kan de gebruiker:

- lokale formulieren openen;
- vragen invullen in dezelfde logische stijl als online;
- tussentijds lokaal opslaan;
- zien welke formulieren nog in bewerking zijn;
- formulieren markeren als lokaal afgerond.

### 3. Terug online afronden

Wanneer de gebruiker weer online is:

- Ember Offline toont welke formulieren klaar staan;
- gebruiker kiest `Ga online afronden`;
- Ember Offline opent de juiste online Ember-pagina;
- online worden laatste controles, eventuele bijlagen en definitieve indiening gedaan.

## Scope POC

### Wel in scope

- online formulieren ophalen die al bestaan;
- online formulieren lokaal klaarzetten;
- lokaal antwoorden opslaan;
- lokaal voortgang tonen;
- conflictmelding bij gewijzigde online versie;
- knop om terug te gaan naar online Ember;
- bulk overzicht van formulieren die online afronding nodig hebben;
- optioneel geselecteerde installatiebestanden lokaal beschikbaar maken.

### Niet in scope

- volledig offline formulier aanmaken;
- volledig offline vervolgformulier aanmaken;
- offline bijlagen uploaden;
- offline webcam of foto-opname;
- offline definitief indienen;
- server-side workflowafhandeling volledig vanuit offline app;
- zware conflictmerge op veldniveau.

## Klaarzetten voor Ember Offline

### Aanmaakroute

De voorkeur is om de aanmaak in gewone Ember te houden en daarna een actie toe te voegen:

- `Ember Offline`

Deze actie kan op termijn op twee plekken bruikbaar zijn:

- vanuit installatie > formulieren;
- vanuit de net aangemaakte formulierflow.

### Bestandsprompt

Bij het offline klaarzetten opent een prompt waarin de gebruiker documenttypes kiest die lokaal beschikbaar mogen worden gemaakt.

Gedrag:

- gebruiker kiest documenttypes;
- per gekozen type worden alle actuele bestanden van dat type meegenomen;
- historische bestanden worden niet meegenomen;
- kritieke documenttypes worden standaard visueel benadrukt.

Voor de POC is het verstandig om hier een duidelijke maar kleine selectie te hanteren.

Voorbeeld van kritieke types:

- PvE;
- tekeningen;
- blokschema;
- certificaat;
- stuurfunctiematrix;
- revisietekening.

De uiteindelijke lijst moet aansluiten op de bestaande documenttypes in Ember.

## Lokale statussen

De offline app moet lokale statusvoering hebben die begrijpelijk is voor eindgebruikers.

Voorgestelde statussen:

- `Klaargezet`
- `Lokaal in bewerking`
- `Lokaal afgerond`
- `Wacht op online afronden`
- `Gesynchroniseerd`
- `Conflict`

Gebruikerstaal bij de laatste stap:

- `Ik heb lokaal mijn werk gedaan`
- `Laatste stap online afronden`

## Conflictgedrag

Wanneer de online versie gewijzigd is sinds het lokaal klaarzetten:

- toon duidelijke waarschuwing;
- toon door wie en wanneer de online wijziging is gedaan;
- geef keuze:
  - online versie behouden;
  - offline werk alsnog overschrijven;
  - later beslissen.

Voor de POC is dit voldoende; er hoeft nog geen complexe veld-merge te komen.

## Lokale opslag

Voorkeursrichting voor de POC:

- app-data map per Windows-gebruiker;
- SQLite voor metadata en antwoorden;
- losse werkmappen voor form packages en optionele installatiebestanden.

Indicatieve structuur:

- `forms.db`
- `packages/<local_form_id>/form-package.json`
- `packages/<local_form_id>/survey.json`
- `packages/<local_form_id>/context.json`
- `packages/<local_form_id>/documents/...`

De app moet ook een knop hebben:

- `Open offline werkmap`

zodat de gebruiker lokaal beschikbare installatiebestanden kan bekijken.

## Authenticatie

Uitgangspunt:

- SSO blijft nodig;
- app draait op Intune-beheerde apparaten;
- offline werken mag niet blokkeren op continue herauthenticatie.

Daarom:

- online synchroniseren alleen wanneer sessie geldig is;
- offline ingevulde data lokaal beschikbaar houden zonder nieuwe login;
- bij online terugkeer pas opnieuw tegen de API praten;
- als login verlopen is, dan eerst opnieuw aanmelden en daarna sync hervatten.

## UX-richtlijnen

### In Ember online

Belangrijke acties:

- `Nieuw formulier`
- `Vervolgformulier`
- `Klaarzetten voor Ember Offline`

Bij offline klaarzetten:

- compacte bestandstype-keuze;
- kritieke types subtiel uitgelicht;
- heldere samenvatting van wat lokaal wordt meegenomen.

### In Ember Offline

Belangrijke schermen:

1. `Klaarzetten`
2. `Offline werkvoorraad`
3. `Lokaal afgerond`
4. `Synchronisatie`

Belangrijke acties:

- `Synchroniseren`
- `Open offline werkmap`
- `Ga online afronden`
- `Open in Ember`

De knop voor online afronden moet visueel duidelijk zijn en in Ember-stijl blijven.

## Technische architectuur

### Gedeelde logica

De bestaande forms-architectuur moet zo veel mogelijk gedeeld blijven.

Herbruikbare delen:

- survey json;
- runtime-opbouw;
- navigatielogica;
- lokale validatie waar mogelijk;
- bestaande weergavepatronen voor form pages.

### Offline shell

Nieuwe verantwoordelijkheden van Ember Offline:

- lokale opslag;
- syncbeheer;
- online/offline status;
- conflictstatus;
- openen van online Ember op de juiste route.

### Bewuste grens

De offline app moet niet proberen de complete online workflow-engine opnieuw te bouwen.

## POC-backendbehoefte

Waarschijnlijk nodig:

- endpoint om formulieren voor offline klaarzetten op te halen;
- endpoint om lokale packages samen te stellen;
- endpoint om syncstatus of revision-info te vergelijken;
- endpoint om lokaal werk terug te melden of te uploaden;
- endpoint om per formulier te bepalen of conflict bestaat.

Het is verstandig om de package-opbouw server-side te doen, zodat online en offline dezelfde brondata gebruiken.

## Risico's en aandachtspunten

### Belangrijkste risico's

- dubbele aanmaaklogica als we toch offline aanmaak toestaan;
- te veel documentdownload per installatie;
- onduidelijke conflictmeldingen;
- offline runner die afwijkt van online runner;
- te brede POC waardoor stabiliteit daalt.

### Beheersing

- aanmaak online houden;
- offline bijlagen uit scope houden;
- documenttypes gericht laten kiezen;
- sync en conflict klein houden;
- shared runner-logica hergebruiken.

## Huidige voortgang

Deze delen staan inmiddels in de online Ember-kant:

- backendroute voor offline package-opbouw;
- frontend actie per formulierregel;
- modal voor documenttype-keuze;
- download van json package.

Nog niet gebouwd:

- Ember Offline desktop shell;
- lokale package-opslag;
- offline runner;
- terugschrijven van antwoorden.

## Aanbevolen eerste implementatiefase

### Fase 1

- Ember Offline app met lokale lijst;
- json package importeren;
- lokale status `Klaargezet`;
- offline invullen met minimale runner;
- knop `Ga online afronden`.

### Fase 2

- conflictcontrole;
- bulk terug naar online;
- betere statusoverzichten;
- slim herladen van reeds gedownloade context.

### Fase 3

- optionele rijkere sync;
- tablet-geschikte shell;
- meer documentintelligentie.

## Open ontwerpvragen

Deze punten moeten we nog concretiseren voor implementatie:

- welke documenttypes gelden als `kritiek`;
- waar precies de actie `Klaarzetten voor Ember Offline` in de online UI komt;
- hoe lokale form ids en online form ids exact gekoppeld worden;
- of een lokaal afgerond formulier online alleen opent, of ook direct conceptdata terugschrijft;
- of de eerste POC al antwoorden terug uploadt, of alleen de gebruiker terugstuurt naar online Ember.

## Aanbeveling

Voor de eerste POC is de veiligste en snelste route:

- online aanmaken in Ember;
- offline invullen in Ember Offline;
- online afronden in Ember;
- geen offline bijlagen;
- gekozen installatiebestanden optioneel lokaal meenemen per documenttype.

Dat levert een bruikbare offline keten op zonder de bestaande Ember-runtime en workflow-logica onnodig te dupliceren.
