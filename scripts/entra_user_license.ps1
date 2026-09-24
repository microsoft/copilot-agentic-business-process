#Requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [guid] $TenantId,

    [Parameter(Mandatory)]
    [string] $UserPrincipalName,

    [Parameter(Mandatory)]
    [hashtable] $EnabledPlansBySku,

    [switch] $VerifyOnly
)

$ErrorActionPreference = 'Stop'
if ($EnabledPlansBySku.Count -eq 0) { throw 'Specify at least one SKU and its enabled service plans.' }
$accountRaw = az account show --output json
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify Azure CLI tenant. Run az login first.' }
if (($accountRaw | ConvertFrom-Json).tenantId -ne $TenantId.ToString()) { throw 'Unexpected Azure CLI tenant; stopping.' }
$token = az account get-access-token --resource https://graph.microsoft.com --query accessToken --output tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Cannot acquire Microsoft Graph access.' }
$headers = @{ Authorization = "Bearer $token" }

try {
    $userUri = 'https://graph.microsoft.com/v1.0/users/' + [uri]::EscapeDataString($UserPrincipalName)
    $user = Invoke-RestMethod -Method Get -Uri ($userUri + '?$select=id,userPrincipalName,accountEnabled,usageLocation,assignedLicenses') -Headers $headers
    if (-not $user.accountEnabled -or -not $user.usageLocation) { throw 'User must be sign-in enabled with a usage location.' }
    $skus = @()
    $nextUri = 'https://graph.microsoft.com/v1.0/subscribedSkus'
    while ($nextUri) {
        $page = Invoke-RestMethod -Method Get -Uri $nextUri -Headers $headers
        $skus += @($page.value)
        $nextUri = $page.'@odata.nextLink'
    }
    $assignments = @()
    foreach ($skuName in ($EnabledPlansBySku.Keys | Sort-Object)) {
        $matches = @($skus | Where-Object skuPartNumber -EQ $skuName)
        if ($matches.Count -ne 1) { throw "Expected exactly one subscribed SKU: $skuName" }
        $sku = $matches[0]
        if (-not $VerifyOnly -and @($user.assignedLicenses | Where-Object skuId -EQ $sku.skuId).Count) {
            throw "SKU $skuName is already assigned. Review its current plans before making changes."
        }
        if (-not $VerifyOnly -and ($sku.capabilityStatus -ne 'Enabled' -or $sku.prepaidUnits.enabled -le $sku.consumedUnits)) {
            throw "No available enabled seat for $skuName."
        }
        $planNames = @($EnabledPlansBySku[$skuName])
        if ($planNames.Count -eq 0) { throw "Specify enabled plans for $skuName." }
        foreach ($planName in $planNames) {
            $plans = @($sku.servicePlans | Where-Object servicePlanName -EQ $planName)
            if ($plans.Count -ne 1 -or $plans[0].provisioningStatus -ne 'Success' -or $plans[0].appliesTo -ne 'User') {
                throw "Service plan $planName is unavailable in $skuName."
            }
        }
        $assignments += @{
            skuId = $sku.skuId
            disabledPlans = @($sku.servicePlans | Where-Object { $_.appliesTo -eq 'User' -and $_.servicePlanName -notin $planNames } | ForEach-Object { $_.servicePlanId })
        }
        Write-Host ("{0}: selected user plans: {1}. Company-scope plans are outside per-user control." -f $skuName, ($planNames -join ', '))
    }
    if (-not $VerifyOnly) {
        if (-not $PSCmdlet.ShouldProcess($UserPrincipalName, 'Consume one seat per listed SKU with only the listed user plans enabled')) { return }
        $body = @{ addLicenses = @($assignments); removeLicenses = @() } | ConvertTo-Json -Depth 5 -Compress
        $null = Invoke-RestMethod -Method Post -Uri ($userUri + '/assignLicense') -Headers $headers -ContentType 'application/json' -Body $body
        Write-Host 'Assignment request accepted. Verifying saved license settings.'
    }
    try {
        $verified = Invoke-RestMethod -Method Get -Uri ($userUri + '?$select=id,userPrincipalName,assignedLicenses,licenseAssignmentStates') -Headers $headers
        foreach ($assignment in $assignments) {
            $saved = @($verified.assignedLicenses | Where-Object skuId -EQ $assignment.skuId)
            $userPlanIds = @(($skus | Where-Object skuId -EQ $assignment.skuId).servicePlans | Where-Object appliesTo -EQ 'User' | ForEach-Object { $_.servicePlanId })
            if ($saved.Count -ne 1 -or (($assignment.disabledPlans | Sort-Object) -join ',') -ne (($saved[0].disabledPlans | Where-Object { $_ -in $userPlanIds } | Sort-Object) -join ',')) {
                throw 'Saved license plans do not yet match the request.'
            }
        }
        Write-Host 'Verified: saved user-scope plans match the selection. Check service provisioning separately.'
        $verified | Select-Object id, userPrincipalName, licenseAssignmentStates
    } catch {
        if ($VerifyOnly) { throw }
        throw "Assignment was accepted, but verification failed: $($_.Exception.Message) Read the current licenses before retrying."
    }
} finally {
    $headers.Clear()
    $token = $null
}