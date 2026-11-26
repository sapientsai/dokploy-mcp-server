import { durationMs, type Policy, type Service } from "../config"
import { estimateFor } from "./decide"
import type { Store } from "./store"

export type PolicyUsage = {
  readonly id: string
  readonly kind: Policy["kind"]
  readonly mode: Policy["mode"]
  /** How close the busiest scope is to the limit now, in words. */
  readonly now: string
}

const pct = (part: number, whole: number): string => (whole <= 0 ? "–" : `${Math.round((part / whole) * 100)}%`)

/** For `quota_policies`: each policy, and how close the busiest scope it counts is to it right now. */
export const policyUsage = (
  store: Store,
  service: Service,
  policies: ReadonlyArray<Policy>,
  now: number,
): ReadonlyArray<PolicyUsage> =>
  policies.map((policy) => {
    const base = { id: policy.id, kind: policy.kind, mode: policy.mode }
    const filter = { resource: policy.match?.resource, class: policy.match?.class, labelPrefix: policy.match?.label }
    switch (policy.kind) {
      case "floor": {
        const lowest = service.resources
          .flatMap((r) => estimateFor(store, service, r.id, now).toArray())
          .map((e) => e.remaining)
        return {
          ...base,
          now:
            lowest.length === 0
              ? "no reading yet"
              : `lowest budget has ${Math.floor(Math.min(...lowest))} left, keeps ${policy.keep}`,
        }
      }
      case "rate": {
        const since = now - durationMs(policy.per)
        const used =
          policy.scope === "fleet"
            ? store.sumCost({ ...filter, scope: { kind: "fleet" } }, since)
            : store.maxScopeCost(policy.scope, filter, since)
        const who = policy.scope === "fleet" ? "the fleet" : `the busiest ${policy.scope}`
        return { ...base, now: `${who}: ${used} of ${policy.max} per ${policy.per} (${pct(used, policy.max)})` }
      }
      case "share": {
        const parts = service.resources.flatMap((r) =>
          estimateFor(store, service, r.id, now)
            .map((e) => {
              const top = store.maxScopeCost(policy.scope, { resource: r.id }, e.resetAt - r.windowSeconds * 1000 - 1)
              return `${r.id}: the busiest ${policy.scope} has ${pct(top, e.limit)} of the window, cap ${pct(policy.max, 1)}`
            })
            .toArray(),
        )
        return { ...base, now: parts.length === 0 ? "no reading yet" : parts.join("; ") }
      }
      case "concurrency": {
        const running = store.inFlight({ kind: "fleet" }, now)
        return { ...base, now: `${running} in flight across the fleet, limit ${policy.max} per ${policy.scope}` }
      }
      case "repeat":
        return { ...base, now: `at most ${policy.max} of one command per ${policy.per} per ${policy.scope}` }
    }
  })
