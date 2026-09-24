#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [guid] $TenantId,
    [Parameter(Mandatory)]
    [ValidateSet('Core', 'OrderProcessing')]
    [string] $Solution,
    [ValidatePattern('^(Default-)?[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')]
    [string] $EnvironmentId,
    [string] $AutomationUserPrincipalName,
    [string[]] $BusinessUserPrincipalName = @(),
    [switch] $CreateRuntimeIdentity,
    [switch] $ManageAutomationUser,
    [switch] $ManageMailbox,
    [switch] $MonitoringAccess,
    [switch] $StandalonePremiumFlows
)

$ErrorActionPreference = 'Stop'
if ($Solution -eq 'OrderProcessing' -and -not $EnvironmentId) { throw 'Supply an existing environment ID. Deploy and verify Core first.' }
if ($Solution -eq 'Core' -and ($AutomationUserPrincipalName -or $ManageAutomationUser -or $ManageMailbox -or $StandalonePremiumFlows)) {
    throw 'Automation user, mailbox, and standalone flow checks belong to OrderProcessing.'
}
if ($Solution -eq 'OrderProcessing' -and $CreateRuntimeIdentity) { throw 'Reuse the Core runtime identity for OrderProcessing.' }
$checks = [Collections.Generic.List[object]]::new()
$graph = 'https://graph.microsoft.com/v1.0'

function Add-Check {
    param([string] $Name, [ValidateSet('Pass', 'Fail', 'Not verified', 'Not applicable')] [string] $Status, [string] $Evidence)
    $checks.Add([pscustomobject]@{ Check = $Name; Status = $Status; Evidence = $Evidence })
}

function Get-ReadHeaders {
    param([string] $Resource)
    $token = az account get-access-token --tenant $TenantId --resource $Resource --query accessToken --output tsv --only-show-errors 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token acquisition failed; sign in or obtain approved read consent.' }
    return @{ Authorization = "Bearer $token"; Accept = 'application/json' }
}

function Get-Collection {
    param([string] $Uri, [hashtable] $Headers)
    $origin = ([uri] $Uri).GetLeftPart([UriPartial]::Authority)
    $items = [Collections.Generic.List[object]]::new()
    while ($Uri) {
        if (([uri] $Uri).Scheme -ne 'https' -or ([uri] $Uri).GetLeftPart([UriPartial]::Authority) -ne $origin) {
            throw 'Unexpected pagination origin.'
        }
        $page = Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers -ErrorAction Stop
        if ($null -eq $page.value) { throw 'Expected a collection response.' }
        foreach ($item in $page.value) { $items.Add($item) }
        $Uri = $page.'@odata.nextLink'
    }
    return $items.ToArray()
}

function Get-ReadFailure {
    param($Record)
    $response = $Record.Exception.Response
    if ($response -and $response.StatusCode) { return "Read failed (HTTP $([int] $response.StatusCode)); verify access/consent and retry." }
    return 'Read unavailable; verify sign-in, read permissions, and connectivity, then retry.'
}

function Test-TenantRole {
    param([string] $Name, [string[]] $Templates, [bool] $Required, [bool] $StrictAbsence = $false)
    if (-not $Required) { Add-Check $Name 'Not applicable' 'Not requested for this deployment scenario.'; return }
    if (-not $rolesAvailable) { Add-Check $Name 'Not verified' 'Active role assignments could not be fully read.'; return }
    $matches = @($assignments | Where-Object { $_.directoryScopeId -eq '/' -and $_.roleDefinition.templateId -in $Templates })
    if ($matches.Count) {
        Add-Check $Name 'Pass' ("Active tenant-scope assignment: " + (($matches.roleDefinition.displayName | Sort-Object -Unique) -join ', '))
    } elseif ($StrictAbsence) {
        Add-Check $Name 'Fail' 'No active Power Platform Administrator assignment at tenant scope (/). Activate an eligible assignment or use an authorized provisioning administrator.'
    } else {
        Add-Check $Name 'Not verified' 'No recognized tenant-wide role found; validate scoped/custom permissions or delegated administrator support.'
    }
}

