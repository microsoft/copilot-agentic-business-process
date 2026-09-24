[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$TenantId,
    [Parameter(Mandatory)][uri]$Url,
    [Parameter(Mandatory)][guid]$OrganizationId,
    [string]$AgentSchemaName = 'faf001_businessprocessmonitoringagent',
    [string]$ConnectionReference = 'faf001_sharedcommondataserviceforapps',
    [ValidateRange(1, 1000)][int]$ExpectedToolCount = 13,
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
if ($Url.Scheme -ne 'https' -or $Url.AbsolutePath -ne '/' -or $Url.Query -or $Url.Fragment -or $Url.UserInfo) {
    throw 'Url must be the HTTPS Dataverse organization root.'
}
foreach ($schema in @($AgentSchemaName, $ConnectionReference)) {
    if ($schema -notmatch '^[A-Za-z0-9_]+$') { throw 'Expected a schema name containing only letters, numbers, or underscores.' }
}
$org = $Url.AbsoluteUri.TrimEnd('/')
$token = az account get-access-token --tenant $TenantId --resource $org --query accessToken --output tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not acquire Dataverse token.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }

function Get-Rows([string]$RequestUri) {
    $response = Invoke-RestMethod -Headers $headers -Uri $RequestUri -ErrorAction Stop
    if ($response.'@odata.nextLink') { throw 'Unexpected pagination; narrow the query before proceeding.' }
    $response.value
}

try {
    $identity = Invoke-RestMethod -Headers $headers -Uri "$org/api/data/v9.2/WhoAmI" -ErrorAction Stop
    if ([guid]$identity.OrganizationId -ne $OrganizationId) { throw 'Target organization does not match OrganizationId.' }
    $bots = @(Get-Rows "$org/api/data/v9.2/bots?`$select=botid&`$filter=schemaname eq '$AgentSchemaName'")
    if ($bots.Count -ne 1) { throw 'Expected exactly one target agent.' }
    $references = @(Get-Rows "$org/api/data/v9.2/connectionreferences?`$select=connectionreferenceid,connectorid&`$filter=connectionreferencelogicalname eq '$ConnectionReference'")
    if ($references.Count -ne 1 -or $references[0].connectorid -ne '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps') {
        throw 'Expected exactly one Dataverse connection reference.'
    }
    $referenceId = $references[0].connectionreferenceid
    $botId = $bots[0].botid
    $toolsUri = "$org/api/data/v9.2/botcomponents?`$select=botcomponentid,schemaname,data&`$filter=_parentbotid_value eq $botId and componenttype eq 9&`$expand=botcomponent_connectionreference(`$select=connectionreferenceid)"
    $tools = @(Get-Rows $toolsUri | Where-Object {
        $_.data -match "(?m)^connectionReference: $([regex]::Escape($ConnectionReference))\s*$"
    })
    if ($tools.Count -ne $ExpectedToolCount) { throw "Expected $ExpectedToolCount tools using the reference; found $($tools.Count)." }
    foreach ($tool in $tools) {
        if ($tool.data -notmatch '(?m)^authMode: Invoker\s*$' -or
            $tool.data -notmatch '(?m)^connectorId: /providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps\s*$') {
            throw "Unexpected authentication or connector on $($tool.schemaname)."
        }
        $otherLinks = @($tool.botcomponent_connectionreference | Where-Object { $_.connectionreferenceid -ne $referenceId })
        if ($otherLinks.Count) { throw "Conflicting association on $($tool.schemaname); nothing changed." }
    }
    $missing = @($tools | Where-Object { @($_.botcomponent_connectionreference).Count -eq 0 })
    if ($missing.Count -and -not $Apply) {
        throw "$($missing.Count) missing associations. Review the target and rerun with -Apply to add them."
    }
    $body = @{ '@odata.id' = "$org/api/data/v9.2/connectionreferences($referenceId)" } | ConvertTo-Json
    foreach ($tool in $missing) {
        $toolId = $tool.botcomponentid
        $null = Invoke-RestMethod -Method Post -Headers $headers -Uri "$org/api/data/v9.2/botcomponents($toolId)/botcomponent_connectionreference/`$ref" -ContentType 'application/json' -Body $body -ErrorAction Stop
        $check = Invoke-RestMethod -Headers $headers -Uri "$org/api/data/v9.2/botcomponents($toolId)?`$select=data&`$expand=botcomponent_connectionreference(`$select=connectionreferenceid)" -ErrorAction Stop
        if ($check.data -cne $tool.data -or @($check.botcomponent_connectionreference).Count -ne 1 -or
            $check.botcomponent_connectionreference[0].connectionreferenceid -ne $referenceId) {
            throw "Readback failed for $($tool.schemaname); inspect the partial result before retrying."
        }
        Write-Output "Associated: $($tool.schemaname)"
    }
    $after = @(Get-Rows $toolsUri)
    foreach ($tool in $tools) {
        $match = @($after | Where-Object { $_.botcomponentid -eq $tool.botcomponentid })
        if ($match.Count -ne 1 -or $match[0].data -cne $tool.data -or
            @($match[0].botcomponent_connectionreference).Count -ne 1 -or
            $match[0].botcomponent_connectionreference[0].connectionreferenceid -ne $referenceId) {
            throw "Final verification failed for $($tool.schemaname)."
        }
    }
    Write-Output "Verified $($tools.Count) tool associations; added $($missing.Count). Authentication and connection bindings unchanged."
} finally {
    Remove-Variable token, headers -ErrorAction SilentlyContinue
}