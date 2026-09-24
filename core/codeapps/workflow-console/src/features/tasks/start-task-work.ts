import { parseTaskAction } from './task-api-contracts.ts'

type InvokeAction = (
  operation: 'faf001_AssignTask' | 'faf001_StartTask',
  body: { faf001_TaskId: string },
) => Promise<{ success: boolean; data?: unknown; error?: { message?: string } }>

export async function startTaskWork(taskId: string, invoke: InvokeAction): Promise<void> {
  for (const operation of ['faf001_AssignTask', 'faf001_StartTask'] as const) {
    try {
      const result = await invoke(operation, { faf001_TaskId: taskId })
      if (!result.success) throw new Error(result.error?.message ?? 'The task operation failed.')
      parseTaskAction(result.data, 'faf001_TaskId', taskId)
    } catch (error) {
      if (operation === 'faf001_StartTask') {
        throw new Error(`Assignment succeeded, but starting work could not be confirmed. ${error instanceof Error ? error.message : 'Refresh the task and retry.'}`)
      }
      throw error
    }
  }
}