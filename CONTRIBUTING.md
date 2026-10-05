# Contributing

This project welcomes contributions and suggestions.

## Contributor License Agreement

Most contributions require you to agree to a Contributor License Agreement (CLA)
declaring that you have the right to, and actually do, grant us the rights to use your
contribution. For details, visit [https://cla.opensource.microsoft.com](https://cla.opensource.microsoft.com).

When you submit a pull request, a CLA bot will automatically determine whether you need
to provide a CLA and decorate the pull request appropriately (for example, with a status
check or comment). Simply follow the instructions provided by the bot. You only need to
do this once across all repositories using our CLA.

## Code of Conduct

This project has adopted the
[Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the
[Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact
[opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or
comments.

## Before you open a pull request

Open an issue first for anything beyond a small fix, so the approach can be agreed before
you invest time in it. Keep pull requests focused on a single change.

## Working in this repository

The repository contains several independent components. Follow the guidance for the ones
you touch.

| Area | Where | What to run |
| --- | --- | --- |
| Dataverse data model | `core/spec/` | Update the specification alongside any schema change; it is the source of truth for the tables, choices, and relationships |
| Business Process API | `core/plugins/business-process-api/` | See [DEVELOPMENT.md](core/plugins/business-process-api/DEVELOPMENT.md) — restore, build, and run the unit tests before submitting |
| Workflow Console | `core/codeapps/workflow-console/` | See its [README](core/codeapps/workflow-console/README.md) — `npm ci`, then `npm test`, `npm run lint`, and `npm run build` |
| Solutions, agents, and workflows | `core/solution/`, `business-processes/*/solution/` | Change components in the existing `export/` layout. Preferred: author them locally, `pac solution pack` into `build/`, and re-import into a development environment to verify. Alternatively, change them in an environment (maker portal or targeted Dataverse Web API scripts), then `pac solution export` and `pac solution unpack` back into `export/` so the repository does not drift. Either way, repack the `build/` zip — both deployment guides import the committed package, so an unpacked change alone never reaches a target environment. Do not hand-edit opaque or generated component files (skill `data` bundles, plug-in packages, code app bundles); see [AGENTS.md](AGENTS.md#changing-power-platform-solutions) |
| Deployment guidance | `core/solution/DEPLOYMENT.md`, `business-processes/*/solution/DEPLOYMENT.md`, `.github/skills/` | Keep the deployment skills and the guides they reference consistent with each other, and run `pwsh -NoProfile -File .github/skills/deploy-business-process-core/scripts/test_deployment_readiness.ps1` — 22 offline scenarios, no cloud calls |

## Things that must not be committed

- Credentials, client secrets, or connection strings. Generated credential output belongs
  in the ignored `.secrets/` folder and never in source, documentation, or terminal output
  pasted into an issue.
- Environment-bound values — organization URLs, connection IDs, security role GUIDs —
  anywhere outside the per-environment deployment settings files, which are excluded from
  source control. Resolve roles and environment variables by name at runtime.
- `power.config.json` from the Workflow Console, which carries local app identity and
  connection bindings. The versioned template is `power.config.template.json`.

Environment and app IDs captured inside a solution export are the one exception. A
`pac solution export` records the source environment's value for every environment
variable, so files such as
`core/solution/export/environmentvariabledefinitions/*/environmentvariablevalues.json`
carry the play URL of whichever environment the export came from. These are identifiers,
not secrets, they grant nobody access, and the deployment settings file overrides them on
import. Leave them as exported rather than hand-editing generated component files — but do
not introduce an environment or app ID anywhere else.

## Adding a new business process

Add it under `business-processes/<your-process>/` following the structure of
[Order Processing](business-processes/order-processing/README.md): its own solution with
workflows, agents, security roles, and environment variables, plus any review widgets it
needs in the Workflow Console. Do not change the core to accommodate a single process — if
something genuinely belongs in the core, raise it as an issue first.

## Trademarks

This project may contain trademarks or logos for projects, products, or services.
Authorized use of Microsoft trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause
confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos is
subject to those third parties' policies.
