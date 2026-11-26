import { invariant, Option } from "functype"

import { durationMs, type Policy, type Service } from "../config"
import { LEASE_TTL_MS, type Store } from "./store"
import type {
  CheckRequest,
  CheckResult,
  Decision,
  Estimate,
  Observation,
  ScopeFilter,
  Source,
  SpendFilter,
} from "./types"

/** How long one client has to answer a probe request before another is asked. */
const PROBE_CLAIM_MS = 30_000
const PROBE_CLAIM_KEY = "probe-claimed-at"

/** A clock time and how far off it is, for reasons an agent reads: "16:25 UTC (in 11 minutes)". */
export const when = (at: number, now: number): string => {
  if (!Number.isFinite(at)) return "never, at this cost"
  const time = new Date(at).toISOString().slice(11, 16)
  const seconds = Math.max(0, Math.round((at - now) / 1000))
  const wait = seconds < 120 ? `${seconds} s` : `${Math.round(seconds / 60)} minutes`
  return `${time} UTC (in ${wait})`
}

const windowMsOf = (service: Service, resource: string): number =>
  (service.resources.find((r) => r.id === resource)?.windowSeconds ?? 3600) * 1000

/**
 * What's left of one budget: the last reading, less every call since, and less every lease still
 * outstanding, whenever it was made: a lease is a promise of calls the service hasn't seen yet, so
 * no reading ever includes it. Past the observed reset, the budget is full again, less what was spent
 * since that reset.
 */
export const estimateFor = (store: Store, service: Service, resource: string, now: number): Option<Estimate> =>
  store.observation(resource).map((seen) => {
    const calls = { scope: { kind: "fleet" }, resource, rows: "calls" } as const
    const leased = store.sumCost({ scope: { kind: "fleet" }, resource, rows: "leases" }, now - LEASE_TTL_MS)
    // Counts a call made in the same millisecond as the reading: it can't have reached the service yet.
    if (now < seen.resetAt) {
      return { ...seen, remaining: seen.remaining - store.sumCost(calls, seen.observedAt - 1) - leased }
    }
    const windowMs = windowMsOf(service, resource)
    const periods = Math.floor((now - seen.resetAt) / windowMs) + 1
    const lastReset = seen.resetAt + (periods - 1) * windowMs
    return {
      ...seen,
      remaining: seen.limit - store.sumCost(calls, lastReset - 1) - leased,
      resetAt: seen.resetAt + periods * windowMs,
    }
  })

/**
 * The resource a check spends: the one named, or the one with the least left. The HTTP and tool layers
 * refuse an unknown resource before it gets here.
 */
export const pickResource = (store: Store, service: Service, wanted: string | undefined, now: number): string => {
  const ids = service.resources.map((r) => r.id)
  invariant(wanted === undefined || ids.includes(wanted), () => `${service.id} has no resource ${String(wanted)}`)
  if (wanted !== undefined) return wanted
  const left = (id: string): number =>
    estimateFor(store, service, id, now).fold(
      () => Number.POSITIVE_INFINITY,
      (e) => e.remaining,
    )
  return ids.reduce((best, id) => (left(id) < left(best) ? id : best), ids[0] ?? "")
}

const scopeOf = (kind: "fleet" | "machine" | "session", req: CheckRequest): ScopeFilter =>
  kind === "machine"
    ? { kind: "machine", machine: req.machine }
    : kind === "session"
      ? { kind: "session", session: req.session }
      : { kind: "fleet" }

const scopeText = (scope: ScopeFilter): string =>
  scope.kind === "fleet" ? "the fleet" : scope.kind === "machine" ? `machine ${scope.machine}` : "this session"

const matches = (policy: Policy, req: CheckRequest, resource: string): boolean =>
  policy.mode !== "off" &&
  (policy.match?.resource === undefined || policy.match.resource === resource) &&
  (policy.match?.class === undefined || policy.match.class === req.class) &&
  (policy.match?.label === undefined || req.label.startsWith(policy.match.label))

