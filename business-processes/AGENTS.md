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
    ├── DEPLOYMENT.md                          step-by-step install; mirrored in .github/skills/deploy-<process>/references/
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
    └── scripts/activate-flows.ps1             activates this process's workflows after import
```

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
   the JSON output schema each agent must return.
5. **Human tasks** — task name, task type, widget ID (`<domain>-<purpose>-ui`), the
   `faf001_inputdata` JSON shape, the security role (and optional notification team), and
   the output keys the widget writes.
6. **Data keys** — every `faf001_bpdatavalue` key written and read (`<step>.<field>`,
   `<widget-prefix>.<field>`, globals) with its datatype.
7. **Artifacts and attachments** — what comes in, what is produced, file names.
8. **Environment variables and connections** — mailbox, endpoints, thresholds; which
   connectors (Outlook, Teams, agent node, others).

## Recipes (copy from order-processing)

| Need | Pattern | Reference |
| --- | --- | --- |
| **Intake** | Trigger on the business event (mailbox, form, HTTP, schedule). Create `faf001_bpinstance` (status Running, `faf001_businesskey`, `faf001_channel`, `faf001_initiatorexternal`); create `faf001_bpattachment` and upload `faf001_file`; write a completed validation step, then **create the step row the next stage triggers on**. On invalid input: failed step, instance Failed, reply to sender. | `mail-order-intake` |
| **Stage trigger** | Dataverse "When a row is added, modified or deleted" on `faf001_bpsteps`, scope Organization (4). Created: message 1 + `faf001_stepname eq '<Step>' and faf001_status eq 324010000`. After a human gate: message 3 (Modified), `filteringattributes = faf001_status`, `faf001_stepname eq '<Review Step>' and faf001_steptype eq 324010001 and faf001_status eq 324010003`. | `extract-order-data`, `validate-order` |
| **Track progress** | After every step create/update, update the instance `faf001_status`, `faf001_statusmessage`, `faf001_lastupdated` (and `faf001_lastcompletedstepid` when a step completes). | all flows (`Track_*` actions) |
| **Read a human decision** | List `faf001_bpdatavalues` where `_faf001_bpinstanceid_value eq <id> and faf001_datakey eq '<prefix>.decision'`, order `modifiedon desc`, top 1; compare `toLower(trim(faf001_valuetext))` to `approved`. Read corrected data the same way (`<prefix>.<key>`, `faf001_valuejson`). Handle `rejected` and `needs_info`. | `validate-order` `Read_review_decision` |
| **Inline agent** (single-use reasoning, instructions in the flow) | `shared_agentnode` → `InvokeDefinition` with `body/botDefinition` (model, `outputFormat: JsonSchema`, `structuredOutputSchema`) and `body/message`. | `extract-order-data` `Extraction_Agent` |
| **Published agent with skills** (reusable rules, knowledge files) | `shared_agentnode` → `InvokeAgent` with `body/agentId` = `faf001_<agent>`, `body/prompt`, `body/outputSchema`; result at `body('<action>')?['structuredOutput']`. | `validate-order` `Order_Validation_Agent` |
| **Store agent result** | Create `faf001_bpdatavalue` linked to instance and step, key `<step>.result` style, `faf001_datatype` 324010004 (JSON), `faf001_valuejson = string(structuredOutput)`. | `validate-order` `Save_validation_result` |
| **Raise a human task** | (1) look up role: `roles` `$filter=name eq '<Role>'`, `$top=1`; (2) create step: type 324010001, status 324010002 Waiting; (3) create `faf001_bptask`: name, type, status 324010003 Waiting, `faf001_widgetid`, `faf001_inputdata`, instance + step binds, `faf001_requiredrole@odata.bind` = `if(empty(role), null, '/roles(<id>)')`; (4) instance → Waiting. | `validate-order` `Create_order_evaluation_review_task` |
| **Notify eligible users** | Read `faf001_WorkflowConsoleBaseUrl` (FetchXML on `environmentvariabledefinition` + outer link `environmentvariablevalue`; current value, else default). FetchXML on `systemuser` (distinct, enabled, has email) holding the role directly **or** through a team **or** member of a named team. For each: Teams `PostMessageToConversation` as Flow bot, HTML-escaped text, link = base URL + (`?` or `&`) + `page=StartTaskDetail&taskId=<task id>`. | `validate-order` `Get_workflow_console_URL`, `List_notification_recipients`, `Notify_each_approver` |
| **Produce an artifact** | Create `faf001_bpartifact` (name, `faf001_artifacttype`, status 324010001 Final, storage 324010002 Dataverse, MIME type, version 1, instance + step binds), then `UpdateEntityFileImageFieldContent` into `faf001_file`. | `finalize-order` `Create_SAP_order_payload_artifact` |
| **Finish** | Final step Completed; instance Completed with `faf001_endtime` and a status message. Rejections: write an explicit rejected step, then close the instance. | `finalize-order` |

Copy the order-processing JSON for these actions and adapt names, step names, keys, and
schemas — do not invent new connector operation shapes.

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

## Deliverables checklist

- [ ] Design (above) agreed with the user and written into `README.md`
      (mirror the order-processing README sections: key features, process flow, stage by
      stage, agents, contributed vs. inherited, demo data and limits, before you deploy).
- [ ] Workflows, agents/skills/knowledge, roles, env vars, connection refs in `export/`.
- [ ] Widgets registered in the console, with tests; core repacked if the console changed.
- [ ] `build/` zip packed; imported into a dev environment and an end-to-end run verified
      when an environment is available.
- [ ] `solution/scripts/activate-flows.ps1` for this process's flow names.
- [ ] `solution/DEPLOYMENT.md` and a `.github/skills/deploy-<process>/` skill cloned from
      `deploy-order-processing` (SKILL.md, references/, readiness scripts), kept consistent.
- [ ] Process `AGENTS.md`; root `README.md` reference-implementations list updated.
- [ ] Demo data clearly labelled as fictional; no secrets or environment values committed.
