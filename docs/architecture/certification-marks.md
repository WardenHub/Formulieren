# Certificeringsbeeldmerken in formulieren

Een formulierdefinitie kiest maximaal één certificeringsbeeldmerk uit `dbo.CertificationMarkDefinition`. Een lege keuze betekent dat het PDF-voorblad geen certificeringsbeeldmerk toont. De keuze wordt bij publicatie vastgelegd op `dbo.FormDefinitionVersion`; daardoor blijft een historische PDF aan dezelfde merkselectie gekoppeld, ook wanneer de beheerinstelling later verandert.

De catalogus is niet beperkt tot BMI. `authority_code`, `scheme_code` en `process_code` onderscheiden bijvoorbeeld CCV, BMI, OAI, IBC, camera en de processen installatie, levering en onderhoud. Een nieuw beeldmerk vereist een catalogusregel en een gecontroleerd lokaal bestand onder `src/assets/pdf`; er is geen nieuwe React- of PDF-layoutvariant nodig.

Voor de eerste invulling zijn de drie aangeleverde CCV BMI-beeldmerken opgenomen:

- `CCV_BMI_INSTALLATION`;
- `CCV_BMI_DELIVERY`;
- `CCV_BMI_MAINTENANCE`.

`MAINT_BMI` gebruikt standaard `CCV_BMI_MAINTENANCE`. De PDF-export leest uitsluitend de keuze van de concrete formulierversie. Inactieve catalogusregels blijven bestaan voor historische verwijzingen; beheer toont actieve keuzes en houdt een reeds gekozen inactieve waarde zichtbaar.

Bron voor gebruik en terminologie: https://hetccv.nl/keurmerken/brandbeveiliging/brandmeldinstallaties/beeldmerken-brandbeveiliging/
