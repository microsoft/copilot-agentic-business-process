/**
 * Maps a task's `faf001_widgetid` to the React component that renders its review UI.
 *
 * The contract: `faf001_widgetid` names the widget, `faf001_inputdata` carries its JSON payload
 * (schema + initial values, up to 100k chars). Task *output* is not written back to the task row
 * -- it becomes `faf001_bpdatavalue` records keyed `<taskname>.<field>`.
 */
import type { ComponentType } from 'react'
import type { TaskRow } from '@/features/tasks/useMyTasks'
import type { TaskOutcomeValue } from '@/lib/bp/choices'
import { RawJsonWidget } from '@/features/tasks/widgets/RawJsonWidget'
import { ExtractedOrderReviewWidget } from '@/features/tasks/widgets/ExtractedOrderReviewWidget'
import { DataReviewWidget } from '@/features/tasks/widgets/DataReviewWidget'

/** One `faf001_bpdatavalue` row. `key` is suffixed onto the task's output prefix. */
export interface WidgetOutputValue {
  key: string
  type: 'text' | 'json' | 'number' | 'boolean' | 'datetime'
  value: unknown
}

export interface BpWidgetSubmission {
  outcome: TaskOutcomeValue
  notes?: string
  values?: WidgetOutputValue[]
}

export interface BpWidgetProps {
  task: TaskRow
  /** Parsed `faf001_inputdata`, or undefined when absent/unparseable. */
  inputData: unknown
  /** Raw `faf001_inputdata`, so a widget can show the original text on a parse failure. */
  rawInputData?: string
  parseError?: string
  readOnly: boolean
  /** Rejects if the write fails, so the widget can keep the reviewer's edits on screen. */
  onSubmit: (submission: BpWidgetSubmission) => Promise<void>
  submitting: boolean
}

export type BpWidget = ComponentType<BpWidgetProps>

const registry: Record<string, BpWidget> = {
  'extracted-order-review-ui': ExtractedOrderReviewWidget,
  // `DataReviewWidget` is schema-agnostic, so it is registered once per task that uses it. The
  // id -- not the component -- is what namespaces the task's output rows, so approval tasks
  // sharing this UI still write to distinct `faf001_bpdatavalue` keys.
  'data-review-ui': DataReviewWidget,
  'order-evaluation-review-ui': DataReviewWidget,
}

/** Falls back to the raw JSON viewer so an unknown widget id degrades instead of crashing. */
export function resolveWidget(widgetId?: string): { Widget: BpWidget; isFallback: boolean } {
  const match = widgetId ? registry[widgetId] : undefined
  return { Widget: match ?? RawJsonWidget, isFallback: !match }
}

/**
 * Namespace for this task's output rows. The widget id makes a stabler key than the task's
 * display name, so `extracted-order-review-ui` yields `extracted-order-review.edited_order`.
 */
export function outputPrefix(task: TaskRow): string {
  if (task.faf001_widgetid) return task.faf001_widgetid.replace(/-ui$/, '')
  return (task.faf001_taskname ?? 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseInputData(raw?: string): Pick<BpWidgetProps, 'inputData' | 'parseError'> {
  if (!raw) return { inputData: undefined }
  try {
    return { inputData: JSON.parse(raw) }
  } catch (error) {
    return {
      inputData: undefined,
      parseError: error instanceof Error ? error.message : 'Invalid JSON',
    }
  }
}
