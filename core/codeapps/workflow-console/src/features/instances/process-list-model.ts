import type { Faf001_bpinstances } from '../../generated/models/Faf001_bpinstancesModel'
import { collectPages } from './instance-detail-model.ts'

export type GetProcessesRequest = {
  faf001_PageSize: number
  faf001_ContinuationToken?: string
}

export type GetProcessesResponse = {
  faf001_Processes: Faf001_bpinstances[]
  faf001_HasMore: boolean
  faf001_NextToken?: string | null
}

export async function loadProcessList(
  invoke: (body: GetProcessesRequest) => Promise<{
    success: boolean
    data?: unknown
    error?: { message?: string }
  }>,
  statusFilter: readonly number[] | null,
): Promise<Faf001_bpinstances[]> {
  const rows = await collectPages(async (token) => {
    const result = await invoke({
      faf001_PageSize: 200,
      ...(token ? { faf001_ContinuationToken: token } : {}),
    })
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to load process instances')
    const page = result.data as GetProcessesResponse | null | undefined
    if (!page || !Array.isArray(page.faf001_Processes) || typeof page.faf001_HasMore !== 'boolean') {
      throw new Error('Invalid GetProcesses response')
    }
    if (page.faf001_HasMore && (typeof page.faf001_NextToken !== 'string' || !page.faf001_NextToken.trim())) {
      throw new Error('GetProcesses returned more records without a continuation token')
    }
    return {
      success: true,
      data: page.faf001_Processes,
      skipToken: page.faf001_HasMore ? page.faf001_NextToken! : undefined,
    }
  }, (row) => row.faf001_bpinstanceid)

  const lastUpdated = (row: Faf001_bpinstances) => Date.parse(row.modifiedon ?? '') || 0
  return rows
    .filter((row) => statusFilter === null || statusFilter.includes(row.faf001_status))
    .sort((left, right) => lastUpdated(right) - lastUpdated(left) || left.faf001_bpinstanceid.localeCompare(right.faf001_bpinstanceid))
    .slice(0, 200)
}