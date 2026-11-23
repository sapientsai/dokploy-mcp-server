/**
 * Query building and response shaping shared by the openFDA API handlers
 */

import type { Either, Wire } from "functype"
import { None, Option, Some } from "functype"

import type { FDAResponse, FDAToolResponse, SearchParams } from "../types/fda.js"
import { fdaAPIClient, type FDAClient } from "../utils/api-client.js"
import { failure } from "../utils/errors.js"
import { nonEmpty } from "../utils/fields.js"

export type SearchTerm = { field: string; value?: string }

/**
 * Escape characters that have meaning in openFDA's search syntax.
 *
 * Queries use real spaces (`a:"x" AND b:[1 TO 2]`). URLSearchParams sends a
 * space as `+`, which openFDA reads as a space; a literal `+` would arrive as
 * `%2B`, which openFDA does not read as an operator separator.
 */
export function escapeSearchTerm(term: string): string {
  return term.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, "\\$&").replace(/\s+/g, " ")
}

/** AND together the terms that have a non-blank value */
export function buildSearchQuery(terms: readonly SearchTerm[]): string {
  return terms
    .flatMap((term) =>
      Option(term.value)
        .filter((value) => value.trim() !== "")
        .map((value) => `${term.field}:"${escapeSearchTerm(value)}"`)
        .toArray(),
    )
    .join(" AND ")
}

/** A date range clause, or None when neither bound is given. openFDA dates are YYYYMMDD. */
export function buildDateQuery(field: string, dateFrom?: string, dateTo?: string): Option<string> {
  const bound = (date?: string): string =>
    Option(date)
      .map((d) => d.replace(/-/g, ""))
      .getOrElse(() => "*")

  const hasBound = [dateFrom, dateTo].some((date) => nonEmpty(date).isSome())

  return hasBound ? Some(`${field}:[${bound(dateFrom)} TO ${bound(dateTo)}]`) : None()
}

/** One value matched against any of several fields: `(a:"x" OR b:"x")`; None without a value */
export function anyFieldQuery(fields: readonly string[], value: string | undefined): Option<string> {
  return Option(value)
    .filter((v) => v.trim() !== "")
    .map((v) => `(${fields.map((field) => `${field}:"${escapeSearchTerm(v)}"`).join(" OR ")})`)
}

/** Join a search query with optional extra clauses, skipping empty parts */
export function joinQueries(searchQuery: string, ...clauses: readonly Option<string>[]): string {
  return [searchQuery, ...clauses.flatMap((clause) => clause.toArray())].filter((part) => part !== "").join(" AND ")
}

/** Text for a response, cut to maxLength (ending in "...") when longer, and whether it was cut */
export type ClippedText = { text: string; truncated: boolean }

/** Empty or missing text is None; longer text is cut to maxLength and marked as cut */
export function clipText(text: string | undefined, maxLength = 200): Option<ClippedText> {
  return Option(text)
    .filter((t) => t !== "")
    .map((t) =>
      t.length > maxLength
        ? { text: `${t.substring(0, maxLength)}...`, truncated: true }
        : { text: t, truncated: false },
    )
}

/** A record's text fields as they go into a response, and the names of the ones that were cut */
export type ClippedFields<K extends string> = Wire<{
  text: Record<K, string | undefined>
  truncated: K[] | undefined
}>

/**
 * A record's clipped text fields, plus the names of the fields that were cut (undefined when none
 * were), so a caller can tell a shortened field from a short one.
 */
export function clipFields<K extends string>(fields: Readonly<Record<K, Option<ClippedText>>>): ClippedFields<K> {
  // Object.entries types every key as string; these are the record's own keys, so K.
  const entries = (Object.entries(fields) as ReadonlyArray<[string, Option<ClippedText>]>).map(
    ([name, clipped]) => [name as K, clipped] as const,
  )
  const truncated = entries.filter(([, clipped]) => clipped.exists((c) => c.truncated)).map(([name]) => name)
  return {
    text: Object.fromEntries(
      entries.map(([name, clipped]) => [name, clipped.map((c) => c.text).orUndefined()]),
    ) as ClippedFields<K>["text"],
    truncated: truncated.length > 0 ? truncated : undefined,
  }
}

/** Turn a client result into the tool response, formatting each record */
export function toSearchResponse<R, F>(
  result: Either<Error, FDAResponse<R>>,
  searchParams: SearchParams,
  format: (record: R) => F,
  client: FDAClient = fdaAPIClient,
): FDAToolResponse<ReadonlyArray<F>> {
  return result.fold(failure<ReadonlyArray<F>>, (response) => {
    const results = response.results ?? []
    return {
      success: true,
      data: results.map(format),
      totalResults: response.meta?.results?.total,
      displayedResults: results.length,
      searchParams,
      apiUsage: client.getRateLimitInfo(),
    }
  })
}
