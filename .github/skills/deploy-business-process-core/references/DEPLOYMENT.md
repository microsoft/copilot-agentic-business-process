# BusinessProcessCore Deployment Guide

Run commands from the repository root in PowerShell 7. Use `pac` for deployment; the PowerShell helpers that call Dataverse use the Azure CLI sign-in. Each helper prints one `PASS`/`FAIL` line. Keep secrets out of documentation, deployment settings, and terminal output.

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

PAC and Azure CLI use separate authentication caches; the PowerShell helpers reuse the Azure CLI sign-in. Confirm both identities before making changes.

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

Confirm environment ID, organization URL, organization ID, and account. Record the organization ID separately; the installation check requires it, not the environment ID.

### 2.4 Enable Code Apps

Workflow Console is a code app. Enable **Power Apps code apps** through PAC (2.12.1+) and verify it by readback:

```pwsh
& "$skillFolder/scripts/enable_code_apps.ps1" -EnvironmentId <environment-id>
```

Require `PASS Code Apps`. For an externally supplied environment, run with `-CheckOnly`; if it fails, have the environment owner enable the feature. Feature changes require an authorized environment/platform administrator; solution import does not enable them.

## Step 3: Create the Runtime Identity and Connection

Run these substeps in order: security role, service principal/application user, then Dataverse connection.

### 3.1 Create the Security Role

Create `Business-Process-User` without granting table privileges, using the role name from [the role specification](../../../../core/solution/config/security-role.business-process-user.json):

```pwsh
./scripts/dataverse_role.ps1 -TenantId <tenant-id> -Url <environment-url> -SpecPath core/solution/config/security-role.business-process-user.json -CreateOnly
```

This creates the role only; an existing role's privileges remain unchanged. Apply all specified system-table and Core-table privileges after import in Step 6.

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
| `EnvironmentVariables`: `faf001_WorkflowConsoleBaseUrl` | Existing target Workflow Console base URL on redeployment. For the first import, use `https://apps.powerapps.com/` temporarily; Step 7 sets the real value without a second import. Do not leave `Value` empty. |
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

The 13 monitoring tools keep `authMode: Invoker`: each user's own Dataverse connection is used at runtime. Do not hardcode the organization URL or substitute the runtime service principal for users' connections.

### 5.1 Link the Monitoring Agent Tools

Solution import does not carry the links between the monitoring agent's tools and the Dataverse connection reference; the export format has no place for them. Create them after every import:

```pwsh
& "$skillFolder/scripts/link_agent_tools.ps1" -TenantId <tenant-id> -Url <environment-url>
```

Require `PASS Agent tool links`. The script adds only missing links, rejects conflicting ones, and is safe to rerun; it does not change tool definitions, authentication, or connection bindings, and does not publish the agent.

## Step 6: Grant System and Core Table Privileges

1. Grant `Business-Process-User` all privileges defined in the role specification for system and Core tables. Run without `-CreateOnly` after the solution import:

```pwsh
./scripts/dataverse_role.ps1 -TenantId <tenant-id> -Url <environment-url> -SpecPath core/solution/config/security-role.business-process-user.json
```

2. Require the `PASS role` line. The helper fails without granting anything if a specified table is missing; `environmentvariablevalue.Read` is reported as not applicable because Dataverse has no such privilege.
3. The Installation Check verifies effective application-user privileges through `RetrieveUserPrivileges`. Do not grant System Administrator to resolve runtime failures.

## Step 7: Set the Workflow Console URL

Set `faf001_WorkflowConsoleBaseUrl` to the installed Console's stable play URL directly in Dataverse; no second import is needed. Passing the settings file keeps it current for later redeployments:

```pwsh
& "$skillFolder/scripts/set_console_url.ps1" -TenantId <tenant-id> -EnvironmentId <environment-id> -Url <environment-url> -SettingsFile ./core/solution/config/deployment-settings.<environment-name>.json
```

Require `PASS Console URL`; the value has the form `https://apps.powerapps.com/play/e/<environment-id>/app/<app-id>` with no query string or fragment.


## Troubleshooting

