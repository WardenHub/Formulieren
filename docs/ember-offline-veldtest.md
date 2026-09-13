# Ember Offline; veldtest op een echte laptop

Dit is de enige stap in de offline keten die niet vanaf deze machine te bewijzen is. Alles
ertussen staat in tests en is in de draaiende app gemeten; wat hier overblijft is de
combinatie van de echte MSI, een echte aanmelding en een echt netwerk dat wegvalt.

Uit te voeren door Jesse of een monteur, op proefinstallatie **01** (`001065`). De test raakt
echte rijen in de POC-database; dat mag tot de livegang.

## Vooraf

- De MSI komt uit het avatarmenu in Ember, "Ember Offline downloaden". Die link wijst altijd
  naar de laatst gepubliceerde versie; kijk in het scherm welke versie je binnenhaalt.
- De functies uit deze ronde (punten, foto's, plek op tekening, terugsturen) zitten pas in
  een release die **na** `offline-v0.1.0` is getagd. Staat er nog 0.1.0, dan test je de oude
  app en kloppen stappen 5 tot en met 8 niet.
- Laat de laptop aan het netwerk hangen tot stap 4; daarna mag hij eraf.

## De test

1. **Installeren.** MSI uitvoeren, Ember Offline starten. Verwacht: het scherm opent met een
   lege werkvoorraad en de strook bovenin zegt dat er internet is.

2. **Aanmelden.** Met je eigen account. Verwacht: geen tweede aanmeldscherm bij de volgende
   stap.

3. **Formulier ophalen.** Zoek installatie `001065`, kies een onderhoudsformulier, neem de
   tekeningen mee in de selectie. Verwacht: het formulier staat in de werkvoorraad en de
   gekozen bestanden staan op het apparaat.

4. **Controleren op kantoor.** Open in Ember op de computer dezelfde installatie. Verwacht:
   bij dat formulier staat "Offline bij <jouw naam>". Dat is een melding, geen slot; online
   bewerken blijft mogelijk.

5. **Netwerk eraf.** Wifi uit, kabel eruit. Verwacht: de strook zegt dat er geen internet is
   en dat je gewoon kunt doorwerken.

6. **Invullen.** Vul een paar pagina's in, ook een keuzelijst. Verwacht: de keuzelijst is
   gevuld; hij komt uit de prefill die bij het pakket zit. Is hij leeg, noteer welke vraag.

7. **Punt, foto en plek.** Voeg bij "Punten voor kantoor" een punt toe, hang er een foto aan
   en wijs een plek op de tekening aan. Verwacht: het punt staat in de lijst met de naam van
   de tekening erachter, en de foto staat eronder.

8. **Afsluiten en opnieuw openen.** Sluit de app helemaal af en start hem opnieuw, nog steeds
   zonder netwerk. Verwacht: alles staat er nog; antwoorden, punt, foto en plek.

9. **Netwerk erbij.** Verwacht: de strook zegt dat er weer internet is en biedt "Terugsturen
   naar Ember" aan.

10. **Terugsturen.** Druk op de knop. Verwacht: de melding zegt hoeveel formulieren en foto's
    zijn teruggestuurd, en het formulier staat op "gesynchroniseerd".

11. **Controleren op kantoor.** In Ember op de computer:
    - de antwoorden staan in het formulier;
    - het punt staat bij de opvolgacties, met de foto eraan;
    - de pin staat op de tekening, op de plek die je hebt aangewezen;
    - "Offline bij ..." is verdwenen.

12. **Twee keer sturen.** Zet het formulier in de app terug op "in bewerking" en stuur nog
    een keer. Verwacht: geen tweede punt, geen tweede pin, geen tweede foto. Dit is de
    belangrijkste controle van de hele test.

## Wat te doen bij een conflict

Wijzig het formulier online terwijl het offline bij je staat, en stuur daarna terug. Verwacht:
de app zegt dat het formulier online is gewijzigd en zet het op conflict; je werk blijft op
het apparaat staan. Dat is het gewenste gedrag; er gaat niets stil verloren.

## Wat er per stap mis kan gaan

| Stap | Als het misgaat | Wat dat betekent |
|---|---|---|
| 2 | Aanmelden lukt niet | De app-registratie of de redirect klopt niet; niet zelf omzeilen. |
| 3 | Bestanden komen niet mee | De downloadroute of de documentselectie; noteer welk type document. |
| 6 | Keuzelijst leeg | De prefill zat niet in het pakket, of het pakket is ouder dan versie 0.2. |
| 10 | "online gewijzigd" zonder dat er iemand aan zat | Revisiecontrole; noteer de draft_rev uit beide schermen. |
| 11 | Pin staat scheef | Genormaliseerde coördinaten of de paginakeuze; noteer de tekening en de pagina. |
| 12 | Dubbele punten of foto's | De idempotentie werkt niet; dit is een blokkerende bevinding. |
