import { describe, expect, it } from "vitest"

import worker from "../src/worker.js"

// Exercises the deployed shape end to end: a real Request through the Worker's
// fetch handler, over the MCP wire protocol. If somamcp/edge wiring breaks, this
// fails here rather than after a deploy.

type Env = Parameters<typeof worker.fetch>[1]

const rpc = (method: string, params?: unknown, headers: Record<string, string> = {}): Request =>
  new Request("https://temporal.test/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...headers },
    method: "POST",
  })

const callTool = (name: string, args: Record<string, unknown>, headers?: Record<string, string>): Request =>
  rpc("tools/call", { arguments: args, name }, headers)

/** Unwraps the JSON text payload a tool returns. */
const payloadOf = async (res: Response): Promise<Record<string, unknown>> => {
  const body = (await res.json()) as { result?: { content?: Array<{ text: string }> } }
  const text = body.result?.content?.[0]?.text
  expect(text, "expected a tool result payload").toBeDefined()
  return JSON.parse(text as string) as Record<string, unknown>
}

const env = {} as Env

describe("worker", () => {
  it("lists all temporal tools", async () => {
    const body = JSON.stringify(await (await worker.fetch(rpc("tools/list"), env)).json())
    expect(body).toContain("get_current_time")
    expect(body).toContain("convert_timezone")
    expect(body).toContain("add_duration")
    expect(body).toContain("time_between")
  })

  it("serves get_current_time in a requested zone", async () => {
    const payload = await payloadOf(await worker.fetch(callTool("get_current_time", { timezone: "Asia/Tokyo" }), env))
    expect(payload.timezone).toBe("Asia/Tokyo")
    expect(payload.offset).toBe("+09:00")
    expect(typeof payload.epochMs).toBe("number")
  })

  it("defaults get_current_time to UTC", async () => {
    const payload = await payloadOf(await worker.fetch(callTool("get_current_time", {}), env))
    expect(payload.timezone).toBe("UTC")
  })

  it("converts between zones", async () => {
    const payload = await payloadOf(
      await worker.fetch(
        callTool("convert_timezone", {
          isoTimestamp: "2026-08-17T14:30:00Z",
          targetTimezone: "America/New_York",
        }),
        env,
      ),
    )
    expect(payload.rendered).toBe("2026-08-17T10:30:00")
    expect(payload.offset).toBe("-04:00")
  })

  it("adds a duration with calendar-aware clamping", async () => {
    const payload = await payloadOf(
      await worker.fetch(callTool("add_duration", { duration: "P1M", isoTimestamp: "2026-01-31T12:00:00Z" }), env),
    )
    expect(payload.result).toBe("2026-02-28T12:00:00.000Z")
  })

  it("measures elapsed time", async () => {
    const payload = await payloadOf(
      await worker.fetch(callTool("time_between", { from: "2026-08-17T00:00:00Z", to: "2026-08-18T02:00:00Z" }), env),
    )
    expect(payload.humanized).toBe("1 day, 2 hours")
  })

  it("returns a JSON-RPC error for a bad timezone rather than a fake success", async () => {
    const body = (await (
      await worker.fetch(callTool("get_current_time", { timezone: "Mars/Olympus_Mons" }), env)
    ).json()) as Record<string, unknown>
    // somamcp/edge converts isError results into real JSON-RPC errors.
    expect(body.error).toBeDefined()
    expect(body.result).toBeUndefined()
    expect(JSON.stringify(body.error)).toContain("Mars/Olympus_Mons")
  })

  it("returns a JSON-RPC error for a malformed duration", async () => {
    const body = (await (
      await worker.fetch(callTool("add_duration", { duration: "nope", isoTimestamp: "2026-08-17T00:00:00Z" }), env)
    ).json()) as Record<string, unknown>
    expect(body.error).toBeDefined()
  })

  it("serves the health endpoint", async () => {
    const res = await worker.fetch(new Request("https://temporal.test/health"), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: "temporal-mcp-server", status: "running" })
  })
})
