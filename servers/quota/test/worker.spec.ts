// The Worker as it deploys: bundled by esbuild, run in workerd through Miniflare, with a SQLite-backed
// Durable Object and no Node compatibility. GitHub is a stub, so the broker's own probe is exercised too.
import { fileURLToPath } from "node:url"

import { build } from "esbuild"
import { Miniflare } from "miniflare"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const KEY = "test-quota-key"
const PROBE_TOKEN = "test-probe-token"
const RESET = Math.floor(Date.now() / 1000) + 1800

const github = { remaining: 4321, requests: [] as Array<{ readonly auth: string; readonly agent: string }> }

const bundle = async (): Promise<string> => {
  const result = await build({
    bundle: true,
    conditions: ["workerd", "worker", "browser"],
    entryPoints: [fileURLToPath(new URL("../src/worker.ts", import.meta.url))],
    format: "esm",
    logLevel: "silent",
    mainFields: ["module", "main"],
    // "neutral" knows no Node built-ins, so importing one fails the build outright.
    platform: "neutral",
    target: "es2022",
    write: false,
  })
  return result.outputFiles[0]?.text ?? ""
}

const workerWith = (script: string, bindings: Record<string, string>): Miniflare =>
  new Miniflare({
    modules: true,
    script,
    compatibilityDate: "2026-08-06",
    compatibilityFlags: ["no_nodejs_compat"],
    durableObjects: { LEDGER: { className: "QuotaLedger", useSQLite: true } },
    bindings,
    outboundService: (request) => {
      if (new URL(request.url).pathname !== "/rate_limit") return new Response("not found", { status: 404 })
      github.requests.push({
        auth: request.headers.get("authorization") ?? "",
        agent: request.headers.get("user-agent") ?? "",
      })
      return Response.json({
        resources: {
          core: { limit: 5000, remaining: github.remaining, reset: RESET, used: 5000 - github.remaining },
          graphql: { limit: 5000, remaining: 4990, reset: RESET, used: 10 },
        },
      })
    },
  })

let mf: Miniflare
let unkeyed: Miniflare

beforeAll(async () => {
  const script = await bundle()
  mf = workerWith(script, { QUOTA_KEY: KEY, GITHUB_PROBE_TOKEN: PROBE_TOKEN })
  unkeyed = workerWith(script, {})
  await Promise.all([mf.ready, unkeyed.ready])
}, 120_000)

afterAll(async () => {
  await Promise.all([mf?.dispose(), unkeyed?.dispose()])
})

