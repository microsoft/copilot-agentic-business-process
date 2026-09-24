#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$tenantId = '11111111-1111-1111-1111-111111111111'
$environmentId = '22222222-2222-2222-2222-222222222222'
$organizationId = '33333333-3333-3333-3333-333333333333'
$fixtureOperatorId = '44444444-4444-4444-4444-444444444444'
$groupId = '55555555-5555-5555-5555-555555555555'
$testState = @{ Scenario = ''; Unexpected = [Collections.Generic.List[string]]::new(); Calls = [Collections.Generic.List[string]]::new() }

function az {
    $global:LASTEXITCODE = 0
    if ($args[0] -ne 'account') { throw 'Only read-only Azure CLI account commands are allowed.' }
    if ($args[1] -eq 'show') {
        return (@{ tenantId = $(if ($testState.Scenario -eq 'WrongTenant') { 'wrong' } else { $tenantId }); environmentName = 'AzureCloud'; user = @{ type = 'user'; name = 'operator@example.com' } } | ConvertTo-Json)
    }
    if ($args[1] -eq 'get-access-token') { return 'mock-secret-token' }
    throw 'Unexpected Azure CLI command.'
}

function Invoke-RestMethod {
    [CmdletBinding()]
    param([string] $Method, [string] $Uri, [hashtable] $Headers)
    if ($Method -ne 'Get') { throw 'Report must never write.' }
    $testState.Calls.Add($Uri)
    if ($Uri -like '*/me[?]*') { return @{ id = $fixtureOperatorId; userPrincipalName = 'operator@example.com' } }
    if ($Uri -like '*/me/memberOf/*') { return @{ value = @(@{ id = $groupId }) } }
    if ($Uri -like '*/roleManagement/directory/roleAssignments?*') {
        if ($testState.Scenario -eq 'DeniedRoles') { throw 'Forbidden mock-secret-token' }
        $decoded = [uri]::UnescapeDataString($Uri)
        if ($testState.Scenario -eq 'NoRole' -or ($testState.Scenario -eq 'GroupRole' -and $decoded -notlike "*$groupId*")) { return @{ value = @() } }
        if ($testState.Scenario -eq 'PagedRole' -and $Uri -notlike '*page=2*') { return @{ value = @(); '@odata.nextLink' = $Uri + '&page=2' } }
        return @{ value = @(@{
            directoryScopeId = $(if ($testState.Scenario -eq 'ScopedRole') { '/administrativeUnits/unit' } else { '/' })
            roleDefinition = @{ templateId = '11648597-926c-4cf3-9c36-bcebb0ba8dcc'; displayName = 'Power Platform Administrator' }
        }) }
    }
    if ($Uri -like '*/subscribedSkus') {
        if ($testState.Scenario -eq 'DeniedSubscriptions') { throw 'Forbidden' }
        return @{ value = @(@{ skuId = 'sku'; skuPartNumber = 'TEST'; capabilityStatus = $(if ($testState.Scenario -eq 'DisabledSubscription') { 'Suspended' } else { 'Enabled' }); prepaidUnits = @{ enabled = 10 }; consumedUnits = 10 }) }
    }
    if ($Uri -like '*/licenseDetails') {
        $plans = @('POWERAPPS_PER_USER', 'MOCK_COPILOT_USER_PLAN', 'TEAMS1', 'EXCHANGE_S_STANDARD') | ForEach-Object {
            @{ servicePlanName = $_; provisioningStatus = $(if ($testState.Scenario -eq 'PendingLicense') { 'PendingProvisioning' } else { 'Success' }); appliesTo = $(if ($testState.Scenario -eq 'CompanyPlan') { 'Company' } else { 'User' }) }
        }
        return @{ value = @(@{ skuId = 'sku'; skuPartNumber = 'VIRTUAL_AGENT_USL'; servicePlans = @($plans) }) }
    }
    if ($Uri -like '*/users/*') {
        return @{ id = $fixtureOperatorId; userPrincipalName = 'operator@example.com'; accountEnabled = ($testState.Scenario -ne 'DisabledUser'); usageLocation = 'US' }
    }
    if ($Uri -like 'https://globaldisco.crm.dynamics.com/*') {
        if ($testState.Scenario -eq 'MissingEnvironment') { return @{ value = @() } }
        return @{ value = @(@{
            Id = $organizationId; EnvironmentId = $environmentId
            TenantId = $(if ($testState.Scenario -eq 'WrongEnvironmentTenant') { 'wrong' } else { $tenantId })
            ApiUrl = 'https://example.api.crm.dynamics.com'; Url = 'https://example.crm.dynamics.com'
            State = 0; IsUserSysAdmin = ($testState.Scenario -ne 'CustomRole')
        }) }
    }
    if ($Uri -eq 'https://example.api.crm.dynamics.com/api/data/v9.2/WhoAmI') {
        return @{ OrganizationId = $(if ($testState.Scenario -eq 'WrongOrganization') { 'wrong' } else { $organizationId }); UserId = $fixtureOperatorId }
    }
    $testState.Unexpected.Add($Uri)
    throw 'Unexpected HTTP request.'
}

function Assert-Check {
    param($Report, [string] $Name, [string] $Status)
    $matchingChecks = @($Report.Checks | Where-Object { $_.Check -eq $Name -and $_.Status -eq $Status })
    if ($matchingChecks.Count -ne 1) { throw "Scenario $($testState.Scenario) expected '$Name' = '$Status'. Report: $($Report | ConvertTo-Json -Depth 8 -Compress)" }
    if (($Report | ConvertTo-Json -Depth 8) -match 'mock-secret-token') { throw 'Secret leaked into report.' }
    if ($testState.Unexpected.Count) { throw "Unexpected requests: $($testState.Unexpected -join ', ')" }
}

