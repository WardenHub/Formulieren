# Aanmelden en online ophalen

Ember Offline gebruikt dezelfde Ember Web API als de online applicatie. Er is geen aparte Offline-API en er is geen client secret op het apparaat nodig.

## Eenmalige Entra-configuratie

Maak in Microsoft Entra ID een aparte app-registratie voor `Ember Offline`.

1. Kies **Accounts in deze organisatiemap**.
2. Voeg onder **Authentication** het platform **Mobile and desktop applications** toe.
3. Voeg deze redirect URI toe:

   ```text
   http://127.0.0.1:43863/auth/callback
   ```

4. Geef de app onder **API permissions** de bestaande gedelegeerde Ember API-permissie `user_impersonation`.
5. Verleen admin consent wanneer dit binnen de tenant vereist is.
6. Maak geen client secret of certificaat aan; Ember Offline gebruikt authorization code met PKCE.

## Lokale configuratie

Kopieer `.env.example` naar `.env.local` in `codebase/ember-offline/` en vul in:

```dotenv
VITE_OFFLINE_API_BASE=https://api.wardenburg.nl
VITE_OFFLINE_AAD_TENANT_ID=<tenant-id>
VITE_OFFLINE_AAD_CLIENT_ID=<application-client-id-van-ember-offline>
VITE_OFFLINE_API_APP_ID=<application-client-id-van-de-bestaande-ember-api>
```

Start de app opnieuw na een wijziging aan `.env.local`.

## Testprocedure

1. Sluit een eventueel al geopende `ember-offline.exe`; Tauri kan een draaiend exe-bestand niet opnieuw compileren.
2. Start vanuit `codebase/ember-offline/`:

   ```powershell
   npm run tauri dev
   ```

3. Open **Formulieren ophalen** en kies **Online ophalen**.
4. Meld aan met Microsoft in het Ember Offline desktopvenster. De browserpreview via `npm run dev` is alleen bedoeld voor de interface en kan niet aanmelden.
5. Zoek een installatie en kies een bestaande, nieuwe of vervolgformulieren-optie.
6. Kies eventueel de relevante documenttypes en kies **Lokaal klaarzetten**.
7. Controleer dat het formulier in **Offline formulieren** verschijnt.
8. Schakel de internetverbinding uit en open het formulier; antwoorden moeten lokaal opslaan.

## Begrenzing van deze fase

Het formulier kan offline worden ingevuld. Definitief indienen, conflictresolutie en het uploaden van offline bijlagen blijven online stappen. Installatiebestanden worden in deze fase alleen als context geselecteerd; documentbinaries worden nog niet naar het apparaat gekopieerd.