const post = (path: string, body: unknown, key = KEY) =>
  mf.dispatchFetch(`http://quota.test${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const checkCall = async (body: Record<string, unknown>) =>
  (await (
    await post("/v1/check", { service: "github", session: "s1", machine: "m1", label: "gh pr view", ...body })
  ).json()) as Record<string, unknown>

/** One MCP tool call; somamcp answers 2025-era requests over SSE, so the reply is the `data:` line. */
const callTool = async (
  name: string,
  args: Record<string, unknown>,
  key = KEY,
): Promise<{ status: number; text: string }> => {
  const response = await mf.dispatchFetch("http://quota.test/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/call", params: { name, arguments: args } }),
  })
  const raw = await response.text()
  if (response.status !== 200) return { status: response.status, text: raw }
  const data = raw.split("\n").find((line) => line.startsWith("data: "))
  const reply = JSON.parse(data === undefined ? raw : data.slice("data: ".length)) as {
    result?: { content?: Array<{ text: string }> }
  }
  return { status: 200, text: reply.result?.content?.map((c) => c.text).join("\n") ?? raw }
}

describe("keys", () => {
  it("refuses everything while QUOTA_KEY is unset", async () => {
    const response = await unkeyed.dispatchFetch("http://quota.test/v1/check", { method: "POST", body: "{}" })
    expect(response.status).toBe(503)
    expect(((await response.json()) as { error: string }).error).toContain("QUOTA_KEY is not set")
  })

  it("refuses a wrong key on the API and on MCP", async () => {
    expect((await post("/v1/check", {}, "wrong")).status).toBe(401)
    expect((await callTool("quota_services", {}, "wrong")).status).toBe(401)
  })
})

describe("the hook's API", () => {
  it("reads GitHub itself on the first check, with its token, then counts each call", async () => {
    github.remaining = 4321
    const first = await checkCall({ account: "octo", resource: "core" })
    expect(first).toMatchObject({ decision: "allow", resource: "core", remaining: 4321, probe: null })
    expect(github.requests.at(-1)).toEqual({ auth: `Bearer ${PROBE_TOKEN}`, agent: "quota-mcp-server" })
    const second = await checkCall({ account: "octo", resource: "core" })
    expect(second).toMatchObject({ decision: "allow", remaining: 4320 })
  })

  it("refuses an agent's call under the floor, with when to retry", async () => {
    github.remaining = 900
    const answer = await checkCall({ account: "low", resource: "core" })
    expect(answer).toMatchObject({ decision: "deny", policy: "floor" })
    expect(String(answer.reason)).toContain("under the 1000 kept for the owner")
    expect(answer.retryAt).toBe(new Date(RESET * 1000).toISOString())
  })

  it("takes a report of a response's headers over the estimate", async () => {
    const report = await post("/v1/report", {
      service: "github",
      account: "octo",
      headers: { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "3000", "x-ratelimit-reset": String(RESET) },
    })
    expect(await report.json()).toEqual({ kept: 1 })
    expect(await checkCall({ account: "octo", resource: "core" })).toMatchObject({ remaining: 3000 })
  })

  it("says what's wrong with a bad request", async () => {
    const response = await post("/v1/check", {
      service: "github",
      account: "bad account!",
      session: "s",
      machine: "m",
      label: "x",
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain("account")
    expect(
      (await post("/v1/check", { service: "nope", account: "a", session: "s", machine: "m", label: "x" })).status,
    ).toBe(404)
    expect(
      (
        await post("/v1/check", {
          service: "github",
          account: "a",
          session: "s",
          machine: "m",
          label: "x",
          resource: "search",
        })
      ).status,
    ).toBe(400)
  })

  it("marks a call finished", async () => {
    await checkCall({ account: "octo", callId: "call-1" })
    expect(await (await post("/v1/finish", { service: "github", account: "octo", callId: "call-1" })).json()).toEqual({
      ok: true,
    })
  })
})

describe("MCP tools", () => {
  it("shows each account's budgets and top sessions", async () => {
    const { text } = await callTool("quota_status", { service: "github" })
    expect(text).toContain("## github:octo")
    expect(text).toContain("## github:low")
    expect(text).toMatch(/\*\*core:\*\* \d+ of 5000 left/)
    expect(text).toContain("s1 on m1")
  })

  it("leases a batch, then gives back what it didn't use", async () => {
    const granted = await callTool("quota_acquire", {
      service: "github",
      account: "octo",
      cost: 50,
      purpose: "backfill",
    })
    const lease = /lease ([0-9a-f-]{36})/.exec(granted.text)?.[1]
    expect(lease).toBeDefined()
    const released = await callTool("quota_release", { service: "github", account: "octo", lease, used: 12 })
    expect(released.text).toBe(`Lease ${lease} now counts 12.`)
  })

  it("lists policies with their modes, and has no tool that changes them", async () => {
    const { text } = await callTool("quota_policies", { service: "github", account: "octo" })
    expect(text).toContain("**floor** (floor, enforce)")
    expect(text).toContain("**fleet-minute** (rate, warn)")
    const list = await mf.dispatchFetch("http://quota.test/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: 2, jsonrpc: "2.0", method: "tools/list" }),
    })
    const names = [...(await list.text()).matchAll(/"name":"([a-z_]+)"/g)].map((m) => m[1])
    expect(names).toEqual(
      expect.arrayContaining([
        "quota_status",
        "quota_acquire",
        "quota_release",
        "quota_report",
        "quota_policies",
        "quota_services",
      ]),
    )
    expect(names.some((n) => n !== undefined && /policy|policies/.test(n) && n !== "quota_policies")).toBe(false)
  })
})
