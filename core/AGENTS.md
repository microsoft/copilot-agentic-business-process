# AGENTS.md — BusinessProcessCore

Read this before building or changing a business process. It catalogs what the core gives
you and the contracts a process must honor. The authoritative sources are
[spec/business-process-data-model-spec.md](spec/business-process-data-model-spec.md) and
the [Business Process API contract](plugins/business-process-api/README.md); if this file
disagrees with them, they win — and fix this file.

## Contents of `core/`

| Path | What it is | Nested guidance |
| --- | --- | --- |
| `spec/` | Data model spec: tables, columns, choices, relationships, role conventions | this file |
| `plugins/business-process-api/` | Dataverse plug-in exposing `faf001_*` Custom Actions | [AGENTS.md](plugins/business-process-api/AGENTS.md) |
| `codeapps/workflow-console/` | Workflow Console code app (task queue, widgets, timelines) | [AGENTS.md](codeapps/workflow-console/AGENTS.md) |
| `solution/export/` | Unpacked `BusinessProcessCore`: `Entities/`, `OptionSets/`, `customapis/`, `pluginpackages/`, `CanvasApps/` (console), `bots/` + `botcomponents/` (monitoring agent), `environmentvariabledefinitions/` | root [AGENTS.md](../AGENTS.md#changing-power-platform-solutions) |
| `solution/build/` | `BusinessProcessCore_<ver>_unmanaged.zip` — what deployments import | |
| `solution/config/` | `security-role.business-process-user.json` (runtime identity role); ignored `deployment-settings.*.json` | |
| `solution/DEPLOYMENT.md` | Install procedure; mirrored in `.github/skills/deploy-business-process-core/references/` | |

The core ships **no workflows**. Every workflow, notification, and task-raising action
lives in the business process solutions.

## Capability catalog (what a process gets for free)

### Process tracking tables

| Table | Use it for | Key columns |
| --- | --- | --- |
| `faf001_bpinstance` | One run of a process (root, parental cascade) | `faf001_processname`, `faf001_businesskey` (descriptive, **not** unique), `faf001_status`, `faf001_statusmessage`, `faf001_lastupdated`, `faf001_lastcompletedstepid`, `faf001_channel`, `faf001_initiatorexternal` |
| `faf001_bpstep` | Each stage executed; **its rows are the trigger mechanism** | `faf001_stepname`, `faf001_steptype`, `faf001_status`, `faf001_bpinstanceid`, start/end time, error code/message |
| `faf001_bptask` | A human task | `faf001_taskname`, `faf001_tasktype`, `faf001_status`, `faf001_requiredrole` (lookup → `role`), `faf001_widgetid`, `faf001_inputdata` (JSON, ≤100k), `faf001_bpstepid`, `faf001_outcome` |
| `faf001_bpattachment` | Files coming **into** the process | `faf001_file` or `faf001_externalurl`, `faf001_source`, `faf001_storagetype`; instance lookup optional so intake can create it first |
| `faf001_bpartifact` | Files **produced** by the process | `faf001_file`, `faf001_artifacttype`, `faf001_version`, `faf001_supersedesid` |
| `faf001_bpdatavalue` | Typed key/value data: globals, step outputs, task outputs, agent results | `faf001_datakey`, `faf001_datatype`, one of `faf001_value{text,number,boolean,datetime,json}`; alternate key `faf001_bpdatavalue_key` = (instance, datakey) → upsert without pre-read |

Rules from the spec that every process flow must follow:

- After **every** `faf001_bpstep` write, update the instance's `faf001_status`,
  `faf001_statusmessage`, and `faf001_lastupdated` (step first, then instance).
- Error columns are for failures only; `faf001_statusmessage` explains the *why*.
- Payloads go in `faf001_bpdatavalue`, never on the instance or step.
- Populate exactly one value column, matching `faf001_datatype`.
- Data keys share one namespace per instance: `globalKey`, `<step>.<field>`,
  `<widget-prefix>.<field>`.

### Choice values used by flows

| Choice | Values |
| --- | --- |
| `faf001_bpinstancestatus` | 324010000 Not Started · 324010001 Running · 324010002 Waiting · 324010003 Suspended · 324010004 Completed · 324010005 Failed · 324010006 Cancelled · 324010007 Compensating |
| `faf001_bpstepstatus` | 324010000 Not Started · 324010001 Running · 324010002 Waiting · **324010003 Completed** · 324010004 Failed · 324010005 Skipped · 324010006 Cancelled |
| `faf001_bpsteptype` | 324010000 Automated · **324010001 Human Task** · 324010002 Decision · 324010003 Integration · 324010004 Notification · 324010005 Sub-Process · 324010006 AI / Agent |
| `faf001_bptaskstatus` | 324010000 Not Started · 324010001 Assigned · 324010002 In Progress · 324010003 Waiting · 324010004 Completed · 324010005 Cancelled · 324010006 Expired |
| `faf001_bptasktype` | 324010000 Approval · 324010001 Data Review · 324010002 Data Entry · 324010003 Custom |
| `faf001_bptaskoutcome` | 324010000 Approved · 324010001 Rejected · 324010002 Needs More Info · 324010003 Escalated · 324010004 Completed · 324010005 No Response |
| `faf001_bpdatatype` | 324010000 Text · 324010001 Number · 324010002 Boolean · 324010003 DateTime · 324010004 JSON · 324010005 Reference (`entity:guid` in text) · 324010006 Markdown (in text) |
| `faf001_bpartifacttype` | 324010000 Generated Document · 324010001 Report · 324010002 Extracted Data · 324010003 AI Output · 324010004 Log · 324010005 Export · 324010006 Other |

Full list (14 choices) in `solution/export/OptionSets/` and the spec.

### The step trigger contract

A process stage is a Copilot Studio workflow with a Dataverse trigger on `faf001_bpstep`
(scope Organization = 4). Two shapes are used:

| Next stage starts when… | Trigger message | Filter expression (example) |
| --- | --- | --- |
| An automated step row is **created** | 1 (Added) | `faf001_stepname eq 'Order Extraction Step' and faf001_status eq 324010000` |
| A human-task step is **completed** | 3 (Modified), `filteringattributes: faf001_status` | `faf001_stepname eq 'Extracted Order Data Review' and faf001_steptype eq 324010001 and faf001_status eq 324010003` |

Step names are therefore **API**: never rename one without updating every trigger that
filters on it. Make step names unique across all processes in the environment (prefix
with the process domain).

### The human task contract

1. The raising flow creates a `faf001_bpstep` with `faf001_steptype = 324010001`
   (Human Task) and `faf001_status = 324010002` (Waiting).
2. It creates a `faf001_bptask` linked to the instance and that step, with
   `faf001_widgetid`, `faf001_inputdata` (JSON the widget renders), `faf001_tasktype`,
   `faf001_status = 324010003` (Waiting), and `faf001_requiredrole` bound to a role
   **looked up by name** (`roles?$filter=name eq '<Role>'`, bind `null` if not found).
3. It sets the instance to Waiting, then notifies eligible users (process-side pattern —
   see [business-processes/AGENTS.md](../business-processes/AGENTS.md)).
4. A user claims → starts → completes the task in the Workflow Console through
   `faf001_AssignTask` / `faf001_StartTask` / `faf001_CompleteTask`.
5. `faf001_CompleteTask` atomically writes outcome, notes, and widget outputs as
   `faf001_bpdatavalue` rows and sets the linked step to **Completed (324010003)** —
   which fires the next stage's trigger.

**Output keys.** The prefix is the widget ID with a trailing `-ui` removed (fallback:
normalized task name). The server always writes `<prefix>.decision`
(`approved` | `rejected` | `needs_info`) and `<prefix>.notes`; widget values become
`<prefix>.<key>`. Example: widget `extracted-order-review-ui` →
`extracted-order-review.decision`, `extracted-order-review.edited_order`. The next flow
reads them by `faf001_datakey` (order by `modifiedon desc`, top 1).

### Business Process API (Custom Actions)

Consumed by the console and the monitoring agent; flows normally use the Dataverse
connector on the tables directly. All are unbound, synchronous, run as the caller.

| Read | Write |
| --- | --- |
| `faf001_GetTasks`, `faf001_GetTasksPage`, `faf001_GetTask`, `faf001_GetProcesses`, `faf001_GetProcess`, `faf001_GetAttachments`, `faf001_GetArtifacts`, `faf001_GetOutputs` | `faf001_AssignTask`, `faf001_StartTask`, `faf001_CompleteTask` |

### Configuration, identity, and agent

- **`faf001_WorkflowConsoleBaseUrl`** — environment variable with the console launch URL.
  Read current value (fallback: default) from `environmentvariabledefinition` /
  `environmentvariablevalue`, then append `page=StartTaskDetail&taskId=<task id>` (use
  `&` or `?` depending on whether the URL already has a query string).
- **Dataverse connection reference** `faf001_sharedcommondataserviceforapps` is owned by
  the core; process solutions reuse it rather than defining their own.
- **Runtime security role** — defined in
  `solution/config/security-role.business-process-user.json`; least privilege, never
  widened for a single process.
- **Business Process Monitoring Agent** (`bots/faf001_businessprocessmonitoringagent`) —
  process-agnostic; a new process needs no changes to it.

## Extension points vs. frozen surface

| A process may… | A process must not… |
| --- | --- |
| Create rows in all six tables following the contracts above | Add columns, tables, or choices to the core for its own needs |
| Pick any step names, data keys, widget IDs, and roles of its own | Rename or renumber existing core schema names or choice values |
| Register new review widgets in the console ([guide](codeapps/workflow-console/AGENTS.md)) | Change the widget contract, submission schema, or output-key rule |
| Reuse the core Dataverse connection reference and console URL variable | Grant itself privileges through the core runtime role |

## Changing the core itself

Only when the change is genuinely process-agnostic and the user has agreed (issue
first). Changes ripple — update all affected places in the same change:

| You change… | Also update |
| --- | --- |
| A table, column, or choice | `spec/business-process-data-model-spec.md`; `solution/export/Entities/` / `OptionSets/`; console `src/generated/` (regenerate with `npx --no-install pa app add data-source`); `src/lib/bp/choices.ts`; plug-in repositories and the choice metadata fixtures in `tests/BusinessProcessApi.Tests/Fixtures/Metadata/`; monitoring agent tools if they read it |
| A Custom API | Plug-in, `spec/<uniquename>.json`, `solution/export/customapis/<uniquename>/`, API README, console contracts — see [plug-in AGENTS.md](plugins/business-process-api/AGENTS.md) |
| The console | `solution/export/CanvasApps/` package — see [console AGENTS.md](codeapps/workflow-console/AGENTS.md#shipping-a-console-change) |
| Anything under `solution/export/` | Bump `Other/Solution.xml` version, repack `solution/build/`, update the zip name in `solution/DEPLOYMENT.md` and `.github/skills/deploy-business-process-core/` |
| The runtime role | `solution/config/security-role.business-process-user.json`, `DEPLOYMENT.md`, the skill's `references/` and `scripts/check_installation.ps1` |

Choice values are append-only: add new values at the end of the `32401xxxx` sequence.
