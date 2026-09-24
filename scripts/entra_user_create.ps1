#Requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [guid] $TenantId,

    [Parameter(Mandatory)]
    [ValidatePattern('^[^@\s]+@[^@\s]+$')]
    [string] $UserPrincipalName,

    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z]{2}$')]
    [string] $UsageLocation,

    [ValidatePattern('^[A-Za-z]{2}$')]
    [string] $Country,

    [string] $DisplayName,
    [string] $MailNickname
)

$ErrorActionPreference = 'Stop'
$username, $domain = $UserPrincipalName.Split('@')
if (-not $DisplayName) { $DisplayName = $username }
if (-not $MailNickname) { $MailNickname = $username }

$accountRaw = az account show --output json
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify Azure CLI tenant. Run az login first.' }
$account = $accountRaw | ConvertFrom-Json
if ($account.tenantId -ne $TenantId.ToString()) { throw 'Unexpected Azure CLI tenant; stopping.' }

$token = az account get-access-token --resource https://graph.microsoft.com --query accessToken --output tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Cannot acquire Microsoft Graph access.' }
$headers = @{ Authorization = "Bearer $token" }
$securePassword = $null
$payload = $null
$body = $null

try {
    $verifiedDomain = Invoke-RestMethod -Method Get -Uri ('https://graph.microsoft.com/v1.0/domains/' + [uri]::EscapeDataString($domain)) -Headers $headers
    if (-not $verifiedDomain.isVerified) { throw 'The UPN domain is not verified in this tenant.' }

    $filter = [uri]::EscapeDataString("userPrincipalName eq '$($UserPrincipalName.Replace("'", "''"))'")
    $existing = Invoke-RestMethod -Method Get -Uri ('https://graph.microsoft.com/v1.0/users?$filter=' + $filter) -Headers $headers
    if (@($existing.value).Count -ne 0) { throw 'Account already exists; refusing to reuse or modify it.' }
    if (-not $PSCmdlet.ShouldProcess($UserPrincipalName, 'Create sign-in-enabled Entra user (no licenses or roles)')) { return }

    $securePassword = Read-Host 'Enter a temporary password directly here (hidden; never paste it in chat)' -AsSecureString
    if ($securePassword.Length -eq 0) { throw 'No password supplied; no account created.' }
    $payload = @{
        accountEnabled = $true
        displayName = $DisplayName
        mailNickname = $MailNickname
        userPrincipalName = $UserPrincipalName
        usageLocation = $UsageLocation.ToUpperInvariant()
        passwordProfile = @{
            forceChangePasswordNextSignIn = $true
            password = [System.Net.NetworkCredential]::new('', $securePassword).Password
        }
    }
    if ($Country) { $payload.country = $Country.ToUpperInvariant() }
    $body = $payload | ConvertTo-Json -Depth 4 -Compress
    try {
        $created = Invoke-RestMethod -Method Post -Uri 'https://graph.microsoft.com/v1.0/users' -Headers $headers -ContentType 'application/json' -Body $body
    } catch {
        $failure = $_
        $status = $failure.Exception.Response.StatusCode
        $reason = 'Request rejected; inspect Entra audit logs for details.'
        $requestId = $null
        try {
            $graphError = ($failure.ErrorDetails.Message | ConvertFrom-Json).error
            if ($graphError.message -match '(?i)password') {
                $reason = 'Graph reported a password-related validation error. Use a password that meets tenant policy.'
            } elseif ($graphError.message -match '(?i)already exists|same value') {
                $reason = 'Graph reported a conflicting directory value. Check the UPN and recipient aliases.'
            } elseif ($status -in @('Forbidden', 'Unauthorized', 401, 403)) {
                $reason = 'Check the operator permissions and authentication in the target tenant.'
            }
            $parsedId = [guid]::Empty
            if ([guid]::TryParse([string]$graphError.innerError.'request-id', [ref]$parsedId)) {
                $requestId = $parsedId.ToString()
            }
        } catch {
            $requestId = $null
        }
        throw "User creation failed (HTTP $status). $reason Request ID: $requestId. Check account existence before retrying. Raw response suppressed to protect credentials."
    }
    $payload.passwordProfile.password = $null
    $body = $null
    $securePassword.Dispose()
    $securePassword = $null
    Write-Host ('Created user ID: ' + $created.id)
    try {
        $verified = Invoke-RestMethod -Method Get -Uri ('https://graph.microsoft.com/v1.0/users/' + $created.id + '?$select=id,displayName,userPrincipalName,accountEnabled,usageLocation,country,assignedLicenses') -Headers $headers
    } catch {
        throw "User $($created.id) was created, but readback failed. Verify it before retrying; do not recreate it."
    }
    $verified | Select-Object id, displayName, userPrincipalName, accountEnabled, usageLocation, country,
        @{Name = 'AssignedLicenseCount'; Expression = { @($_.assignedLicenses).Count }}
} finally {
    if ($payload) { $payload.passwordProfile.password = $null }
    $body = $null
    $payload = $null
    if ($securePassword) { $securePassword.Dispose() }
    $headers.Clear()
    $token = $null
}