function Test-UserLicenses {
    param([string] $Identity, [hashtable] $Requirements)
    try {
        if (-not $graphHeaders) { throw 'Graph unavailable.' }
        $userUri = "$graph/users/" + [uri]::EscapeDataString($Identity)
        $user = Invoke-RestMethod -Method Get -Uri ($userUri + '?$select=id,userPrincipalName,accountEnabled,usageLocation') -Headers $graphHeaders -ErrorAction Stop
        if ($null -eq $user.accountEnabled) { throw 'Account state unavailable.' }
        if ($user.accountEnabled -and $user.usageLocation) {
            Add-Check "User readiness: $Identity" 'Pass' 'Account enabled and usage location set.'
        } else { Add-Check "User readiness: $Identity" 'Fail' 'Account disabled or usage location missing.' }
        $licenses = @(Get-Collection ($userUri + '/licenseDetails') $graphHeaders)
        foreach ($name in ($Requirements.Keys | Sort-Object)) {
            $matchingLicenses = @($licenses | Where-Object {
                $license = $_
                @($license.servicePlans | Where-Object {
                    $_.appliesTo -eq 'User' -and $_.provisioningStatus -eq 'Success' -and
                    $(if ($name -eq 'Copilot Studio') { $license.skuPartNumber -eq 'VIRTUAL_AGENT_USL' } else { $_.servicePlanName -in $Requirements[$name] })
                }).Count -gt 0
            })
            $enabled = @($matchingLicenses | Where-Object { $_.skuId -in @($skus | Where-Object capabilityStatus -EQ 'Enabled' | ForEach-Object skuId) })
            if ($enabled.Count) {
                Add-Check "$name : $Identity" 'Pass' ("Provisioned user plan in enabled subscription: " + (($enabled.skuPartNumber | Sort-Object -Unique) -join ', '))
            } elseif (-not $skusAvailable) {
                Add-Check "$name : $Identity" 'Not verified' 'Tenant subscription state unavailable.'
            } else {
                Add-Check "$name : $Identity" 'Fail' 'No recognized successfully provisioned user plan in an enabled subscription. Review equivalent entitlements with the licensing administrator.'
            }
        }
    } catch { Add-Check "Licenses: $Identity" 'Not verified' (Get-ReadFailure $_) }
}

$accountRaw = az account show --output json --only-show-errors 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Run az login --tenant <tenant-id> --allow-no-subscriptions first.' }
$account = $accountRaw | ConvertFrom-Json
if ($account.tenantId -ne $TenantId.ToString() -or $account.user.type -ne 'user') { throw 'Expected an interactive user in the specified tenant.' }
if ($account.environmentName -ne 'AzureCloud') { throw 'This helper supports the commercial cloud only.' }
Add-Check 'Tenant authentication' 'Pass' "Azure CLI user: $($account.user.name); tenant: $TenantId. PAC authentication must be verified separately."

