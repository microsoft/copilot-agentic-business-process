# Pattern: extract structured data from a document (Extract node)

Sample built in the Copilot Studio workflow designer and run on two real documents (read it next to
this page):

| File | Shows |
| --- | --- |
| [workflow-extract.json](./workflow-extract.json) | an **HTTP trigger** that receives two files (an image and a PDF as base64), **two Extract nodes** that run in parallel with the same structured output schema, and a Compose that shows both results |

The schema is a purchase order: supplier, buyer, order heading, line items, additional information
and a confidence value. Replace it with your own fields.

## When to use the Extract node

The Extract node is the **document extraction capability** of workflows. It processes a document
(documented file types: PDF, Word, Excel, PowerPoint; the sample also ran on an image) and returns
the values and tables you define, as dynamic content for later steps. It is a specialised
experience built on the agent-node foundation, so it runs as the same agent action; it does not
replace the agent node.

| Situation | Use |
| --- | --- |
| Turn a document or text into a predictable structure (named fields, tables of repeating rows) before a later step creates a record, routes, notifies or decides | **Extract node** |
| The same extraction for several inputs of different formats (an image and a PDF) | **Extract node** per input, same schema, run in parallel |
| A long or multi-page document, or a file near the request size limit | Split into single pages, **Extract node** per page in a loop, aggregate the results ([Long, multi-page documents](#long-multi-page-documents)) |
| The task needs your own instructions, tools, knowledge, several steps, or reasoning beyond reading fields | **Agent node** (inline: [agents/inline-structured.json](../agents/inline-structured.json)) |
| The logic is reused by several workflows, or needs skills and knowledge files | **Published agent** ([agents/published-structured.json](../agents/published-structured.json)) |
| Choose among a few fixed labels | **Classify node** ([classify/](../classify/PATTERN.md)) |

What the Extract node gives you over an agent node: a document-focused configuration (suggest the
fields from a sample document, start from a template, or add fields manually), a **Test** pane
that runs the node on an uploaded document or the document of a previous run, a model choice (a
more capable model for long documents, complex tables or ambiguous values; a faster one for a
consistent format at high volume), and no prompt to maintain. What it does not have: its own
instructions, tools or knowledge. Per-field guidance goes in the **description of each property**
(formats, labels to look for, what to return when a value is absent).

## One node, one runtime action

| Designer | Runtime |
| --- | --- |
| node `type: "agentExtract"` (id `agentExtract-<guid>`) | action `OpenApiConnection` `InvokeDefinition` on the agent connection |

```json
"Extract_Image": {
  "type": "OpenApiConnection",
  "inputs": {
    "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_agentnode", "connectionName": "shared_agentnode", "operationId": "InvokeDefinition" },
    "parameters": {
      "body/definition": { "$kind": "BotDefinition", "entity": { "configuration": { "agentSettings": {
        "model": { "series": "<model>", "$kind": "ModelConfig" },
        "output": { "$kind": "StructuredAgentOutput", "schema": "<the JSON Schema as a string>" },
        "$kind": "AgentSettings" } } } },
      "body/message": "{document}",
      "body/files": [ { "name": "document", "content": "@triggerBody()?['imageFile']?['contentBytes']" } ]
    }
  },
  "metadata": { "description": "Extract Image", "nodeId": "agentExtract-<guid>" }
}
```

- `body/message` is the literal `{document}`; it points at the file named `document` in
  `body/files`.
- `body/files[0].content` is the value of the node's `config.input`: **base64 text** for a binary
  file (image, PDF), or the text itself for plain text. For a file downloaded from Dataverse
  (`GetEntityFileImageFieldContent`) use `@body('<download action>')?['$content']`, which is already base64.
- The editor accepts the input only as a **token or expression**: `config.inputRich` must hold a `token` segment
  with a `tokenRef` (as in the designer node below), not a static text segment (the editor reports "Document must
  be a token or expression"). The only proven token shape is a reference function (`body`, `outputs`,
  `triggerBody`, ...); put a conversion such as `base64(...)` in a Compose step first.
- The sample copies the complete `body/definition` object from the exported node; change the model
  and the `output.schema` string.

## Designer node

```json
{
  "id": "agentExtract-<guid>", "name": "Extract Image", "type": "agentExtract", "version": 1,
  "data": {
    "config": {
      "input": "@triggerBody()?['imageFile']?['contentBytes']",
      "outputMode": "structured-simple",
      "inlineModel": "<model>",
      "connectionName": "shared_agentnode",
      "simpleProperties": [ { "id": "<guid>", "name": "order_id", "type": "string", "required": false, "description": "…" } ],
      "jsonSchema": { "type": "object", "properties": { "order_id": { "type": "string", "description": "…" } } },
      "inputRich": { "segments": [ { "type": "token", "value": "@{triggerBody()?['imageFile']?['contentBytes']}",
        "tokenRef": { "type": "function", "stepId": "function", "stepName": "Reference", "outputName": "triggerBody",
                      "outputType": "object", "functionName": "triggerBody", "functionCategory": "reference",
                      "rawExpression": "triggerBody()?['imageFile']?['contentBytes']" } } ] }
    },
    "outcomes": [ { "id": "default", "label": "Default", "outcomeSchema": { "type": "object",
      "properties": { "structuredOutput": { "type": "object", "properties": { "…": {} }, "title": "" } }, "required": [ "structuredOutput" ] } } ]
  }
}
```

### Property types

| `simpleProperties[].type` | JSON Schema |
| --- | --- |
| `string` | `{ "type": "string" }` |
| `number` | `{ "type": "number" }`; use it for whole numbers too (say "whole number" in the description) |
| `list` | `{ "type": "array", "items": { "type": "object", "properties": { … } } }`; the item properties are in `listItems`, each with its own `type`, `required` and `description` |

`required: true` adds the property name to the `required` array of its object in `jsonSchema`.

## The same setting is stored in several places

Generate all copies from one structure (cloning rules in [SKILL.md](../../SKILL.md)).

| Setting | Copies that must agree |
| --- | --- |
| Input expression | runtime `body/files[0].content`, `config.input`, `config.inputRich` (`value` and `tokenRef.rawExpression`) |
| Output schema | runtime `output.schema` (a JSON string), `config.jsonSchema`, `config.simpleProperties`, `outcomes[0].outcomeSchema.properties.structuredOutput` |
| Model | runtime `agentSettings.model.series`, `config.inlineModel` |

`scripts/check_workflow.py` verifies the input, the schema and the property list for every Extract
node.

## Reading the result

| Need | Runtime expression |
| --- | --- |
| A field | `@body('Extract_Image')?['structuredOutput']?['order_id']` |
| A list's length | `@length(coalesce(body('Extract_Image')?['structuredOutput']?['line_items'], json('[]')))` |

Use `structuredOutput` followed by `?['<property>']` for each level. In the designer text of a
node that reads another node's output, the editor writes the **node id** in place of the action
name: `body('agentExtract-<guid>')`. The checker accepts both.

## HTTP trigger that receives files

```json
"triggers": { "manual": { "type": "Request", "kind": "Http",
  "inputs": { "method": "POST", "triggerAuthenticationType": "Tenant",
    "schema": { "type": "object", "required": [ "imageFile", "pdfFile" ], "properties": {
      "imageFile": { "type": "object", "properties": { "name": { "type": "string" }, "contentBytes": { "type": "string" } } },
      "pdfFile":   { "type": "object", "properties": { "name": { "type": "string" }, "contentBytes": { "type": "string" } } } } } } } }
```

- The designer start node: `config: { "triggerType": "http", "http": { "method": "POST", "schema": { … } } }`
  (the same schema as the runtime trigger).
- Caller body: `{ "imageFile": { "name": "…", "contentBytes": "<base64>" }, "pdfFile": { … } }`.
- Without a Response node the caller receives `202` and the results are in the run history; add a
  Response node (see [classify/](../classify/PATTERN.md)) to return them.
- A tenant-authenticated HTTP trigger is called on its callback URL with an OAuth bearer token.

## Parallel extractions

Two edges leave the start node, one to each Extract node, and the Compose lists both in its
`runAfter`:

```json
"Extraction_summary": { "type": "Compose",
  "inputs": { "image": "@body('Extract_Image')?['structuredOutput']", "pdf": "@body('Extract_PDF')?['structuredOutput']" },
  "runAfter": { "Extract_Image": [ "Succeeded" ], "Extract_PDF": [ "Succeeded" ] } }
```

Edges: `start → Extract Image`, `start → Extract PDF`, `Extract Image → Compose`,
`Extract PDF → Compose`. The Extract actions have no `runAfter`.

## Long, multi-page documents

**Status: design guidance. The sample runs single documents; the page loop below has not been built
or run.** The designer pieces it uses (Condition, loop, variable, scope) are covered by samples in
[control/](../control/condition.json), [loops/](../loops/PATTERN.md) and [scope/](../scope/PATTERN.md).

One Extract call per document is reliable while the request stays small (see Size below). A long
document works against that: the base64 request approaches the limit, a structured call on large
attachments can return an empty `structuredOutput`, and long tables are where extraction accuracy
drops. Process such documents **one page at a time** and combine the results.

```text
trigger ─► check the file ─┬─ small and short ─► Extract node (single call, as in the sample)
                           └─ large or long ───► split into single pages
                                                   └─► loop over the pages
                                                         ├─ Extract node (one page)
                                                         └─ append the page result to an array variable
                                                 ─► build the final JSON object ─► later steps
```

1. **Check the file** with a Condition before choosing a path:
   - size: the decoded size in bytes against your budget (base64 text length × 3 / 4), leaving room
     for the prompt;
   - page count: from the splitting step or a PDF-properties action;
   - a document over either limit takes the page path. Put the limits in environment variables so
     they can be changed without editing the workflow.
2. **Split into single pages.** The designer has no built-in PDF splitting node. Use an action
   that returns one file per page: the connector catalogue lists several PDF connectors with
   "split by page count" and "extract pages" actions, and a custom API or function also works.
   Choose by your licensing, data-residency and DLP rules. The step must produce an **array of
   page files** (`contentBytes` plus the page number). Images (a multi-image upload) are already
   one page per file.
3. **Loop over the pages** with an apply-to-each ([loops/](../loops/PATTERN.md)) whose collection is
   the page array. Inside it, the Extract node's input is the current page:
   `@items('<loop name>')?['contentBytes']`. Use the same schema for every page.
4. **Aggregate incrementally.** Initialise the variables once at the top level, before the loop:

   | Variable | Type | Filled by |
   | --- | --- | --- |
   | `page_results` | array | `appendToArray` of `{ "page": <number>, "result": body('<extract>')?['structuredOutput'] }` after each Extract |
   | `rows` (one per repeating table, for example line items) | array | an inner loop over the page's rows with `appendToArray` of each row |

   After the loop, a Compose builds the final object, for example
   `{ "page_count": length(variables('page_results')), "header": <header fields from the first page>, "rows": variables('rows'), "pages": variables('page_results') }`.
   Header fields (parties, order id, dates) normally appear on the first page; repeating rows are
   concatenated through the `rows` array. There is no array-flatten function, which is why rows are
   appended one by one rather than concatenated from the per-page arrays.
5. **Order.** Appends from parallel iterations are not in page order. Set the loop's `concurrency`
   to `1` when row order matters (documents whose tables continue across pages), or keep the page
   number in each appended item and let the consumer order by it. Use parallelism only for
   independent pages.
6. **Failures.** One failed page should not lose the others: wrap the Extract in a scope with a
   failure branch ([scope/](../scope/PATTERN.md)) that appends `{ "page": <number>, "error": <message> }`,
   and add the failed page numbers to the final object so a person can review them. For results
   that must survive a failed run, write one Dataverse row per page inside the loop instead of
   keeping everything in a variable.
7. **Cost and time.** Each page is one agent call: credits and run time grow with the page count.
   Extract only the pages that carry data when the document has known cover or terms pages.

Checks for such a workflow: `check_workflow.py` passes (variables initialised at the top level,
`items('<loop name>')` names the loop); a document under the limits still takes the single path; a
document over a limit returns a final object whose `page_count` equals the page count and whose
`rows` count equals the sum of the rows on every page.

## Size

Base64 makes a file about a third larger, and the agent request is limited to about 2 MB (see the
platform limits in [SKILL.md](../../SKILL.md)). The sample ran with a 160 KB image and a 755 KB PDF.

## Observed result

A one-page purchase order image and a one-page scanned order list in another language were sent
together. Both actions `Succeeded`, ran in parallel, and the Compose showed both complete
`structuredOutput` objects side by side (`image` and `pdf`):

| Document | `order_total` | `line_items` |
| --- | --- | --- |
| image | matches the page total | 6 (all lines) |
| PDF | matches the page total | 35 (all lines) |

Supplier, buyer, contacts and every line item (SKU, description, quantity, unit price, line total)
were returned in the structure of the schema.

A blank white image was sent to an Extract node with the same schema in a separate workflow. The action
`Succeeded` and returned a valid but empty `structuredOutput` (empty strings, `0`, empty arrays), not an
error. The platform therefore does not tell "no order on this page" from "an order"; check for the minimum
content a later step needs (for example at least one line item) in a condition after the node that also runs
after `Failed` and `TimedOut`, and fail the step when it is missing ([agents/](../agents/PATTERN.md#make-a-failed-call-a-failed-step)).

## Verify (a coding agent can run all of these)

1. `python scripts/check_workflow.py <workflow.json>` — expects `OK`, including the Extract checks
   above.
2. Read `inputs` of the Extract action in a run: `body/files[0].content` is a non-empty value
   before you judge the output.
3. Call the workflow with both files and read `structuredOutput` of each Extract action and the
   output of the Compose.
4. Open each Extract node in the editor and confirm there is no error.
