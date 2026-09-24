# OrderProcessing Deployment Guide

Run commands from the repository root. Use `pac` for deployment and `uv` for Python helpers when needed. Keep secrets out of documentation and settings files.

## Microsoft Platform Roles Involved

| Role | Required access | When required |
| --- | --- | --- |
| Microsoft 365 Administrator | **User Administrator** for user creation/license assignment; **Exchange Administrator** for mailbox creation/delegation, or approved delegated permissions. | Only for the operator performing these tasks; use existing Microsoft 365 administrators when handled externally. |
| Power Platform environment administrator | **System Administrator in the target Dataverse environment**, or a validated deployment role. Environment Admin alone is insufficient for this Dataverse deployment. | For the operator importing solutions and configuring environment roles, application users, and teams. |
| Power Platform tenant-wide administrator | **Power Platform Administrator**, or another eligible provisioning identity under [Core Appendix B](../../../core/solution/DEPLOYMENT.md#appendix-b--creating-an-environment). | Only for environment provisioning or tenant-level changes. Use a separate platform administrator by default; the deployment operator does not need this role for an externally supplied environment. |

## Application Users and Licensing

- **Deployment Administrator:** The person running this guide, directly or through a coding agent using an authorized deployment identity.
- **Automation User:** The dedicated account used by OrderProcessing flows for Outlook/Teams connections and, when approved, the agent-node connection. Dataverse operations use the Core service principal; record the flow owner separately.
- **Order Processing Users:** Order Approvers approve orders; Order Reviewers review orders; Backoffice operators monitor execution and access logs. Each uses their own account.
- **Makers:** The users maintaining the solution's agents, flows, plug-ins, APIs, and Workflow Console.


| License | Users requiring it |
| --- | --- |
| Exchange Online Plan 1 or Plan 2, standalone or included in a Microsoft 365 subscription | Automation User using the Outlook connection. |
| Microsoft Teams Enterprise or a Microsoft 365 subscription that includes Teams | Automation User using the Teams connection; Order Processing Users receiving Teams notifications. |
| Copilot Studio user license (`VIRTUAL_AGENT_USL`) | Automation User using the agent-node connection, before activation; Makers and Deployment Administrator authoring or publishing agents. |
| Power Apps Premium | Order Processing Users running Workflow Console; Makers and Deployment Administrator building or testing the app in the target environment. |
| Power Automate Premium | Owner of standalone premium Power Automate flows; Makers and Deployment Administrator authoring those flows. Not required for the solution's Copilot Credit-billed workflows. |
| Power Automate Process (alternative to per-user Power Automate Premium licensing for execution) | Assigned to standalone flows or a flow group, not users. Not required for the solution's Copilot Credit-billed workflows. |

Confirm available seats and approved assignments with the licensing administrator before assigning licenses. Configure individual users in Steps 4 and 6.

The solution uses the **GitHub Copilot harness in Copilot Studio**. Building, testing, and running its agents and workflows, including the monitoring agent, consumes **Copilot Credits**, funded through prepaid capacity or pay-as-you-go billing. A Microsoft 365 Copilot user license does not cover this harness consumption. See [Copilot Studio usage-based billing](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/billing-credit-overview).

## Prerequisites

### Power Platform CLI (PAC)

1. Check for PAC in the terminal used for deployment:

```pwsh
Get-Command pac
```

2. If missing, download and run the Windows MSI using the [PAC installation instructions](https://learn.microsoft.com/en-us/power-platform/developer/howto/install-cli-msi).
3. Open a new terminal and confirm PAC displays its version and available commands:

```pwsh
pac
```

### Python and uv

1. Install Python 3.11 if no Python 3.11-or-newer interpreter is installed:

```pwsh
winget install --exact --id Python.Python.3.11
```

2. Open a new terminal and check Python; require version 3.11 or newer:

```pwsh
python --version
```

3. Install `uv` if missing:

```pwsh
winget install --exact --id astral-sh.uv
```

4. Open a new terminal. From the repository root, check `uv` and its selected interpreter; require Python 3.11 or newer:

```pwsh
uv --version
uv run python --version
```

### Azure CLI

1. Install Azure CLI if missing:

```pwsh
winget install --exact --id Microsoft.AzureCLI
```

2. Open a new terminal and sign in to the target tenant:

```pwsh
az version
az login --tenant <tenant-id> --allow-no-subscriptions
az account show --query "{tenantId:tenantId,account:user.name}" --output table
```

3. Check that the returned tenant and account match the approved deployment operator.

## Deployment Scenarios

| Target state | Procedure |
| --- | --- |
| No environment | Steps 1, 2.2, 3; then OrderProcessing setup and import. |
| Existing environment without Core | Steps 1, 2.1, 3; import Core before OrderProcessing. |
| Existing environment with Core | Steps 1, 2.1, 3; verify and reuse Core. |
| Redeployment | Confirm target and package version; reuse valid resources and settings; review changes before import. |

## Step 1: Check Authentication

```pwsh
pac auth list
pac env list
```

Check that the active profile and account match the approved tenant and Azure CLI session.

## Step 2: Select or Create the Environment

### 2.1 Existing Environment

Select by environment ID:

```pwsh
pac env select --environment <environment-id>
pac env who
```

Check that the environment ID, organization URL, and account match the approved target.

### 2.2 New Environment

Skip when the target already exists.

1. Check creation permissions, licensing, tenant policy, and Dataverse capacity in [Core guide Appendix B](../../../core/solution/DEPLOYMENT.md#appendix-b--creating-an-environment).
2. Confirm name, type, region, URL prefix, currency, language, and security group before creating resources. Use Sandbox for dev/test, or Developer where eligible.
3. Run the command below. Add `--security-group-id <group-id>` when required by the access policy.

```pwsh
pac admin create --name <display-name> --type <environment-type> --region <region> --currency <currency-code> --language <language> --domain <url-prefix>
```

4. Once provisioning completes, run `pac env list` and select the new ID using Step 2.1.
5. Enable required features, including Power Apps code apps, using [Core guide Step 2.4](../../../core/solution/DEPLOYMENT.md#24-confirm-the-required-environment-features).
6. Complete Step 3 to import BusinessProcessCore before OrderProcessing.


## Step 3: Import or Verify BusinessProcessCore

```pwsh
pac solution list
```

| Result | Action |
| --- | --- |
| Core absent | Complete the [Core deployment guide](../../../core/solution/DEPLOYMENT.md) in this environment: settings, role/application identity/connection, import, post-import privileges, Workflow Console URL, and verification. |
| Core present | Check version and managed/unmanaged state; run the Core guide's component and configuration verification. Reuse a compatible installation; obtain approval before upgrading. |

### 3.1 Check Components and Configuration

```pwsh
pac env fetch --xmlFile .github/skills/deploy-business-process-core/scripts/fetchxml/custom-apis.xml | Select-String 'faf001_'
pac env fetch --xmlFile .github/skills/deploy-business-process-core/scripts/fetchxml/plugin-packages.xml | Select-String 'faf001_'
pac env fetch --xmlFile .github/skills/deploy-business-process-core/scripts/fetchxml/canvas-apps.xml
pac env fetch --xmlFile .github/skills/deploy-business-process-core/scripts/fetchxml/environment-variables.xml | Select-String 'faf001_WorkflowConsoleBaseUrl'
pac env fetch --xmlFile .github/skills/deploy-business-process-core/scripts/fetchxml/connection-references.xml | Select-String 'faf001_'
pac connection list
pac env fetch --xmlFile .github/skills/deploy-business-process-core/scripts/fetchxml/copilot-agents.xml | Select-String 'faf001_businessprocessmonitoringagent'
```

Check each command succeeds before interpreting filtered output. For an existing Core installation, check installed components and configuration only; do not inspect import history.

| Check | Expected result |
| --- | --- |
| Custom APIs | All API names in `core/solution/export/customapis/` are registered. |
| Plug-in package | `faf001_business-process-api` is present at the intended package version. |
| Workflow Console | App is listed with a play URL in the target environment. |
| Console URL variable | `faf001_WorkflowConsoleBaseUrl` has a current value matching the deployed environment and app IDs. |
| Dataverse connection | `faf001_sharedcommondataserviceforapps` is active with a populated connection ID; the corresponding connection reports `Connected`. |
| Monitoring agent | `faf001_businessprocessmonitoringagent` is listed as `Active`. |

Complete these component and configuration checks before importing OrderProcessing. Defer runtime tests to the approved controlled-validation step.

## Step 4: Create the Automation User

### 4.1 Create the Approved Automation User

1. Approve the new user's UPN, display name, mail nickname, usage location, and optional country. Suggest `order-processing-user@<tenant-default-verified-domain>`; request usage location explicitly. On redeployment, reuse the approved existing identity and skip creation.
2. Confirm the custodian for credentials, first sign-in/MFA, recovery, and reauthentication. Preserve Conditional Access and consent policies.
3. In PowerShell 7, run the [user helper](../../../scripts/entra_user_create.ps1) preflight to check tenant, domain, and account availability:

```pwsh
./scripts/entra_user_create.ps1 -TenantId <tenant-id> -UserPrincipalName <new-user-upn> -UsageLocation <two-letter-code> -Country <two-letter-code> -WhatIf
```

4. Omit `-Country` if not approved. Override the UPN-username defaults with `-DisplayName` and `-MailNickname` only when needed; omit other unspecified optional parameters.
5. After approval, rerun without `-WhatIf`. Enter the temporary password at the masked terminal prompt.
6. Check and record the returned object ID, UPN, sign-in state, usage location, country, and assigned-license count.
7. Have the custodian complete first sign-in, password change, and required MFA registration.

### 4.2 Assign the Approved Exchange and Teams Licenses

1. Run the [license helper](../../../scripts/entra_user_license.ps1) with approved target SKU and service-plan names:

```pwsh
./scripts/entra_user_license.ps1 -TenantId <tenant-id> -UserPrincipalName <user-upn> -EnabledPlansBySku @{ '<mail-sku-part-number>' = @('EXCHANGE_S_ENTERPRISE'); '<teams-sku-part-number>' = @('TEAMS1') } -WhatIf
```

2. After approval, rerun without `-WhatIf`. For existing assignments, use `-VerifyOnly` with the same selection.
3. Also assign the Virtual Agent license (`VIRTUAL_AGENT_USL`) to the Automation User before activation.

### 4.3 Check Exchange Mailbox Provisioning and Address Availability

1. Choose an existing or new shared mailbox. Approve its address, display name, alias, Full Access/Send As delegation, and blocked direct sign-in unless an exception is explicitly approved.
2. Install `ExchangeOnlineManagement` if missing. In PowerShell 7, connect as the provisioning operator and complete sign-in/MFA:

```pwsh
Connect-ExchangeOnline -UserPrincipalName '<operator-upn>' -ShowBanner:$false
Get-ConnectionInformation | Select-Object UserPrincipalName, TenantID, State, TokenStatus | Format-List
```

3. Check the tenant, operator, `Connected` state, and active token. Run in the same terminal:

```pwsh
Get-EXOMailbox -ExternalDirectoryObjectId '<automation-user-object-id>' -ErrorAction Stop |
	Select-Object DisplayName, UserPrincipalName, PrimarySmtpAddress, RecipientTypeDetails, ExternalDirectoryObjectId | Format-List
Get-AcceptedDomain -Identity '<mailbox-domain>' -ErrorAction Stop |
	Select-Object DomainName, DomainType, Default | Format-List
$recipients = @(Get-EXORecipient -Filter "EmailAddresses -eq 'smtp:<shared-mailbox-address>'" -IncludeSoftDeletedRecipients -ResultSize Unlimited -ErrorAction Stop)
$recipients | Select-Object DisplayName, PrimarySmtpAddress, RecipientTypeDetails
$recipients.Count
```

4. Require the expected automation identity and `UserMailbox` type, the approved accepted domain, and a successful address query.
5. For a new shared mailbox, require zero active/soft-deleted address matches. For an existing mailbox, confirm its approved address and `SharedMailbox` type and skip creation.

### 4.4 Create and Delegate the Approved Shared Mailbox

1. For a new mailbox, obtain creation approval and run:

```pwsh
$conflicts = @(Get-EXORecipient -Filter "EmailAddresses -eq 'smtp:<shared-mailbox-address>'" -IncludeSoftDeletedRecipients -ResultSize Unlimited -ErrorAction Stop)
if ($conflicts.Count) { throw 'Address is already in use; no mailbox created.' }
New-Mailbox -Shared -Name '<display-name>' -DisplayName '<display-name>' -Alias '<mailbox-alias>' -PrimarySmtpAddress '<shared-mailbox-address>' -ErrorAction Stop
Get-EXOMailbox -Identity '<shared-mailbox-address>' -ErrorAction Stop |
	Select-Object DisplayName, PrimarySmtpAddress, RecipientTypeDetails, ExternalDirectoryObjectId | Format-List
```

2. Require the approved address and `SharedMailbox` type. Check existing permissions with the `Get-` commands below; run each `Add-` command only for a missing, approved grant:

```pwsh
Add-MailboxPermission -Identity '<shared-mailbox-address>' -User '<automation-user-upn>' -AccessRights FullAccess -InheritanceType All -ErrorAction Stop
Get-EXOMailboxPermission -Identity '<shared-mailbox-address>' -User '<automation-user-upn>' -ErrorAction Stop |
	Select-Object User, AccessRights, Deny, IsInherited | Format-List
Add-RecipientPermission -Identity '<shared-mailbox-address>' -Trustee '<automation-user-upn>' -AccessRights SendAs -Confirm:$false -ErrorAction Stop
Get-EXORecipientPermission -Identity '<shared-mailbox-address>' -Trustee '<automation-user-upn>' -ErrorAction Stop |
	Select-Object Trustee, AccessRights, AccessControlType, IsInherited | Format-List
```

3. Check for explicit `FullAccess` with `Deny: False` and explicit `SendAs` with `AccessControlType: Allow`.
4. Check the shared-mailbox Entra account's sign-in state against the approved policy. Obtain approval before changing any mismatch.

5. Record the automation user's object ID, UPN, enabled plans, mailbox address, sign-in/MFA readiness, and shared-mailbox delegation in the deployment handover. Obtain the same evidence for delegated provisioning tasks.

## Step 5: Create Connections

Create the Outlook, Teams, and agent-node connections using the Automation User. Reuse the Dataverse connection provisioned by BusinessProcessCore with its service principal. Open the portals as the Deployment Administrator and authenticate each new connection as the Automation User.

### 5.1 Reuse the Core Dataverse Connection

1. List connections in the target environment:

```pwsh
pac connection list --environment <environment-id>
```

2. Locate the `shared_commondataserviceforapps` connection whose ID matches the Core reference `faf001_sharedcommondataserviceforapps` checked in Step 3.1. Confirm its status is `Connected`.
3. Retain the existing Core binding. Do not create a Dataverse connection for the Automation User.

### 5.2 Create the Outlook and Teams Connections
If you are deploying through a coding agent consider to automate below steps using playwright
1. Open [Power Automate](https://make.powerautomate.com/), select the target environment and open **More > Connections**.
2. Select **New connection > Office 365 Outlook > Create**. Choose **Use another account**, sign in as the Automation User, and complete MFA.
3. Repeat for **Microsoft Teams**, signing in as the Automation User.
4. Open each connection and confirm the account and `Connected` status. Record both connection IDs.

### 5.3 Create the Agent-Node Connection
If you are deploying through a coding agent consider to automate below steps using playwright
1. Open [Copilot Studio](https://copilotstudio.microsoft.com/), select the target environment, and open the new experience. 
2. To create a connection, create a temporary workflow, add an inline agent node, and select **Create new connection**.
3. Sign in as the Automation User and complete MFA. Use the account licensed in Step 4.2, not the Deployment Administrator.
4. Record the connection ID and confirm its API is `shared_agentnode`, its status is `Connected`, and its authenticated account is the Automation User.
5. Do not run, test, publish, or activate the temporary workflow. After checking dependencies and obtaining cleanup approval, delete the temporary workflow while retaining the connection.

### 5.4 Check and Record the Four Connections

1. List connections using the deployment administrator's PAC profile:

```pwsh
pac connection list --environment <environment-id>
```

2. Require a successful command and a `Connected` connection for each mapping:

| Solution connection reference | Connector API suffix | Intended authenticated identity |
| --- | --- | --- |
| `faf001_sharedcommondataserviceforapps` | `shared_commondataserviceforapps` | Existing Core service principal |
| `faf001_sharedoffice365` | `shared_office365` | Automation User |
| `faf001_sharedteams` | `shared_teams` | Automation User |
| `faf001_sharedagentnode` | `shared_agentnode` | Automation User |

3. Match the listed IDs to the connections created or reused above. Use the Outlook, Teams, and agent-node IDs in Step 7; leave the Core Dataverse binding unchanged.

## Step 6: Configure OrderProcessing Users and Task Visibility

### 6.1 Select Users and Dataverse Teams

1. Approve the business unit, team administrator, and named members for these order processing teams. Include the deployer in either team only with approval; exclude the automation user.

| Order Processing teams | Solution-owned security role |
| --- | --- |
| `Order Reviewers Global` | `Order Reviewer` |
| `Order Approvers Global` | `Order Approver` |

2. Confirm target Dataverse System Administrator access and separate Microsoft Graph read authorization for user/license/subscription discovery.
3. Confirm each selected user is enabled in Dataverse, eligible for the environment security group, and licensed with an active Power Apps Premium plan. Obtain separate approval for missing user provisioning or license assignments.

#### Discover and Select Licensed Users

1. List licensed users using the [solution-user helper](../../../scripts/dataverse_solution_users.py) under the Deployment Administrator's Azure CLI login:

```pwsh
uv run scripts/dataverse_solution_users.py --tenant-id <tenant-id> --organization-id <organization-id> --url <environment-url>
```

2. Record and approve the user UPNs for `Order Reviewers Global` and `Order Approvers Global`. Exclude the Automation User; include the Deployment Administrator only if approved.

### 6.2 Create Teams and Add Approved Members

1. Run the following command to configure both teams:

```pwsh
uv run scripts/dataverse_solution_users.py --tenant-id <tenant-id> --organization-id <organization-id> --url <environment-url> --select --team "Order Reviewers Global" --team "Order Approvers Global" --business-unit-id <approved-business-unit-id> --apply
```

2. At the `Order Reviewers Global` prompt, enter the comma-separated row numbers matching the approved reviewer UPNs in the displayed list.
3. At the `Order Approvers Global` prompt, enter the row numbers matching the approved approver UPNs. The helper then creates missing teams and adds the selected members.
4. Check the returned business unit and team memberships. For newly created teams, confirm the Deployment Administrator is the team administrator. Existing members must remain unchanged.



## Step 7: Prepare Mailbox Configuration and Deployment Settings

### 7.1 Prepare Target Settings

Deploy the committed solution package in `business-processes/order-processing/solution/build/`. Substitute its version segment for `<version>` in every command below; do not repack from `export/`.

1. Generate a settings template at a new path. For an existing target, generate a temporary template and compare it with the populated settings; do not overwrite them:

```pwsh
pac solution create-settings --solution-zip business-processes/order-processing/solution/build/OrderProcessing_<version>_unmanaged.zip --settings-file "business-processes/order-processing/solution/config/deployment-settings.<environment-name>.json"
```

2. Populate these entries using the approved mailbox and Step 5.4 connection IDs:

| Settings entry | Required target value |
| --- | --- |
| `EnvironmentVariables`: `faf001_OrderMailboxAddress` | Approved shared-mailbox SMTP address in `Value`; do not use the automation user's mailbox address. |
| `ConnectionReferences`: `faf001_sharedoffice365` | Verified Outlook connection ID and `shared_office365` connector API path. |
| `ConnectionReferences`: `faf001_sharedteams` | Verified Teams connection ID and `shared_teams` connector API path. |
| `ConnectionReferences`: `faf001_sharedagentnode` | Verified agent-node connection ID and `shared_agentnode` connector API path. |

3. Retain the Core-owned `faf001_sharedcommondataserviceforapps` binding; do not add it to OrderProcessing settings.
4. Review generated `CopilotAgents` sharing entries with the responsible administrator before import.

### 7.2 Check Settings

1. Parse flow/settings JSON and environment-variable XML. Check all four runtime/designer mailbox inputs use `Order Mailbox Address (faf001_OrderMailboxAddress)` and no hardcoded mailbox remains.
2. Require successful settings discovery, the required mailbox variable, and exactly the three OrderProcessing-owned references listed above.
3. Match reference names/API paths to the template and connection IDs to the target. Require the approved nonempty mailbox value.

## Step 8: Import the Solution

### 8.1 Validate the Package

`StageSolution` validates the package against the target and returns component-level results without importing it. Run from the repository root:

```pwsh
$org = 'https://<org>.crm<region>.dynamics.com'
$token = az account get-access-token --tenant <tenant-id> --resource $org --query accessToken --output tsv
$package = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path business-processes/order-processing/solution/build/OrderProcessing_<version>_unmanaged.zip).Path))
$result = Invoke-RestMethod -Method Post -Uri "$org/api/data/v9.2/StageSolution" `
    -Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' } `
    -Body (@{ CustomizationFile = $package } | ConvertTo-Json)
$result.StageSolutionResults.StageSolutionStatus
$result.StageSolutionResults.SolutionValidationResults | Select-Object SolutionValidationResultType, SolutionComponentName, Message
$result.StageSolutionResults.MissingDependencies | Select-Object -First 20
```

Require `Passed` with no validation results and no missing dependencies before importing.

### 8.2 Confirm the Target and Import

```pwsh
pac org who
```

Confirm the connected user, organization, and environment match the approved target, then import:

```pwsh
pac solution import --environment <environment-id> --path business-processes/order-processing/solution/build/OrderProcessing_<version>_unmanaged.zip --settings-file business-processes/order-processing/solution/config/deployment-settings.<environment-name>.json --publish-changes
```

Require `Solution Imported successfully` followed by `Published All Customizations`.

Omit `--activate-plugins`; flows must remain deactivated until activation is separately approved. Do not add `--force-overwrite` or `--skip-dependency-check` without separate justification and approval.

### 8.3 Check Imported Components

Reusing `$org` and `$token` from Step 8.1:

```pwsh
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }

# Solution version and mode
(Invoke-RestMethod -Headers $headers -Uri "$org/api/data/v9.2/solutions?`$filter=uniquename eq 'OrderProcessing'&`$select=uniquename,version,ismanaged,installedon").value

# Flows must be present and remain deactivated (statecode 0)
(Invoke-RestMethod -Headers $headers -Uri "$org/api/data/v9.2/workflows?`$filter=category eq 5&`$select=name,statecode,statuscode").value |
    Where-Object { $_.name -in @('mail-order-intake','extract-order-data','validate-order','finalize-order') }

# Connection references bound to the approved connections
(Invoke-RestMethod -Headers $headers -Uri "$org/api/data/v9.2/connectionreferences?`$select=connectionreferencelogicalname,connectionid").value |
    Where-Object { $_.connectionreferencelogicalname -like 'faf001_*' }

# Mailbox environment variable value
(Invoke-RestMethod -Headers $headers -Uri "$org/api/data/v9.2/environmentvariabledefinitions?`$filter=schemaname eq 'faf001_OrderMailboxAddress'&`$select=schemaname&`$expand=environmentvariabledefinition_environmentvariablevalue(`$select=value)").value

# Imported security roles and agents
(Invoke-RestMethod -Headers $headers -Uri "$org/api/data/v9.2/roles?`$filter=name eq 'Order Approver' or name eq 'Order Reviewer'&`$select=name,roleid").value
(Invoke-RestMethod -Headers $headers -Uri "$org/api/data/v9.2/bots?`$select=name,schemaname,statecode").value

Remove-Variable token, headers, package, result
```

Require the solution at the expected version, all four flows present with `statecode 0`, all four connection references bound to the approved connection IDs, the approved mailbox value applied, and both roles and agents created. Never print or store the access token.

## Step 9: Share Workflow Console with Business Users

1. Sign in to Azure CLI as the authorized deployment administrator in the approved tenant.
2. Obtain the Workflow Console app ID from its Power Apps details or play URL. Confirm each approved reviewer's/approver's Entra object ID and email; do not use Dataverse user or team IDs.
3. Run for each approved user to grant **Can use (`CanView`)**, retaining existing shares. Do not grant `CanEdit`:

```pwsh
$tenantId = '<tenant-id>'
$environmentId = '<environment-id>'
$appId = '<workflow-console-app-id>'
$principalId = '<approved-user-entra-object-id>'
$principalEmail = '<approved-user-email>'
$token = az account get-access-token --tenant $tenantId --resource https://service.powerapps.com/ --query accessToken --output tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not acquire Power Apps token.' }
$headers = @{ Authorization = "Bearer $token" }

try {
	$permissionsUri = "https://api.powerapps.com/providers/Microsoft.PowerApps/apps/$appId/permissions?api-version=2016-11-01&`$filter=environment%20eq%20'$environmentId'"
	$before = Invoke-RestMethod -Headers $headers -Uri $permissionsUri -ErrorAction Stop
	$existing = @($before.value | Where-Object { $_.properties.principal.id -eq $principalId })
	if ($existing.Count -eq 0) {
		$body = @{ put = @(@{ properties = @{
			roleName = 'CanView'
			capabilities = @()
			NotifyShareTargetOption = 'DoNotNotify'
			principal = @{ email = $principalEmail; id = $principalId; type = 'User'; tenantId = 'null' }
		} }) } | ConvertTo-Json -Depth 8
		$modifyUri = "https://api.powerapps.com/providers/Microsoft.PowerApps/scopes/admin/environments/$environmentId/apps/$appId/modifyPermissions?api-version=2016-11-01&`$filter=environment%20eq%20'$environmentId'"
		$null = Invoke-RestMethod -Method Post -Headers $headers -Uri $modifyUri -ContentType 'application/json' -Body $body -ErrorAction Stop
	} elseif (@($existing | Where-Object { $_.properties.roleName -ne 'CanView' }).Count -gt 0) {
		throw 'User already has a different permission; review before changing it.'
	}
	$after = Invoke-RestMethod -Headers $headers -Uri $permissionsUri -ErrorAction Stop
	$grant = @($after.value | Where-Object { $_.properties.principal.id -eq $principalId -and $_.properties.roleName -eq 'CanView' })
	if ($grant.Count -ne 1) { throw 'Expected CanView permission not verified.' }
	foreach ($permission in $before.value) {
		$preserved = @($after.value | Where-Object { $_.properties.principal.id -eq $permission.properties.principal.id -and $_.properties.roleName -eq $permission.properties.roleName })
		if ($preserved.Count -eq 0) { throw 'An existing permission was not found in readback.' }
	}
	$grant.properties | Select-Object roleName, principal
} finally {
	Remove-Variable token, headers -ErrorAction SilentlyContinue
}
```

4. Require a `CanView` readback for each user and unchanged existing shares. On redeployment, check existing users and add newly approved users.

## Step 10: Complete Access and Approve Activation

1. Run the [role helper](../../../scripts/dataverse_role.py) with the team and role names.

```pwsh
uv run scripts/dataverse_role.py --url <environment-url> --assign-team-role "Order Reviewers Global" "Order Reviewer" --assign-team-role "Order Approvers Global" "Order Approver"
```

2. Obtain explicit approval before processing live orders or executing downstream business actions.

3. Run the [activation script](scripts/activate-flows.ps1) as the Deployment Administrator after activation approval.

```pwsh
./business-processes/order-processing/solution/scripts/activate-flows.ps1 -EnvironmentUrl <environment-url> -TenantId <tenant-id> -OrganizationId <organization-id>
```
4. Require an `Activated` or `Unchanged` result for each flow. On failure, stop and inspect the reported flow; earlier activations are not rolled back. Rerun after resolving the error to skip active flows and continue.

## Step 11: Business Process Monitoring Sharing (Optional)

Complete this step only if approved business users need access to the monitoring agent in Teams and Microsoft 365 Copilot. Otherwise, skip to Step 12 and leave existing publication, channel, and sharing settings unchanged.

1. In [Copilot Studio](https://copilotstudio.microsoft.com/), select the target environment and open **Business Process Monitoring Agent** (`faf001_businessprocessmonitoringagent`).
2. Select **Publish**, confirm, and wait for successful publication.
3. Open **Channels > Teams and Microsoft 365 Copilot**. Select **Make agent available in Microsoft 365 Copilot**, then **Add channel**. If already configured, retain the channel and confirm both experiences are enabled.
4. Open the agent's **Share** dialog. Add the users approved in Step 6 for `Order Reviewers Global` and `Order Approvers Global`, including each person only once, and grant **User - can use the agent**, not authoring access. Retain existing shares; do not select everyone in the organization. Save and confirm each intended user has access.
5. Return to **Channels > Teams and Microsoft 365 Copilot > Availability options > Copy link**. Record this installation link in the deployment handover and share it with the approved users. The link does not grant access by itself; with Microsoft 365 Copilot enabled, installation through Teams makes the agent available in both experiences.
6. Have an approved reviewer and approver open the link in Teams desktop or web and select **Add**. Confirm the agent is available in Teams and Microsoft 365 Copilot. Each user must authenticate their own Dataverse connection when prompted. Perform any runtime validation only after approval; if installation is blocked, ask the Teams/Microsoft 365 administrator to review app availability policies.

## Step 12: Deployment Summary
Hand over deployment evidence, connection ownership/renewal, monitoring, recovery, and access-review responsibilities to the named operations owner.

## Troubleshooting

| Error or failure scenario | Action |
| --- | --- |
| `pac`, `az`, or `uv` is not found, or installation requires elevation | Complete the applicable prerequisite, reopen the terminal, and check PATH. For extension-only PAC installations, use the VS Code terminal. Have an authorized administrator complete installation interactively if elevation is required. |
| Python is missing or the helper reports an unsupported version | Complete the Python installation prerequisite, reopen the terminal, and check PATH. Then retry the helper with `uv run --python 3.11 scripts/<helper>.py <arguments>`. |
| PAC profile is missing or targets the wrong tenant | Run `pac auth create --name <profile-name>` or `pac auth select --index <index>`, then repeat `pac env list`. |
| Target is missing from the environment list or the selected URL/ID is wrong | Check tenant and access; repeat Step 2.1 with the approved ID. Do not create a replacement environment. |
| Environment creation is denied, lacks capacity, or times out | Check permissions, licensing, policy, and capacity in Core Appendix B. For a timeout, inspect provisioning status in the admin center before retrying. |
| Core components/configuration are missing, incompatible, or target another environment | Complete the affected Core setup step; obtain approval for upgrades or binding changes. Repeat Step 3 before import. |
| User, license, mailbox, or team operations are denied | Check the operator's active task-specific role, tenant, scope, and Graph consent. Delegate missing permissions to an authorized operator. |
| User creation fails or readback is interrupted | Check whether the user already exists. Read back a returned object ID before retrying; for password errors, enter a tenant-policy-compliant password directly at the prompt. |
| No Exchange/Teams seats are available | Pause the affected license assignment; obtain approval to purchase or reclaim seats. Review affected users, service/data impact, and direct/group assignment before removal. Check seat availability afterward. |
| Copilot Studio seats cannot be assigned to a user | Check the SKU. Use approved `VIRTUAL_AGENT_USL`, not company-scoped `Power_Virtual_Agents`. |
| `licenseDetails` omits a new license, or a licensed service is unavailable | Read `users/<upn>?$select=assignedLicenses`; check usage location, enabled plans, assignment errors, and provisioning status before connector use. |
| Shared-mailbox address conflicts or creation reports a replication warning | Inspect active/soft-deleted recipients. For a conflict, obtain a different approved address; after creation, read back the mailbox before retrying. Do not create a replacement while replication is pending. |
| Automation user cannot access the mailbox or send replies | Check its Exchange mailbox/plan provisioning, explicit Full Access and Send As grants, permission propagation, and authenticated Outlook identity. |
| Automation user's environment picker is empty | Create/manage the connection as the deployment administrator and authenticate the connector as the automation user. Do not add maker/admin roles or extra licenses solely for picker visibility. |
| Connection creation is blocked by authentication, consent, licensing, or policy | Record the identity, operation, and exact error; refer it to the responsible administrator. Obtain approval before changing identity, permissions, licenses, or policy. |
| Bound connection is missing or disconnected | Check environment and connection access; repair or reauthenticate the approved connection, then confirm its ID and reference binding. |
| Copilot execution is blocked by insufficient credits or billing coverage | In **Power Platform admin center > Licensing > Copilot Studio > Environments > target > Manage Copilot Credits**, inspect allocations, consumption, tenant-pool access, linked billing coverage, and spending controls without saving changes. Obtain capacity-owner approval before allocation, billing, or spending-limit changes. |
| Dataverse storage or file uploads fail because capacity is exhausted | Check target database/file usage and tenant capacity in the Power Platform admin center. Obtain approval for cleanup or additional capacity before retrying. |
| Connector or AI actions are blocked by policy | Check connector DLP compatibility and AI-provider, web-search, data-movement, and retention policies with the responsible administrator. Obtain approval before changing policy. |
| Agent connector, harness, or exact `claude-opus-5` model is unavailable | Inspect the target Copilot Studio model settings and **Manage > Copilot Studio > agent inventory > Harness**, provider policy, and author/invoker access without invoking agents. Keep affected workflows disabled; obtain target-specific administrator or Microsoft support confirmation. Do not substitute a model or license without approval. |
| Shared-mailbox storage, archiving, or hold features are unavailable | Ask the Exchange administrator to check mailbox size and feature-specific licensing and approve any required assignment. |
| Activation returns `DynamicOperationRequestClientFailure`, `agentnode` `GetOutputSchema`, HTTP 403/non-JSON | Check whether the authenticated agent-node identity lacks `VIRTUAL_AGENT_USL`; assign it after approval. Revalidate during an approved activation window. |
| Agent node selects the administrator's connection | Inspect agent-node connections and dependencies. After cleanup approval, remove the extra administrator connection, preserve the approved one, and reopen the flow. |
| Dataverse trigger registration is denied | Check the Core application user's Basic Create/Read/Write/Delete on Callback Registration and organization-level step Read. If missing, reapply [Core Step 6](../../../core/solution/DEPLOYMENT.md#step-6-grant-system-and-core-table-privileges) after approval; do not grant System Administrator. |
| Teams notifications fail | Check automation-user/recipient Teams plans, recipient routing, Workflows app policy, and Flow bot cloud support. |
| Solution-user helper omits a user or rejects a team | Check enabled Dataverse/Entra membership, active `POWERAPPS_PER_USER`, Graph read access, and team type/business unit/administrator. Approve corrections separately; inspect partial writes before retrying. |
| Package validation or import fails | Run Step 8.1 `StageSolution`, inspect validation results/missing dependencies, correct the reported issue, and repack. Require `Passed` before retrying import. |
| Import reports `Solution manifest import: FAILURE: Object reference not set to an instance of an object.` | Inspect `Other/Solution.xml`: add a missing `<MissingDependencies />` after `</RootComponents>` and set `<Managed>0</Managed>` for this unmanaged package. Repack and repeat Step 8.1. |
| Imported workflows are active before approval | Stop deployment and arrange immediate deactivation with the deployment owner; check for unintended runs before continuing. |
| Flow keeps an old mailbox environment-variable value | Confirm the target current value and parameter bindings. During an approved change window, save the flow or turn it off/on; do not activate it during preparation. |
| Workflow Console shows **Request access** | Complete Step 9 for the user's Entra object ID; confirm `CanView` and reopen under that user's account. |
| App sharing finds a different permission or loses an existing share | Stop and inspect current permissions. Obtain approval before changing an existing grant or restoring missing access. |
| Console opens but data/tasks are inaccessible | Check environment eligibility, Power Apps Premium, team membership, imported role assignments, and effective table/custom-API privileges under the affected user's account. |