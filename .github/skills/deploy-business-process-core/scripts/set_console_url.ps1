#Requires -Version 7.0
<#
.SYNOPSIS
After the first Core import, set faf001_WorkflowConsoleBaseUrl to the installed Workflow
Console's stable play URL directly in Dataverse (no second import) and keep the ignored
deployment settings file in step for later redeployments.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][guid] $TenantId,
    [Parameter(Mandatory)][guid] $EnvironmentId,
    [Parameter(Mandatory)][uri] $Url,
    [string] $SettingsFile,
    [string] $AppName = 'cr522_workflowconsole_75f6c',
    [string] $VariableSchemaName = 'faf001_WorkflowConsoleBaseUrl'
)

$ErrorActionPreference = 'Stop'
if ($Url.Scheme -ne 'https' -or $Url.AbsolutePath -ne '/' -or $Url.Query -or $Url.Fragment -or $Url.UserInfo) {
    throw 'Url must be the HTTPS Dataverse organization root.'
}
if ($SettingsFile -and -not (Test-Path -LiteralPath $SettingsFile -PathType Leaf)) { throw "Settings file not found: $SettingsFile" }
foreach ($name in $AppName, $VariableSchemaName) { if ($name -notmatch '^[A-Za-z0-9_]+$') { throw "Invalid schema name '$name'." } }

$org = $Url.AbsoluteUri.TrimEnd('/')
$api = "$org/api/data/v9.2"
$token = az account get-access-token --tenant $TenantId --resource $org --query accessToken --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not acquire a Dataverse token.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }

try {
    $apps = @((Invoke-RestMethod -Headers $headers -Uri "$api/canvasapps?`$select=canvasappid,appopenuri&`$filter=name eq '$AppName'").value)
    if ($apps.Count -ne 1 -or -not $apps[0].appopenuri) { throw "FAIL Console URL: expected one installed '$AppName' app with an open URI; found $($apps.Count). Import Core first." }
    $consoleUrl = ([uri] $apps[0].appopenuri).GetLeftPart([UriPartial]::Path)
    if ($consoleUrl -notmatch "^https://apps\.powerapps\.com/play/e/$EnvironmentId/app/[0-9a-fA-F-]{36}$") {
        throw "FAIL Console URL: '$consoleUrl' does not target environment $EnvironmentId."
    }

    $definitions = @((Invoke-RestMethod -Headers $headers -Uri "$api/environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$VariableSchemaName'&`$expand=environmentvariabledefinition_environmentvariablevalue(`$select=environmentvariablevalueid,value)").value)
    if ($definitions.Count -ne 1) { throw "FAIL Console URL: expected one '$VariableSchemaName' definition." }
    $definitionId = $definitions[0].environmentvariabledefinitionid
    $values = @($definitions[0].environmentvariabledefinition_environmentvariablevalue)
    if ($values.Count -gt 1) { throw "FAIL Console URL: multiple current values for '$VariableSchemaName'; resolve manually." }

    $action = 'unchanged'
    if (-not $values.Count) {
        $null = Invoke-RestMethod -Method Post -Headers $headers -Uri "$api/environmentvariablevalues" -ContentType 'application/json' -Body (@{
            value = $consoleUrl; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($definitionId)"
        } | ConvertTo-Json)
        $action = 'created'
    } elseif ($values[0].value -cne $consoleUrl) {
        $null = Invoke-RestMethod -Method Patch -Headers $headers -Uri "$api/environmentvariablevalues($($values[0].environmentvariablevalueid))" -ContentType 'application/json' -Body (@{ value = $consoleUrl } | ConvertTo-Json)
        $action = 'updated'
    }
    $readback = @((Invoke-RestMethod -Headers $headers -Uri "$api/environmentvariablevalues?`$select=value&`$filter=_environmentvariabledefinitionid_value eq $definitionId").value)
    if ($readback.Count -ne 1 -or $readback[0].value -cne $consoleUrl) { throw 'FAIL Console URL: readback does not match.' }

    $settingsNote = ''
    if ($SettingsFile) {
        $settings = Get-Content -LiteralPath $SettingsFile -Raw | ConvertFrom-Json
        $entries = @($settings.EnvironmentVariables | Where-Object SchemaName -EQ $VariableSchemaName)
        if ($entries.Count -ne 1) { throw "FAIL Console URL: settings file has no single '$VariableSchemaName' entry." }
        if ($entries[0].Value -cne $consoleUrl) {
            $entries[0].Value = $consoleUrl
            $settings | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $SettingsFile -Encoding utf8NoBOM
            $settingsNote = '; settings file updated'
        } else { $settingsNote = '; settings file already current' }
    }
    Write-Output "PASS Console URL $action in Dataverse: $consoleUrl$settingsNote."
} finally {
    Remove-Variable token, headers -ErrorAction SilentlyContinue
}
