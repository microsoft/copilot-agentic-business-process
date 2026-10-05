# AGENTS.md — Business Process API (Dataverse plug-in)

C# plug-in that implements the `faf001_*` Custom Actions behind the Workflow Console and
the monitoring agent. The public contract is [README.md](README.md); the build, test, and
registration procedure is [DEVELOPMENT.md](DEVELOPMENT.md). Read both before changing
behavior.

> A business process should almost never need to change this project. Process flows
> write the core tables directly through the Dataverse connector. Change the API only for
> process-agnostic capability the user has agreed to add to the core.

## Toolchain

- Target framework **`net462`** (Dataverse sandbox) — no APIs or packages beyond .NET
  Framework 4.6.2. SDK pinned by [global.json](global.json) (.NET 10 feature band).
- Windows with the .NET Framework 4.8 runtime is required to run the unit tests.
- Packages are pinned with lock files: always restore with `--locked-mode`. If you
  intentionally change a package version, regenerate and commit the affected
  `packages.lock.json`. Do not add new dependencies without the user's agreement — the
  plug-in package ships to the Dataverse sandbox.
- Not strong-name signed. Output is a NuGet **plug-in package** (`business-process-api`),
  registered as a package, never as a standalone DLL.

## Commands (run from this folder)

```powershell
dotnet restore business-process-api.sln --locked-mode
dotnet build business-process-api.sln --configuration Release --no-restore
dotnet test tests/BusinessProcessApi.Tests/BusinessProcessApi.Tests.csproj --configuration Release --no-restore   # offline unit tests
dotnet test business-process-api.sln --configuration Release --no-restore                                        # all; integration tests skip by default
pwsh -NoProfile -File scripts/build-package.ps1                                                                   # verified .nupkg in artifacts/package
```

Integration tests (`tests/BusinessProcessApi.IntegrationTests`, `Category=Integration`)
are read-only but hit a real environment: run them only when the user asks and supplies
a non-production environment (see DEVELOPMENT.md for the required environment variables).

`scripts/register-business-process-api.ps1` is a **dry run unless `-Apply`** is passed.
Never pass `-Apply` without the user confirming the target environment and organization ID.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/BusinessProcessApi/Api/` | One stateless entry point per Custom Action (`<Name>Plugin.cs`), deriving from `Infrastructure/Execution/CustomApiPluginBase` |
| `src/BusinessProcessApi/Services/` | Validation, authorization, visibility, submission parsing (`WidgetSubmission.cs`), business behavior |
| `src/BusinessProcessApi/Repositories/` | Dataverse queries and persistence (`Dataverse*Repository.cs`, interfaces `I*Repository`) |
| `src/BusinessProcessApi/Infrastructure/` | Execution base class, continuation-token codec |
| `spec/<uniquename>.json` | Custom API provisioning contract; `pluginTypeName` binds it to the class |
| `tests/BusinessProcessApi.Tests/` | xUnit + Moq offline tests, incl. `ApiMetadataTests` that check `spec/` against entry points and `Fixtures/Metadata/` choice XML |
| `tests/BusinessProcessApi.IntegrationTests/` | Opt-in read-only tests against an installed API |

## Invariants — do not break

- **Run as the caller.** `CustomApiPluginBase` creates the organization service for
  `context.UserId`; Dataverse row, column, and table security stay authoritative. Never
  elevate to SYSTEM to work around a privilege failure.
- **Registration shape.** Main operation (stage 30), synchronous (mode 0); the base class
  rejects anything else.
- **Transactional completion.** `faf001_CompleteTask` requires the ambient synchronous
  transaction; any failure must propagate so all writes roll back. Do not wrap it in
  `ExecuteMultiple`, `ExecuteTransaction`, or `TransactionScope`.
- **Optimistic concurrency.** Task, step, and output writes use row-version checks
  (`IfRowVersionMatches`); conflicts surface as explicit errors, never silent overwrites.
- **Opaque continuation tokens** bound to action, caller, organization, filters, and page
  size; reject tokens whose binding does not match.
- **Errors** are `InvalidPluginExecutionException` with a clear message; never return a
  partial response.
- **No instance state.** Dataverse caches plug-in instances — keep per-call state in
  local variables.
- **Submission contract** (outcome, notes, `values[]`, output-key prefix = widget ID
  minus `-ui`, reserved `decision`/`notes`) is consumed by every process flow. Treat it
  as a public API: extend compatibly, never change existing semantics.

## Adding or changing a Custom Action

Change all of these together:

1. `src/BusinessProcessApi/Api/<Name>Plugin.cs` + service/repository logic.
2. `spec/faf001_<Name>.json` (same name as `uniquename`, with `pluginTypeName`).
3. `core/solution/export/customapis/faf001_<Name>/` — `customapi.xml`,
   `customapirequestparameters/<param>/customapirequestparameter.xml`,
   `customapiresponseproperties/<prop>/customapiresponseproperty.xml`.
4. Unit tests, including the `ApiMetadataTests` data rows for the new contract.
5. [README.md](README.md) action index and contract section.
6. Console consumers if any (`src/features/*/…-api-contracts.ts`; register generated
   bindings with `npx --no-install pa app add dataverse-api --api-name faf001_<Name>`).
7. Rebuild the package and refresh
   `core/solution/export/pluginpackages/faf001_business-process-api/package/*.nupkg`,
   then repack the core solution (root [AGENTS.md](../../../AGENTS.md#changing-power-platform-solutions)).

Do not embed environment URLs, organization IDs, package IDs, or solution IDs in source
or scripts — pass them as parameters.
