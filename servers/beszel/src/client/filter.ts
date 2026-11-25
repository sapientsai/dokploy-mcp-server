/**
 * PocketBase filters are text, so a value only ever enters one through `quote`. PocketBase's parser
 * (fexpr) reads `\\` and `\"` inside a double-quoted string as a literal backslash and quote.
 */
export const quote = (value: string): string => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`

export const equals = (field: string, value: string): string => `${field} = ${quote(value)}`

/** Joins the clauses with `&&`, each in parentheses. An empty clause is left out. */
export const and = (...clauses: ReadonlyArray<string>): string =>
  clauses
    .filter((c) => c !== "")
    .map((c) => `(${c})`)
    .join(" && ")

/**
 * PocketBase stores dates as text in the layout "2006-01-02 15:04:05.000Z" and compares them as text,
 * so a bound must be in that layout: an ISO string's "T" sorts after the stored space.
 */
export const pocketbaseDate = (date: Date): string => date.toISOString().replace("T", " ")
