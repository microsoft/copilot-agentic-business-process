import { Ban, Bell, Bot, CheckCircle2, ChevronRight, Circle, Clock, Cog, GitBranch, LoaderCircle, Network, Plug, SkipForward, UserRound, XCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Faf001_bpdatavaluesService } from '@/generated'
import { Faf001_bpstepsfaf001_status as StepStatus, Faf001_bpstepsfaf001_steptype as StepType } from '@/generated/models/Faf001_bpstepsModel'
import { Faf001_bpdatavaluesfaf001_datatype as DataType } from '@/generated/models/Faf001_bpdatavaluesModel'
import type { ArtifactMetadata, OutputMetadata } from './process-api-contracts'
import type { TimelineStep } from './process-detail-data'
import { Badge } from '@/components/ui/badge'
import { labelOf } from '@/lib/bp/choices'
import { cn } from '@/lib/utils'
import { artifactFile, forStep, outputText, stepDuration } from './instance-detail-model'
import { InstanceFileContent, ReadOnlyContent } from './InstanceFileContent'
import { ProcessTextContent } from './ProcessTextContent'
import { ProcessResourceItem } from './ProcessResourceItem'

function OutputContent({ id, active }: { id: string; active: boolean }) {
  const query = useQuery({
    queryKey: ['instance-resource', 'output', id],
    staleTime: 0,
    refetchInterval: active ? 10000 : false,
    queryFn: async ({ signal }) => {
      const result = await Faf001_bpdatavaluesService.get(id, { select: [
        'faf001_bpdatavalueid', 'faf001_datakey', 'faf001_datatype', 'faf001_description',
        'faf001_valuetext', 'faf001_valuejson', 'faf001_valuenumber', 'faf001_valueboolean', 'faf001_valuedatetime',
      ] })
      signal.throwIfAborted()
      if (!result.success || !result.data) throw new Error(result.error?.message ?? 'Output is unavailable')
      return result.data
    },
  })
  if (query.isPending) return <p role="status" className="text-xs text-muted-foreground">Loading output...</p>
  if (query.error) return <div role="alert" className="text-xs text-destructive">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></div>
  const output = query.data
  return <>
    {output.faf001_datatype === 324010004
      ? <ProcessTextContent text={output.faf001_valuejson ?? ''} kind="json" name={`${output.faf001_datakey}.json`} />
      : output.faf001_datatype === 324010006
        ? <ProcessTextContent text={output.faf001_valuetext ?? ''} kind="markdown" name={`${output.faf001_datakey}.md`} />
        : <ReadOnlyContent text={outputText(output)} />}
    {output.faf001_description && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{output.faf001_description}</p>}
  </>
}

export function OutputList({ outputs, steps = [], active = false }: { outputs: OutputMetadata[]; steps?: TimelineStep[]; active?: boolean }) {
  return <ul className="min-w-0 divide-y">
    {outputs.map((output) => {
      const step = steps.find((candidate) => candidate.faf001_bpstepid.toLowerCase() === output._faf001_bpstepid_value?.toLowerCase())
      return <li key={output.faf001_bpdatavalueid} className="min-w-0 py-3 first:pt-0">
        <ProcessResourceItem summary={<span className="flex min-w-0 flex-wrap items-baseline gap-2 text-sm">
          <span className="font-medium [overflow-wrap:anywhere]">{output.faf001_datakey}</span>
          <span className="text-xs text-muted-foreground">{labelOf(DataType, output.faf001_datatype)}</span>
          {step && <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{step.faf001_stepname}</span>}
        </span>}>
        <OutputContent id={output.faf001_bpdatavalueid} active={active} />
        </ProcessResourceItem>
      </li>
    })}
  </ul>
}

