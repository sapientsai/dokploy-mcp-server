import { Right } from "functype"
import type { SomaServerInstance } from "somamcp"
import { describe, expect, it, vi } from "vitest"

import { registerOpenFDATools } from "../src/register.js"
import type { FDAClient } from "../src/utils/api-client.js"

type Session = { key: string }
type Registered = { execute: (args: unknown, context: { session?: Session }) => Promise<string>; name: string }

/** A stand-in server that records what was registered. */
const capture = () => {
  const tools = new Map<string, Registered>()
  const server = {
    addTool: (tool: Registered) => {
      tools.set(tool.name, tool)
    },
  } as unknown as SomaServerInstance<Session>
  return { server, tools }
}

/** A client whose searches answer at once and remember which session's client ran them. */
const clientFor = (key: string, calls: string[]): FDAClient => {
  const answer = () => {
    calls.push(key)
    return Promise.resolve(Right({ results: [] }))
  }
  return new Proxy({} as FDAClient, {
    get: (_target, property) =>
      property === "getRateLimitInfo" ? () => ({ authenticated: true, rateLimit: key }) : answer,
  })
}

describe("registerOpenFDATools", () => {
  it("registers all 14 tools", () => {
    const { server, tools } = capture()
    registerOpenFDATools(server)
    expect(tools.size).toBe(14)
  })

  it("asks for a client per call, with that call's session, so concurrent callers never share a key", async () => {
    const calls: string[] = []
    const client = vi.fn((session: Session | undefined) => clientFor(session?.key ?? "none", calls))
    const { server, tools } = capture()
    registerOpenFDATools(server, { client })
    const search = tools.get("search_drug_ndc")
    const [ana, ben] = await Promise.all([
      search?.execute({ brandName: "x" }, { session: { key: "ana" } }),
      search?.execute({ brandName: "x" }, { session: { key: "ben" } }),
    ])
    expect(calls.sort()).toEqual(["ana", "ben"])
    expect(JSON.parse(ana ?? "{}").apiUsage.rateLimit).toBe("ana")
    expect(JSON.parse(ben ?? "{}").apiUsage.rateLimit).toBe("ben")
    expect(client).toHaveBeenCalledWith({ key: "ana" })
  })
})
