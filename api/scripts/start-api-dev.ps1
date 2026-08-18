[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$NodePath,

  [Parameter(Mandatory = $true)]
  [string]$TsxCliPath,

  [Parameter(Mandatory = $true)]
  [string]$PlaywrightBrowsersPath
)

$ErrorActionPreference = 'Stop'

$hasClientId = -not [string]::IsNullOrWhiteSpace($env:DIGITAAL_LOGBOEK_CLIENT_ID)
$hasClientSecret = -not [string]::IsNullOrWhiteSpace($env:DIGITAAL_LOGBOEK_CLIENT_SECRET)

if (-not ($hasClientId -and $hasClientSecret)) {
  $credentialHelper = Join-Path $env:USERPROFILE '.codex\skills\beveiligingslogboek\scripts\Get-DigitaalLogboekCredential.ps1'
  if (Test-Path -LiteralPath $credentialHelper -PathType Leaf) {
    $credential = & $credentialHelper
    $env:DIGITAAL_LOGBOEK_CLIENT_ID = $credential.UserName
    $env:DIGITAAL_LOGBOEK_CLIENT_SECRET = $credential.GetNetworkCredential().Password
    Write-Host '[dev] Digitaal Logboek-instellingen veilig geladen uit de persoonlijke credentialopslag.'
  } else {
    Write-Warning '[dev] Persoonlijke Digitaal Logboek credential-helper niet gevonden.'
  }
}

if ([string]::IsNullOrWhiteSpace($env:DIGITAAL_LOGBOEK_BASE_URL)) {
  $env:DIGITAAL_LOGBOEK_BASE_URL = 'https://www.digitaallogboek.com'
}
if ([string]::IsNullOrWhiteSpace($env:DIGITAAL_LOGBOEK_SCOPE)) {
  $env:DIGITAAL_LOGBOEK_SCOPE = 'DigitalLog.API.ExternalAccess'
}

$env:NODE_ENV = 'development'
$env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightBrowsersPath

& $NodePath $TsxCliPath watch 'src/server.ts'
exit $LASTEXITCODE
