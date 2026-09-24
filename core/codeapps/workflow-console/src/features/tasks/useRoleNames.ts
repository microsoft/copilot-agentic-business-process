/**
 * Batch-resolves security role display names for a set of ids.
 *
 * `role` is not registered as a native data source and `faf001_requiredrolename` is a virtual
 * column that cannot be selected, so the names come from the connector in one extra query.
 */
import { useQuery } from '@tanstack/react-query'
import { listRows } from '@/lib/dataverse/connectorClient'
import { anyOf } from '@/lib/dataverse/odata'

export function useRoleNames(roleIds: string[]) {
  const ids = [...new Set(roleIds.filter(Boolean))].sort()

  return useQuery({
    queryKey: ['role-names', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await listRows('roles', {
        select: ['roleid', 'name'],
        filter: anyOf('roleid', ids),
        top: ids.length,
      })
      const map = new Map<string, string>()
      for (const row of rows) {
        const roleid = row.roleid as string | undefined
        if (roleid) map.set(roleid, (row.name as string) ?? 'Unnamed role')
      }
      return map
    },
  })
}
