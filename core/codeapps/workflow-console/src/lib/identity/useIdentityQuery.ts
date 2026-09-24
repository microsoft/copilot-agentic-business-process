/**
 * Resolves the signed-in user's Dataverse identity.
 *
 * Four sources have to be stitched together:
 *  - `getContext()`      -> Entra claims (display name, UPN, object id) but no Dataverse ids
 *  - `WhoAmI`            -> the caller's `systemuserid`, which is what task lookups point at
 *  - `teammembership`    -> the teams the caller belongs to, needed because Dataverse row-level
 *                           security does NOT filter on `faf001_assignedteam`; the work queue has
 *                           to match those team ids explicitly.
 *  - `teamroles` / `systemuserroles` -> the security roles the caller effectively holds, matched
 *                           against `faf001_requiredrole`.
 *
 * These are N:N joins, so they go through the connector rather than a native service. They must
 * throw rather than resolve empty: a silently empty role list would make role-routed tasks vanish
 * from the queue instead of surfacing a permissions problem.
 */
import { useQuery } from '@tanstack/react-query'
import { getContext } from '@microsoft/power-apps/app'
import { WhoAmIService } from '@/generated'
import { listRows } from '@/lib/dataverse/connectorClient'

export interface TeamRef {
  teamid: string
  name: string
}

export interface RoleRef {
  roleid: string
  name: string
}

export interface Identity {
  /** Dataverse `systemuserid` of the caller -- the id `faf001_assignedto` points at. */
  systemUserId: string
  businessUnitId?: string
  fullName?: string
  userPrincipalName?: string
  objectId?: string
  teams: TeamRef[]
  /** Security roles held via a team or assigned directly. */
  roles: RoleRef[]
}

async function fetchTeams(systemUserId: string): Promise<TeamRef[]> {
  const fetchXml = `<fetch>
  <entity name="team">
    <attribute name="teamid" />
    <attribute name="name" />
    <link-entity name="teammembership" from="teamid" to="teamid" intersect="true">
      <filter>
        <condition attribute="systemuserid" operator="eq" value="${systemUserId}" />
      </filter>
    </link-entity>
  </entity>
</fetch>`

  const rows = await listRows('teams', { fetchXml })
  return rows
    .map((row) => ({ teamid: row.teamid as string, name: (row.name as string) ?? 'Unnamed team' }))
    .filter((team) => !!team.teamid)
}

/** Roles reached through team membership, and roles assigned straight to the user. */
async function fetchRoles(systemUserId: string): Promise<RoleRef[]> {
  const viaTeams = `<fetch>
  <entity name="role">
    <attribute name="roleid" />
    <attribute name="name" />
    <link-entity name="teamroles" from="roleid" to="roleid" intersect="true">
      <link-entity name="team" from="teamid" to="teamid">
        <link-entity name="teammembership" from="teamid" to="teamid" intersect="true">
          <filter>
            <condition attribute="systemuserid" operator="eq" value="${systemUserId}" />
          </filter>
        </link-entity>
      </link-entity>
    </link-entity>
  </entity>
</fetch>`

  const direct = `<fetch>
  <entity name="role">
    <attribute name="roleid" />
    <attribute name="name" />
    <link-entity name="systemuserroles" from="roleid" to="roleid" intersect="true">
      <filter>
        <condition attribute="systemuserid" operator="eq" value="${systemUserId}" />
      </filter>
    </link-entity>
  </entity>
</fetch>`

  const [teamRows, directRows] = await Promise.all([
    listRows('roles', { fetchXml: viaTeams }),
    listRows('roles', { fetchXml: direct }),
  ])

  const byId = new Map<string, RoleRef>()
  for (const row of [...teamRows, ...directRows]) {
    const roleid = row.roleid as string | undefined
    if (roleid) byId.set(roleid, { roleid, name: (row.name as string) ?? 'Unnamed role' })
  }
  return [...byId.values()]
}

/** Labels which of the three identity sources failed -- they fail in very different ways. */
async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function fetchIdentity(): Promise<Identity> {
  const context = await step('getContext', () => getContext())
  const whoAmI = await step('WhoAmI', () => WhoAmIService.WhoAmI())

  if (whoAmI.success === false) {
    throw new Error(`WhoAmI failed: ${(whoAmI.error as Error | undefined)?.message ?? 'unknown error'}`)
  }

  const systemUserId = whoAmI.data?.UserId as string | undefined
  if (!systemUserId) {
    throw new Error('WhoAmI did not return a UserId; cannot determine the Dataverse user.')
  }

  return {
    systemUserId,
    businessUnitId: whoAmI.data?.BusinessUnitId as string | undefined,
    fullName: context.user.fullName,
    userPrincipalName: context.user.userPrincipalName,
    objectId: context.user.objectId,
    teams: await step('teammembership', () => fetchTeams(systemUserId)),
    roles: await step('security roles', () => fetchRoles(systemUserId)),
  }
}

export function useIdentityQuery() {
  return useQuery({
    queryKey: ['identity'],
    queryFn: fetchIdentity,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
