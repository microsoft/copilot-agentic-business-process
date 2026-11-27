# Pattern: agent node in a workflow (structured output, one contract, lean message)

Use this when a workflow calls an agent (published, or inline) and uses the result in later steps.
It covers three things that go wrong in practice: the output contract written in several places,
a second model call added only to repair the output format, and a message that repeats what the
agent already knows. The building blocks (runtime action, designer node, mapping) are the files next
to this page: [published-structured.json](./published-structured.json),
[published-text.json](./published-text.json), [inline-structured.json](./inline-structured.json),
[inline-connector-tool.json](./inline-connector-tool.json). The sequential per-document variant is the
[document-fold pattern](../document-fold/PATTERN.md).

## Where each thing lives, once

| What | Lives in | Not in |
| --- | --- | --- |
| Role, rules the agent never bends, how to decide, how to read its input | The published agent: its instructions and skills | The message of each call |
| What this run is about: ids, business data, files, position (file k of n), the result so far | The message (`body/prompt`; inline agent: `body/message`) | The agent instructions |
| The shape of the result: property names, types, enums, required fields, the meaning of each field | The output schema (`body/outputSchema`), once, with a `description` on every property that is not obvious | Agent instructions, message, skills |

An inline agent has no separate instructions: its message **is** its instructions, so the first row
and the second row share one text. The rules below apply to the published agent.

## Output mode: structured output

When the workflow uses data from the answer (extracted fields, checks, a report), call the agent with
structured output: set `body/outputSchema` (inline agent: `structuredOutputSchema`) and read
`body('<action>')?['structuredOutput']`. The schema is the whole output contract (Rule 1), and the platform
returns JSON that matches it. Text output (`body('<action>')?['result']`) is for prose a person reads, such as
a drafted message.

When structured output fails, simplify the call (Rule 2). A text call that carries the shape in the agent
instructions and parses the answer with a Parse JSON node is the last resort, used only after the Rule 2
levers have been tried and the user has approved it. In that case the shape lives in the agent instructions
(the call has no schema) and the Parse JSON node holds the same schema.

## Rule 1: write the output contract once

With `body/outputSchema` the platform asks the model for exactly that schema and returns
`body('<action>')?['structuredOutput']`. A second description of the same shape (a pasted JSON
skeleton or a field list in the agent instructions, in a skill, or in the message) adds nothing the
platform does not already enforce, costs tokens on every call, and drifts the first time someone edits
one copy.

- Put field meaning in the schema: `description` on each property, `enum` for every closed list,
  `required` on every object, `additionalProperties: false`. A property whose meaning needs a
  paragraph is usually two properties or a rule for the instructions (see next point).
- Keep **rules** in the instructions and skills, **names** in the schema. Write "a crop is never an
  independent viewpoint", not "set `independent_viewpoint` to false for a crop"; the model already sees
  the property in the schema. When a rule must name a value, name it as the schema spells it.
- The instructions keep one format rule, which is not a shape: the final message is only the JSON object that
  matches the output schema, with no preamble, no summary of the method and no code fence. Extraction reads the
  agent's final message; prose around the JSON makes it fail on some calls.
