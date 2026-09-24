# OrderProcessing Readiness

1. Require an existing environment and deployed Core; otherwise stop. Complete technical prerequisites and read [roles/licensing](./roles-and-licensing.md).
2. Resolve this skill's folder (containing `SKILL.md`) to `$skillFolder`, then run in PowerShell 7 (commercial cloud):

```powershell
az login --tenant <tenant-id> --allow-no-subscriptions
$report = & "$skillFolder/scripts/order_processing_readiness.ps1" -TenantId <tenant-id> -EnvironmentId <environment-id> -AutomationUserPrincipalName <UPN> -BusinessUserPrincipalName <UPNs>
$report.Checks | Format-Table Check, Status, Evidence -Wrap
$report.SubscriptionSeats | Format-Table
$report.Overall
```

3. Add `-ManageAutomationUser` or `-ManageMailbox` for operator-administered tasks; `-MonitoringAccess` for operator Teams access; `-StandalonePremiumFlows` only for standalone premium flows.
4. Verify operator Dataverse access and maker licenses; automation-user Exchange/Teams/Copilot Studio; business-user Console/Teams licenses. Confirm mailbox delegation, flow-owner/Process coverage, seats, delegated administrators, and Copilot Credits with owners.
5. Resolve failures; record evidence for unverified checks. Present only overall status, blockers, and required confirmations. Obtain explicit user understanding/availability confirmation.
6. Verify PAC identity/target. Before setup, use [deploy-business-process-core: Installation Check](../../deploy-business-process-core/SKILL.md#installation-check) to validate all installed Core components/configuration, runtime privileges, and all 13 monitoring-tool associations. Stop on failed/unverified results.
7. Reuse Core; do not provision environments or runtime identities. Keep checks read-only and secrets out of chat. Rerun user/license checks after approved setup and before activation/runtime testing.