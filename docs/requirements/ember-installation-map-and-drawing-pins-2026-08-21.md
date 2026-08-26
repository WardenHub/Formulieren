# Ember installatiekaart en tekenlocaties

Datum: 21 augustus 2026
Status: bindende product-ownerrequirements voor fases E en F
Bron: functioneel product-ownerdocument `Ember; kaartweergave installaties en pins op tekeningen`

## Geografische installatiekaart

1. Leaflet is de geografische kaartcomponent van Ember.
2. Latitude en longitude komen uit `AT_ADRES` via het object van de installatie. Ember geocodeert adressen niet.
3. Installatiedetail bevat een kleine geografische visualisatie als locatiecontext.
4. De sectie Installaties bevat daarnaast een grote operationele kaart.
5. De kaart toont vooral waar aandacht nodig is en is niet alleen een locatieweergave.
6. Operationele status gebruikt minimaal generieke logica voor open en verlopen opvolgingen, af te handelen formulieren, missende verplichte documenten, contractstatus en diensten, certificaatstatus en inspectiestatus.
7. Lijst, kaart, formuliermonitor-samenvatting en installatiedetail gebruiken hetzelfde herbruikbare `InstallationOperationalSummary`-readmodel.
8. Filters staan aan of nabij de linkerzijde en sluiten aan op de bestaande Ember-designconventies.
9. Na filterwijzigingen fit Leaflet automatisch op de zichtbare markers.
10. De kaart ondersteunt expliciet nul resultaten, één locatie, heel Nederland en meerdere installaties op hetzelfde object of adres.
11. Installaties met dezelfde locatie worden bruikbaar gegroepeerd op object of adres en bieden installatiedrilldown.
12. De kaart is een signalerings- en navigatielaag. Volledige follow-upafhandeling hoort niet in een popup.
13. Een popup toont compact relatie of object, adres, installaties, aandachtstatus, open actieaantallen, formulieren, missende documenten, contract-, certificaat- en inspectie-indicatoren en links naar installatiedetail.
14. De primaire drilldown is installatiedetail. Bij een aandachtspunt mag een directe link naar de tab Opvolgingen worden aangeboden.
15. Installaties zonder geldige coördinaten blijven in de lijst, krijgen geen marker, zijn via een datakwaliteitsfilter zichtbaar en worden niet automatisch gegeocodeerd.

## PDF-tekeningen en pins

16. Een tekening is voor deze functionaliteit uitsluitend een PDF-bestand.
17. Pins gebruiken het bestaande Ember-document- en `StoredFile`-fundament. Er komt geen tweede bestandssysteem en er worden geen PDF-kopieën voor pinfunctionaliteit gemaakt.
18. Een PDF kan meerdere pagina's hebben.
19. Een gebruiker kan op een specifieke PDF-pagina een pin plaatsen.
20. Een pin bewaart minimaal de documentreferentie, het paginanummer, genormaliseerde x en y, een label, een optionele omschrijving en auditvelden.
21. Genormaliseerde x en y liggen tussen 0 en 1. Viewportpixels worden niet opgeslagen.
22. De inhoudelijke positie blijft gelijk bij zoomen, resizen, verschillende schermformaten en viewerwijzigingen.
23. De viewer houdt waar ondersteund rekening met PDF-paginarotatie en cropbox.
24. Eén tekening kan meerdere pins bevatten.
25. Een pin hoeft niet aan een opvolgactie gekoppeld te zijn.
26. Eén generieke `FollowUpAction` kan aan één of meer pins worden gekoppeld.
27. De koppeling gebruikt een afzonderlijke relationele tabel, `FollowUpActionDrawingPinMap`.
28. Een gekoppelde opvolgactie biedt de actie `Toon op tekening`.
29. Die navigatie opent de juiste PDF, pagina en gemarkeerde pin.
30. Vanuit installatiedetail kan een gebruiker een tekening kiezen, een pin plaatsen, optioneel een opvolgactie maken en optioneel een bestaande opvolgactie koppelen.
31. Een opvolgactie kan tekst, een tekenlocatie, één of meer foto's en andere attachments bevatten.
32. Foto's en attachments gebruiken hetzelfde generieke bestandfundament.
33. Formulierdetail en installatiebrede follow-upreview tonen tekenlocaties.
34. Daar worden minimaal tekeningnaam, pagina, pinlabel, een indicator of preview en de actie `Open op tekening` getoond.
35. De tekenlocatie grondt een tekstuele tekortkoming visueel op de fysieke plaats binnen het object.

## Inpassing in de bestaande Ember-architectuur

36. De Formulierenmonitor blijft formuliergericht met één monitorregel per formulierinstantie.
37. Open generieke opvolgacties worden niet als losse monitorregels toegevoegd.
38. Formulierdetail en afhandeling tonen wel de totale actuele installatiestatus, inclusief handmatige acties, eerdere formulieracties, inspectieacties, acties buiten het huidige formulier en tekenlocaties.
39. Installatiedetail blijft het volledige dossier en bevat een compacte grid of tab voor alle installatieopvolgingen.
40. Er komt geen afzonderlijke globale hoofdmenuweergave Opvolgingen.
41. Inspectiegericht operationeel werk krijgt later een apart Inspectieoverzicht voor inspectieplichtige installaties en inspectiecases.
42. Een kleine gerichte herstructurering van de opvolg-UX is toegestaan wanneer pins dit vereisen. De compacte `FollowUpActionGrid` blijft leidend.
43. Handmatige opvolgacties worden volledig ondersteund. Een opvolgactie is niet verplicht formuliergebonden.
44. `responsibility_type` ondersteunt toekomstige verantwoordelijkheid van klant of derde.
45. Er wordt nu geen extern portaal en geen externe authenticatie gebouwd.
46. De architectuur moet later gecontroleerd alleen een relevante actie, klantzichtbare tekst, foto's, tekening, pin en status kunnen delen zonder de volledige interne installatiecontext vrij te geven.

## Acceptatiekern

- Kaart en lijst geven voor dezelfde filters dezelfde operationele populatie en samenvatting.
- Het readmodel bevat aantoonbaar geen afzonderlijke kaartbusinesslogica.
- Objectgroepering voorkomt onbruikbare overlappende markers.
- Een pinpositie is onafhankelijk van de viewport en reproduceerbaar op de juiste PDF-pagina.
- Elke navigatie vanaf actie naar tekening is deterministisch op document, pagina en pin.
- Bestanden blijven via `StoredFile` beheerd en worden niet gedupliceerd.
