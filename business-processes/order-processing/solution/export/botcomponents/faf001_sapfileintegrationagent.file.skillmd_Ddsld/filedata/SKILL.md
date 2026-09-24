---
name: sap-order-json
description: "Generate an SAP sales order as JSON from an unstructured source (email, PDF, order form, or free text). Use when asked to create, build, or map an SAP order / sales order payload in JSON."
argument-hint: "Paste the order source text and any known defaults (sales org, distribution channel, division, currency)."
user-invocable: true
---

# SAP Order JSON

Produce one SAP sales order JSON object from the supplied source.

## Procedure

1. Read `references/sap-sales-order.schema.json` — it is the sole authority for field names, types, lengths, and meaning. Never invent a field that is not in the schema.
2. Extract values from the source, apply the mapping rules, validate, and emit.
3. Output **only** the JSON object: no prose, no code fences, no comments.

## Mapping rules

- Header org fields (`SalesOrganization`, `DistributionChannel`, `OrganizationDivision`, `SalesOrderType`) come from user-supplied defaults; ask once if absent. Default `SalesOrderType` to `OR`.
- Customer / material numbers: strip spaces, uppercase; if purely numeric, left-pad with zeros to the schema `maxLength`.
- `PurchaseOrderByCustomer` = the customer's own PO / order / reference number from the source.
- `ShipToParty` = `SoldToParty` unless a distinct delivery address or recipient is stated.
- Dates: convert any format (incl. DD.MM.YYYY, "next Friday") to `YYYY-MM-DD`. `SalesOrderDate` defaults to today.
- Items: one entry per ordered line, numbered `000010`, `000020`, … in source order.
- Quantities are decimal strings with 3 decimals; amounts with 2 decimals; no thousands separators, `.` as decimal point.
- Units and currency map to their code (`pieces|pcs|ea` → `PC`, `kilos` → `KG`, `€|euros` → `EUR`).
- Omit optional fields you cannot source. Never guess a value or emit a placeholder.

## Validation rules

Before emitting, confirm:

- All `required` fields present; at least one item.
- Every `pattern` / `maxLength` / `format` in the schema satisfied; no additional properties.
- Every `RequestedQuantity` > 0.
- `TotalNetAmount` equals the sum of item `NetAmount` values; if item amounts are unknown, omit both.
- `RequestedDeliveryDate` >= `SalesOrderDate`.
- `TransactionCurrency` is a single currency for the whole order.

If a required field cannot be sourced, emit nothing and instead list the missing fields with the schema description of each.
