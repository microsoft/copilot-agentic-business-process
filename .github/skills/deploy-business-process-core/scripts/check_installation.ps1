#Requires -Version 7.0
<#
.SYNOPSIS
Read-only BusinessProcessCore installation check. Compares the target environment with the
approved package and the runtime role specification and prints one PASS/FAIL line per
criterion. Exit code 0 only when every criterion passes. Use -PassThru for the report object.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][guid] $TenantId,
    [Parameter(Mandatory)][guid] $EnvironmentId,
    [Parameter(Mandatory)][uri] $Url,
    [Parameter(Mandatory)][guid] $OrganizationId,
    [Parameter(Mandatory)][string] $RepositoryRoot,
    [string] $PackagePath,
    [switch] $PassThru
)

$ErrorActionPreference = 'Stop'
if ($Url.Scheme -ne 'https' -or $Url.AbsolutePath -ne '/' -or $Url.Query -or $Url.Fragment -or $Url.UserInfo) {
    throw 'Url must be the HTTPS Dataverse organization root.'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repository = (Resolve-Path -LiteralPath $RepositoryRoot).Path
if (-not $PackagePath) {
    $zips = @(Get-ChildItem -LiteralPath (Join-Path $repository 'core/solution/build') -Filter 'BusinessProcessCore_*_unmanaged.zip')
    if ($zips.Count -ne 1) { throw 'Expected exactly one BusinessProcessCore package in core/solution/build; pass -PackagePath.' }
    $PackagePath = $zips[0].FullName
}
$spec = Get-Content -LiteralPath (Join-Path $repository 'core/solution/config/security-role.business-process-user.json') -Raw | ConvertFrom-Json

# --- Expected state from the approved package -------------------------------------------
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $PackagePath).Path)
try {
    $entries = @{}
    foreach ($entry in $zip.Entries) { $entries[$entry.FullName.Replace('\', '/')] = $entry }
    function Read-Entry([string] $Name) {
        $reader = [IO.StreamReader]::new($entries[$Name].Open())
        try { $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    [xml] $solutionXml = Read-Entry 'solution.xml'
    [xml] $customizations = Read-Entry 'customizations.xml'
    $manifest = $solutionXml.ImportExportXml.SolutionManifest
    $package = [ordered]@{
        Name = [string] $manifest.UniqueName
        Version = [string] $manifest.Version
        Managed = ([string] $manifest.Managed -eq '1')
        Apis = @(foreach ($name in @($entries.Keys) -like 'customapis/*/customapi.xml') {
            [xml] $apiXml = Read-Entry $name
            [pscustomobject]@{
                Name = [string] $apiXml.customapi.uniquename
                ExportKey = [string] $apiXml.customapi.plugintypeid.plugintypeexportkey
                BindingType = [int] $apiXml.customapi.bindingtype
                IsFunction = ([int] $apiXml.customapi.isfunction -eq 1)
            }
        })
        PluginPackages = @(foreach ($name in @($entries.Keys) -like 'pluginpackages/*/pluginpackage.xml') {
            [xml] $packageXml = Read-Entry $name
            [pscustomobject]@{ Name = [string] $packageXml.pluginpackage.uniquename; Version = [string] $packageXml.pluginpackage.version }
        })
        Apps = @($customizations.ImportExportXml.CanvasApps.CanvasApp | ForEach-Object { [string] $_.Name })
        ConnectionReferences = @($customizations.ImportExportXml.connectionreferences.connectionreference | ForEach-Object { [string] $_.connectionreferencelogicalname })
        Variables = @(@($entries.Keys) -like 'environmentvariabledefinitions/*/environmentvariabledefinition.xml' | ForEach-Object { $_.Split('/')[1] })
        Bots = @(@($entries.Keys) -like 'bots/*/bot.xml' | ForEach-Object { $_.Split('/')[1] })
        Components = @{}
    }
    foreach ($name in @($entries.Keys) -like 'botcomponents/*/data') {
        $package.Components[$name.Split('/')[1]] = (Read-Entry $name).Replace("`r`n", "`n").TrimEnd()
    }
} finally { $zip.Dispose() }
if ($package.Name -ne 'BusinessProcessCore' -or $package.Apps.Count -ne 1 -or $package.ConnectionReferences.Count -ne 1 -or
    $package.Variables -notcontains 'faf001_WorkflowConsoleBaseUrl' -or $package.PluginPackages.Count -ne 1) {
    throw 'Package layout is not the expected BusinessProcessCore layout; update this check alongside the package.'
}

# --- Live state ------------------------------------------------------------------------
$org = $Url.AbsoluteUri.TrimEnd('/')
$api = "$org/api/data/v9.2"
$token = az account get-access-token --tenant $TenantId --resource $org --query accessToken --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not acquire a Dataverse token. Run az login --tenant <tenant-id> --allow-no-subscriptions.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
function Get-Rows([string] $Path) {
    $response = Invoke-RestMethod -Headers $headers -Uri "$api/$Path" -ErrorAction Stop
    if ($response.'@odata.nextLink') { throw "Unexpected pagination for $Path." }
    @($response.value)
}

$checks = [Collections.Generic.List[object]]::new()
$context = @{}
function Test-Criterion([string] $Name, [scriptblock] $Body) {
    try {
        $evidence = & $Body
        $checks.Add([pscustomobject]@{ Check = $Name; Status = 'Pass'; Evidence = [string] $evidence })
    } catch {
        $checks.Add([pscustomobject]@{ Check = $Name; Status = 'Fail'; Evidence = $_.Exception.Message })
    }
}

try {
    $who = Invoke-RestMethod -Headers $headers -Uri "$api/WhoAmI" -ErrorAction Stop
    if ([guid] $who.OrganizationId -ne $OrganizationId) { throw 'Target organization does not match OrganizationId. No checks run.' }
    $pacTarget = @(pac env who --environment $EnvironmentId 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $pacTarget.IndexOf($OrganizationId.ToString(), [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw 'PAC cannot resolve EnvironmentId to OrganizationId. No checks run.'
    }

    Test-Criterion 'Solution' {
        $rows = Get-Rows "solutions?`$select=version,ismanaged&`$filter=uniquename eq '$($package.Name)'"
        if ($rows.Count -ne 1) { throw "$($package.Name) is not installed." }
        if ($rows[0].version -ne $package.Version -or [bool] $rows[0].ismanaged -ne $package.Managed) {
            throw "Installed $($rows[0].version) managed=$($rows[0].ismanaged); approved $($package.Version) managed=$($package.Managed)."
        }
        "$($package.Name) $($package.Version) $(if ($package.Managed) { 'managed' } else { 'unmanaged' })"
    }

    Test-Criterion 'Plug-in package' {
        $expected = $package.PluginPackages[0]
        $rows = Get-Rows "pluginpackages?`$select=pluginpackageid,version,statecode&`$filter=uniquename eq '$($expected.Name)'"
        if ($rows.Count -ne 1 -or $rows[0].version -ne $expected.Version -or $rows[0].statecode -ne 0) { throw "$($expected.Name) $($expected.Version) not active." }
        $assemblies = Get-Rows "pluginassemblies?`$select=pluginassemblyid,version,isolationmode&`$filter=_packageid_value eq $($rows[0].pluginpackageid)"
        if ($assemblies.Count -ne 1 -or $assemblies[0].isolationmode -ne 2) { throw 'Expected one sandboxed assembly in the package.' }
        $context.PluginTypes = Get-Rows "plugintypes?`$select=plugintypeid,typename,plugintypeexportkey&`$filter=_pluginassemblyid_value eq $($assemblies[0].pluginassemblyid)"
        "$($expected.Name) $($expected.Version); assembly $($assemblies[0].version) sandboxed; $($context.PluginTypes.Count) plug-in types"
    }

    Test-Criterion 'Custom APIs' {
        if (-not $context.PluginTypes) { throw 'Plug-in types unavailable (see Plug-in package).' }
        $live = Get-Rows "customapis?`$select=uniquename,_plugintypeid_value,_sdkmessageid_value,statecode,bindingtype,isfunction&`$filter=startswith(uniquename,'faf001_')"
        $steps = Get-Rows "sdkmessageprocessingsteps?`$select=_eventhandler_value,_sdkmessageid_value,statecode,stage&`$filter=$(@($context.PluginTypes | ForEach-Object { "_eventhandler_value eq $($_.plugintypeid)" }) -join ' or ')"
        $problems = foreach ($expected in $package.Apis) {
            $row = @($live | Where-Object uniquename -EQ $expected.Name)
            if ($row.Count -ne 1) { "$($expected.Name) missing"; continue }
            $type = @($context.PluginTypes | Where-Object plugintypeid -EQ $row[0]._plugintypeid_value)
            $step = @($steps | Where-Object { $_._eventhandler_value -eq $row[0]._plugintypeid_value -and $_._sdkmessageid_value -eq $row[0]._sdkmessageid_value -and $_.stage -eq 30 -and $_.statecode -eq 0 })
            if ($row[0].statecode -ne 0 -or $row[0].bindingtype -ne $expected.BindingType -or [bool] $row[0].isfunction -ne $expected.IsFunction) { "$($expected.Name) state/signature" }
            elseif ($type.Count -ne 1 -or $type[0].plugintypeexportkey -cne $expected.ExportKey) { "$($expected.Name) plug-in binding" }
            elseif ($step.Count -ne 1) { "$($expected.Name) no enabled main-operation step" }
        }
        if ($problems) { throw ($problems -join '; ') }
        "$($package.Apis.Count)/$($package.Apis.Count) APIs active, bound to packaged plug-in types, main-operation steps enabled"
    }

    Test-Criterion 'Workflow Console' {
        $rows = Get-Rows "canvasapps?`$select=canvasappid,appopenuri&`$filter=name eq '$($package.Apps[0])'"
        if ($rows.Count -ne 1 -or -not $rows[0].appopenuri) { throw "$($package.Apps[0]) not installed." }
        $context.ConsoleUrl = ([uri] $rows[0].appopenuri).GetLeftPart([UriPartial]::Path)
        if ($context.ConsoleUrl -notmatch "^https://apps\.powerapps\.com/play/e/$EnvironmentId/app/[0-9a-fA-F-]{36}$") { throw "Open URL $($context.ConsoleUrl) does not target this environment." }
        $raw = @(pac environment-management list-environment-management-settings --environment $EnvironmentId --select id,powerApps_AllowCodeApps --json 2>&1)
        if ($LASTEXITCODE -ne 0) { throw 'Code Apps setting unreadable (PAC 2.12.1+ and environment admin required).' }
        $setting = @((($raw -join "`n") | ConvertFrom-Json).objectResult)
        if ($setting.Count -ne 1 -or $setting[0].PowerApps_AllowCodeApps -ne $true) { throw 'Code Apps is not enabled.' }
        "$($context.ConsoleUrl); Code Apps enabled"
    }

    Test-Criterion 'Console URL variable' {
        $name = 'faf001_WorkflowConsoleBaseUrl'
        $rows = Get-Rows "environmentvariabledefinitions?`$select=defaultvalue&`$filter=schemaname eq '$name'&`$expand=environmentvariabledefinition_environmentvariablevalue(`$select=value)"
        if ($rows.Count -ne 1) { throw "$name not installed." }
        $values = @($rows[0].environmentvariabledefinition_environmentvariablevalue)
        if ($values.Count -ne 1) { throw "$name has $($values.Count) current values; run set_console_url.ps1." }
        if (-not $context.ConsoleUrl) { throw 'Console URL unavailable (see Workflow Console).' }
        if ($values[0].value -cne $context.ConsoleUrl) { throw "Current value '$($values[0].value)' is not '$($context.ConsoleUrl)'; run set_console_url.ps1." }
        'current value equals the stable Console URL'
    }

    Test-Criterion 'Dataverse connection' {
        $reference = $package.ConnectionReferences[0]
        $rows = Get-Rows "connectionreferences?`$select=connectionid,connectorid,statecode&`$filter=connectionreferencelogicalname eq '$reference'"
        if ($rows.Count -ne 1 -or -not $rows[0].connectionid -or $rows[0].statecode -ne 0) { throw "$reference is not bound to a connection." }
        $raw = @(pac connectivity list-connections --environment $EnvironmentId --json 2>&1)
        if ($LASTEXITCODE -ne 0) { throw 'Connections unreadable through PAC connectivity (PAC 2.12.1+ required).' }
        $connection = @(((($raw -join "`n") | ConvertFrom-Json).value) | Where-Object name -EQ $rows[0].connectionid)
        if ($connection.Count -ne 1) { throw "Bound connection $($rows[0].connectionid) not found." }
        $properties = $connection[0].properties
        $parameters = $properties.connectionParameters
        if ($properties.apiId -ne $rows[0].connectorid) { throw 'Connector mismatch between reference and connection.' }
        if (@($properties.statuses | Where-Object status -NE 'Connected').Count -or -not @($properties.statuses).Count) { throw 'Connection is not Connected.' }
        if ($parameters.'token:grantType' -ne 'client_credentials' -or $parameters.'token:TenantId' -ne $TenantId.ToString()) { throw 'Connection is not a service-principal connection in this tenant.' }
        $context.RuntimeAppId = [guid] $parameters.'token:clientId'
        "$reference -> $($rows[0].connectionid); Connected; service principal $($context.RuntimeAppId)"
    }

    Test-Criterion 'Runtime role' {
        if (-not $context.RuntimeAppId) { throw 'Runtime application unknown (see Dataverse connection).' }
        $users = Get-Rows "systemusers?`$select=systemuserid,isdisabled&`$filter=applicationid eq $($context.RuntimeAppId)&`$expand=systemuserroles_association(`$select=name)"
        if ($users.Count -ne 1 -or $users[0].isdisabled) { throw 'Runtime application user missing or disabled.' }
        $roles = @($users[0].systemuserroles_association.name)
        if ($roles.Count -ne 1 -or $roles[0] -ne $spec.roleName) { throw "Application user roles are '$($roles -join ', ')'; expected only '$($spec.roleName)'." }
        $effective = @((Invoke-RestMethod -Headers $headers -Uri "$api/systemusers($($users[0].systemuserid))/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()").RolePrivileges)
        $rank = @{ Basic = 0; Local = 1; Deep = 2; Global = 3 }
        $verified = 0; $notApplicable = @(); $problems = @()
        foreach ($table in $spec.tables.PSObject.Properties) {
            $expectedDepth = if ($spec.tableDepths -and $spec.tableDepths.PSObject.Properties.Name -contains $table.Name) { $spec.tableDepths.($table.Name) } elseif ($spec.depth) { $spec.depth } else { 'Global' }
            $explicitDepth = $spec.tableDepths -and $spec.tableDepths.PSObject.Properties.Name -contains $table.Name
            $metadata = Invoke-RestMethod -Headers $headers -Uri "$api/EntityDefinitions(LogicalName='$($table.Name)')?`$select=Privileges"
            foreach ($privilege in $table.Value) {
                $definition = @($metadata.Privileges | Where-Object PrivilegeType -EQ $privilege)
                if (-not $definition.Count) { $notApplicable += "$($table.Name).$privilege"; continue }
                $grant = @($effective | Where-Object PrivilegeId -EQ $definition[0].PrivilegeId | Sort-Object { $rank[$_.Depth] } -Descending)
                if (-not $grant.Count) { $problems += "$($table.Name).$privilege missing" }
                elseif ($rank[$grant[0].Depth] -lt $rank[$expectedDepth]) { $problems += "$($table.Name).$privilege $($grant[0].Depth)<$expectedDepth" }
                elseif ($explicitDepth -and $grant[0].Depth -ne $expectedDepth) { $problems += "$($table.Name).$privilege $($grant[0].Depth)>$expectedDepth" }
                else { $verified++ }
            }
        }
        if ($problems) { throw ($problems -join '; ') }
        $note = if ($notApplicable) { "; n/a: $($notApplicable -join ', ')" } else { '' }
        "only $($spec.roleName); $verified specified privileges effective at expected depth$note"
    }

    Test-Criterion 'Monitoring agent' {
        $problems = [Collections.Generic.List[string]]::new()
        $tools = 0
        foreach ($botName in $package.Bots) {
            $bots = Get-Rows "bots?`$select=botid,statecode&`$filter=schemaname eq '$botName'"
            if ($bots.Count -ne 1 -or $bots[0].statecode -ne 0) { $problems.Add("$botName missing or inactive"); continue }
            $live = Get-Rows "botcomponents?`$select=schemaname,componenttype,data,statecode&`$filter=_parentbotid_value eq $($bots[0].botid)&`$expand=botcomponent_connectionreference(`$select=connectionreferenceid)"
            foreach ($schema in (@($package.Components.Keys) -like "$botName.*")) {
                $row = @($live | Where-Object schemaname -EQ $schema)
                if ($row.Count -ne 1 -or $row[0].statecode -ne 0) { $problems.Add("$schema missing or inactive"); continue }
                if (([string] $row[0].data).Replace("`r`n", "`n").TrimEnd() -cne $package.Components[$schema]) { $problems.Add("$schema differs from package"); continue }
                if ($row[0].componenttype -eq 9) {
                    $tools++
                    if ($row[0].data -notmatch '(?m)^authMode: Invoker\s*$' -or $row[0].data -notmatch "(?m)^connectionReference: $([regex]::Escape($package.ConnectionReferences[0]))\s*$") {
                        $problems.Add("$schema not Invoker on $($package.ConnectionReferences[0])")
                    }
                    if (@($row[0].botcomponent_connectionreference).Count -ne 1) { $problems.Add("$schema not linked to its connection reference; run link_agent_tools.ps1") }
                }
            }
        }
        if ($problems.Count) { throw ($problems -join '; ') }
        "$($package.Bots -join ', ') active; $($package.Components.Count) components match package; $tools tools Invoker and linked to $($package.ConnectionReferences[0])"
    }
} finally {
    Remove-Variable token, headers -ErrorAction SilentlyContinue
}

$overall = if (@($checks | Where-Object Status -NE 'Pass').Count) { 'Fail' } else { 'Pass' }
foreach ($check in $checks) { Write-Host ("{0} {1}: {2}" -f $check.Status.ToUpper(), $check.Check, $check.Evidence) }
Write-Host "Overall: $($overall.ToUpper()) ($(@($checks | Where-Object Status -EQ 'Pass').Count)/$($checks.Count) criteria)"
if ($PassThru) { [pscustomobject]@{ EnvironmentId = $EnvironmentId; OrganizationId = $OrganizationId; Package = "$($package.Name) $($package.Version)"; Overall = $overall; Checks = $checks.ToArray() } }
if ($overall -ne 'Pass' -and -not $PassThru) { exit 1 }
