# Pattern: check a set of documents against business rules (agent fold)

Use this when a set of documents (a contract bundle, an application file, an order with its supporting
documents, a tax return pack, a claim packet) must be checked against **business rules and validation
rules**, and some rules look **across** documents (is every required document present, do names, dates,
amounts and identifiers agree between documents). The pattern is the same for every domain; what changes is
the list of document roles, the rule families (skills) and the result schema. Six filled-in contracts are in
[SCENARIOS.md](./SCENARIOS.md): contract review, claim, order, deal, loan and tax.

The workflow calls one published agent **once per document, in sequence**. Each call receives one
document plus the **result of the previous call**, and returns the **updated result for everything
seen so far**. The loop keeps that result in a variable and feeds it to the next call (a fold).
After the last document the variable holds the verdict for the whole set.

Worked example, run end to end on a 7-document packet (an insurance claim: 2 identity documents, a
statement, 3 photographs and a repair estimate): [workflow-fold-documents.json](./workflow-fold-documents.json).
It has a Dataverse trigger, a published agent with three skills and a structured result schema; the names in
it (`Completeness Agent`, `file_inventory`, `consistency_checks`) are the claim's. Replace the trigger, the
document source, the agent and the schema for another process, keep the loop.

## When to use it

| Situation | Use |
| --- | --- |
| Rules are checked per document and do not depend on the other documents | parallel loop over the documents (`concurrency` > 1), then one Select / Join over the results ([loops/](../loops/PATTERN.md), [data-operations/](../data-operations/PATTERN.md)) |
| Only fields are needed, no judgement | Extract node per document ([extract/](../extract/PATTERN.md)) |
| Rules combine information **across** documents: completeness of the set, consistency between documents, accumulated findings | **this pattern** |
| The packet is small and fits one request | one agent call is enough; keep the loop when the number of documents is unbounded or the files can be large |

The number of documents is never fixed in the flow: the loop runs over whatever the list returns.

## Shape of the flow

```
Initialize result, files_done                     (top level, before everything else)
List documents                                    (source of the array, ordered)
Read context                                      (the case record, the request, a reference table, ...)
Loop  Check each document            concurrency 1
   Download document
   Compose  File entry                { name, contentType, size, provided, contentBytes }
   Agent    Review Agent              structured output = the result schema
   Variable Update result             set result = string(structuredOutput)
   Variable Count file                increment files_done
Condition  Result is valid                        (after the loop; runs also when the loop failed)
   yes: save the result linked to the step, complete the step, create the next step
   no : fail the step and the instance with an error code
```

The documents of a case are rarely equal: one of them often anchors the rest (the master agreement, the
application form, the purchase order, the term sheet). When a rule needs that document first, order the list
so that it comes first (`$orderby` on a column that expresses it, such as a document type rank or a received
timestamp), or make the rule independent of order (a mandatory item stays open until the last file).

## The nodes that make it work

### 1. Variables, initialised once at the top level

| Variable | Type | Start value | Role |
| --- | --- | --- | --- |
| `result` | string | `{}` | the accumulated result, passed to the next call |
| `files_done` | integer | `0` | number of documents already checked; the prompt says "file k of n" |

`result` is a **string** (`string(...)` of the structured output) so it can be interpolated into the
prompt and read back with `json(variables('result'))`. Set it with a variable node in `set` mode
(`SetVariable`). One variable node initialises both; it yields the actions
`Initialize_result__files_done` and `Initialize_result__files_done_Init_files_done`.

`IncrementVariable` takes a **number**: write `"value": 1`, not `"1"` (the designer keeps `"1"` as a
string in `assignments[]`, the runtime action needs the number).

### 2. The loop is sequential

`concurrency: 1` in both places (designer `config.concurrency`, runtime
`runtimeConfiguration.concurrency.repetitions`). Each call needs the previous result, so the order
of documents is the order of the list: use `$orderby` on the list action (for example `createdon asc`)
so that the run is repeatable. Loop structure and edges: [loops/](../loops/PATTERN.md).

### 3. One document per request

Download the file inside the loop and Compose one object:

