import { useQuery } from '@tanstack/react-query'
import { ACTIVE_INSTANCE_STATUSES } from '@/lib/bp/choices'
import { processApi } from './process-api'
import { parseProcessCollection, parseProcessDetail } from './process-detail-data'
import type { ProcessDetailData } from './process-detail-data'
import type { ArtifactMetadata, AttachmentMetadata, OutputMetadata } from './process-api-contracts'

export function useInstanceDetail(instanceId: string | undefined) {
  return useQuery<ProcessDetailData>({
    queryKey: ['instance', instanceId],
    enabled: !!instanceId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: query => query.state.data && (ACTIVE_INSTANCE_STATUSES as readonly number[]).includes(query.state.data.instance.faf001_status ?? -1) ? 10000 : false,
    queryFn: async ({ signal }) => {
      const result = await processApi.invoke('faf001_GetProcess', instanceId!)
      signal.throwIfAborted()
      if (!result.success) throw new Error(result.error?.message ?? 'Failed to load process')
      return parseProcessDetail(result.data, instanceId!)
    },
  })
}

function useCollection<Row>(
  instanceId: string, collection: string, active: boolean,
  operation: 'faf001_GetAttachments' | 'faf001_GetArtifacts' | 'faf001_GetOutputs',
  idColumn: string,
) {
  return useQuery({
    queryKey: ['instance-details', instanceId, collection],
    enabled: !!instanceId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: active ? 10000 : false,
    queryFn: async ({ signal }) => {
      const result = await processApi.invoke(operation, instanceId)
      signal.throwIfAborted()
      if (!result.success) throw new Error(result.error?.message ?? 'Failed to load process records')
      return parseProcessCollection<Row>(result.data, instanceId, idColumn)
    },
  })
}

export function useInstanceDetails(instanceId: string, active: boolean) {
  const attachments = useCollection<AttachmentMetadata>(instanceId, 'attachments', active, 'faf001_GetAttachments', 'faf001_bpattachmentid')
  const artifacts = useCollection<ArtifactMetadata>(instanceId, 'artifacts', active, 'faf001_GetArtifacts', 'faf001_bpartifactid')
  const outputs = useCollection<OutputMetadata>(instanceId, 'outputs', active, 'faf001_GetOutputs', 'faf001_bpdatavalueid')
  return { attachments, artifacts, outputs }
}