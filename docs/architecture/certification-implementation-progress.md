# Certificering; implementatievoortgang

## Vastgestelde inrichting

- POC zonder conversie; lokale uitvoering zonder publicatie.
- Installatiesoort handmatig: BMI, BMI-OAI type B geïntegreerd, zelfstandige OAI type B.
- Onderhoudseis alleen bij actief passend onderhoudscontract; inspectie-eis handmatig of contractgestuurd.
- Contractgestuurde eis niet uitschakelbaar in Ember; beëindigd contract afzonderlijk filterbaar.
- Combinatieschakelaar voor één document dat beide scopes dekt; anders losse documenten.
- Beoordeling per certificaattype én scope. Geen melding Ontbreekt zonder eis.
- Inspectiefasen met rapportupload, exacte bestandsversie, herstelroute en certificaatupload voor succesvolle afronding.
- Admin/coördinator beheren, anderen lezen. Monitor en kaart delen dezelfde statuslogica.

## Voortgang

### UX-controle op verzoek van product owner

- Actueel dossier in browser beoordeeld vanuit een niet-technische gebruiker. Nog te veel technische uitleg en latere, uitgeschakelde acties; algemene gebruiksvriendelijkheid is nog niet volledig geaccepteerd.
- Opslaan toont nu een zichtbare, gefocuste bevestiging; fouten krijgen een alert. Geen succesmelding wanneer de opvolgende verversing faalt.
- Voor plannen/uitvoeren controleert de UI ontbrekende datum, keuringsinstantie en werkbon vóór de aanvraag. API-controles blijven intact.
- Browserproef op 01: Uitgevoerd kiezen en opslaan zonder werkbon geeft concrete Nederlandse aanwijzing. Teruggezet naar Gepland; bevestigd en opgeslagen; Dossier opgeslagen zichtbaar. Geen inspectie als uitgevoerd gemarkeerd.
- Rapportvelden zijn gezamenlijk niet-bewerkbaar buiten de rapportfase, met zichtbare uitleg wanneer registratie beschikbaar wordt. Browser bevestigt dit. Registratie controleert ook de inspectiedatum vóór verzending.
- Technische StoredFile/Reader-teksten vervangen door gewone uitleg. Atrium-werkbonstatus en Ember-inspectiedatum in dossier apart benoemd.
- 33 gerichte tests, gerichte lint/diffcontrole en frontendbuild groen (4132 modules, 30,44 seconden). Donkere smalle weergave bekeken. Geen publicatie.
- Open: volledige knopacceptatie bij rapport/conclusie/herinspectie/afronding, vereenvoudigen toewijzing (nu rolcode-invoer), dubbele keuringsinstantie-invoer en verdere vermindering van tegelijk zichtbare vervolgstappen. Geen claim dat een niet-technische gebruiker het volledige traject al zelfstandig kan afronden.

- [x] Brononderzoek: AT_BBEWIJS bevat 1745 actuele en 3292 historische regels; alle installatiekeys sluiten aan.
- [x] Contractsoorten 000/002 onderhoud, 200/201 inspectie live bevestigd; 001 is historische soortdefinitie.
- [x] Eisen/statuslogica lokaal geïmplementeerd; 12 beleidstests en 6 structurele regressietests groen.
- [x] Contractafleiding gedeeld door installatieoverzicht en monitor; read-only SQL-scenariocontrole: 13/13 groen.
- [x] Schema/API lokaal aangepast; StoredFile.mime_type live bevestigd en gebruikt.
- [x] Uploadcomponent en inspectieproces lokaal geïmplementeerd; gecombineerde of losse certificaten, scopecontrole bij afronden, vastgelegde rapportbestandsversie.
- [x] API-rolgrenzen, readonly installatietab en monitor/kaart lokaal geïmplementeerd.
- [x] Goedgekeurde seedmigratie uitgevoerd en onafhankelijk geverifieerd; zie uitvoeringsdetails hieronder.
- [ ] Volledige ketentests en volledige visuele/rolacceptatie; gedeeltelijke bewijzen hieronder zijn geen eindacceptatie.

## Checkpoint 12 september 2026

