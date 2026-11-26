import { describe, expect, it } from "vitest"

import { configSchema, type Policy, type QuotaConfigInput, type Service } from "../src/config"
import { defaultConfig } from "../src/defaults"
import { check, estimateFor, observe, slotFreesAt, when } from "../src/ledger/decide"
import { createStore, RETENTION_MS, type Store } from "../src/ledger/store"
import type { CheckRequest, CheckResult } from "../src/ledger/types"
import { memorySql } from "./helpers/sqlite"

const T0 = Date.UTC(2026, 10, 26, 16, 0, 0)
const HOUR = 3_600_000

/** A GitHub-like service with the given policies, after the schema fills in defaults. */
const serviceWith = (policies: QuotaConfigInput["policies"] = []): Service => {
  const config = configSchema.parse({
    services: [
      {
        id: "github",
        label: "GitHub",
        resources: [
          { id: "core", windowSeconds: 3600 },
          { id: "graphql", windowSeconds: 3600 },
        ],
        probe: { command: "gh api rate_limit", parse: "github-rate-limit-json" },
        free: ["gh api rate_limit"],
        policies,
      },
    ],
  })
  const [service] = config.services
  if (service === undefined) throw new Error("no service")
  return service
}

const req = (over: Partial<CheckRequest> = {}): CheckRequest => ({
  resource: "core",
  session: "s1",
  machine: "m1",
  label: "gh pr view",
  class: "read",
  cost: 1,
  ...over,
})

type Ledger = {
  readonly store: Store
  readonly service: Service
  readonly run: (r?: Partial<CheckRequest>, at?: number) => CheckResult
}

const ledger = (policies: QuotaConfigInput["policies"] = []): Ledger => {
  const store = createStore(memorySql())
  const service = serviceWith(policies)
  const all: ReadonlyArray<Policy> = service.policies
  const counter = { n: 0 }
  return {
    store,
    service,
    run: (r = {}, at = T0) => {
      counter.n += 1
      return check(store, service, all, req(r), { now: at, id: `spend-${counter.n}` })
    },
  }
}

const seen = (l: Ledger, remaining: number, at = T0, resetAt = T0 + HOUR, resource = "core") =>
  observe(l.store, l.service, [{ resource, limit: 5000, remaining, resetAt }], "probe", at)

describe("a check with no policies", () => {
  it("allows the call and records it as a spend", () => {
    const l = ledger()
    const r = l.run()
    expect(r.decision).toEqual({ kind: "allow", warnings: [] })
    expect(r.spendId).toBe("spend-1")
    expect(l.store.spendById("spend-1").orNull()).toMatchObject({ session: "s1", label: "gh pr view", cost: 1 })
  })

  it("lets free calls through without recording them", () => {
    const l = ledger([{ id: "floor", kind: "floor", keep: 10_000 }])
    seen(l, 5)
    const r = l.run({ label: "gh api rate_limit" })
    expect(r.decision.kind).toBe("allow")
    expect(r.spendId).toBeNull()
  })
})

describe("the estimate", () => {
  it("takes every spend since the last reading off what the service said", () => {
    const l = ledger()
    seen(l, 4000)
    l.run({ cost: 3 }, T0 + 1)
    l.run({ cost: 2 }, T0 + 2)
    expect(estimateFor(l.store, l.service, "core", T0 + 3).orNull()?.remaining).toBe(3995)
  })

  it("starts full again past the reset, less what was spent since", () => {
    const l = ledger()
    seen(l, 10)
    l.run({ cost: 4 }, T0 + HOUR + 5)
    const e = estimateFor(l.store, l.service, "core", T0 + HOUR + 10).orNull()
    expect(e?.remaining).toBe(4996)
    expect(e?.resetAt).toBe(T0 + 2 * HOUR)
  })

  it("spends against the budget with the least left when none is named", () => {
    const l = ledger()
    seen(l, 4000, T0, T0 + HOUR, "core")
    seen(l, 100, T0, T0 + HOUR, "graphql")
    expect(l.run({ resource: undefined }).resource).toBe("graphql")
  })
})

