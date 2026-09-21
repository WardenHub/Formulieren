# FormRunner: opvolgacties, pins en bewijs

Lokale implementatie; 10 september 2026. Niet gepubliceerd en geen live databasewijziging uitgevoerd.

## Gebruikersflow

1. Tijdens het invullen opent Opvolgacties de punten van de formulierketen. Antwoorden worden eerst opgeslagen zodat nieuwe bevindingen in de lijst kunnen verschijnen.
2. Bij een punt uit het huidige installatieformulier kiest de gebruiker Locatie bepalen. De bestaande tekeningviewer opent boven het formulier; antwoorden en formulierroute blijven behouden.
3. Een nieuwe pin krijgt de titel, toelichting en het type van het punt als beginwaarden. Een bestaande pin kan ook rechtstreeks worden gekoppeld. De pin blijft aan de exacte tekenversie gekoppeld.
4. Na opslaan en koppelen keert de gebruiker terug naar dezelfde puntenlijst of indiencontrole. Foto, Bestand en Bestaande formulierbijlage koppelen gebruiken dezelfde formulierdocumenten.
5. Indienen slaat eerst op en controleert opvolgacties. Een lopende bewijsbewerking blokkeert definitief indienen. De succesvolle indienbevestiging verdwijnt niet automatisch; de gebruiker kiest verder met opvolgacties, formulier bekijken of Gereed.

Punten uit een gekoppeld ouderformulier blijven herkenbaar zichtbaar; vanuit het huidige formulier zijn hun pins en bestanden alleen te bekijken. Dit verandert geen parent_instance_id, instance_title, instance_note of survey_json-contracten.

Algemene formulieren zonder installatie behouden hun opvolgacties. Installatietekeningen en formulierdocumentkoppeling worden daar niet aangeboden; deze bestaande API-routes zijn installatiegebonden.

## Betrouwbaarheid

- De panelen gebruiken ondoorzichtige Ember-surfaces in beide thema's, focusbeheer en een expliciete terugknop.
- Pin opslaan en pin koppelen blijven twee bestaande API-handelingen. Na een koppelprobleem behoudt de editor de opgeslagen pin-id en rowversion; opnieuw proberen maakt geen tweede pin.
- Is uploaden gelukt maar koppelen niet, dan blijft het bestand beschikbaar als bestaande formulierbijlage. De melding vraagt niet om opnieuw te uploaden.
- Bestaande bestandskoppelingen worden bij uitbreiding behouden. De API vervangt de verzameling transactioneel en bewaart rol, klantzichtbaarheid en oorspronkelijke auditmetadata van behouden koppelingen.
- Geen schemawijziging of ALTER-script nodig. De queryverbetering wordt onderdeel van de API zodra die apart wordt gepubliceerd.

## Validatie en open acceptatie

Gerichte tests dekken bestandsselectie, behoud van koppelingen, primaire aanduidingen, pin-savefouten en opnieuw proberen na een koppelprobleem. Daarnaast zijn frontendbuild, gerichte ESLint, API-typecheck, parenting/classificatietests en tekeningen/opvolgingvalidators gecontroleerd.

Dark/light-weergave, bijlagekeuze, terugkeer uit het dialoogvenster en de blijvende succesmelding zijn bekeken in een tijdelijk geïsoleerd testscherm met fictieve gegevens en de echte UI-componenten. Dit is geen volledige API- of PDF-integratietest.

De lokale ontwikkelomgeving was niet bereikbaar. Nog te accepteren met frontend en API gestart:

- Bevinding vaststellen, punten openen, pin op een echte PDF plaatsen, koppeling na heropenen terugzien.
- Bestaande pin koppelen, nieuwe foto uploaden en bestaand bestand aan meerdere punten koppelen.
- Indienen vanuit de puntencontrole, blijvende succesmelding zien en daarna bewijs opnieuw openen.
- Koppel- of uploadfout opnieuw proberen zonder dubbele pin of verloren bestaande bijlage.
- Een vervolgformulier controleren; punten van het ouderformulier blijven alleen ter inzage.

