[CmdletBinding()]
param(
    [Parameter(Mandatory)][uri]$EnvironmentUrl,
    [Parameter(Mandatory)][string]$ServicePrincipalFile,
    [Parameter(Mandatory)][string]$ConnectionName
)

$ErrorActionPreference = 'Stop'
if ($EnvironmentUrl.Scheme -ne 'https' -or $EnvironmentUrl.AbsolutePath -ne '/' -or
    $EnvironmentUrl.Query -or $EnvironmentUrl.Fragment -or $EnvironmentUrl.UserInfo) {
    throw 'EnvironmentUrl must be the HTTPS Dataverse organization root.'
}

try {
    $content = Get-Content -LiteralPath $ServicePrincipalFile -Raw
    $tenantMatch = [regex]::Match($content, '(?m)^\s*Tenant Id\s+(\S+)\s*$')
    $applicationMatch = [regex]::Match($content, '(?m)^\s*Application Id\s+(\S+)\s*$')
    $secretMatch = [regex]::Match($content, '(?m)^\s*Client Secret\s+(\S+)\s*$')
    if (-not $tenantMatch.Success -or -not $applicationMatch.Success -or -not $secretMatch.Success) {
        throw 'The credential file must contain Tenant Id, Application Id, and Client Secret from PAC service-principal creation.'
    }
    $tenantId = [guid]$tenantMatch.Groups[1].Value
    $applicationId = [guid]$applicationMatch.Groups[1].Value
    $secret = $secretMatch.Groups[1].Value
    $output = pac connection create --environment $EnvironmentUrl.AbsoluteUri --tenant-id $tenantId --name $ConnectionName --application-id $applicationId --client-secret $secret 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'PAC connection creation failed. Output was suppressed to prevent credential disclosure. Inspect target connections before retrying.'
    }
    Write-Output "Created Dataverse connection '$ConnectionName'."
    pac connection list --environment $EnvironmentUrl.AbsoluteUri
    if ($LASTEXITCODE -ne 0) { throw 'Connection created, but listing connections failed. Do not repeat creation.' }
} finally {
    Remove-Variable content, tenantMatch, applicationMatch, secretMatch, secret, output -ErrorAction SilentlyContinue
}