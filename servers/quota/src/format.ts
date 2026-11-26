import type { Wire } from "functype"

import type { CheckResult, Estimate } from "./ledger/types"
import type { PolicyUsage } from "./ledger/usage"

/** The ledger's `status` answer, as JSON from the Durable Object. */
export type StatusAnswer = Wire<{
  readonly estimates: ReadonlyArray<{ readonly resource: string; readonly estimate: Estimate | null }>
  readonly inFlight: number
  readonly topSessions: ReadonlyArray<{ readonly session: string; readonly machine: string; readonly cost: number }>
  readonly policies: ReadonlyArray<PolicyUsage>
  readonly now: number
}>

const clock = (at: number): string => new Date(at).toISOString().slice(11, 16)

const age = (from: number, now: number): string => {
  const s = Math.max(0, Math.round((now - from) / 1000))
  return s < 120 ? `${s} s ago` : `${Math.round(s / 60)} min ago`
}

/** One line per budget: what's left, when it resets, and how fresh the number is. */
export const formatEstimate = (resource: string, e: Wire<Estimate | null>, now: number): string =>
  e === null
    ? `- **${resource}:** no reading yet`
    : `- **${resource}:** ${Math.max(0, Math.floor(e.remaining))} of ${e.limit} left, resets ${clock(e.resetAt)} UTC; last read ${age(e.observedAt, now)} (${e.source})`

export const formatStatus = (key: string, s: StatusAnswer): string =>
  [
    `## ${key}`,
    ...s.estimates.map(({ resource, estimate }) => formatEstimate(resource, estimate, s.now)),
    `- **In flight:** ${s.inFlight}`,
    ...(s.topSessions.length === 0
      ? ["- **Top sessions, last hour:** none"]
      : ["- **Top sessions, last hour:**", ...s.topSessions.map((t) => `  - ${t.session} on ${t.machine}: ${t.cost}`)]),
  ].join("\n")

export const formatPolicies = (key: string, policies: ReadonlyArray<PolicyUsage>): string =>
  [`## ${key}`, ...policies.map((p) => `- **${p.id}** (${p.kind}, ${p.mode}): ${p.now}`)].join("\n")

/** A check's answer, as an agent reads it from `quota_acquire`. */
export const formatCheck = (r: CheckResult, now: number): string => {
  const d = r.decision
  const head =
    d.kind === "allow"
      ? `Granted${r.spendId === null ? "" : `, lease ${r.spendId}`}.`
      : d.kind === "wait"
        ? `Wait ${Math.ceil(d.waitMs / 1000)} s (${d.policy}): ${d.reason}${d.booked && r.spendId !== null ? ` The slot is booked as lease ${r.spendId}.` : " Then ask again."}`
        : `Refused (${d.policy}): ${d.reason}`
  return [head, formatEstimate(r.resource, r.estimate, now), ...d.warnings.map((w) => `- Note: ${w}`)].join("\n")
}
