import { useMemo, useState } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import type { BpWidgetProps, WidgetOutputValue } from '@/features/tasks/widgets/registry'
import { DocumentPreviewCard } from '@/features/tasks/widgets/DocumentPreviewCard'
import { RawJsonWidget } from '@/features/tasks/widgets/RawJsonWidget'
import { useFirstPreviewable, useInstanceAttachments } from '@/features/tasks/useTaskAttachment'
import {
  emptyLineItem,
  formatMoney,
  lineItemTotal,
  lineItemsSum,
  toExtractedOrder,
  type AdditionalInfoEntry,
  type ContactEntry,
  type ExtractedOrder,
  type OrderLineItem,
} from '@/lib/bp/order'
import { TASK_OUTCOME, type TaskOutcomeValue } from '@/lib/bp/choices'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'

/** Review UI for `extracted-order-review-ui`: the agent's extraction, next to its source document. */
export function ExtractedOrderReviewWidget(props: BpWidgetProps) {
  const { task, inputData, parseError, readOnly, onSubmit, submitting } = props

  // Seeded once so a background refetch cannot discard edits in progress.
  const initialOrder = useMemo(() => toExtractedOrder(inputData), [inputData])
  const [order, setOrder] = useState<ExtractedOrder>(initialOrder)
  const [notes, setNotes] = useState('')

  const { data: attachments } = useInstanceAttachments(task._faf001_bpinstanceid_value)
  const attachment = useFirstPreviewable(attachments)

  const lineItems = order.line_items ?? []
  const computedTotal = lineItemsSum(lineItems)
  const declaredTotal = Number(order.order_total) || 0
  const totalsDiffer = lineItems.length > 0 && Math.abs(computedTotal - declaredTotal) > 0.01

  const setField = <K extends keyof ExtractedOrder>(key: K, value: ExtractedOrder[K]) =>
    setOrder((prev) => ({ ...prev, [key]: value }))

  const setLineItem = (index: number, patch: Partial<OrderLineItem>) =>
    setOrder((prev) => {
      const items = [...(prev.line_items ?? [])]
      const next = { ...items[index], ...patch }
      if ('quantity' in patch || 'unit_price' in patch) next.total_price = lineItemTotal(next)
      items[index] = next
      return { ...prev, line_items: items }
    })

  const addLineItem = () =>
    setOrder((prev) => {
      const items = prev.line_items ?? []
      return { ...prev, line_items: [...items, emptyLineItem(items.length + 1)] }
    })

  const removeLineItem = (index: number) =>
    setOrder((prev) => ({
      ...prev,
      line_items: (prev.line_items ?? []).filter((_, i) => i !== index),
    }))

  const submit = (outcome: TaskOutcomeValue) => {
    const values: WidgetOutputValue[] = [{ key: 'edited_order', type: 'json', value: order }]
    void onSubmit({ outcome, notes: notes.trim() || undefined, values })
  }

  if (parseError) return <RawJsonWidget {...props} />

  return (
    <div className="space-y-6">
      <DocumentPreviewCard attachment={attachment} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Order summary</CardTitle>
          <ConfidenceBadge value={order.extraction_confidence} />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Order number"
              value={order.order_id ?? ''}
              readOnly={readOnly}
              onChange={(v) => setField('order_id', v)}
            />
            <Field
              label="Order date"
              value={order.order_date}
              readOnly={readOnly}
              onChange={(v) => setField('order_date', v)}
            />
            <Field
              label="Currency"
              value={order.currency}
              readOnly={readOnly}
              onChange={(v) => setField('currency', v)}
            />
          </div>

          <Separator />

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-4">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Supplier
              </h4>
              <Field
                label="Name"
                value={order.supplier_name}
                readOnly={readOnly}
                onChange={(v) => setField('supplier_name', v)}
              />
              <Field
                label="Code"
                value={order.supplier_code}
                readOnly={readOnly}
                onChange={(v) => setField('supplier_code', v)}
              />
              <Field
                label="Address"
                value={order.supplier_address}
                readOnly={readOnly}
                onChange={(v) => setField('supplier_address', v)}
              />
              <ContactsEditor
                contacts={order.supplier_contacts ?? []}
                readOnly={readOnly}
                onChange={(v) => setField('supplier_contacts', v)}
              />
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Buyer
              </h4>
              <Field
                label="Name"
                value={order.buyer_name}
                readOnly={readOnly}
                onChange={(v) => setField('buyer_name', v)}
              />
              <Field
                label="Code"
                value={order.buyer_code}
                readOnly={readOnly}
                onChange={(v) => setField('buyer_code', v)}
              />
              <Field
                label="Address"
                value={order.buyer_address}
                readOnly={readOnly}
                onChange={(v) => setField('buyer_address', v)}
              />
              <Field
                label="Delivery address"
                value={order.delivery_address}
                readOnly={readOnly}
                onChange={(v) => setField('delivery_address', v)}
              />
              <ContactsEditor
                contacts={order.buyer_contacts ?? []}
                readOnly={readOnly}
                onChange={(v) => setField('buyer_contacts', v)}
              />
            </div>
          </div>

          {(!readOnly || !!order.additional_info?.length) && (
            <>
              <Separator />
              <AdditionalInfoEditor
                entries={order.additional_info ?? []}
                readOnly={readOnly}
                onChange={(v) => setField('additional_info', v)}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Line items ({lineItems.length})</CardTitle>
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={addLineItem}>
              <Plus className="size-4" /> Add line
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line items were extracted.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="min-w-28">SKU</TableHead>
                    <TableHead className="min-w-56">Description</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-24">UoM</TableHead>
                    <TableHead className="w-28">Unit price</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    {!readOnly && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-muted-foreground">{item.line_number}</TableCell>
                      <TableCell>
                        <CellInput
                          value={item.sku ?? ''}
                          readOnly={readOnly}
                          onChange={(v) => setLineItem(index, { sku: v })}
                        />
                      </TableCell>
                      <TableCell>
                        <CellInput
                          value={item.product_description ?? ''}
                          readOnly={readOnly}
                          onChange={(v) => setLineItem(index, { product_description: v })}
                        />
                      </TableCell>
                      <TableCell>
                        <CellInput
                          value={String(item.quantity ?? '')}
                          type="number"
                          readOnly={readOnly}
                          onChange={(v) => setLineItem(index, { quantity: Number(v) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <CellInput
                          value={item.unit_of_measure ?? ''}
                          readOnly={readOnly}
                          onChange={(v) => setLineItem(index, { unit_of_measure: v })}
                        />
                      </TableCell>
                      <TableCell>
                        <CellInput
                          value={String(item.unit_price ?? '')}
                          type="number"
                          readOnly={readOnly}
                          onChange={(v) => setLineItem(index, { unit_price: Number(v) || 0 })}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(item.total_price, order.currency)}
                      </TableCell>
                      {!readOnly && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove line ${item.line_number}`}
                            onClick={() => removeLineItem(index)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex gap-6">
              <span className="text-muted-foreground">Sum of lines</span>
              <span className="tabular-nums">{formatMoney(computedTotal, order.currency)}</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-muted-foreground">Order total</span>
              <div className="w-32">
                <CellInput
                  value={String(order.order_total ?? '')}
                  type="number"
                  readOnly={readOnly}
                  className="text-right"
                  onChange={(v) => setField('order_total', Number(v) || 0)}
                />
              </div>
            </div>
            {totalsDiffer && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                The order total does not match the sum of the lines.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reviewer notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            readOnly={readOnly}
            rows={3}
            placeholder="Anything the next step should know about this order..."
          />

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={submitting} onClick={() => submit(TASK_OUTCOME.approved)}>
                <CheckCircle2 className="size-4" />
                {submitting ? 'Submitting...' : 'Approve'}
              </Button>
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => submit(TASK_OUTCOME.rejected)}
              >
                Reject
              </Button>
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => submit(TASK_OUTCOME.needsMoreInfo)}
              >
                Needs more info
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ConfidenceBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return null
  const pct = Math.round(value * 100)
  const variant = value >= 0.9 ? 'default' : value >= 0.7 ? 'secondary' : 'destructive'
  return <Badge variant={variant}>{pct}% confidence</Badge>
}

function ContactsEditor({
  contacts,
  readOnly,
  onChange,
}: {
  contacts: ContactEntry[]
  readOnly: boolean
  onChange: (contacts: ContactEntry[]) => void
}) {
  if (readOnly && contacts.length === 0) return null

  const patch = (index: number, next: Partial<ContactEntry>) =>
    onChange(contacts.map((c, i) => (i === index ? { ...c, ...next } : c)))

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Contacts</Label>
      {contacts.map((contact, index) => (
        <div key={index} className="flex items-center gap-2">
          <CellInput
            value={contact.type ?? ''}
            readOnly={readOnly}
            className="w-24"
            onChange={(v) => patch(index, { type: v })}
          />
          <CellInput
            value={contact.value ?? ''}
            readOnly={readOnly}
            className="flex-1"
            onChange={(v) => patch(index, { value: v })}
          />
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove contact ${index + 1}`}
              onClick={() => onChange(contacts.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...contacts, { type: '', value: '' }])}
        >
          <Plus className="size-4" /> Add contact
        </Button>
      )}
    </div>
  )
}

function AdditionalInfoEditor({
  entries,
  readOnly,
  onChange,
}: {
  entries: AdditionalInfoEntry[]
  readOnly: boolean
  onChange: (entries: AdditionalInfoEntry[]) => void
}) {
  const patch = (index: number, next: Partial<AdditionalInfoEntry>) =>
    onChange(entries.map((e, i) => (i === index ? { ...e, ...next } : e)))

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Additional info
      </h4>
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">No additional info was extracted.</p>
      )}
      {entries.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <CellInput
            value={entry.key ?? ''}
            readOnly={readOnly}
            className="w-56"
            onChange={(v) => patch(index, { key: v })}
          />
          <CellInput
            value={entry.value ?? ''}
            readOnly={readOnly}
            className="flex-1"
            onChange={(v) => patch(index, { value: v })}
          />
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove additional info ${index + 1}`}
              onClick={() => onChange(entries.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...entries, { key: '', value: '' }])}
        >
          <Plus className="size-4" /> Add entry
        </Button>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  readOnly,
  onChange,
}: {
  label: string
  value?: string
  readOnly: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value ?? ''} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function CellInput({
  value,
  readOnly,
  onChange,
  type = 'text',
  className,
}: {
  value: string
  readOnly: boolean
  onChange: (value: string) => void
  type?: string
  className?: string
}) {
  return (
    <Input
      type={type}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 ${className ?? ''}`}
    />
  )
}
