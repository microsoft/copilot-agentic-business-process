# Pattern: data operations (Compose, Parse JSON, Filter, Select, Join)

Sample built in the Copilot Studio workflow designer and run end to end (read it next to this page):

| File | Shows |
| --- | --- |
| [workflow-data-operations.json](./workflow-data-operations.json) | a manual trigger and a chain of 7 data-operation nodes: **Compose** (build an array), **Parse JSON**, **Filter array**, **Select** (object projection), **Select** (flat array), **Join**, **Compose** (assemble the result) |

No connectors and no connection references: every node is a built-in node. Check any workflow
you generate against it with `scripts/check_workflow.py`.

## The operations

All of them are designer nodes of `type: "builtinFunction"` with a lower-case `operationId`
(`data.config.operationId` and `operationName` hold the same value). Each node produces one
runtime action named after the node (spaces become `_`).

| Operation | Designer `operationId` | Runtime action `type` | Parameters (designer `config.parameters` = runtime `inputs`) | Read the result with |
| --- | --- | --- | --- | --- |
| Compose | `compose` | `Compose` | `inputs`: any JSON value, an object or array literal, or an expression string | `outputs('<action>')` |
| Parse JSON | `parsejson` | `ParseJson` | `content` (expression), `schema` (JSON Schema) | `body('<action>')` |
| Filter array | `query` | `Query` | `from` (array expression), `where` (boolean expression using `item()`) | `body('<action>')` (array) |
| Select | `select` | `Select` | `from` (array expression), `select`: an object map `{ "Key": "@item()?['Field']" }` for an array of objects, or one expression string for a flat array | `body('<action>')` (array) |
| Join | `join` | `Join` | `from` (array of strings), `joinWith` (separator string) | `body('<action>')` (string) |

The same operation can appear several times in one workflow; each node has its own id and name.

## One node, one runtime action

Designer node:

```json
{
  "id": "builtinFunction-<guid>",
  "name": "Filter Active Records",
  "type": "builtinFunction",
  "version": 1,
  "position": { "x": 1300, "y": 200 },
  "data": {
    "config": {
      "operationId": "query",
      "operationName": "query",
      "parameters": { "from": "@body('Parse_Records')", "where": "@equals(item()?['Status'], 'Active')" },
      "displayName": "Filter Active Records",
      "description": "Keeps only the active records.",
      "category": "providers/Microsoft.ProcessSimple/operationGroups/DataOperation",
      "categoryDisplayName": "Data Operation",
      "iconUri": "<icon uri copied from the sample>",
      "brandColor": "#8C6CFF"
    },
    "outcomes": [ { "id": "default", "label": "Default", "outcomeSchema": { "type": "object", "description": "Function output" } } ]
  },
  "measured": { "width": 240, "height": 66 }
}
```

Runtime action (the same parameters, plus `runAfter` and `metadata`):

```json
"Filter_Active_Records": {
  "type": "Query",
  "inputs": { "from": "@body('Parse_Records')", "where": "@equals(item()?['Status'], 'Active')" },
  "runAfter": { "Parse_Records": [ "Succeeded" ] },
  "metadata": { "description": "Filter Active Records", "nodeId": "builtinFunction-<guid>" }
}
```

- `nodeActionMapping` maps the node id to `["Filter_Active_Records"]`.
- `config.parameters` and runtime `inputs` carry identical values; generate both from one data
  structure (see the cloning rules in [SKILL.md](../../SKILL.md)).
- The category, icon and colour keys are the same for every data-operation node; copy them from
  the sample.

## Edges

A chain of data operations uses plain edges with no handles:

```json
{ "id": "edge-<source id>-<target id>", "source": "<source id>", "target": "<target id>" }
```

The runtime `runAfter` of each action names the previous action with `["Succeeded"]`.

## Expressions inside the operations

| Where | Available | Example |
| --- | --- | --- |
| `where` of Filter | `item()` is the current element | `@equals(item()?['Status'], 'Active')` |
| `select` of Select | `item()` is the current element | `"Name": "@item()?['Name']"` or the whole value `@item()?['Name']` |
| any parameter | outputs of earlier actions | `@body('Filter_Active_Records')`, `@outputs('Compose_Sample_Records')` |
| Compose `inputs` | functions over earlier results | `@length(body('Filter_Active_Records'))` |

- Use `?['Field']` (safe navigation) when reading properties of `item()`.
- An array produced by Compose is passed to Parse JSON with `@outputs('<compose action>')`; the
  schema gives the following steps typed fields.
- A Select with an object map returns an array of objects; a Select with one expression returns an
  array of values, which is what Join expects.
- Reference every action by its runtime name (`Filter_Active_Records`), not the node display name.
- Compose can also be the last step: it assembles the result from several earlier outputs
  (object with a count, a joined string and an array).

## Observed result

The sample was run; every action `Succeeded` and the outputs were:

| Action | Output |
| --- | --- |
| Parse Records | array of 5 typed records |
| Filter Active Records | the 3 records with `Status = Active` |
| Select Record Summary | `[ { "RecordId": 101, "Name": "…", "Amount": 250 }, … ]` |
| Select Names | `[ "Name A", "Name C", "Name E" ]` |
| Join Names | `"Name A, Name C, Name E"` |
| Compose Final Summary | `{ "ActiveCount": 3, "NameList": "Name A, Name C, Name E", "RecordSummary": [ … ] }` |

## Other operations of the Data Operation group

The group also lists **Create CSV table** and **Create HTML table**. They are not in the sample
workflow, so no designer sample exists for them yet; add a sample node here once one is built in
the designer.

## Verify (a coding agent can run all of these)

1. `python scripts/check_workflow.py <workflow.json>` — expects `OK`: every action is mapped to a
   node, `nodeId` values match, edges and `runAfter` agree, and every `body('X')` / `outputs('X')`
   names an action that exists.
2. Each node's `config.parameters` equals the runtime `inputs` of its action.
3. Each `Select` feeding a `Join` produces a flat array (a single-expression `select`).
4. Run it and read the output of each action (`body` for the array and string results).
