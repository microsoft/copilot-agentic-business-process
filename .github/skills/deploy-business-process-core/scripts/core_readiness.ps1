#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [guid] $TenantId,
    [ValidatePattern('^(Default-)?[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')]
    [string] $EnvironmentId,
    [string[]] $BusinessUserPrincipalName = @(),
    [switch] $CreateRuntimeIdentity,
    [switch] $MonitoringAccess
)

& "$PSScriptRoot/deployment_readiness.ps1" -Solution Core @PSBoundParameters