API-typecheck en frontendproductiebuild zijn geslaagd. De build waarschuwt over grote chunks en oude Browserslist-data; dit is geen functionele acceptatie. De SQL-monitorprojectie compileerde read-only; synthetische SQL-scenario's zijn zonder datamutaties getest. De losse SQL-bestanden in deze map zijn validatiesnapshots, geen deploymentbron; de TypeScript-querymodules zijn leidend. De laatste aanpassing trekt de prioriteit van UNKNOWN boven EXPIRING gelijk in het algemene overzicht en de monitor.

De lokale monitor en kaart zijn in dark mode geopend. De dev-API was niet bereikbaar; daarom zijn daadwerkelijke uploads, opslag, rolwissels, gevulde kaarten en dossierafronding nog NIET end-to-end afgetekend. Bij ontbrekende API-data toont de monitor Niet beschikbaar in plaats van misleidende nullen.

Nog uit te voeren:

- Seedmigratie voor handmatige OAI_TYPE_B-keuze en onderhoudsdocumenttype is na exacte goedkeuring gecommit; geen automatische Atrium-mapping of installatieherindeling.
- Authenticated dev-ketentest: rapportupload, beoordeling, één combicertificaat en twee losse certificaten, herstelroute, afronden en heropenen van bewijs.
- API- en schermcontrole als gewone gebruiker versus coördinator/admin; archiefcontrole.
- Light mode en gevulde kaart controleren; normale installatiekaart heeft nu een geaggregeerd statusfilter, verdere uitsplitsing per certificaattype blijft open.
- Foutafhandeling van businessvalidaties en definitieve acceptatie nalopen.

Bij het lokale checkpoint was geen databasewrite uitgevoerd. Vervolgens is uitsluitend de hieronder genoemde seedmigratie na exacte goedkeuring gecommit, met geslaagde transactionele verificatie. Geen push of deployment uitgevoerd. Bestaande offline- en relatiegroepwijzigingen zijn behouden, ook waar deze tijdens de werkzaamheden verder veranderden.

## Voorbereide databasewijziging

Doel: ember-sql.database.windows.net/ember-sql-db.

Bestanden: 2026-09-11-certification-oai-type-b.sql en 2026-09-11-certification-oai-type-b.verify.sql, onder C:/OneDrive/Wardenburg Beveiliging & Telecom/Admin Wardenburg O365 - Automatisering/Scripts/Ember/SQL DB/alter.

Write SHA256: 727b800900bfc4d2188720966fa6a03e9408df309dc0511c4fa7ee22cf94d257

Verify SHA256: 6f297e490dc464027282709fed3f518f7177c56995b2b670b24e4cd855a8bc79

De wijziging voegt uitsluitend ontbrekende referentiewaarden toe. Verificatie controleert de actieve keuze, documentmapping en afwezigheid van automatische Atrium-mapping. Na een tijdelijke 40613-melding slaagde de preflight bij herhaling. De exact goedgekeurde write is gecommit met verification passed. Na commit vereist verwijderen een afzonderlijke referentiecontrole en goedkeuring.

Audit: C:/Users/Jesse Veentjer/AppData/Local/OpenAI/Codex/logs/ember-database-audit.jsonl.

## Vervolgcontrole 12 september 2026

- Onafhankelijke read-back van de gecommitte OAI-seedmigratie gaf passed=true.
- Lokale devconfiguratie heeft DEV_AUTH actief en geen AAD_TENANT_ID/AZURE_TENANT_ID; niet gewijzigd. Dit is geen bewijs van echte Entra-roltoewijzing. Er is geen API gestart om deze authenticatie te omzeilen.
- InspectionService valideert nu bestaande kalenderdatums, inclusief schrikkeldagen. 30 februari wordt niet meer stil genormaliseerd.
- Nieuwe Nederlandse invoerfouten gebruiken CertificationValidationError en retourneren HTTP 400; onverwachte fouten blijven serverfouten.
- 21 gerichte tests slagen, inclusief uitvoering van requireRole voor gebruiker, documentbeheerder, KAM-coördinator, certificeringscoördinator en admin. API-typecheck geslaagd. Dit zijn lokale tests, geen authenticated upload-/opslagketentest.
- Voor daadwerkelijke acceptatie zijn een bereikbaar ingelogd API-testpad en een aangewezen testinstallatie nodig. Geen testcertificaten, dossiers of blobs in productie aangemaakt; geen push/deployment.

