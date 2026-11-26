import type { SomaServerInstance } from "somamcp"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { initializeClient } from "../src/client/beszel-client"
import { registerAllTools } from "../src/tools"
import type { FingerprintRecord, SystemRecord } from "../src/types"
import { page, systems } from "./fixtures/hub"

// The write tools against a fetch stub that keeps records and applies PATCHes, the way PocketBase does.

type Execute = (args: Record<string, unknown>) => Promise<unknown>
type ToolDef = { readonly name: string; readonly execute: Execute }

const BASE = "https://beszel.example.com"

const toolsWith = (writes: boolean): Map<string, Execute> => {
  const tools = new Map<string, Execute>()
  registerAllTools(
    { addTool: (tool: ToolDef) => tools.set(tool.name, tool.execute) } as unknown as SomaServerInstance,
    { writes },
  )
  return tools
}

const tools = toolsWith(true)
const run = (name: string, args: Record<string, unknown>): Promise<string> => {
  const execute = tools.get(name)
  if (!execute) throw new Error(`no tool ${name}`)
  return execute(args) as Promise<string>
}

const mockFetch = vi.fn()
const patches = () =>
  mockFetch.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([url, init]) => ({
      url: new URL(String(url)),
      body: JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>,
    }))

const reply = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  })

type Store = { systems: Array<SystemRecord>; fingerprints: Array<FingerprintRecord & { token: string }> }

/** A hub holding `store`. `refuse` answers every PATCH with that status instead. */
function hub(store: Store, refuse?: { readonly status: number; readonly body?: unknown }): void {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const u = new URL(url)
    const match = /\/api\/collections\/([a-z_]+)\/records(?:\/([a-z0-9]+))?$/.exec(u.pathname)
    const collection = match?.[1] as keyof Store | undefined
    if (collection === undefined || !(collection in store)) return reply(404, {})
    const records = store[collection] as Array<Record<string, unknown>>
    const pick = (r: Record<string, unknown>) => {
      const fields = u.searchParams.get("fields")
      return structuredClone(fields === null ? r : Object.fromEntries(fields.split(",").map((f) => [f, r[f]])))
    }
    if (init?.method === "PATCH") {
      if (refuse !== undefined) return reply(refuse.status, refuse.body ?? {})
      const record = records.find((r) => r.id === match?.[2])
      if (record === undefined) return reply(404, {})
      Object.assign(record, JSON.parse(String(init.body)))
      return reply(200, pick(record))
    }
    const filter = u.searchParams.get("filter") ?? ""
    const system = /system = "([^"]+)"/.exec(filter)?.[1]
    return reply(200, page(records.filter((r) => system === undefined || r.system === system).map(pick)))
  })
}

const fresh = (): Store => ({
  systems: systems.map((s) => ({ ...s })),
  fingerprints: [
    { id: "fpalpha00000001", system: "sysalpha0000001", fingerprint: "abc123", token: "SECRET-TOKEN-A" },
    { id: "fpbravo00000002", system: "sysbravo0000002", fingerprint: "", token: "SECRET-TOKEN-B" },
  ],
})

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
  initializeClient({ baseUrl: BASE, auth: { kind: "token", token: "t" }, writes: true })
})

describe("the writes switch", () => {
  const WRITE_TOOLS = ["update_system", "pause_system", "resume_system", "reset_system_fingerprint"]

  it("leaves the write tools out when writes are off", () => {
    const names = [...toolsWith(false).keys()]
    expect(names).toContain("list_systems")
    for (const name of WRITE_TOOLS) expect(names).not.toContain(name)
  })

  it("adds them when writes are on", () => {
    for (const name of WRITE_TOOLS) expect([...tools.keys()]).toContain(name)
  })
})

