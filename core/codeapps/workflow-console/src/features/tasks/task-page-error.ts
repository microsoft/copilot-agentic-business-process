export function taskPageError(error: unknown): { title: string; message: string; detail?: string } {
  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
  if (detail && /not eligible|not authorized|not authorised|access denied|permission|privilege|forbidden|visibility|\b403\b/i.test(detail)) {
    return { title: 'Access unavailable', message: 'You do not have permission to view or start this task. Contact the process owner if you need access.', detail }
  }
  if (detail && /assigned to another|already been assigned|already (?:claimed|taken)|assigned to someone else/i.test(detail)) {
    return { title: 'Task already taken', message: 'Another user has taken this task. Return to My tasks to choose another task.', detail }
  }
  if (detail && /not found|does not exist|\b404\b/i.test(detail)) {
    return { title: 'Task not found', message: 'This task may have been removed, or the shared link may be out of date. Ask the sender to check the link.', detail }
  }
  if (detail && /closed|inactive|no longer available/i.test(detail)) {
    return { title: 'Task no longer available', message: 'This task is no longer open for work. Refresh its details or return to My tasks.', detail }
  }
  if (detail?.startsWith('Assignment succeeded, but')) {
    return { title: 'Unable to start work', message: 'Assignment succeeded, but starting work could not be confirmed. Refresh the task and retry Start Work. No automatic retry has been made.', detail }
  }
  return { title: 'Unable to access task', message: 'The task could not be loaded or started. It may no longer be available, you may not have access, or the service may be temporarily unavailable. Retry or contact the process owner.', detail }
}