---
name: sap-order-excel
description: "Render an SAP sales order JSON payload into the fixed Excel workbook template. Use when asked to export, convert, or write an SAP order to Excel or xlsx."
metadata:
  version: "1.0"
---

# SAP Order Excel

Render one SAP sales order JSON object into the fixed workbook template.

## Input

A single SAP sales order JSON object

## Procedure

1. Copy `./references/sap-order-template.xlsx` to the output path.
2. Write values into the mapped cells below.
3. Save as `SAP_SalesOrder_<PurchaseOrderByCustomer>.xlsx`.

**Never create a workbook from scratch, and never restyle one.** The template is the only source of sheet names, columns, styles, widths, and number formats. If it is missing, stop and say so — do not improvise a layout.

## Hard rules

- Do not add, remove, rename, or reorder sheets, columns, or rows.
- Do not set fonts, fills, borders, widths, or number formats. The template already carries them on every cell you will touch, including the empty ones.
- Do not write outside the mapped cells.

## Order Header — value in column B, optional note in column C

| Cell | Field | Cell | Field |
| --- | --- | --- | --- |
| B5 | `SalesOrderType` | B14 | `CustomerPurchaseOrderDate` |
| B6 | `SalesOrganization` | B15 | `SalesOrderDate` |
| B7 | `DistributionChannel` | B17 | `TransactionCurrency` |
| B8 | `OrganizationDivision` | B18 | `TotalNetAmount` |
| B10 | `SoldToParty` | B19 | `CustomerPaymentTerms` |
| B11 | `ShipToParty` | B21 | `SalesOrderText` |
| B13 | `PurchaseOrderByCustomer` | | |

Column C note: `MISSING - <reason>` when a required field could not be sourced, `Default - not stated in source` when the value came from a default, otherwise leave blank.

## Order Items — one line per item, rows 2 to 31

Columns are fixed: A `SalesOrderItem`, B `Material`, C `SalesOrderItemText`, D `RequestedQuantity`, E `RequestedQuantityUnit`, F `UnitPrice`, G `NetAmount`, H `MaterialByCustomer`.

- `UnitPrice` is not a payload field — derive it as `NetAmount / RequestedQuantity` unless the source states it.
- Total is added as new row at the end of the item list. Use the style you find on row 12. Never use `SUM` formulas or compute totals yourself.**

## Source Reference — value in column B only

Column A holds a fixed attribute list. Fill the ones the source supports, leave the rest blank, and never add rows for attributes that are not listed.

## Cell types

- Quantities and amounts are **numbers**, not strings — `round(x, 3)` for quantities, `round(x, 2)` for money. Writing the payload's decimal strings here left-aligns them as text and breaks the totals.
- Dates, codes, and identifiers are **strings** in `YYYY-MM-DD` or their code form. Never write a date object; it re-renders per machine locale.
