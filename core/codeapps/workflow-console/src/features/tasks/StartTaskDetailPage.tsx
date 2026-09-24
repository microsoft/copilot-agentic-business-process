import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, LoaderCircle, Play, RefreshCw } from 'lucide-react'
import { useIdentity } from '@/hooks/use-identity'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DateCell, DueDate } from '@/components/date-cells'
import { InstanceStatusBadge, TaskStatusBadge } from '@/components/status-badges'
import { ACTIVE_INSTANCE_STATUSES, labelOf } from '@/lib/bp/choices'
import { Faf001_bptasksfaf001_tasktype as TaskType } from '@/generated/models/Faf001_bptasksModel'
import { InstanceStepTimeline } from '@/features/instances/InstanceStepTimeline'
import { ProcessResourceItem } from '@/features/instances/ProcessResourceItem'
import { ProcessTextContent } from '@/features/instances/ProcessTextContent'
import { useInstanceDetail } from '@/features/instances/useInstanceDetails'
import { taskApi } from './task-api'
import { isMyTask, parseTaskPreview } from './task-api-contracts'
import { startTaskWork } from './start-task-work'
import { useRoleNames } from './useRoleNames'
import { isTaskLinkId } from '@/hooks/context-deep-link'
import { taskPageError } from './task-page-error'

export default function StartTaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const { systemUserId } = useIdentity()
  const navigate = useNavigate()
  const client = useQueryClient()
  const validTaskId = isTaskLinkId(taskId)
  const query = useQuery({
    queryKey: ['task-preview', taskId, systemUserId],
    enabled: validTaskId && !!systemUserId,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async ({ signal }) => {
      const result = await taskApi.invoke('faf001_GetTask', { faf001_TaskId: taskId! })
      signal.throwIfAborted()
      if (!result.success) throw new Error(result.error?.message ?? 'Task details are unavailable.')
      return parseTaskPreview(result.data, taskId!, systemUserId)
    },
  })
  const start = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!query.data || query.error || query.data.statecode !== 0 || query.data.faf001_status > 324010003) {
        throw new Error('This task is no longer available. Refresh its details.')
      }
      await startTaskWork(query.data.faf001_bptaskid, taskApi.invoke)
    },
    onSuccess: () => { void navigate(`/tasks/${taskId}`) },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['my-tasks'] })
      void client.invalidateQueries({ queryKey: ['task', taskId] })
      void client.invalidateQueries({ queryKey: ['task-preview', taskId] })
    },
  })
  const task = query.error ? undefined : query.data
  const open = task && task.statecode === 0 && task.faf001_status <= 324010003
  const processQuery = useInstanceDetail(task?._faf001_bpinstanceid_value)
  const instance = processQuery.error ? undefined : processQuery.data?.instance
  const processPlaceholder = !task?._faf001_bpinstanceid_value ? '--' : processQuery.isPending ? 'Loading...' : processQuery.error ? 'Unavailable' : undefined
  const { data: roleNames } = useRoleNames(task?._faf001_requiredrole_value ? [task._faf001_requiredrole_value] : [])

  return <div className="min-w-0 space-y-7 px-4 py-6 sm:px-6 sm:py-8">
    <Link to="/tasks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to my tasks</Link>
    {!validTaskId ? <div role="alert" className="space-y-2 border-l-2 border-destructive pl-4"><h1 className="text-lg font-semibold">Invalid task link</h1><p className="text-sm">The shared link is missing a valid task ID. Ask the sender for a new link.</p></div>
      : query.isPending ? <div role="status" aria-label="Loading task details" className="space-y-4"><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="h-40 w-full" /></div>
      : !task ? <TaskError error={query.error} pending={query.isFetching} retry={() => void query.refetch()} />
        : <>
          <section aria-labelledby="assignment-task-title" className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2"><h1 id="assignment-task-title" className="text-2xl font-semibold [overflow-wrap:anywhere]">{task.faf001_taskname}</h1><TaskStatusBadge value={task.faf001_status} /></div>
              {open ? <Button className="min-w-36 shrink-0" disabled={start.isPending} onClick={() => start.mutate()}>
                {start.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />} {start.isPending ? 'Starting...' : 'Start Work'}
              </Button> : isMyTask(task, systemUserId) && <Button variant="outline" asChild><Link to={`/tasks/${taskId}`}>View task</Link></Button>}
            </div>
            {start.error && <TaskError error={start.error} pending={query.isFetching || start.isPending} retry={() => void query.refetch()} action />}
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Type">{labelOf(TaskType, task.faf001_tasktype)}</Field>
              <Field label="Assigned to">{isMyTask(task, systemUserId) ? 'You' : task.faf001_assignedtoname ?? task._faf001_assignedto_value ?? 'Unassigned'}</Field>
              <Field label="Team">{task.faf001_assignedteamname ?? task._faf001_assignedteam_value ?? '--'}</Field>
              <Field label="Required role">{task._faf001_requiredrole_value ? roleNames?.get(task._faf001_requiredrole_value) ?? '...' : '--'}</Field>
              <Field label="Created"><DateCell value={task.createdon} includeTime /></Field>
              <Field label="Due"><DueDate value={task.faf001_duedate} /></Field>
              <Field label="Task ID">{task.faf001_bptaskid}</Field>
              <Field label="Process started">{processPlaceholder ?? <DateCell value={instance?.faf001_starttime} includeTime />}</Field>
              <Field label="Process last updated">{processPlaceholder ?? <DateCell value={instance?.faf001_lastupdated} includeTime />}</Field>
              <Field label="Business key">{processPlaceholder ?? instance?.faf001_businesskey ?? '--'}</Field>
            </dl>
            {task.faf001_comments && <div className="text-sm"><h2 className="mb-1 font-medium">Comments</h2><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{task.faf001_comments}</p></div>}
            <div className="border-y py-3"><ProcessResourceItem key={task.faf001_bptaskid} summary={<span className="font-medium">Input data</span>}>
              {task.faf001_inputdata ? <ProcessTextContent text={task.faf001_inputdata} kind="json" name="task-input.json" /> : <p className="text-sm text-muted-foreground">No input data.</p>}
            </ProcessResourceItem></div>
          </section>
          <section aria-labelledby="assignment-history-title" className="min-w-0 space-y-4">
            <h2 id="assignment-history-title" className="text-lg font-semibold">Process history</h2>
            {task._faf001_bpinstanceid_value ? <ProcessHistory key={task._faf001_bpinstanceid_value} instanceId={task._faf001_bpinstanceid_value} query={processQuery} /> : <p className="text-sm text-muted-foreground">No process is linked to this task.</p>}
          </section>
        </>}
  </div>
}