## UI-ketentest op aangewezen testinstallatie 01

De product owner heeft de testomgeving gestart en installatie 01 expliciet aangewezen. Via de normale UI is een handmatige BMI-inspectie-eis opgeslagen, met reden POC-ketentest certificering 2026-09-12. Eerst werd inspectie Ontbreekt en onderhoud Niet verplicht getoond.

Een nieuw PDF-testdocument is geüpload: ember-poc-test-01-20260912.pdf, met prominente tekst GEEN GELDIG CERTIFICAAT. Bij het bevestigen bleek de UUID-vergelijking hoofdlettergevoelig; dit is lokaal gecorrigeerd. Herbevestiging gebruikte het reeds geüploade document, zonder nieuwe upload. Certificaat POC-TEST-01-20260912 is via de UI opgeslagen (inspectie, BMI, testuitgever, 12 september 2026 tot 12 september 2027). Het scherm toont nu Geldig voor de testinspectie-eis; onderhoud blijft Niet verplicht. Deze testregistraties bestaan nu op 01 en zijn niet verwijderd.

UX: Certificaateis opslaan gebruikt de neutrale btn-save; de herkomst van de eis is een tag. Alt+S is lokaal begrensd tot de gefocuste eiskaart. Certificaten/Inspecties blijven de subtabs; geen subtab per certificaat. Lint op CertificatesTab en InstallationsIndex geslaagd. De smalle browserweergave heeft nog horizontale overflow; responsive acceptatie staat open. Inspectiedossierfasen, gecombineerde certificaten en daadwerkelijke Entra-rolwissels zijn nog niet end-to-end getest.

Normale installatiekaart: certificaattypefilter toegevoegd aan Meer filters, doorgegeven tot SQL; typecheck groen, live filtertest nog open.

## Inspectiedossier en procesbediening; vervolg 12 september 2026

- Via de normale test-UI is dossier 3179AD6D-0DE7-484D-874C-4370FB11ABE1 voor uitsluitend installatie 01 aangemaakt. Geen bulk-signalering of externe verzending uitgevoerd.
- Eerste opslaan werd geblokkeerd door een ongeldige rowversion. Unieke SQL-aliassen alleen waren onvoldoende. Gerichte read-only SQL-projectie bevestigde dat directe varchar-conversie acht onleesbare tekens gaf; expliciete binary(8)-tussenconversie gaf de correcte 18-tekens hexcode.
- Alle inspectie-rowversion-responses gebruiken nu expliciete binaire conversie; detail, checklist en pakketten hebben unieke projectiealiassen. De concurrency-predicaten zijn behouden.
- De draaiende lokale API retourneerde een geldige dossier-versie en acht geldige checklistversies. Via de gewone lokale applicatie-API is het testdossier van ATTENTION_REQUIRED naar OFFER_REQUIRED gezet; read-back bevestigt dit. Herhaling met dezelfde oude versie werd correct met HTTP 409 geweigerd. Dit is een API-ketentest, geen nieuwe browserkliktest en geen echte Entra-roltest.
- De frontend gebruikt de actieve overgangen uit InspectionCaseTransitionDefinition. Dedicated rapport-, conclusie- en afrondingsstappen verschijnen niet meer als algemene statuskeuze. De API blijft de beslissende controle.
- Dossier en monitor delen Nederlandse faselabels. Een Volgende stap-kaart verwijst naar de relevante dossiersectie. Terminale dossiers zijn in de UI alleen-lezen. Checklist- en conclusiekeuzes zijn vertaald; rapportselectie beperkt zich tot inspectierapporten.
- 24 gerichte tests slagen. Volledige browseracceptatie van alle fasen, echte Entra-rollen, gecombineerde certificaten en smalle/light-mode weergave blijven open. Geen publicatie, database-DDL, Blob-cleanup of externe communicatie.
- API-typecheck en frontendbuild geslaagd. Gerichte frontendlint: nul fouten, twee bestaande hook-dependencywaarschuwingen. De build vereiste een herhaling met lokale schrijfrechten voor Vite; overige waarschuwingen betreffen chunkgrootte en verouderde Browserslist-data.