describe("floor", () => {
  it("refuses a call that would take the budget under the floor, until the reset", () => {
    const l = ledger([{ id: "floor", kind: "floor", keep: 1000 }])
    seen(l, 1000)
    const r = l.run()
    expect(r.decision).toMatchObject({ kind: "deny", policy: "floor", retryAt: T0 + HOUR })
    expect(r.decision.kind === "deny" && r.decision.reason).toContain("under the 1000 kept for the owner")
    expect(r.spendId).toBeNull()
  })

  it("allows the call while the budget stays at or over the floor", () => {
    const l = ledger([{ id: "floor", kind: "floor", keep: 1000 }])
    seen(l, 1001)
    expect(l.run().decision.kind).toBe("allow")
    expect(l.run().decision.kind).toBe("deny")
  })

  it("allows the call when there's no reading yet, and asks for a probe", () => {
    const l = ledger([{ id: "floor", kind: "floor", keep: 1000 }])
    const r = l.run()
    expect(r.decision.kind).toBe("allow")
    expect(r.probe).toBe("gh api rate_limit")
  })
})

describe("rate", () => {
  it("refuses past the limit, and says when the oldest call leaves the window", () => {
    const l = ledger([{ id: "minute", kind: "rate", scope: "fleet", max: 2, per: "1m" }])
    l.run({}, T0)
    l.run({}, T0 + 10_000)
    const r = l.run({}, T0 + 20_000)
    expect(r.decision).toMatchObject({ kind: "deny", policy: "minute", retryAt: T0 + 60_000 })
  })

  it("holds a call in a booked slot when told to delay, and records it at that time", () => {
    const l = ledger([{ id: "second", kind: "rate", scope: "fleet", max: 1, per: "1s", action: "delay" }])
    l.run({}, T0)
    const r = l.run({}, T0 + 200)
    expect(r.decision).toMatchObject({ kind: "wait", waitMs: 800, booked: true })
    expect(l.store.spendById(r.spendId ?? "").orNull()?.at).toBe(T0 + 1000)
    // The booked slot counts: a third call waits behind it.
    expect(l.run({}, T0 + 300).decision).toMatchObject({ kind: "wait", waitMs: 1700 })
  })

  it("refuses instead of holding past maxDelayMs", () => {
    const l = ledger([
      { id: "minute", kind: "rate", scope: "fleet", max: 1, per: "1m", action: "delay", maxDelayMs: 5000 },
    ])
    l.run({}, T0)
    expect(l.run({}, T0 + 1000).decision).toMatchObject({ kind: "deny", retryAt: T0 + 60_000 })
  })

  it("counts each session on its own with a session scope", () => {
    const l = ledger([{ id: "s", kind: "rate", scope: "session", max: 1, per: "1m" }])
    l.run({ session: "a" })
    expect(l.run({ session: "b" }).decision.kind).toBe("allow")
    expect(l.run({ session: "a" }).decision.kind).toBe("deny")
  })

  it("counts only the calls its match names", () => {
    const l = ledger([{ id: "writes", kind: "rate", scope: "fleet", max: 1, per: "1m", match: { class: "write" } }])
    l.run({ class: "read" })
    l.run({ class: "read" })
    expect(l.run({ class: "write", label: "gh pr create" }).decision.kind).toBe("allow")
    expect(l.run({ class: "write", label: "gh pr create" }).decision.kind).toBe("deny")
    expect(l.run({ class: "read" }).decision.kind).toBe("allow")
  })

  it("never fits a call that costs more than the limit", () => {
    expect(slotFreesAt([], 0, 10, 5, 60_000, T0)).toBe(Number.POSITIVE_INFINITY)
    expect(when(Number.POSITIVE_INFINITY, T0)).toBe("never, at this cost")
  })
})

describe("modes and actions", () => {
  it("only warns in warn mode, and still records the call", () => {
    const l = ledger([{ id: "minute", kind: "rate", scope: "fleet", max: 1, per: "1m", mode: "warn" }])
    l.run()
    const r = l.run()
    expect(r.decision.kind).toBe("allow")
    expect(r.decision.warnings[0]).toContain("minute (warn mode) would have refused")
    expect(r.spendId).not.toBeNull()
  })

  it("only warns with the warn action, in enforce mode", () => {
    const l = ledger([{ id: "day", kind: "rate", scope: "machine", max: 1, per: "1d", action: "warn" }])
    l.run()
    const r = l.run()
    expect(r.decision.kind).toBe("allow")
    expect(r.decision.warnings).toEqual([expect.stringContaining("day: machine m1 has used 1 of 1 per 1d")])
  })

  it("skips a policy that's off", () => {
    const l = ledger([{ id: "minute", kind: "rate", scope: "fleet", max: 1, per: "1m", mode: "off" }])
    l.run()
    expect(l.run().decision).toEqual({ kind: "allow", warnings: [] })
  })

  it("lets the strictest answer win: a refusal over a hold", () => {
    const l = ledger([
      { id: "second", kind: "rate", scope: "fleet", max: 1, per: "1s", action: "delay" },
      { id: "minute", kind: "rate", scope: "fleet", max: 1, per: "1m" },
    ])
    l.run({}, T0)
    expect(l.run({}, T0 + 100).decision).toMatchObject({ kind: "deny", policy: "minute" })
  })
})

