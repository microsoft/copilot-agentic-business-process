# Core Installation Check

1. Confirm the approved target and package/version/state. Resolve this skill's folder to `$skillFolder` and the repository root to `$repositoryRoot` before executing PowerShell.
2. Run the read-only verification script:

```powershell
$report = & "$skillFolder/scripts/check_installation.ps1" -TenantId <tenant-id> -EnvironmentId <environment-id> -Url <environment-url> -OrganizationId <organization-id> -RepositoryRoot $repositoryRoot
$report.Checks | Format-List Check, Status, Evidence
$report.Overall
```

3. Evaluate every criterion below. Successful PAC commands collect evidence, not installation passes; resolve every `Not verified` result through read-only checks or administrator evidence.

| Criterion | Required evidence |
| --- | --- |
| Solution | `BusinessProcessCore` at the approved version and managed/unmanaged state. |
| Custom APIs | Every API in the approved package is registered. |
| Plug-in package | Intended package version and enabled required plug-in registrations. Query registration records separately if the package listing does not include them. |
| Workflow Console | App present with the target play URL; Enable code apps confirmed in environment features. |
| Console URL variable | Current `faf001_WorkflowConsoleBaseUrl` equals the stable Console URL without query/fragment, not the temporary default. |
| Dataverse connection | `faf001_sharedcommondataserviceforapps` bound to the approved Connected service-principal connection; verify its authenticated identity. |
| Runtime role | Approved application user assigned `Business-Process-User`; compare `RetrieveUserPrivileges` with table `EntityDefinitions` privilege metadata and the role specification. Require all specified grants, including Callback Registration CRUD at Basic and organization-level Read on trigger process tables. |
| Monitoring agent | `faf001_businessprocessmonitoringagent` Active; all 13 tool associations verified with Invoker authentication and current-organization variables unchanged. Inspect tool data for the organization-variable settings. |

4. Report overall Pass only when every criterion passes; otherwise Fail or Not verified with blockers. Check current state, not historical imports, for existing installations. Publication/user access and runtime tests are separate; do not invoke business actions or apply repairs.