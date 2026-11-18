# AGENTS.md — Order Processing (reference implementation)

Purchase orders arrive by email, agents extract and validate them, two human gates
approve, and a final agent emits an SAP-ready payload. Business-level description:
[README.md](README.md). Generic patterns: [business-processes/AGENTS.md](../AGENTS.md).
Use this file to **customize** Order Processing or to **find the exact component to copy**
for a new process.

## Process map

| # | Workflow (`solution/export/Workflows/`) | Trigger | Writes / does | Next trigger it creates |
| --- | --- | --- | --- | --- |
| 1 | `mail-order-intake` | New mail in shared mailbox `faf001_OrderMailboxAddress` (Office 365 Outlook) | Instance (`Order Processing Intake`, business key `from\|subject`), attachment + file; step `Order Intake Validation`; on invalid attachment: failed step, instance Failed, reply to sender | step `Order Extraction Step` created (status Not Started) |
| 2 | `extract-order-data` | `Order Extraction Step` **created** | Run-once guard on data value `extracted-order`; **Extract node** (`Extract_order_data`) on the latest attachment → data value `extracted-order` (JSON); no result or no order line → step and instance `Failed` (`ORDER_EXTRACTION_FAILED`); else human step + task `Extracted Order Data Review`, widget `extracted-order-review-ui`, role **Order Reviewer**, team `Order Reviewers Global`; Teams notification | human step completed |
| 3 | `validate-order` | `Extracted Order Data Review` human step **completed** | Reads `extracted-order-review.decision` / `.edited_order`; if not approved closes the instance; else run-once guard on `order-evaluation.result`, step `Order Evaluation`, published **Order Validation Agent** (`InvokeAgent`) → `order-evaluation.result`; no result → step and instance `Failed` (`ORDER_EVALUATION_FAILED`); else human step + task `Order Evaluation Review`, widget `order-evaluation-review-ui`, role **Order Approver**, team `Order Approvers Global`; Teams notification | human step completed |
| 4 | `finalize-order` | `Order Evaluation Review` human step **completed** | Reads `order-evaluation-review.decision`; reject → `Order Rejected` step, instance closed; approve → run-once guard on a SAP payload artifact, `Order Validated`, reads `extracted-order-review.edited_order`, `Generate SAP order payload`, **SAP File Integration Agent** (`sap-order-json`) → artifact `SAP_SalesOrder_<customer PO>.json`, instance Completed; no payload → step and instance `Failed` (`SAP_PAYLOAD_FAILED`) | — |

Data keys: `extracted-order`, `extracted-order-review.{decision,notes,edited_order}`,
`order-evaluation.result`, `order-evaluation-review.{decision,notes}`.

All four flows are generated designer JSON (see the
[workflow skill](../../.github/skills/copilot-studio-workflow-ghcp-harness/SKILL.md)): after a change, run
`check_workflow.py` on every changed flow. The stage tests are in
[solution/scripts/](solution/scripts/) (`test-extract-order-data.ps1`, `test-validate-order.ps1`,
`test-finalize-order.ps1`; see the README, "Testing a stage").

## Components

