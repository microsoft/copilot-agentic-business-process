/**
 * Read-only escape hatch over the Microsoft Dataverse *connector*
 * (`shared_commondataserviceforapps`).
 *
 * The native Dataverse data sources are strongly typed but their query options are limited to
 * `select | filter | orderBy | top | skip | count | skipToken` -- there is no `$expand` and no
 * FetchXML. Anything that needs a join (notably the `teammembership` N:N used to resolve which
 * teams the caller belongs to) has to go through the connector, which does expose both.
 *
 * Writes deliberately stay on the typed native services; this module is reads only.
 */
import { getContext } from '@microsoft/power-apps/app'
import { MicrosoftDataverseService } from '@/generated'

/** A Dataverse row is a flat bag of columns plus `@odata.*` annotations. */
export type DataverseRow = Record<string, unknown>

export interface ListRowsOptions {
  select?: string[]
  filter?: string
  orderBy?: string[]
  top?: number
  expand?: string
  /** FetchXML query. When set, Dataverse ignores the other query options. */
  fetchXml?: string
}

const ACCEPT = 'application/json'
/** Asks Dataverse to return choice labels and lookup display names alongside the raw values. */
const READ_PREFER = 'odata.include-annotations="*"'

/** Suffix Dataverse appends for the human-readable form of a column. */
export const FORMATTED = '@OData.Community.Display.V1.FormattedValue'

/** Reads `<column>@OData...FormattedValue` off a connector row. */
export function formattedValue(row: DataverseRow, column: string): string | undefined {
  const value = row[`${column}${FORMATTED}`]
  return typeof value === 'string' ? value : undefined
}

interface ConnectorResult<T> {
  success?: boolean
  data?: T
  error?: unknown
}

/**
 * Unwraps the connector result envelope. The connector usually stuffs a JSON document into
 * `error.message`, so surface its inner `Message` rather than the raw blob.
 */
function unwrap<T>(result: ConnectorResult<T>): T {
  if (result.success === false) {
    const error = result.error as { message?: string } | undefined
    let message = error?.message ?? 'Unknown Dataverse connector error'
    try {
      const parsed = JSON.parse(message) as { Message?: string }
      if (parsed.Message) message = parsed.Message
    } catch {
      // message was not JSON -- use it as-is
    }
    throw new Error(message)
  }
  return result.data as T
}

let cachedOrgUrl: string | undefined

/**
 * The connector data source is registered against a connection reference with no dataset, so the
 * "current environment" operations resolve a null org. Every call therefore uses the
 * `...WithOrganization` variant with the org URL taken from the Power Apps context.
 */
async function getOrgUrl(): Promise<string> {
  if (cachedOrgUrl) return cachedOrgUrl
  const context = await getContext()
  const orgUrl = context.app.dataverseOrgUrl
  if (!orgUrl) {
    throw new Error(
      'context.app.dataverseOrgUrl is not available; cannot call the Dataverse connector.',
    )
  }
  cachedOrgUrl = orgUrl
  return orgUrl
}

/**
 * List rows from any Dataverse table the caller can read.
 * @param entityName plural entity set name, e.g. `teams` or `faf001_bptasks`
 */
export async function listRows(
  entityName: string,
  options: ListRowsOptions = {},
): Promise<DataverseRow[]> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    await getOrgUrl(),
    entityName,
    READ_PREFER,
    ACCEPT,
    undefined, // x-ms-odata-metadata-full
    undefined, // MSCRM.IncludeMipSensitivityLabel
    options.select?.join(','),
    options.filter,
    options.orderBy?.join(','),
    options.expand,
    options.fetchXml,
    options.top,
  )
  const envelope = result as unknown as ConnectorResult<{ value?: DataverseRow[] }>
  return unwrap(envelope).value ?? []
}
