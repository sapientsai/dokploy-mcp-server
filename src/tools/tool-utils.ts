/* eslint-disable functype/prefer-option --
 * Env-blob helpers accept `string | null | undefined` because they sit at the
 * Dokploy API boundary: `application.env` / `compose.env` / `*.env` arrive as
 * raw text that can be missing (undefined), explicitly empty (null), or a
 * KEY=VALUE blob. Wrapping in Option<string> here would force every caller
 * (formatters, env merge tools, getEnvKeys) to unwrap before parsing —
 * unnecessary ceremony for what is functionally "treat absent and empty the
 * same." Nullish handling lives in `parseEnvLines` itself.
 */

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

export type EnvLine = { kind: "raw"; text: string } | { kind: "kv"; key: string; value: string }

type EnvKvLine = Extract<EnvLine, { kind: "kv" }>
const isKv = (l: EnvLine): l is EnvKvLine => l.kind === "kv"

/**
 * Parse a KEY=VALUE blob into a positional list. Blank, comment-only, and
 * malformed (no `=`) lines are preserved as `raw` so they survive a merge.
 * Whitespace around the key is trimmed; the value is taken verbatim after
 * the first `=`.
 */
export function parseEnvLines(blob: string | null | undefined): EnvLine[] {
  if (!blob) return []
  return blob.split("\n").map<EnvLine>((line) => {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) return { kind: "raw", text: line }
    const eq = line.indexOf("=")
    if (eq === -1) return { kind: "raw", text: line }
    const key = line.slice(0, eq).trim()
    if (key === "") return { kind: "raw", text: line }
    return { kind: "kv", key, value: line.slice(eq + 1) }
  })
}

export function serializeEnvLines(lines: EnvLine[]): string {
  return lines.map((l) => (l.kind === "kv" ? `${l.key}=${l.value}` : l.text)).join("\n")
}

/**
 * Merge a set/unset patch into an existing env blob. Existing entries are
 * rewritten in place to preserve relative position; new keys append at the
 * end; comment/blank lines pass through. Returns the merged blob plus the
 * key names actually changed (for masked confirmation output).
 */
export function mergeEnv(
  current: string | null | undefined,
  setBlob: string | undefined,
  unsetKeys: readonly string[] | undefined,
): { blob: string; setKeys: string[]; unsetKeys: string[] } {
  const existing = parseEnvLines(current)
  const setEntries: EnvKvLine[] = parseEnvLines(setBlob).filter(isKv)
  const setLookup: Record<string, string> = Object.fromEntries(setEntries.map((l) => [l.key, l.value]))
  const setKeyList = setEntries.map((l) => l.key)
  const unsetList = unsetKeys ?? []
  const isUnset = (k: string): boolean => unsetList.includes(k)
  const isSet = (k: string): boolean => Object.prototype.hasOwnProperty.call(setLookup, k)

  const existingKvKeys = existing.filter(isKv).map((l) => l.key)
  const replacedKeys = existingKvKeys.filter((k) => isSet(k) && !isUnset(k))
  const isReplaced = (k: string): boolean => replacedKeys.includes(k)

  const fromExisting = existing.flatMap<EnvLine>((line) => {
    if (line.kind === "raw") return [line]
    if (isUnset(line.key)) return []
    if (isSet(line.key)) return [{ kind: "kv", key: line.key, value: setLookup[line.key] }]
    return [line]
  })
  const appended: EnvLine[] = setEntries
    .filter((l) => !isReplaced(l.key))
    .map((l) => ({ kind: "kv", key: l.key, value: l.value }))

  const merged = [...fromExisting, ...appended]
  const actualUnset = unsetList.filter((k) => existingKvKeys.includes(k))
  return {
    blob: serializeEnvLines(merged),
    setKeys: setKeyList,
    unsetKeys: actualUnset,
  }
}

/**
 * Extract key names only (no values) from an env blob, sorted alphabetically.
 * The values never leave the calling process.
 */
export function listEnvKeys(blob: string | null | undefined): string[] {
  return parseEnvLines(blob)
    .filter(isKv)
    .map((l) => l.key)
    .sort()
}

/**
 * Count of distinct KEY entries in a blob (ignoring comments/blank lines).
 */
export function countEnvKeys(blob: string | null | undefined): number {
  return listEnvKeys(blob).length
}

/**
 * Format a masked confirmation for a setEnvVars mutation. Lists the key
 * names that were upserted or removed, but never the values. The "total"
 * is computed from the merged blob, also without echoing it.
 */
export function formatEnvMutation(
  resource: string,
  resourceId: string,
  result: { blob: string; setKeys: string[]; unsetKeys: string[] },
): string {
  const total = countEnvKeys(result.blob)
  const setLine = result.setKeys.length ? `set ${result.setKeys.length} (${result.setKeys.join(", ")})` : "set 0"
  const unsetLine = result.unsetKeys.length
    ? `unset ${result.unsetKeys.length} (${result.unsetKeys.join(", ")})`
    : "unset 0"
  return `Env updated for ${resource} ${resourceId}: ${setLine}; ${unsetLine}; ${total} var${total === 1 ? "" : "s"} total. Values not echoed.`
}

/**
 * Renders an API response body that the OpenAPI spec does not describe.
 *
 * Dokploy's tRPC→OpenAPI generator emits `{}` for many response schemas, so
 * these bodies have no typed shape to format against — a JSON block is the
 * honest rendering. A null/undefined body is Dokploy's usual "not found" for
 * these routes (see the docker.getConfig note), so it maps to `emptyHint`
 * rather than a literal `null`.
 */
export function jsonSection(title: string, value: unknown, emptyHint: string): string {
  if (value == null) return emptyHint
  if (Array.isArray(value) && value.length === 0) return emptyHint
  return `# ${title}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

/**
 * Unwraps Dokploy's paginated search envelope.
 *
 * The `*.search` endpoints return `{ items: [...], total: n }`, not a bare
 * array — the OpenAPI spec declares their 200 body as `{}`, so nothing caught
 * this at the type level. Passing the envelope straight to a list formatter
 * threw inside `IO.map`, which surfaced as an empty error message.
 *
 * `total` is the full match count before limit/offset, so it can exceed
 * `items.length`; callers report it so a truncated page is visible as one.
 */
export function unwrapSearch<T>(payload: unknown): { items: T[]; total: number } {
  if (Array.isArray(payload)) return { items: payload as T[], total: payload.length }
  if (payload != null && typeof payload === "object") {
    const p = payload as { items?: unknown; total?: unknown }
    if (Array.isArray(p.items)) {
      return { items: p.items as T[], total: typeof p.total === "number" ? p.total : p.items.length }
    }
  }
  return { items: [], total: 0 }
}

/** Appends a "showing N of M" line when the page is narrower than the match count. */
export function withSearchTotal(body: string, items: readonly unknown[], total: number): string {
  if (total <= items.length) return body
  return `${body}\n\n(showing ${items.length} of ${total} matches — raise limit or set offset for the rest)`
}
