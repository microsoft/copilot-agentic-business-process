# Pattern: loops, variables and parallel iterations

Samples built in the Copilot Studio workflow designer (read them next to this page):

| File | Shows |
| --- | --- |
| [workflow-loop-concurrency.json](./workflow-loop-concurrency.json) | variable node with 3 assignments, apply-to-each with **concurrency 5**, increment + append inside the loop, `Compose` after the loop |
| [workflow-loop-default.json](./workflow-loop-default.json) | the smallest loop: one variable node, apply-to-each **without** a concurrency setting, one increment, `Compose` |

Both use a manual trigger and no connectors, so every node here is a built-in node. Check any
workflow you generate against these with `scripts/check_workflow.py`.

## The four node types

| Designer node `type` | Runtime action type(s) | Notes |
| --- | --- | --- |
| `variable` | `InitializeVariable`, `IncrementVariable`, `AppendToArrayVariable` | one node, **one runtime action per assignment** |
| `loop` | `Foreach` | container node; children are nested inside the runtime action |
| `builtinFunction` (`operationId: Compose`) | `Compose` | node id `builtinFunction-<guid>` |
| `start` (`triggerType: manual`) | trigger `Request` / `kind: Button` | trigger node id `start` |

## Variable node

Designer (`data.config.assignments[]`), one entry per variable or operation:

```json
{ "id": "var-1-1", "variableName": "total", "mode": "initialize", "type": "integer", "value": "0" }
```

- Modes seen in the samples: `initialize`, `increment`, `appendToArray`. Types seen: `array`,
  `integer`. `value` is always a string in the designer (`"[1,2,3,4,5]"`, `"0"`, an expression).
- Runtime: one action per assignment, chained with `runAfter` in assignment order.
  - Action type from mode: `initialize` → `InitializeVariable` (`inputs.variables[0]` with
    `name`, capitalised `type` such as `Array` / `Integer`, and a **typed** `value`),
    `increment` → `IncrementVariable` (`inputs.name`, `inputs.value`),
    `appendToArray` → `AppendToArrayVariable` (`inputs.name`, `inputs.value`).
  - Naming: the first action is the node name with every non-alphanumeric character replaced by
    `_` (`Initialize numbers, total` → `Initialize_numbers__total`); the following actions add a
    suffix: `_Init_<variable>` for initialize, `_AppendArr_<variable>` for append.
- **Only the first action of the node carries `metadata` (`nodeId`, `description`).** The
  following actions have no `metadata`; they exist only in `nodeActionMapping`, listed in order
  after the first:

  ```json
  "node-1": ["Initialize_numbers__total__processing_log",
             "Initialize_numbers__total__processing_log_Init_total",
             "Initialize_numbers__total__processing_log_Init_processing_log"]
  ```

- Initialise every variable once, at the **top level**, before the loop. Variables cannot be
  initialised inside loops, branches or scopes (platform rule; the checker enforces it).
- Reference a variable as `variables('<name>')`.

## Loop node

Designer node (a container, so it has a size and its children point to it with `parentId`):

```json
{ "id": "node-2", "name": "ForEach_number", "type": "loop",
  "data": { "config": { "loopType": "foreach", "foreach": "@variables('numbers')", "concurrency": 5 } },
  "width": 500, "height": 300 }
```

Child nodes: `"parentId": "node-2"`, positions relative to the container.

Runtime action:

```json
"ForEach_number": {
  "type": "Foreach",
  "foreach": "@coalesce(variables('numbers'), json('[]'))",
  "actions": { "...children, first child without runAfter...": {} },
  "runtimeConfiguration": { "concurrency": { "repetitions": 5 } },
  "metadata": { "description": "ForEach_number", "nodeId": "node-2" },
  "runAfter": { "<previous action>": ["Succeeded"] }
}
```

| Setting | Designer | Runtime |
| --- | --- | --- |
| Collection | `config.foreach` = `@<expr>` | `foreach` = `@coalesce(<expr>, json('[]'))` (empty array instead of a null failure) |
| Parallelism | `config.concurrency` (number) | `runtimeConfiguration.concurrency.repetitions` (same number) |
| Current element | — | `items('<loop action name>')`; the name is the node name, e.g. `items('ForEach_number')` |

Omit `concurrency` and `runtimeConfiguration` in **both** places for the default.

Edges of a loop (five, with handles). `node-2` is the loop, `node-3` its only child:

| Edge | `source` → `target` | Handle |
| --- | --- | --- |
| into the loop | previous node → `node-2` | `targetHandle: "external-input"` |
| loop to first child | `node-2` → `node-3` | `sourceHandle: "internal-source"` |
| (between children: plain edge) | `node-3` → `node-4` | none |
| last child back to the loop | last child → `node-2` | `targetHandle: "internal-target"` |
| out of the loop | `node-2` → next node | `sourceHandle: "external-output"` |

Edge ids follow `edge-<source>-<target>` with the handle name inserted where one is used.

## Compose after the loop

Designer node `type: builtinFunction`, `config.operationId: "Compose"`, `config.parameters.inputs`
= the expression, plus `displayName`, `description`, `category`, `iconUri`, `brandColor`
(copy them from the sample). Runtime: `{ "type": "Compose", "inputs": "<expression>", "runAfter": {...}, "metadata": {...} }`;
the action name is the node name with spaces replaced by `_`.

## Parallel iterations: what was observed

Observed when running the two samples:

- `workflow-loop-concurrency.json` (concurrency 5): all five iterations started in the same
  second, and the appended log came out of input order (`3,1,4,2,5`) while the final total was
  correct (15). So the iterations ran in parallel, `increment` was safe under parallelism, and
  `append` order is **not** the input order.
- `workflow-loop-default.json` (no concurrency setting): result 19 = (1+1)+(5+1)+(10+1). Whether
  an unset concurrency runs in parallel was **not** established by the run; set `concurrency`
  explicitly when order or parallelism matters (`1` = sequential).
Guidance that follows:

- Use `increment` / `appendToArray`, never a plain set, for variables shared by parallel
  iterations (documented platform guidance for loops with concurrency; not tested here).
- If the order of results matters, carry the index or key in each appended item and sort after
  the loop, or run with concurrency 1.
- For work that must be kept per item (for example a row per attachment), write it to the
  store inside the loop instead of accumulating it in a variable; rows are independent, so
  parallel iterations are safe.
- Respect the limits of what runs in the loop: an agent call per iteration multiplies cost and
  request size; see the platform limits in `SKILL.md`.

## Verify (a coding agent can run all of these)

1. `python scripts/check_workflow.py <workflow.json>` — expects `OK`. It checks that:
   - the loop's `foreach` and `concurrency` agree between designer and runtime;
   - every child node has the loop as `parentId`;
   - every `variables('x')` is initialised at the top level;
   - every node that expands to several actions maps all of them, in order.
2. The loop node name equals the runtime action name, and every `items('<name>')` uses it.
3. After a run, read the loop's repetitions (Flow API `.../runs/<id>/actions/<loop>/scopeRepetitions`)
   and compare start times: iterations that start together confirm parallelism.
