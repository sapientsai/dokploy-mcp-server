/**
 * Rewrites the hosts that name a Dokploy instance in its OpenAPI spec as EXAMPLE_HOST, so a
 * committed spec never names a real deployment.
 *
 * The hosts come from the URL the spec was fetched from and from the URLs the spec gives for
 * itself (servers and externalDocs). Those can differ: an instance reached by IP or an internal
 * name still writes its public name into the spec.
 */

export const EXAMPLE_HOST = "dokploy.example.com"

type SelfUrls = {
  readonly servers?: ReadonlyArray<{ readonly url?: unknown }>
  readonly externalDocs?: { readonly url?: unknown }
}

// The hostname, not the host: a URL may carry a port that the spec's URLs leave out.
const hostnameOf = (url: unknown): string | undefined => {
  if (typeof url !== "string") return undefined
  try {
    return new URL(url).hostname || undefined
  } catch {
    return undefined // A relative server URL such as "/api" names no host.
  }
}

export const instanceHosts = (spec: unknown, fetchedFrom: string): ReadonlyArray<string> => {
  const self = (typeof spec === "object" && spec !== null ? spec : {}) as SelfUrls
  const urls = [fetchedFrom, ...(self.servers ?? []).map((server) => server.url), self.externalDocs?.url]
  const hosts = new Set(
    urls.map(hostnameOf).filter((host): host is string => host !== undefined && host !== EXAMPLE_HOST),
  )
  // Longest first, so a host that contains another is replaced whole.
  return [...hosts].sort((a, b) => b.length - a.length)
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const anonymizeSpec = (spec: unknown, fetchedFrom: string): string =>
  instanceHosts(spec, fetchedFrom).reduce(
    (text, host) => text.replace(new RegExp(escapeRegExp(host), "gi"), EXAMPLE_HOST),
    JSON.stringify(spec, null, 2),
  )
