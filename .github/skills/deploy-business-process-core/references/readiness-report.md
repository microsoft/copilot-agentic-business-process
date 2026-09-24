# Core Readiness

1. Resolve this skill's folder (containing `SKILL.md`) to `$skillFolder`, then run in PowerShell 7 (commercial cloud):

```powershell
az login --tenant <tenant-id> --allow-no-subscriptions
$report = & "$skillFolder/scripts/core_readiness.ps1" -TenantId <tenant-id> -EnvironmentId <environment-id>
$report.Checks | Format-Table Check, Status, Evidence -Wrap
$report.SubscriptionSeats | Format-Table
$report.Overall
```

2. For a new environment, omit `-EnvironmentId`; require active tenant-wide Power Platform Administrator (`/`), approve provisioning, then rerun with the new ID.
3. Add `-CreateRuntimeIdentity` when the operator creates the app identity; `-BusinessUserPrincipalName <UPNs>` for Console users; `-MonitoringAccess` for Teams access.
4. Verify Dataverse deployment access, operator Power Apps Premium/Copilot Studio, and applicable user licenses. Confirm custom/delegated access, seats, capacity, and Copilot Credits with owners.
5. Resolve failures; record evidence for unverified checks. Present only overall status, blockers, and required confirmations. Obtain explicit user understanding/availability confirmation.
6. Keep checks read-only and secrets out of chat. Verify PAC identity/target separately; preserve approvals. For an existing Core installation, run the [Installation Check workflow](../SKILL.md#installation-check) before reusing it; run it again after deployment.