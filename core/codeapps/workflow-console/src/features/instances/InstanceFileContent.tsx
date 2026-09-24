import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink, Eye, File, FileArchive, FileImage, FileJson, FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react'
import { Faf001_bpattachmentsService, Faf001_bpartifactsService } from '@/generated'
import { Button } from '@/components/ui/button'
import { artifactFile, MAX_DISPLAY_CHARS, MAX_PREVIEW_BYTES, safeFileUrl, textKind } from './instance-detail-model'
import { ProcessTextContent } from './ProcessTextContent'
import { ProcessResourceItem } from './ProcessResourceItem'

export interface ProcessFile {
  id: string
  entity: 'attachment' | 'artifact'
  name: string
  mime?: string
  size?: number
  storage?: number
  externalUrl?: string
  modified?: string
}

async function downloadBytes(file: ProcessFile): Promise<Uint8Array> {
  const service = file.entity === 'attachment' ? Faf001_bpattachmentsService : Faf001_bpartifactsService
  const result = await service.downloadFile(file.id, 'faf001_file')
  if (!result.success || !result.data) throw new Error(result.error?.message ?? 'File is unavailable')
  return new Uint8Array(result.data)
}

async function loadText(file: ProcessFile, signal: AbortSignal): Promise<string> {
  if (!textKind(file.name, file.mime)) throw new Error('This file cannot be previewed as text')
  let bytes: Uint8Array
  if (file.storage !== 324010002 && file.externalUrl) {
    const url = safeFileUrl(file.externalUrl)
    if (!url) throw new Error('File URL is not supported')
    const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!response.ok) throw new Error('File preview is unavailable. Open the source from the file tab.')
    if (!textKind(file.name, response.headers.get('content-type') ?? file.mime)) throw new Error('The source did not return a text file')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('File content is unavailable')
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        length += chunk.value.byteLength
        if (length > MAX_PREVIEW_BYTES) throw new Error('File exceeds the 10 MB preview limit')
        chunks.push(chunk.value)
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  } else {
    bytes = await downloadBytes(file)
  }
  signal.throwIfAborted()
  if (bytes.byteLength > MAX_PREVIEW_BYTES) throw new Error('File exceeds the 10 MB preview limit')
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (decoded.includes('\0')) throw new Error('File contains binary content')
  return decoded
}

export function ReadOnlyContent({ text }: { text: string }) {
  return <div className="min-w-0">
    <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text === '' ? '(empty)' : text.slice(0, MAX_DISPLAY_CHARS)}</pre>
    {text.length > MAX_DISPLAY_CHARS && <p className="mt-1 text-xs text-muted-foreground">Showing the first {MAX_DISPLAY_CHARS.toLocaleString()} characters.</p>}
  </div>
}

function TextPreview({ file }: { file: ProcessFile }) {
  const [requested, setRequested] = useState(false)
  const tooLarge = file.size != null && file.size > MAX_PREVIEW_BYTES
  const query = useQuery({
    queryKey: ['instance-file-text', file.entity, file.id, file.modified, file.externalUrl, file.mime, file.size],
    enabled: !tooLarge && (requested || file.size != null),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: ({ signal }) => loadText(file, signal),
  })
  if (tooLarge) return <p className="text-xs text-muted-foreground">File exceeds the 10 MB preview limit. Download it from the file tab.</p>
  if (!requested && file.size == null) return <Button size="sm" variant="outline" onClick={() => setRequested(true)}><Eye className="size-4" /> Load text preview</Button>
  if (query.isPending) return <p role="status" className="text-xs text-muted-foreground">Loading text...</p>
  if (query.error) return <div role="alert" className="text-xs text-destructive">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></div>
  return <ProcessTextContent text={query.data ?? ''} kind={textKind(file.name, file.mime) ?? 'text'} name={file.name} />
}

function FileBody({ file, children }: { file: ProcessFile; children?: ReactNode }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string>()
  const urls = useRef(new Set<string>())
  const alive = useRef(true)
  useEffect(() => {
    const ownedUrls = urls.current
    alive.current = true
    return () => { alive.current = false; ownedUrls.forEach(URL.revokeObjectURL); ownedUrls.clear() }
  }, [])
  const kind = textKind(file.name, file.mime)
  const external = file.storage !== 324010002 && !!file.externalUrl
  const url = external ? safeFileUrl(file.externalUrl) : undefined

  async function download() {
    setDownloading(true)
    setError(undefined)
    try {
      const bytes = await downloadBytes(file)
      if (!alive.current) return
      const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }))
      urls.current.add(objectUrl)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = file.name.replace(/[\\/]/g, '_')
      anchor.click()
      setTimeout(() => { URL.revokeObjectURL(objectUrl); urls.current.delete(objectUrl) }, 30000)
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'Download failed')
    } finally {
      if (alive.current) setDownloading(false)
    }
  }

  return <>
      <div className="flex items-center gap-1">
        {external ? url ? <Button size="icon" variant="ghost" asChild><a href={url} target="_blank" rel="noopener noreferrer" title="Open source file" aria-label={`Open ${file.name}`}><ExternalLink className="size-4" /></a></Button> : <span className="text-xs text-destructive">Invalid file URL</span>
          : <Button size="icon" variant="ghost" title="Download file" aria-label={`Download ${file.name}`} disabled={downloading} onClick={() => void download()}>{downloading ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}</Button>}
      </div>
    {children}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {kind && <TextPreview key={`${file.id}:${file.modified}`} file={file} />}
  </>
}

function ArtifactContent({ file, children }: { file: ProcessFile; children?: ReactNode }) {
  const query = useQuery({
    queryKey: ['instance-resource', 'artifact', file.id, file.modified],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await Faf001_bpartifactsService.get(file.id, { select: [
        'faf001_bpartifactid', 'faf001_artifactname', 'faf001_file_name', 'faf001_mimetype',
        'faf001_filesize', 'faf001_storagetype', 'faf001_externalurl', 'modifiedon',
      ] })
      signal.throwIfAborted()
      if (!result.success || !result.data) throw new Error(result.error?.message ?? 'Artifact is unavailable')
      return artifactFile(result.data)
    },
  })
  if (query.isPending) return <p role="status" className="text-xs text-muted-foreground">Loading artifact...</p>
  if (query.error) return <div role="alert" className="text-xs text-destructive">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></div>
  return <FileBody file={query.data}>{children}</FileBody>
}

export function InstanceFileContent({ file, children }: { file: ProcessFile; children?: ReactNode }) {
  const kind = textKind(file.name, file.mime)
  const extension = file.name.split('.').pop()?.toLowerCase()
  const Icon = kind === 'json' ? FileJson
    : kind || /\.(pdf|docx?)$/i.test(file.name) ? FileText
    : /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name) ? FileImage
    : /\.(xlsx?|csv)$/i.test(file.name) ? FileSpreadsheet
    : /\.(zip|7z|gz)$/i.test(file.name) ? FileArchive : File
  return <ProcessResourceItem summary={<>
    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0 flex-1 break-words text-sm [overflow-wrap:anywhere]">{file.name}</span>
    <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{extension && extension.length <= 8 ? extension : 'file'}</span>
  </>}>
    {file.entity === 'artifact' ? <ArtifactContent file={file}>{children}</ArtifactContent> : <FileBody file={file}>{children}</FileBody>}
  </ProcessResourceItem>
}