describe("share", () => {
  const share = [{ id: "share", kind: "share" as const, scope: "session" as const, max: 0.4 }]

  it("lets one session take everything while it works alone", () => {
    const l = ledger(share)
    seen(l, 5000)
    expect(l.run({ cost: 3000 }).decision.kind).toBe("allow")
  })

  it("caps a session at its share while another is working", () => {
    const l = ledger(share)
    seen(l, 5000)
    l.run({ session: "other", cost: 1 })
    expect(l.run({ cost: 2000 }).decision.kind).toBe("allow")
    const r = l.run({ cost: 1 })
    expect(r.decision).toMatchObject({ kind: "deny", policy: "share", retryAt: T0 + HOUR })
    expect(r.decision.kind === "deny" && r.decision.reason).toContain(
      "past its 40% share while 1 other session is working",
    )
  })
})

describe("concurrency", () => {
  it("holds a call while the fleet is at its limit, and frees a slot when a call finishes", () => {
    const l = ledger([{ id: "in-flight", kind: "concurrency", scope: "fleet", max: 1, action: "delay" }])
    l.run({ callId: "a" })
    const held = l.run({ callId: "b" })
    expect(held.decision).toMatchObject({ kind: "wait", waitMs: 1000, booked: false })
    expect(held.spendId).toBeNull()
    l.store.finish("a")
    expect(l.run({ callId: "b" }).decision.kind).toBe("allow")
  })

  it("stops counting a call whose finish never came", () => {
    const l = ledger([{ id: "in-flight", kind: "concurrency", scope: "fleet", max: 1 }])
    l.run({ callId: "a" }, T0)
    expect(l.run({ callId: "b" }, T0 + 1000).decision.kind).toBe("deny")
    expect(l.run({ callId: "b" }, T0 + 11 * 60_000).decision.kind).toBe("allow")
  })
})

describe("repeat", () => {
  it("calls the same command past the limit a loop, and says how to wait", () => {
    const l = ledger([{ id: "loop", kind: "repeat", scope: "session", max: 3, per: "10m" }])
    l.run({ label: "gh run list" })
    l.run({ label: "gh run list" })
    l.run({ label: "gh run list" })
    expect(l.run({ label: "gh pr view" }).decision.kind).toBe("allow")
    const r = l.run({ label: "gh run list" })
    expect(r.decision).toMatchObject({ kind: "deny", policy: "loop" })
    expect(r.decision.kind === "deny" && r.decision.reason).toContain("ScheduleWakeup")
  })
})

describe("probes", () => {
  it("asks no client to probe when the broker reads the service itself", () => {
    const store = createStore(memorySql())
    const service = serviceWith()
    const r = check(store, service, [], req(), { now: T0, id: "x", clientProbes: false })
    expect(r.probe).toBeNull()
  })

  it("asks one client to probe a stale ledger, then nobody else for 30 seconds", () => {
    const l = ledger()
    expect(l.run({}, T0).probe).toBe("gh api rate_limit")
    expect(l.run({}, T0 + 10_000).probe).toBeNull()
    expect(l.run({}, T0 + 31_000).probe).toBe("gh api rate_limit")
  })

  it("asks no one while the reading is fresh", () => {
    const l = ledger()
    seen(l, 4000, T0)
    expect(l.run({}, T0 + 30_000).probe).toBeNull()
    expect(l.run({}, T0 + 61_000).probe).toBe("gh api rate_limit")
  })

  it("ignores readings for budgets the service doesn't have", () => {
    const l = ledger()
    expect(
      observe(l.store, l.service, [{ resource: "search", limit: 30, remaining: 30, resetAt: T0 }], "probe", T0),
    ).toBe(0)
  })
})

describe("retention", () => {
  it("drops spends older than seven days", () => {
    const l = ledger()
    l.run({}, T0)
    l.run({}, T0 + RETENTION_MS + 1)
    expect(l.store.spendById("spend-1").isNone()).toBe(true)
    expect(l.store.spendById("spend-2").isSome()).toBe(true)
  })

  it("never lets a non-lease spend be changed", () => {
    const l = ledger()
    const { spendId } = l.run({ cost: 5 })
    expect(l.store.lowerLease(spendId ?? "", 0)).toBe(false)
    expect(l.store.spendById(spendId ?? "").orNull()?.cost).toBe(5)
    expect(l.store.lowerLease("gone", 1)).toBe(false)
  })
})