$scriptPath = Join-Path $PSScriptRoot 'deployment_readiness.ps1'
$corePath = Join-Path $PSScriptRoot 'core_readiness.ps1'
$orderPath = Join-Path $PSScriptRoot '../../deploy-order-processing/scripts/order_processing_readiness.ps1'
$cases = @{
    DirectRole = 'Pass'; GroupRole = 'Pass'; PagedRole = 'Pass'
    ScopedRole = 'Fail'; NoRole = 'Fail'; DeniedRoles = 'Not verified'
}
foreach ($case in $cases.Keys) {
    $testState.Scenario = $case
    $report = & $corePath -TenantId $tenantId
    Assert-Check $report 'Tenant-wide Power Platform Administrator' $cases[$case]
    Assert-Check $report "Power Apps Premium : $fixtureOperatorId" 'Pass'
    if ($report.SubscriptionSeats[0].Available -ne 0) { throw 'Seat inventory mismatch.' }
    if ($report.Overall -eq 'Pass') { throw 'Manual requirements must prevent an overall pass.' }
}

foreach ($case in @('PendingLicense', 'CompanyPlan', 'DisabledSubscription', 'DeniedSubscriptions')) {
    $testState.Scenario = $case
    $report = & $corePath -TenantId $tenantId
    $expected = if ($case -eq 'DeniedSubscriptions') { 'Not verified' } else { 'Fail' }
    Assert-Check $report "Power Apps Premium : $fixtureOperatorId" $expected
    Assert-Check $report "Copilot Studio : $fixtureOperatorId" $expected
}
$testState.Scenario = 'DisabledUser'
$report = & $corePath -TenantId $tenantId
Assert-Check $report "User readiness: $fixtureOperatorId" 'Fail'

foreach ($case in @('ExistingEnvironment', 'CustomRole', 'MissingEnvironment', 'WrongEnvironmentTenant', 'WrongOrganization')) {
    $testState.Scenario = $case
    $report = & $orderPath -TenantId $tenantId -EnvironmentId $environmentId -AutomationUserPrincipalName 'automation@example.com' -BusinessUserPrincipalName 'reviewer@example.com'
    if (@($report.Checks | Where-Object Check -In @('Tenant-wide Power Platform Administrator', 'Runtime identity creation', 'Environment provisioning capacity and policy')).Count) { throw 'OrderProcessing must not report Core provisioning checks.' }
    Assert-Check $report 'Exchange Online : automation@example.com' 'Pass'
    Assert-Check $report 'Teams : reviewer@example.com' 'Pass'
    if ($case -eq 'ExistingEnvironment') { Assert-Check $report 'Dataverse deployment permissions' 'Pass' }
    if ($case -eq 'CustomRole') { Assert-Check $report 'Dataverse deployment permissions' 'Not verified' }
    if ($case -eq 'MissingEnvironment') { Assert-Check $report 'Dataverse environment' 'Not verified' }
    if ($case -in @('WrongEnvironmentTenant', 'WrongOrganization')) { Assert-Check $report 'Dataverse environment' 'Fail' }
}
$testState.Scenario = 'NoEnvironment'
$callsBefore = $testState.Calls.Count
$rejected = $false
try { $null = & $orderPath -TenantId $tenantId } catch { $rejected = $true }
if (-not $rejected -or $testState.Calls.Count -ne $callsBefore) { throw 'OrderProcessing must require an environment before HTTP calls.' }

$testState.Scenario = 'WrongTenant'
$callsBefore = $testState.Calls.Count
$rejected = $false
try { $null = & $corePath -TenantId $tenantId } catch { $rejected = $true }
if (-not $rejected -or $testState.Calls.Count -ne $callsBefore) { throw 'Tenant mismatch must stop before HTTP calls.' }

$testState.Scenario = 'DeniedRoles'
$callsBefore = $testState.Calls.Count
$report = & $corePath -TenantId $tenantId -EnvironmentId $environmentId -MonitoringAccess
Assert-Check $report 'Dataverse deployment permissions' 'Pass'
Assert-Check $report "Teams : $fixtureOperatorId" 'Pass'
if (@($report.Checks | Where-Object Check -In @('Automation user administration', 'Exchange administration', 'Automation user licensing', 'Mailbox and flow licensing', 'Existing BusinessProcessCore')).Count) { throw 'Core must not report OrderProcessing checks.' }
if (@($testState.Calls | Select-Object -Skip $callsBefore | Where-Object { $_ -like '*/roleManagement/*' }).Count) { throw 'Existing Core must skip unused directory role queries.' }

$report = & $orderPath -TenantId $tenantId -EnvironmentId $environmentId -ManageAutomationUser -ManageMailbox -StandalonePremiumFlows
Assert-Check $report 'Automation user administration' 'Not verified'
Assert-Check $report 'Exchange administration' 'Not verified'
Assert-Check $report "Power Automate Premium : $fixtureOperatorId" 'Fail'
Assert-Check $report 'Existing BusinessProcessCore' 'Not verified'

foreach ($parameters in @(
    @{ Solution = 'Core'; ManageMailbox = $true },
    @{ Solution = 'OrderProcessing'; EnvironmentId = $environmentId; CreateRuntimeIdentity = $true }
)) {
    $rejected = $false
    $callsBefore = $testState.Calls.Count
    try { $null = & $scriptPath -TenantId $tenantId @parameters } catch { $rejected = $true }
    if (-not $rejected -or $testState.Calls.Count -ne $callsBefore) { throw 'Reject cross-solution options before HTTP calls.' }
}
Write-Output 'PASS: 22 offline scenarios; separate Core and OrderProcessing reports; no cloud calls or writes.'