type Outcome =
  | { readonly kind: "ok" }
  | { readonly kind: "warn"; readonly message: string }
  | { readonly kind: "deny"; readonly policy: string; readonly reason: string; readonly retryAt: number }
  | {
      readonly kind: "wait"
      readonly policy: string
      readonly reason: string
      readonly waitMs: number
      readonly booked: boolean
    }

const OK: Outcome = { kind: "ok" }

type Acting = { readonly id: string; readonly action: "deny" | "delay" | "warn"; readonly maxDelayMs?: number }

/** Applies a policy's action to a breach: refuse, hold until `freeAt`, or only say so. */
const breach = (policy: Acting, reason: string, freeAt: number, now: number, bookable: boolean): Outcome => {
  if (policy.action === "warn") return { kind: "warn", message: `${policy.id}: ${reason}` }
  const waitMs = freeAt - now
  if (policy.action === "delay" && Number.isFinite(freeAt) && waitMs <= (policy.maxDelayMs ?? 10_000)) {
    return { kind: "wait", policy: policy.id, reason, waitMs: Math.max(0, waitMs), booked: bookable }
  }
  return { kind: "deny", policy: policy.id, reason: `${reason} Try again at ${when(freeAt, now)}.`, retryAt: freeAt }
}

/** When enough of the window's spends roll off for `cost` to fit under `max`. Infinity if it never fits. */
export const slotFreesAt = (
  spends: ReadonlyArray<{ readonly at: number; readonly cost: number }>,
  used: number,
  cost: number,
  max: number,
  windowMs: number,
  now: number,
): number =>
  cost > max
    ? Number.POSITIVE_INFINITY
    : spends
        .reduce<{ readonly running: number; readonly at: Option<number> }>(
          (acc, s) => {
            if (acc.at.isSome()) return acc
            const running = acc.running - s.cost
            return { running, at: running + cost <= max ? Option(Math.max(now, s.at + windowMs)) : acc.at }
          },
          { running: used, at: Option.none<number>() },
        )
        .at.getOrElse(() => now)

/** What a check knows besides the request: the budget it spends from, and what of it the call adds. */
type Context = {
  readonly resource: string
  readonly estimate: Option<Estimate>
  /** The cost the budget gains: the call's cost, less what a lease it draws from already holds. */
  readonly budgetCost: number
  readonly now: number
}

