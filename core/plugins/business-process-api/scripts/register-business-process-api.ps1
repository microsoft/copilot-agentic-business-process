#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$EnvironmentUrl,

    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_]*$')]
    [string]$SolutionUniqueName,

    [Parameter(Mandatory)]
    [guid]$ExpectedOrganizationId,

    [Parameter(Mandatory)]
    [string[]]$SpecPath,

    [string]$PackagePath,

    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$environment = $EnvironmentUrl.AbsoluteUri.TrimEnd('/')
$validEnvironmentUrl = $EnvironmentUrl.Scheme -eq 'https' -and $EnvironmentUrl.IsDefaultPort -and
    $EnvironmentUrl.AbsolutePath -eq '/' -and -not $EnvironmentUrl.Query -and
    -not $EnvironmentUrl.Fragment -and -not $EnvironmentUrl.UserInfo
if (-not $validEnvironmentUrl) {
    throw 'EnvironmentUrl must be an HTTPS Dataverse root URL with no path, query, fragment, credentials, or custom port.'
}
if ($ExpectedOrganizationId -eq [guid]::Empty) {
    throw 'ExpectedOrganizationId must be a nonempty Dataverse organization GUID.'
}

if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $packages = @(Get-ChildItem -Path (Join-Path $repositoryRoot 'artifacts/package') `
        -Filter '*.nupkg' -File -ErrorAction SilentlyContinue |
        Where-Object Name -NotLike '*.symbols.nupkg')
    if ($packages.Count -ne 1) {
        throw "Expected one package in artifacts/package but found $($packages.Count). Run scripts/build-package.ps1 first or specify -PackagePath."
    }
    $PackagePath = $packages[0].FullName
}
else {
    $PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
}

$packageBytes = [IO.File]::ReadAllBytes($PackagePath)
$archive = [IO.Compression.ZipFile]::OpenRead($PackagePath)
try {
    $manifests = @($archive.Entries | Where-Object FullName -Like '*.nuspec')
    if ($manifests.Count -ne 1) { throw 'The package must contain exactly one NuGet manifest.' }
    $reader = [IO.StreamReader]::new($manifests[0].Open())
    try { [xml]$manifest = $reader.ReadToEnd() }
    finally { $reader.Dispose() }
    $packageId = [string]$manifest.package.metadata.id
    $packageVersion = [string]$manifest.package.metadata.version
    if ([string]::IsNullOrWhiteSpace($packageId) -or [string]::IsNullOrWhiteSpace($packageVersion)) {
        throw 'The package manifest must define an ID and version.'
    }
    $libraries = @($archive.Entries | Where-Object FullName -Like 'lib/*.dll')
    if ($libraries.Count -ne 1) { throw 'The package must contain exactly one plug-in assembly under lib/.' }
    $assemblyName = [IO.Path]::GetFileNameWithoutExtension($libraries[0].FullName)
}
finally {
    $archive.Dispose()
}

$specFiles = foreach ($candidate in $SpecPath) {
    foreach ($resolvedPath in @(Resolve-Path -Path $candidate -ErrorAction Stop)) {
        $item = Get-Item -LiteralPath $resolvedPath.Path
        if ($item.PSIsContainer) {
            Get-ChildItem -LiteralPath $item.FullName -Filter '*.json' -File
        }
        elseif ($item.Extension -eq '.json') {
            $item
        }
        else {
            throw "SpecPath must resolve only to JSON files or directories: $candidate"
        }
    }
}
$specFiles = @($specFiles | Sort-Object FullName -Unique)
if ($specFiles.Count -eq 0) { throw 'SpecPath did not resolve to any JSON specifications.' }

$definitions = @($specFiles | ForEach-Object {
    $definition = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json -AsHashtable
    $validUniqueName = -not [string]::IsNullOrWhiteSpace([string]$definition.uniquename) -and
        $definition.uniquename -ceq $_.BaseName
    if (-not $validUniqueName) {
        throw "Specification uniquename must match its file name: $($_.FullName)"
    }
    if ([string]::IsNullOrWhiteSpace([string]$definition.pluginTypeName)) {
        throw "Specification must define pluginTypeName: $($_.FullName)"
    }
    $definition
})
if (@($definitions.uniquename | Sort-Object -Unique).Count -ne $definitions.Count) {
    throw 'SpecPath contains duplicate Custom API unique names.'
}

function ConvertTo-ODataStringLiteral {
    param([Parameter(Mandatory)][string]$Value)
    return $Value.Replace("'", "''")
}

function Get-DataverseToken {
    $token = & az account get-access-token --resource $environment --query accessToken -o tsv
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
        throw "Azure CLI could not acquire a Dataverse token for $environment. Run az login for the target tenant."
    }
    return $token.Trim()
}

$headers = @{
    Authorization = "Bearer $(Get-DataverseToken)"
    'OData-MaxVersion' = '4.0'
    'OData-Version' = '4.0'
    Accept = 'application/json'
    'Content-Type' = 'application/json; charset=utf-8'
}

function Invoke-Dataverse {
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST', 'PATCH')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [hashtable]$Body,
        [switch]$InSolution
    )
    $requestHeaders = $headers.Clone()
    if ($InSolution) { $requestHeaders['MSCRM.SolutionUniqueName'] = $SolutionUniqueName }
    $parameters = @{
        Uri = "$environment/api/data/v9.2/$Path"
        Method = $Method
        Headers = $requestHeaders
    }
    if ($null -ne $Body) { $parameters.Body = $Body | ConvertTo-Json -Depth 20 -Compress }
    return Invoke-RestMethod @parameters
}

function Get-SingleRecord {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Description)
    $result = Invoke-Dataverse -Method GET -Path $Path
    $records = @($result.value | Where-Object { $null -ne $_ })
    $recordCount = $records.Count
    if ($recordCount -ne 1) {
        throw "Expected exactly one $Description but found $recordCount."
    }
    return $records[0]
}

function Get-ApiRegistration {
    param([Parameter(Mandatory)][string]$Name)
    $escapedName = ConvertTo-ODataStringLiteral $Name
    $result = Invoke-Dataverse -Method GET `
        -Path "customapis?`$filter=uniquename eq '$escapedName'&`$expand=CustomAPIRequestParameters,CustomAPIResponseProperties"
    $records = @($result.value | Where-Object { $null -ne $_ })
    $recordCount = $records.Count
    if ($recordCount -gt 1) { throw "Duplicate Custom API registration: $Name" }
    if ($recordCount -eq 1) {
        return $records[0] | ConvertTo-Json -Depth 20 | ConvertFrom-Json -AsHashtable
    }
    return $null
}