describe("leases", () => {
  /** The shipped GitHub defaults, every policy enforcing. */
  const enforcedDefaults = (): Ledger => {
    const github = defaultConfig.services.find((s) => s.id === "github")
    const policies = (github?.policies ?? []).map((p) => ({ ...p, mode: "enforce" as const }))
    return ledger(policies)
  }

  it("grants a 200-call batch under the shipped defaults, all enforcing", () => {
    const l = enforcedDefaults()
    seen(l, 5000)
    const r = l.run({ cost: 200, label: "lease: backfill", reserve: true })
    expect(r.decision.kind).toBe("allow")
    // The reservation doesn't use up the per-call limits: the next call goes through.
    expect(l.run({ label: "gh pr view" }, T0 + 1000).decision.kind).toBe("allow")
  })

  it("still refuses a batch that would take the budget under the floor", () => {
    const l = enforcedDefaults()
    seen(l, 1100)
    expect(l.run({ cost: 200, label: "lease: backfill", reserve: true }).decision).toMatchObject({
      kind: "deny",
      policy: "floor",
    })
  })

  it("counts a call that draws from a lease once, moving cost from the lease to the call", () => {
    const l = ledger([{ id: "floor", kind: "floor", keep: 1000 }])
    seen(l, 1100)
    const { spendId: lease } = l.run({ cost: 100, label: "lease: batch", reserve: true })
    expect(estimateFor(l.store, l.service, "core", T0).orNull()?.remaining).toBe(1000)
    // Without the lease this call would cross the floor; drawing from it, it doesn't.
    const call = l.run({ cost: 3, drawFrom: lease ?? "" }, T0 + 1)
    expect(call.decision.kind).toBe("allow")
    expect(l.store.spendById(lease ?? "").orNull()?.cost).toBe(97)
    expect(estimateFor(l.store, l.service, "core", T0 + 2).orNull()?.remaining).toBe(1000)
  })

  it("lowers a lease to what it used, and never raises one", () => {
    const l = ledger()
    const { spendId } = l.run({ cost: 200, label: "lease: backfill", reserve: true })
    expect(l.store.lowerLease(spendId ?? "", 37)).toBe(true)
    expect(l.store.spendById(spendId ?? "").orNull()?.cost).toBe(37)
    expect(l.store.lowerLease(spendId ?? "", 500)).toBe(true)
    expect(l.store.spendById(spendId ?? "").orNull()?.cost).toBe(37)
  })
})