Publicatie blijft een afzonderlijke handeling van de product owner.

## Eén richting; tekening volgt het punt

Lokale wijziging, 17 september 2026. Niet gepubliceerd; geen schema- of API-wijziging.

De installatietab werkte omgekeerd aan de FormRunner. Daar plaatste je eerst een pin, sloeg je die op, en vulde je daarna in een tweede formulier met zeven velden een opvolgpunt in. Titel en omschrijving typte je feitelijk twee keer. Beide richtingen zijn nu hetzelfde: een bevinding is leidend, een pin is bewijs dat erbij hoort.

- De pin-editor heeft een schakelaar Hier een opvolgpunt van maken. Standaard aan bij Tekortkoming, uit bij Opmerking en Component geplaatst; de standaard beweegt mee met het type zolang de gebruiker de schakelaar niet zelf heeft aangeraakt. Bij opslaan ontstaan markering en punt in één handeling, met het label en de omschrijving van de pin.
- De schakelaar verschijnt alleen waar iemand zelf een bevinding vastlegt. Kom je vanuit een formulier om een pin bij een bestaand punt te zetten, dan is er al een punt; `canCreateFollowUp` is daar onwaar.
- Het losse aanmaakformulier in PinActions is vervallen. Wat blijft: gekoppelde opvolgingen tonen, ontkoppelen, een bestaande opvolging koppelen, en één knop Opvolgpunt maken van deze markering voor een markering die er al staat. Prioriteit, termijn, verantwoordelijke en klantzichtbaarheid stelt de behandelaar in de Monitor in; die velden bestaan daar al.
- Lukt de markering wel en het punt niet, dan zegt de melding dat en blijft de knop bij de markering over. Opnieuw prikken is nooit nodig.

Pins zonder punt blijven bestaan, want niet elke markering is werk. De tijdelijke vinkjes tijdens het invullen staan daar los van; die blijven op het toestel en verdwijnen bij indienen. Zie `checkedPoints.js`.

Een punt zonder pin is een volwaardig punt. Een algemene tekortkoming zoals een ontbrekend getekend PVE heeft geen plek op de tekening. `missingPointParts` meldt daarom geen ontbrekende locatie meer; stond dat er, dan zag elk algemeen punt er onaf uit en ging de invuller pinnen om van de melding af te komen. De knop heet nu Pin plaatsen en is een aanbod.

Het rechterpaneel van de tekeningtab was sticky maar onbegrensd; zodra editor, opvolgingen en pinlijst samen hoger werden dan het scherm zakten Opslaan en Annuleren onder de vouw. Het paneel scrollt nu zelf en de actieknoppen staan in een sticky voet.

Gecontroleerd: frontendbuild, 40 tests, alle elf validators en gerichte ESLint op de gewijzigde bestanden. Acceptatie in een draaiende omgeving staat nog open.

## Hoofdtekening en meerdere bewijsbestanden

Lokale wijziging, 18 september 2026. De databasemigratie is voorbereid maar niet uitgevoerd.

- Alleen PDF-documenten uit de documentsectie `doc_tekening` komen in de tekenviewer. Andere PDF-bijlagen worden niet meer als mogelijke tekening aangeboden.
- Een installatie krijgt één expliciete hoofdtekening. De FormRunner gebruikt daarna automatisch dezelfde PDF als het installatiedetail. Zolang er nog geen keuze is gemaakt, vraagt de FormRunner eenmalig welke tekening leidend is.
- Bij een vervangend document verhuist de hoofdtekeningstatus pas nadat het nieuwe bestand succesvol is opgeslagen. Actieve pins blijven op de oude revisie bewaard en kunnen na een voorbeeldcontrole naar de nieuwe revisie worden gekopieerd. Ember toont de oude pinposities boven op de nieuwe PDF en vergelijkt pagina-aantal en pagina-afmetingen. Afwijkingen vereisen een expliciete bevestiging; kopiëren wordt geblokkeerd als pins op niet-bestaande doelpagina's zouden belanden.
- Het kopiëren bewaart de oorspronkelijke pins, neemt koppelingen met opvolgacties mee en is herhaalbaar zonder dubbele pins. Historische pins worden niet naar een nieuwe revisie gekopieerd. `Component geplaatst` wordt niet meer automatisch historisch bij het uploaden van een vervanging; die status hoort bij de latere, bewuste verwerking van de tekenrevisie.
- De losse knop `Passend maken` is uit beide viewers verwijderd. Schermvullend tonen met het pijlenicoon blijft de enige aparte weergaveactie; zo staan er geen twee knoppen met vrijwel dezelfde verwachting.
- Pin, Foto en Bestanden zijn compacte acties met Ember-iconen. Meerdere nieuwe bestanden kunnen in één selectie worden toegevoegd. Ook meerdere al aanwezige formulierbijlagen kunnen in één handeling aan dezelfde opvolgactie worden gekoppeld.

