#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][guid] $TenantId,
    [Parameter(Mandatory)][string] $EnvironmentId,
    [Parameter(Mandatory)][uri] $Url,
    [Parameter(Mandatory)][guid] $OrganizationId,
    [Parameter(Mandatory)][string] $RepositoryRoot
)

$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$helper = Join-Path $repository 'scripts/dataverse_agent_connections.ps1'
$queries = [ordered]@{
    'Custom APIs' = 'custom-apis.xml'
    'Plug-in package' = 'plugin-packages.xml'
    'Workflow Console' = 'canvas-apps.xml'
    'Console URL variable' = 'environment-variables.xml'
    'Dataverse connection reference' = 'connection-references.xml'
    'Monitoring agent' = 'copilot-agents.xml'
}
foreach ($file in @($helper) + @($queries.Values | ForEach-Object { Join-Path $PSScriptRoot "fetchxml/$_" })) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required verification file missing: $file" }
}
$target = @(pac env who 2>&1)
if ($LASTEXITCODE -ne 0) { throw 'PAC target discovery failed. Verify authentication and select the approved environment.' }
$targetText = $target -join "`n"
foreach ($identifier in @($EnvironmentId, $OrganizationId.ToString(), $Url.AbsoluteUri.TrimEnd('/'))) {
    if ($targetText.IndexOf($identifier, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw 'PAC target does not match the approved environment ID, organization ID, and URL. No installation checks run.'
    }
}
$checks = [Collections.Generic.List[object]]::new()
function Read-PacEvidence {
    param([string] $Name, [string[]] $Arguments)
    $output = @(pac @Arguments 2>&1)
    $status = if ($LASTEXITCODE -eq 0) { 'Not verified' } else { 'Fail' }
    $checks.Add([pscustomobject]@{ Check = $Name; Status = $status; Evidence = ($output -join "`n") })
}

Read-PacEvidence 'Solution' @('solution', 'list')
foreach ($entry in $queries.GetEnumerator()) {
    Read-PacEvidence $entry.Key @('env', 'fetch', '--xmlFile', (Join-Path $PSScriptRoot "fetchxml/$($entry.Value)"))
}
Read-PacEvidence 'Dataverse connection' @('connection', 'list')
try {
    $associations = @(& $helper -TenantId $TenantId -Url $Url -OrganizationId $OrganizationId)
    $checks.Add([pscustomobject]@{ Check = 'Monitoring tool associations'; Status = 'Pass'; Evidence = ($associations -join "`n") })
} catch {
    $checks.Add([pscustomobject]@{ Check = 'Monitoring tool associations'; Status = 'Fail'; Evidence = 'Association verification failed. Verify target, read access, and all 13 tool associations; do not repair in check mode.' })
}
$checks.Add([pscustomobject]@{
    Check = 'Runtime role'; Status = 'Not verified'
    Evidence = 'Verify the approved application user has Business-Process-User and compare RetrieveUserPrivileges with EntityDefinitions privilege metadata and the role specification.'
})
$checks.Add([pscustomobject]@{
    Check = 'Code apps enabled'; Status = 'Not verified'
    Evidence = 'Verify Enable code apps in the target environment feature settings; obtain owner evidence if inaccessible.'
})
[pscustomobject]@{
    EnvironmentId = $EnvironmentId
    OrganizationId = $OrganizationId
    Overall = $(if (@($checks | Where-Object Status -EQ 'Fail').Count) { 'Fail' } else { 'Review required' })
    Checks = $checks.ToArray()
}