## Vervolg: checklist, invoerbehoud en monitor

- Testdossier 01 via de lokale API naar ORDERED gezet. Read-back van de monitor bevestigde dezelfde dossier-ID, ORDERED en certificaatstatus VALID.
- Browser toonde de beperkte fasekeuze en Nederlandse statussen. Checklistdocument koppelen faalde met identifier invalid; de betrokken sleutel is een SQL NEWSEQUENTIALID met andere version bits dan de oude RFC-filter toestond. Validatie accepteert nu exact het SQL uniqueidentifier-formaat, zonder extra tekens of truncatie. Nieuwe regressietest groen.
- Inspectie-editor bewaart niet-opgeslagen velden bij tussentijdse checklist-/uploadverversing via een geteste vergelijking met de vorige serverwaarden. Dossier blijft tijdens verversen gemount. Smalle checklist- en invoerlayouts zijn lokaal aangepast; visuele hertest nog nodig.
- Alle 28 gerichte tests en API-typecheck groen; gerichte diffcontrole groen. Nieuwste frontendbuild en volledige browserketen na deze laatste wijzigingen nog niet uitgevoerd.
- Tijdens herhaling van de checklisttest werd localhost:8080 onbereikbaar. Procesinspectie met extra rechten werd afgewezen omdat de automatische approval-review geen workspacecredits had. Niet omzeild; API-sessie niet gestopt of opnieuw gestart. Browser behoudt niet-opgeslagen testtekst POC TEST - invoer behouden.
- Installatie 01 heeft nog geen gekoppelde werkbon of kandidaten. Voor uitvoering/rapport/afronding is een valide testwerkbon nodig; geen bronkoppeling gefabriceerd of controle uitgezet. Geen publicatie of externe communicatie.

## Herstelde test-API en browseracceptatie checklist

- API-health opnieuw HTTP 200 zonder herstart door de agent. Checklistkoppeling opnieuw uitgevoerd via de browser; test-PDF zichtbaar geselecteerd, status Beschikbaar en DOCUMENT LINKED in historie. De andere, niet-opgeslagen keuringsinstantie bleef bij deze opslag intact.
- Nieuwe gedeelde Nederlandse labels voor de acht huidige checklistonderwerpen en afspraakstatussen. Monitor en dossier gebruiken dezelfde afspraaklabels.
- Dossier en monitor gebruiken bestaande input-klasse. Op smalle schermen staan de dossierkolommen onder elkaar. Screenshot van het actuele donkere scherm bevestigt nette invoervelden en eenkoloms dossierindeling; dit is nog geen volledige light-mode/kaartacceptatie.
- Product owner gevraagd om een echte testwerkbon bij installatie 01; overige faseketen blijft daarvan afhankelijk. Geen publicatie.

## Browseracceptatie certificatenkaart

- Monitor geopend, gezocht op Testinstallatie 1 en kaarttab gekozen. Na afronden van de zoekactie precies één installatie, nul ontbrekende certificaten, nul dossiers ontbrekend en nul kritieke signalen.
- Marker geopend: kaartdetail verwijst naar installatie 01 en toont Voldoet aan certificaateis. Hiermee zijn de zoekfilter, marker en certificaatlabel samen in de browser bevestigd.
- Certificaattype gewijzigd naar Onderhoudscertificaat met dezelfde zoekfilter: nul installaties en Geen installaties binnen deze kaart. De inspectie-eis/testcertificaat leidt dus niet tot een foutieve onderhoudseis of ontbrekend onderhoudscertificaat.
- Light-modecontrole nog open; geen thema gewijzigd. Echte Entra-gebruikersrol en volledige uitvoering/rapport/afrondingsketen nog niet bewezen. Werkboninput gevraagd, niet gefabriceerd.

## Lichte monitorweergave