function StepTime({ value }: { value?: string }) {
  const date = value ? new Date(value) : undefined
  if (!date || Number.isNaN(date.getTime())) return <>--</>
  return <time dateTime={value} title={date.toLocaleString()}>{date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
}

export function InstanceStepTimeline({ steps, artifacts, outputs, expanded, toggle, active = false }: {
  steps: TimelineStep[]
  artifacts: ArtifactMetadata[]
  outputs: OutputMetadata[]
  expanded: Set<string>
  toggle: (id: string) => void
  active?: boolean
}) {
  if (!steps.length) return <p className="py-8 text-sm text-muted-foreground">No steps recorded.</p>
  return <ol aria-label="Process step timeline" className="relative min-w-0 py-2">
    {steps.map((step) => {
      const id = step.faf001_bpstepid
      const open = expanded.has(id)
      const failed = step.faf001_status === 324010004
      const completed = step.faf001_status === 324010003
      const running = step.faf001_status === 324010001
      const StatusIcon = step.faf001_status == null ? Circle : ({ 324010000: Circle, 324010001: LoaderCircle, 324010002: Clock, 324010003: CheckCircle2, 324010004: XCircle, 324010005: SkipForward, 324010006: Ban })[step.faf001_status] ?? Circle
      const TypeIcon = step.faf001_steptype == null ? Circle : ({ 324010000: Cog, 324010001: UserRound, 324010002: GitBranch, 324010003: Plug, 324010004: Bell, 324010005: Network, 324010006: Bot })[step.faf001_steptype] ?? Circle
      const stepArtifacts = forStep(artifacts, id)
      const stepOutputs = forStep(outputs, id)
      return <li key={id} className="relative min-w-0 pb-6 pl-11 last:pb-0 before:absolute before:left-[13px] before:top-7 before:bottom-0 before:w-px before:bg-border last:before:hidden">
        <span title={labelOf(StepStatus, step.faf001_status)} className={cn('absolute left-0 top-0 flex size-7 items-center justify-center rounded-full bg-background', failed ? 'text-destructive' : completed ? 'text-primary' : 'text-muted-foreground')}>
          <StatusIcon className={cn('size-5', running && 'motion-safe:animate-spin')} aria-hidden="true" />
        </span>
        <button type="button" onClick={() => toggle(id)} aria-expanded={open} aria-controls={`step-${id}`} className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-sm py-0.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring">
          <ChevronRight className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden="true" />
          <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{step.faf001_stepname}</span>
          <span title={labelOf(StepType, step.faf001_steptype)} className="shrink-0 text-muted-foreground"><TypeIcon className="size-4" aria-hidden="true" /><span className="sr-only">{labelOf(StepType, step.faf001_steptype)}</span></span>
          <Badge variant={failed ? 'destructive' : completed ? 'secondary' : 'outline'}>{labelOf(StepStatus, step.faf001_status)}</Badge>
        </button>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <StepTime value={step.faf001_starttime ?? step.createdon} />
          {step.faf001_starttime && step.faf001_endtime && <span>{stepDuration(step.faf001_starttime, step.faf001_endtime)}</span>}
          {!!stepArtifacts.length && <span>{stepArtifacts.length} artifact{stepArtifacts.length === 1 ? '' : 's'}</span>}
          {!!stepOutputs.length && <span>{stepOutputs.length} output{stepOutputs.length === 1 ? '' : 's'}</span>}
        </div>
        {open && <div id={`step-${id}`} className="mt-4 min-w-0 space-y-4 border-l-2 border-border pl-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
            <div><dt className="text-muted-foreground">Started</dt><dd><StepTime value={step.faf001_starttime} /></dd></div>
            <div><dt className="text-muted-foreground">Ended</dt><dd><StepTime value={step.faf001_endtime} /></dd></div>
            {step.faf001_steptype === 324010001 && <div className="min-w-0 [overflow-wrap:anywhere]"><dt className="text-muted-foreground">Executed by</dt><dd>{step.executedBy?.name || step.executedBy?.id || '--'}</dd></div>}
          </dl>
          {(step.faf001_errorcode || step.faf001_errormessage) && <div role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive [overflow-wrap:anywhere]">{step.faf001_errorcode && <strong>{step.faf001_errorcode}: </strong>}{step.faf001_errormessage}</div>}
          {!!stepArtifacts.length && <section className="min-w-0 space-y-3" aria-label="Step artifacts">
            <h3 className="text-xs font-medium text-muted-foreground">Artifacts</h3>
            {stepArtifacts.map((artifact) => <InstanceFileContent key={artifact.faf001_bpartifactid} file={artifactFile(artifact)} />)}
          </section>}
          {!!stepOutputs.length && <section className="min-w-0 space-y-3" aria-label="Step outputs"><h3 className="text-xs font-medium text-muted-foreground">Outputs</h3><OutputList outputs={stepOutputs} active={active} /></section>}
        </div>}
      </li>
    })}
  </ol>
}