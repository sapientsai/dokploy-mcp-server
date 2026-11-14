// The Workers-safe entry inside workerd, Cloudflare's runtime, with no nodejs_compat: a Node
// built-in or global anywhere on the path, dependencies included, fails here.
import { fileURLToPath } from "node:url"

import { build } from "esbuild"
import { Miniflare } from "miniflare"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const ENTRY = fileURLToPath(new URL("./worker.ts", import.meta.url))

const bundle = async (): Promise<string> => {
  const result = await build({
    bundle: true,
    conditions: ["workerd", "worker", "browser"],
    entryPoints: [ENTRY],
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

const upstream: string[] = []
let script = ""
let mf: Miniflare

beforeAll(async () => {
  script = await bundle()
  mf = new Miniflare({
    compatibilityDate: "2026-07-01",
    compatibilityFlags: [],
    modules: true,
    // Every fetch the Worker makes lands here instead of api.fda.gov.
    outboundService: (request) => {
      upstream.push(request.url)
      return new Response(JSON.stringify({ meta: { results: { total: 0 } }, results: [] }), {
        headers: { "content-type": "application/json" },
      })
    },
    script,
  })
  await mf.ready
}, 120_000)

afterAll(async () => {
  await mf?.dispose()
})

/** A 2025-era JSON-RPC tool call, which a stateless server answers without an initialize. */
const callTool = async (name: string, args: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const response = await mf.dispatchFetch("http://worker/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/call", params: { arguments: args, name } }),
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...headers },
    method: "POST",
  })
  const text = await response.text()
  const data = text.split("\n").find((line) => line.startsWith("data: "))
  return JSON.parse(data === undefined ? text : data.slice("data: ".length)) as {
    result?: { content?: Array<{ text: string }>; isError?: boolean }
  }
}

const payloadOf = (reply: Awaited<ReturnType<typeof callTool>>) =>
  JSON.parse(reply.result?.content?.[0]?.text ?? "{}") as { apiUsage?: { authenticated: boolean }; success?: boolean }

describe("the openFDA tools in workerd (no nodejs_compat)", () => {
  it("bundle with no Node built-ins", () => {
    expect(script.length).toBeGreaterThan(0)
    expect(script).not.toMatch(/from\s*["']node:/)
  })

  it("list all 14 tools", async () => {
    const response = await mf.dispatchFetch("http://worker/mcp", {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      method: "POST",
    })
    const text = await response.text()
    expect(text.match(/"name":"search_/g)?.length).toBe(14)
  })

  it("send each caller's own key, and none for a caller without one", async () => {
    upstream.length = 0
    const [ana, ben, none] = await Promise.all([
      callTool("search_drug_ndc", { brandName: "aspirin" }, { "x-openfda-api-key": "ana-key" }),
      callTool("search_drug_ndc", { brandName: "aspirin" }, { "x-openfda-api-key": "ben-key" }),
      callTool("search_drug_ndc", { brandName: "aspirin" }),
    ])
    expect(upstream).toHaveLength(3)
    expect(upstream.filter((url) => url.includes("api_key=ana-key"))).toHaveLength(1)
    expect(upstream.filter((url) => url.includes("api_key=ben-key"))).toHaveLength(1)
    expect(upstream.filter((url) => !url.includes("api_key="))).toHaveLength(1)
    expect(payloadOf(ana)).toMatchObject({ apiUsage: { authenticated: true }, success: true })
    expect(payloadOf(ben)).toMatchObject({ apiUsage: { authenticated: true }, success: true })
    expect(payloadOf(none)).toMatchObject({ apiUsage: { authenticated: false }, success: true })
  })
})
