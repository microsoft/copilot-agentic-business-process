#Requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$AppName = 'Workflow Console'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent

function Invoke-JsonCommand {
    param([string]$Command, [string[]]$Arguments)
    $output = & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed. Check authentication and permissions; no configuration was written."
    }
    try { return ($output -join "`n" | ConvertFrom-Json -AsHashtable) }
    catch { throw "$Command did not return valid JSON; no configuration was written." }
}

function Get-RemoteObject {
    param([string]$Url, [string]$Resource)
    $authentication = Invoke-JsonCommand az @('account', 'get-access-token', '--resource', $Resource, '--output', 'json', '--only-show-errors')
    try {
        $response = Invoke-WebRequest -Method Get -Uri $Url -Headers @{ Authorization = "Bearer $($authentication.accessToken)"; Accept = 'application/json' }
        return $response.Content | ConvertFrom-Json -AsHashtable
    }
    finally { $authentication = $null }
}

function Get-RemoteRows {
    param([string]$Url, [string]$Resource)
    $origin = ([uri]$Url).GetLeftPart([System.UriPartial]::Authority)
    $visited = [System.Collections.Generic.HashSet[string]]::new()
    do {
        if (-not $visited.Add($Url)) { throw 'Repeated pagination link.' }
        if (([uri]$Url).Scheme -ne 'https' -or ([uri]$Url).GetLeftPart([System.UriPartial]::Authority) -ne $origin) {
            throw 'Unexpected pagination origin.'
        }
        $page = Get-RemoteObject $Url $Resource
        if (-not $page.Contains('value')) { throw 'Expected a collection response.' }
        foreach ($row in $page.value) { $row }
        $Url = if ($page.Contains('@odata.nextLink')) { $page['@odata.nextLink'] }
            elseif ($page.Contains('nextLink')) { $page.nextLink }
            else { $null }
    } while ($Url)
}

function Select-Entry {
    param([array]$Items, [string]$Prompt, [scriptblock]$Label)
    if ($Items.Count -eq 0) { throw "No entries available: $Prompt" }
    for ($index = 0; $index -lt $Items.Count; $index++) {
        Write-Host ('{0}. {1}' -f ($index + 1), (& $Label $Items[$index]))
    }
    while ($true) {
        $answer = Read-Host "$Prompt (1-$($Items.Count), or q to cancel)"
        if ($answer -eq 'q') { throw 'Cancelled; no configuration was written.' }
        $selection = 0
        if ([int]::TryParse($answer, [ref]$selection) -and $selection -ge 1 -and $selection -le $Items.Count) {
            return $Items[$selection - 1]
        }
        Write-Host 'Enter a listed number or q.'
    }
}

Get-Command az, npx -ErrorAction Stop | Out-Null
if (-not (Test-Path (Join-Path $projectRoot 'node_modules/@microsoft/power-apps-cli/package.json'))) {
    throw 'Run npm ci in the app directory first.'
}
$configPath = Join-Path $projectRoot 'power.config.json'
$initialContent = if (Test-Path $configPath) { [IO.File]::ReadAllText($configPath) } else { $null }
$config = Get-Content (Join-Path $projectRoot 'power.config.template.json') -Raw | ConvertFrom-Json -AsHashtable

