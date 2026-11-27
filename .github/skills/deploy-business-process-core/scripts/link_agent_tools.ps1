#Requires -Version 7.0
<#
.SYNOPSIS
After a Core import, link every monitoring agent tool to the Dataverse connection reference
it names. Solution export/import does not carry the botcomponent_connectionreference
association; without it the agent fails with "BotDefinitionOverride has unresolved
references" and its tools show "Not connected". Idempotent: adds only missing links,
rejects conflicting ones, and does not change tool definitions, authentication, or bindings.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][guid] $TenantId,
    [Parameter(Mandatory)][uri] $Url,
    [string] $AgentSchemaName = 'faf001_businessprocessmonitoringagent',
    [string] $ConnectionReference = 'faf001_sharedcommondataserviceforapps'
)

$ErrorActionPreference = 'Stop'
if ($Url.Scheme -ne 'https' -or $Url.AbsolutePath -ne '/' -or $Url.Query -or $Url.Fragment -or $Url.UserInfo) {
    throw 'Url must be the HTTPS Dataverse organization root.'
}
foreach ($name in $AgentSchemaName, $ConnectionReference) { if ($name -notmatch '^[A-Za-z0-9_]+$') { throw "Invalid schema name '$name'." } }

$org = $Url.AbsoluteUri.TrimEnd('/')
$api = "$org/api/data/v9.2"
$token = az account get-access-token --tenant $TenantId --resource $org --query accessToken --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not acquire a Dataverse token.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
function Get-Rows([string] $Path) {
    $response = Invoke-RestMethod -Headers $headers -Uri "$api/$Path" -ErrorAction Stop
    if ($response.'@odata.nextLink') { throw "FAIL Agent tool links: unexpected pagination for $Path." }
    @($response.value)
}

try {
    $bots = Get-Rows "bots?`$select=botid&`$filter=schemaname eq '$AgentSchemaName'"
    if ($bots.Count -ne 1) { throw "FAIL Agent tool links: expected one '$AgentSchemaName' agent; found $($bots.Count). Import Core first." }
    $references = Get-Rows "connectionreferences?`$select=connectionreferenceid,connectorid,connectionid&`$filter=connectionreferencelogicalname eq '$ConnectionReference'"
    if ($references.Count -ne 1) { throw "FAIL Agent tool links: expected one '$ConnectionReference' connection reference; found $($references.Count)." }
    $referenceId = $references[0].connectionreferenceid
    $connectorPattern = "(?m)^connectorId: $([regex]::Escape($references[0].connectorid))\s*$"

    $toolsPath = "botcomponents?`$select=botcomponentid,schemaname,data&`$filter=_parentbotid_value eq $($bots[0].botid) and componenttype eq 9&`$expand=botcomponent_connectionreference(`$select=connectionreferenceid)"
    $tools = @(Get-Rows $toolsPath | Where-Object { $_.data -match "(?m)^connectionReference: $([regex]::Escape($ConnectionReference))\s*$" })
    if (-not $tools.Count) { throw "FAIL Agent tool links: no '$AgentSchemaName' tools use '$ConnectionReference'." }
    foreach ($tool in $tools) {
        if ($tool.data -notmatch $connectorPattern) { throw "FAIL Agent tool links: $($tool.schemaname) connector does not match '$ConnectionReference'; nothing changed." }
        if (@($tool.botcomponent_connectionreference | Where-Object connectionreferenceid -NE $referenceId).Count) {
            throw "FAIL Agent tool links: $($tool.schemaname) is linked to another connection reference; nothing changed."
        }
    }

    $missing = @($tools | Where-Object { -not @($_.botcomponent_connectionreference).Count })
    $body = @{ '@odata.id' = "$api/connectionreferences($referenceId)" } | ConvertTo-Json
    foreach ($tool in $missing) {
        $null = Invoke-RestMethod -Method Post -Headers $headers -Uri "$api/botcomponents($($tool.botcomponentid))/botcomponent_connectionreference/`$ref" -ContentType 'application/json' -Body $body
    }

    $after = Get-Rows $toolsPath
    foreach ($tool in $tools) {
        $row = @($after | Where-Object botcomponentid -EQ $tool.botcomponentid)
        $links = @($row.botcomponent_connectionreference)
        if ($row.Count -ne 1 -or $row[0].data -cne $tool.data -or $links.Count -ne 1 -or $links[0].connectionreferenceid -ne $referenceId) {
            throw "FAIL Agent tool links: readback failed for $($tool.schemaname); rerun after inspecting the target."
        }
    }
    $binding = if ($references[0].connectionid) { 'bound' } else { 'not yet bound to a connection' }
    Write-Output "PASS Agent tool links: $($tools.Count) $AgentSchemaName tools linked to $ConnectionReference ($binding); added $($missing.Count)."
} finally {
    Remove-Variable token, headers -ErrorAction SilentlyContinue
}
