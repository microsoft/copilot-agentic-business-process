# AGENTS.md — Workflow Console (Power Apps code app)

React 19 + TypeScript + Vite + Tailwind CSS 4 + TanStack Query, hosted as a Power Apps
code app. It gives users their task queue, the review widget for each task, and the
timeline, attachments, artifacts, and outputs of every process instance. Full developer
guide: [README.md](README.md).

The console is **part of the core** and shared by every business process. The usual
reason a process touches it is to **add a review widget**.

## Commands (run from this folder, Node 22.12+)

```powershell
npm ci
npm test        # node --experimental-strip-types --test tests/*.test.mjs
npm run lint    # eslint
npm run build   # tsc -b && vite build -> dist/
pwsh -NoProfile -File tests/link-existing-app.test.ps1   # offline, only if scripts/ changed
```

`npm test` reads `../../plugins/business-process-api/spec/` — keep the sibling plug-in
folder in place. Visual fixtures: `npm run dev`, then `/tests/task-workflow.html` or
`/tests/process-detail.html` (fixtures only; not a substitute for the Power Apps host).

## Layout

| Path | Contents |
| --- | --- |
| `src/features/tasks/` | Task queue, task detail, claim/start/complete (`task-api.ts`, `submitTaskOutcome.ts`), attachments |
| `src/features/tasks/widgets/` | `registry.ts` (widget contract + map), generic widgets, `<process>/` widget folders |
| `src/features/instances/` | Process list/detail, step timeline, outputs, files (`process-api.ts`, contracts, models) |
| `src/lib/bp/` | Choice constants (`choices.ts` — mirrors core option sets) and domain helpers |
| `src/lib/dataverse/` | Connector client and OData helpers |
| `src/components/ui/` | shadcn-style primitives (Radix + Tailwind) — reuse before adding new ones |
| `src/generated/`, `.power/` | **Generated** by the Power Apps CLI — never hand-edit |
| `tests/` | Node test runner `*.test.mjs`, HTML fixtures, PowerShell tests |

## Adding a review widget for a business process

The flow that raises the task decides the widget: it writes `faf001_widgetid` and the
JSON `faf001_inputdata`. The console maps the ID to a component in
[registry.ts](src/features/tasks/widgets/registry.ts); unknown IDs fall back to
`RawJsonWidget` instead of crashing.

1. **Reuse first.** If reviewers only need to read structured JSON and approve/reject
   with notes, register your ID against the schema-agnostic `DataReviewWidget` — no new
   component (that is how `order-evaluation-review-ui` works).
2. **Otherwise create** `src/features/tasks/widgets/<process>/<Name>Widget.tsx` (one
   folder per business process, kebab-case process name) exporting a component typed
   `BpWidget` / `(props: BpWidgetProps) => JSX.Element`.
3. **Register** it in `registry.ts` under an ID ending in `-ui`, unique across all
   processes and prefixed with the domain, e.g. `'claim-damage-review-ui'`.
4. **Test** pure logic (input parsing, validation, building `values`) in a sibling `.ts`
   module that uses **relative imports with `.ts` extensions** (Node strip-types cannot
   resolve `@/` aliases or TSX), and cover it with `tests/<process>-<widget>.test.mjs`.
5. Run `npm test`, `npm run lint`, `npm run build`.

Existing `ExtractedOrderReviewWidget.tsx` and `src/lib/bp/order.ts` predate the
per-process folder convention and stay where they are; do not copy that placement.

### Widget contract (`BpWidgetProps`)

| Prop | Meaning |
| --- | --- |
| `task` | The task row (`faf001_taskname`, `faf001_widgetid`, status, …) |
| `inputData` / `rawInputData` / `parseError` | Parsed `faf001_inputdata`; on parse failure render `<RawJsonWidget {...props} />` |
| `readOnly` | The task is closed — render the result without submit controls |
| `submitting` | A submission is in flight — disable actions |
| `onSubmit(submission)` | Returns a promise that **rejects on failure**; keep the user's edits on screen when it does |

`BpWidgetSubmission` = `{ outcome, notes?, values? }`:

- `outcome` from `TASK_OUTCOME` in `src/lib/bp/choices.ts` (Approved / Rejected /
  Needs More Info).
- `values[]` items are `{ key, type: 'text'|'json'|'number'|'boolean'|'datetime', value }`;
  max 100, keys unique, `decision` and `notes` reserved.
- The server stores each as `faf001_bpdatavalue` key `<widget-id-without--ui>.<key>`,
  plus `<prefix>.decision` and `<prefix>.notes`. **The downstream flow reads exactly
  these keys** — document them in the process README and keep widget and flow in sync.

UI conventions: Tailwind utility classes and `src/components/ui/*` primitives,
`lucide-react` icons, server state through TanStack Query hooks (no ad-hoc fetch in
components), path alias `@/` inside `src/`.

## Data access

- Tables and Custom APIs are reached through generated services in `src/generated/`.
  To add or refresh one, use the project-local CLI — **`npx --no-install pa`**, not
  `pac`: `pa app add data-source …` / `pa app add dataverse-api --api-name faf001_<Name>`
  (see README "Register Data Sources"), then review and commit the generated diff.
- Keep Custom API request/response shapes in `*-api-contracts.ts` aligned with
  `core/plugins/business-process-api/spec/` — tests enforce this.
- `power.config.json` holds local app/environment/connection IDs and is git-ignored;
  the versioned template is `power.config.template.json`. Link an existing app with
  `scripts/link-existing-app.ps1`.

## Shipping a console change

A widget is code in the **core** console, so it ships with the core solution:

1. `npm run build`.
2. Update the packaged app in
   `core/solution/export/CanvasApps/cr522_workflowconsole_75f6c_CodeAppPackages/` with
   the contents of `dist/`, and update the `<CodeAppPackageUris>` entries (hashed asset
   names) and `<AppVersion>` in `cr522_workflowconsole_75f6c.meta.xml` to match. Do not
   rename the `cr522_…` app.
   *Alternative:* `npx --no-install pa app push --solution-id <core solution id>` to a
   dev environment, then sync the core solution back (root AGENTS.md, Option B close-out).
3. Bump and repack `BusinessProcessCore` per the root
   [AGENTS.md](../../../AGENTS.md#changing-power-platform-solutions).

`pa app push` replaces the live app immediately with no rollback — only run it with the
user's confirmation of the target environment and `appId`.
