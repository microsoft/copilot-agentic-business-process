# AGENTS.md

Guidance for coding agents working in this repository. Read this file first, then the
nested `AGENTS.md` closest to the files you are changing — it takes precedence for its
folder.

> **VS Code users:** nested `AGENTS.md` files are only loaded when
> `chat.useNestedAgentsMdFiles` is enabled in settings. Without it, open the nested file
> listed in the [repository map](#repository-map) yourself before working in that folder.

## What this repository is

A reusable runtime for long-running, auditable, agentic business processes on Power
Platform and Copilot Studio (GitHub Copilot harness), plus reference implementations
built on it.

- **`BusinessProcessCore`** (`core/`) owns **state, identity, and experience**: the
  Dataverse process-tracking tables, the Business Process API (Custom Actions), the
  Workflow Console code app, and the monitoring agent. It knows nothing about any
  business domain.
- **A business process** (`business-processes/<name>/`) owns **its own logic**: Copilot
  Studio workflows, agents with skills and knowledge files, security roles, environment
  variables, and the review widgets its human tasks need.

The only contract between them: **a workflow writes a `faf001_bpstep` row, and the
creation or completion of that row triggers the next workflow.** No workflow calls
another, no workflow holds state, and no workflow needs to know who will act on a task.

## Repository map

| Path | What it holds | Read next |
| --- | --- | --- |
| `core/` | Core runtime: data model spec, plug-in, console, solution export | [core/AGENTS.md](core/AGENTS.md) |
| `core/spec/` | Data model specification — source of truth for tables, columns, choices | [core/AGENTS.md](core/AGENTS.md) |
| `core/plugins/business-process-api/` | C# Dataverse plug-in exposing the `faf001_*` Custom APIs | [its AGENTS.md](core/plugins/business-process-api/AGENTS.md) |
| `core/codeapps/workflow-console/` | Power Apps code app (React/TS/Vite): task queue, review widgets, timelines | [its AGENTS.md](core/codeapps/workflow-console/AGENTS.md) |
| `core/solution/` | `BusinessProcessCore` unpacked export, built zip, config, deployment guide | [core/AGENTS.md](core/AGENTS.md) |
| `business-processes/` | One folder per business process solution | [business-processes/AGENTS.md](business-processes/AGENTS.md) |
| `business-processes/order-processing/` | The reference implementation to copy | [its AGENTS.md](business-processes/order-processing/AGENTS.md) |
| `.github/skills/` | GitHub Copilot deployment skills (`deploy-business-process-core`, `deploy-order-processing`) | [Deployment skills](#deployment-skills) |
| `scripts/` | Shared, idempotent deployment helpers (Python via `uv`, PowerShell 7) used by the skills and guides | [Shared scripts](#shared-scripts) |
| `docs/` | README images and architecture diagram sources (`.drawio`) | — |

## Golden rules

1. **Publisher prefix is `faf001`; option values start at `324010000`.** Every new schema
   name, environment variable, agent, and Custom API uses it.
2. **Do not change the core to accommodate a single process.** If something genuinely
   belongs in the core, stop and propose it to the user (and as an issue) first.
3. **Never commit secrets or environment-bound values** — credentials, org URLs,
   connection IDs, role GUIDs, tenant IDs. Credentials go in the ignored `.secrets/`
   folder; per-environment values go in the ignored `**/deployment-settings.*.json`.
   Resolve roles and environment variables **by name at runtime**. Environment values
   already captured inside a solution export (for example
   `environmentvariablevalues.json`) are the one tolerated exception — leave them as
   exported.
4. **Do not hand-edit generated code**: `core/codeapps/workflow-console/src/generated/`,
   `.power/`, or opaque solution blobs (see [what not to edit](#safe-and-unsafe-edits-in-export)).
5. **An unpacked change alone never reaches an environment.** Both deployment guides
   import the committed `build/*.zip`, so every change under `export/` must be repacked.
6. **Single business unit assumption** — roles are resolved by name.
7. **Least privilege.** Never widen the runtime identity's role or grant System
   Administrator to fix a runtime failure; find the missing privilege.
8. **Keep docs in step with behavior**: the data model spec, API README, process README,
   `DEPLOYMENT.md` guides, and the `.github/skills/` copies of them.

## Changing Power Platform solutions

Solutions live as unpacked exports (`<solution>/export/`, `pac solution unpack` layout)
plus a committed unmanaged zip (`<solution>/build/<Name>_<major>_<minor>_<build>_<rev>_unmanaged.zip`).

**Before changing any solution component, ask the user which approach to use**, and
recommend Option A:

| | Option A — local authoring + pack + import (**recommended**) | Option B — targeted Dataverse Web API scripts |
| --- | --- | --- |
| How | Edit files under `export/`, `pac solution pack` into `build/`, `pac solution import` into a dev environment, verify | Write small idempotent scripts that create/update tables, workflows, bots, bot components, etc. directly via the Dataverse Web API |
| Pros | Repo is always the source of truth; reviewable diff; same artifact the guides deploy | Faster inner loop for iterative changes |
| Cons | Slower round-trip | **Creates drift** between environment and `export/`. Must finish with export → unpack → repack (below) before the work is done |

Option A commands (run from repo root; adjust names and version):

```powershell
# 1. Bump <Version> in export/Other/Solution.xml when the change ships
# 2. Pack
pac solution pack --zipfile <solution>/build/<Name>_<ver>_unmanaged.zip --folder <solution>/export --packagetype Unmanaged
# 3. Import into a dev environment (settings file is ignored by git)
pac solution import --path <solution>/build/<Name>_<ver>_unmanaged.zip --settings-file <solution>/config/deployment-settings.<env>.json --publish-changes
```

Option B close-out (mandatory) — sync the environment back into the repo:

```powershell
pac solution export --name <Name> --path <temp>.zip --managed false
pac solution unpack --zipfile <temp>.zip --folder <solution>/export --packagetype Unmanaged --allowWrite true --allowDelete true
pac solution pack   --zipfile <solution>/build/<Name>_<ver>_unmanaged.zip --folder <solution>/export --packagetype Unmanaged
```

Keep exactly one zip per solution in `build/`; when the version changes, delete the old
zip and update every reference to the file name (deployment guides, skills, READMEs).
Import order is always **BusinessProcessCore first**, then each process.

### Safe and unsafe edits in `export/`

| Safe to author locally | Do not hand-edit |
| --- | --- |
| `Workflows/<name>-<GUID>.json` (flow definition) and its `.json.data.xml` (name, description) | `bots/*/bot.xml` (identity, template `cliagent-1.0.0` = GitHub Copilot harness, icon) |
| `bots/*/configuration.json` — only `agentSettings.instructions` text and `agentSettings.model` | `bots/*/configuration.json` structure, recognizer, and any other settings |
| `botcomponents/*/filedata/*` — skill `SKILL.md` and knowledge files (JSON, schemas) | `botcomponents/*.skill.*/data` (skill bundle pointer) and any opaque `data` blob |
| `botcomponents/*/botcomponent.xml` `description` / `name` text | `pluginpackages/**/*.nupkg` (produce it from the plug-in build) |
| `Roles/*.xml`, `environmentvariabledefinitions/*` | `CanvasApps/*` except as described in the [console AGENTS.md](core/codeapps/workflow-console/AGENTS.md) |
| `Other/Solution.xml` `<Version>` and `<RootComponents>` for components you add | `Other/Customizations.xml` beyond adding a connection reference that mirrors an existing one |

New components need fresh GUIDs, file names that follow the existing pattern
(`Workflows/<kebab-name>-<UPPERCASE-GUID>.json`), and a `RootComponent` entry mirroring
the existing ones of the same type. When unsure about a component format, prefer
creating it in the environment and syncing back with the Option B close-out.

## Validation by area

Run the smallest set that covers what you touched.

| Area | Command (from the area folder unless stated) |
| --- | --- |
| Business Process API | `dotnet restore business-process-api.sln --locked-mode`, `dotnet build ... --configuration Release --no-restore`, `dotnet test business-process-api.sln --configuration Release --no-restore` |
| Workflow Console | `npm ci`, `npm test`, `npm run lint`, `npm run build` |
| Deployment skills and guides | From repo root: `pwsh -NoProfile -File .github/skills/deploy-business-process-core/scripts/test_deployment_readiness.ps1` (offline) |
| Solution exports | `pac solution pack` succeeds; import into a dev environment when one is available; for flows, validate JSON parses and trigger filters match the step contract |
| Data model | `core/spec/business-process-data-model-spec.md` updated alongside any schema change |

Never run anything that writes to a Dataverse environment, Entra ID, or Exchange without
the user's explicit confirmation of the target environment.

## Deployment skills

`.github/skills/deploy-business-process-core/` and `.github/skills/deploy-order-processing/`
each contain `SKILL.md`, `references/` (copies of the deployment guide, prerequisites,
roles and licensing, readiness report) and `scripts/` (readiness checks).

- The `references/DEPLOYMENT.md` copies must stay consistent with
  `core/solution/DEPLOYMENT.md` and `business-processes/*/solution/DEPLOYMENT.md`.
- Skills resolve their own folder at runtime (`$skillFolder`); never hardcode paths.
- A new business process gets its own `deploy-<process>` skill modelled on
  `deploy-order-processing` — see [business-processes/AGENTS.md](business-processes/AGENTS.md).

## Shared scripts

`scripts/` holds process-agnostic, idempotent helpers: Dataverse roles, seeding,
solution users, connections, agent connections, Entra user creation and licensing.
Python scripts declare inline dependencies (`# /// script`) and run with `uv run`;
PowerShell scripts require PowerShell 7. Generated output and per-environment config
(`scripts/config/deploy.*.json` other than the sample) are git-ignored. Keep these
scripts generic — process-specific logic belongs in the process's `solution/scripts/`.

## Pull requests

Follow [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) and
[CONTRIBUTING.md](CONTRIBUTING.md): agreed issue for non-trivial work, no environment
values, tests for every area touched, `export/` **and** `build/` updated together,
deployment guides and skill copies consistent.
