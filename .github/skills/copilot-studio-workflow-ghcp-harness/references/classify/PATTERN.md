# Pattern: classify (built-in classification node)

Sample built in the Copilot Studio workflow designer and run on four inputs, one per branch (read
it next to this page):

| File | Shows |
| --- | --- |
| [workflow-classify.json](./workflow-classify.json) | an HTTP trigger, a top-level variable node, a **classify node** with 3 categories plus the built-in `Other`, one `Set variable` step per branch, and a **Response** node reached from all four branches |

## When to use it, and when to use an inline agent

The classify node keeps its categories **inside the node**: names, descriptions and branches are
written at design time. Choose it by how the categories are managed.

| Situation | Use |
| --- | --- |
| A few categories (about 2 to 6), fixed, defined by the workflow author, one branch of steps per category | **Classify node** |
| Categories that come from data (a table, a policy file, a setting) or can change without editing the workflow | **Inline agent** with a structured output schema |
| Many categories, hierarchies, or several labels per input | **Inline agent** with a structured output schema |
| The decision needs more than a label (reasons, extracted fields, a confidence) | **Inline agent** with a structured output schema |
| Reusable logic with its own instructions, skills or knowledge | **Published agent** |

An inline agent receives the categories in its prompt at run time (for example built from a
list-rows result), returns an `enum`-constrained value in `structuredOutput`, and is routed with a
Condition or Switch you write yourself. See [agents/inline-structured.json](../agents/inline-structured.json).

## One node, two runtime actions

| Designer | Runtime |
| --- | --- |
| node `type: "classifyOnInlineAgent"` (id `classify-<guid>`) | action 1: `OpenApiConnection` `InvokeDefinition` on the agent connection, with a generated inline bot definition and the prompt |
| | action 2: a `Switch` named `<action 1>_Switch`, one case per category and a default |

`nodeActionMapping[<node id>]` lists both, agent action first. Only the first action carries
`metadata.nodeId`; the Switch has none. The actions inside the cases carry the `nodeId` of the
node that owns them.

## Designer node

```json
{
  "id": "classify-<guid>", "name": "Classify Text", "type": "classifyOnInlineAgent", "version": 1,
  "data": {
    "config": {
      "input": "@triggerBody()?['text']",
      "model": "GPT55Chat",
      "categories": [
        { "id": "<guid 1>", "name": "Positive", "description": "Happy, satisfied, or complimentary text" },
        { "id": "<guid 2>", "name": "Negative", "description": "Complaints, dissatisfied, or critical text" },
        { "id": "<guid 3>", "name": "Neutral",  "description": "Neither positive nor negative; factual or ambiguous text" }
      ],
      "examples": [],
      "connectionName": "shared_agentnode",
      "displayName": "Classify Text"
    },
    "outcomes": [
      { "id": "category:<guid 1>", "label": "Positive" },
      { "id": "category:<guid 2>", "label": "Negative" },
      { "id": "category:<guid 3>", "label": "Neutral" },
      { "id": "default-category", "label": "Other" }
    ]
  }
}
```

- `Other` is always present as the `default-category` outcome; it receives every input that fits
  no category. Give it a branch.
- Use the `connectionName` key (`shared_agentnode`) and the connection reference of the agent
  connector already used by your solution; add it under `connectionReferences` of the graph and
  of the definition.

## Runtime actions

