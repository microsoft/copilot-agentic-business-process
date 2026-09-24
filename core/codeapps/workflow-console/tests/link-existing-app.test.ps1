#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('workflow-console-link-' + [guid]::NewGuid().ToString('N'))
$environmentId = '11111111-1111-1111-1111-111111111111'
$appId = '22222222-2222-2222-2222-222222222222'
$connectionId = '33333333-3333-3333-3333-333333333333'
$referenceKey = '44444444-4444-4444-4444-444444444444'
$connectorId = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
$scenario = 'success'
$answers = $null
$calls = $null
$global:WorkflowConsoleLinkTest = @{}

function Read-Host {
    param([string]$Prompt)
    if ($global:WorkflowConsoleLinkTest.answers.Count -eq 0) { throw "Unexpected prompt: $Prompt" }
    return $global:WorkflowConsoleLinkTest.answers.Dequeue()
}

function az {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    $global:LASTEXITCODE = 0
    $state = $global:WorkflowConsoleLinkTest
    $state.calls.Add(($Arguments -join ' '))
    if ($state.scenario -eq 'auth-failure') { $global:LASTEXITCODE = 1; return }
    if ($Arguments[0] -ne 'account' -or $Arguments[1] -ne 'get-access-token') { throw 'Only token acquisition is allowed.' }
    return '{"accessToken":"test-token"}'
}

function New-JsonResponse {
    param([hashtable]$Body)
    return @{ Content = $Body | ConvertTo-Json -Depth 20 -Compress }
}

function Invoke-WebRequest {
    param([string]$Method, [string]$Uri, [hashtable]$Headers)
    $state = $global:WorkflowConsoleLinkTest
    if ($Method -ne 'Get' -or $Headers.Authorization -ne 'Bearer test-token') { throw 'Unexpected HTTP request.' }
    $url = $Uri
    $state.calls.Add($url)
    if ($url -like 'https://api.powerapps.com/providers/Microsoft.PowerApps/apps/*') {
        $reference = @{ id = $state.connectorId; dataSources = @('commondataserviceforapps') }
        if ($state.scenario -eq 'shared-binding') {
            $reference.sharedConnectionId = "$($state.connectorId)/connections/$($state.connectionId)"
            $reference.authenticationType = 'test-authentication'
        }
        $references = @{ $state.referenceKey = $reference }
        if ($state.scenario -eq 'missing-app-reference') { $references.Clear() }
        if ($state.scenario -eq 'ambiguous-app-reference') { $references['another-key'] = $reference }
        if ($state.scenario -eq 'wrong-data-source') { $reference.dataSources = @('other') }
        if ($state.scenario -eq 'wrong-logical-name') { $reference.xrmConnectionReferenceLogicalName = 'other' }
        $environment = if ($state.scenario -eq 'wrong-environment') { 'other' } else { $state.environmentId }
        return New-JsonResponse @{ name = $state.appId; properties = @{ environment = @{ name = $environment }; connectionReferences = $references } }
    }
    if ($url -like 'https://api.powerapps.com/*') {
        if ($url -notmatch 'page=2') {
            return New-JsonResponse @{ value = @(@{ name = 'no-dataverse'; properties = @{ displayName = 'No Dataverse' } }); nextLink = 'https://api.powerapps.com/environments?page=2' }
        }
        return New-JsonResponse @{ value = @(@{ name = $state.environmentId; properties = @{ displayName = 'Test Environment'; linkedEnvironmentMetadata = @{ instanceApiUrl = 'https://example.crm.dynamics.com' } } }) }
    }
    if ($url -notlike 'https://example.crm.dynamics.com/api/data/v9.2/connectionreferences?*' -or
        [uri]::UnescapeDataString($url) -notlike "*connectionreferencelogicalname eq 'faf001_sharedcommondataserviceforapps'*") {
        throw "Unexpected request: $url"
    }
    $binding = @{ connectionid = "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps/connections/$($state.connectionId)"; connectorid = $state.connectorId }
    if ($state.scenario -eq 'unbound') { $binding.Remove('connectionid') }
    if ($state.scenario -eq 'wrong-connector') { $binding.connectorid = 'wrong' }
    $rows = @($binding)
    if ($state.scenario -eq 'missing-reference') { $rows = @() }
    if ($state.scenario -eq 'duplicate-reference') { $rows = @($binding, $binding) }
    return New-JsonResponse @{ value = $rows }
}

function npx {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    $global:LASTEXITCODE = 0
    $state = $global:WorkflowConsoleLinkTest
    $state.calls.Add(($Arguments -join ' '))
    if (($Arguments -join ' ') -ne "--no-install pa app list --environment-id $($state.environmentId) --json --non-interactive") {
        throw 'Unexpected pa command; code generation and deployment are forbidden.'
    }
    $rows = @(@{ name = 'Workflow Console'; appId = $state.appId })
    if ($state.scenario -eq 'no-app') { $rows = @() }
    return ConvertTo-Json -InputObject $rows -Depth 10
}