function Assert-ApiContract {
    param(
        [Parameter(Mandatory)][hashtable]$Actual,
        [Parameter(Mandatory)][hashtable]$Expected,
        [Parameter(Mandatory)][guid]$PluginTypeId
    )
    $ignoredProperties = @('pluginTypeName', 'CustomAPIRequestParameters', 'CustomAPIResponseProperties')
    foreach ($key in $Expected.Keys | Where-Object { $_ -notin $ignoredProperties }) {
        if (-not $Actual.Contains($key) -or $Actual[$key] -cne $Expected[$key]) {
            throw "Custom API contract mismatch: $($Expected.uniquename).$key"
        }
    }
    if ([guid]$Actual._plugintypeid_value -ne $PluginTypeId) {
        throw "Custom API plug-in binding mismatch: $($Expected.uniquename)"
    }
    foreach ($collection in @('CustomAPIRequestParameters', 'CustomAPIResponseProperties')) {
        $expectedItems = @(if ($Expected.Contains($collection)) { $Expected[$collection] })
        $actualItems = @(if ($Actual.Contains($collection)) { $Actual[$collection] })
        if ($actualItems.Count -ne $expectedItems.Count) {
            throw "Custom API parameter count mismatch: $($Expected.uniquename).$collection"
        }
        foreach ($expectedItem in $expectedItems) {
            $matches = @($actualItems | Where-Object { $_.uniquename -ceq $expectedItem.uniquename })
            if ($matches.Count -ne 1) { throw "Missing or duplicate API parameter: $($expectedItem.uniquename)" }
            foreach ($key in $expectedItem.Keys) {
                if ($matches[0][$key] -cne $expectedItem[$key]) {
                    throw "Custom API parameter mismatch: $($expectedItem.uniquename).$key"
                }
            }
        }
    }
}

