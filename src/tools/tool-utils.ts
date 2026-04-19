/**
 * Returns a new object containing only the properties of `source` whose keys
 * appear in `keys` AND whose values are not `undefined`. Defined falsy values
 * (0, "", false, null) are preserved.
 *
 * Used by tools that build request bodies by copying over a fixed set of
 * optional fields from args — the alternative is an imperative for..of loop
 * that also triggers the functype/no-imperative-loops lint rule.
 */
export function pickDefined<T extends Record<string, unknown>, K extends readonly (keyof T)[]>(
  source: T,
  keys: K,
): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]))
}
