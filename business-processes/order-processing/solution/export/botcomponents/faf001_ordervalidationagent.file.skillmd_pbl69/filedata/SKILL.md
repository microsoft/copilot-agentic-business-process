---
name: validate-order-product-availability
description: "Validate purchase order fulfillment against product stock reference data. Use after product identity resolution to check available quantities, aggregate repeated SKUs, detect shortages, and report blocked stock checks. Single warehouse, immediate fulfillment, no reservations, backorders, or partial fulfillment."
metadata:
  version: "1.0"
---

# Validate Order Product Availability

## Inputs And Reference Data

Read [inventory.json](./assets/inventory.json) for product stock quantities, reservations, warehouse details, snapshot time, and fulfillment policy.

## Procedure

1. Require unique line IDs and positive integer quantities in `EA`. Missing or invalid quantity/UOM is blocked. No conversions, negative quantities, fractional units, or implicit default units are allowed.
2. Use only identity-approved products. A line with unresolved SKU, conflicting barcode, or failed description has a blocked stock check; do not turn its apparent SKU into a trusted product.
3. Group all resolved lines by product ID and sum their requested quantities before comparing with stock. If any line in a group has invalid quantity/UOM, block the entire group rather than passing the valid subset.
4. If an unresolved line has a submitted SKU matching a resolved group, block that group because its total demand is uncertain. Other resolved groups may still be assessed, but the whole order cannot pass.
5. Match exactly one inventory record for each product and the configured warehouse. Missing records, duplicate records, mismatched units, negative stock, or reserved quantity above on-hand quantity are blocked reference-data failures, not zero-stock assumptions.
6. Compute `available_quantity = on_hand - reserved`; `shortage_quantity = max(0, requested_quantity - available_quantity)`. Do not subtract the same requested quantity repeatedly or allocate stock by line order.
7. If shortage is zero, pass the quantity check on every line in the group. Otherwise flag each affected line's quantity, explaining the aggregate request, available quantity, and group shortage. Do not claim that an individual line is allocated or partially fulfilled.
8. Retain the assessed quantities, affected lines, warehouse, snapshot time, and inventory records as evidence. Explain any blocked groups without inventing stock quantities.

A stock snapshot is not a reservation, current inventory, or a delivery-date promise. Evaluate the supplied snapshot only; claims about current availability require an explicit freshness policy and warehouse selection.

## Examples

- For a product with 20 on hand and 4 reserved, 16 are available. A request for 24 has a group shortage of 8.
- Two valid lines requesting 10 units each of that product require 20 total and flag a shortage of 4; they must not both pass against the same 16 units.
- A missing inventory record blocks the check. A valid record with zero available stock flags any positive request.

Do not reduce the order quantity, reserve stock, suggest a delivery guarantee, or reprice only the available portion. Pricing is independently evaluated on the original requested quantities.