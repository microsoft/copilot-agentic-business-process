import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Faf001_bpattachmentsService,
  Faf001_bpartifactsService, Faf001_bpdatavaluesService,
} from '../src/generated'
import type { Faf001_bpsteps } from '../src/generated/models/Faf001_bpstepsModel'
import type { Faf001_bpattachments } from '../src/generated/models/Faf001_bpattachmentsModel'
import type { Faf001_bpartifacts } from '../src/generated/models/Faf001_bpartifactsModel'
import type { Faf001_bpdatavalues } from '../src/generated/models/Faf001_bpdatavaluesModel'
import { InstanceDetailContent } from '../src/features/instances/InstanceDetailContent'
import { processApi } from '../src/features/instances/process-api'
import type { ProcessReadOperation, ProcessReadResponses } from '../src/features/instances/process-api-contracts'
import { useInstanceDetail } from '../src/features/instances/useInstanceDetails'
import '../src/index.css'

declare global {
  interface Window {
    processDetailTest: { downloads: string[]; pages: number; calls: string[]; reads: string[]; failArtifacts: boolean; failOutput: boolean; failFile: boolean }
  }
}

const params = new URLSearchParams(location.search)
const empty = params.has('empty')
window.processDetailTest = { downloads: [], pages: 0, calls: [], reads: [], failArtifacts: params.has('error'), failOutput: params.has('output-error'), failFile: params.has('file-error') }
if (params.has('dark')) document.documentElement.classList.add('dark')
const instanceId = '00000000-0000-0000-0000-000000000001'
const time = '2026-09-07T09:00:00Z'
const steps = [
  { faf001_bpstepid: 'validate', faf001_stepname: 'Validate order intake', faf001_steptype: 324010000, faf001_status: 324010003 },
  { faf001_bpstepid: 'extract', faf001_stepname: 'Extract order data', faf001_steptype: 324010006, faf001_status: 324010003 },
  { faf001_bpstepid: 'review', faf001_stepname: 'Review extracted order', faf001_steptype: 324010001, faf001_status: 324010003 },
  { faf001_bpstepid: 'waiting', faf001_stepname: 'Clarify delivery address', faf001_steptype: 324010001, faf001_status: 324010002 },
  { faf001_bpstepid: 'failed', faf001_stepname: 'Send confirmation', faf001_steptype: 324010004, faf001_status: 324010004, faf001_errorcode: 'MAIL_UNAVAILABLE', faf001_errormessage: 'The mail service is unavailable.' },
].map((step, index) => ({ ...step, createdon: time, faf001_starttime: `2026-09-07T09:0${index}:00Z`, faf001_endtime: index < 2 ? `2026-09-07T09:0${index}:45Z` : undefined })) as Faf001_bpsteps[]
const attachments = Array.from({ length: 26 }, (_, index) => ({
  faf001_bpattachmentid: `attachment-${index}`, faf001_filename: index === 0 ? 'original-purchase-order.pdf' : `supporting-document-${index}.docx`,
  faf001_storagetype: 324010002, faf001_filesize: 1024, createdon: time,
})) as Faf001_bpattachments[]
const artifacts = [
  { faf001_bpartifactid: 'json', faf001_artifactname: 'Extracted order', faf001_file_name: 'order.json', faf001_mimetype: 'application/json', _faf001_bpstepid_value: 'extract' },
  { faf001_bpartifactid: 'pdf', faf001_artifactname: 'Order confirmation', faf001_file_name: 'confirmation.pdf', faf001_mimetype: 'application/pdf', _faf001_bpstepid_value: 'extract' },
  { faf001_bpartifactid: 'word', faf001_artifactname: 'Order document', faf001_file_name: 'order.docx', _faf001_bpstepid_value: 'extract' },
  { faf001_bpartifactid: 'markdown', faf001_artifactname: 'Review notes', faf001_file_name: 'review.md', _faf001_bpstepid_value: 'review' },
  { faf001_bpartifactid: 'unlinked', faf001_artifactname: 'Process summary', faf001_file_name: 'summary.txt' },
].map((artifact) => ({ ...artifact, faf001_storagetype: 324010002, faf001_filesize: 256, faf001_status: 324010001, faf001_version: 1, createdon: time })) as Faf001_bpartifacts[]
const outputs = [
  { faf001_bpdatavalueid: 'nested', faf001_datakey: 'order.details', faf001_datatype: 324010004, faf001_valuejson: '{"customer":{"name":"Contoso","address":{"city":"Milan"}},"lines":[{"sku":"PART-123","quantity":0,"available":false}],"notes":null,"tags":[],"extra":{}}', _faf001_bpstepid_value: 'extract' },
  { faf001_bpdatavalueid: 'markdown-output', faf001_datakey: 'review.summary', faf001_datatype: 324010006, faf001_valuetext: '# Validation summary\n\n**Approved** after review.\n\n| Field | Result |\n| --- | --- |\n| Order | Accepted |\n\n[Unsafe](javascript:alert(1))\n\n![Hidden](https://example.invalid/hidden.png)\n\n<script>alert("not executed")</script>', _faf001_bpstepid_value: 'review' },
  { faf001_bpdatavalueid: 'invalid-json', faf001_datakey: 'invalid.json', faf001_datatype: 324010004, faf001_valuejson: '{broken' },
  { faf001_bpdatavalueid: 'decision', faf001_datakey: 'review.decision', faf001_datatype: 324010000, faf001_valuetext: 'approved', _faf001_bpstepid_value: 'review' },
  { faf001_bpdatavalueid: 'zero', faf001_datakey: 'order.discount', faf001_datatype: 324010001, faf001_valuenumber: 0, _faf001_bpstepid_value: 'extract' },
  { faf001_bpdatavalueid: 'false', faf001_datakey: 'order.expedited', faf001_datatype: 324010002, faf001_valueboolean: false, _faf001_bpstepid_value: 'extract' },
  { faf001_bpdatavalueid: 'unlinked', faf001_datakey: 'process.notes', faf001_datatype: 324010000, faf001_valuetext: 'Process-wide output without a step' },
] as Faf001_bpdatavalues[]

