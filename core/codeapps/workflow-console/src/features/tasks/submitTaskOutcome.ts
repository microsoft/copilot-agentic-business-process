import type { TaskRow } from './task-api-contracts'
import { isMyTask, parseTaskAction } from './task-api-contracts'
import { taskApi } from './task-api'
import type { BpWidgetSubmission } from '@/features/tasks/widgets/registry'

export async function submitTaskOutcome(task: TaskRow, submission: BpWidgetSubmission, caller: string): Promise<void> {
  if (!isMyTask(task, caller) || task.statecode !== 0 || task.faf001_status !== 324010002) {
    throw new Error('Only the assignee can submit an In Progress task.')
  }
  const result = await taskApi.invoke('faf001_CompleteTask', {
    faf001_TaskId: task.faf001_bptaskid,
    faf001_SubmissionJson: JSON.stringify(submission),
  })
  if (result.success === false) throw new Error(result.error?.message ?? 'Failed to complete task')
  parseTaskAction(result.data, 'faf001_StepId')
}
