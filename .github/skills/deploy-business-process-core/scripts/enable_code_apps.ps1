#Requires -Version 7.0
<#
.SYNOPSIS
Enable (or with -CheckOnly, verify) "Power Apps code apps" on a Power Platform environment
through PAC environment-management (PAC 2.12.1 or newer).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^(Default-)?[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')][string] $EnvironmentId,
    [switch] $CheckOnly
)

$ErrorActionPreference = 'Stop'

function Get-CodeAppsEnabled {
    # Default reads return only Id; the flag must be selected explicitly.
    $raw = @(pac environment-management list-environment-management-settings --environment $EnvironmentId --select id,powerApps_AllowCodeApps --json 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "FAIL Code Apps: settings read failed. Requires PAC 2.12.1+ and environment admin access. $($raw -join ' ')" }
    $records = @((($raw -join "`n") | ConvertFrom-Json).objectResult)
    if ($records.Count -ne 1 -or $records[0].Id -ne $EnvironmentId) { throw 'FAIL Code Apps: unexpected settings response for the environment.' }
    $records[0].PowerApps_AllowCodeApps -eq $true
}

if (Get-CodeAppsEnabled) { Write-Output "PASS Code Apps: already enabled on $EnvironmentId."; return }
if ($CheckOnly) { Write-Output "FAIL Code Apps: not enabled on $EnvironmentId."; exit 1 }

# Inline JSON is mangled by Windows argument quoting; pass the body as @file.
$body = Join-Path ([IO.Path]::GetTempPath()) "code-apps-$([guid]::NewGuid()).json"
try {
    Set-Content -LiteralPath $body -Value '{"powerApps_AllowCodeApps": true}' -Encoding utf8NoBOM
    $output = @(pac environment-management update-environment-management-settings --environment $EnvironmentId --body "@$body" --json 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "FAIL Code Apps: update failed. $($output -join ' ')" }
} finally {
    Remove-Item -LiteralPath $body -ErrorAction SilentlyContinue
}
if (-not (Get-CodeAppsEnabled)) { throw 'FAIL Code Apps: update returned success but readback is not enabled.' }
Write-Output "PASS Code Apps: enabled on $EnvironmentId (verified by readback)."
