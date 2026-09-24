import { Link, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { InstanceStatusBadge } from '@/components/status-badges'
import { DateCell, DueDate, RelativeTime } from '@/components/date-cells'
import { ACTIVE_INSTANCE_STATUSES, InstancePriority, labelOf } from '@/lib/bp/choices'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { InstanceDetailContent } from './InstanceDetailContent'
import { useInstanceDetail } from './useInstanceDetails'

export default function InstanceDetailPage() {
  const { instanceId } = useParams<{ instanceId: string }>()

  const { data: detail, isPending, error } = useInstanceDetail(instanceId)
  const instance = detail?.instance

  if (isPending) {
    return (
      <div className="px-6 py-8 space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !instance) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 p-4 text-sm">
          <AlertCircle className="size-4 mt-0.5 text-destructive" />
          <span>{error instanceof Error ? error.message : 'Process instance not found'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 px-4 py-6 space-y-6 sm:px-6 sm:py-8">
      <Link
        to="/instances"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to process instances
      </Link>

      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="min-w-0 text-2xl font-semibold [overflow-wrap:anywhere]">{instance.faf001_processname}</h1>
          <InstanceStatusBadge value={instance.faf001_status} />
        </div>
        {/* Sits with the status badge, not in the field grid: it is the explanation of that badge. */}
        {instance.faf001_statusmessage && (
          <p className="text-sm [overflow-wrap:anywhere]">
            {instance.faf001_statusmessage}
            {instance.faf001_lastupdated && (
              <span className="text-muted-foreground">
                {' \u2014 '}
                <RelativeTime value={instance.faf001_lastupdated} />
              </span>
            )}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <Field label="Business key">{instance.faf001_businesskey ?? '--'}</Field>
          <Field label="Priority">{labelOf(InstancePriority, instance.faf001_priority)}</Field>
          <Field label="Started">
            <DateCell value={instance.faf001_starttime} />
          </Field>
          <Field label="Due">
            <DueDate value={instance.faf001_duedate} />
          </Field>
          <Field label="Last updated">
            <DateCell value={instance.faf001_lastupdated} includeTime />
          </Field>
        </dl>
        {instance.faf001_errormessage && (
          <div className="rounded-md border border-destructive/50 p-3 text-sm">
            <span className="font-medium text-destructive">
              {instance.faf001_errorcode ?? 'Error'}:
            </span>{' '}
            {instance.faf001_errormessage}
          </div>
        )}
      </div>

      <Separator />

      <InstanceDetailContent key={instanceId} instanceId={instanceId!} detail={detail!} active={(ACTIVE_INSTANCE_STATUSES as readonly number[]).includes(instance.faf001_status ?? -1)} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