De schemawaarheid staat in `SQL DB/tabel-definities.sql`. De idempotente migratie en read-backcontrole staan in `SQL DB/alter/2026-09-18-primary-installation-drawing.sql` en `SQL DB/alter/verify-2026-09-18-primary-installation-drawing.sql`. Publicatie en uitvoering blijven afzonderlijke handelingen.

## Richting voor de revisiewizard en bedrijfsstempels

Ontwerpbesluit, 18 september 2026. Dit beschrijft de volgende bouwstap; er is nog geen rol, revisiesessie, stempel of productieconfiguratie toegevoegd.

### Rustige tekeningweergave voor iedereen

De bestaande tekeningtab blijft beschikbaar voor gebruikers die installatiedocumenten mogen bekijken. Zij kunnen de actuele tekening, pins en gekoppelde opvolgacties blijven gebruiken zonder met een revisieproces te worden geconfronteerd. De gewone pinlijst wordt een optionele navigatielade. De tekening blijft het primaire werkvlak, met filters op type en status, vorige en volgende pin, automatisch naar de juiste pagina gaan en de gekozen pin in beeld centreren.

De uitleg van het revisieproces staat niet blijvend in beeld. Een geanimeerde vraagtekenknop opent een compact uitlegvenster met het doel, de stappen en het moment waarop wijzigingen definitief worden. Dit hergebruikt het bestaande Ember-patroon van `CircleHelpIcon` en de huidige tekeningenhelp.

### Tekenaar als afzonderlijke bevoegdheid

Alleen een nieuwe rol `tekenaar` krijgt de actie `Revisie verwerken`. De rol is uitsluitend de toegangspoort tot de revisiewizard en is geen algemene document- of stempelbevoegdheid. De rol ligt boven op normale leestoegang en vervangt de rol `gebruiker` niet. `admin` mag de wizard voor ondersteuning eveneens openen. Gewone gebruikers zien de actie en de wizard niet.

De beveiliging moet in de hele keten gelijk zijn:

1. Entra-app-rol `Ember.Tekenaar` en een beheerde Entra-groep voor tekenaars.
2. Vertaling naar de interne rol `tekenaar` in `authMiddleware.ts`, zowel voor app-rolclaims als de bestaande Graph-groepsfallback.
3. Servercontrole met `requireRole("admin", "tekenaar")` op iedere muterende revisiesessie- en revisieafrondroute. Alleen een verborgen knop is geen beveiligingsgrens.
4. De frontend gebruikt dezelfde rol uitsluitend om de revisieactie en revisiesessie wel of niet te tonen.
5. Een roltest controleert toegestane en geweigerde API-aanroepen. Een UI-test controleert dat de gewone tekeningweergave voor andere rollen intact blijft.

De Entra-groep-id en app-registratiewijziging mogen niet worden gegokt. Ze worden pas ingevuld en uitgevoerd nadat de echte tenantobjecten read-only zijn gecontroleerd en een afzonderlijk wijzigingsplan is goedgekeurd.

### Begeleide verwerking van componentpins

Een revisiesessie bevriest de relevante actieve pins van het type `COMPONENT_PLACED` op het moment dat de tekenaar start. De wizard verwerkt die pins een voor een op de tekening:

