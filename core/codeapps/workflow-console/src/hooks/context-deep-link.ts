const GUID = /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isTaskLinkId(value: string | undefined): value is string {
  return !!value && GUID.test(value)
}

export function contextDeepLink(params: Record<string, string>): string | undefined {
  const pick = (...names: string[]) => names.map(name => params[name]).find(value => value && GUID.test(value))
  const taskId = pick('taskId', 'taskid', 'task')
  const page = params.page?.toLowerCase()
  if (page && !['starttaskdetail', 'assigntaskdetail', 'taskdetail', 'processinstancedetail'].includes(page)) return undefined
  if (page === 'starttaskdetail' || page === 'assigntaskdetail' || (!page && ['taskId', 'taskid', 'task'].some(name => name in params))) {
    return taskId ? `/tasks/${taskId}/start` : '/tasks/start'
  }
  if (taskId && page === 'taskdetail') return `/tasks/${taskId}`
  const instanceId = pick('instanceId', 'instanceid', 'instance')
  if (instanceId && (!page || page === 'processinstancedetail')) return `/instances/${instanceId}`
  return undefined
}