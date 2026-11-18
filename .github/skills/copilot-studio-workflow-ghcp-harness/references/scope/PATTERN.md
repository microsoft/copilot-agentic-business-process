# Pattern: scopes and try / catch

Sample built in the Copilot Studio workflow designer and run in both modes (read it next to this page):

| File | Shows |
| --- | --- |
| [workflow-scope-try-catch.json](./workflow-scope-try-catch.json) | a top-level variable node, a **monitored scope** with two steps, a **success scope** (after `Succeeded`), a **failure scope** (after `Failed` or `TimedOut`) that records the error code and message, and a final step that runs after either branch |

The workflow has a manual trigger and no connectors. Check any workflow you generate against it
with `scripts/check_workflow.py`.

## Shape of a try / catch

```text
Initialize variables (top-level node)
        │
   Monitored scope ──[Succeeded]──────────► Success scope ──┐
   (the "try")     ──[Failed, TimedOut]───► Failure scope ──┴─► Show result [Succeeded, Skipped]
```

A scope is a container like a loop: children are nested in the runtime action and carry the scope
as `parentId` in the designer. The catch is an ordinary scope whose run-after lists the failure
statuses of the monitored scope. A failure of **any** child makes the monitored scope `Failed`,
which skips the success scope and runs the failure scope.

## Run-after has two copies that match

| Copy | Where | Keyed by |
| --- | --- | --- |
| Runtime | action `runAfter` | **action name** |
| Designer | node `data.settings.runAfter` | **node id** |

```json
"data": { "settings": { "runAfter": { "scope-<monitored id>": ["Failed", "TimedOut"] } } }
```

- The designer copy lists the same predecessors and statuses as the runtime copy, with node ids
  in place of action names. A node without `settings` has the default (`Succeeded`).
- List only predecessors outside the scope (the previous scope or step), never its own children.
- A step after both branches lists **each** branch with `["Succeeded", "Skipped"]`, because one
  branch is always skipped.

## Scope node

```json
{ "id": "scope-<guid>", "name": "Monitored Actions", "type": "scope",
  "width": 900, "height": 300,
  "data": { "config": { "description": "" }, "outcomes": [ { "id": "default", "label": "Default" } ] } }
```

```json
"Monitored_Actions": {
  "type": "Scope",
  "actions": { "<first child, no runAfter>": {}, "<next child>": { "runAfter": { "<first child>": ["Succeeded"] } } },
  "runAfter": { "<previous action>": ["Succeeded"] },
  "metadata": { "description": "Monitored Actions", "nodeId": "scope-<guid>" }
}
```

Edges:

| Edge | `source` → `target` | Handles |
| --- | --- | --- |
| previous node → scope | previous → scope | `targetHandle: "external-input"` |
| scope → first child | scope → child | `sourceHandle: "internal-source"` |
| between children | child → child | none (the last child needs no edge back to the scope) |
| scope → next scope | scope → success scope, and same scope → failure scope | `sourceHandle: "external-output"`, `targetHandle: "external-input"` |
| scope → following step | scope → step | `sourceHandle: "external-output"` (one edge per scope) |

The edges to the success and failure scopes have the same form; the runtime `runAfter` and the
node's `settings.runAfter` decide which one runs.

## Variables

- Initialise variables in a **top-level variable node** before the scope.
- Record the outcome in each branch with a variable node in `set` mode (`SetVariable`), then read
  it after the scopes. `valueRich` repeats `value` for the designer when the value is plain text;
  a value that is an expression needs no `valueRich`.

## Reporting the error from the failure scope

Read the error straight from the monitored steps with `actions('<step>')`. `error` is empty for a
step that did not fail, so `coalesce` over the steps returns the error of the one that did.

| Step | Node / runtime type | Expression |
| --- | --- | --- |
| Keep the details | Compose | `@coalesce(actions('<step 1>')?['error'], actions('<step 2>')?['error'])` returns the error object (`code`, `message`), visible in the run history |
| Set the outcome | variable node, `set` mode | `@concat('failed: ', coalesce(actions('<step 1>')?['error']?['code'], actions('<step 2>')?['error']?['code']), ' - ', coalesce(actions('<step 1>')?['error']?['message'], actions('<step 2>')?['error']?['message']))` |

- List every child of the monitored scope in the `coalesce` calls. The result is the first error
  found, which is what you need when you only want the message and details.
- Put the expression in the step that uses it, so it does not depend on another step's output.
- Use functions already used in workflows built in the designer (`actions`, `coalesce`, `concat`,
  `if`, `variables`, `equals`); check each expression in the editor.

## Agent nodes inside a scope

An agent node that returns its own status in structured output (for example `succeeded`,
`errorDetails`) always completes from the workflow's point of view. To send an agent's failure to
the failure scope, let the action fail. To keep the agent's status instead, branch on
`structuredOutput.succeeded` in a condition after the scope. An inline agent with a connector
tool is in [agents/inline-connector-tool.json](../agents/inline-connector-tool.json).

## What was observed

Both paths of the sample were run:

| Path | Monitored scope | Success scope | Failure scope | Final step output |
| --- | --- | --- | --- | --- |
| No step fails | Succeeded | Succeeded | all children `Skipped` | `success` |
| A step fails | `Failed` (the failing step reports `code` and `message`) | `Skipped` | Succeeded | `failed: <code> - <error message>` |

## Verify (a coding agent can run all of these)

1. `python scripts/check_workflow.py <workflow.json>` — expects `OK`. It checks that the scope
   node has `type: "scope"`, children carry it as `parentId`, every variable that is set,
   incremented, appended or read is initialised at the top level, every action is mapped, and
   each node's `settings.runAfter` equals the runtime `runAfter` (with node ids for action names).
2. The failure scope's run-after names the monitored scope with `Failed` and `TimedOut`; the
   success scope's names it with `Succeeded`.
3. Run it and read per-action status. The branch that did not apply shows `Skipped`, and the
   final step runs on either path.