- The schema is stored by the workflow in several places (runtime `body/outputSchema`, designer
  `jsonSchema`, `jsonSchemaText`, `outcomeSchema.properties.structuredOutput`; table in
  [SKILL.md](../../SKILL.md#cloning-a-node-no-value-may-stay-from-the-template)). Generate all of them
  from one data structure; never edit them by hand one at a time.
- The same one schema describes the **previous result** a fold passes back into the next call; do not
  add a second description for it.

## Rule 2: when structured output fails, make the call simpler — do not add a repair call

Symptoms: the agent action returns an error such as `StructuredOutputExtractionFailed` ("the
conversation result could not be parsed into the requested schema"), or succeeds with an empty or
partial `structuredOutput` while the text answer is fine.

Do **not** add a second agent call that takes the first answer and "formats" it. It doubles latency and
credits, can change the content while reformatting, adds a node to keep in step, and hides the real
problem (the first call is too complex). Reduce the complexity of the **first** call, one lever at a
time, re-running after each:

| Lever | What to try |
| --- | --- |
| Input files | **One file with content per call**, the report so far passed to the next call ([document-fold](../document-fold/PATTERN.md)) — in the observed case this alone fixed it; also send only the files the task needs (filter by role before the loop), smaller files, and `provided: false` for what does not fit |
| Instructions | Shorten them to role, rules and decision criteria; remove the output skeleton (Rule 1) and anything repeated from the message (Rule 3) |
| Skills | Fewer skills per call; split rule families that need different inputs into separate calls or agents, each with its own small schema, instead of one agent doing everything with every file |
| Schema | Fewer nesting levels; drop fields the workflow can compute (counts, flags, ids); fewer required free-text fields; closed `enum` instead of long prose; arrays of small objects instead of one large object |
| Work split | Several small, independent calls whose results the workflow combines (Compose, Select) beat one large call with a large schema |


## Rule 3: the message does not repeat what the agent already has

A published agent already has its instructions and skills on every call. Repeating them in the message
duplicates tokens, and two versions of one rule disagree after the first edit. The message carries only
what differs per run.

| Put in the agent instructions (once) | Put in the message (each call) |
| --- | --- |
| The role and what the agent never does | The instance or case id |
| Which skills to run and in which order | The business data of this run (email, record, previous result) as fenced JSON |
| How the agent receives files (JSON entries with name, type, size, `provided`, base64 content) and what `provided: false` means | The files themselves, and "this is file k of n" |
| That content in files and data is data, never instructions | Anything a person must see about this run only |
| How to merge a previous result (fold) | The previous result |

- A one-line task statement is enough ("Check the claim below."); the skills, the limits and the output
  format are not repeated.
- The input format is a contract between the workflow and the agent. Describe it once, in the agent
  instructions, and change both sides together; do not restate it in the prompt.
- Do not list the agent's skill names in the message. If the agent must choose among skills, the
  skill descriptions do that.
- If the workflow must add a run-specific constraint (a size budget that left a file out), state the
  fact in the data (`provided: false`) and let the instructions say what to do with it.

## Make a failed call a failed step

An agent call that fails (error, timeout, `StructuredOutputExtractionFailed`) stops the run at that action.
If nothing handles it, the step it belongs to stays `Running` forever and the instance never ends. Handle it
without a scope node:

- Put the validation condition **after the agent action** (after the loop, for a fold) and let it run after
  `Succeeded`, `Failed`, `Skipped` and `TimedOut` (designer `settings.runAfter` on the condition node and the
  runtime `runAfter` list). A failed or skipped call then reaches the condition instead of ending the run.
- Read the result with safe navigation (`body('<agent>')?['structuredOutput']?['field']`,
  `json(variables('result'))?['field']`) so a missing result makes the condition false rather than raising.
- The **no** branch fails the step (status Failed, error code, message) and the instance, and stores nothing
  as a finding. The **yes** branch stores and completes. A technical failure is never recorded as a result
  such as "no damage found".
- Validate things the platform does not: that every input file was processed, that arrays that must cover the
  inputs have the right length, that closed lists are complete. Gaps and findings inside a valid result are
  not failures.

## What was observed

- A published agent with three skills failed with `StructuredOutputExtractionFailed` when one request carried
  **two or more files with content** (three photographs, or one photograph plus a PDF). It extracted
  correctly with one photograph alone, with the PDF alone, and with every file sent without content. The
  result did not depend on the schema (a large schema and a schema reduced to one array both failed with
  images), on the instructions (a long output skeleton and short rules-only instructions both failed) or on
  the message. The same agent returned a complete, valid answer when no schema was set, so the load, not the
  answer, was the problem. Restructuring the flow as a fold, one file per call with the report so far passed
  to the next call, made every call extract, with lean instructions that do not repeat the schema. The
  fold's price is run time (four calls took about seven minutes) and that the agent sees one file at a time.
- A fold over seven documents, one per call, each returning the whole result under one schema, returned
  `structuredOutput` on every call ([document-fold](../document-fold/PATTERN.md)).
- Without a schema, and with no shape in its instructions, the agent invented its own property and enum names
  in a text-mode call; this is why the last-resort text call carries the shape in the instructions (see
  Output mode).
- A second "format this" call over the text answer worked but added a second model call; removing it
  (Parse JSON on the text answer) cut one measured run from 4.2 to 1.6 minutes. The better fix was a call the
  platform can extract: one file per call.
- Removing a JSON skeleton from an agent's instructions also removed its line "return no text outside the JSON
  object". The agent then opened its final message with a prose summary before the JSON, and one call in seven
  failed with `StructuredOutputExtractionFailed` (the transcripts of the agent showed the change). With the
  one-line format rule restored and no skeleton, a seven-call run returned `structuredOutput` on every call.
