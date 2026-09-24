## Prerequisites

### Power Platform CLI (PAC)

1. Check PAC in the terminal used for deployment:

```pwsh
Get-Command pac
```

2. If missing, install the Windows MSI using the [PAC installation instructions](https://learn.microsoft.com/en-us/power-platform/developer/howto/install-cli-msi).
3. Open a new terminal and confirm PAC displays its version and available commands:

```pwsh
pac
```

### Python and uv

1. Install Python 3.11 if no Python 3.11-or-newer interpreter is installed:

```pwsh
winget install --exact --id Python.Python.3.11
```

2. Open a new terminal and require Python 3.11 or newer:

```pwsh
python --version
```

3. Install `uv` if missing:

```pwsh
winget install --exact --id astral-sh.uv
```

4. Open a new terminal and check `uv` and its selected interpreter; require Python 3.11 or newer:

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

3. Confirm the tenant and account match the approved deployment operator.