```json
{ "name": "@items('Check each document')?['filename']",
  "contentType": "@coalesce(items('Check each document')?['mimetype'], 'application/octet-stream')",
  "size": "@coalesce(items('Check each document')?['filesize'], 0)",
  "provided": "@lessOrEquals(coalesce(items('Check each document')?['filesize'], 0), 1100000)",
  "contentBytes": "@if(<provided>, base64(body('Download document')), '')" }
```

- A published agent receives the file as base64 inside the prompt (`InvokeAgent` has `prompt` and
  `outputSchema` only), and the agent request is limited to about 2 MB. `provided` is `false` for a
  file whose base64 content would not fit; it is sent without content and the prompt tells the agent
  to report it as `could_not_be_processed` (a technical limit, never missing evidence).
- Interpolate the object with `@{string(outputs('File entry'))}`: short expressions in the prompt,
  the shaping happens in Compose.

### 4. The prompt carries the position, the document and the previous result

The agent already has its role, rules and input format in its instructions
([agents pattern](../agents/PATTERN.md#rule-3-the-message-does-not-repeat-what-the-agent-already-has)); the
message carries only what changes per call:

```
Case: @{triggerOutputs()?['body/_..._value']}
Context (JSON): @{coalesce(first(outputs('Read context')?['body/value'])?['valuejson'], '{}')}
This is file @{add(variables('files_done'), 1)} of @{length(outputs('List documents')?['body/value'])}.
File: @{string(outputs('File entry'))}
Previous result (an empty object for the first file): @{variables('result')}
```

### 5. The agent merges, it does not restart

Put the folding contract in the **agent instructions** (the agent's `configuration.json`), not only in
the prompt:

- one document per run, plus the previous result (empty object for the first);
- return the updated result for the whole set seen so far, as one JSON object in the schema;
- keep every earlier document entry, source and value unchanged and add to them;
- recalculate the checklist, the cross-document comparisons, the conflicts and the summary over
  everything seen so far;
- a mandatory item that no document seen so far satisfies stays `not_met` with a finding saying none
  has been seen yet; it becomes a real gap only when this is the last file (`k` equals `n`);
- every finding carries its source (document and location); on conflict show every value with its
  source and never choose one;
- extract and compare, do not decide: the agent reports figures, dates and clauses with their sources; it
  does not approve, price, accept or reject. Arithmetic on extracted figures (totals, ratios, tolerances) and
  the decision belong to the workflow or a later step.

The business rules themselves (required documents, readability, consistency checks) live in the
agent's **skills**, one skill per rule family, so they can be versioned and tested apart from the flow.

### 6. Structured output on every call

Set `body/outputSchema` on the agent node (designer `config.jsonSchema`, `jsonSchemaText` and
`outcomeSchema.properties.structuredOutput`, see [agents/](../agents/PATTERN.md)). Each call returns the whole
result as `body('<agent node>')?['structuredOutput']`; no text parsing is needed. Use
`additionalProperties: false`, `required` on every object and `enum` for every status so the result
is machine-checkable. The one schema describes both what the agent returns and the previous result
it receives in the next call. Start from the common skeleton below and add the sections your rule
families need.

### 7. Validate after the loop, not inside it

Run the condition after `Succeeded` **and** `Failed` (also `Skipped`, `TimedOut`) of the loop, so a failed
agent call becomes a failed step instead of a stuck one ([agents pattern](../agents/PATTERN.md#make-a-failed-call-a-failed-step)).
After the loop, one Condition checks that the final result is usable, for example:

```json
{ "and": [
  { "equals": ["@json(variables('result'))?['schema_version']", "1.0"] },
  { "equals": ["@length(coalesce(json(variables('result'))?['documents'], json('[]')))",
               "@length(outputs('List documents')?['body/value'])"] } ] }
```

The document count equal to the list count proves every document was folded in (this also
fails a packet with no documents, because the loop never ran). The `no` branch fails the step and
the instance with an error code and stores no finding. Gaps, conflicts and a proposed hold are
**findings in the result**, not failures: the flow stores them and continues.

### 8. Run identification

Store the result linked to the row that triggered the run (`item/<step lookup>@odata.bind` built from
`triggerOutputs()?['body/<step id column>']`). That step row identifies the run: one row starts one run, it
holds the start and end time, and its type names the agent. The deployed solution version identifies the agent
and skill versions, and the result carries `rules_version`. The run history of the agent node shows the
`conversationId` of each call.

## Result skeleton (common to every scenario)

One schema for every call; the scenarios in [SCENARIOS.md](./SCENARIOS.md) fill in the enums and add sections.

```json
{ "schema_version": "1.0",
  "rules_version": "<version of the rules applied>",
  "documents":    [ { "file_name": "", "role": "<enum of document roles>",
                      "readability": "readable | partially_readable | unreadable | unsupported | could_not_be_processed",
                      "missing_required_information": [], "notes": "", "source": { "document": "", "location": "" } } ],
  "checklist":    [ { "id": "<enum of required items>", "mandatory": true,
                      "status": "met | not_met | unavailable", "finding": "", "sources": [ { "document": "", "location": "" } ] } ],
  "cross_checks": [ { "check": "<enum of comparisons>", "status": "consistent | conflict | unavailable",
                      "values": [ { "value": "", "document": "", "location": "" } ], "finding": "" } ],
  "conflicts":    [ { "check": "", "description": "", "values": [ { "value": "", "document": "", "location": "" } ] } ],
  "proposed_hold": { "proposed": false, "reasons": [] },
  "summary":      { "overall": "<enum: complete and consistent | gaps | conflicts | gaps and conflicts | processing incomplete>", "statement": "" } }
```

- `documents` has one entry per file, in list order: this is what the validation counts.
- `checklist` answers "is everything that must be there, there"; `cross_checks` answers "do the documents
  agree"; `conflicts` repeats each conflicting comparison with every value and its source.
- `unavailable` is for a value the agent could not determine for a technical reason (a file marked
  `provided: false`, an unreadable scan), never for something that is simply absent (that is `not_met`).
- `proposed_hold` is only a proposal for a person to decide.
- Scenario sections (clause findings, figures, line comparisons) are arrays of small objects that always
  carry `document` and `location`. Keep free text to one or two short sentences: the whole result is
  re-emitted on every call, so its size drives the run time.

## What a fold cannot do

- **The agent sees one file per call.** It cannot look at an earlier file again, only at what the previous
  result recorded about it. A judgment that needs two files side by side (is this scan an enlargement of that
  one, does the signature on this page match the first page, does this clause repeat the earlier wording) rests
  on the description and location the earlier call wrote down. Make the schema record what later calls need
  per file (a one-sentence description, the location of each finding, the extracted values to compare), and
  expect weaker cross-file visual judgments than a request that carries all files, which is not an option when
  two or more files with content break structured output.
- **References can be over-attributed.** A call that cannot see the earlier files may attach the current file
  to findings it does not show. Say in the instructions that a file is added to a finding only when that file
  itself shows it, and have the reviewer verify references; do not test for exclusivity you cannot enforce.
- **Run time grows with the number of files** (each call re-emits the whole result): plan for
  `files x 90-110 s`. A packet of four files took about seven minutes. Shorten free text, drop schema fields
  the workflow can compute, and send only the files the task needs. The call count, not the file size, drives
  the time.
- **Order can matter.** A later document may supersede an earlier one (an amendment, a revised estimate, a
  corrected return). Say in the skill which wins and keep both values with their sources in the result rather
  than overwriting; order the list so the rule can be applied in one pass.

## What was observed

- 7 documents, 7 sequential calls (the worked example): every call succeeded, the result held 7 document
  entries, all mandatory items met, all six cross-checks consistent, and the validation passed.
- Each call took about **75 to 125 seconds** (the agent opens the file, runs three skills, and
  re-emits the whole result), so a 7-document packet took about **12 minutes**. Plan the process
  timing for `documents x ~100 s`; the longer the accumulated result, the longer each later call.
- One document per request with the output schema returned `structuredOutput` on every call.
- With the result linked to the triggering step row, every node of the fold opens in the Copilot Studio
  editor without errors.

## Verify

1. `python scripts/check_workflow.py <workflow.json>` expects `OK`.
2. Initialise `result` and `files_done` at the top level; the checker rejects
   initialisation inside branches and loops.
3. After a run, read the loop repetitions (`.../actions/<loop>/scopeRepetitions`): one per
   document, all `Succeeded`, started one after the other.
4. Read the stored result: `documents` has one entry per document, in list order, and the
   summary agrees with the findings.