function ProcessHistory({ instanceId, query }: { instanceId: string; query: ReturnType<typeof useInstanceDetail> }) {
  const [expanded, setExpanded] = useState(new Set<string>())
  if (query.isPending) return <Skeleton aria-label="Loading process history" className="h-40 w-full" />
  if (query.error) return <div role="alert" className="text-sm text-destructive">{query.error.message} <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry history</Button></div>
  const detail = query.data
  const active = (ACTIVE_INSTANCE_STATUSES as readonly number[]).includes(detail.instance.faf001_status ?? -1)
  return <>
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Link className="min-w-0 font-medium underline [overflow-wrap:anywhere]" to={`/instances/${instanceId}`}>{detail.instance.faf001_processname ?? 'View process'}</Link>
      <InstanceStatusBadge value={detail.instance.faf001_status} />
      <Button className="ml-auto" variant="ghost" size="icon" title="Refresh process history" aria-label="Refresh process history" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="size-4" /></Button>
    </div>
    <InstanceStepTimeline steps={detail.steps} artifacts={detail.artifacts} outputs={detail.outputs} active={active} expanded={expanded} toggle={id => setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })} />
  </>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 [overflow-wrap:anywhere]"><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1">{children}</dd></div>
}

function TaskError({ error, pending, retry, action = false }: { error: unknown; pending: boolean; retry: () => void; action?: boolean }) {
  const info = taskPageError(error)
  return <div role="alert" className="min-w-0 space-y-3 border-l-2 border-destructive pl-4 text-sm [overflow-wrap:anywhere]">
    <div className="flex items-center gap-2"><AlertCircle className="size-5 shrink-0 text-destructive" /><h2 className="text-lg font-semibold">{info.title}</h2></div>
    <p>{info.message}</p>
    {action && <p>The work form has not been opened. You can refresh the task details or retry Start Work.</p>}
    {info.detail && <details><summary className="cursor-pointer text-muted-foreground">Error details</summary><p className="mt-2 whitespace-pre-wrap">{info.detail}</p></details>}
    <Button variant="outline" size="sm" disabled={pending} onClick={retry}><RefreshCw className="size-4" />{pending ? 'Refreshing...' : 'Refresh task'}</Button>
  </div>
}