describe("reports", () => {
  const report = (
    l: Ledger,
    o: { remaining: number; limit?: number; resetAt?: number },
    source: "probe" | "broker",
    at = T0 + 1000,
  ) =>
    observe(
      l.store,
      l.service,
      [{ resource: "core", limit: o.limit ?? 5000, remaining: o.remaining, resetAt: o.resetAt ?? T0 + HOUR }],
      source,
      at,
    )
  const left = (l: Ledger, at = T0 + 2000) => estimateFor(l.store, l.service, "core", at).orNull()

  it("won't let a client raise the estimate within a window", () => {
    const l = ledger()
    seen(l, 1200)
    expect(report(l, { remaining: 5000 }, "probe")).toBe(0)
    expect(left(l)?.remaining).toBe(1200)
  })

  it("won't let a client raise it by claiming a later reset", () => {
    const l = ledger()
    seen(l, 900)
    expect(report(l, { remaining: 5000, resetAt: T0 + HOUR + 1000 }, "probe")).toBe(0)
    expect(left(l)?.remaining).toBe(900)
  })

  it("keeps the smaller limit and the later reset when a client lowers what's left", () => {
    const l = ledger()
    seen(l, 1200)
    // A later reset only delays the refill, so it's kept; the bigger limit isn't.
    expect(report(l, { remaining: 800, limit: 1_000_000_000, resetAt: T0 + HOUR + 5000 }, "probe")).toBe(1)
    expect(left(l)).toMatchObject({ remaining: 800, limit: 5000, resetAt: T0 + HOUR + 5000 })
    // A sooner reset would bring the refill forward, so the window's own is kept.
    expect(report(l, { remaining: 700, resetAt: T0 + 30_000 }, "probe")).toBe(1)
    expect(left(l)).toMatchObject({ remaining: 700, resetAt: T0 + HOUR + 5000 })
  })

  it("refuses readings that can't be true, from anyone", () => {
    const l = ledger()
    expect(report(l, { remaining: 6000 }, "broker")).toBe(0)
    expect(report(l, { remaining: -1 }, "broker")).toBe(0)
    expect(report(l, { remaining: 10, resetAt: T0 + 10 * HOUR }, "broker")).toBe(0)
  })

  it("won't let a client refill the budget after a reset, once or again and again", () => {
    const l = ledger([{ id: "floor", kind: "floor", keep: 1000 }])
    seen(l, 1200)
    const after = T0 + HOUR + 1000
    // A reset already passed is refused outright.
    expect(report(l, { remaining: 5000, resetAt: after - 1000 }, "probe", after)).toBe(0)
    // The rollover grants the full budget; a client can confirm it, not exceed it.
    expect(report(l, { remaining: 5000, resetAt: T0 + 2 * HOUR }, "probe", after)).toBe(1)
    expect(l.run({ session: "other", cost: 4000 }, after + 1).decision.kind).toBe("allow")
    expect(l.run({}, after + 2).decision).toMatchObject({ kind: "deny", policy: "floor" })
    // The same report a minute later can't put the 4,000 back.
    expect(report(l, { remaining: 5000, resetAt: T0 + 2 * HOUR }, "probe", after + 60_000)).toBe(0)
    expect(left(l, after + 60_001)?.remaining).toBe(1000)
  })

  it("won't let a client bring a reset sooner or raise the limit, even while lowering", () => {
    const l = ledger()
    seen(l, 1200)
    const after = T0 + HOUR + 1000
    expect(report(l, { remaining: 4000, limit: 9000, resetAt: after + 1000 }, "probe", after)).toBe(1)
    // The window keeps the rolled-over reset and the smaller limit.
    expect(left(l, after + 1)).toMatchObject({ remaining: 4000, limit: 5000, resetAt: T0 + 2 * HOUR })
    expect(left(l, after + 5000)?.remaining).toBe(4000)
  })

  it("takes the broker's own reading either way", () => {
    const l = ledger()
    seen(l, 1200)
    expect(report(l, { remaining: 4000 }, "broker")).toBe(1)
    expect(left(l)?.remaining).toBe(4000)
  })
})

describe("leases and readings", () => {
  it("keeps counting a lease after a fresh reading, so its calls still meet the floor", () => {
    const l = ledger([{ id: "floor", kind: "floor", keep: 1000 }])
    seen(l, 5000)
    const { spendId: lease } = l.run({ session: "batch", cost: 3000, label: "lease: batch", reserve: true })
    // A reading after the lease: the service hasn't seen the lease's calls, so it still says 5000.
    observe(
      l.store,
      l.service,
      [{ resource: "core", limit: 5000, remaining: 5000, resetAt: T0 + HOUR }],
      "broker",
      T0 + 10,
    )
    expect(estimateFor(l.store, l.service, "core", T0 + 11).orNull()?.remaining).toBe(2000)
    // Another session spends down to the floor; the lease's calls then still fit, and nothing more does.
    expect(l.run({ session: "other", cost: 1000 }, T0 + 20).decision.kind).toBe("allow")
    expect(l.run({ session: "other", cost: 1 }, T0 + 21).decision.kind).toBe("deny")
    expect(l.run({ session: "batch", cost: 3000, drawFrom: lease ?? "" }, T0 + 30).decision.kind).toBe("allow")
    expect(estimateFor(l.store, l.service, "core", T0 + 31).orNull()?.remaining).toBe(1000)
  })

  it("lets a lease lapse after an hour", () => {
    const l = ledger()
    seen(l, 5000)
    l.run({ cost: 3000, label: "lease: forgotten", reserve: true })
    expect(estimateFor(l.store, l.service, "core", T0 + 1).orNull()?.remaining).toBe(2000)
    // An hour on, the lease no longer holds budget: without the lapse, this would still read 2000.
    expect(estimateFor(l.store, l.service, "core", T0 + HOUR + 1).orNull()?.remaining).toBe(5000)
  })

  it("doesn't let a lease on one budget cover a call on another", () => {
    const l = ledger([{ id: "floor", kind: "floor", keep: 1000 }])
    seen(l, 5000, T0, T0 + HOUR, "core")
    seen(l, 1000, T0, T0 + HOUR, "graphql")
    const { spendId: lease } = l.run({ resource: "core", cost: 100, label: "lease: core", reserve: true })
    const call = l.run({ resource: "graphql", cost: 1, drawFrom: lease ?? "" })
    expect(call.decision).toMatchObject({ kind: "deny", policy: "floor" })
    expect(l.store.spendById(lease ?? "").orNull()?.cost).toBe(100)
  })
})
