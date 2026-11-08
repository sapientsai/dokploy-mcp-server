/**
 * Field access for loosely-typed rows (parsed bulk files, JSON API records)
 */

import { List, None, type Option, Some } from "functype"

const asText = (value: unknown): Option<string> => {
  if (typeof value === "string") return Some(value)
  if (typeof value === "number" && Number.isFinite(value)) return Some(String(value))
  return None()
}

/**
 * The value of the first key that holds text, or "" when none does.
 * An empty string counts as present, as it did with `??` chains; null,
 * missing and non-text values are skipped. Numbers are kept as text.
 */
export const textField = (row: Readonly<Record<string, unknown>>, ...keys: readonly string[]): string =>
  List(keys)
    .find((key) => asText(row[key]).isSome())
    .flatMap((key) => asText(row[key]))
    .orElse("")
