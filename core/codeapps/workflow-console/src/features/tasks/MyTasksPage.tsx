import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, Inbox, Loader2, Play, UserPlus, Workflow } from 'lucide-react'
import { useMyTasks, useTaskAction, type TaskRow } from '@/features/tasks/useMyTasks'
import { isMyTask, taskAction } from '@/features/tasks/task-api-contracts'
import { useRoleNames } from '@/features/tasks/useRoleNames'
import { useInstanceNames } from '@/features/instances/useInstanceNames'
import { useIdentity } from '@/hooks/use-identity'
import { TaskStatusBadge } from '@/components/status-badges'
import { DateCell, DueDate } from '@/components/date-cells'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Scope = 'mine' | 'teams' | 'roles' | 'all'

export default function MyTasksPage() {
  const navigate = useNavigate()
  const { systemUserId, teams } = useIdentity()
  const { data: tasks, isPending, error } = useMyTasks()
  const action = useTaskAction()
  const [scope, setScope] = useState<Scope>('all')

  const teamNames = useMemo(
    () => new Map(teams.map((t) => [t.teamid, t.name])),
    [teams],
  )

  const instanceIds = useMemo(
    () => (tasks ?? []).map((t) => t._faf001_bpinstanceid_value).filter((id): id is string => !!id),
    [tasks],
  )
  const { data: instanceNames } = useInstanceNames(instanceIds)

  const roleIds = useMemo(
    () => (tasks ?? []).map((t) => t._faf001_requiredrole_value).filter((id): id is string => !!id),
    [tasks],
  )
  const { data: roleNames } = useRoleNames(roleIds)

  const visible = useMemo(() => {
    const rows = tasks ?? []
    if (scope === 'mine') return rows.filter((task) => isMyTask(task, systemUserId))
    if (scope === 'teams') return rows.filter((t) => !!t._faf001_assignedteam_value)
    if (scope === 'roles') return rows.filter((t) => !!t._faf001_requiredrole_value)
    return rows
  }, [tasks, scope, systemUserId])

  const assignmentLabel = (task: TaskRow) => {
    if (isMyTask(task, systemUserId)) return <Badge variant="default">Me</Badge>
    if (task._faf001_assignedto_value) return <Badge variant="secondary">Assigned</Badge>
    if (task._faf001_assignedteam_value) {
      return (
        <Badge variant="secondary">
          {teamNames.get(task._faf001_assignedteam_value) ?? 'Team'}
        </Badge>
      )
    }
    if (task._faf001_requiredrole_value) return <Badge variant="outline">By role</Badge>
    return <span className="text-muted-foreground">Unassigned</span>
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
      </div>

      <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <TabsList>
          <TabsTrigger value="all">All open</TabsTrigger>
          <TabsTrigger value="mine">Assigned to me</TabsTrigger>
          <TabsTrigger value="teams">My teams</TabsTrigger>
          <TabsTrigger value="roles">By role</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/50 p-4 text-sm">
          <AlertCircle className="size-4 mt-0.5 text-destructive" />
          <span>{error instanceof Error ? error.message : 'Failed to load tasks'}</span>
        </div>
      )}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? null : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Inbox className="size-8" />
          <p className="text-sm">Nothing waiting on you right now.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Required role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((task) => (
                <TableRow key={task.faf001_bptaskid}>
                  <TableCell className="font-medium">{task.faf001_taskname}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {task._faf001_bpinstanceid_value
                      ? instanceNames?.get(task._faf001_bpinstanceid_value) ?? '...'
                      : '--'}
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge value={task.faf001_status} />
                  </TableCell>
                  <TableCell>{assignmentLabel(task)}</TableCell>
                  <TableCell>
                    {task._faf001_requiredrole_value ? (
                      <Badge variant="outline">
                        {roleNames?.get(task._faf001_requiredrole_value) ?? '...'}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DateCell value={task.createdon} includeTime />
                  </TableCell>
                  <TableCell>
                    <DueDate value={task.faf001_duedate} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {(taskAction(task, systemUserId) === 'claim' || taskAction(task, systemUserId) === 'start') && (
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={action.isPending}
                        title={taskAction(task, systemUserId) === 'claim' ? 'Assign to me' : 'Start work'}
                        aria-label={`${taskAction(task, systemUserId) === 'claim' ? 'Assign to me' : 'Start work'}: ${task.faf001_taskname}`}
                        onClick={() => {
                          const operation = taskAction(task, systemUserId) === 'claim' ? 'faf001_AssignTask' : 'faf001_StartTask'
                          action.mutate({ operation, taskId: task.faf001_bptaskid }, {
                            onSuccess: () => {
                              if (operation === 'faf001_StartTask') void navigate(`/tasks/${task.faf001_bptaskid}`)
                            },
                          })
                        }}
                      >
                        {action.isPending && action.variables?.taskId === task.faf001_bptaskid
                          ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          : taskAction(task, systemUserId) === 'claim'
                            ? <UserPlus className="size-4" aria-hidden="true" />
                            : <Play className="size-4" aria-hidden="true" />}
                      </Button>
                    )}
                    {taskAction(task, systemUserId) === 'view' && (
                      <Button size="icon" variant="ghost" asChild>
                        <Link to={`/tasks/${task.faf001_bptaskid}`} title="View task" aria-label={`View task: ${task.faf001_taskname}`}>
                          <Eye className="size-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    )}
                    {task._faf001_bpinstanceid_value ? (
                      <Button size="icon" variant="ghost" asChild>
                        <Link
                          to={`/instances/${task._faf001_bpinstanceid_value}`}
                          title="Open process instance"
                          aria-label={`Open process instance for ${task.faf001_taskname}`}
                        >
                          <Workflow className="size-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" disabled title="No linked process instance" aria-label="No linked process instance">
                        <Workflow className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
