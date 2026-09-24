---
name: validate-order-product-identity
description: "Validate purchase order line SKU, barcode, and product description against reference catalog data. Use for product identity checks, unknown items, conflicting identifiers, description mismatches, and optional barcodes before stock or promotion checks."
metadata:
  version: "1.0"
---

# Validate Order Product Identity

## Inputs And Reference Data

Read [catalog.json](./assets/catalog.json) for product SKUs, barcodes, descriptions, aliases, and units of measure.

## Procedure

1. Require a nonempty line list, unique line IDs, and nonempty string SKU and description. A missing required input is blocked, not proof of a product violation. Do not invent missing values.
2. Treat SKU and barcode as strings. Trim surrounding whitespace only. Do not remove leading zeros, punctuation, or change identifier case. A numeric identifier must be corrected upstream, not guessed back into a string.
3. Resolve SKU by exact match to one catalog record. Unknown SKU is a violation; duplicate reference matches are blocked due to ambiguous reference data.
4. If a barcode is present and nonempty, resolve it independently. Require exactly one match and the same product ID as the SKU. Unknown or conflicting barcode is a violation. An omitted optional barcode yields a `not_applicable` finding; omitted mandatory barcode is blocked. Empty or malformed supplied barcode is blocked.
5. Compare description to that record's description and aliases after trimming, collapsing whitespace, and case folding. For complete descriptions, require a match. When the order or reference description is marked or visibly clipped (for example, an ellipsis, a cut-off word, or `description_clipped` metadata), accept a meaningful matching fragment without requiring a listed alias, provided SKU and any supplied barcode agree. Ignore clipping markers and allow a partial word at the clipped edge; do not discard other visible text. The fragment must identify product-specific details, not just a brand or generic product type. Missing text alone is not a mismatch, but conflicting visible fragrance, variant, size, or pack details are violations. If too little text remains to assess, mark the description check as blocked. Do not infer omitted text or use fuzzy similarity to excuse conflicting text. Explain when a pass is based on a clipped partial match.
6. If `uom` is supplied, require the catalog's exact unit (`EA`); no pack conversions are configured. Missing UOM blocks availability, but does not prevent identifying the product.
7. Approve a product identity for downstream stock and promotion checks only when its SKU, supplied barcode, and description all pass. Retain the matched catalog record and product identity as evidence. Never silently repair the order or approve a failed or blocked identity. Do not perform stock or price checks here.

## Examples And Boundaries

- `L419010000` with `690251033751` and the listed candle description passes against the provided catalog.
- The same SKU with `690251009480` flags the barcode and produces no resolved identity.
- `PG52010000` with its listed abbreviated description and no barcode can pass. A barcode must not be fabricated for this Swiss order.
- `L10H010000` with `690251009480` and `JM Pomegranate Noir Home Cand...` passes as a clipped partial match even if that fragment is not a listed alias.
- The same identifiers with `JM Pomegranate Noir Body Mist...` flag the description: clipping does not excuse a conflicting product type.
- `JM...` alone is too generic to assess and blocks the description check, even with valid identifiers.
- A correct SKU with a different fragrance description flags the description even if its barcode matches.
- Maintain the same evidence and matching rules when changing reference sources. Order-derived aliases require review before being accepted as independently verified reference data.