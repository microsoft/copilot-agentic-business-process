import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useIdentity } from '@/hooks/use-identity'
import { taskApi } from './task-api'
import { parseTaskAction, parseTaskList } from './task-api-contracts'

export type { TaskRow } from './task-api-contracts'

export function useMyTasks() {
  const { systemUserId } = useIdentity()
  return useQuery({
    queryKey: ['my-tasks', systemUserId],
    enabled: !!systemUserId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async ({ signal }) => {
      const result = await taskApi.invoke('faf001_GetTasks', {})
      signal.throwIfAborted()
      if (result.success === false) throw new Error(result.error?.message ?? 'Failed to load tasks')
      return parseTaskList(result.data)
    },
  })
}

export function useTaskAction() {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async ({ operation, taskId }: { operation: 'faf001_AssignTask' | 'faf001_StartTask'; taskId: string }) => {
      const result = await taskApi.invoke(operation, { faf001_TaskId: taskId })
      if (result.success === false) throw new Error(result.error?.message ?? 'Task action failed')
      return parseTaskAction(result.data, 'faf001_TaskId', taskId)
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task', variables.taskId] }),
        queryClient.invalidateQueries({ queryKey: ['task-preview', variables.taskId] }),
      ])
    },
  })
}
