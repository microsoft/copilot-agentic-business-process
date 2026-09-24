import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MAX_DISPLAY_CHARS, safeFileUrl, type TextKind } from './instance-detail-model'

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span className="text-muted-foreground">null</span>
  if (typeof value !== 'object') return <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value === '' ? '(empty)' : String(value)}</span>
  if (depth >= 12) return <span className="text-muted-foreground">Further nesting available in source.</span>
  const entries = Object.entries(value)
  if (!entries.length) return <span className="font-mono text-muted-foreground">{Array.isArray(value) ? '[]' : '{}'}</span>
  return <dl className="min-w-0 divide-y">
    {entries.slice(0, 200).map(([key, child]) => {
      const label = Array.isArray(value) ? `Item ${Number(key) + 1}` : key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
      return <div key={key} className="min-w-0 py-2">
        {child !== null && typeof child === 'object' ? <>
          <dt className="sr-only">{label}</dt>
          <dd><details open={depth < 2} className="min-w-0">
            <summary className="cursor-pointer break-words font-medium [overflow-wrap:anywhere]">{label} <span className="font-normal text-muted-foreground">({Object.keys(child).length})</span></summary>
            <div className="min-w-0 border-l pl-3"><JsonValue value={child} depth={depth + 1} /></div>
          </details></dd>
        </> : <div className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4">
          <dt className="text-muted-foreground [overflow-wrap:anywhere]" title={key}>{label}</dt>
          <dd className="min-w-0"><JsonValue value={child} depth={depth + 1} /></dd>
        </div>}
      </div>
    })}
    {entries.length > 200 && <div className="py-2 text-muted-foreground"><dt>Additional items</dt><dd>{entries.length - 200} more in source.</dd></div>}
  </dl>
}

export function ProcessTextContent({ text, kind, name }: { text: string; kind: TextKind; name: string }) {
  const [sourceUrl, setSourceUrl] = useState<string>()
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }))
    setSourceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [text])
  let parsed: unknown
  let validJson = false
  if (kind === 'json' && text.length <= MAX_DISPLAY_CHARS) {
    try { parsed = JSON.parse(text); validJson = true } catch { validJson = false }
  }
  const rendered = text.length <= MAX_DISPLAY_CHARS && (kind === 'markdown' || validJson)
  const filename = name.replace(/[\\/]/g, '_')
  const source = <pre className="max-h-96 overflow-auto border bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text === '' ? '(empty)' : text.slice(0, MAX_DISPLAY_CHARS)}</pre>
  return <div className="min-w-0 space-y-2">
    <Tabs defaultValue="rendered" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList aria-label={`${name} content view`}>
          <TabsTrigger value="rendered">{kind === 'json' ? 'Structured' : kind === 'markdown' ? 'Rendered' : 'Text'}</TabsTrigger>
          <TabsTrigger value="source">Source{kind === 'json' ? ' .json' : kind === 'markdown' ? ' .md' : ''}</TabsTrigger>
        </TabsList>
        <Button variant="ghost" size="icon" asChild><a href={sourceUrl} download={filename} title={`Download ${filename}`} aria-label={`Download ${filename}`}><Download className="size-4" /></a></Button>
      </div>
      <TabsContent value="rendered" className="min-w-0 text-sm">
        {rendered ? kind === 'json' ? <JsonValue value={parsed} /> : <div className="min-w-0 space-y-3 leading-relaxed [overflow-wrap:anywhere] [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_pre]:overflow-auto [&_pre]:bg-muted [&_pre]:p-3 [&_code]:text-xs [&_th]:border [&_th]:p-2 [&_td]:border [&_td]:p-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeFileUrl(url) ?? ''} components={{
            img: ({ alt }) => <span className="text-muted-foreground">{alt || 'Image'}</span>,
            a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{children}</a> : <span>{children}</span>,
            table: ({ children }) => <div className="max-w-full overflow-auto"><table className="border-collapse text-sm">{children}</table></div>,
          }}>{text}</ReactMarkdown>
        </div> : <>{kind === 'json' && text.length <= MAX_DISPLAY_CHARS && <p className="mb-2 text-xs text-muted-foreground">Invalid JSON. Showing source.</p>}{source}</>}
      </TabsContent>
      <TabsContent value="source" className="min-w-0">{source}</TabsContent>
    </Tabs>
    {text.length > MAX_DISPLAY_CHARS && <p className="text-xs text-muted-foreground">Showing the first {MAX_DISPLAY_CHARS.toLocaleString()} characters. Download the complete source.</p>}
  </div>
}