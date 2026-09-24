# BusinessProcessCore Deployment Guide

Run commands from the repository root. Use `pac` for deployment and `uv` for Python helpers when needed. Keep secrets out of documentation, deployment settings, and terminal output.

## Prerequisites

- [Roles and licensing](./roles-and-licensing.md)
- [Technical prerequisites](./technical-prerequisites.md)


## Step 1: Check Authentication

```pwsh
pac auth list
pac env list
```

Confirm the active profile targets the approved tenant. Create or select a profile when needed:

```pwsh
pac auth create --name <profile-name>
pac auth select --index <index>
```

PAC, Azure CLI, and the Python role helper use separate authentication caches. Confirm each identity before making changes.

## Step 2: Select or Create the Environment

### 2.1 Find the Target

```pwsh
pac env list
```

Use the approved environment ID, not its display name. If absent, follow [Appendix B](#appendix-b--creating-an-environment) before continuing.

### 2.2 Select the Environment

```pwsh
pac env select --environment <environment-id>
```

### 2.3 Confirm the Target

```pwsh
pac env who
```

Confirm environment ID, organization URL, organization ID, and account. Record the organization ID separately; the agent-connection helper requires it, not the environment ID.

### 2.4 Confirm the Required Environment Features
If you have access to playwright, you can automate the verification of these settings.
1. In [Power Platform admin center](https://admin.powerplatform.microsoft.com/), open **Manage > Environments > target environment > Settings > Product > Features**.
2. Enable **Power Apps code apps > Enable code apps** for Workflow Console and save.
3. For an externally supplied environment, obtain confirmation from its owner. Feature changes require an authorized environment/platform administrator; solution import does not enable them.

## Step 3: Create the Runtime Identity and Connection

Run these substeps in order: security role, service principal/application user, then Dataverse connection.

### 3.1 Create the Security Role

Create `Business-Process-User` without granting table privileges, using the role name from [the role specification](../../../../core/solution/config/security-role.business-process-user.json):

```pwsh
uv run scripts/dataverse_role.py --url <environment-url> --spec core/solution/config/security-role.business-process-user.json --create-only
```

Complete device-code sign-in when prompted. This creates the role only; an existing role's privileges remain unchanged. Apply all specified system-table and Core-table privileges after import in Step 6.

### 3.2 Create the Service Principal and Application User

Create the Entra application, service principal, and Dataverse application user with the role created in Step 3.1. Save the generated credential output under `.secrets/`:

```pwsh
New-Item -ItemType Directory -Path .secrets -Force | Out-Null
if (Test-Path .secrets/spn.<environment-name>.txt) { throw 'Credential output file already exists.' }
pac admin create-service-principal --environment <environment-url> --name <app-name> --role Business-Process-User *> .secrets/spn.<environment-name>.txt
if ($LASTEXITCODE -ne 0) { throw 'Service-principal creation failed; output is in the credential file.' }
```

### 3.3 Create the Dataverse Connection

Create the connection using the credentials saved in Step 3.2:

```pwsh
./scripts/dataverse_connection_create.ps1 -EnvironmentUrl <environment-url> -ServicePrincipalFile .secrets/spn.<environment-name>.txt -ConnectionName <connection-name>
```

The helper reads the tenant ID, application ID, and secret from the file, calls `pac connection create`, and lists the target connections without printing the credential. Use the new connection's **Name** from that output in Step 4, including its `pac-dv-` prefix, not the bare `Id` column. PAC receives the secret as a process argument; run on a trusted workstation without command-line capture.

## Step 4: Configure Deployment Settings

### 4.1 Generate Target Settings

Generate a deployment settings file from the committed solution package in `core/solution/build/`. Substitute its version segment for `<version>` in every command below.

```pwsh
pac solution create-settings --solution-zip ./core/solution/build/BusinessProcessCore_<version>_unmanaged.zip --settings-file ./core/solution/config/deployment-settings.<environment-name>.json
```

Keep populated per-environment settings and `.secrets/` excluded from source control; never place credentials in settings.

### 4.2 Complete the Generated Entries

| Settings entry | Required target value |
| --- | --- |
| `ConnectionReferences`: `faf001_sharedcommondataserviceforapps` | Connection Name from Step 3.3 in `ConnectionId`; retain `/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps` in `ConnectorId`. |
| `EnvironmentVariables`: `faf001_WorkflowConsoleBaseUrl` | Existing target Workflow Console base URL on redeployment. For the first import, use `https://apps.powerapps.com/` temporarily and replace it in Step 7. Do not leave `Value` empty. |
| `CopilotAgents`: `faf001_businessprocessmonitoringagent` | Retain generated defaults unless agent sharing with a specific Entra security group is approved. Do not use a Dataverse team ID as `AadGroupId`. |

Parse the settings as JSON and confirm the target connection exists, each connector API matches, and no environment-variable `Value` is empty. Compare with the generated template whenever package components change.

## Step 5: Import the Solution

1. Confirm the target immediately before import:

```pwsh
pac env who
```

2. Import the approved package and target settings:

```pwsh
pac solution import --path ./core/solution/build/BusinessProcessCore_<version>_unmanaged.zip --settings-file ./core/solution/config/deployment-settings.<environment-name>.json --publish-changes
```

3. Require `Solution Imported successfully` followed by `Published All Customizations`.
4. Run `pac solution list` and require `BusinessProcessCore` at the intended version with the expected unmanaged state. On failure, inspect import details and target state before retrying; do not assume everything was rolled back.

### 5.1 Verify Monitoring Agent Connection-Reference Associations

1. Run the [agent-connection helper](../../../../scripts/dataverse_agent_connections.ps1) with the target Dataverse organization ID:

```pwsh
./scripts/dataverse_agent_connections.ps1 -TenantId <tenant-id> -Url <environment-url> -OrganizationId <organization-id>
```

2. If it reports missing associations, review the target and run the repair as the Dataverse administrator:

```pwsh
./scripts/dataverse_agent_connections.ps1 -TenantId <tenant-id> -Url <environment-url> -OrganizationId <organization-id> -Apply
```

3. Rerun the first command and require `Verified 13 tool associations; added 0.` The helper adds only missing relationships and rejects conflicts; it does not invoke tools or publish the agent. If a repair fails partway through, inspect the error and rerun to complete the missing associations.
4. Retain `authMode: Invoker` and the organization variables whose `(Current)` value is `current`. The 13 tools use `ListRecordsWithOrganization` or `PerformUnboundActionWithOrganization`; do not hardcode the organization URL or substitute the runtime service principal for users' connections.


## Step 6: Grant System and Core Table Privileges

1. Grant `Business-Process-User` all privileges defined in the role specification for system and Core tables. Run without `--create-only` after the solution import:

```pwsh
uv run scripts/dataverse_role.py --url <environment-url> --spec core/solution/config/security-role.business-process-user.json
```

2. Require all Core tables to be resolved with no missing-table skips. Confirm the runtime application user retains `Business-Process-User`.
3. Verify effective application-user privileges through `RetrieveUserPrivileges` against table `EntityDefinitions` privilege metadata: Callback Registration CRUD at Basic and organization-level Read on process tables used by organization-scoped triggers. Review broader existing grants separately; do not grant System Administrator to resolve runtime failures.

## Step 7: Set the Workflow Console URL

### 7.1 Obtain the Target URL

```pwsh
pac env fetch --xmlFile "$skillFolder/scripts/fetchxml/canvas-apps.xml"
```

Locate Workflow Console and retain only the stable base URL, without query string or fragment:

```text
https://apps.powerapps.com/play/e/<environment-id>/app/<app-id>
```

### 7.2 Apply the Value

1. In the generated `core/solution/config/deployment-settings.<environment-name>.json`, find the `EnvironmentVariables` entry whose `SchemaName` is `faf001_WorkflowConsoleBaseUrl`. Set its `Value` to the Workflow Console base URL from Step 7.1, preserving all other settings:

```json
{
	"SchemaName": "faf001_WorkflowConsoleBaseUrl",
	"Value": "https://apps.powerapps.com/play/e/<environment-id>/app/<app-id>",
	"DefaultValue": "https://apps.powerapps.com/"
}
```

2. Import `BusinessProcessCore` again with the updated deployment settings:

```pwsh
pac solution import --path ./core/solution/build/BusinessProcessCore_<version>_unmanaged.zip --settings-file ./core/solution/config/deployment-settings.<environment-name>.json --publish-changes
```

3. Read the environment variable from Dataverse:

```pwsh
pac env fetch --xmlFile "$skillFolder/scripts/fetchxml/environment-variables.xml"
```

For the row with `schemaname` equal to `faf001_WorkflowConsoleBaseUrl`, require `current.value` to equal the Workflow Console base URL entered in the settings file, not the temporary `https://apps.powerapps.com/` default.


## Troubleshooting

| Error or failure scenario | Action |
| --- | --- |
| `pac`, `az`, or `uv` is missing | Complete prerequisites, reopen the terminal, and check PATH. For extension-only PAC installations, use the VS Code terminal. Have an authorized administrator handle any elevation prompt. |
| Python is missing or unsupported | Install Python 3.11 or newer, then retry with `uv run --python 3.11 scripts/<helper>.py <arguments>`. |
| Dependency download fails with `HandshakeFailure` | Check access to both `pypi.org` and `files.pythonhosted.org`. Use the organization's approved package proxy through `UV_INDEX_URL` when required. |
| Profile, tenant, organization, or account does not match | Stop and correct the relevant PAC, Azure CLI, or helper authentication context before retrying. |
| Identity/application-user creation is denied | Check Entra creation permissions separately from target Dataverse System Administrator access. Delegate the missing operation; do not grant runtime administrative roles. |
| Role helper skips Core tables after import | Verify the correct target and successful solution import, then reapply the role specification. |
| `environmentvariablevalue` has no Read privilege | Expected: access is governed by `environmentvariabledefinition`. Verify definition Read and actual runtime access separately. |
| Dataverse trigger registration is denied | Check Basic Callback Registration CRUD and organization-level Read on the relevant process table. Reapply Step 6 after approval and verify effective privileges. |
| Service-principal creation fails or is interrupted | Inspect the securely stored result and existing Entra/Dataverse identities before retrying. Do not create duplicate identities or overwrite credential output. |
| Credential is exposed or expires | Have the custodian rotate it on the existing application, update/recreate the affected connection as required, verify bindings, and revoke the old credential. Do not delete the application registration as a rotation procedure. |
| Import reports `ConnectionNotFound` | Check connector API, target environment, and connection Name. For PAC-created connections retain `pac-dv-`, not the bare `Id`. |
| Import rejects an empty environment-variable value | Supply a nonempty target value. For the first Console import use Step 4's temporary value, then complete Step 7. |
| Import reports an unexpected error | Follow [Appendix A](#appendix-a--diagnosing-a-failed-import). Inspect the failed import, not an unrelated latest job. Confirm target state before retrying. |
| Code app imports but will not run | Confirm code apps is enabled, the user has Power Apps Premium, and the app is shared with that user. |
| Monitoring agent has missing or conflicting tool associations | Run Step 5.1. Apply only missing associations; investigate conflicts without replacing caller authentication or connection bindings. |
| Console links are malformed or target the wrong app | Set the target base URL without query string/fragment and verify the current value using Step 7. |
| User can open the app/agent but cannot access data | Check environment eligibility, business roles/team memberships, effective table/API permissions, and the user's own connection. Sharing alone does not grant data access. |
| Agent execution is blocked by credits, policy, or channel availability | Ask the capacity/platform administrator to check billing, DLP/AI policies, and channel availability. Obtain approval before changing capacity, policies, model, or audience. |

<a id="appendix-a--diagnosing-a-failed-import"></a>

## Appendix A: Diagnose a Failed Import

1. Find the import job matching this solution and deployment time:

```pwsh
pac env fetch --xmlFile scripts/fetchxml/import-jobs.xml
```

2. In [Power Apps](https://make.powerapps.com/), select the target environment, open **Solutions > Solution history**, and open the matching failed import. Inspect the error details and download the log when available.
3. Record the job ID and failing component/message, correct that cause, and retry the approved package. Progress or component presence alone does not prove success.
4. If using a custom FetchXML query for import-job details, omit `top`; PAC adds paging and rejects the combination.

<a id="appendix-b--creating-an-environment"></a>

## Appendix B: Create an Environment

Skip when the target already exists.

1. Confirm [environment-creation eligibility](https://learn.microsoft.com/en-us/power-platform/admin/create-environment#who-can-create-environments), tenant creation policy, and available Dataverse capacity. Production/Sandbox creation normally requires at least 1 GB available database capacity; check requirements for the selected type. Microsoft 365 or Power Apps Developer Plan alone does not entitle a user to create Production environments.
2. Have an eligible provisioning identity perform creation. When tenant policy restricts creation, use an authorized administrator such as Power Platform Administrator. Activate any required eligible role through the organization's approved process.
3. Approve display name, type, region, currency, language, URL prefix, and security group. Use Sandbox for dev/test or Developer where eligible.
4. Create the approved environment; add `--security-group-id <group-id>` when required by policy:

```pwsh
pac admin create --name <display-name> --type <environment-type> --region <region> --currency <currency-code> --language <language> --domain <url-prefix>
```

5. Once provisioning completes, list/select the environment using Step 2 and enable code apps using [Step 2.4](#24-confirm-the-required-environment-features). For a timeout, inspect provisioning status before retrying; do not create a replacement environment.