import { describe, expect, it } from "vitest"

import worker from "../src/worker.js"

// The Worker with MCP_AUTH_TOKEN bound. It lives in its own file because
// src/worker.ts builds its server once per module instance, and vitest gives
// each test file its own, so worker.spec.ts keeps covering the public mode.

type Env = Parameters<typeof worker.fetch>[1]

const TOKEN = "test-token"
const env = { MCP_AUTH_TOKEN: TOKEN } as Env

const listTools = (headers: Record<string, string> = {}): Request =>
  new Request("https://temporal.test/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...headers },
    method: "POST",
  })

const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` })

describe("worker with MCP_AUTH_TOKEN", () => {
  it("refuses an MCP call with no token", async () => {
    expect((await worker.fetch(listTools(), env)).status).toBe(401)
  })

  it("refuses an MCP call with the wrong token", async () => {
    expect((await worker.fetch(listTools(bearer("wrong")), env)).status).toBe(401)
  })

  it("refuses a token sent without the Bearer scheme", async () => {
    expect((await worker.fetch(listTools({ authorization: TOKEN }), env)).status).toBe(401)
  })

  it("serves an MCP call with the right token", async () => {
    const res = await worker.fetch(listTools(bearer(TOKEN)), env)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("get_current_time")
  })

  it("keeps /health public", async () => {
    expect((await worker.fetch(new Request("https://temporal.test/health"), env)).status).toBe(200)
  })

  it("protects /info with the same token", async () => {
    expect((await worker.fetch(new Request("https://temporal.test/info"), env)).status).toBe(401)
    const res = await worker.fetch(new Request("https://temporal.test/info", { headers: bearer(TOKEN) }), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: "temporal-mcp-server" })
  })
})