processApi.invoke = async <Operation extends ProcessReadOperation>(operation: Operation, processId: string) => {
  if (processId !== instanceId) throw new Error('Unexpected process identity')
  window.processDetailTest.calls.push(operation)
  window.processDetailTest.pages += 1
  if (operation === 'faf001_GetArtifacts' && window.processDetailTest.failArtifacts) throw new Error('Fixture access denied')
  if (operation === 'faf001_GetProcess' && params.has('detail-error')) throw new Error('Fixture detail denied')
  const summaries = steps.map(step => ({
    id: step.faf001_bpstepid, name: step.faf001_stepname, type: step.faf001_steptype, status: step.faf001_status,
    startDate: step.faf001_starttime ?? null, endDate: step.faf001_endtime ?? null,
    executedBy: step.faf001_bpstepid === 'review'
      ? { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Alex Reviewer' }
      : null,
    outputs: outputs.filter(output => output._faf001_bpstepid_value === step.faf001_bpstepid).map(output => ({ id: output.faf001_bpdatavalueid, name: output.faf001_datakey, type: output.faf001_datatype })),
    artifacts: artifacts.filter(artifact => artifact._faf001_bpstepid_value === step.faf001_bpstepid).map(artifact => ({ id: artifact.faf001_bpartifactid, name: artifact.faf001_artifactname, type: artifact.faf001_artifacttype ?? null })),
  }))
  const rows = operation === 'faf001_GetAttachments' ? attachments : operation === 'faf001_GetArtifacts' ? artifacts : outputs
  const data = operation === 'faf001_GetProcess'
    ? { faf001_Process: { faf001_bpinstanceid: instanceId, faf001_status: 324010004 }, faf001_StepsJson: params.has('malformed') ? '{broken' : JSON.stringify(empty ? [] : summaries) }
    : { value: empty ? [] : rows.map(row => ({ ...Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('faf001_value') && key !== 'faf001_file_name')), _faf001_bpinstanceid_value: instanceId })) }
  return { success: true, data: data as ProcessReadResponses[Operation] }
}
Faf001_bpdatavaluesService.get = async id => {
  window.processDetailTest.reads.push(`output:${id}`)
  if (window.processDetailTest.failOutput) throw new Error('Fixture output denied')
  const data = outputs.find(output => output.faf001_bpdatavalueid === id)
  if (!data) throw new Error('Output not found')
  return { success: true, data }
}
Faf001_bpartifactsService.get = async id => {
  window.processDetailTest.reads.push(`artifact:${id}`)
  const data = artifacts.find(artifact => artifact.faf001_bpartifactid === id)
  if (!data) throw new Error('Artifact not found')
  return { success: true, data }
}
Faf001_bpartifactsService.downloadFile = async (id) => {
  window.processDetailTest.downloads.push(id)
  if (window.processDetailTest.failFile) throw new Error('Fixture download denied')
  return { success: true, data: new TextEncoder().encode(id === 'json' ? '{"order":"PO-123","total":0}' : '# Review notes\nApproved after verification.\n<script>alert("not executed")</script>') }
}
Faf001_bpattachmentsService.downloadFile = async (id) => {
  window.processDetailTest.downloads.push(id)
  return { success: true, data: new TextEncoder().encode('Fixture document') }
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
export function FixtureDetail() {
  const query = useInstanceDetail(instanceId)
  if (query.isPending) return <p role="status">Loading process...</p>
  if (query.error) return <p role="alert">{query.error.message}</p>
  return <InstanceDetailContent instanceId={instanceId} active={false} detail={query.data} />
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold">Purchase order processing</h1>
      <FixtureDetail />
    </main>
  </QueryClientProvider>,
)