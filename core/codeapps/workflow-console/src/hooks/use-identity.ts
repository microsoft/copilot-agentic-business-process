import { useContext } from 'react'
import { IdentityContext } from '@/providers/identity-context'
import type { Identity } from '@/lib/identity/useIdentityQuery'

export function useIdentity(): Identity {
  const identity = useContext(IdentityContext)
  if (!identity) {
    throw new Error('useIdentity must be used inside <IdentityProvider>')
  }
  return identity
}
