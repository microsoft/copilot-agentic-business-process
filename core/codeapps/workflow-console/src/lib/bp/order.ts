/**
 * Shape of the `ExtractedOrder` object the extraction agent produces.
 *
 * Mirrors `scripts/extract-order-data/agent-schema.json`. The agent's structured output is
 * stringified straight into `faf001_bptask.faf001_inputdata`, so this is the parsed payload the
 * review widget receives -- there is no envelope around it.
 */

export interface ContactEntry {
  type: string
  value: string
}

export interface AdditionalInfoEntry {
  key: string
  value: string
}

export interface OrderLineItem {
  line_number: number
  sku: string
  product_description: string
  quantity: number
  unit_of_measure: string
  unit_price: number
  total_price: number
}

export interface ExtractedOrder {
  supplier_name?: string
  supplier_code?: string
  supplier_address?: string
  supplier_contacts?: ContactEntry[]
  buyer_name?: string
  buyer_code?: string
  buyer_address?: string
  delivery_address?: string
  buyer_contacts?: ContactEntry[]
  order_id?: string | null
  order_date?: string
  currency?: string
  order_total?: number
  line_items?: OrderLineItem[]
  additional_info?: AdditionalInfoEntry[]
  extraction_confidence?: number
}

/** Tolerates an `{ extracted_order: ... }` envelope in case a future producer adds one. */
export function toExtractedOrder(input: unknown): ExtractedOrder {
  if (!input || typeof input !== 'object') return {}
  const record = input as Record<string, unknown>
  const inner = record.extracted_order
  if (inner && typeof inner === 'object') return inner as ExtractedOrder
  return record as ExtractedOrder
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function lineItemTotal(item: Pick<OrderLineItem, 'quantity' | 'unit_price'>): number {
  return round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))
}

export function lineItemsSum(items: OrderLineItem[] | undefined): number {
  if (!items?.length) return 0
  return round2(items.reduce((acc, item) => acc + (Number(item.total_price) || 0), 0))
}

export function formatMoney(value: number | undefined | null, currency?: string): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '--'
  const amount = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${amount} ${currency}` : amount
}

export function emptyLineItem(lineNumber: number): OrderLineItem {
  return {
    line_number: lineNumber,
    sku: '',
    product_description: '',
    quantity: 0,
    unit_of_measure: '',
    unit_price: 0,
    total_price: 0,
  }
}
