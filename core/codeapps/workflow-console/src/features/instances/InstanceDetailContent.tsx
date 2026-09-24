import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Faf001_bpartifactsfaf001_artifacttype as ArtifactType, Faf001_bpartifactsfaf001_status as ArtifactStatus } from '@/generated/models/Faf001_bpartifactsModel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DateCell } from '@/components/date-cells'
import { labelOf } from '@/lib/bp/choices'
import { useInstanceDetails } from './useInstanceDetails'
import { artifactFile, attachmentFile } from './instance-detail-model'
import { InstanceStepTimeline, OutputList } from './InstanceStepTimeline'
import { InstanceFileContent } from './InstanceFileContent'
import type { ProcessDetailData } from './process-detail-data'

type CollectionQuery = { isPending: boolean; error: Error | null; data?: unknown[]; refetch: () => unknown }

function CollectionState({ query, label, children }: { query: CollectionQuery; label: string; children?: ReactNode }) {
  if (query.isPending) return <Skeleton aria-label={`Loading ${label}`} className="h-20 w-full" />
  if (query.error) return <div role="alert" className="py-4 text-sm text-destructive">{label}: {query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></div>
  if (!query.data?.length) return <p className="py-8 text-sm text-muted-foreground">No {label.toLowerCase()} recorded.</p>
  return children
}

function FileMeta({ size, date, step }: { size?: number; date?: string; step?: string }) {
  return <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
    {size != null && <span>{size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`}</span>}
    <DateCell value={date} />
    {step && <span className="[overflow-wrap:anywhere]">{step}</span>}
  </div>
}

export function InstanceDetailContent({ instanceId, active, detail }: { instanceId: string; active: boolean; detail: ProcessDetailData }) {
  const client = useQueryClient()
  const [expanded, setExpanded] = useState(new Set<string>())
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState('timeline')
  const { attachments, artifacts, outputs } = useInstanceDetails(instanceId, active)
  const steps = { data: detail.steps, error: null }
  const stepName = (id?: string) => detail.steps.find((step) => step.faf001_bpstepid.toLowerCase() === id?.toLowerCase())?.faf001_stepname
  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  async function refresh() {
    setRefreshing(true)
    try {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['instance', instanceId] }),
        client.invalidateQueries({ queryKey: ['instance-details', instanceId] }),
        client.invalidateQueries({ queryKey: ['instance-file-text'] }),
        client.invalidateQueries({ queryKey: ['instance-resource'] }),
      ])
    } finally { setRefreshing(false) }
  }
  const tabs = [
    { id: 'timeline', label: 'Timeline', query: steps },
    { id: 'attachments', label: 'Attachments', query: attachments },
    { id: 'artifacts', label: 'Artifacts', query: artifacts },
    { id: 'outputs', label: 'Outputs', query: outputs },
  ]

  return <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-5">
    <div className="flex min-w-0 items-start gap-2">
      <TabsList aria-label="Process details" className="grid h-auto min-w-0 flex-1 grid-cols-2 gap-1 sm:flex sm:flex-none">
        {tabs.map(({ id, label, query }) => <TabsTrigger key={id} value={id} className="min-h-9 px-3">{label}{query.data && !query.error && <span className="text-xs text-muted-foreground">{query.data.length}</span>}</TabsTrigger>)}
      </TabsList>
      <Button size="icon" variant="ghost" className="ml-auto shrink-0" title="Refresh process" aria-label="Refresh process" disabled={refreshing} onClick={() => void refresh()}><RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} /></Button>
    </div>
    <TabsContent value="timeline" className="min-w-0">
      <InstanceStepTimeline steps={detail.steps} artifacts={detail.artifacts} outputs={detail.outputs} expanded={expanded} toggle={toggle} active={active} />
    </TabsContent>
    <TabsContent value="attachments" className="min-w-0">
      <CollectionState query={attachments} label="Attachments"><ul className="divide-y">
        {attachments.data?.map((attachment) => <li key={attachment.faf001_bpattachmentid} className="min-w-0 py-4 first:pt-0">
          <InstanceFileContent file={attachmentFile(attachment)}>
          <FileMeta size={attachment.faf001_filesize} date={attachment.createdon} step={stepName(attachment._faf001_bpstepid_value)} />
          </InstanceFileContent>
        </li>)}
      </ul></CollectionState>
    </TabsContent>
    <TabsContent value="artifacts" className="min-w-0">
      <CollectionState query={artifacts} label="Artifacts"><ul className="divide-y">
        {artifacts.data?.map((artifact) => <li key={artifact.faf001_bpartifactid} className="min-w-0 space-y-1 py-4 first:pt-0">
          <InstanceFileContent file={artifactFile(artifact)}>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{labelOf(ArtifactType, artifact.faf001_artifacttype)}</span><span>{labelOf(ArtifactStatus, artifact.faf001_status)}</span>{artifact.faf001_version != null && <span>Version {artifact.faf001_version}</span>}</div>
          <FileMeta size={artifact.faf001_filesize} date={artifact.faf001_generatedon ?? artifact.createdon} step={stepName(artifact._faf001_bpstepid_value)} />
          </InstanceFileContent>
        </li>)}
      </ul></CollectionState>
    </TabsContent>
    <TabsContent value="outputs" className="min-w-0"><CollectionState query={outputs} label="Outputs"><OutputList outputs={outputs.data ?? []} steps={detail.steps} active={active} /></CollectionState></TabsContent>
  </Tabs>
}