const evaluate = (store: Store, service: Service, policy: Policy, req: CheckRequest, ctx: Context): Outcome => {
  const { resource, estimate, budgetCost, now } = ctx
  // Per-call limits count calls, not reservations: a lease's calls meet them one at a time.
  const scoped = (kind: "fleet" | "machine" | "session"): SpendFilter => ({
    scope: scopeOf(kind, req),
    resource: policy.match?.resource,
    class: policy.match?.class,
    labelPrefix: policy.match?.label,
    rows: "calls",
  })

  switch (policy.kind) {
    case "floor":
      return estimate.fold(
        () => OK,
        (e): Outcome =>
          e.remaining - budgetCost >= policy.keep
            ? OK
            : {
                kind: "deny",
                policy: policy.id,
                reason: `${service.label} ${resource} has ${Math.max(0, Math.floor(e.remaining))} left, under the ${policy.keep} kept for the owner. It resets at ${when(e.resetAt, now)}. Wait until then.`,
                retryAt: e.resetAt,
              },
      )
    case "rate": {
      const windowMs = durationMs(policy.per)
      const filter = scoped(policy.scope)
      const since = now - windowMs
      const used = store.sumCost(filter, since)
      if (used + req.cost <= policy.max) return OK
      const freeAt = slotFreesAt(store.spendsSince(filter, since), used, req.cost, policy.max, windowMs, now)
      const reason = `${scopeText(filter.scope)} has used ${used} of ${policy.max} per ${policy.per}${policy.match === undefined ? "" : " for calls like this"}.`
      return breach(policy, reason, freeAt, now, true)
    }
    case "share":
      return estimate.fold(
        () => OK,
        (e) => {
          // The service's window, from its first millisecond.
          const windowStart = e.resetAt - windowMsOf(service, resource) - 1
          const me = policy.scope === "machine" ? req.machine : req.session
          const byWho = store.costBy(policy.scope, resource, windowStart)
          const others = byWho.filter((w) => w.who !== me && w.cost > 0)
          if (others.length === 0) return OK
          const filter: SpendFilter = { scope: scopeOf(policy.scope, req), resource }
          const used = byWho.find((w) => w.who === me)?.cost ?? 0
          if (used + budgetCost <= policy.max * e.limit) return OK
          const reason = `${scopeText(filter.scope)} has taken ${used} of ${service.label} ${resource}'s ${e.limit} this window, past its ${Math.round(policy.max * 100)}% share while ${others.length} other ${policy.scope}${others.length === 1 ? " is" : "s are"} working.`
          // A share frees only when the service's window resets, too far off to hold a call for.
          return breach(
            { ...policy, action: policy.action === "delay" ? "deny" : policy.action },
            reason,
            e.resetAt,
            now,
            false,
          )
        },
      )
    case "concurrency": {
      const scope = scopeOf(policy.scope, req)
      const running = store.inFlight(scope, now)
      if (running < policy.max) return OK
      const reason = `${scopeText(scope)} has ${running} calls in flight, at its limit of ${policy.max}.`
      // A slot frees when a call finishes, which can't be booked: the client waits a second and asks again.
      return breach(policy, reason, now + 1000, now, false)
    }
    case "repeat": {
      const windowMs = durationMs(policy.per)
      const scope = scopeOf(policy.scope, req)
      const runs = store.repeats(scope, req.label, now - windowMs)
      if (runs + 1 <= policy.max) return OK
      const reason = `\`${req.label}\` ran ${runs} times in ${policy.per} from ${scopeText(scope)}, which looks like a loop. Poll less often (every 30 s or more), or wait with ScheduleWakeup.`
      return breach(
        { ...policy, action: policy.action === "delay" ? "deny" : policy.action },
        reason,
        now + windowMs,
        now,
        false,
      )
    }
  }
}

/** A policy in `warn` mode says what it would have done, and does nothing. */
const softened = (policy: Policy, outcome: Outcome): Outcome =>
  policy.mode !== "warn" || outcome.kind === "ok" || outcome.kind === "warn"
    ? outcome
    : {
        kind: "warn",
        message: `${policy.id} (warn mode) would have ${outcome.kind === "deny" ? "refused" : `held this call ${Math.ceil(outcome.waitMs / 1000)} s`}: ${outcome.reason}`,
      }

/** The strictest outcome wins: any refusal, then the longest hold. Warnings ride along with either. */
const combine = (outcomes: ReadonlyArray<Outcome>): Decision => {
  const warnings = outcomes.flatMap((o) => (o.kind === "warn" ? [o.message] : []))
  const deny = outcomes.find((o) => o.kind === "deny")
  if (deny !== undefined) return { ...deny, warnings }
  const waits = outcomes.flatMap((o) => (o.kind === "wait" ? [o] : []))
  if (waits.length === 0) return { kind: "allow", warnings }
  const longest = waits.reduce((a, b) => (b.waitMs > a.waitMs ? b : a))
  return { ...longest, booked: waits.every((w) => w.booked), warnings }
}

/** Asks one client to probe when the ledger is stale, and no one was asked in the last 30 seconds. */
const claimProbe = (store: Store, service: Service, estimate: Option<Estimate>, now: number): Option<string> =>
  Option(service.probe?.command).filter(() => {
    const stale = !estimate.exists((e) => now - e.observedAt <= service.staleAfterSeconds * 1000)
    const claimed = Number(store.meta(PROBE_CLAIM_KEY).getOrElse(() => "0"))
    if (!stale || now - claimed < PROBE_CLAIM_MS) return false
    store.setMeta(PROBE_CLAIM_KEY, String(now))
    return true
  })

export type CheckOptions = { readonly now: number; readonly id: string }

/**
 * Decides one call: free calls pass, then every matching policy runs and the strictest answer wins.
 * An allowed call, or one held in a booked slot, is recorded as a spend at the time it may run.
 */
