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
  const setMap = new Map<string, string>()
  for (const line of parseEnvLines(setBlob)) {
    if (line.kind === "kv") setMap.set(line.key, line.value)
  }
  const unsetSet = new Set(unsetKeys ?? [])
  const existingKeys = new Set(
    existing.filter((l): l is Extract<EnvLine, { kind: "kv" }> => l.kind === "kv").map((l) => l.key),
  )

  const seen = new Set<string>()
  const merged: EnvLine[] = []
  for (const line of existing) {
    if (line.kind === "raw") {
      merged.push(line)
      continue
    }
    if (unsetSet.has(line.key)) continue
    if (setMap.has(line.key)) {
      merged.push({ kind: "kv", key: line.key, value: setMap.get(line.key)! })
      seen.add(line.key)
    } else {
      merged.push(line)
    }
  }
  for (const [key, value] of setMap) {
    if (!seen.has(key)) merged.push({ kind: "kv", key, value })
  }
  const actualUnset = Array.from(unsetSet).filter((k) => existingKeys.has(k))
  return {
    blob: serializeEnvLines(merged),
    setKeys: Array.from(setMap.keys()),
    unsetKeys: actualUnset,
  }
}

/**
 * Extract key names only (no values) from an env blob, sorted alphabetically.
 * The values never leave the calling process.
 */
export function listEnvKeys(blob: string | null | undefined): string[] {
  return parseEnvLines(blob)
    .filter((l): l is Extract<EnvLine, { kind: "kv" }> => l.kind === "kv")
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
