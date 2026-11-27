## Prerequisites

### Power Platform CLI (PAC) 2.12.1 or newer

PAC 2.12.1 adds `pac admin create --macro-region` and `pac environment-management` (used to enable Code Apps). The readiness report fails on older versions.

1. Check PAC and its version in the terminal used for deployment:

```pwsh
Get-Command pac
pac
```

2. If missing, install the Windows MSI using the [PAC installation instructions](https://learn.microsoft.com/en-us/power-platform/developer/howto/install-cli-msi), or the .NET tool:

```pwsh
dotnet tool install --global Microsoft.PowerApps.CLI.Tool
```

3. If the banner shows a version older than 2.12.1, update the installation it came from (the MSI, or `dotnet tool update --global Microsoft.PowerApps.CLI.Tool`), open a new terminal, and confirm the version again.

### PowerShell 7

All helpers require PowerShell 7 (`pwsh`). Install it with `winget install --exact --id Microsoft.PowerShell` if missing.

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

3. Confirm the tenant and account match the approved deployment operator.

