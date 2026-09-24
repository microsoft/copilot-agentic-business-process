/**
 * Helpers for hand-building OData filter strings.
 *
 * Dataverse's `$filter` has no `in` operator, so multi-value matches have to be expanded into
 * `or` chains.
 */

/** `field eq a or field eq b ...`, or undefined when there is nothing to match. */
export function anyOf(
  field: string,
  values: readonly (string | number)[],
): string | undefined {
  if (values.length === 0) return undefined
  const clauses = values.map((v) => `${field} eq ${typeof v === 'number' ? v : quoteGuid(v)}`)
  return group(clauses, 'or')
}

/** `field ne a and field ne b ...` -- used to exclude terminal statuses. */
export function noneOf(
  field: string,
  values: readonly (string | number)[],
): string | undefined {
  if (values.length === 0) return undefined
  const clauses = values.map((v) => `${field} ne ${typeof v === 'number' ? v : quoteGuid(v)}`)
  return group(clauses, 'and')
}

/** Joins clauses with `and`, dropping empties. Returns undefined when nothing survives. */
export function and(...clauses: (string | undefined)[]): string | undefined {
  const present = clauses.filter((c): c is string => !!c)
  if (present.length === 0) return undefined
  return present.length === 1 ? present[0] : present.map(wrap).join(' and ')
}

function group(clauses: string[], operator: 'and' | 'or'): string {
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(` ${operator} `)})`
}

function wrap(clause: string): string {
  return clause.startsWith('(') ? clause : `(${clause})`
}

/**
 * Dataverse compares GUIDs unquoted. Reject anything that is not a bare GUID so a caller can
 * never splice arbitrary text into a filter expression.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function quoteGuid(value: string): string {
  if (!GUID.test(value)) {
    throw new Error(`Expected a GUID in an OData filter but received: ${value}`)
  }
  return value
}