function Assert-SolutionMembership {
    param(
        [Parameter(Mandatory)][guid]$SolutionId,
        [Parameter(Mandatory)][guid]$ObjectId,
        [Parameter(Mandatory)][string]$Description
    )
    $membership = Invoke-Dataverse -Method GET `
        -Path "solutioncomponents?`$select=objectid&`$filter=_solutionid_value eq $SolutionId and objectid eq $ObjectId"
    $components = @($membership.value | Where-Object { $null -ne $_ })
    if ($components.Count -ne 1) { throw "$Description is not a member of solution $SolutionUniqueName." }
}

function Get-PackageRuntime {
    param([Parameter(Mandatory)][guid]$PluginPackageId)
    $assembly = Get-SingleRecord `
        -Path "pluginassemblies?`$select=pluginassemblyid,name&`$filter=_packageid_value eq $PluginPackageId" `
        -Description 'package assembly'
    if ($assembly.name -cne $assemblyName) { throw "Unexpected registered assembly: $($assembly.name)." }
    $types = Invoke-Dataverse -Method GET `
        -Path "plugintypes?`$select=plugintypeid,typename&`$filter=_pluginassemblyid_value eq $($assembly.pluginassemblyid)"
    return [pscustomobject]@{ Assembly = $assembly; Types = @($types.value) }
}

function Get-MatchingPluginType {
    param([Parameter(Mandatory)]$Types, [Parameter(Mandatory)][hashtable]$Definition)
    $matches = @($Types | Where-Object typename -CEQ $Definition.pluginTypeName)
    if ($matches.Count -ne 1) {
        throw "Expected one registered plug-in type named $($Definition.pluginTypeName)."
    }
    return $matches[0]
}

$identity = Invoke-Dataverse -Method GET -Path 'WhoAmI'
if ([guid]$identity.OrganizationId -ne $ExpectedOrganizationId) {
    throw "Connected organization $($identity.OrganizationId) does not match ExpectedOrganizationId $ExpectedOrganizationId."
}

$escapedSolutionName = ConvertTo-ODataStringLiteral $SolutionUniqueName
$solution = Get-SingleRecord `
    -Path "solutions?`$select=solutionid,ismanaged,_publisherid_value&`$filter=uniquename eq '$escapedSolutionName'" `
    -Description "solution named $SolutionUniqueName"
if ($solution.ismanaged) { throw 'The target solution must be unmanaged.' }
$publisher = Invoke-Dataverse -Method GET `
    -Path "publishers($($solution._publisherid_value))?`$select=customizationprefix"
$publisherPrefix = [string]$publisher.customizationprefix
if ([string]::IsNullOrWhiteSpace($publisherPrefix)) { throw 'The target solution publisher has no customization prefix.' }
foreach ($definition in $definitions) {
    if (-not $definition.uniquename.StartsWith($publisherPrefix + '_', [StringComparison]::Ordinal)) {
        throw "Specification $($definition.uniquename) does not use solution publisher prefix $publisherPrefix."
    }
}

$packageRegistrationName = "${publisherPrefix}_$packageId"
$escapedPackageId = ConvertTo-ODataStringLiteral $packageId
$escapedRegistrationName = ConvertTo-ODataStringLiteral $packageRegistrationName
$packageResult = Invoke-Dataverse -Method GET -Path (
    "pluginpackages?`$select=pluginpackageid,name,uniquename,version&`$filter=" +
    "name eq '$escapedPackageId' or name eq '$escapedRegistrationName' or uniquename eq '$escapedRegistrationName'")
