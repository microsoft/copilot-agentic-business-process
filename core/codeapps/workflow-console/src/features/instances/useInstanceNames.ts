/**
 * Batch-resolves process instance display names for a set of ids.
 *
 * `faf001_bpinstanceidname` is a virtual column and cannot be selected, so the names are fetched
 * with one extra query rather than one per row.
 */
import { useQuery } from '@tanstack/react-query'
import { Faf001_bpinstancesService } from '@/generated'
import { anyOf } from '@/lib/dataverse/odata'

export function useInstanceNames(instanceIds: string[]) {
  const ids = [...new Set(instanceIds.filter(Boolean))].sort()

  return useQuery({
    queryKey: ['instance-names', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await Faf001_bpinstancesService.getAll({
        select: ['faf001_bpinstanceid', 'faf001_processname', 'faf001_businesskey'],
        filter: anyOf('faf001_bpinstanceid', ids),
        top: ids.length,
      })
      if (result.success === false) {
        throw new Error(
          (result.error as Error | undefined)?.message ?? 'Failed to resolve process names',
        )
      }
      const map = new Map<string, string>()
      for (const row of result.data ?? []) {
        if (row.faf001_bpinstanceid) {
          map.set(row.faf001_bpinstanceid, row.faf001_processname ?? 'Untitled process')
        }
      }
      return map
    },
  })
}