- Tijdelijk de bestaande thema-preview in Profiel gebruikt, zonder opslaan. De gevulde monitor is in lichtmodus bekeken.
- Gevonden overlap van monitortitel en actieknoppen op circa 710px hersteld: acties krijgen onder 1050px een eigen regel. Screenshot na wijziging bevestigt leesbare titel, knoppen, filters, KPI's en testdossierrij.
- Daarna Profiel opnieuw geladen: Systeem geselecteerd en opslaan uitgeschakeld (geen wijzigingen). Geen gebruikersprofielwrite uitgevoerd.
- Dit bewijst de lichte monitorweergave op deze breedte, niet alle schermen of alle breakpoints. Open harde acceptatieafhankelijkheden: echte testwerkbon voor 01 en tests met echte gewone gebruiker/coördinatoridentiteiten. Laatste volledige frontendbuild moet na alle vervolgwijzigingen nog worden herhaald.

## Checkpoint 13 september 2026

### Hervatting: gedeeltelijke dossieropslag gevalideerd

- Na hervatting door de product owner slaagde de lokale wijziging weer. API-health healthy, database bereikbaar.
- updateInspectionCase bewaart nu bestaande status, termijn, keuringsinstantie en logboekvelden wanneer deze ontbreken in de aanvraag. Expliciete null en false blijven bewuste wijzigingen. Bestaande datumvalidatie, rollen en rowversion-predicaat behouden.
- Gewone lokale API-ketentest op uitsluitend dossier 3179AD6D-0DE7-484D-874C-4370FB11ABE1, installatie 01: logbook_linked expliciet false opgeslagen; vervolgens alleen due_date en row_version aangeleverd. Status, geplande datum, keuringsinstantie en alle vier logboekvelden ongewijzigd teruggelezen. Herhaalde aanvraag met oude rowversion correct HTTP 409.
- Oorspronkelijke logbook_linked-waarde daarna expliciet hersteld en teruggelezen. Dossier blijft PLANNED_CONFIRMED. Geen echte logboekkoppeling of externe verzending uitgevoerd. API-typecheck geslaagd.
- De aparte POC-werkbonvoorziening is nog niet gebouwd; hierover staat de voorgelegde keuze open. Uitvoering, rapportregistratie, herinspectie en afronding zijn daarom nog niet als volledige keten geaccepteerd. Geen push, publicatie of database-DDL.

### Vervolg na bevestigde API-health

### Dossierisolatie en overlappende verversingen

- Inspectiedetail is nu per caseId gemount. Rapport-, pakket- en certificaatselecties worden daardoor niet overgenomen bij navigatie naar een ander dossier; verversen binnen hetzelfde dossier behoudt de bestaande invoerbehoudlogica.
- Verouderde detail-/historieresponses en fouten worden genegeerd zodra een nieuwere laadactie gestart is; effect-cleanup maakt lopende leesacties ongeldig.
- Twee structurele regressiechecks toegevoegd, expliciet geen vervanging voor een browsertest met vertraagde antwoorden. Alle 31 gerichte tests groen, gerichte lint/diffcontrole groen. Frontendbuild geslaagd: 4132 modules, 22,36 seconden; bestaande chunk/Browserslist-waarschuwingen.
- Readerclient onderzocht: geen bestaande mock-/fixturevoorziening gevonden. Nog geen fictieve bronkoppeling ingevoerd. Geen nieuwe testregistratie, API-write, schemawijziging of publicatie in deze stap.

