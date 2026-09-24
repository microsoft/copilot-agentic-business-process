import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProcessResourceItem({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  return <div className="min-w-0">
    <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)} className="flex w-full min-w-0 items-center gap-2 rounded-sm py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring">
      <ChevronRight aria-hidden="true" className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-90')} />
      {summary}
    </button>
    <div id={contentId} hidden={!expanded} className="min-w-0 space-y-2 pt-3 pl-6">{expanded && children}</div>
  </div>
}