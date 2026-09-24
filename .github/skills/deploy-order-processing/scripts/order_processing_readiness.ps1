#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [guid] $TenantId,
    [ValidateNotNullOrEmpty()]
    [ValidatePattern('^(Default-)?[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')]
    [string] $EnvironmentId,
    [string] $AutomationUserPrincipalName,
    [string[]] $BusinessUserPrincipalName = @(),
    [switch] $ManageAutomationUser,
    [switch] $ManageMailbox,
    [switch] $MonitoringAccess,
    [switch] $StandalonePremiumFlows
)

if (-not $EnvironmentId) { throw 'Supply an existing environment ID. Deploy and verify Core first.' }
& "$PSScriptRoot/deployment_readiness.ps1" -Solution OrderProcessing @PSBoundParameters