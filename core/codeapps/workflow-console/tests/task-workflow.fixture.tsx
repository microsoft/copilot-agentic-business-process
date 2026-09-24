import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { IdentityContext } from '../src/providers/identity-context'
import MyTasksPage from '../src/features/tasks/MyTasksPage'
import TaskDetailPage from '../src/features/tasks/TaskDetailPage'
import StartTaskDetailPage from '../src/features/tasks/StartTaskDetailPage'
import { DocumentPreviewCard } from '../src/features/tasks/widgets/DocumentPreviewCard'
import type { AttachmentRow } from '../src/features/tasks/useTaskAttachment'
import { processApi } from '../src/features/instances/process-api'
import type { ProcessReadOperation, ProcessReadResponses } from '../src/features/instances/process-api-contracts'
import { useContextDeepLink } from '../src/hooks/use-context-deep-link'
import { taskApi } from '../src/features/tasks/task-api'
import { taskRequest, type TaskOperation, type TaskRequests, type TaskResponses, type TaskRow } from '../src/features/tasks/task-api-contracts'
import { Faf001_bptasksService, Faf001_bpdatavaluesService, Faf001_bpstepsService, Faf001_bpattachmentsService } from '../src/generated'
import '../src/index.css'

const caller = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const other = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const claimId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const assignedId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const closedId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const foreignId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const instanceId = '11111111-1111-1111-1111-111111111111'
const params = new URLSearchParams(location.search)
const previewAttachment = {
  faf001_bpattachmentid: '99999999-9999-9999-9999-999999999999',
  faf001_filename: 'order-preview.png',
  faf001_mimetype: 'image/png',
  faf001_storagetype: 324010002,
  faf001_filesize: 68,
} as AttachmentRow
Faf001_bpattachmentsService.downloadFile = async () => ({
  success: true,
  data: Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='), character => character.charCodeAt(0)),
})
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const tasks: TaskRow[] = [
  { faf001_bptaskid: claimId, faf001_taskname: 'Claimable review', faf001_status: 324010003, statecode: 0 },
  { faf001_bptaskid: assignedId, faf001_taskname: 'My assigned review', faf001_status: 324010001, statecode: 0, _faf001_assignedto_value: caller },
  { faf001_bptaskid: closedId, faf001_taskname: 'My completed review', faf001_status: 324010004, statecode: 0, _faf001_assignedto_value: caller },
  { faf001_bptaskid: foreignId, faf001_taskname: 'Foreign review', faf001_status: 324010001, statecode: 0, _faf001_assignedto_value: other },
].map(task => ({ ...task, _faf001_bpinstanceid_value: instanceId, faf001_widgetid: 'data-review-ui', createdon: '2026-09-10T10:00:00Z' })) as TaskRow[]