$packages = @($packageResult.value | Where-Object { $null -ne $_ })
$packageCount = $packages.Count
if ($packageCount -gt 1) { throw 'Multiple matching plug-in packages make registration ambiguous.' }
$package = if ($packageCount -eq 1) { $packages[0] } else { $null }

$registrations = @{}
foreach ($definition in $definitions) {
    $registrations[$definition.uniquename] = Get-ApiRegistration -Name $definition.uniquename
}
if ($null -eq $package -and @($registrations.Values | Where-Object { $null -ne $_ }).Count -ne 0) {
    throw 'Custom APIs exist without the expected package. Inspect and repair the partial registration manually.'
}

if ($null -ne $package) {
    Assert-SolutionMembership -SolutionId $solution.solutionid -ObjectId $package.pluginpackageid -Description 'Plug-in package'
    $runtime = Get-PackageRuntime -PluginPackageId $package.pluginpackageid
    foreach ($definition in $definitions) {
        $registration = $registrations[$definition.uniquename]
        if ($null -eq $registration) { continue }
        $pluginType = Get-MatchingPluginType -Types $runtime.Types -Definition $definition
        Assert-ApiContract -Actual $registration -Expected $definition -PluginTypeId $pluginType.plugintypeid
        Assert-SolutionMembership -SolutionId $solution.solutionid `
            -ObjectId $registration.customapiid -Description "Custom API $($definition.uniquename)"
    }
}

$operation = if ($null -eq $package) { 'register' } else { 'update' }
Write-Host "Preflight passed for $environment"
Write-Host "Organization: $ExpectedOrganizationId"
Write-Host "Solution:     $SolutionUniqueName"
Write-Host "Package:      $packageId $packageVersion ($operation)"
Write-Host "Specifications: $($definitions.Count)"
if (-not $Apply) {
    Write-Host "No changes made. Repeat with -Apply to $operation the package and reconcile missing Custom APIs."
    return
}

if ($null -eq $package) {
    Invoke-Dataverse -Method POST -Path 'pluginpackages' -InSolution -Body @{
        name = $packageRegistrationName
        uniquename = $packageRegistrationName
        version = $packageVersion
        content = [Convert]::ToBase64String($packageBytes)
    } | Out-Null
}
else {
    Invoke-Dataverse -Method PATCH -Path "pluginpackages($($package.pluginpackageid))" -Body @{
        version = $packageVersion
        content = [Convert]::ToBase64String($packageBytes)
    } | Out-Null
}

$package = Get-SingleRecord `
    -Path "pluginpackages?`$select=pluginpackageid,name,uniquename,version&`$filter=uniquename eq '$escapedRegistrationName'" `
    -Description "registered package $packageRegistrationName"
Assert-SolutionMembership -SolutionId $solution.solutionid -ObjectId $package.pluginpackageid -Description 'Plug-in package'
$runtime = Get-PackageRuntime -PluginPackageId $package.pluginpackageid

foreach ($definition in $definitions) {
    $pluginType = Get-MatchingPluginType -Types $runtime.Types -Definition $definition
    $registration = Get-ApiRegistration -Name $definition.uniquename
    if ($null -eq $registration) {
        $body = $definition.Clone()
        $body.Remove('pluginTypeName')
        $body['PluginTypeId@odata.bind'] = "plugintypes($($pluginType.plugintypeid))"
        Invoke-Dataverse -Method POST -Path 'customapis' -InSolution -Body $body | Out-Null
        $registration = Get-ApiRegistration -Name $definition.uniquename
    }
    if ($null -eq $registration) { throw "Custom API was not found after creation: $($definition.uniquename)" }
    Assert-ApiContract -Actual $registration -Expected $definition -PluginTypeId $pluginType.plugintypeid
    Assert-SolutionMembership -SolutionId $solution.solutionid `
        -ObjectId $registration.customapiid -Description "Custom API $($definition.uniquename)"
    Write-Host "Verified $($definition.uniquename): $($registration.customapiid)"
}

Write-Host "Package $operation complete. Package ID: $($package.pluginpackageid)"