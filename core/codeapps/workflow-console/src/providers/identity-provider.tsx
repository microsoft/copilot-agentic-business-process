import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { useIdentityQuery } from '@/lib/identity/useIdentityQuery'
import { IdentityContext } from '@/providers/identity-context'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Blocks the app until the Dataverse identity is known. Every task query filters on
 * `systemUserId`, so rendering children without it would silently show an empty work queue.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error } = useIdentityQuery()

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-10 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="rounded-lg border border-destructive/50 p-6 space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            <h1 className="font-semibold">Could not resolve your Dataverse identity</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            The console needs your Dataverse user and team membership to determine which tasks are
            assigned to you.
          </p>
          <pre className="text-xs bg-muted rounded p-3 overflow-auto">
            {error instanceof Error ? error.message : 'Unknown error'}
          </pre>
        </div>
      </div>
    )
  }

  return <IdentityContext.Provider value={data}>{children}</IdentityContext.Provider>
}
