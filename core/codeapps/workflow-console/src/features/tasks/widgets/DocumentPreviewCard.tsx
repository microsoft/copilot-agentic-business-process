import { useState } from 'react'
import { FileText, ImageOff, Loader2, X, ZoomIn } from 'lucide-react'
import {
  formatBytes,
  previewKind,
  useAttachmentPreview,
  type AttachmentRow,
} from '@/features/tasks/useTaskAttachment'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * Renders the source document behind a review task.
 *
 * The app itself runs inside an iframe on apps.powerapps.com, so an inner iframe for the PDF can be
 * refused; the "Open in a new tab" action is always available as the escape hatch.
 */
export function DocumentPreviewCard({ attachment }: { attachment?: AttachmentRow }) {
  const { url, imageUrl, loading, error, tooLarge } = useAttachmentPreview(attachment)
  const [zoomed, setZoomed] = useState(false)
  const kind = previewKind(attachment)

  if (!attachment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source document</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No attachment is linked to this process instance.
          </p>
        </CardContent>
      </Card>
    )
  }

  const fileName = attachment.faf001_filename ?? 'Attachment'
  const size = formatBytes(attachment.faf001_filesize)

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{fileName}</span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {[attachment.faf001_mimetype, size].filter(Boolean).join(' \u00b7 ')}
            </p>
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs text-primary underline"
            >
              Open in a new tab
            </a>
          )}
        </CardHeader>

        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading preview...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 p-3 text-sm">
              <ImageOff className="size-4 mt-0.5 text-destructive shrink-0" />
              <span>Could not load the attachment: {error}</span>
            </div>
          )}

          {tooLarge && (
            <p className="text-sm text-muted-foreground">
              This file is too large to preview inline ({size}). Download it from the process
              instead.
            </p>
          )}

          {url && kind === 'pdf' && (
            <iframe
              src={`${url}#toolbar=1&navpanes=0`}
              title={fileName}
              className="h-[600px] w-full rounded-md border bg-muted"
            />
          )}

          {imageUrl && kind === 'image' && (
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border bg-muted"
            >
              <img src={imageUrl} alt={fileName} className="h-72 w-full object-contain" />
              <span className="absolute right-2 top-2 rounded bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn className="size-4" />
              </span>
            </button>
          )}

          {url && kind === 'other' && (
            <p className="text-sm text-muted-foreground">
              No inline preview for this file type.
            </p>
          )}
        </CardContent>
      </Card>

      {zoomed && imageUrl && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between text-sm text-white">
            <span className="truncate">{fileName}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setZoomed(false)}
              className="text-white hover:bg-white/20 hover:text-white"
              aria-label="Close preview"
            >
              <X className="size-4" />
            </Button>
          </div>
          <button
            type="button"
            className="flex flex-1 cursor-zoom-out items-center justify-center overflow-auto"
            onClick={() => setZoomed(false)}
          >
            <img src={imageUrl} alt={fileName} className="max-h-[85vh] max-w-full object-contain" />
          </button>
        </div>
      )}
    </>
  )
}