1. Ember opent automatisch de juiste pagina en centreert de pin.
2. De tekenaar markeert het component als verwerkt, nog uit te zoeken of niet van toepassing en kan een korte notitie vastleggen.
3. De volgende pin komt direct in beeld. Een voortgangsindicator toont verwerkt, resterend en overgeslagen.
4. Aan het einde volgt een overzicht van open beslissingen. De tekenaar kan terug naar iedere pin.
5. Daarna uploadt de tekenaar de bijgewerkte PDF als nieuwe documentversie en bekijkt Ember de oude pinposities als voorbeeld boven op die PDF.
6. Pas bij de definitieve afronding worden de in deze sessie verwerkte componentpins historisch. Afbreken of later doorgaan verandert de bestaande pins niet.

Een sessie hoort centraal te worden opgeslagen, niet alleen in de browser. Daarmee kan een tekenaar veilig later doorgaan en ontstaat een controleerbaar verband tussen bronrevisie, verwerkte pins, doelrevisie en afronding.

### Stempel als gecontroleerde eindstap

De officiële Adobe-set `stempels-Wardenburg v0.1.pdf`, revisie 1.2, bevat zes zichtbare stempels: `Calculatie`, `Gecontroleerd`, `Ingetrokken`, `Opdracht`, `Uitgifte` en `Vervallen`. Elke stempel bevat datum, naam en functie. De eerste PDF-pagina is technisch leeg; de zes daaropvolgende pagina's bevatten de zichtbare stempels.

Stempelen is een algemene documenthandeling en vereist niet de rol `tekenaar`. Projectleiders, werkvoorbereiders en andere gebruikers met bestaande toegang tot installatiedocumenten kunnen een PDF stempelen. De aanvullende functiescheiding geldt alleen voor `Gecontroleerd`: de server weigert die stempel wanneer de huidige gebruiker de oorspronkelijke uploader van deze documentversie is. Nieuwe uploads worden op de stabiele Entra-gebruiker-id vergeleken; e-mail en naam blijven alleen als compatibiliteitscontrole voor oudere uploadregistraties beschikbaar.

In Ember wordt een stempel niet alleen als afbeelding in een PDF gebrand. De handeling bewaart ook gestructureerd:

- stempeltype;
- bronbestand en nieuw resultaatbestand;
- pagina en genormaliseerde positie;
- gebruiker-id, weergegeven naam en functie op dat moment;
- serverdatum en tijd;
- eventueel controlebesluit en toelichting.

De functie komt uit Microsoft Entra via de Graph-eigenschap `jobTitle`. Ember leest die waarde server-side voor de ingelogde gebruiker en bewaart bij iedere stempel een snapshot. Een latere functiewijziging verandert bestaande stempels daardoor niet. Ontbreekt `jobTitle` in Entra, dan blokkeert Ember het definitief plaatsen met een duidelijke melding dat de functie eerst in Microsoft 365 moet worden aangevuld; de stempel gebruikt geen vrij invulveld.

Daarna wordt uit precies die gegevens de zichtbare stempel op de door de gebruiker gekozen positie en pagina in de PDF opgebouwd. De gebruiker kiest eerst het stempeltype en klikt daarna in een PDF-voorbeeld op de gewenste plek. Voor bevestigen ziet hij de echte afmetingen en kan hij de positie nog aanpassen. Zo blijven het documentbeeld en het auditspoor met elkaar in overeenstemming. Ember gebruikt de zes pagina's uit het officiële Wardenburg-pakket rechtstreeks als sjabloon en vult daar server-side de actuele datum, naam en Entra-functie op in; oude voorbeeldwaarden uit het pakket worden niet hergebruikt.

Het oorspronkelijke PDF-bestand blijft onveranderlijk bewaard. Ember maakt een nieuwe fysieke bestandsversie met de stempel en houdt de keten van bronbestand naar gestempelde versie bij. Daardoor blijft herstel mogelijk en blijft voor de regel `Gecontroleerd` bekend wie het document oorspronkelijk uploadde, ook nadat andere stempels zijn toegevoegd.