declare global {
  interface Window {
    taskWorkflowTest: {
      calls: { operation: string; body: unknown }[]
      failClaim: boolean; failStart: boolean; failComplete: boolean; failList: boolean
      reassign: (taskId: string) => Promise<void>
    }
  }
}
window.taskWorkflowTest = {
  calls: [], failClaim: params.has('claim-error'), failStart: params.has('start-error'),
  failComplete: params.has('complete-error'), failList: params.has('list-error'),
  reassign: async taskId => {
    tasks.find(task => task.faf001_bptaskid === taskId)!._faf001_assignedto_value = other
    await queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    await queryClient.invalidateQueries({ queryKey: ['task-preview', taskId] })
  },
}
taskApi.invoke = async <Operation extends TaskOperation>(operation: Operation, body: TaskRequests[Operation]) => {
  taskRequest(operation, body)
  const state = window.taskWorkflowTest
  state.calls.push({ operation, body })
  let data: unknown
  if (operation === 'faf001_GetTasks') {
    if (state.failList) throw new Error('Fixture task list denied')
    data = { value: params.has('empty') ? [] : tasks.filter(task => !task._faf001_assignedto_value || task._faf001_assignedto_value === caller).map(task => ({ ...task })) }
  } else {
    const task = tasks.find(item => item.faf001_bptaskid === (body as { faf001_TaskId: string }).faf001_TaskId)
    if (!task) throw new Error('Task not found')
    if (operation === 'faf001_GetTask' && params.has('visibility-error')) throw new Error('You are not eligible to view this task.')
    if (operation === 'faf001_GetTask' && params.has('read-error')) return { success: false, error: { message: 'The service is temporarily unavailable.' } }
    const open = task.statecode === 0 && task.faf001_status <= 324010003
    if (operation === 'faf001_AssignTask') {
      if (state.failClaim) {
        task._faf001_assignedto_value = other
        throw new Error('The task has already been assigned.')
      }
      if (!open || (task._faf001_assignedto_value && task._faf001_assignedto_value !== caller)) throw new Error('Claim denied')
      if (!task._faf001_assignedto_value) {
        task._faf001_assignedto_value = caller
        task.faf001_status = 324010001
      }
      data = { faf001_TaskId: task.faf001_bptaskid }
    } else {
      if (task._faf001_assignedto_value !== caller && !(operation === 'faf001_GetTask' && !task._faf001_assignedto_value && open)) throw new Error('This task is assigned to another user.')
      if (operation === 'faf001_GetTask') data = { ...task, faf001_inputdata: '{"order":"PO-123","amount":42}' }
      else if (operation === 'faf001_StartTask') {
        if (state.failStart) throw new Error('Fixture start conflict. Refresh before trying again.')
        if (!open) throw new Error('Start denied')
        task.faf001_status = 324010002
        data = { faf001_TaskId: task.faf001_bptaskid }
      } else {
        if (state.failComplete) throw new Error('Fixture completion denied')
        if (!open) throw new Error('Completion denied')
        JSON.parse((body as TaskRequests['faf001_CompleteTask']).faf001_SubmissionJson)
        task.faf001_status = 324010004
        data = { faf001_StepId: '11111111-1111-1111-1111-111111111111' }
      }
    }
  }
  return { success: true, data: data as TaskResponses[Operation] }
}
const rejectDirect = async () => { throw new Error('Unexpected direct task or submission table access') }
processApi.invoke = async <Operation extends ProcessReadOperation>(operation: Operation) => {
  if (operation !== 'faf001_GetProcess') throw new Error(`Unexpected process read: ${operation}`)
  window.taskWorkflowTest.calls.push({ operation: 'faf001_GetProcess', body: { faf001_ProcessInstanceId: instanceId } })
  if (params.has('history-error')) throw new Error('Fixture history unavailable')
  return { success: true, data: {
    faf001_Process: { faf001_bpinstanceid: instanceId, faf001_processname: 'Order Processing Intake', faf001_businesskey: 'PO-123', faf001_status: 324010001, faf001_starttime: '2026-09-10T09:00:00Z', faf001_lastupdated: '2026-09-10T11:30:00Z' },
    faf001_StepsJson: JSON.stringify([{ id: '22222222-2222-2222-2222-222222222222', name: 'Extract order data', type: 324010000, status: 324010003, startDate: '2026-09-10T10:00:00Z', endDate: '2026-09-10T10:01:00Z', executedBy: null, artifacts: [], outputs: [] }]),
  } as ProcessReadResponses[Operation] }
}
Faf001_bptasksService.get = rejectDirect
Faf001_bptasksService.getAll = rejectDirect
Faf001_bptasksService.update = rejectDirect
Faf001_bpdatavaluesService.create = rejectDirect
Faf001_bpdatavaluesService.update = rejectDirect
Faf001_bpstepsService.create = rejectDirect
Faf001_bpstepsService.update = rejectDirect

export function SharedTaskLaunch() {
  useContextDeepLink()
  return null
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <IdentityContext.Provider value={{ systemUserId: caller, teams: [], roles: [] }}>
      <MemoryRouter initialEntries={[params.has('attachment-preview') ? '/attachment-preview' : params.get('task') ? `/tasks/${params.get('task')}` : '/tasks']}>
        {(params.has('page') || params.has('taskId') || params.has('taskid')) && <SharedTaskLaunch />}
        <Routes>
          <Route path="/attachment-preview" element={<DocumentPreviewCard attachment={previewAttachment} />} />
          <Route path="/tasks" element={<MyTasksPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/tasks/start" element={<StartTaskDetailPage />} />
          <Route path="/tasks/:taskId/start" element={<StartTaskDetailPage />} />
          <Route path="/tasks/:taskId/assign" element={<StartTaskDetailPage />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </IdentityContext.Provider>
  </QueryClientProvider>,
)