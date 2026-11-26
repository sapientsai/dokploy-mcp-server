import type { Wire } from "functype"

import type { Observation } from "../ledger/types"

type Budget = Wire<{ readonly limit?: unknown; readonly remaining?: unknown; readonly reset?: unknown }>
type RateLimitBody = Wire<{ readonly resources?: Readonly<Record<string, Budget | undefined>> }>

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

/**
 * The resources from `GET /rate_limit`: `{ resources: { core: { limit, remaining, reset, used }, … } }`,
 * where `reset` is UTC epoch seconds. Only the resources the service names are kept.
 */
export const parseGithubRateLimit = (body: unknown, wanted: ReadonlyArray<string>): ReadonlyArray<Observation> => {
  const resources = typeof body === "object" && body !== null ? ((body as RateLimitBody).resources ?? {}) : {}
  return wanted.flatMap((id) => {
    const r = resources[id]
    return r !== undefined && finite(r.limit) && finite(r.remaining) && finite(r.reset)
      ? [{ resource: id, limit: r.limit, remaining: r.remaining, resetAt: r.reset * 1000 }]
      : []
  })
}

/**
 * One response's `x-ratelimit-*` headers. `x-ratelimit-resource` names the budget, `x-ratelimit-reset` is
 * UTC epoch seconds. Header names are matched without regard to case.
 */
export const parseGithubHeaders = (
  headers: Readonly<Record<string, string>>,
  wanted: ReadonlyArray<string>,
): ReadonlyArray<Observation> => {
  const lower: Wire<Readonly<Record<string, string | undefined>>> = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
  )
  const resource = lower["x-ratelimit-resource"] ?? "core"
  const [limit, remaining, reset] = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"].map((name) =>
    lower[name] === undefined || lower[name] === "" ? Number.NaN : Number(lower[name]),
  )
  return finite(limit) && finite(remaining) && finite(reset) && wanted.includes(resource)
    ? [{ resource, limit, remaining, resetAt: reset * 1000 }]
    : []
}

/** Everything a report says, from a response's headers, a status endpoint's body, or both. */
export const observationsFrom = (
  wanted: ReadonlyArray<string>,
  headers: Readonly<Record<string, string>> | undefined,
  body: unknown,
): ReadonlyArray<Observation> =>
  (headers === undefined ? [] : parseGithubHeaders(headers, wanted)).concat(
    body === undefined ? [] : parseGithubRateLimit(body, wanted),
  )
