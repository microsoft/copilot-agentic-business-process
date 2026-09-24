import { useQuery } from '@tanstack/react-query'
import { Faf001_GetProcessesService } from '@/generated'
import type { Faf001_bpinstances } from '@/generated/models/Faf001_bpinstancesModel'
import { loadProcessList } from './process-list-model'

export type InstanceRow = Faf001_bpinstances

export function useInstances(statusFilter: readonly number[] | null) {
  return useQuery({
    queryKey: ['instances', statusFilter],
    // Status and status message move as flows run, so the default 5-minute cache is too stale here.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () => loadProcessList(
      (body) => Faf001_GetProcessesService.faf001_GetProcesses(
        undefined, body.faf001_PageSize, body.faf001_ContinuationToken,
      ),
      statusFilter,
    ),
  })
}
