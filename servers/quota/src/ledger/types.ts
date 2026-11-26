import type { Wire } from "functype"

/** What a service said about one of its budgets. */
export type Observation = {
  readonly resource: string
  readonly limit: number
  readonly remaining: number
  /** When the service's window resets, in epoch milliseconds. */
  readonly resetAt: number
}

/** Where an observation came from. */
export type Source = "broker" | "probe" | "header" | "report"

export type StoredObservation = Observation & { readonly observedAt: number; readonly source: Source }

export type CallClass = "read" | "write"

/** One call a client is about to make. */
export type CheckRequest = {
  /** The budget it spends, such as `core`. Omitted, the one with the least left is used. */
  readonly resource?: string
  readonly session: string
  readonly machine: string
  /** The command's first words, such as `gh pr create`. Never its arguments. */
  readonly label: string
  readonly class: CallClass
  readonly cost: number
  /** Set when the client will say the call finished, for `concurrency` policies. */
  readonly callId?: string
  /**
   * True for `quota_acquire`: a reservation for a batch, checked against the budget (`floor`, `share`)
   * and not against per-call limits, which its calls meet one at a time.
   */
  readonly reserve?: boolean
  /** A lease this call draws from, so the budget counts the call once, not in the lease and again here. */
  readonly drawFrom?: string
}

/** Who a policy counts: everyone on the account, one machine, or one session. */
export type ScopeFilter =
  | { readonly kind: "fleet" }
  | { readonly kind: "machine"; readonly machine: string }
  | { readonly kind: "session"; readonly session: string }

/** Narrows which spends a policy counts. */
export type SpendFilter = {
  readonly scope: ScopeFilter
  readonly resource?: string
  readonly class?: CallClass
  readonly labelPrefix?: string
  /** Leave out reservations, as per-call limits do. */
  readonly callsOnly?: boolean
}

export type Spend = {
  readonly id: string
  readonly at: number
  readonly session: string
  readonly machine: string
  readonly label: string
  readonly class: CallClass
  readonly resource: string
  readonly cost: number
  /** A reservation from `quota_acquire`, not a single call. */
  readonly reserve: boolean
}

export type Decision =
  | { readonly kind: "allow"; readonly warnings: ReadonlyArray<string> }
  | {
      readonly kind: "wait"
      readonly waitMs: number
      /** True when the broker booked the slot: run after the wait without asking again. */
      readonly booked: boolean
      readonly policy: string
      readonly reason: string
      readonly warnings: ReadonlyArray<string>
    }
  | {
      readonly kind: "deny"
      readonly policy: string
      readonly reason: string
      readonly retryAt: number
      readonly warnings: ReadonlyArray<string>
    }

/** What the ledger knows about one budget, after counting spends since the last observation. */
export type Estimate = {
  readonly resource: string
  readonly limit: number
  readonly remaining: number
  readonly resetAt: number
  readonly observedAt: number
  readonly source: Source | "unknown"
}

/**
 * A check's full answer: the decision, the budget it was made against, and whether to probe. It
 * crosses from the Durable Object to the Worker as JSON, so its absent values are nulls.
 */
export type CheckResult = Wire<{
  readonly decision: Decision
  readonly resource: string
  readonly estimate: Estimate | null
  /** A command for the client to run and report, when the ledger is stale and no one else was asked. */
  readonly probe: string | null
  /** The spend recorded for this call, which `quota_release` can adjust. Null when nothing was recorded. */
  readonly spendId: string | null
}>
