---
name: copilot-studio-workflow-ghcp-harness
description: 'Generate or change Microsoft Copilot Studio workflows for the GitHub Copilot harness (also called the Microsoft Copilot harness): complete Workflow Designer JSON with graph, nodeActionMapping and runtime actions, Dataverse step triggers, agent nodes (published, inline, text or structured output), document extraction (Extract node), classification (Classify node), data operations, conditions, loops, scopes (try/catch) and solution packaging. Use when asked to create, edit, clone, review or debug a workflow under Workflows/ in a solution export, or when a workflow opens with errors in the Copilot Studio editor.'
---

# Copilot Studio workflows (GitHub Copilot / Microsoft Copilot harness)

A workflow in a solution export is **one JSON file that describes the same flow three times**:
the runtime actions, the designer graph, and the node-to-action mapping. The designer and the
runtime read different copies, so all three must be generated together. Tests and runs only
exercise the runtime copy; a wrong designer copy shows up only when someone opens the workflow
in Copilot Studio.

## Contract (every new or changed workflow)

Always generate complete Workflow Designer JSON, never runtime-only cloud-flow JSON.
`Category 5` and `ModernFlowType 1` in the `.data.xml` do **not** add designer metadata.

- Trigger `metadata.associatedData.graph` with `name`, `nodes`, `edges`, `connectionReferences`.
  Each node has `id`, `name`, `type`, `version`, `position`, `data.config`, `data.outcomes`.
- Trigger `metadata.associatedData.nodeActionMapping` (sibling of `graph`): executable node id
  → array of exact runtime action names. An end/terminate node maps to its own id.
- `metadata.nodeId` and `metadata.description` on every runtime action, including nested
  branch and loop actions. Exception: a node that expands to **several** runtime actions (a
  variable node with several assignments) puts the metadata on its **first** action only; the
  others have none and are listed after it in `nodeActionMapping`.
