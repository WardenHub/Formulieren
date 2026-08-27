# KAM / SCL-inspectie POC

`KAM_SCL_inspectie_V3_9.formdev.json` is een native SurveyJS-definitie voor Formdev. Het is bewust geen HTML-import; de bron-HTML bevat eigen scripts en een eigen opslagmodel, terwijl dit bestand met de gedeelde Ember-runner werkt.

De definitie bevat algemene gegevens, situatieschets, conditioneel zichtbare VCA-categorieën, per regel Ja/Nee/N.V.T. met verplichte toelichting bij Nee, een SCL-gesprek en opvolging. Elke Nee-regel maakt al een bestaande generieke workflowactie aan.

`KAM_SCL_inspectie_V3_9.workflow-config.json` beschrijft de definitieregel die bij elke indiening een verplichte KAM-beoordeling opent. Voer deze configuratie pas live in via Formulierbeheer nadat de KAM-rol leden heeft en de autorisatiecontrole voor roltoegewezen acties is afgerond.

## Lokale proef

1. Open `/dev/formdev`.
2. Plak de volledige inhoud van `KAM_SCL_inspectie_V3_9.formdev.json` in de `survey_json`-editor.
3. Kies `Controleer JSON`, test de situatieschets en vul minimaal een Nee met toelichting in.
4. Controleer in de follow-up-preview dat elke Nee-regel als workflowactie verschijnt.

Het Formdev-bestand maakt geen databasewijziging en kan dus veilig lokaal worden beoordeeld. De formulierdefinitie en de KAM-opvolgregel worden pas na een afzonderlijke gecontroleerde database-write aangemaakt.
