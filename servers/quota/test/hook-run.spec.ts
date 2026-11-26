import { Option } from "functype"
import { describe, expect, it, vi } from "vitest"

import { type Deps, type HookInput, runPost, runPre } from "../src/hook/run"

const BROKER = { url: "https://quota.example.com/", key: "k" }

type Reply = { readonly status?: number; readonly body?: unknown } | "down"

/** Deps with a broker that answers from `replies`, in order, and records what it was sent. */
const fakeDeps = (replies: ReadonlyArray<Reply>, over: Partial<Deps> = {}) => {
  const queue = [...replies]
  const sent: Array<{ readonly url: string; readonly body: Record<string, unknown> }> = []
  const slept: Array<number> = []
  const probes: Array<string> = []
  const seen = new Set<string>()
  const deps: Deps = {
    mode: "enforce",
    broker: () => Promise.resolve(Option(BROKER)),
    forgetBroker: vi.fn(),
    account: () => Option("octo"),
    machine: "m1",
    fetch: (url, init) => {
      sent.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> })
      const reply = queue.shift() ?? { body: { decision: "allow", warnings: [] } }
      if (reply === "down") return Promise.reject(new Error("ECONNREFUSED"))
      const status = reply.status ?? 200
      return Promise.resolve(new Response(JSON.stringify(reply.body ?? {}), { status }))
    },
    sleep: (ms) => {
      slept.push(ms)
      return Promise.resolve()
    },
    probe: (account) => {
      probes.push(account)
    },
    firstTime: (session, key) => {
      const k = `${session}:${key}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    },
    ...over,
  }
  return { deps, sent, slept, probes }
}

const bash = (command: string, over: Partial<HookInput> = {}): HookInput => ({
  hook_event_name: "PreToolUse",
  session_id: "s1",
  tool_name: "Bash",
  tool_use_id: "tu1",
  tool_input: { command },
  ...over,
})

describe("PreToolUse", () => {
  it("says nothing, and asks nothing, for a command without gh", async () => {
    const { deps, sent } = fakeDeps([])
    expect((await runPre(bash("ls -la && git status"), deps)).isNone()).toBe(true)
    expect((await runPre(bash("gh pr view 1", { tool_name: "Read" }), deps)).isNone()).toBe(true)
    expect(sent).toEqual([])
  })

  it("checks each gh call with its label, class, budget and a call id", async () => {
    const { deps, sent } = fakeDeps([])
    expect((await runPre(bash("gh pr view 1 && gh api repos/a/b -X PATCH -f x=1"), deps)).isNone()).toBe(true)
    expect(sent.map((s) => s.url)).toEqual(["https://quota.example.com/v1/check", "https://quota.example.com/v1/check"])
    expect(sent.map((s) => s.body)).toEqual([
      expect.objectContaining({
        account: "octo",
        label: "gh pr view",
        class: "read",
        resource: "graphql",
        callId: "tu1:0",
      }),
      expect.objectContaining({ label: "gh api PATCH", class: "write", resource: "core", callId: "tu1:1" }),
    ])
  })

  it("refuses a call the broker refuses, with its reason", async () => {
    const { deps } = fakeDeps([{ body: { decision: "deny", reason: "Under the floor. Wait until 16:25 UTC." } }])
    const out = (await runPre(bash("gh pr list"), deps)).orNull()
    expect(out?.hookSpecificOutput).toEqual({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Under the floor. Wait until 16:25 UTC.",
    })
  })

  it("in warn mode, says what it would refuse and refuses nothing", async () => {
    const { deps } = fakeDeps([{ body: { decision: "deny", reason: "Under the floor." } }], { mode: "warn" })
    const out = (await runPre(bash("gh pr list"), deps)).orNull()
    expect(out?.hookSpecificOutput.permissionDecision).toBeUndefined()
    expect(out?.hookSpecificOutput.additionalContext).toContain(
      "would refuse this GitHub call if it were enforcing: Under the floor.",
    )
  })

  it("waits out a booked slot once, and an unbooked one until it clears", async () => {
    const booked = fakeDeps([{ body: { decision: "wait", waitMs: 800, booked: true } }])
    const out = (await runPre(bash("gh pr list"), booked.deps)).orNull()
    expect(booked.slept).toEqual([800])
    expect(booked.sent).toHaveLength(1)
    expect(out?.hookSpecificOutput.additionalContext).toContain("held this command 1 s")

    const unbooked = fakeDeps([
      { body: { decision: "wait", waitMs: 1000, booked: false } },
      { body: { decision: "wait", waitMs: 1000, booked: false } },
      { body: { decision: "allow" } },
    ])
    await runPre(bash("gh pr list"), unbooked.deps)
    expect(unbooked.slept).toEqual([1000, 1000])
    expect(unbooked.sent).toHaveLength(3)
  })

  it("holds a command 10 s at most, then lets it run", async () => {
    const replies = Array.from({ length: 30 }, () => ({ body: { decision: "wait", waitMs: 4000, booked: false } }))
    const { deps, slept } = fakeDeps(replies)
    const out = (await runPre(bash("gh pr list"), deps)).orNull()
    expect(slept.reduce((a, b) => a + b, 0)).toBe(10_000)
    expect(out?.hookSpecificOutput.permissionDecision).toBeUndefined()
  })

  it("passes the broker's warnings on to the agent", async () => {
    const { deps } = fakeDeps([{ body: { decision: "allow", warnings: ["loop (warn mode) would have refused: …"] } }])
    expect((await runPre(bash("gh run list"), deps)).orNull()?.hookSpecificOutput.additionalContext).toBe(
      "Quota broker note: loop (warn mode) would have refused: …",
    )
  })

  it("starts a probe when the broker asks for one", async () => {
    const { deps, probes } = fakeDeps([{ body: { decision: "allow", probe: "gh api rate_limit" } }])
    await runPre(bash("gh pr list"), deps)
    expect(probes).toEqual(["octo"])
  })

  it("lets the command through when the broker is down, and says so once per session", async () => {
    const { deps } = fakeDeps(["down", "down"])
    const first = (await runPre(bash("gh pr list"), deps)).orNull()
    expect(first?.hookSpecificOutput.permissionDecision).toBeUndefined()
    expect(first?.systemMessage).toContain("didn't answer")
    expect((await runPre(bash("gh pr list"), deps)).isNone()).toBe(true)
  })

  it("forgets a cached key the broker refuses, and lets the command through", async () => {
    const forget = vi.fn()
    const { deps } = fakeDeps([{ status: 401, body: { error: "no" } }], { forgetBroker: forget })
    const out = (await runPre(bash("gh pr list"), deps)).orNull()
    expect(forget).toHaveBeenCalledOnce()
    expect(out?.hookSpecificOutput.permissionDecision).toBeUndefined()
  })

  it("still refuses fast polling with no broker configured", async () => {
    const { deps, sent } = fakeDeps([], { broker: () => Promise.resolve(Option.none()) })
    const out = (await runPre(bash("gh run watch 9"), deps)).orNull()
    expect(out?.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(out?.hookSpecificOutput.permissionDecisionReason).toContain("polls every 3 s")
    expect(sent).toEqual([])
  })

  it("refuses a tight shell loop around gh without asking the broker twice", async () => {
    const { deps, sent } = fakeDeps([])
    const out = (await runPre(bash("while true; do gh pr view 1; sleep 2; done"), deps)).orNull()
    expect(out?.hookSpecificOutput.permissionDecisionReason).toContain("sleeps 2 s")
    expect(sent).toEqual([])
  })
})

describe("staying within the hook's time", () => {
  it("rechecks no sooner than 250 ms, however the broker answers, and stops at 10 s", async () => {
    const replies = Array.from({ length: 100 }, () => ({ body: { decision: "wait", booked: false } }))
    const { deps, slept, sent } = fakeDeps(replies)
    await runPre(bash("gh pr list"), deps)
    expect(slept.every((ms) => ms >= 250)).toBe(true)
    expect(slept.reduce((a, b) => a + b, 0)).toBe(10_000)
    expect(sent).toHaveLength(40)
  })

  it("stops asking once the broker didn't answer", async () => {
    const { deps, sent } = fakeDeps(["down", "down", "down"])
    await runPre(bash("gh pr view 1; gh pr view 2; gh pr view 3"), deps)
    expect(sent).toHaveLength(1)
  })

  it("frees calls already booked when it refuses the command", async () => {
    const { deps, sent } = fakeDeps([{ body: { decision: "allow" } }, { body: { decision: "deny", reason: "No." } }])
    const out = (await runPre(bash("gh pr view 1 && gh pr create"), deps)).orNull()
    expect(out?.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(sent.map((s) => [s.url.replace("https://quota.example.com", ""), s.body.callId])).toEqual([
      ["/v1/check", "tu1:0"],
      ["/v1/check", "tu1:1"],
      ["/v1/finish", "tu1:0"],
    ])
  })

  it("still refuses fast polling when loading the broker fails", async () => {
    const { deps } = fakeDeps([], { broker: () => Promise.reject(new Error("EACCES")) })
    expect((await runPre(bash("gh run watch 9"), deps)).orNull()?.hookSpecificOutput.permissionDecision).toBe("deny")
  })
})

describe("PostToolUse", () => {
  it("marks each gh call finished, by the same call id", async () => {
    const { deps, sent } = fakeDeps([])
    await runPost(bash("gh pr view 1; gh run list", { hook_event_name: "PostToolUse" }), deps)
    expect(sent.map((s) => [s.url, s.body.callId])).toEqual([
      ["https://quota.example.com/v1/finish", "tu1:0"],
      ["https://quota.example.com/v1/finish", "tu1:1"],
    ])
  })

  it("does nothing when the broker is down", async () => {
    const { deps } = fakeDeps(["down"])
    await expect(runPost(bash("gh pr view 1"), deps)).resolves.toBeUndefined()
  })
})
