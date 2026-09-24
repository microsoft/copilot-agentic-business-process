import type { Faf001_bpsteps } from '../../generated/models/Faf001_bpstepsModel'
import type { Faf001_bpdatavalues } from '../../generated/models/Faf001_bpdatavaluesModel'
import type { Faf001_bpartifacts } from '../../generated/models/Faf001_bpartifactsModel'
import type { Faf001_bpattachments } from '../../generated/models/Faf001_bpattachmentsModel'
import type { ProcessFile } from './InstanceFileContent'

export function artifactFile(row: Partial<Faf001_bpartifacts> & Pick<Faf001_bpartifacts, 'faf001_bpartifactid'>): ProcessFile {
  return { id: row.faf001_bpartifactid, entity: 'artifact',
    name: row.faf001_file_name || row.faf001_artifactname || 'Artifact', mime: row.faf001_mimetype,
    size: row.faf001_filesize, storage: row.faf001_storagetype,
    externalUrl: row.faf001_externalurl, modified: row.modifiedon }
}

export function attachmentFile(row: Partial<Faf001_bpattachments> & Pick<Faf001_bpattachments, 'faf001_bpattachmentid'>): ProcessFile {
  return { id: row.faf001_bpattachmentid, entity: 'attachment',
    name: row.faf001_filename || 'Attachment', mime: row.faf001_mimetype,
    size: row.faf001_filesize, storage: row.faf001_storagetype,
    externalUrl: row.faf001_externalurl, modified: row.modifiedon }
}

export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024
export const MAX_DISPLAY_CHARS = 50000

export async function collectPages<Row>(
  load: (skipToken?: string) => Promise<{
    success: boolean
    data?: Row[]
    error?: { message?: string }
    skipToken?: string
  }>,
  idOf: (row: Row) => string,
): Promise<Row[]> {
  const rows = new Map<string, Row>()
  const tokens = new Set<string>()
  let token: string | undefined
  do {
    const result = await load(token)
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to load process records')
    for (const row of result.data ?? []) rows.set(idOf(row), row)
    token = result.skipToken
    if (token && tokens.has(token)) throw new Error('Repeated page token; refresh to retry')
    if (token) tokens.add(token)
  } while (token)
  return [...rows.values()]
}

function timestamp(value?: string): number | undefined {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

export function sortSteps(steps: Faf001_bpsteps[]): Faf001_bpsteps[] {
  const time = (step: Faf001_bpsteps) => timestamp(step.faf001_starttime) ?? timestamp(step.createdon) ?? Infinity
  return [...steps].sort((left, right) => {
    const difference = time(left) - time(right)
    return (Number.isNaN(difference) ? 0 : difference) || left.faf001_bpstepid.localeCompare(right.faf001_bpstepid)
  })
}

export function forStep<Row extends { _faf001_bpstepid_value?: string }>(rows: Row[], stepId: string): Row[] {
  return rows.filter((row) => row._faf001_bpstepid_value?.toLowerCase() === stepId.toLowerCase())
}

export function stepDuration(start?: string, end?: string): string {
  const started = timestamp(start)
  const ended = timestamp(end)
  if (started === undefined || ended === undefined || ended < started) return '--'
  const seconds = Math.floor((ended - started) / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export type TextKind = 'text' | 'json' | 'markdown'

export function textKind(name: string, mimeType?: string): TextKind | undefined {
  const mime = (mimeType ?? '').split(';')[0].trim().toLowerCase()
  const extension = name.toLowerCase().split('.').pop()
  const extensions: Record<string, TextKind> = { txt: 'text', json: 'json', md: 'markdown', markdown: 'markdown' }
  const mimes: Record<string, TextKind> = {
    'text/plain': 'text', 'application/json': 'json', 'text/json': 'json', 'text/markdown': 'markdown',
  }
  if (/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|svg|html?|zip|exe|xml|csv)$/i.test(name)) return undefined
  if (mime && mime !== 'application/octet-stream' && !mimes[mime] && !/^application\/[\w.-]+\+json$/.test(mime)) return undefined
  return mimes[mime] ?? (mime.endsWith('+json') ? 'json' : extensions[extension ?? ''])
}

export function safeFileUrl(value?: string): string | undefined {
  try {
    const url = new URL(value ?? '')
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch {
    return undefined
  }
}

export function readableJson(value: string): string {
  try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
}

export function outputText(row: Faf001_bpdatavalues): string {
  switch (row.faf001_datatype) {
    case 324010001: return row.faf001_valuenumber == null ? '--' : String(row.faf001_valuenumber)
    case 324010002: return row.faf001_valueboolean == null ? '--' : String(row.faf001_valueboolean)
    case 324010003: return row.faf001_valuedatetime ?? '--'
    case 324010004: return row.faf001_valuejson == null ? '--' : readableJson(row.faf001_valuejson)
    default: return row.faf001_valuetext ?? '--'
  }
}