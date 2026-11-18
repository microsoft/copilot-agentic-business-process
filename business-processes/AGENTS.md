# AGENTS.md — Building a business process

Playbook for adding a new business process (claims, loans, onboarding, …) on top of
BusinessProcessCore. Read [core/AGENTS.md](../core/AGENTS.md) first for the tables, choice
values, step trigger contract, and human task contract. Use
[order-processing/](order-processing/AGENTS.md) as the template to copy — every recipe
below points at the order-processing component that implements it.

Ground rules: a process is **its own solution** layered on the installed core; it
contributes workflows, agents, review widgets, security roles, and environment variables,
and **does not modify the core** (except registering its widgets in the console). Ask the
user for the Option A/B solution authoring choice from the root
[AGENTS.md](../AGENTS.md#changing-power-platform-solutions) before creating components.

## Folder template

```text
business-processes/<process-name>/            kebab-case, e.g. car-insurance-claim
├── README.md                                  process design, stages, agents, contracts, demo limits, before you deploy
├── AGENTS.md                                  process-specific notes for coding agents (copy the order-processing one)
├── docs/                                      process-flow diagram, screenshots
└── solution/
    ├── export/                                unpacked solution (pac solution unpack layout)
    │   ├── Other/Solution.xml                 UniqueName, Version, publisher faf001, RootComponents
    │   ├── Other/Customizations.xml           connection references
    │   ├── Workflows/<flow>-<GUID>.json(.data.xml)
    │   ├── bots/faf001_<agent>/               bot.xml, configuration.json
    │   ├── botcomponents/faf001_<agent>.*     skills, SKILL.md + knowledge files (filedata/)
    │   ├── Roles/<Role>.xml
    │   └── environmentvariabledefinitions/faf001_<Var>/
    ├── build/<SolutionName>_<ver>_unmanaged.zip
    ├── config/                                deployment-settings.<env>.json (git-ignored)
    └── scripts/
        ├── activate-flows.ps1                 activates this process's workflows after import
        ├── test-<stage>.ps1                   one stage test per flow (see "Developing and testing a stage")
        └── test-data/                         fictional inputs and seeded upstream results
```

The step-by-step install guide is not in the process folder: it is
`.github/skills/deploy-<process>/references/DEPLOYMENT.md`.

Review widgets go in the **core console**:
`core/codeapps/workflow-console/src/features/tasks/widgets/<process-name>/` — see the
[console AGENTS.md](../core/codeapps/workflow-console/AGENTS.md#adding-a-review-widget-for-a-business-process).

## Design first — agree it with the user before building

Produce this design (in the process README) and confirm it before generating components:

1. **Stage map** — intake → automated/agent stages → human gates → finalization; what
   happens on reject / needs-more-info at each gate.
2. **Step names** — one per stage, unique across all processes in the environment
   (prefix with the domain: `Claim Damage Assessment`, not `Assessment`). They are API.
3. **Triggers** — for each workflow, the `faf001_bpstep` filter it listens on
   (created vs. human step completed — see core contract).
4. **Agents and skills** — which stages need reasoning; inline agent node vs. published
   agent; one skill per body of business rules; the knowledge files each skill reads;
   the JSON output schema each agent must return (written **once**, in the agent node; the agent's
   instructions and the message do not repeat it); **how many files each agent call carries**
   (one file with content per call when the call uses structured output; more means a fold, see the
   [agents pattern](../.github/skills/copilot-studio-workflow-ghcp-harness/references/agents/PATTERN.md)
   and the expected run time, about 90-110 s per call).
5. **Human tasks** — task name, task type, widget ID (`<domain>-<purpose>-ui`), the
   `faf001_inputdata` JSON shape, the security role (and optional notification team), and
   the output keys the widget writes.
6. **Data keys** — every `faf001_bpdatavalue` key written and read (`<step>.<field>`,
   `<widget-prefix>.<field>`, globals) with its datatype.
7. **Artifacts and attachments** — what comes in, what is produced, file names.
8. **Environment variables and connections** — mailbox, endpoints, thresholds; which
   connectors (Outlook, Teams, agent node, others).

## Mandatory Copilot Studio workflow JSON contract

**Always generate complete Copilot Studio Workflow Designer JSON, never runtime-only
Power Automate cloud-flow JSON.** Use the skill
[copilot-studio-workflow-ghcp-harness](../.github/skills/copilot-studio-workflow-ghcp-harness/SKILL.md)
whenever you create, change, clone, or review a workflow under `Workflows/`. It is the single
source for:

- the designer JSON contract (graph, `nodeActionMapping`, `metadata.nodeId` /
  `description`, envelope) and the step-by-step procedure;
- the cloning rules (no value may stay from the template; every setting stored in more than
  one place) and the offline checker `scripts/check_workflow.py`;
- the platform limits (expression length, request size, large attachments, editor
  functions) and how to debug a run;
- building blocks and patterns (agents, Dataverse, loops, scope / try-catch, data operations,
  classify, extract, document fold for checking many documents against business rules) with
  complete samples.

Use the [Order Processing workflow export folder](order-processing/solution/export/Workflows/)
as the structural reference for process flows. Do not copy the contract or the limits into
process documents; link to the skill instead.

## Recipes (copy from order-processing)

| Need | Pattern | Reference |
| --- | --- | --- |
| **Intake** | Trigger on the business event (mailbox, form, HTTP, schedule). Create `faf001_bpinstance` (status Running, `faf001_businesskey`, `faf001_channel`, `faf001_initiatorexternal`); create `faf001_bpattachment` and upload `faf001_file`; write a completed validation step, then **create the step row the next stage triggers on**. On invalid input: failed step, instance Failed, reply to sender. | `mail-order-intake` |
| **Stage trigger** | Dataverse "When a row is added, modified or deleted" on `faf001_bpsteps`, scope Organization (4). Created: message 1 + `faf001_stepname eq '<Step>' and faf001_status eq 324010000`. After a human gate: message 3 (Modified), `filteringattributes = faf001_status`, `faf001_stepname eq '<Review Step>' and faf001_steptype eq 324010001 and faf001_status eq 324010003`. | `extract-order-data`, `validate-order` |
| **Track progress** | After every step create/update, update the instance `faf001_status`, `faf001_statusmessage`, `faf001_lastupdated` (and `faf001_lastcompletedstepid@odata.bind` when a step completes). | all flows (`Track_*` actions) |
| **Read a human decision** | List `faf001_bpdatavalues` where `_faf001_bpinstanceid_value eq <id> and faf001_datakey eq '<prefix>.decision'`, order `modifiedon desc`, top 1; compare `toLower(trim(faf001_valuetext))` to `approved`. Read corrected data the same way (`<prefix>.<key>`, `faf001_valuejson`). Handle `rejected` and `needs_info`. | `validate-order` `Read_review_decision` |
| **Document extraction** (a document into fixed fields) | **Extract node**, not an agent: runtime `InvokeDefinition` with `body/files[0].content` = base64 text of the file and the schema as `output.schema`; the property descriptions are the extraction guidance. Result at `body('<action>')?['structuredOutput']`. Pick it with the skill's "Choosing an AI node". | `extract-order-data` `Extract_order_data` |
| **Inline agent** (single-use reasoning, instructions in the flow) | `shared_agentnode` → `InvokeDefinition` with `body/botDefinition` (model, `outputFormat: JsonSchema`, `structuredOutputSchema`) and `body/message`. | skill sample [inline-structured.json](../.github/skills/copilot-studio-workflow-ghcp-harness/references/agents/inline-structured.json) |
| **Published agent with skills** (reusable rules, knowledge files) | `shared_agentnode` → `InvokeAgent` with `body/agentId` = `faf001_<agent>`, `body/prompt`, `body/outputSchema`; result at `body('<action>')?['structuredOutput']`. The schema lives only here; the message carries per-run data only; see the [agents pattern](../.github/skills/copilot-studio-workflow-ghcp-harness/references/agents/PATTERN.md). | `validate-order` `Order_Validation_Agent` |
| **Agent over several files** (claim packet, application file) | Sequential loop, one file and the result so far per agent call (a fold), validation after the loop that also runs when the loop failed, no repair call. Two or more files with content in one structured call fail in practice. | skill sample [workflow-fold-documents.json](../.github/skills/copilot-studio-workflow-ghcp-harness/references/document-fold/workflow-fold-documents.json) |
| **Store agent result** | Create `faf001_bpdatavalue` linked to instance and step, key `<step>.result` style, `faf001_datatype` 324010004 (JSON), `faf001_valuejson = string(structuredOutput)`. | `validate-order` `Save_validation_result` |
| **Run once** | First action of the stage: list the stage's own output (data value key, or the artifact) for the instance; continue only when `length(...) = 0`, otherwise a Terminate in the else branch. Makes a repeated trigger harmless and a stage re-runnable after deleting its output. | `extract-order-data` `Order_not_yet_extracted`, `validate-order` `Order_not_yet_evaluated`, `finalize-order` `SAP_payload_not_yet_generated` |
| **Fail a step** | After every agent or extract call: a condition that runs after `Succeeded`, `Failed`, `Skipped` and `TimedOut` and checks the result with safe navigation (non-empty `structuredOutput`, plus what the platform does not check, for example at least one order line). The no-branch updates the step (status 324010004, `faf001_endtime`, `faf001_errorcode`, `faf001_errormessage`) and the instance (status 324010005, same error fields, `faf001_statusmessage`), then Terminates; nothing is stored as a result. Without it a failed call leaves the step `Running` forever. | `extract-order-data` `Check_extraction_result` (`Fail_extraction_step`, `Fail_business_process_instance`) |
| **Raise a human task** | (1) look up role: `roles` `$filter=name eq '<Role>'`, `$top=1`; (2) create step: type 324010001, status 324010002 Waiting; (3) create `faf001_bptask`: name, type, status 324010003 Waiting, `faf001_widgetid`, `faf001_inputdata`, instance + step binds, `faf001_requiredrole@odata.bind` = `if(empty(role), null, '/roles(<id>)')`; (4) instance → Waiting. | `validate-order` `Create_order_evaluation_review_task` |
| **Notify eligible users** | Read `faf001_WorkflowConsoleBaseUrl` (FetchXML on `environmentvariabledefinition` + outer link `environmentvariablevalue`; current value, else default). FetchXML on `systemuser` (distinct, enabled, has email) holding the role directly **or** through a team **or** member of a named team. For each: Teams `PostMessageToConversation` as Flow bot, HTML-escaped text, link = base URL + (`?` or `&`) + `page=StartTaskDetail&taskId=<task id>`. | `validate-order` `Get_workflow_console_URL`, `List_notification_recipients`, `Notify_each_approver` |
| **Produce an artifact** | Create `faf001_bpartifact` (name, `faf001_artifacttype`, status 324010001 Final, storage 324010002 Dataverse, MIME type, version 1, instance + step binds), then `UpdateEntityFileImageFieldContent` into `faf001_file`. | `finalize-order` `Create_SAP_order_payload_artifact` |
| **Finish** | Final step Completed; instance Completed with `faf001_endtime` and a status message. Rejections: write an explicit rejected step, then close the instance. | `finalize-order` |

Copy the order-processing runtime actions **and their designer nodes, edges, and
mappings** together; adapt names, step names, keys, and schemas in both representations.
Do not invent new connector operation shapes or omit the workflow JSON contract (see the skill above).

## Solution conventions

- Publisher `faf001` (same as core); solution `UniqueName` in PascalCase
  (`OrderProcessing`); zip `<UniqueName>_<major>_<minor>_<build>_<rev>_unmanaged.zip`.
- Workflows: kebab-case verb-noun names (`extract-order-data`), Copilot Studio agent flows
  (`.data.xml` `Category 5`, `ModernFlowType 1`), meaningful `Description`, new GUID per
  flow, `RootComponent type="29"` in `Solution.xml`. Ship them **deactivated**; the
  process's `activate-flows.ps1` activates them after import, **downstream first** so
  every trigger exists before upstream stages start writing rows.
- Agents: schema name `faf001_<name>agent`; GitHub Copilot harness; one skill per rule
  set with `SKILL.md` (frontmatter `name`, `description`, `metadata.version`) plus its
  knowledge files.
- Security roles: dedicated custom roles (never `Basic User`), `RootComponent type="20"`,
  granting Read on Security Role, Team, Team Membership and the needed `faf001_bp*`
  privileges, or tasks silently disappear from the queue.
- Connection references: reuse the core `faf001_sharedcommondataserviceforapps`; define
  process-owned references for other connectors with logical names unique to the process
  so two solutions never own the same component.
- Environment variables: `faf001_<PascalName>`; no environment values committed.
- No process may hardcode GUIDs of roles, users, teams, or environments.

## Developing and testing a stage

Each stage (a flow triggered by a step row) should be testable alone and re-runnable in minutes.

- **Test script per stage.** `solution/scripts/test-<stage>.ps1` seeds the state the previous stage leaves
  (instance, data values, attachments, the upstream result, the step the stage triggers on), waits for the
  stage, and asserts its acceptance criteria and its timing. Seed the upstream **result** instead of running
  the upstream agent, so a stage test does not depend on another agent. It writes one labelled test instance
  to the target environment: confirm the environment first. Shape of the script: parameters
  `-EnvironmentUrl`, `-TenantId`, `-OrganizationId`; acquire a token with `az account get-access-token`;
  check `WhoAmI` returns the expected organization before writing anything; create the instance, data
  values, attachments (file upload) and steps through the Dataverse Web API; create the trigger step last and
  poll its status with a timeout; assert each acceptance criterion and the timing as PASS/FAIL rows and exit
  with code 1 when any fails.
- **Re-run without re-seeding.** A stage ends early when its output already exists (run-once guard on a
  data key). To run it again on a seeded instance, delete that stage's output data values
  (`<stage>.*` keys) and create a new step row with the trigger's step name and status on the same instance.
  A re-run then takes the run time of the stage instead of the seeding time. Never delete data of an
  instance you did not create for testing.
- **Change one thing per run** when something fails (see "Debugging a run" in the
  [workflow skill](../.github/skills/copilot-studio-workflow-ghcp-harness/SKILL.md)); read the run's
  action statuses and the failing action's output before changing anything.
- **Generate the flow from one data structure** with
  [workflow_builder.py](../.github/skills/copilot-studio-workflow-ghcp-harness/scripts/workflow_builder.py),
  re-generate after every change, run `check_workflow.py`, repack, import, activate, re-run.
- Record what was measured (run time, which checks passed) in the process README, and what was not.

## Deliverables checklist

- [ ] Design (above) agreed with the user and written into `README.md`
      (mirror the order-processing README sections: key features, process flow, stage by
      stage, agents, contributed vs. inherited, demo data and limits, before you deploy).
- [ ] Workflows, agents/skills/knowledge, roles, env vars, connection refs in `export/`.
- [ ] Every new or changed workflow node opened in the Copilot Studio editor with no error
      (see the cloning rules in the
      [workflow skill](../.github/skills/copilot-studio-workflow-ghcp-harness/SKILL.md)),
      and `scripts/check_workflow.py` passes on each.
- [ ] Widgets registered in the console, with tests; core repacked if the console changed.
- [ ] `build/` zip packed; imported into a dev environment and an end-to-end run verified
      when an environment is available.
- [ ] `solution/scripts/activate-flows.ps1` for this process's flow names, and a
      `test-<stage>.ps1` per stage.
- [ ] A `.github/skills/deploy-<process>/` skill cloned from `deploy-order-processing`
      (SKILL.md, references/ including the `DEPLOYMENT.md` guide, readiness scripts), kept consistent.
- [ ] Process `AGENTS.md`; root `README.md` reference-implementations list updated.
- [ ] Demo data clearly labelled as fictional; no secrets or environment values committed.