| Kind | Where | Notes |
| --- | --- | --- |
| Agents | `bots/faf001_ordervalidationagent/`, `bots/faf001_sapfileintegrationagent/` | Instructions (role and rules only) in `configuration.json` → `agentSettings.instructions`; model in `agentSettings.model`. The result shape is **not** in the instructions: it is the `body/outputSchema` of the flow's agent action |
| Skills | `botcomponents/faf001_<agent>.skill.<skill-name>_<suffix>/` | `botcomponent.xml` (name, description) + opaque `data` — do not edit `data` |
| Skill files | `botcomponents/faf001_<agent>.file.<file>_<suffix>/filedata/` | `botcomponent.xml` `<name>` is the path inside the skill (`./SKILL.md`, `./assets/catalog.json`, `./references/…`) and `<parentbotcomponentid>` names the owning skill. **Folder suffixes are random — find a skill's files by `parentbotcomponentid`, not by folder name.** |
| Extract node | `Workflows/extract-order-data-*.json` → `Extract_order_data` | Output properties and their descriptions (the extraction guidance, including translation to English) are one node setting stored in several places: runtime `output.schema`, designer `simpleProperties`, `jsonSchema`, outcome schema. Change them by regenerating the flow, not by hand |
| Roles | `Roles/Order Reviewer.xml`, `Roles/Order Approver.xml` | Resolved by name in flows and FetchXML — renaming requires updating flows, README, and the deploy skill (including its `references/DEPLOYMENT.md`) |
| Env var | `environmentvariabledefinitions/faf001_OrderMailboxAddress/` | Value supplied by deployment settings |
| Connection refs | `Other/Customizations.xml` | `faf001_sharedagentnode`, `faf001_sharedoffice365`, `faf001_sharedteams`; Dataverse reference comes from core |
| Widget | `core/codeapps/workflow-console/src/features/tasks/widgets/ExtractedOrderReviewWidget.tsx` (+ `src/lib/bp/order.ts`) | `order-evaluation-review-ui` reuses the generic `DataReviewWidget` |
| Activation | `solution/scripts/activate-flows.ps1` | Activates the four flows downstream-first; update its flow list if you add or rename a flow |
| Deployment | `.github/skills/deploy-order-processing/` (guide in `references/DEPLOYMENT.md`) | Keep in sync with the solution |

### Skill → knowledge file map

| Agent | Skill | Knowledge |
| --- | --- | --- |
| Order Validation | `validate-order-product-identity` | `./assets/catalog.json` |
| Order Validation | `validate-order-product-availability` | `./assets/inventory.json` |
| Order Validation | `evaluate-order-discounts-promotions` | `./assets/promotions.json` |
| SAP File Integration | `sap-order-json` (used by `finalize-order`) | `./references/sap-sales-order.schema.json` |
| SAP File Integration | `sap-order-excel` | `./references/sap-order-template.xlsx` |

## Common customizations

| Goal | Change | Keep in sync |
| --- | --- | --- |
| Use real catalog / stock / promotions | Replace `catalog.json`, `inventory.json`, `promotions.json` (keep the shape the `SKILL.md` describes) or change the skill to call a real system | README "Demo data and limits" |
| Change a validation rule | Edit the owning skill's `SKILL.md` | `validate-order` `body/outputSchema` and `DataReviewWidget` rendering if the result shape changes |
| Add a validation skill | Prefer creating it in Copilot Studio and syncing back (Option B close-out) — a skill is a type 9 component plus type 14 file components and a bundle reference | Agent instructions, `skill_results` enum in `validate-order` output schema, README agent table |
| Change extracted fields | Extract node properties (name, type, description) in `extract-order-data`, regenerated | `ExtractedOrderReviewWidget` / `src/lib/bp/order.ts`, `validate-order` prompt, `finalize-order` SAP agent prompt, README field list, `test-data/sample-extracted-order.json` |
| Change SAP mapping | `sap-sales-order.schema.json` and `sap-order-json` `SKILL.md` | `finalize-order` artifact naming if `PurchaseOrderByCustomer` changes |
| Post to a real ERP | Add an action after `Create_SAP_order_payload_artifact` in `finalize-order` with a new connection reference | Deploy skill (including its `DEPLOYMENT.md`), README |
| Rename a step | Every trigger filter that names it, README, monitoring expectations | — |

Keep the agent's design decision intact unless the user asks otherwise: the validation
`verdict` is `pass` only when product identity **and** availability pass; promotion
findings are reported but never block an order.

After any change under `solution/export/`: bump `Other/Solution.xml` version, repack
`solution/build/OrderProcessing_<ver>_unmanaged.zip` (one zip; delete the old one), and
update `.github/skills/deploy-order-processing/` if it names the version (see root
[AGENTS.md](../../AGENTS.md#changing-power-platform-solutions)).