- Definition `metadata.telemetryMetadata.modifiedSources` containing `WorkflowDesigner`
  (`"WorkflowDesigner"`, or `"AgenticMultiArtifactBuilder,WorkflowDesigner"` for flows created
  with the designer's assistant) and `properties.templateName: null`; same envelope as
  [envelope/workflow-envelope.json](./references/envelope/workflow-envelope.json).
- `graph.connectionReferences` and `properties.connectionReferences` list the same references.
- A matching `<name>-<GUID>.json.data.xml` ([sample](./references/envelope/workflow.data.xml.sample)),
  a `RootComponent type="29"` in `Solution.xml` and a connection reference in
  `Customizations.xml` for each connector the workflow uses.
- Ship workflows deactivated; activate them downstream first.

## Procedure

1. **Design the stages first**: trigger (which step row, created or modified), actions, agent
   calls, branches, outputs written. Name actions `Verb_object_in_snake_case`; names are used in
   expressions and in `nodeActionMapping`.
2. **Pick building blocks** from [references/](./references/) (index below). Each block file
   contains the runtime action, its designer node(s), the mapping entry and example edges.
   Check the pattern folders (those with a `PATTERN.md`) first: they have complete sample workflows.
3. **Generate from one data structure.** Write a small generator (script) in which each block
   is defined once and emits the runtime action, the designer node, the mapping entry and the
   edges. Do not hand-edit the three representations separately. Use
   [scripts/workflow_builder.py](./scripts/workflow_builder.py): it copies node shapes from a template
   workflow export (any designer export with one node of each kind you use, and each connector operation on
   the table you use it on), builds connector, Compose,
   Filter / Select / Parse JSON, variable, If, loop (sequential for a fold), agent (structured or text),
   Extract (with `extract_template=references/extract/workflow-extract.json`) and
   end nodes with their edges and mapping, and gives the same file on every run (deterministic ids). The
   module docstring has a usage sketch. A node kind, or a connector operation on a table, that the template
   does not contain is reported rather than invented.
4. **Replace every template-specific value** in every copy (see next section).
5. **Run the offline check** and fix everything it reports:
   `python "$skillFolder/scripts/check_workflow.py" <workflow.json> --template <template.json>`
   (`--template` fails if any action name, agent schema name or flow name of the template is
   still present; `--forbid <term>...` adds your own terms such as business words).
6. **Pack, import, activate, run** (use the process's own scripts and its authoring-option
   decision), then read per-action status of a run. Never infer from the flow status alone.
7. **Open every new or changed node in the Copilot Studio editor** and confirm there is no
   error or warning. Nothing automated covers this step.

## Choosing an AI node

Three built-in nodes call a model. Pick the most specialised one that fits the task; all three run
on the agent connector and consume Copilot Credits per call.

| Capability | Node | Pattern |
| --- | --- | --- |
| **Document extraction**: turn a document (PDF, image, Word, Excel, PowerPoint) or text into named fields and tables | **Extract node** | [extract/](./references/extract/PATTERN.md) |
| **Classification**: route an input to one of a few fixed categories | **Classify node** | [classify/](./references/classify/PATTERN.md) |
| Reasoning, your own instructions, tools, knowledge, several steps, or logic reused across workflows | **Agent node** (inline or published) | [agents/](./references/agents/) |
| **Checking many documents against business and validation rules**, including rules across documents (completeness, consistency) | **Agent node in a sequential loop**, one document per call, result passed to the next call | [document-fold/](./references/document-fold/PATTERN.md) |

Extract node or agent node (the Extract node is a specialised document experience built on the
agent-node foundation; it does not replace the agent node):

| Question | Extract node | Agent node |
| --- | --- | --- |
| What is the task? | Read a defined structure out of a document | Broader reasoning, decisions, tools, knowledge, multistep work |
| Instructions | Built in; guide each field with its **description** | Written by you (prompt, or the published agent's instructions and skills) |
| Output | The fields and tables you define; each becomes dynamic content | Text, or structured output from a schema you supply |
| Authoring | Fields from a sample document, a template, or added manually; **Test** pane with an uploaded document | Instructions, model, tools and knowledge; a published agent is authored separately |
| Tools, knowledge, other steps | None | Yes |
| Reuse across workflows | Per node | Published agent |
| Best when | Invoices, receipts, contracts, reports, statements, purchase orders, attachments: a predictable structure before a later step creates a record, routes, or decides | The answer needs judgement beyond field extraction, or the agent must call tools or consult knowledge |

Use both together when needed: an Extract node reads the document into fields, then an agent node
decides what to do with them. Extraction and classification can also be combined (extract, then
classify the extracted text). Source for the node behaviour:
[Add an extract node to a workflow](https://learn.microsoft.com/en-us/microsoft-copilot-studio/workflows-experience/extract-node-workflow).

## Reference library

All samples are in [references/](./references/), grouped by category. Pattern folders hold
complete workflows built and tested in the designer; the other folders hold single building
blocks (excerpts) taken from exported workflows. A folder with a `PATTERN.md` is a pattern.

| Folder | Contents |
| --- | --- |
| [envelope/](./references/envelope/) | workflow file skeleton (`workflow-envelope.json`) and `.data.xml` sample |
| [triggers/](./references/triggers/) | `row-created`, `row-modified` (Dataverse), `mailbox-new-email` (polling connector) |
| [dataverse/](./references/dataverse/) | `update-row`, `create-row`, `create-row-in-loop`, `list-rows`, `download-file`, `upload-file`, `save-json-value` |
| [connectors/](./references/connectors/) | a connector other than Dataverse (`teams-post-message`) |
| [agents/](./references/agents/PATTERN.md) | **pattern** and blocks: agent node (`published-structured`, `published-text`, `inline-structured`, `inline-connector-tool`); one output contract, no repair call, lean message (has `PATTERN.md`) |
| [control/](./references/control/) | `condition` (if / else), `terminate-end` |
| [loops/](./references/loops/PATTERN.md) | **pattern**: variables, apply-to-each, concurrency, Compose (has `PATTERN.md`, see Patterns) |
| [scope/](./references/scope/PATTERN.md) | **pattern**: scope, try / catch with `Failed` / `TimedOut` branches, run-after in the designer (has `PATTERN.md`) |
| [data-operations/](./references/data-operations/PATTERN.md) | **pattern**: Compose, Parse JSON, Filter array, Select, Join (has `PATTERN.md`) |
| [classify/](./references/classify/PATTERN.md) | **pattern**: built-in classify node, Switch per category, and when to use an inline agent instead (has `PATTERN.md`) |
| [extract/](./references/extract/PATTERN.md) | **pattern**: Extract node on image and PDF input with an HTTP trigger and a structured output schema (has `PATTERN.md`) |
| [document-fold/](./references/document-fold/PATTERN.md) | **pattern**: check a set of documents (contract, claim, order, deal, loan, tax) against business and validation rules with one agent call per document, the result passed to the next call; six filled-in contracts in [SCENARIOS.md](./references/document-fold/SCENARIOS.md) (has `PATTERN.md`) |
Block files are excerpts: containers keep only their first children, and edges to nodes outside
the block are listed as examples under `edgesCrossingBlockBoundary_examples`. For a complete
working flow, read the workflow exports in your solution. Reuse an existing connection reference
for a connector instead of defining a duplicate; a connector no solution uses yet needs a new one.

## Patterns

Each pattern folder has a `PATTERN.md` (rules, designer ↔ runtime mapping, observed behaviour,
how to verify) and complete sample workflows exported from the designer. Prefer a pattern over
the excerpts when it covers your need, and read its `PATTERN.md` first.

| Pattern | Use it for | Folder |
| --- | --- | --- |
| Loops, variables, parallel iterations | apply to each over an array, accumulate with variables, set concurrency, Compose after a loop | [loops/](./references/loops/PATTERN.md) |
| Scope, try / catch | group actions, run a success path or a catch path on `Failed` / `TimedOut`, designer run-after, variables around scopes | [scope/](./references/scope/PATTERN.md) |
| Data operations | build, parse, filter, project and join arrays and objects with built-in nodes (no connector) | [data-operations/](./references/data-operations/PATTERN.md) |
| Classify | route an input to one of a few fixed categories with the classify node; choose an inline agent when categories are many, dynamic or loaded at run time | [classify/](./references/classify/PATTERN.md) |
| Extract | read fixed fields from an image, PDF or text with the Extract node and a structured schema; HTTP trigger with file input; parallel extractions | [extract/](./references/extract/PATTERN.md) |
| Document fold | validate a set of documents (contracts, claims, orders, deals, loans, tax packs) against business rules, with cross-document checks (required documents present, values consistent); sequential loop, one document and the previous result per agent call, structured output, validation after the loop | [document-fold/](./references/document-fold/PATTERN.md), scenario contracts in [SCENARIOS.md](./references/document-fold/SCENARIOS.md) |
| Agent node | call a published or inline agent and use its result: the output schema written once, what to do when structured output fails (simplify the call, no repair call), a message that does not repeat the agent's instructions | [agents/](./references/agents/PATTERN.md) |
Pattern rules: a `PATTERN.md` stays tool- and environment-agnostic (no environment, tenant,
solution or workflow names; samples are referred to by file name), states what was observed
versus what is documented platform guidance, and ends with checks a coding agent can run.
## Cloning a node: no value may stay from the template

A designer node stores one setting in more than one field. For every node you copy:

1. **Walk every key** under `data.config` and `data.outcomes`; replace each value that is
   specific to the template (names, text, schemas, parameters).
2. **Update all copies of a setting together:**

   | Setting | Runtime copy | Designer copies |
   | --- | --- | --- |
   | Agent message | `inputs.parameters["body/prompt"]` (inline agent: `body/message`) | `config.instructions`, `config.instructionsRich.segments[].value` |
   | Agent output schema | `inputs.parameters["body/outputSchema"]` | `config.jsonSchema`, `config.jsonSchemaText`, `data.outcomes[].outcomeSchema.properties.structuredOutput` |
   | Agent output mode | `body/outputSchema` present or absent | `config.outputMode` (`text` or `structured`) |
   | Agent identity | `inputs.parameters["body/agentId"]` | `config.botSchemaName` |
   | Connector inputs | `inputs.parameters` | `config.parameters` |
   | Condition | `expression` | `config.conditions[].expression`, `data.outcomes` |
   | Trigger inputs | `inputs.parameters` | start node `config.connector.inputs` |
   | Classify categories | prompt text, schema `enum`, Switch `cases` / `default` | `config.categories[]`, `data.outcomes[]`, edge `sourceHandle` (see [classify/](./references/classify/PATTERN.md)) |
   | Extract node input and schema | `body/files[0].content`, `output.schema` string | `config.input`, `config.inputRich`, `config.jsonSchema`, `config.simpleProperties`, `outcomeSchema.properties.structuredOutput` (see [extract/](./references/extract/PATTERN.md)) |

   When you find another setting stored twice, add a row here.
3. **Verify by search.** List the template's action names, agent schema names, entity and step
   names and business words. The new files must contain none of them.
4. **Verify action references.** Every action named in an expression (`outputs('X')`,
   `body('X')`, `actions('X')`) must exist in the same workflow, including inside
   `data.config` text; `items('X')` must name a loop.

`scripts/check_workflow.py` automates checks 3 and 4 and the agent-node rows above.

## Agent node essentials

- **Published agent** (reusable rules, skills, knowledge files): action `InvokeAgent`,
  `body/agentId` = agent schema name, `body/prompt`, optional `body/outputSchema`. Result:
  `body('<action>')?['structuredOutput']` (schema set) or `body('<action>')?['result']` (text).
  `body('<action>')?['conversationId']` identifies the run.
- **Inline agent** (single-use, instructions in the flow): `InvokeDefinition` with
  `body/botDefinition` (model, `outputFormat`, `structuredOutputSchema`) and `body/message`.
- The agent receives files only as text in the prompt (for example a JSON array of
  `name`, `contentType`, `contentBytes` base64). Agents only read and report; the workflow
  validates the output and writes to the history.
- Validate agent output in the workflow before storing it, and record a failure as a failed
  step, never as a finding.
- Follow the [agents pattern](./references/agents/PATTERN.md): use structured output whenever the workflow
  uses data from the answer, with the output schema written **once** (only in the schema); keep the message to
  per-run data; and when structured output fails, **simplify the call**. A text call parsed with Parse JSON is a
  last resort that needs the user's approval.

## Platform limits

- One expression is limited to **8,192 characters**. Split long text into several `@{…}`
  interpolations instead of one `concat(...)`.
- The agent node rejects requests above roughly **2 MB** (`RequestEntityTooLarge`); base64 adds
  a third. Skip or reduce files above your budget and tell the agent which were not provided.
  For long documents, split them into single pages and extract per page in a loop
  ([extract/](./references/extract/PATTERN.md#long-multi-page-documents)).
- A call that sets `outputSchema` can fail with `StructuredOutputExtractionFailed` or return an **empty
  `structuredOutput`** when one request carries **two or more files with content**, although the text answer
  is valid. Do not add a second call to reformat the answer: send one file per call and fold the result
  ([document-fold](./references/document-fold/PATTERN.md)), then reduce the rest of the load (shorter
  instructions, a smaller schema); see
  [agents/](./references/agents/PATTERN.md#rule-2-when-structured-output-fails-make-the-call-simpler--do-not-add-a-repair-call).
- A **Set variable** action cannot reference the variable it sets (`Self reference is not supported`
  at activation). Use `increment` / `appendToArray`, or compute the value in a Compose.
- The designer has **variable nodes** (initialise at the top level, then increment / append
  inside loops) and a **scope node** with `Failed` / `TimedOut` branches for try/catch; see
  [loops/](./references/loops/PATTERN.md) and [scope/](./references/scope/PATTERN.md).
- Use expression functions that the designer's editor accepts: prefer the ones already used in workflows built in the designer (for example `actions`, `coalesce`, `concat`, `variables`), and check every expression in the editor before publishing. Identify a run by the row that triggered it (`triggerOutputs()?['body/<id column>']`).
- Dataverse connector writes accept `item/<lookup>@odata.bind`; generic validators
  (`validate_flow`, `preflight_flow`) flag it and report connection references as missing. Treat
  their output as hints and rely on import, activation and per-action run results.

## Debugging a run

1. Read per-action status and outputs of the run (Flow API run actions or the flow tools'
   run-action calls), starting at the first failed or skipped action.
2. Check agent output against the schema locally before blaming the agent.
3. **Bisect an agent-node failure with one change per run.** Do not ship a fix on a guess (a first guess of
   "the request is too large" was wrong). Re-run the same input with one thing changed: send the files with no
   content (`provided: false`), one file only, each file type alone, the same call in text mode (read
   `body('<action>')?['result']` to see what the agent really answers), a smaller schema, shorter
   instructions. Keep a cheap re-run path (see "Developing and testing a stage" in the process
   [AGENTS.md](../../../business-processes/AGENTS.md)) and record in the pattern what was and was not
   isolated.
4. A flow that fails activation reports template validation errors (expression limit, missing
   connection reference): fix the JSON, repack, re-import.
5. **Updating a workflow remotely fails with `ActiveUnpublished` / `0x80040203`** when someone has saved the workflow in the editor (an unpublished row exists). Read the unpublished state first (it is not discarded by a remote update), and only if its content is what you expect, publish just that workflow (`PublishXml` with `<importexportxml><workflows><workflow>{id}</workflow></workflows></importexportxml>`), then repeat the update. Never overwrite someone else's unpublished edit without asking.
