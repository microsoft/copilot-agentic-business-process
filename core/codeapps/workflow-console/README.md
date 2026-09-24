# Workflow Console

Development, build, and deployment instructions for this Power Apps code app.
Run all commands from the directory containing `package.json`. Examples use
PowerShell; replace values in angle brackets before running them.

## Prerequisites

- Node.js 22.12 or later in the Node.js 22 release line, or a newer supported LTS
  release, with npm. This covers Vite's runtime requirements and the tests' use of
  Node.js TypeScript stripping.
- A Power Platform environment with Dataverse and code apps enabled.
- An account authorized to create or update code apps in that environment and
  access the required Dataverse data and Custom APIs.
- The backend Dataverse tables, choices, and Custom APIs expected by this app,
  already provisioned in the target environment. Deploying the frontend does not
  provision the backend.
- A Microsoft Dataverse connector connection in the target environment.

## Install Dependencies and the CLI

```powershell
npm ci
npx --no-install pa --version
npx --no-install pa --help
```

`npm ci` installs the versions recorded in `package-lock.json`, including the
project-local Power Apps CLI, `@microsoft/power-apps-cli`, pinned in `package.json`.
No global CLI installation is required. Include development dependencies: the CLI,
TypeScript, and Vite are needed to develop and build the app.

For a project that does not yet declare the CLI, install the version used here:

```powershell
npm install --save-dev --save-exact @microsoft/power-apps-cli@1.0.1
```

Use `npx --no-install pa` from the project directory. The `--no-install` flag
prevents npm from downloading an unrelated package named `pa`. This is the npm
Power Apps code-app CLI, not the separate Power Platform CLI (`pac`).

Commit both `package.json` and `package-lock.json` when intentionally changing
dependencies. Use `npm ci` for subsequent clean installations.

## Authenticate and Configure the App

### Link an Existing Deployment

Use this path when Workflow Console is already deployed. No `power.config.json`
is required. Install PowerShell 7 and Azure CLI, and run `npm ci` first. Sign in to
the same tenant and account in Azure CLI and the project-local Power Apps CLI:

```powershell
az login --allow-no-subscriptions
npx --no-install pa auth login
pwsh -NoProfile -File scripts/link-existing-app.ps1
```

The script lists accessible Dataverse-backed environments and asks where Workflow
Console is already deployed. Select the environment, then the existing app. It
matches the display name `Workflow Console` by default; use `-AppName "<name>"`
if the deployed display name differs. It never creates a remote app.

The versioned `power.config.template.json` supplies the shared database references
and connection reference logical names. The script verifies that each logical name
has a bound connection with the expected connector in the selected environment.
It reads the selected published app and matches references by connector and data
source names, preserving its app-local reference keys and any published
`sharedConnectionId` and `authenticationType` fields. Template reference keys are
placeholders, not connection IDs. Neither a Dataverse connection-reference row ID
nor its bound connection ID replaces the app-local key. Absent authentication
fields are not invented.

The script then asks before writing the ignored `power.config.json`.
Existing configuration is backed up to
an ignored `*.local` file before replacement. Keep the template in source control;
do not put deployment IDs or secrets into it.

Your account needs permission to list and read code apps and read Dataverse
connection references. Missing apps, missing or ambiguous published mappings,
missing or duplicate Dataverse references, unbound references, connector or
environment mismatches, and authentication failures stop without writing config.
The script currently targets the public commercial cloud. It does not check
whether every backend table/API is installed or whether the connection is healthy.

For discovery and selection without writing a file:

```powershell
pwsh -NoProfile -File scripts/link-existing-app.ps1 -WhatIf
```

This reuses the committed `.power/` metadata and `src/generated/` code unchanged.
Do not run `pa app init` or re-register sources after successful linking unless
you intentionally need a new configuration or schema refresh. Continue with
Develop Locally or Test and Build below; deployment is a separate explicit step.

### Manual or New-App Setup

Sign in using the browser opened by the CLI:

```powershell
npx --no-install pa auth login
npx --no-install pa auth status
```

Find the target environment ID in the Power Apps maker portal URL:
`https://make.powerapps.com/environments/<environment-id>/home`.

For a new app configuration:

```powershell
npx --no-install pa app init -n "<app-display-name>" -e "<environment-id>"
```

This creates `power.config.json`. It is ignored by Git because it contains local
app identity, environment selection, and connection bindings. Do not commit
credentials or tokens.

If continuing development of an existing deployed app, obtain its matching
configuration through your team's approved channel and preserve its `appId`.
Moving the source to another repository does not require a new app. Do not delete
an existing configuration or initialize a new identity just to change repositories.

Check these settings before running or deploying:

| Setting | Expected value |
| --- | --- |
| `environmentId` | Intended target environment |
| `appId` | Intended existing app when updating; assigned on first push for a new app |
| `buildPath` | `./dist` |
| `buildEntryPoint` | `index.html` |
| `localAppUrl` | `http://localhost:3000` |
| `connectionReferences` / `databaseReferences` | Bindings for the target environment |

The Vite development server uses port 3000 with `strictPort` enabled. If you change
the port, update both `vite.config.ts` and `localAppUrl` consistently.

## Register Data Sources

The repository includes `.power/` metadata and `src/generated/` models and services.
Keep both: the application imports them during the build. They do not replace the
local bindings in `power.config.json`.

When initializing a fresh configuration or targeting another environment,
register the required sources. When using a complete existing configuration,
refresh registrations only when the schema or bindings change. Review generated
changes before committing; do not hand-edit generated services.

Register the native Dataverse table sources with the target organization URL:

```powershell
$orgUrl = "https://<organization>.crm.dynamics.com"
$tables = @(
    'faf001_bpinstance',
    'faf001_bpstep',
    'faf001_bptask',
    'faf001_bpattachment',
    'faf001_bpartifact',
    'faf001_bpdatavalue',
    'systemuser',
    'team'
)
foreach ($table in $tables) {
    npx --no-install pa app add data-source --connector dataverse --table $table --org-url $orgUrl --non-interactive
    if ($LASTEXITCODE -ne 0) { throw "Registration failed for $table" }
}

npx --no-install pa app add dataverse-api --api-name WhoAmI
npx --no-install pa app add dataverse-api --api-name faf001_GetProcesses
```

The `faf001_` names are backend schema contracts, not environment identifiers.
The target backend must retain these names unless the application and its
generated bindings are also updated. Additional process and task Custom API
contracts are registered by the application at startup; those APIs must still
exist in Dataverse.

List connections, then register the Microsoft Dataverse connector using the
connection ID from the target environment:

```powershell
npx --no-install pa connection list
npx --no-install pa app add data-source --connector shared_commondataserviceforapps --connection-id "<connection-id>" --table faf001_bptask --dataset $orgUrl
```

For solution-based deployment, use the intended solution connection reference;
the registration command supports `--connection-ref "<logical-name>"` and
`--solution-id "<solution-id>"`. Verify the resulting bindings before deployment.
Do not reuse another environment's connection ID.

## Develop Locally

```powershell
npx --no-install pa app run
```

Open the Power Apps local play URL printed by the CLI. This starts the local
development experience with the host context required for authenticated SDK and
connector calls. Stop the process with Ctrl+C.

For isolated UI fixtures, run Vite directly:

```powershell
npm run dev
```

Open `http://localhost:3000/tests/task-workflow.html` or
`http://localhost:3000/tests/process-detail.html`. These pages use test fixtures.
Opening the app directly in Vite is not a substitute for testing authenticated
behavior through the Power Apps host.

## Test and Build

```powershell
npm test
npm run lint
npm run build
```

Resolve failures before deployment. The production build type-checks TypeScript
and writes the Vite bundle to `dist/`.

Run the linking script's offline tests separately (PowerShell 7). They mock CLI
responses and use temporary files, without signing in or accessing an environment:

```powershell
pwsh -NoProfile -File tests/link-existing-app.test.ps1
```

The process and task API contract tests read the backend JSON definitions from
`../../plugins/business-process-api/spec/` relative to the app root. Keep the
sibling backend's `spec/` directory available when running `npm test`. These
files are offline test inputs, not frontend build or runtime dependencies.

To inspect the production bundle locally:

```powershell
npm run preview
```

Use the URL printed by Vite. Preview serves static build output; it does not
provide the authenticated Power Apps runtime.

## Deploy

Verify the active account, target environment, app identity, and connection
bindings before pushing. A push updates the live app when `appId` is set.

After all checks pass, build and deploy to an explicit target solution:

```powershell
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed; deployment stopped" }
npx --no-install pa app push --solution-id "<solution-id>"
```

Alternatively, use `npx --no-install pa app push` without a solution ID. For a new
app, the CLI uses the account's preferred solution where available, with platform
fallbacks. Use an explicit solution ID when solution membership matters.

Keep the updated local `power.config.json` after the first successful push so
later pushes update the same app. Open the published URL returned by the CLI and
verify authentication, data access, and the intended workflows with an appropriate
test account. Configure app sharing and Dataverse security roles separately;
deployment alone does not grant users access.

### Push Live Changes to an Existing App

Use this path to publish frontend changes to an app that is already deployed. The
`appId` in `power.config.json` selects the app that is overwritten; confirm it and
`environmentId` point at the intended target before pushing. If `power.config.json`
is missing or targets the wrong environment, re-run `scripts/link-existing-app.ps1`
as described in Link an Existing Deployment.

```powershell
npx --no-install pa auth status
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed; deployment stopped" }
npx --no-install pa app push
```

`pa app push` uploads the contents of `dist/`, so a successful `npm run build` must
precede every push; otherwise the previous bundle is republished. The push replaces
the published version immediately for all users. There is no staging slot and no
rollback command: to revert, rebuild the previous source revision and push again.

The CLI prints the play URL on success. Reload it with a hard refresh and confirm
the changed behavior with a test account that holds the required security roles.

Push only when the change is confined to frontend code. Changes to registered data
sources, Custom API contracts, connection bindings, or Dataverse schema require the
corresponding backend deployment and a refresh of `.power/` and `src/generated/`
first; see Register Data Sources.

Common failures:

| Symptom | Action |
| --- | --- |
| Authentication or token error | `npx --no-install pa auth login`, then retry |
| App updated in the wrong environment | Correct `environmentId` and `appId` in `power.config.json`, then push again |
| Push succeeds but the app looks unchanged | Confirm `npm run build` ran, then hard-refresh the play URL |

For another environment, configure that environment's app identity and connection
bindings and ensure its backend is installed before deploying. Do not assume a
source-environment configuration is portable unchanged.

## Source Control

Keep source, public assets, tests, `.power/`, `src/generated/`, package manifests,
the lockfile, and build configuration in version control.

Exclude `node_modules/`, `dist/`, `dist-ssr/`, `power.config.json`, logs, compiler
caches, and local secrets. The app's `.gitignore` excludes `.env` and `.env.*`,
with an exception only for a sanitized `.env.example`.
Never put secrets in `VITE_*` variables: Vite exposes them to browser code.

## References

- [Power Apps code apps documentation](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/)
- CLI command reference: `npx --no-install pa --help`
- Command-specific help: `npx --no-install pa app push --help`