- API opnieuw bereikbaar, inclusief database en PDF-renderer; geen herstart uitgevoerd.
- Product owner staat een fictieve werkboncode toe voor de POC op installatie 01. De eerdere eis van een echte testwerkbon vervalt voor de Ember-procestest. Een echte Atrium-koppeling blijft een afzonderlijke integratietest. Nog geen fictieve code opgeslagen: de huidige snapshotquery labelt records hard als ATRIUM_READER; een fictieve code via die route zou onjuiste bronherkomst vastleggen.
- Gewone lokale API: dossier 3179AD6D-0DE7-484D-874C-4370FB11ABE1 door PLANNING_REQUIRED, PLANNED_UNCONFIRMED en PLANNED_CONFIRMED geleid. Elke status direct teruggelezen; drie STATUS_CHANGED-historieregels bevestigd. Testinspectiedatum 2026-09-13, keuringsinstantie blijft POC TEST - geen keuringsinstantie. Geen afspraak verzonden of externe partij geïnformeerd.
- Gevonden en lokaal hersteld: monitorsignalen gebruikten Atrium appointment_status, waardoor een in Ember geplande inspectie als ontbrekende planning verscheen. Planning ontbreekt volgt nu ontbrekende Ember planned_date binnen de planningsfasen; onbevestigd volgt PLANNED_UNCONFIRMED. Monitor benoemt inspectiedatum en Atrium-status apart.
- Live API-readback na wijziging: testdossier aanwezig onder ALL (1 resultaat), afwezig onder PLANNING_MISSING (0) en APPOINTMENT_UNCONFIRMED (0). Dit is actuele filteracceptatie voor bevestigd gepland, geen complete matrix voor alle fasen.
- 29 gerichte tests, API-typecheck, gerichte frontendlint en diffcontrole geslaagd. Laatste kleine monitorlabelwijziging nog niet visueel hertest. Uitvoering/rapport/herinspectie/afronding, fictieve testkoppeling en echte Entra-rolacceptatie blijven open. Geen publicatie of schemawijziging.

- Laatste volledige frontendbuild geslaagd: 4132 modules, 21,13 seconden. Alleen waarschuwingen over chunkgrootte en verouderde Browserslist-data. Daarmee is de eerder openstaande buildcontrole van alle laatste UX-wijzigingen uitgevoerd.
- De 28 gerichte regressietests opnieuw groen. Zij dekken beleid, structurele SQL-gates, sleutel-/datumvalidatie en invoerbehoud; niet de volledige operationele keten met echte identiteiten.
- Test-API op localhost:8080 bij hervatting niet bereikbaar (connection refused). Geen nieuwe ketentestresultaten. Laatst bevestigde dossierstatus ORDERED, geen gekoppelde werkbon; dit kon vandaag niet opnieuw live worden gelezen.
- Volgende noodzakelijke input: testomgeving beschikbaar, geldige werkbon voor testinstallatie 01 en echte roltestidentiteiten. Geen push, deployment, bronwijziging of nieuw testrecord uitgevoerd.

## Hervatting 21 september 2026

### Inspectiemonitor: planning en compacte kaart

- Archiefcheckbox vervangen door bestaande ember-toggle met toegankelijke switchstatus. Weergavekeuze gebruikt bestaande ember-segmented.
- Standaard inspectieplanning komende 90 dagen; datum verstreken, zonder datum en alles apart selecteerbaar. Server filtert voor windowtotalen en TOP en sorteert op geplande datum, anders uiterste datum. Reeds uitgevoerde/beoordeelde dossiers vallen niet onder komende inspecties. Bestaande grain blijft een actief dossier per installatie; geen volledige lijst van parallelle dossiers.
- Kaart toont alle periodes met dezelfde overige filters; expliciet benoemd. KPI-blokken alleen op lijst, extra filters ingeklapt. Zo komt de kaart hoger te staan zonder bestaande filtermogelijkheden te verwijderen.
- Relatiecode en objectcode toegevoegd aan API/lijst. Relatiecode volgt dezelfde rolkeuze als de relatienaam. Inspectiedatum duidelijk bij installatie, met onderscheid gepland versus uiterste datum.
- Typecheck, gerichte lint en bestaande contracttests groen; aanvullende querycontracttest toegevoegd. Visuele browseracceptatie nog open: localhost:5173 gaf ERR_CONNECTION_REFUSED. Niets gepubliceerd of in de database geschreven.

### Onderhoudsdocument vergelijken op datum

- Product owner bevestigt: uitsluitend status Definitief. In de bestaande monitor is dit AFGEHANDELD; SQL-filter behouden en defensieve statuscontrole in onderhoudsselectie toegevoegd. De eerdere vraag over ingediende formulieren is hiermee gesloten.
- Bij het gekozen definitieve formulier worden actuele workflowactiepunten en onopgeloste certificaatblokkerende punten geteld, inclusief certificate_impact_override. Dit betreft de punten van dat specifieke formulier, niet willekeurig alle installatiepunten. Scherm en PDF-HTML tonen aantallen en verwijzen voor het historische ondertekende oordeel naar het rapport; nul blokkades wordt niet voorgesteld als afgegeven certificaat. Bij losse bijlagen blijft beoordeling onbekend.
- 13 gerichte datum/selectie/PDF-HTML-tests en API-typecheck geslaagd. Geen live gegevens gewijzigd en geen deployment uitgevoerd. Gevulde weergave met definitief onderhoudsformulier nog niet live geaccepteerd.