try {
    New-Item "$testRoot/scripts", "$testRoot/node_modules/@microsoft/power-apps-cli" -ItemType Directory -Force | Out-Null
    Copy-Item "$projectRoot/scripts/link-existing-app.ps1" "$testRoot/scripts/"
    Copy-Item "$projectRoot/power.config.template.json" $testRoot
    Copy-Item "$projectRoot/package.json" "$testRoot/node_modules/@microsoft/power-apps-cli/package.json"
    $configPath = "$testRoot/power.config.json"
    foreach ($scenario in @('success', 'overwrite', 'shared-binding', 'decline', 'cancel', 'whatif', 'unbound', 'wrong-connector', 'missing-reference', 'duplicate-reference', 'no-app', 'auth-failure', 'missing-app-reference', 'ambiguous-app-reference', 'wrong-data-source', 'wrong-logical-name', 'wrong-environment')) {
        if (Test-Path $configPath) { Remove-Item $configPath }
        if ($scenario -eq 'overwrite') { Copy-Item "$projectRoot/power.config.template.json" $configPath }
        $answers = [System.Collections.Generic.Queue[string]]::new()
        $calls = [System.Collections.Generic.List[string]]::new()
        foreach ($answer in @('invalid', '1', '1', 'yes')) { $answers.Enqueue($answer) }
        if ($scenario -eq 'cancel') { $answers.Clear(); $answers.Enqueue('q') }
        if ($scenario -eq 'decline') { $answers.Clear(); foreach ($answer in @('1', '1', 'no')) { $answers.Enqueue($answer) } }
        $failure = $null
        $global:WorkflowConsoleLinkTest = @{ scenario = $scenario; answers = $answers; calls = $calls; environmentId = $environmentId; appId = $appId; connectionId = $connectionId; referenceKey = $referenceKey; connectorId = $connectorId }
        try { & "$testRoot/scripts/link-existing-app.ps1" -WhatIf:($scenario -eq 'whatif') }
        catch { $failure = $_ }
        $expectedError = switch ($scenario) {
            'cancel' { 'Cancelled' }
            'unbound' { 'unbound' }
            'wrong-connector' { 'Connector mismatch' }
            'missing-reference' { 'exactly one connection reference' }
            'duplicate-reference' { 'exactly one connection reference' }
            'no-app' { 'No entries available' }
            'auth-failure' { 'az failed' }
            'missing-app-reference' { 'exactly one published app reference' }
            'ambiguous-app-reference' { 'exactly one published app reference' }
            'wrong-data-source' { 'exactly one published app reference' }
            'wrong-logical-name' { 'exactly one published app reference' }
            'wrong-environment' { 'identity or environment mismatch' }
        }
        if ($expectedError) {
            if (-not $failure -or $failure.ToString() -notmatch $expectedError) { throw "${scenario}: unexpected failure: $failure" }
        } elseif ($failure) { throw $failure }
        if ($scenario -in @('success', 'overwrite', 'shared-binding')) {
            $config = Get-Content $configPath -Raw | ConvertFrom-Json -AsHashtable
            if ($config.appId -ne $appId -or $config.environmentId -ne $environmentId -or -not $config.connectionReferences.Contains($referenceKey) -or $config.connectionReferences.Contains($connectionId)) {
                throw "${scenario}: incorrect resolved identities."
            }
            $template = Get-Content "$testRoot/power.config.template.json" -Raw | ConvertFrom-Json -AsHashtable
            if (($template.databaseReferences | ConvertTo-Json -Depth 50 -Compress) -cne ($config.databaseReferences | ConvertTo-Json -Depth 50 -Compress)) {
                throw 'Database references changed.'
            }
            $reference = $config.connectionReferences[$referenceKey]
            if ($reference.xrmConnectionReferenceLogicalName -ne 'faf001_sharedcommondataserviceforapps') { throw 'Logical name changed.' }
            if ($scenario -eq 'shared-binding') {
                if ($reference.sharedConnectionId -ne "$connectorId/connections/$connectionId" -or $reference.authenticationType -ne 'test-authentication') { throw 'Published binding fields changed.' }
            } elseif ($reference.Contains('sharedConnectionId') -or $reference.Contains('authenticationType')) { throw 'Invented binding fields.' }
            if ($scenario -eq 'overwrite' -and @(Get-ChildItem "$configPath.*.local").Count -ne 1) { throw 'Missing backup.' }
        } elseif (Test-Path $configPath) { throw "${scenario}: unexpected config write." }
        Write-Host "PASS: $scenario"
    }
}
finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
    Remove-Variable WorkflowConsoleLinkTest -Scope Global
}