# Document fold: six scenario contracts

Each scenario is written as a **contract between the workflow and the agent** for the
[document fold](./PATTERN.md): which documents go in, what the agent returns, what the workflow checks after
the loop, and where the agent stops. The flow shape, the variables, the prompt and the validation are the
same in all of them; only the document roles, the rule families (one skill each), the result sections and
the validation counts change. Start from the [result skeleton](./PATTERN.md#result-skeleton-common-to-every-scenario)
and add the sections below.

All scenarios are fictional and tool-agnostic. The numbers are starting points, not rules: measure the
run time (`documents x ~100 s`) before promising a duration.

| # | Scenario | Anchor document (list it first) | Typical packet | Decision left to a person |
| --- | --- | --- | --- | --- |
| 1 | [Contract review](#1-contract-review) | master agreement | 3-10 documents | sign, negotiate, escalate |
| 2 | [Claim](#2-claim) | claim form or notification | 5-12 documents | cover, liability, settlement |
| 3 | [Order (three-way match)](#3-order-three-way-match) | purchase order | 3-5 documents | pay, reject, dispute |
| 4 | [Deal desk](#4-deal-desk) | order form | 4-8 documents | approve discount and terms |
| 5 | [Loan application](#5-loan-application) | application form | 6-12 documents | lend, decline, price |
| 6 | [Tax return pack](#6-tax-return-pack) | tax return | 4-15 documents | accept, amend, audit |

Rules that hold in every contract:

- The agent **extracts, compares and reports** with a source (document and location) for every value. It
  never approves, prices, accepts, rejects or advises. The decision is a human task or a later step.
- **Arithmetic and tolerances belong to the workflow.** The agent reports figures as extracted (value,
  currency, period, source); totals, ratios and "within 2 %" are computed after the loop from those figures.
- A gap, a conflict and a proposed hold are **findings** inside a valid result. Only an unusable result (wrong
  schema version, a document missing from the result, an agent failure) fails the step.
- A file left out of the request (`provided: false`) is `could_not_be_processed`, never "missing".
- One skill per rule family; the knowledge it needs (a playbook, a tolerance table, an approval matrix) is a
  file of that skill, not text in the flow.

---

## 1. Contract review

| Part | Contract |
| --- | --- |
| Case | A counterparty sends a master agreement with amendments and attachments for review before signature |
| Document roles | `master_agreement`, `amendment`, `order_form`, `data_processing_addendum`, `nda`, `signature_page`, `other` |
| Mandatory items | parties identified, effective date and term, executed signature page, governing law, liability cap, termination right |
| Skills (rule families) | `contract-completeness` (required parts, signatures), `clause-extraction` (clauses with wording and location), `playbook-comparison` (each clause against the company playbook, a knowledge file) |
| Cross-checks | `party_names`, `effective_dates`, `governing_law`, `liability_cap`, `amendment_precedence`, `signatory_authority` |
| Extra section | `clause_findings[]`: `clause` (enum: term, renewal, termination, liability_cap, indemnity, governing_law, data_protection, payment_terms), `value`, `playbook_status` (matches, deviates, not_found), `playbook_reference`, `document`, `location` |
| Order | master first, then amendments by effective date (a later amendment wins; keep both values with sources) |
| Validation after the loop | schema version; `documents` count equals the list count; `clause_findings` has one entry per clause in the enum |
| Findings, not failures | a deviation from the playbook, an unsigned page, a party mismatch, a proposed hold |
| Proposed hold when | unsigned or unreadable signature page, party name conflict, deviation on liability or governing law |
| Next | a legal review task with the clause findings as its input; the workflow routes by deviation count |
| Watch out | the agent quotes clauses; it does not say whether to sign. Amendments that renumber clauses make locations unreliable: record the heading as well as the number |

## 2. Claim

| Part | Contract |
| --- | --- |
| Case | A claim arrives with identity documents, a statement, evidence (photographs, receipts) and an estimate or invoice |
| Document roles | `claimant_id`, `claim_form`, `statement`, `statement_copy`, `evidence_photograph`, `estimate`, `policy_schedule`, `other` |
| Mandatory items | claim details present, claimant identity document, statement, evidence, estimate or invoice |
| Skills | `claim-completeness` (required items), `readability-check` (each file readable and relevant), `consistency-check` (identity, policy, asset, incident date across documents; the policy record is a knowledge file) |
| Cross-checks | `claimant_identity`, `identity_number`, `policy_identifier`, `asset_identifier`, `incident_date` |
| Extra section | `out_of_scope_indicators[]` (injury, liability dispute, suspected fraud, third-party recovery, other) with source |
| Order | the order stored; the mandatory items stay open until the last file |
| Validation after the loop | schema version; `documents` count equals the list count; every consistency check present |
| Findings, not failures | missing items, conflicting values, out-of-scope indicators, a proposed hold |
| Proposed hold when | a mandatory item is not met, a mandatory file is unreadable, a conflict exists, a file could not be processed, an out-of-scope indicator is present |
| Next | the next stage (for example a damage or evidence check) is created anyway; the hold is a proposal for the handler |
| Watch out | a value typed in the statement does not replace a required document; the agent never decides cover, liability or price. The packet in [workflow-fold-documents.json](./workflow-fold-documents.json) is this scenario |

## 3. Order (three-way match)

| Part | Contract |
| --- | --- |
| Case | A supplier invoice must match the purchase order and the delivery evidence before payment |
| Document roles | `purchase_order`, `order_confirmation`, `delivery_note`, `goods_receipt`, `invoice`, `other` |
| Mandatory items | purchase order, invoice, at least one of delivery note or goods receipt |
| Skills | `order-completeness`, `line-extraction` (lines with item, quantity, unit, unit price, currency), `match-check` (compare the same line across documents) |
| Cross-checks | `supplier`, `purchase_order_number`, `currency`, `line_items`, `delivery_date`, `invoice_total` |
| Extra section | `lines[]`: `line_key` (item code or description), `field` (quantity, unit_price, unit, description), `values[]` (value, document, location), `status` (match, mismatch, missing_in_document) |
| Order | purchase order first (it fixes the expected lines), then confirmation, delivery evidence, invoice |
| Validation after the loop | schema version; `documents` count equals the list count; at least one purchase order and one invoice in `documents` |
| Findings, not failures | a mismatching line, a missing delivery document, a currency conflict |
| Workflow after the loop | compute line totals and the tolerance (for example 2 % or a fixed amount) from the extracted values; route to auto-approve, approval task or dispute |
| Watch out | do not let the agent compute or accept tolerances; report each value as printed. Partial deliveries: several delivery notes sum against one purchase order line, so keep every value with its source |

## 4. Deal desk

| Part | Contract |
| --- | --- |
| Case | A sales deal is submitted with its paperwork for deal-desk review against pricing and terms policy |
| Document roles | `order_form`, `quote`, `term_sheet`, `mutual_nda`, `security_questionnaire`, `approval_record`, `pricing_exception_request`, `other` |
| Mandatory items | signed order form, quote, approval record when a discount applies, security questionnaire for deals above a size set in the workflow |
| Skills | `deal-completeness`, `commercial-terms-extraction` (customer, products, quantities, price, term, payment terms, discount), `approval-matrix-check` (discount and terms against the approval matrix, a knowledge file) |
| Cross-checks | `customer_legal_name`, `products_and_quantities`, `unit_price_vs_quote`, `term_length`, `payment_terms`, `discount_vs_approval` |
| Extra sections | `terms[]` (term enum, value, document, location); `approvals[]` (approver role, approved value, document, location); `deviations[]` (term, expected by policy, found, source) |
| Order | order form first; quote and term sheet next; approvals last, so each approval is compared with terms already recorded |
| Validation after the loop | schema version; `documents` count equals the list count; the order form is present in `documents` |
| Findings, not failures | a discount above the recorded approval, a term outside policy, a missing approval |
| Proposed hold when | the approval does not cover the discount, the customer name differs between documents, the order form is unsigned |
| Next | approval task for the deal desk with `deviations[]`; approved terms are written back by a person |
| Watch out | the approval matrix changes: keep its version in the result. An approval given for a different quantity or term does not cover the deal: compare values, not the existence of an approval |

## 5. Loan application

| Part | Contract |
| --- | --- |
| Case | A loan application arrives with identity, income and property documents before underwriting |
| Document roles | `application_form`, `id_document`, `proof_of_address`, `payslip`, `employment_letter`, `bank_statement`, `tax_return`, `property_valuation`, `other` |
| Mandatory items | application form, identity, proof of address, income evidence (for example the latest three payslips or an employment letter), bank statements for the period the policy names |
| Skills | `application-completeness` (required items and periods), `identity-and-address-check`, `income-and-obligation-extraction` (figures with period and source), `consistency-check` |
| Cross-checks | `applicant_name`, `date_of_birth`, `address`, `employer`, `income_stated_vs_evidenced`, `obligations_stated_vs_evidenced` |
| Extra section | `figures[]`: `name` (gross_monthly_income, net_monthly_income, monthly_obligations, requested_amount, property_value, deposit), `value`, `currency`, `period`, `document`, `location` |
| Order | application form first (it fixes the stated figures), then identity, income, bank statements, valuation |
| Validation after the loop | schema version; `documents` count equals the list count; the application form is present in `documents` |
| Findings, not failures | stated income different from evidenced income, missing period, an expired identity document |
| Workflow after the loop | compute ratios (debt to income, loan to value) and apply thresholds from the extracted `figures[]`; the decision is the underwriter's or the policy engine's |
| Proposed hold when | a mandatory document is missing or expired, name or address conflict, figures cannot be read |
| Watch out | the agent never recommends lending or declining and never reports personal characteristics the policy does not need for the decision. Several payslips of different months are separate figures with their own period; do not average them in the agent |

## 6. Tax return pack

| Part | Contract |
| --- | --- |
| Case | A tax return arrives with the documents that support its figures, for a preparer or reviewer |
| Document roles | `tax_return`, `income_statement`, `interest_statement`, `deduction_receipt`, `prior_year_return`, `authorization_form`, `identity_document`, `other` |
| Mandatory items | signed return, identity, an income statement for every declared income source, authorization when a representative files |
| Skills | `pack-completeness`, `figure-extraction` (declared values from the return, supporting values from each document), `reconciliation` (declared against supported values, comparing with the prior year for large changes) |
| Cross-checks | `taxpayer_name`, `taxpayer_identifier`, `tax_year`, `declared_income_vs_statements`, `declared_deductions_vs_receipts`, `filing_status` |
| Extra section | `reconciliation[]`: `line` (income_total, interest, deductions, credits), `declared` (value, document, location), `supporting[]` (value, document, location), `status` (supported, differs, unsupported) |
| Order | the return first: it records the declared figures, so each later document is compared with values already in the result |
| Validation after the loop | schema version; `documents` count equals the list count; the return is present in `documents` and `tax_year` is a single value |
| Findings, not failures | an unsupported deduction, a differing total, a tax year conflict between documents |
| Workflow after the loop | sum supporting values and compare with the declared total with the tolerance the process sets |
| Proposed hold when | the return is unsigned, an income source has no statement, the tax year differs between documents |
| Watch out | the agent does not compute tax, give advice or judge compliance. A pack with documents for several years needs the year on every entry so a later call does not mix them |

---

## Write your own contract

Fill in this table before you write the schema or the skills; it is the specification of the stage.

| Part | Decide |
| --- | --- |
| Case and trigger | what arrives, which step row starts the stage |
| Document roles | the closed list of roles an agent assigns to a file (an `enum`) |
| Mandatory items | the checklist ids, each tied to a role or a value |
| Skills | one per rule family, each with the knowledge file it reads |
| Cross-checks | the closed list of comparisons across documents |
| Extra sections | the figures, clauses or lines the workflow needs later, each with `document` and `location` |
| Order | which document anchors the rest; which wins when a later document supersedes an earlier one |
| Validation after the loop | counts and presence checks the platform does not enforce |
| Findings vs failures | which outcomes are findings (store and continue) and which fail the step |
| Proposed hold | the reasons, as a proposal for a person |
| Workflow after the loop | the arithmetic, thresholds and routing that must not be left to the agent |
| Run time | `documents x ~100 s`, against the time the process can afford |
