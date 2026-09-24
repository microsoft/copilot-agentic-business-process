import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Workflow } from 'lucide-react'
import { useInstances } from '@/features/instances/useInstances'
import { ACTIVE_INSTANCE_STATUSES, InstancePriority, labelOf } from '@/lib/bp/choices'
import { InstanceStatusBadge } from '@/components/status-badges'
import { DateCell, DueDate } from '@/components/date-cells'
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

type Scope = 'active' | 'all'

export default function InstancesPage() {
  const navigate = useNavigate()
  const [scope, setScope] = useState<Scope>('active')
  const { data: instances, isPending, error } = useInstances(
    scope === 'active' ? ACTIVE_INSTANCE_STATUSES : null,
  )

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Process instances</h1>
        <p className="text-sm text-muted-foreground">
          Business process executions you have access to.
        </p>
      </div>

      <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <TabsList>
          <TabsTrigger value="active">In flight</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 p-4 text-sm">
          <AlertCircle className="size-4 mt-0.5 text-destructive" />
          <span>{error instanceof Error ? error.message : 'Failed to load instances'}</span>
        </div>
      )}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (instances ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Workflow className="size-8" />
          <p className="text-sm">No process instances found.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process</TableHead>
                <TableHead>Business key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Status message</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(instances ?? []).map((instance) => (
                <TableRow
                  key={instance.faf001_bpinstanceid}
                  className="cursor-pointer"
                  onClick={() => navigate(`/instances/${instance.faf001_bpinstanceid}`)}
                >
                  <TableCell className="font-medium">
                    {instance.faf001_processname}
                    {instance.faf001_processversion && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        v{instance.faf001_processversion}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-64 truncate">
                    {instance.faf001_businesskey ?? '--'}
                  </TableCell>
                  <TableCell>
                    <InstanceStatusBadge value={instance.faf001_status} />
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground max-w-72 truncate"
                    title={instance.faf001_statusmessage ?? undefined}
                  >
                    {instance.faf001_statusmessage ?? '--'}
                  </TableCell>
                  <TableCell>{labelOf(InstancePriority, instance.faf001_priority)}</TableCell>
                  <TableCell>
                    <DateCell value={instance.faf001_starttime} includeTime />
                  </TableCell>
                  <TableCell>
                    <DateCell value={instance.modifiedon} includeTime />
                  </TableCell>
                  <TableCell>
                    <DueDate value={instance.faf001_duedate} />
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
