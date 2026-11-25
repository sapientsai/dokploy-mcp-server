/**
 * Rewrites the hosts that name a Dokploy instance in its OpenAPI spec as EXAMPLE_HOST, so a
 * committed spec never names a real deployment.
 *
 * The hosts come from the URL the spec was fetched from and from the URLs the spec gives for
 * itself (servers and externalDocs). Those can differ: an instance reached by IP or an internal
 * name still writes its public name into the spec.
 */

export const EXAMPLE_HOST = "dokploy.example.com"

// Loopback names identify no deployment, and rewriting them would mangle every "localhost" in the text.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

type SelfUrls = {
  readonly servers?: ReadonlyArray<{ readonly url?: unknown }>
  readonly externalDocs?: { readonly url?: unknown }
}

// The host as written, which for a Unicode name differs from URL.hostname's punycode form.
const RAW_HOST = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?(\[[^\]]*\]|[^/?#:]+)/i

// The hostname, not the host: a URL may carry a port that the spec's URLs leave out.
const hostnamesOf = (url: unknown): ReadonlyArray<string> => {
  if (typeof url !== "string") return []
  try {
    const parsed = new URL(url).hostname
    const raw = RAW_HOST.exec(url)?.[1]
    return [parsed, ...(raw === undefined ? [] : [raw])].map((host) => host.toLowerCase()).filter(Boolean)
  } catch {
    return [] // A relative server URL such as "/api" names no host.
  }
}

export const instanceHosts = (spec: unknown, fetchedFrom: string): ReadonlyArray<string> => {
  const self = (typeof spec === "object" && spec !== null ? spec : {}) as SelfUrls
  const urls = [fetchedFrom, ...(self.servers ?? []).map((server) => server.url), self.externalDocs?.url]
  const hosts = new Set(urls.flatMap(hostnamesOf).filter((host) => host !== EXAMPLE_HOST && !LOOPBACK.has(host)))
  // Longest first, so a host that contains another is replaced whole.
  return [...hosts].sort((a, b) => b.length - a.length)
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A host matches only as a whole label run: 10.0.0.5 must not match inside 110.0.0.50.
const hostPattern = (host: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(host)}(?![\\p{L}\\p{N}-])`, "giu")

// Rewrites every string in the parsed spec, keys included. Working on values rather than the
// serialized JSON keeps escapes such as "\n" from hiding a host from the whole-name match.
const mapStrings = (value: unknown, rewrite: (text: string) => string): unknown => {
  if (typeof value === "string") return rewrite(value)
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, rewrite))
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [rewrite(key), mapStrings(item, rewrite)]))
}

export type Anonymized = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string }

export const anonymizeSpec = (spec: unknown, fetchedFrom: string): Anonymized => {
  const hosts = instanceHosts(spec, fetchedFrom)
  // Such a host would be rewritten inside the example host itself, e.g. "dokploy" or "example.com".
  const clash = hosts.find((host) => EXAMPLE_HOST.includes(host))
  if (clash !== undefined) {
    return { ok: false, reason: `The instance host "${clash}" is part of ${EXAMPLE_HOST}, so it can't be rewritten.` }
  }
  const rewrite = (text: string): string =>
    hosts.reduce((acc, host) => acc.replace(hostPattern(host), EXAMPLE_HOST), text)
  const rewritten = mapStrings(spec, rewrite)
  // A backstop that parses URLs instead of matching text: the spec's own URLs must name no host but the example.
  const left = instanceHosts(rewritten, `https://${EXAMPLE_HOST}`)
  return left.length === 0
    ? { ok: true, text: JSON.stringify(rewritten, null, 2) }
    : { ok: false, reason: `The spec still names ${left.join(", ")} after the rewrite.` }
}
