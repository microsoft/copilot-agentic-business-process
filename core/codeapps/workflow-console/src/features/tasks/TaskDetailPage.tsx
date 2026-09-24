import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertCircle, AlertTriangle, ArrowLeft, Play } from 'lucide-react'
import { taskApi } from '@/features/tasks/task-api'
import { parseTaskDetail } from '@/features/tasks/task-api-contracts'
import { useTaskAction } from '@/features/tasks/useMyTasks'
import { useIdentity } from '@/hooks/use-identity'
import { useRoleNames } from '@/features/tasks/useRoleNames'
import { submitTaskOutcome } from '@/features/tasks/submitTaskOutcome'
import {
  parseInputData,
  resolveWidget,
  type BpWidgetSubmission,
} from '@/features/tasks/widgets/registry'
import { TaskStatusBadge } from '@/components/status-badges'
import { DateCell, DueDate } from '@/components/date-cells'
import { CLOSED_TASK_STATUSES } from '@/lib/bp/choices'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'

/** Renders the task header and delegates the body -- and the decision -- to the widget registry. */
export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { systemUserId } = useIdentity()
  const startAction = useTaskAction()

  const { data: task, isPending, error } = useQuery({
    queryKey: ['task', taskId, systemUserId],
    enabled: !!taskId && !!systemUserId,
    staleTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async ({ signal }) => {
      const result = await taskApi.invoke('faf001_GetTask', { faf001_TaskId: taskId! })
      signal.throwIfAborted()
      if (result.success === false) {
        throw new Error((result.error as Error | undefined)?.message ?? 'Failed to load task')
      }
      return parseTaskDetail(result.data, taskId!, systemUserId)
    },
  })

  const submitMutation = useMutation({
    retry: false,
    mutationFn: (submission: BpWidgetSubmission) => {
      if (error || !task || task.faf001_status !== 324010002 || task.statecode !== 0) {
        throw new Error('Start this task before submitting work.')
      }
      return submitTaskOutcome(task, submission, systemUserId)
    },
    onSuccess: () => {
      toast.success('Response submitted.')
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      if (task?._faf001_bpinstanceid_value) {
        void queryClient.invalidateQueries({ queryKey: ['instance', task._faf001_bpinstanceid_value] })
        void queryClient.invalidateQueries({ queryKey: ['instance-details', task._faf001_bpinstanceid_value] })
      }
      void navigate('/tasks')
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to submit the response')
      void queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
    },
  })

  const { data: roleNames } = useRoleNames(
    task?._faf001_requiredrole_value ? [task._faf001_requiredrole_value] : [],
  )

  if (isPending) {
    return (
      <div className="px-6 py-8 space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="px-6 py-8">
        <Link to="/tasks" className="inline-flex items-center gap-1 mb-4 text-sm">
          <ArrowLeft className="size-4" /> Back to my tasks
        </Link>
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/50 p-4 text-sm">
          <AlertCircle className="size-4 mt-0.5 text-destructive" />
          <span>{error instanceof Error ? error.message : 'Task not found'}</span>
        </div>
      </div>
    )
  }

  const { Widget, isFallback } = resolveWidget(task.faf001_widgetid)
  const { inputData, parseError } = parseInputData(task.faf001_inputdata)
  const isClosed = task.statecode !== 0 || (CLOSED_TASK_STATUSES as readonly number[]).includes(task.faf001_status)
  const needsStart = !isClosed && task.faf001_status !== 324010002

  return (
    <div className="px-6 py-8 space-y-6">
      <Link
        to="/tasks"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to my tasks
      </Link>

      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">{task.faf001_taskname}</h1>
          <TaskStatusBadge value={task.faf001_status} />
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <Field label="Created">
            <DateCell value={task.createdon} includeTime />
          </Field>
          <Field label="Due">
            <DueDate value={task.faf001_duedate} />
          </Field>
          <Field label="Required role">
            {task._faf001_requiredrole_value
              ? roleNames?.get(task._faf001_requiredrole_value) ?? '...'
              : '--'}
          </Field>
        </dl>
      </div>

      <Separator />

      {needsStart && (
        <Button disabled={startAction.isPending} onClick={() => startAction.mutate({ operation: 'faf001_StartTask', taskId: task.faf001_bptaskid })}>
          <Play className="size-4" aria-hidden="true" /> Start work
        </Button>
      )}

      {!needsStart && isFallback && task.faf001_widgetid && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 p-3 text-sm">
          <AlertTriangle className="size-4 mt-0.5 text-amber-500" />
          <span>
            No widget is registered for <code className="font-mono">{task.faf001_widgetid}</code>.
            Showing the raw payload.
          </span>
        </div>
      )}

      {!needsStart && <Widget
        task={task}
        inputData={inputData}
        rawInputData={task.faf001_inputdata}
        parseError={parseError}
        readOnly={isClosed}
        submitting={submitMutation.isPending}
        onSubmit={(submission) => submitMutation.mutateAsync(submission).then(() => undefined)}
      />}

      {isClosed && (
        <p className="text-xs text-muted-foreground">
          This task is closed, so the review is read-only.
        </p>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