| Error or failure scenario | Action |
| --- | --- |
| `pac`, `az`, or PowerShell 7 is missing | Complete prerequisites, reopen the terminal, and check PATH. For extension-only PAC installations, use the VS Code terminal. Have an authorized administrator handle any elevation prompt. |
| `--macro-region` is not recognized, `macroRegion '<value>' is not valid`, or `environment-management` is unknown | PAC is older than 2.12.1. Update PAC (see technical prerequisites) and retry. Pass a macro-region such as `north-america`, not a region such as `unitedstates`. |
| `pac admin create` ends with `Property 'linkedEnvironmentMetadata' is missing` after `Polling completed with status code : OK` | The environment is normally created. Run `pac admin list --name <display-name>` and continue with its ID; do not create it again. |
| Profile, tenant, organization, or account does not match | Stop and correct the relevant PAC, Azure CLI, or helper authentication context before retrying. |
| Identity/application-user creation is denied | Check Entra creation permissions separately from target Dataverse System Administrator access. Delegate the missing operation; do not grant runtime administrative roles. |
| Role helper reports missing tables | Verify the correct target and successful solution import, then rerun Step 6. |
| `environmentvariablevalue` has no Read privilege | Expected: access is governed by `environmentvariabledefinition`. Verify definition Read and actual runtime access separately. |
| Dataverse trigger registration is denied | Check Basic Callback Registration CRUD and organization-level Read on the relevant process table. Reapply Step 6 after approval and verify effective privileges. |
| Service-principal creation fails or is interrupted | Inspect the securely stored result and existing Entra/Dataverse identities before retrying. Do not create duplicate identities or overwrite credential output. |
| Credential is exposed or expires | Have the custodian rotate it on the existing application, update/recreate the affected connection as required, verify bindings, and revoke the old credential. Do not delete the application registration as a rotation procedure. |
| Import reports `ConnectionNotFound` | Check connector API, target environment, and connection Name. For PAC-created connections retain `pac-dv-`, not the bare `Id`. |
| Import rejects an empty environment-variable value | Supply a nonempty target value. For the first Console import use Step 4's temporary value; Step 7 then sets the real URL. |
| Import reports an unexpected error | Follow [Appendix A](#appendix-a--diagnosing-a-failed-import). Inspect the failed import, not an unrelated latest job. Confirm target state before retrying. |
| Code app imports but will not run | Run Step 2.4 with `-CheckOnly`, confirm the user has Power Apps Premium, and confirm the app is shared with that user. |
| Console links are malformed or target the wrong app | Rerun Step 7; it derives the stable URL from the installed app. |
| Agent fails with `BotDefinitionOverride has unresolved references: ... missing connection reference(s)`, or its tools show **Not connected** | Rerun Step 5.1, then have each user select their own Dataverse connection on first use. |
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
2. Have an eligible provisioning identity perform creation. When tenant policy restricts creation, prefer Power Platform Administrator; accept an existing active tenant-wide Global Administrator assignment when Power Platform Administrator is absent. Activate any required eligible role through the organization's approved process.
3. Approve the settings below. Offer the defaults so the approver only changes what they know needs to differ; these values were tested with PAC 2.12.1.

| Setting | Default | When to change |
| --- | --- | --- |
| Display name (`--name`) | `business-process-dev` | Use a name that identifies the purpose, for example `<customer>-<process>-dev`. |
| URL prefix (`--domain`) | Same as the display name | Lowercase letters, digits, and hyphens; must be unique. If taken, append a short suffix such as `-01`. |
| Type (`--type`) | `Sandbox` | `Developer` for a personal environment where eligible; `Production` only with explicit approval. |
| Macro-region (`--macro-region`) | `north-america` (United States or Canada) | Use the geography where the data must reside; run `pac admin create --help` for accepted values and see [macro-regions](https://learn.microsoft.com/en-us/power-platform/admin/macro-regions). Never pass a region such as `unitedstates`. |
| Currency (`--currency`) | `USD` | The organization's base currency (ISO code); it cannot be changed after creation. |
| Language (`--language`) | `English` | The organization's base language; it cannot be changed after creation. |
| Security group (`--security-group-id`) | None | Required when tenant policy restricts environment membership to a group. |

4. Create the approved environment with PAC 2.12.1 or newer. Do not combine `--macro-region` with `--region`. With the defaults:

```pwsh
pac admin create --name business-process-dev --type Sandbox --macro-region north-america --currency USD --language English --domain business-process-dev
```

5. Once provisioning completes, list/select the environment using Step 2, confirm the actual region in `pac env list`, and enable code apps using [Step 2.4](#24-enable-code-apps). For a timeout, inspect provisioning status before retrying; do not create a replacement environment.