import { createContext } from 'react'
import type { Identity } from '@/lib/identity/useIdentityQuery'

/** Always populated below the provider -- it blocks rendering until identity resolves. */
export const IdentityContext = createContext<Identity | null>(null)
