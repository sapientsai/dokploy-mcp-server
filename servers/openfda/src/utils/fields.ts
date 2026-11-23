/**
 * Field access for loosely-typed rows (parsed bulk files, JSON API records)
 */

import { List, Option } from "functype"

const isText = (value: unknown): value is string | number =>
  typeof value === "string" || (typeof value === "number" && Number.isFinite(value))

/** A plain JSON object (not null, not an array) */
export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * The value of the first key that holds text, or "" when none does.
 * An empty string counts as present, as it did with `??` chains; null,
 * missing and non-text values are skipped. Numbers are kept as text.
 */
export const textField = (row: Readonly<Record<string, unknown>>, ...keys: readonly string[]): string => {
  // Hot path: bulk loads call this about a million times, so it reads the keys natively.
  // Building a functype List per call made a full Orange Book load cost ~10 s of CPU.
  const value = keys.map((key) => row[key]).find(isText)
  return value === undefined ? "" : String(value)
}

/** The first n items of a list from an FDA record, mapped; [] when the list is missing or not an array */
export const mapFirst = <T, U>(items: readonly T[] | undefined, n: number, f: (item: T) => U): U[] =>
  Option(items)
    .filter((xs) => Array.isArray(xs))
    .fold(
      (): U[] => [],
      (xs) => List(xs).take(n).map(f).toArray(),
    )

/** The first n items of a list from an FDA record; [] when the list is missing */
export const takeFirst = <T>(items: readonly T[] | undefined, n: number): T[] => mapFirst(items, n, (item) => item)

/** A text field that is present and not empty */
export const nonEmpty = (value: string | undefined): Option<string> => Option(value).filter((v) => v !== "")
