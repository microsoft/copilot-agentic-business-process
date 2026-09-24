/**
 * Facade over the option-set maps emitted into the generated models.
 *
 * Choice columns store integers; the labels live in the generated `{ 324010000: 'Approved' }`
 * maps. Resolving labels from these maps (rather than selecting the `*name` virtual columns)
 * keeps queries valid -- virtual columns cannot appear in an OData `$select`.
 */
import {
  Faf001_bptasksfaf001_outcome,
  Faf001_bptasksfaf001_status,
  Faf001_bptasksfaf001_tasktype,
} from '@/generated/models/Faf001_bptasksModel'
import {
  Faf001_bpinstancesfaf001_priority,
  Faf001_bpinstancesfaf001_status,
} from '@/generated/models/Faf001_bpinstancesModel'

export const TaskStatus = Faf001_bptasksfaf001_status
export const TaskType = Faf001_bptasksfaf001_tasktype
export const TaskOutcome = Faf001_bptasksfaf001_outcome
export const InstanceStatus = Faf001_bpinstancesfaf001_status
export const InstancePriority = Faf001_bpinstancesfaf001_priority

/** Looks up a choice label, falling back to the raw value so the UI never renders blank. */
export function labelOf(
  map: Record<number, string>,
  value: number | undefined | null,
): string {
  if (value === undefined || value === null) return '--'
  return map[value] ?? String(value)
}

/** Task statuses that still need someone to act. Mirrors `faf001_bptaskstatus`. */
export const OPEN_TASK_STATUSES = [
  324010000, // Not Started
  324010001, // Assigned
  324010002, // In Progress
  324010003, // Waiting
] as const

/** Terminal task statuses -- excluded from the work queue. */
export const CLOSED_TASK_STATUSES = [
  324010004, // Completed
  324010005, // Cancelled
  324010006, // Expired
] as const

/** The subset of `faf001_bptaskoutcome` a reviewer can pick in the app. */
export const TASK_OUTCOME = {
  approved: 324010000,
  rejected: 324010001,
  needsMoreInfo: 324010002,
} as const

export type TaskOutcomeValue = (typeof TASK_OUTCOME)[keyof typeof TASK_OUTCOME]

/** Machine-readable counterpart to `TASK_OUTCOME`, written to the `.decision` data value. */
export const TASK_DECISION: Record<TaskOutcomeValue, string> = {
  [TASK_OUTCOME.approved]: 'approved',
  [TASK_OUTCOME.rejected]: 'rejected',
  [TASK_OUTCOME.needsMoreInfo]: 'needs_info',
}

export const TASK_STATUS_COMPLETED = 324010004

/** `faf001_bpsteptype` -- the review step this app records is always a human one. */
export const STEP_TYPE_HUMAN_TASK = 324010001

/** `faf001_bpstepstatus`. `Failed` is reserved for genuine errors, paired with the error columns. */
export const STEP_STATUS = {
  waiting: 324010002,
  completed: 324010003,
} as const

/**
 * A rejection is still a completed review, so it does not mark the step failed. "Needs more info"
 * is the one outcome that leaves the step unfinished, because the process has to come back to it.
 */
export const STEP_STATUS_FOR_OUTCOME: Record<TaskOutcomeValue, number> = {
  [TASK_OUTCOME.approved]: STEP_STATUS.completed,
  [TASK_OUTCOME.rejected]: STEP_STATUS.completed,
  [TASK_OUTCOME.needsMoreInfo]: STEP_STATUS.waiting,
}

/** `faf001_bpdatatype` values, used when writing widget output rows. */
export const DATA_TYPE = {
  text: 324010000,
  number: 324010001,
  boolean: 324010002,
  dateTime: 324010003,
  json: 324010004,
  reference: 324010005,
} as const

/** Instance statuses that represent in-flight work. Mirrors `faf001_bpinstancestatus`. */
export const ACTIVE_INSTANCE_STATUSES = [
  324010000, // Not Started
  324010001, // Running
  324010002, // Waiting
  324010003, // Suspended
  324010007, // Compensating
] as const
