import { format, formatDistanceToNowStrict, isPast, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'

/** Renders a Dataverse datetime, flagging overdue values. */
export function DueDate({ value, className }: { value?: string; className?: string }) {
  if (!value) return <span className="text-muted-foreground">--</span>

  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) return <span className="text-muted-foreground">--</span>

  const overdue = isPast(date)
  return (
    <span
      className={cn(overdue ? 'text-destructive font-medium' : 'text-foreground', className)}
      title={format(date, 'PPpp')}
    >
      {format(date, 'dd MMM yyyy')}
      <span className="ml-1 text-xs text-muted-foreground">
        ({overdue ? `${formatDistanceToNowStrict(date)} overdue` : `in ${formatDistanceToNowStrict(date)}`})
      </span>
    </span>
  )
}

export function DateCell({ value, includeTime = false }: { value?: string; includeTime?: boolean }) {
  if (!value) return <span className="text-muted-foreground">--</span>
  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) return <span className="text-muted-foreground">--</span>
  return <span title={format(date, 'PPpp')}>{format(date, includeTime ? 'dd MMM yyyy HH:mm:ss' : 'dd MMM yyyy')}</span>
}

/** "3 minutes ago", with the exact timestamp on hover. Renders nothing when there is no value. */
export function RelativeTime({ value }: { value?: string }) {
  if (!value) return null
  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) return null
  return <span title={format(date, 'PPpp')}>{formatDistanceToNowStrict(date, { addSuffix: true })}</span>
}
