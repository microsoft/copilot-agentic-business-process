import { useState, type ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { BpWidgetProps } from '@/features/tasks/widgets/registry'
import { RawJsonWidget } from '@/features/tasks/widgets/RawJsonWidget'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

/**
 * Schema-agnostic review UI for approval tasks.
 *
 * Any task whose payload is "some JSON a human has to sign off on" can point at this widget
 * instead of shipping a bespoke one. It renders structure rather than a known shape: scalars
 * as a definition list, arrays of objects as tables, and nested objects as their own sections.
 * Nothing is editable -- the reviewer's contribution is the outcome and the notes.
 */
export function DataReviewWidget(props: BpWidgetProps) {
  const { inputData, parseError, readOnly, onSubmit, submitting } = props
  const [notes, setNotes] = useState('')

  const submit = (outcome: TaskOutcomeValue) =>
    void onSubmit({ outcome, notes: notes.trim() || undefined }).catch(() => undefined)

  if (parseError || inputData === undefined) return <RawJsonWidget {...props} />

  return (
    <div className="space-y-6">
      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="space-y-4">
          <ValueSection value={inputData} title="Data" />
        </TabsContent>
        <TabsContent value="raw">
          <RawJsonWidget {...props} />
        </TabsContent>
      </Tabs>

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
            placeholder="Why are you approving or rejecting this?"
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

type Json = unknown
type JsonObject = Record<string, Json>

function isObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `pricing_adjustments` -> `Pricing adjustments`. */
function humanize(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pass: 'default',
  approved: 'default',
  ok: 'default',
  flag: 'destructive',
  fail: 'destructive',
  rejected: 'destructive',
  blocked: 'secondary',
  pending: 'secondary',
}

function Scalar({ value }: { value: Json }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">--</span>
  }
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>
  if (typeof value === 'number') return <span className="tabular-nums">{value}</span>

  const text = String(value)
  const variant = STATUS_VARIANTS[text.toLowerCase()]
  if (variant) return <Badge variant={variant}>{text}</Badge>
  return <span className="whitespace-pre-wrap break-words">{text}</span>
}

/**
 * Renders an array of objects as a table. Columns are the union of the rows' keys in first-seen
 * order, so a row that omits an optional field still lines up with the others.
 */
function ObjectTable({ rows }: { rows: JsonObject[] }) {
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key)
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{humanize(column)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={column} className="align-top text-sm">
                  {isObject(row[column]) || Array.isArray(row[column]) ? (
                    <pre className="text-xs">{JSON.stringify(row[column])}</pre>
                  ) : (
                    <Scalar value={row[column]} />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ScalarList({ label, value }: { label: string; value: Json }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">
        <Scalar value={value} />
      </div>
    </div>
  )
}

/**
 * One card per object. Scalars are grouped into a grid at the top; arrays and nested objects
 * each become their own section so the reader never has to unpick a wall of JSON.
 */
function ValueSection({ value, title }: { value: Json; title: string }): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">None.</p>
          </CardContent>
        </Card>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {title} ({value.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {value.every(isObject) ? (
            <ObjectTable rows={value} />
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {value.map((entry, index) => (
                <li key={index}>
                  <Scalar value={entry} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!isObject(value)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ScalarList label={title} value={value} />
        </CardContent>
      </Card>
    )
  }

  const scalars = Object.entries(value).filter(([, v]) => !isObject(v) && !Array.isArray(v))
  const nested = Object.entries(value).filter(([, v]) => isObject(v) || Array.isArray(v))

  return (
    <>
      {scalars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scalars.map(([key, entry]) => (
                <ScalarList key={key} label={humanize(key)} value={entry} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {nested.map(([key, entry]) => (
        <ValueSection key={key} value={entry} title={humanize(key)} />
      ))}
    </>
  )
}
