import type { Service } from "../config"
import type { Observation } from "../ledger/types"
import { parseGithubHeaders, parseGithubRateLimit } from "./github"

const resourcesOf = (service: Service): ReadonlyArray<string> => service.resources.map((r) => r.id)

/** Reads a status endpoint's body with the parser the service's `probe.parse` names. */
export const parseProbe = (service: Service, body: unknown): ReadonlyArray<Observation> =>
  service.probe?.parse === "github-rate-limit-json" ? parseGithubRateLimit(body, resourcesOf(service)) : []

/** Reads one response's rate-limit headers with the parser the service's `headers` names. */
export const parseHeaders = (
  service: Service,
  headers: Readonly<Record<string, string>>,
): ReadonlyArray<Observation> => (service.headers === "github" ? parseGithubHeaders(headers, resourcesOf(service)) : [])

/** Everything a report says, from a response's headers, a status endpoint's body, or both. */
export const reportedBy = (
  service: Service,
  headers: Readonly<Record<string, string>> | undefined,
  body: unknown,
): ReadonlyArray<Observation> =>
  (headers === undefined ? [] : parseHeaders(service, headers)).concat(
    body === undefined ? [] : parseProbe(service, body),
  )
