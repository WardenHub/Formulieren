[CmdletBinding()]
param(
  [switch]$SkipAdminConsent
)

$ErrorActionPreference = "Stop"

$tenantId = "42b413cc-67db-4507-a4a6-ce30ce798022"
$displayName = "Ember Offline"
$callbackUri = "http://127.0.0.1:43863/auth/callback"
$emberApiAppId = "9e4d2ed4-7cef-4cd6-99cc-98d48b9d3f46"

function Get-SingleGraphItem {
  param(
    [Parameter(Mandatory)] [string]$Uri,
    [Parameter(Mandatory)] [string]$Description
  )

  $response = Invoke-MgGraphRequest -Method GET -Uri $Uri
  $items = @($response.value)
  if ($items.Count -gt 1) {
    throw "Meer dan een $Description gevonden. Stop om geen verkeerde Entra-app te wijzigen."
  }

  return $items | Select-Object -First 1
}

function Merge-RequiredResourceAccess {
  param(
    [object[]]$Existing,
    [Parameter(Mandatory)] [string]$ResourceAppId,
    [Parameter(Mandatory)] [string]$ScopeId
  )

  $merged = @($Existing | ForEach-Object {
    @{
      resourceAppId = $_.resourceAppId
      resourceAccess = @($_.resourceAccess | ForEach-Object {
        @{ id = $_.id; type = $_.type }
      })
    }
  })

  $apiAccess = $null
  foreach ($entry in $merged) {
    if ($entry.resourceAppId -eq $ResourceAppId) {
      $apiAccess = $entry
      break
    }
  }

  if (-not $apiAccess) {
    $merged += @{
      resourceAppId = $ResourceAppId
      resourceAccess = @()
    }
    $apiAccess = $merged[-1]
  }

  if (@($apiAccess.resourceAccess | Where-Object { $_.id -eq $ScopeId -and $_.type -eq "Scope" }).Count -eq 0) {
    $apiAccess.resourceAccess += @{ id = $ScopeId; type = "Scope" }
  }

  return $merged
}

$context = Get-MgContext
if (-not $context -or $context.TenantId -ne $tenantId -or
  -not ($context.Scopes -contains "Application.ReadWrite.All") -or
  -not ($context.Scopes -contains "DelegatedPermissionGrant.ReadWrite.All")) {
  Connect-MgGraph -TenantId $tenantId -Scopes @(
    "Application.ReadWrite.All",
    "Application.Read.All",
    "DelegatedPermissionGrant.ReadWrite.All"
  ) -NoWelcome
}

$apiApp = Invoke-MgGraphRequest -Method GET -Uri "/v1.0/applications(appId='$emberApiAppId')?`$select=id,appId,displayName,api"
$scope = @($apiApp.api.oauth2PermissionScopes | Where-Object { $_.value -eq "user_impersonation" -and $_.isEnabled }) | Select-Object -First 1
if (-not $scope) {
  throw "De actieve user_impersonation-scope van ember-api is niet gevonden."
}

$encodedName = [uri]::EscapeDataString("displayName eq '$displayName'")
$offlineApp = Get-SingleGraphItem -Uri "/v1.0/applications?`$filter=$encodedName&`$select=id,appId,displayName,signInAudience,publicClient,requiredResourceAccess" -Description "Entra-app met de naam '$displayName'"

$requiredResourceAccess = @(
  @{
    resourceAppId = $emberApiAppId
    resourceAccess = @(
      @{ id = $scope.id; type = "Scope" }
    )
  }
)

