/**
 * Query building and response shaping shared by the openFDA API handlers
 */

import type { Either } from "functype"
import { None, Option, Some } from "functype"

import type { FDAResponse, FDAToolResponse, SearchParams } from "../types/fda.js"
import { fdaAPIClient } from "../utils/api-client.js"
import { failure } from "../utils/errors.js"
import { nonEmpty } from "../utils/fields.js"

export type SearchTerm = { field: string; value?: string }

/** Escape characters that have meaning in openFDA's search syntax */
export function escapeSearchTerm(term: string): string {
  return term.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, "\\$&").replace(/\s+/g, "+")
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
    .join("+AND+")
}

/** A date range clause, or None when neither bound is given. openFDA dates are YYYYMMDD. */
export function buildDateQuery(field: string, dateFrom?: string, dateTo?: string): Option<string> {
  const bound = (date?: string): string =>
    Option(date)
      .map((d) => d.replace(/-/g, ""))
      .orElse("*")

  const hasBound = [dateFrom, dateTo].some((date) => nonEmpty(date).isSome())

  return hasBound ? Some(`${field}:[${bound(dateFrom)}+TO+${bound(dateTo)}]`) : None()
}

/** Join a search query with optional extra clauses, skipping empty parts */
export function joinQueries(searchQuery: string, ...clauses: readonly Option<string>[]): string {
  return [searchQuery, ...clauses.flatMap((clause) => clause.toArray())].filter((part) => part !== "").join("+AND+")
}

/** Shorten long text for display; None for missing or empty text */
export function truncateText(text: string | undefined, maxLength = 200): Option<string> {
  return Option(text)
    .filter((t) => t !== "")
    .map((t) => (t.length > maxLength ? `${t.substring(0, maxLength)}...` : t))
}

/** Turn a client result into the tool response, formatting each record */
export function toSearchResponse<R, F>(
  result: Either<Error, FDAResponse<R>>,
  searchParams: SearchParams,
  format: (record: R) => F,
): FDAToolResponse<F[]> {
  return result.fold(failure<F[]>, (response) => {
    const results = response.results ?? []
    return {
      success: true,
      data: results.map(format),
      totalResults: response.meta?.results?.total,
      displayedResults: results.length,
      searchParams,
      apiUsage: fdaAPIClient.getRateLimitInfo(),
    }
  })
}
