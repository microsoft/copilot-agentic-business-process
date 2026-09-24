# Development

Run all commands below from `core/plugins/business-process-api/`, the directory holding
`business-process-api.sln`. The committed lock files and Custom
API definitions are required source assets; generated `bin`, `obj`, `TestResults`,
`.vs`, and `artifacts` directories are not committed.

## Prerequisites

- Windows with the .NET 10 SDK. `global.json` allows later .NET 10 feature bands.
- .NET Framework 4.8 runtime to execute the `net462` unit tests.
- PowerShell 7 for verified package creation.
- Access to the configured NuGet feeds.
- Azure CLI for Dataverse registration or integration tests.

Confirm the SDK selected by `global.json`:

```powershell
dotnet --version
```

## Install Dependencies

From the project directory:

```powershell
dotnet restore business-process-api.sln --locked-mode
```

Package versions are pinned in the project files and lock files. When intentionally
changing a package version, regenerate and review the affected lock file before
committing it.

## Develop

Open `business-process-api.sln`. Production code is organized by responsibility:

- `Api`: one stateless plug-in entry point per Custom Action.
- `Services`: validation, authorization, and business behavior.
- `Repositories`: Dataverse queries and persistence.
- `Infrastructure`: execution and continuation-token support.
- `spec`: Dataverse Custom API provisioning contracts.

For a new Action, add its entry point, service/repository behavior, Custom API JSON,
unit tests, and API contract documentation together. Keep invocation state in local
variables because Dataverse caches plug-in instances.

Each JSON file in `spec` has the same name as its Custom API `uniquename`. The
repository-only `pluginTypeName` property identifies the fully qualified plug-in type
to bind. The registration script removes that property before sending the definition
to Dataverse. These specifications are provisioning and contract-test inputs; they
are not embedded in the production assembly or NuGet package.

Build during development with:

```powershell
dotnet build business-process-api.sln --configuration Debug --no-restore
```

## Test

Run the offline unit tests:

```powershell
dotnet test tests/BusinessProcessApi.Tests/BusinessProcessApi.Tests.csproj --configuration Release --no-restore
```

Run all repository tests with integration tests safely skipped by default:

```powershell
dotnet test business-process-api.sln --configuration Release --no-restore
```

The integration project contains read-only tests against an already installed API.
Use only an approved non-production environment and authenticate Azure CLI manually:

```powershell
az login --tenant '<tenant-id>'
$env:DATAVERSE_URL = 'https://<environment>.crm.dynamics.com/'
$env:DATAVERSE_EXPECTED_ORGANIZATION_ID = '<organization-guid>'
$env:DATAVERSE_INTEGRATION_TESTS = '1'
try {
    dotnet test tests/BusinessProcessApi.IntegrationTests/BusinessProcessApi.IntegrationTests.csproj `
        --configuration Release --no-restore --filter 'Category=Integration'
}
finally {
    Remove-Item Env:DATAVERSE_INTEGRATION_TESTS -ErrorAction SilentlyContinue
}
```

The expected organization ID is the Dataverse organization GUID, not the Power
Platform environment GUID. Integration-test logs can contain business data.

## Build and Package

Use the release sequence from a clean checkout:

```powershell
dotnet restore business-process-api.sln --locked-mode
dotnet build business-process-api.sln --configuration Release --no-restore
dotnet test business-process-api.sln --configuration Release --no-restore
pwsh -NoProfile -File scripts/build-package.ps1
```

The packaging script packs into a fresh staging directory and verifies that
`lib/net462/business-process-api.dll` inside the NuGet package has the same SHA-256
hash as the Release DLL. The verified package is written to `artifacts/package`.
Register the NuGet package, not a standalone DLL.

## Install in Dataverse

Use `scripts/register-business-process-api.ps1` for both first registration and
updates. The script derives package identity from the NuGet package, discovers the
target solution's publisher prefix, and uses the supplied specifications to bind
Custom APIs to plug-in types. It is a dry run unless `-Apply` is supplied.

The target must have an existing unmanaged solution. Its publisher prefix must match
the prefix used by every supplied Custom API unique name. Install the Business
Process Tracking tables and global choices before registering this API.

### Register or update the plug-in

1. Build and verify the package:

    ```powershell
    dotnet restore business-process-api.sln --locked-mode
    dotnet build business-process-api.sln --configuration Release --no-restore
    dotnet test business-process-api.sln --configuration Release --no-restore
    pwsh -NoProfile -File scripts/build-package.ps1
    ```

2. Authenticate Azure CLI interactively to the tenant that owns the Dataverse
    environment:

    ```powershell
    az login --tenant '<tenant-id>'
    az account show
    ```

3. Find the Dataverse organization ID. In the Power Platform admin center, open the
    environment and copy **Environment details > Organization ID**. This is not the
    Power Platform environment ID.

4. Run a preflight without `-Apply`. `-SpecPath` is required and can contain one or
    more directories, JSON files, or wildcard paths:

    ```powershell
    pwsh -NoProfile -File scripts/register-business-process-api.ps1 `
         -EnvironmentUrl 'https://<environment>.crm.dynamics.com/' `
         -SolutionUniqueName '<unmanaged-solution-unique-name>' `
         -ExpectedOrganizationId '<organization-guid>' `
         -SpecPath '.\spec'
    ```

    The preflight verifies the exact organization, unmanaged solution, publisher
    prefix, package identity, plug-in types, existing Custom API contracts, bindings,
    and solution membership. It reports whether the next operation is `register` or
    `update` and makes no changes.

5. Review the preflight output. If the target and operation are correct, repeat the
    command with `-Apply`:

    ```powershell
    pwsh -NoProfile -File scripts/register-business-process-api.ps1 `
         -EnvironmentUrl 'https://<environment>.crm.dynamics.com/' `
         -SolutionUniqueName '<unmanaged-solution-unique-name>' `
         -ExpectedOrganizationId '<organization-guid>' `
         -SpecPath '.\spec' `
         -Apply
    ```

    On first registration, the script creates the package in the selected solution,
    waits for the generated assembly and plug-in types, creates the supplied Custom
    APIs, and verifies their bindings. On update, it replaces the existing package
    content while preserving package, assembly, plug-in type, and Custom API
    identities. In either case, it creates only missing Custom APIs and validates all
    existing ones. It never creates a solution or data model.

6. Run the read-only integration tests using the environment variables in the Test
    section before enabling consumers.

By default, the script requires exactly one package under `artifacts/package`. To use
a package elsewhere, provide its path explicitly:

```powershell
pwsh -NoProfile -File scripts/register-business-process-api.ps1 `
     -EnvironmentUrl 'https://<environment>.crm.dynamics.com/' `
     -SolutionUniqueName '<unmanaged-solution-unique-name>' `
     -ExpectedOrganizationId '<organization-guid>' `
     -SpecPath '.\spec\faf001_Get*.json' `
     -PackagePath '.\artifacts\package\business-process-api.<version>.nupkg'
```

If an existing Custom API contract or plug-in binding differs from its specification,
the script stops instead of modifying the registration. Review and resolve that drift
before retrying. If an `-Apply` run is interrupted, inspect the target solution before
retrying. Do not embed environment URLs, credentials, access tokens, package IDs, or
solution IDs in this source repository.