if (-not $offlineApp) {
  $createBody = @{
    displayName = $displayName
    signInAudience = "AzureADMyOrg"
    publicClient = @{ redirectUris = @($callbackUri) }
    requiredResourceAccess = $requiredResourceAccess
  } | ConvertTo-Json -Depth 10

  $offlineApp = Invoke-MgGraphRequest -Method POST -Uri "/v1.0/applications" -Body $createBody -ContentType "application/json"
  Write-Host "Entra-app '$displayName' aangemaakt."
}
else {
  if ($offlineApp.signInAudience -ne "AzureADMyOrg") {
    throw "De bestaande '$displayName'-app heeft een onverwachte accountconfiguratie ($($offlineApp.signInAudience))."
  }

  $redirectUris = @($offlineApp.publicClient.redirectUris)
  if ($redirectUris -notcontains $callbackUri) {
    $redirectUris += $callbackUri
  }

  $requiredResourceAccess = Merge-RequiredResourceAccess -Existing @($offlineApp.requiredResourceAccess) -ResourceAppId $emberApiAppId -ScopeId $scope.id

  $patchBody = @{
    publicClient = @{ redirectUris = $redirectUris }
    requiredResourceAccess = $requiredResourceAccess
  } | ConvertTo-Json -Depth 10
  Invoke-MgGraphRequest -Method PATCH -Uri "/v1.0/applications/$($offlineApp.id)" -Body $patchBody -ContentType "application/json"
  Write-Host "Entra-app '$displayName' gecontroleerd en bijgewerkt."
}

$offlineApp = Invoke-MgGraphRequest -Method GET -Uri "/v1.0/applications/$($offlineApp.id)?`$select=id,appId,displayName,publicClient"
$offlineServicePrincipal = Get-SingleGraphItem -Uri "/v1.0/servicePrincipals?`$filter=appId eq '$($offlineApp.appId)'&`$select=id,appId,displayName" -Description "service principal voor '$displayName'"
if (-not $offlineServicePrincipal) {
  $servicePrincipalBody = @{ appId = $offlineApp.appId } | ConvertTo-Json
  $offlineServicePrincipal = Invoke-MgGraphRequest -Method POST -Uri "/v1.0/servicePrincipals" -Body $servicePrincipalBody -ContentType "application/json"
  Write-Host "Service principal voor '$displayName' aangemaakt."
}

if (-not $SkipAdminConsent) {
  $apiServicePrincipal = Get-SingleGraphItem -Uri "/v1.0/servicePrincipals?`$filter=appId eq '$emberApiAppId'&`$select=id,appId,displayName" -Description "service principal voor ember-api"
  if (-not $apiServicePrincipal) {
    throw "Service principal voor ember-api niet gevonden."
  }

  $grant = Get-SingleGraphItem -Uri "/v1.0/oauth2PermissionGrants?`$filter=clientId eq '$($offlineServicePrincipal.id)' and resourceId eq '$($apiServicePrincipal.id)' and consentType eq 'AllPrincipals'&`$select=id,scope" -Description "tenantbrede delegated permission grant"
  if (-not $grant) {
    $grantBody = @{
      clientId = $offlineServicePrincipal.id
      consentType = "AllPrincipals"
      resourceId = $apiServicePrincipal.id
      scope = "user_impersonation"
    } | ConvertTo-Json
    Invoke-MgGraphRequest -Method POST -Uri "/v1.0/oauth2PermissionGrants" -Body $grantBody -ContentType "application/json" | Out-Null
    Write-Host "Beheerderstoestemming voor ember-api verleend."
  }
  elseif ((@($grant.scope -split " ") -notcontains "user_impersonation")) {
    $newScope = (@($grant.scope -split " ") + "user_impersonation" | Where-Object { $_ } | Select-Object -Unique) -join " "
    $grantBody = @{ scope = $newScope } | ConvertTo-Json
    Invoke-MgGraphRequest -Method PATCH -Uri "/v1.0/oauth2PermissionGrants/$($grant.id)" -Body $grantBody -ContentType "application/json" | Out-Null
    Write-Host "Beheerderstoestemming voor ember-api aangevuld."
  }
  else {
    Write-Host "Beheerderstoestemming voor ember-api was al aanwezig."
  }
}

Write-Host ""
Write-Host "Klaar. Voeg deze waarde toe aan codebase/ember-offline/.env.local:"
Write-Host "VITE_OFFLINE_AAD_CLIENT_ID=$($offlineApp.appId)"
Write-Host ""
Write-Host "Callback: $callbackUri"
Write-Host "Accounttype: alleen Wardenburg-tenant; Hefas-gebruikers via hun gastaccount."
