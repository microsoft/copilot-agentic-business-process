/**
 * Opens a specific record when the app is launched with a deep-link parameter.
 *
 * The Power Apps host owns the outer play URL and the iframe path, so a caller cannot simply
 * append `/tasks/<id>`. Parameters travel through `getContext().app.queryParams` instead:
 *
 *   ...&page=StartTaskDetail&taskId=<guid> -> /tasks/<guid>/start
 *   ...&taskId=<guid>        -> /tasks/<guid>/start (legacy Teams links)
 *   ...&instanceId=<guid>    -> /instances/<guid>
 *
 * Runs once on mount and replaces the entry so the back button does not bounce to the queue.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getContext } from '@microsoft/power-apps/app'
import { contextDeepLink } from './context-deep-link'

const localLaunchTarget = contextDeepLink(Object.fromEntries(new URLSearchParams(window.location.search)))

export function useContextDeepLink() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    let cancelled = false
    if (localLaunchTarget) {
      handled.current = true
      void navigate(localLaunchTarget, { replace: true })
      return
    }

    getContext()
      .then((context) => {
        if (cancelled) return
        handled.current = true
        const target = contextDeepLink(context.app.queryParams ?? {})
        if (target) void navigate(target, { replace: true })
      })
      .catch(() => {
        // A missing context must not block the default queue view.
      })

    return () => {
      cancelled = true
    }
  }, [navigate])
}