```json
"Classify_Text": {
  "type": "OpenApiConnection",
  "inputs": {
    "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_agentnode", "connectionName": "shared_agentnode", "operationId": "InvokeDefinition" },
    "parameters": {
      "body/definition": { "$kind": "BotDefinition", "entity": { "configuration": { "agentSettings": {
        "model": { "series": "GPT55Chat", "$kind": "ModelConfig" },
        "output": { "$kind": "StructuredAgentOutput",
                    "schema": "{\"type\":\"object\",\"properties\":{\"predictedCategory\":{\"type\":\"string\",\"enum\":[\"Positive\",\"Negative\",\"Neutral\",\"Other\"]}},\"required\":[\"predictedCategory\"]}" },
        "$kind": "AgentSettings" } } } },
      "body/message": "Classify the following input into one of these categories: Positive, Negative, Neutral, Other\n\nCategory definitions:\n- Positive: …\n- Negative: …\n- Neutral: …\n\nInput to classify: @{triggerBody()?['text']}\n\nRespond with only the category name. If the input does not clearly match any of the categories, respond with \"Other\"."
    }
  },
  "runAfter": { "Initialize_branch_result": [ "Succeeded" ] },
  "metadata": { "description": "Classify Text", "nodeId": "classify-<guid>" }
},
"Classify_Text_Switch": {
  "type": "Switch",
  "expression": "@outputs('Classify_Text')?['body']?['structuredOutput']?['predictedCategory']",
  "cases": { "Positive": { "case": "Positive", "actions": { "<steps of this branch>": {} } }, "Negative": { "case": "Negative", "actions": {} }, "Neutral": { "case": "Neutral", "actions": {} } },
  "default": { "actions": { "<steps of the Other branch>": {} } },
  "runAfter": { "Classify_Text": [ "Succeeded" ] }
}
```

(The sample has the complete bot definition; copy it and change only the values listed below.)

## The category list is stored in several places

Generate all of them from one list of categories (cloning rules in [SKILL.md](../../SKILL.md)).

| Setting | Copies that must agree |
| --- | --- |
| Category names | `config.categories[].name`, outcome `label`, prompt text, output schema `enum`, Switch `cases` keys and each `case` value |
| Category descriptions | `config.categories[].description`, the definitions in the prompt |
| Category id | `config.categories[].id`, outcome id `category:<id>`, edge `sourceHandle` `category:<id>` |
| `Other` | outcome `default-category`, last value of the schema `enum`, the Switch `default` |
| Model | `config.model`, `agentSettings.model.series` |
| Input | `config.input` (expression), `@{…}` in the prompt after `Input to classify:` |

`scripts/check_workflow.py` verifies these for every classify node.

## Edges

| Edge | Form |
| --- | --- |
| previous node → classify | plain: `{ "source": "<previous>", "target": "classify-<guid>" }` |
| classify → branch step | `"sourceHandle": "category:<id>"`, or `"default-category"` for `Other` |
| branch step → shared next node | plain; every branch has its own edge to the same target |

Edge id: `edge-<source>-<handle>-<target>` for handled edges, `edge-<source>-<target>` otherwise.

## Reading the result

| Need | Expression |
| --- | --- |
| The chosen category after the Switch | `@outputs('<agent action>')?['body']?['structuredOutput']?['predictedCategory']` |
| The branch's own result | a variable initialised before the classify node and set in each branch, read after it with `@variables('<name>')` |

Reference the **runtime action name** (`Classify_Text`), not the node display name.

## Response node

```json
{ "type": "builtinFunction", "data": { "config": { "operationId": "response",
  "parameters": { "statusCode": 200, "body": { "category": "@outputs('Classify_Text')?['body']?['structuredOutput']?['predictedCategory']", "message": "@variables('branch_result')" } },
  "category": "providers/Microsoft.ProcessSimple/operationGroups/Request", "categoryDisplayName": "Request" } } }
```

Runtime: `"type": "Response"`, `inputs.statusCode`, `inputs.body`, `runAfter` the Switch. The HTTP
trigger is `kind: "Http"` with `inputs.method`, `inputs.schema` and `triggerAuthenticationType`.

## Observed result

| Input | `predictedCategory` | Branch that ran |
| --- | --- | --- |
| clearly happy text | `Positive` | Positive |
| a complaint | `Negative` | Negative |
| a plain fact | `Neutral` | Neutral |
| meaningless text | `Other` | default |

In every run the other cases are `Skipped`, the Switch and the Response succeed, and each classify
call consumes one agent call (about 1.4 credits in the runs observed).

## Verify (a coding agent can run all of these)

1. `python scripts/check_workflow.py <workflow.json>` — expects `OK`. For each classify node it
   checks outcomes, edge handles, prompt, schema `enum`, Switch cases and default, plus the
   general contract rules.
2. Every category has a branch, and `Other` has one.
3. Run it once per category and once with an input that fits none; read the per-action status.
   A workflow with an HTTP trigger and tenant authentication is called on its callback URL with an
   OAuth bearer token.
