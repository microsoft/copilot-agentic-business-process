import { Badge } from '@/components/ui/badge'
import { InstanceStatus, TaskStatus, labelOf } from '@/lib/bp/choices'

type Variant = 'default' | 'secondary' | 'destructive' | 'outline'

const TASK_STATUS_VARIANT: Record<number, Variant> = {
  324010000: 'outline', // Not Started
  324010001: 'default', // Assigned
  324010002: 'default', // In Progress
  324010003: 'secondary', // Waiting
  324010004: 'secondary', // Completed
  324010005: 'outline', // Cancelled
  324010006: 'destructive', // Expired
}

const INSTANCE_STATUS_VARIANT: Record<number, Variant> = {
  324010000: 'outline', // Not Started
  324010001: 'default', // Running
  324010002: 'secondary', // Waiting
  324010003: 'secondary', // Suspended
  324010004: 'secondary', // Completed
  324010005: 'destructive', // Failed
  324010006: 'outline', // Cancelled
  324010007: 'destructive', // Compensating
}

export function TaskStatusBadge({ value }: { value?: number }) {
  return (
    <Badge variant={value ? TASK_STATUS_VARIANT[value] ?? 'outline' : 'outline'}>
      {labelOf(TaskStatus, value)}
    </Badge>
  )
}

export function InstanceStatusBadge({ value }: { value?: number }) {
  return (
    <Badge variant={value ? INSTANCE_STATUS_VARIANT[value] ?? 'outline' : 'outline'}>
      {labelOf(InstanceStatus, value)}
    </Badge>
  )
}