- Nieuwe actuele leesprojectie vergelijkt actieve onderhoudsrapport-bijlagen met afgehandelde MAINT_BMI-formulieren van dezelfde installatie. Bijlagen gebruiken document_date; formulieren datum_onderhoud met bestaande legacy-alias Datum_onderhoud_af_date. Geen terugval op upload/aanmaakdatum. Parent/child-formulieren worden op eigen onderhoudsdatum vergeleken, niet op hoogste instance-ID.
- Bron, titel en onderhoudsdatum verschijnen in procesoverzicht, volledig dossier en de PDF-HTML. Waarschuwing vanaf de dag na de kalenderjaardag; 29 februari wordt in een niet-schrikkeljaar 28 februari. Ongeldige/ontbrekende en toekomstige datums krijgen aparte signalen, gelijke datums een melding.
- Automatische checklistresolver kiest geen oudere onderhoudsrapport-bijlage wanneer een nieuwer afgehandeld formulier bestaat. Een eerder opgeslagen document wordt niet vervangen. Onderhoudsbijlagen zonder datum of met toekomstige datum worden niet automatisch gekoppeld.
- Browsercontrole op installatie 01 gelukt: procesoverzicht en lege onderhoudsvergelijking zichtbaar, lichte desktopweergave gecontroleerd. Er was geen kwalificerend onderhoudsdocument; gevulde bronselectie en ouderdomswaarschuwing zijn met unit tests getest, niet met een nieuwe live testregistratie.
- 34 inspectietests, 4 datum-/bronselectietests, 11 SQL-contracttests en API-typecheck groen. PDF-HTML bevat bron en waarschuwing volgens regressietest; daadwerkelijke PDF-rendering van deze nieuwe sectie nog niet visueel geaccepteerd.
- Voorlopig alleen AFGEHANDELD; vraag of INGEDIEND ook mag meetellen staat bij de product owner. Deze leesprojectie legt nog geen immutable formulier-PDF vast als dossierbijlage. Die koppeling en de volledige afrondingsgate blijven vervolgwerk; geen schemawijziging of publicatie uitgevoerd.

- Huidige checkout opnieuw onderzocht; bevat inmiddels InspectionStepPanel, InspectionProcessTrack, automatische documentkoppeling en dossier-PDF. Nieuwere en niet-gerelateerde lokale wijzigingen behouden.
- Automatische checklistkoppeling lokaal gecorrigeerd: alleen actieve InstallationDocuments met een niet-verwijderd StoredFile. Afgeronde en geannuleerde dossiers leveren zonder wijzigingen linked_count=0. Een transactielock op het dossier voorkomt gelijktijdige afsluiting tijdens koppeling; gelijke documentdatums krijgen een deterministische sortering op document_id.
- 33 inspectietests en 27 certificerings-/validatietests geslaagd, inclusief nieuwe structurele regressietest. API-typecheck en git diff --check geslaagd. Dit bewijst geen live SQL-uitvoering of volledige browseracceptatie.
- Browserprobe naar localhost:5173 geeft ERR_CONNECTION_REFUSED. Geen devserver gestart, geen API-write, push, deployment of databasewijziging uitgevoerd.
- Open: visuele controle en daadwerkelijke PDF-download in de draaiende testomgeving. Ook de automatische route van afgerond BMI-formulier naar onderhoudsrapportbewijs is nog niet aangetoond; de huidige checklistresolver zoekt uitsluitend InstallationDocument/StoredFile, niet FormInstance. Een formulier mag niet zonder geldig bewijsbestand als aanwezig worden gemarkeerd.
- Oudere checkpoints hierboven spreken elkaar deels tegen over de laatst gelezen dossierstatus. Deze hervatting heeft geen actuele dossierstatus live bevestigd; behandel oudere statusmeldingen als historische waarnemingen.
