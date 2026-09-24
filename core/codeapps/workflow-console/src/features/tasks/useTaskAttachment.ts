/**
 * Attachment lookup + preview URL resolution.
 *
 * `faf001_inputdata` carries no attachment reference, so the source document is found by walking
 * back to the task's instance. Dataverse-stored files use object URLs for opening and PDF previews,
 * and data URLs for images to comply with the hosted app's img-src policy. Object URLs are revoked
 * when the component goes away.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Faf001_bpattachmentsService } from '@/generated'
import type { Faf001_bpattachments } from '@/generated/models/Faf001_bpattachmentsModel'

export type AttachmentRow = Faf001_bpattachments

const ATTACHMENT_COLUMNS = [
  'faf001_bpattachmentid',
  'faf001_filename',
  'faf001_mimetype',
  'faf001_filesize',
  'faf001_externalurl',
  'faf001_storagetype',
  'faf001_attachmenttype',
  'createdon',
]

const STORAGE_DATAVERSE = 324010002

/** Above this, downloading the whole file into memory to preview it is not worth it. */
const MAX_AUTO_PREVIEW_BYTES = 10 * 1024 * 1024

export function useInstanceAttachments(instanceId: string | undefined) {
  return useQuery({
    queryKey: ['instance-attachments', instanceId],
    enabled: !!instanceId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await Faf001_bpattachmentsService.getAll({
        select: ATTACHMENT_COLUMNS,
        filter: `_faf001_bpinstanceid_value eq ${instanceId}`,
        orderBy: ['createdon asc'],
        top: 20,
      })
      if (result.success === false) {
        throw new Error(
          (result.error as Error | undefined)?.message ?? 'Failed to load attachments',
        )
      }
      return result.data ?? []
    },
  })
}

export interface PreviewSource {
  url?: string
  imageUrl?: string
  loading: boolean
  error?: string
  /** Set when the file is too large to inline; the caller offers a manual load instead. */
  tooLarge: boolean
}

export function useAttachmentPreview(attachment: AttachmentRow | undefined): PreviewSource {
  const [state, setState] = useState<PreviewSource>({ loading: false, tooLarge: false })

  const attachmentId = attachment?.faf001_bpattachmentid
  const mimeType = attachment?.faf001_mimetype
  const externalUrl = attachment?.faf001_externalurl
  const storageType = attachment?.faf001_storagetype
  const fileSize = attachment?.faf001_filesize
  const kind = previewKind(attachment)

  // An externally stored file is already addressable; only Dataverse-held bytes need downloading.
  const useExternal = !!externalUrl && storageType !== STORAGE_DATAVERSE

  useEffect(() => {
    if (!attachmentId) {
      setState({ loading: false, tooLarge: false })
      return
    }
    if (useExternal) {
      setState({ url: externalUrl, imageUrl: externalUrl, loading: false, tooLarge: false })
      return
    }
    if (fileSize && fileSize > MAX_AUTO_PREVIEW_BYTES) {
      setState({ loading: false, tooLarge: true })
      return
    }

    let objectUrl: string | undefined
    let reader: FileReader | undefined
    let cancelled = false
    setState({ loading: true, tooLarge: false })

    Faf001_bpattachmentsService.downloadFile(attachmentId, 'faf001_file')
      .then(async (result) => {
        if (cancelled) return
        if (result.success === false || !result.data) {
          throw new Error(
            (result.error as Error | undefined)?.message ?? 'Attachment has no stored file',
          )
        }
        const bytes = result.data
        // Copy into a fresh Uint8Array: the SDK's buffer type is not always a valid BlobPart.
        const blob = new Blob([new Uint8Array(bytes)], {
          type: mimeType || 'application/octet-stream',
        })
        const imageUrl = kind === 'image'
          ? await new Promise<string>((resolve, reject) => {
              reader = new FileReader()
              reader.onload = () => {
                if (typeof reader?.result === 'string') resolve(reader.result)
                else reject(new Error('Failed to prepare image preview'))
              }
              reader.onerror = () => reject(new Error('Failed to read image preview'))
              reader.onabort = () => reject(new Error('Image preview cancelled'))
              reader.readAsDataURL(blob)
            })
          : undefined
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setState({ url: objectUrl, imageUrl, loading: false, tooLarge: false })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          loading: false,
          tooLarge: false,
          error: err instanceof Error ? err.message : 'Failed to load attachment',
        })
      })

    return () => {
      cancelled = true
      if (reader?.readyState === FileReader.LOADING) reader.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachmentId, mimeType, externalUrl, useExternal, fileSize, kind])

  return state
}

export type PreviewKind = 'pdf' | 'image' | 'other'

export function previewKind(attachment: AttachmentRow | undefined): PreviewKind {
  if (!attachment) return 'other'
  const mime = (attachment.faf001_mimetype ?? '').toLowerCase()
  const name = (attachment.faf001_filename ?? '').toLowerCase()
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image'
  return 'other'
}

export function useFirstPreviewable(attachments: AttachmentRow[] | undefined) {
  return useMemo(() => {
    if (!attachments?.length) return undefined
    return attachments.find((a) => previewKind(a) !== 'other') ?? attachments[0]
  }, [attachments])
}

export function formatBytes(size: number | undefined): string {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
