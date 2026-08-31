# Certificering en inspecties; rol- en schermmodel

## Naamconventie

De Entra-securitygroep volgt de bestaande Ember-conventie `EMBER-<ROL>`:

- groep: `EMBER-CERTIFICERING-COORDINATOR`;
- Ember-rol: `certificering_coordinator`;
- app-role: `Ember.CertificeringCoordinator`.

De rolnaam beschrijft de verantwoordelijkheid voor certificaten en inspecties; de groep is geen algemene beheer- of documentrol.

## Zichtbaarheid en bevoegdheden

Iedere geauthenticeerde Ember-gebruiker die installaties mag lezen, ziet de certificeringssamenvatting, certificaatstatus en inspectiestatus. Alleen `admin` en `certificering_coordinator` mogen de certificeringsplicht, certificaten en verzendhistorie wijzigen.

De bestaande inspectiepermissies blijven leidend voor inspectiecases. Bij de vervolgstap worden de inspectiemutaties aan dezelfde coördinatorrol gekoppeld, zonder de bestaande fijnmazige audit- en checklistpermissies te vervangen.

## Schermstructuur

De beoogde installatie-ervaring is één hoofddomein **Certificering** met subtabs:

1. Samenvatting;
2. Certificaten;
3. Inspecties.

Totdat deze composiettab lokaal is gevalideerd, blijven de huidige URL-tabkeys `certificates` en `inspections` beschikbaar voor compatibiliteit.

## Onderhoudscertificaatplicht

De actuele onderhoudscontractstatus wordt server-side uit Atrium/Fabric/Reader-context afgeleid. Een actief onderhoudscontract levert een systeemsignaal dat een onderhoudscertificaat vereist. Een coördinator kan dit expliciet overrulen met een verplichte reden en auditregistratie; een refresh mag zo'n override niet stil overschrijven.

De exacte contractbron, statuswaarden en refreshroute moeten vóór database- of Fabric-wijzigingen live worden bevestigd.