$graphHeaders = $null
$rolesAvailable = $false
$skusAvailable = $false
$assignments = @()
$skus = @()
$operatorId = $account.user.name
$environment = $null
try {
    try {
        $graphHeaders = Get-ReadHeaders 'https://graph.microsoft.com'
        $operator = Invoke-RestMethod -Method Get -Uri ($graph + '/me?$select=id,userPrincipalName') -Headers $graphHeaders -ErrorAction Stop
        $operatorId = $operator.id
        if (($Solution -eq 'Core' -and (-not $EnvironmentId -or $CreateRuntimeIdentity)) -or $ManageAutomationUser -or $ManageMailbox) {
            $groups = @(Get-Collection ($graph + '/me/memberOf/microsoft.graph.group?$select=id') $graphHeaders)
            foreach ($principalId in @($operator.id) + @($groups.id)) {
                $filter = [uri]::EscapeDataString("principalId eq '$principalId'")
                $assignments += @(Get-Collection ("$graph/roleManagement/directory/roleAssignments?`$filter=$filter&`$expand=roleDefinition") $graphHeaders)
            }
            $rolesAvailable = $true
        }
    } catch { Add-Check 'Directory role discovery' 'Not verified' (Get-ReadFailure $_) }

    if ($Solution -eq 'Core') {
        Test-TenantRole 'Tenant-wide Power Platform Administrator' @('11648597-926c-4cf3-9c36-bcebb0ba8dcc') (-not $EnvironmentId) $true
        Test-TenantRole 'Runtime identity creation' @('cf1c38e5-3621-4004-a7cb-879624dced7c', '158c047a-c907-4556-b7ef-446551a6b5f7', '62e90394-69f5-4237-9190-012177145e10') $CreateRuntimeIdentity.IsPresent
    } else {
        Test-TenantRole 'Automation user administration' @('fe930be7-5e62-47db-91af-98c3a49a38b1', '62e90394-69f5-4237-9190-012177145e10') $ManageAutomationUser.IsPresent
        Test-TenantRole 'Exchange administration' @('29232cdf-9323-42fd-ade2-1d097af3e4de', '62e90394-69f5-4237-9190-012177145e10') $ManageMailbox.IsPresent
    }

    if ($EnvironmentId) {
        $discoveryHeaders = $null
        $dataverseHeaders = $null
        try {
            $discoveryHeaders = Get-ReadHeaders 'https://globaldisco.crm.dynamics.com'
            $instances = @(Get-Collection 'https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances' $discoveryHeaders)
            $matches = @($instances | Where-Object EnvironmentId -EQ $EnvironmentId)
            if ($matches.Count -ne 1) {
                Add-Check 'Dataverse environment' 'Not verified' 'Environment not uniquely discoverable. Check ID, membership, security group, and delegated access; do not infer it does not exist.'
            } elseif ($matches[0].TenantId -ne $TenantId.ToString()) {
                Add-Check 'Dataverse environment' 'Fail' 'Discovered environment belongs to another tenant.'
            } else {
                $environment = $matches[0]
                $apiUrl = ([string] $environment.ApiUrl).TrimEnd('/')
                if (([uri] $apiUrl).Scheme -ne 'https' -or ([uri] $apiUrl).Host -notmatch '\.dynamics\.com$') { throw 'Unexpected Dataverse endpoint.' }
                $dataverseHeaders = Get-ReadHeaders $apiUrl
                $caller = Invoke-RestMethod -Method Get -Uri "$apiUrl/api/data/v9.2/WhoAmI" -Headers $dataverseHeaders -ErrorAction Stop
                if ($caller.OrganizationId -ne $environment.Id -or $environment.State -ne 0) {
                    Add-Check 'Dataverse environment' 'Fail' 'Organization mismatch or environment not enabled.'
                } else {
                    Add-Check 'Dataverse environment' 'Pass' "Environment: $EnvironmentId; organization: $($environment.Id); URL: $($environment.Url); Dataverse caller: $($caller.UserId)."
                    if ($environment.IsUserSysAdmin -eq $true) {
                        Add-Check 'Dataverse deployment permissions' 'Pass' 'Global Discovery reports the caller as System Administrator.'
                    } else {
                        Add-Check 'Dataverse deployment permissions' 'Not verified' 'System Administrator not reported. Have an administrator validate effective custom/team privileges for deployment; Environment Admin alone is insufficient.'
                    }
                }
            }
        } catch { Add-Check 'Dataverse access' 'Not verified' (Get-ReadFailure $_) }
        finally {
            if ($discoveryHeaders) { $discoveryHeaders.Clear() }
            if ($dataverseHeaders) { $dataverseHeaders.Clear() }
        }
    } else {
        Add-Check 'Dataverse deployment permissions' 'Not applicable' 'No environment supplied. Rerun with its ID after provisioning.'
        Add-Check 'Environment provisioning capacity and policy' 'Not verified' 'Confirm Dataverse capacity, creation policy, region, and approved environment settings with the platform administrator.'
    }

    try {
        if (-not $graphHeaders) { throw 'Graph unavailable.' }
        $skus = @(Get-Collection "$graph/subscribedSkus" $graphHeaders)
        $skusAvailable = $true
        Add-Check 'Subscription inventory' 'Pass' 'Tenant subscriptions read successfully; seat inventory is not proof of user assignment or licensing suitability.'
    } catch { Add-Check 'Subscription inventory' 'Not verified' (Get-ReadFailure $_) }

    $operatorPlans = @{ 'Power Apps Premium' = @('POWERAPPS_PER_USER'); 'Copilot Studio' = @('VIRTUAL_AGENT_USL') }
    if ($StandalonePremiumFlows) { $operatorPlans['Power Automate Premium'] = @('FLOW_PER_USER') }
    if ($MonitoringAccess) { $operatorPlans['Teams'] = @('TEAMS1') }
    Test-UserLicenses $operatorId $operatorPlans
    if ($Solution -eq 'OrderProcessing') {
        if ($AutomationUserPrincipalName) {
            Test-UserLicenses $AutomationUserPrincipalName @{
                'Exchange Online' = @('EXCHANGE_S_STANDARD', 'EXCHANGE_S_ENTERPRISE')
                'Teams' = @('TEAMS1')
                'Copilot Studio' = @('VIRTUAL_AGENT_USL')
            }
        } else { Add-Check 'Automation user licensing' 'Not verified' 'Supply -AutomationUserPrincipalName once the intended identity exists.' }
        Add-Check 'Mailbox and flow licensing' 'Not verified' 'Confirm mailbox provisioning/delegation in Exchange and the approved flow-owner or Process licensing model where applicable.'
        Add-Check 'Existing BusinessProcessCore' 'Not verified' 'Use the deploy-business-process-core Installation Check workflow to validate components, configuration, runtime privileges, and all 13 monitoring-tool associations before OrderProcessing setup.'
    }
    foreach ($identity in $BusinessUserPrincipalName) {
        $plans = @{ 'Power Apps Premium' = @('POWERAPPS_PER_USER') }
        if ($Solution -eq 'OrderProcessing' -or $MonitoringAccess) { $plans['Teams'] = @('TEAMS1') }
        Test-UserLicenses $identity $plans
    }
    if (-not $BusinessUserPrincipalName.Count) { Add-Check 'Business user licensing' 'Not verified' 'Supply intended business user UPNs when known; environment ID does not identify them.' }
    Add-Check 'Copilot Credits and licensing approval' 'Not verified' 'Confirm prepaid capacity or pay-as-you-go coverage, trial restrictions, approved assignments, and delegated administrator availability with the responsible owners.'

    $overall = if (@($checks | Where-Object Status -EQ 'Fail').Count) { 'Fail' }
        elseif (@($checks | Where-Object Status -EQ 'Not verified').Count) { 'Review required' }
        else { 'Pass' }
    [pscustomobject]@{
        TenantId = $TenantId.ToString()
        EnvironmentId = $EnvironmentId
        Solution = $Solution
        Operator = $account.user.name
        Overall = $overall
        Checks = $checks.ToArray()
        SubscriptionSeats = @($skus | ForEach-Object {
            [pscustomobject]@{ Sku = $_.skuPartNumber; State = $_.capabilityStatus; Available = ([int] $_.prepaidUnits.enabled - [int] $_.consumedUnits) }
        })
    }
} finally { if ($graphHeaders) { $graphHeaders.Clear() } }