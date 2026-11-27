# Core Installation Check

1. Confirm the approved target. Resolve this skill's folder to `$skillFolder` and the repository root to `$repositoryRoot` before executing PowerShell. The check compares the target with the single package in `core/solution/build/` (override with `-PackagePath`) and with `core/solution/config/security-role.business-process-user.json`.
2. Run the read-only check (Azure CLI and PAC must be signed in to the approved tenant):

```powershell
& "$skillFolder/scripts/check_installation.ps1" -TenantId <tenant-id> -EnvironmentId <environment-id> -Url <environment-url> -OrganizationId <organization-id> -RepositoryRoot $repositoryRoot
```

3. The script prints one `PASS`/`FAIL` line per criterion and `Overall: PASS` only when all pass (exit code 1 otherwise). Add `-PassThru` to return the report object instead. Each criterion is evaluated against live data:

| Criterion | What is verified |
| --- | --- |
| Solution | `BusinessProcessCore` installed at the package version and managed/unmanaged state. |
| Plug-in package | Package `uniquename` and version active; one sandboxed assembly; its plug-in types. |
| Custom APIs | Every API in the package is active, has the packaged signature, is bound to the plug-in type with the packaged export key, and has an enabled main-operation (stage 30) step. |
| Workflow Console | The packaged code app is installed with a play URL for this environment; Code Apps enabled (`PowerApps_AllowCodeApps`). |
| Console URL variable | Current `faf001_WorkflowConsoleBaseUrl` value equals the installed app's stable play URL. |
| Dataverse connection | The packaged connection reference is bound to a Connected client-credentials connection in this tenant; its client ID identifies the runtime application. |
| Runtime role | That application user is enabled and holds only `Business-Process-User`; `RetrieveUserPrivileges` shows every specified privilege at the specified depth (exact depth for `tableDepths` overrides, such as Basic Callback Registration). `environmentvariablevalue.Read` is reported as not applicable. |
| Monitoring agent | Every packaged agent is Active; every packaged agent component exists, is active, and its definition matches the package byte for byte; every tool uses `authMode: Invoker` on the packaged connection reference and is linked to it (`botcomponent_connectionreference`, created by deployment Step 5.1). |

4. Report overall Pass only when every criterion passes; otherwise report the failing lines as blockers. Check current state, not historical imports. Publication/user access and runtime tests are separate; do not invoke business actions or apply repairs in this workflow.
