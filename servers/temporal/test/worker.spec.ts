import { describe, expect, it } from "vitest"

import worker from "../src/worker.js"

// Exercises the deployed shape end to end: a real Request through the Worker's
// fetch handler, over the MCP wire protocol. If somamcp wiring breaks, this
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

/**
 * Reads a JSON-RPC reply. somamcp 2.x answers a 2025-era request over SSE, so the
 * message is the `data:` line of the event; a plain JSON reply is read as is.
 */
const replyOf = async (res: Response): Promise<Record<string, unknown>> => {
  const text = await res.text()
  const data = text.split("\n").find((line) => line.startsWith("data: "))
  return JSON.parse(data === undefined ? text : data.slice("data: ".length)) as Record<string, unknown>
}

/**
 * Asserts a tool failure and returns its text. somamcp 2.x reports a failing tool
 * the way the MCP spec says to: a result with `isError: true`, not a JSON-RPC
 * error, so the client's model reads the message and its hint and can retry.
 */
const toolErrorOf = (body: Record<string, unknown>): string => {
  expect(body.error, "a tool failure is a result, not a JSON-RPC error").toBeUndefined()
  const result = body.result as { content?: Array<{ text: string }>; isError?: boolean } | undefined
  expect(result?.isError).toBe(true)
  return result?.content?.map((part) => part.text).join("\n") ?? ""
}

/** Unwraps the JSON text payload a tool returns. */
const payloadOf = async (res: Response): Promise<Record<string, unknown>> => {
  const body = (await replyOf(res)) as { result?: { content?: Array<{ text: string }> } }
  const text = body.result?.content?.[0]?.text
  expect(text, "expected a tool result payload").toBeDefined()
  return JSON.parse(text as string) as Record<string, unknown>
}

const env = {} as Env

describe("worker", () => {
  it("lists all temporal tools", async () => {
    const body = JSON.stringify(await replyOf(await worker.fetch(rpc("tools/list"), env)))
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

  it("adds a calendar day across a DST boundary, not 24 hours", async () => {
    const payload = await payloadOf(
      await worker.fetch(
        callTool("add_duration", {
          duration: "P1D",
          isoTimestamp: "2026-11-01T00:00:00-04:00",
          timezone: "America/New_York",
        }),
        env,
      ),
    )
    expect(payload.local).toBe("2026-11-02T00:00:00")
  })

  it("reads a naive timestamp in the supplied timezone", async () => {
    const payload = await payloadOf(
      await worker.fetch(
        callTool("convert_timezone", {
          isoTimestamp: "2026-11-01T00:00:00",
          sourceTimezone: "America/New_York",
          targetTimezone: "UTC",
        }),
        env,
      ),
    )
    expect(payload.iso).toBe("2026-11-01T04:00:00.000Z")
  })

  it("rejects a loose timestamp instead of guessing", async () => {
    const result = toolErrorOf(
      await replyOf(
        await worker.fetch(callTool("convert_timezone", { isoTimestamp: "17 Aug 2026", targetTimezone: "UTC" }), env),
      ),
    )
    expect(result).toContain("17 Aug 2026")
  })

  it("returns a tool error for a bad timezone rather than a fake success", async () => {
    const result = toolErrorOf(
      await replyOf(await worker.fetch(callTool("get_current_time", { timezone: "Mars/Olympus_Mons" }), env)),
    )
    expect(result).toContain("Mars/Olympus_Mons")
  })

  it("returns a tool error for a malformed duration", async () => {
    const result = toolErrorOf(
      await replyOf(
        await worker.fetch(callTool("add_duration", { duration: "nope", isoTimestamp: "2026-08-17T00:00:00Z" }), env),
      ),
    )
    expect(result).toContain("nope")
  })

  it("serves the health endpoint", async () => {
    const res = await worker.fetch(new Request("https://temporal.test/health"), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: "temporal-mcp-server", status: "running" })
  })
})