Push-Location $projectRoot
try {
    Write-Host 'Uses Azure CLI and pa authentication. Sign in to the same tenant/account in both tools.'
    $environments = @(Get-RemoteRows 'https://api.powerapps.com/providers/Microsoft.PowerApps/environments?api-version=2016-11-01' 'https://service.powerapps.com/' |
        Where-Object { $_.properties.Contains('linkedEnvironmentMetadata') -and
            $_.properties.linkedEnvironmentMetadata -and
            ($_.properties.linkedEnvironmentMetadata.Contains('instanceApiUrl') -or $_.properties.linkedEnvironmentMetadata.Contains('instanceUrl')) } |
        Sort-Object { $_.properties.displayName })
    $environment = Select-Entry $environments 'Where is Workflow Console already deployed?' {
        param($entry)
        "$($entry.properties.displayName) [$($entry.name)]"
    }
    $environmentId = [string]$environment.name
    $metadata = $environment.properties.linkedEnvironmentMetadata
    $orgUrl = ([string]$(if ($metadata.Contains('instanceApiUrl') -and $metadata.instanceApiUrl) {
        $metadata.instanceApiUrl
    } else { $metadata.instanceUrl })).TrimEnd('/')
    if (([uri]$orgUrl).Scheme -ne 'https') { throw 'Expected an HTTPS Dataverse URL.' }

    $appResponse = Invoke-JsonCommand npx @('--no-install', 'pa', 'app', 'list', '--environment-id', $environmentId, '--json', '--non-interactive')
    $appItems = if ($appResponse -is [Collections.IDictionary] -and $appResponse.Contains('items')) {
        if ($appResponse.Contains('success') -and -not $appResponse.success) { throw 'Power Apps CLI could not list apps.' }
        @($appResponse.items)
    } else { @($appResponse) }
    $apps = @($appItems | Where-Object { $_.name -eq $AppName })
    $app = Select-Entry $apps "Select the existing '$AppName' app" {
        param($entry)
        "$($entry.name) [$($entry.appId)]"
    }
    $appId = [guid]::Parse($app.appId)
    if ($appId -eq [guid]::Empty) { throw 'The existing app must have a nonempty ID.' }

    $publishedApp = Get-RemoteObject "https://api.powerapps.com/providers/Microsoft.PowerApps/apps/$($appId)?api-version=2016-11-01" 'https://service.powerapps.com/'
    if ($publishedApp.name -ne $appId.ToString() -or $publishedApp.properties.environment.name -ne $environmentId) {
        throw 'Published app identity or environment mismatch.'
    }
    $publishedReferences = $publishedApp.properties.connectionReferences
    $resolvedReferences = [ordered]@{}
    foreach ($reference in $config.connectionReferences.Values) {
        $logicalName = $reference.xrmConnectionReferenceLogicalName
        $filter = [uri]::EscapeDataString("connectionreferencelogicalname eq '$($logicalName.Replace("'", "''"))'")
        $url = "$orgUrl/api/data/v9.2/connectionreferences?`$select=connectionreferencelogicalname,connectionid,connectorid&`$filter=$filter"
        $matches = @(Get-RemoteRows $url $orgUrl)
        if ($matches.Count -ne 1) { throw "Expected exactly one connection reference: $logicalName" }
        $binding = $matches[0]
        if (-not $binding.Contains('connectionid') -or -not $binding.connectionid) { throw "Connection reference is unbound: $logicalName" }
        if (-not $binding.Contains('connectorid') -or $binding.connectorid -ne $reference.id) { throw "Connector mismatch: $logicalName" }
        $referenceKeys = @($publishedReferences.Keys | Where-Object {
            $candidate = $publishedReferences[$_]
            $candidate.id -eq $reference.id -and
                @($reference.dataSources | Where-Object { $_ -notin $candidate.dataSources }).Count -eq 0 -and
                @($candidate.dataSources | Where-Object { $_ -notin $reference.dataSources }).Count -eq 0 -and
                (-not $candidate.Contains('xrmConnectionReferenceLogicalName') -or
                    -not $candidate.xrmConnectionReferenceLogicalName -or
                    $candidate.xrmConnectionReferenceLogicalName -eq $logicalName)
        })
        if ($referenceKeys.Count -ne 1) { throw "Expected exactly one published app reference: $logicalName" }
        $referenceKey = $referenceKeys[0]
        if ($resolvedReferences.Contains($referenceKey)) { throw 'Duplicate published app reference key.' }
        foreach ($field in @('sharedConnectionId', 'authenticationType')) {
            if ($publishedReferences[$referenceKey].Contains($field) -and $publishedReferences[$referenceKey][$field]) {
                $reference[$field] = $publishedReferences[$referenceKey][$field]
            } else { $reference.Remove($field) | Out-Null }
        }
        $resolvedReferences[$referenceKey] = $reference
    }
    $config.appId = $appId.ToString()
    $config.appDisplayName = $app.name
    $config.environmentId = $environmentId
    $config.connectionReferences = $resolvedReferences

    Write-Host "Environment: $($environment.properties.displayName) [$environmentId]"
    Write-Host "Existing app: $($app.name) [$appId]"
    Write-Host "Resolved connection references: $($resolvedReferences.Count)"
    if (-not $PSCmdlet.ShouldProcess($configPath, 'Write local configuration for the selected existing app')) { return }
    $verb = if ($null -ne $initialContent) { 'Replace existing' } else { 'Create' }
    if ((Read-Host "$verb power.config.json? No remote changes will be made. Type yes to confirm") -cne 'yes') {
        Write-Host 'Cancelled; no configuration was written.'
        return
    }
    $currentContent = if (Test-Path $configPath) { [IO.File]::ReadAllText($configPath) } else { $null }
    if ($currentContent -cne $initialContent) { throw 'Configuration changed during selection; rerun before overwriting it.' }
    if ($null -ne $initialContent) {
        $backup = "$configPath.$([guid]::NewGuid().ToString('N')).local"
        Copy-Item -LiteralPath $configPath -Destination $backup
        Write-Host "Previous configuration backed up to $backup"
    }
    $temporaryPath = "$configPath.$([guid]::NewGuid().ToString('N')).local"
    try {
        [IO.File]::WriteAllText($temporaryPath, ($config | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))
        [IO.File]::Move($temporaryPath, $configPath, $true)
    }
    finally {
        if (Test-Path $temporaryPath) { Remove-Item -LiteralPath $temporaryPath }
    }
    Write-Host 'Linked locally. Generated code and metadata are unchanged. Nothing was deployed.'
}
finally { Pop-Location }