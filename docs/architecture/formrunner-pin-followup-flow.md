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