describe("update_system", () => {
  it("renames a system with a PATCH of the name alone", async () => {
    const store = fresh()
    hub(store)
    const text = await run("update_system", { system: "alpha", name: "charlie" })
    expect(patches()).toEqual([
      {
        url: new URL(`${BASE}/api/collections/systems/records/sysalpha0000001?fields=id%2Cname%2Chost%2Cport%2Cstatus`),
        body: { name: "charlie" },
      },
    ])
    expect(text).toContain("Updated alpha (sysalpha0000001):")
    expect(text).toContain("- name: alpha → charlie")
    expect(text).not.toContain("connects to it again")
    expect(store.systems[0]?.name).toBe("charlie")
  })

  it("sets a moved system to pending, as Beszel's edit dialog does, so the hub reconnects", async () => {
    hub(fresh())
    const text = await run("update_system", { system: "alpha", host: "10.0.0.99", port: "45877" })
    expect(patches()[0]?.body).toEqual({ host: "10.0.0.99", port: "45877", status: "pending" })
    expect(text).toContain("- host: 10.0.0.11 → 10.0.0.99")
    expect(text).toContain("- port: 45876 → 45877")
    expect(text).toContain("Its status is pending until the agent answers.")
  })

  it("keeps a paused system paused when it moves", async () => {
    const store = fresh()
    store.systems[0] = { ...store.systems[0]!, status: "paused" }
    hub(store)
    await run("update_system", { system: "alpha", host: "10.0.0.99" })
    expect(patches()[0]?.body).toEqual({ host: "10.0.0.99" })
  })

  it("writes nothing when the values already match", async () => {
    hub(fresh())
    expect(await run("update_system", { system: "alpha", name: "alpha", port: "45876" })).toBe(
      "Nothing to change: alpha (sysalpha0000001) already has those values.",
    )
    expect(patches()).toEqual([])
  })

  it("refuses a name another system has, ignoring case", async () => {
    hub(fresh())
    await expect(run("update_system", { system: "alpha", name: "BRAVO" })).rejects.toThrow(
      'Another system is already named "bravo" (sysbravo0000002).',
    )
    expect(patches()).toEqual([])
  })

  it("lets a system change the case of its own name", async () => {
    hub(fresh())
    await run("update_system", { system: "alpha", name: "Alpha" })
    expect(patches()[0]?.body).toEqual({ name: "Alpha" })
  })

  it("says a readonly user can't change systems when the hub refuses", async () => {
    hub(fresh(), { status: 404 })
    await expect(run("update_system", { system: "alpha", name: "charlie" })).rejects.toThrow(
      "Beszel refused to change systems record sysalpha0000001 (HTTP 404).",
    )
  })

  it("passes on PocketBase's field problems for a 400", async () => {
    hub(fresh(), {
      status: 400,
      body: { status: 400, message: "Failed to update record.", data: { name: { code: "x", message: "Too long." } } },
    })
    await expect(run("update_system", { system: "alpha", name: "charlie" })).rejects.toThrow(
      "Beszel refused the systems change as invalid (HTTP 400): name: Too long.",
    )
  })
})

describe("pause_system and resume_system", () => {
  it("pauses a system that's up", async () => {
    const store = fresh()
    hub(store)
    const text = await run("pause_system", { system: "alpha" })
    expect(patches()[0]?.body).toEqual({ status: "paused" })
    expect(text).toContain("Paused alpha (sysalpha0000001).")
    expect(store.systems[0]?.status).toBe("paused")
  })

  it("writes nothing to pause a paused system", async () => {
    const store = fresh()
    store.systems[0] = { ...store.systems[0]!, status: "paused" }
    hub(store)
    expect(await run("pause_system", { system: "alpha" })).toBe("alpha (sysalpha0000001) is already paused.")
    expect(patches()).toEqual([])
  })

  it("resumes a paused system by setting it to pending, as Beszel's UI does", async () => {
    const store = fresh()
    store.systems[0] = { ...store.systems[0]!, status: "paused" }
    hub(store)
    const text = await run("resume_system", { system: "alpha" })
    expect(patches()[0]?.body).toEqual({ status: "pending" })
    expect(text).toContain("Resumed alpha (sysalpha0000001).")
  })

  it("writes nothing to resume a system that isn't paused", async () => {
    hub(fresh())
    expect(await run("resume_system", { system: "bravo" })).toBe(
      "bravo (sysbravo0000002) is down, not paused, so there's nothing to resume.",
    )
    expect(patches()).toEqual([])
  })
})

describe("reset_system_fingerprint", () => {
  const fingerprintRead = () =>
    mockFetch.mock.calls
      .map(([url]) => new URL(String(url)))
      .find((u) => u.pathname === "/api/collections/fingerprints/records")

  it("clears the stored fingerprint and leaves the token alone", async () => {
    const store = fresh()
    hub(store)
    const text = await run("reset_system_fingerprint", { system: "alpha" })
    expect(patches()).toEqual([
      {
        url: new URL(`${BASE}/api/collections/fingerprints/records/fpalpha00000001?fields=id%2Csystem%2Cfingerprint`),
        body: { fingerprint: "" },
      },
    ])
    expect(store.fingerprints[0]).toMatchObject({ fingerprint: "", token: "SECRET-TOKEN-A" })
    expect(text).toContain("Cleared the stored fingerprint of alpha (sysalpha0000001)")
    expect(text).toContain("If the wrong machine still has that token")
  })

  it("never asks the hub for the token, and never shows it", async () => {
    hub(fresh())
    const text = await run("reset_system_fingerprint", { system: "alpha" })
    expect(fingerprintRead()?.searchParams.get("fields")).toBe("id,system,fingerprint")
    expect(text).not.toContain("SECRET-TOKEN")
  })

  it("writes nothing when no fingerprint is stored", async () => {
    hub(fresh())
    expect(await run("reset_system_fingerprint", { system: "bravo" })).toContain("has no stored fingerprint")
    expect(patches()).toEqual([])
  })

  it("says so when the system has no fingerprint record at all", async () => {
    const store = fresh()
    store.fingerprints = []
    hub(store)
    await expect(run("reset_system_fingerprint", { system: "alpha" })).rejects.toThrow(
      "alpha (sysalpha0000001) has no fingerprint record",
    )
  })
})