export const check = (
  store: Store,
  service: Service,
  policies: ReadonlyArray<Policy>,
  req: CheckRequest,
  { now, id }: CheckOptions,
): CheckResult => {
  store.prune(now)
  const resource = pickResource(store, service, req.resource, now)
  const estimate = estimateFor(store, service, resource, now)
  const probe = claimProbe(store, service, estimate, now).orNull()
  const base = { resource, estimate: estimate.orNull(), probe }

  if (service.free.some((label) => req.label === label || req.label.startsWith(`${label} `))) {
    return { ...base, decision: { kind: "allow", warnings: [] }, spendId: null }
  }

  // A lease covers calls on its own budget, while it's still outstanding.
  const lease = Option(req.drawFrom)
    .flatMap((leaseId) => store.spendById(leaseId))
    .filter((s) => s.reserve && s.resource === resource && s.at > now - LEASE_TTL_MS)
  const budgetCost = Math.max(
    0,
    req.cost -
      lease.fold(
        () => 0,
        (l) => l.cost,
      ),
  )
  const ctx: Context = { resource, estimate, budgetCost, now }
  // A reservation is checked against the budget only; its calls meet the per-call limits as they run.
  const applies = (p: Policy): boolean =>
    matches(p, req, resource) && (req.reserve !== true || p.kind === "floor" || p.kind === "share")
  const decision = combine(policies.filter(applies).map((p) => softened(p, evaluate(store, service, p, req, ctx))))

  const runsAt: Option<number> =
    decision.kind === "allow"
      ? Option(now)
      : decision.kind === "wait" && decision.booked
        ? Option(now + decision.waitMs)
        : Option.none()

  runsAt.map((at) => {
    store.spend({
      id,
      at,
      session: req.session,
      machine: req.machine,
      label: req.label,
      class: req.class,
      resource,
      cost: req.cost,
      reserve: req.reserve === true,
    })
    Option(req.callId).map((callId) => store.start(callId, req.session, req.machine, now))
    // The call now carries what it drew from the lease, so the lease gives that part up.
    lease.map((l) => store.lowerLease(l.id, l.cost - req.cost))
    return at
  })
  return {
    ...base,
    decision,
    spendId: runsAt.fold(
      () => null,
      () => id,
    ),
  }
}

/** A reading that could be true: a positive limit, remaining within it, and a reset within one window. */
const plausible = (o: Observation, windowMs: number, now: number): boolean =>
  o.limit > 0 &&
  o.remaining >= 0 &&
  o.remaining <= o.limit &&
  o.resetAt > now - windowMs &&
  o.resetAt <= now + windowMs + 60_000

/**
 * What of a reading the ledger keeps. The broker's own readings are kept as they are. A client's may
 * lower what's left of a live window, keeping that window's limit and reset, and may start a new
 * window once the last one has reset, at no more than the last limit. So a refused agent can't
 * report a full budget, a later reset or a bigger limit to pass the floor or its share.
 */
const accept = (store: Store, service: Service, o: Observation, source: Source, now: number): Option<Observation> => {
  if (!plausible(o, windowMsOf(service, o.resource), now)) return Option.none()
  if (source === "broker") return Option(o)
  return store.observation(o.resource).fold(
    () => Option(o),
    (stored) => {
      if (now >= stored.resetAt) return o.limit <= stored.limit ? Option(o) : Option.none()
      const lower = estimateFor(store, service, o.resource, now).exists((e) => o.remaining <= e.remaining)
      return lower ? Option({ ...o, limit: stored.limit, resetAt: stored.resetAt }) : Option.none()
    },
  )
}

/** Records what a service said, as far as `accept` allows, and clears the probe claim. */
export const observe = (
  store: Store,
  service: Service,
  observations: ReadonlyArray<Observation>,
  source: Source,
  now: number,
): number => {
  const known = service.resources.map((r) => r.id)
  const kept = observations
    .filter((o) => known.includes(o.resource))
    .flatMap((o) => accept(store, service, o, source, now).toArray())
  kept.forEach((o) => store.observe({ ...o, observedAt: now, source }))
  if (kept.length > 0) store.setMeta(PROBE_CLAIM_KEY, "0")
  return kept.length
}
