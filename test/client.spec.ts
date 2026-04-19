import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DokployClient } from "../src/client/dokploy-client"

type FetchArgs = [input: string, init: RequestInit]

function mockResponse(body: unknown, init: Partial<{ ok: boolean; status: number; statusText: string }> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body)
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    text: async () => text,
  } as Response
}

describe("DokployClient construction", () => {
  it("strips trailing slashes from base URL", () => {
    const client = new DokployClient("https://dokploy.example.com///", "k")
    expect(client).toBeDefined()
  })

  it("accepts base URL without trailing slash", () => {
    const client = new DokployClient("https://dokploy.example.com", "k")
    expect(client).toBeDefined()
  })
})

describe("DokployClient.get", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("builds /api/{path} URL and sends x-api-key header without body", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }))
    const client = new DokployClient("https://dok.example.com", "secret-key")

    await client.get("project.all").run()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as FetchArgs
    expect(url).toBe("https://dok.example.com/api/project.all")
    expect(init.method).toBe("GET")
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("secret-key")
    expect((init.headers as Record<string, string>).Accept).toBe("application/json")
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it("serializes defined params and skips undefined ones", async () => {
    fetchMock.mockResolvedValue(mockResponse([]))
    const client = new DokployClient("https://dok.example.com", "k")

    await client
      .get("project.one", {
        projectId: "p1",
        includeEnvs: true,
        limit: 10,
        skipped: undefined,
      })
      .run()

    const [url] = fetchMock.mock.calls[0] as FetchArgs
    const parsed = new URL(url)
    expect(parsed.searchParams.get("projectId")).toBe("p1")
    expect(parsed.searchParams.get("includeEnvs")).toBe("true")
    expect(parsed.searchParams.get("limit")).toBe("10")
    expect(parsed.searchParams.has("skipped")).toBe(false)
  })

  it("returns parsed JSON body on the Right", async () => {
    fetchMock.mockResolvedValue(mockResponse({ projectId: "p1", name: "X" }))
    const client = new DokployClient("https://dok.example.com", "k")
    const either = await client.get<{ projectId: string; name: string }>("project.one").run()
    expect(either.isRight()).toBe(true)
    if (either.isRight()) expect(either.value).toEqual({ projectId: "p1", name: "X" })
  })

  it("returns undefined on the Right when response body is empty", async () => {
    fetchMock.mockResolvedValue(mockResponse(""))
    const client = new DokployClient("https://dok.example.com", "k")
    const either = await client.get("project.none").run()
    expect(either.isRight()).toBe(true)
    if (either.isRight()) expect(either.value).toBeUndefined()
  })
})

describe("DokployClient.post", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends JSON body with Content-Type header", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }))
    const client = new DokployClient("https://dok.example.com", "k")

    await client.post("project.create", { name: "New", description: "desc" }).run()

    const [url, init] = fetchMock.mock.calls[0] as FetchArgs
    expect(url).toBe("https://dok.example.com/api/project.create")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
    expect(init.body).toBe(JSON.stringify({ name: "New", description: "desc" }))
  })

  it("omits Content-Type and body when no body provided", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }))
    const client = new DokployClient("https://dok.example.com", "k")

    await client.post("application.start").run()

    const [, init] = fetchMock.mock.calls[0] as FetchArgs
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it("returns Left HttpError with status, method, path, and response text on non-2xx", async () => {
    fetchMock.mockResolvedValue(
      mockResponse("boom — bad request", { ok: false, status: 400, statusText: "Bad Request" }),
    )
    const client = new DokployClient("https://dok.example.com", "k")

    const either = await client.post("project.create", { name: "x" }).run()
    expect(either.isLeft()).toBe(true)
    if (either.isLeft()) {
      expect(either.value).toMatchObject({
        _tag: "HttpError",
        method: "POST",
        path: "project.create",
        status: 400,
        statusText: "Bad Request",
        body: "boom — bad request",
      })
    }
  })

  it("falls back to 'Unknown error' body when response text cannot be read", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => {
        throw new Error("stream closed")
      },
    } as unknown as Response)
    const client = new DokployClient("https://dok.example.com", "k")

    const either = await client.get("project.all").run()
    expect(either.isLeft()).toBe(true)
    if (either.isLeft()) {
      expect(either.value).toMatchObject({ _tag: "HttpError", status: 500, body: "Unknown error" })
    }
  })
})

describe("client module state", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("throws a helpful error when getDokployClient called before initialize", async () => {
    const mod = await import("../src/client/dokploy-client")
    expect(() => mod.getDokployClient()).toThrow(/not initialized/)
  })

  it("initializeDokployClient sets the singleton and clears cached organizationId", async () => {
    const mod = await import("../src/client/dokploy-client")

    // Seed cached organizationId via first lookup
    fetchMock.mockResolvedValueOnce(mockResponse({ organizationId: "org-1" }))
    mod.initializeDokployClient("https://dok.example.com", "k")
    expect(await mod.getOrganizationId()).toBe("org-1")

    // Re-init should reset cache — next lookup hits fetch again
    mod.initializeDokployClient("https://dok.example.com", "k2")
    fetchMock.mockResolvedValueOnce(mockResponse({ organizationId: "org-2" }))
    expect(await mod.getOrganizationId()).toBe("org-2")
  })

  it("getOrganizationId caches after first success", async () => {
    const mod = await import("../src/client/dokploy-client")
    mod.initializeDokployClient("https://dok.example.com", "k")
    fetchMock.mockResolvedValueOnce(mockResponse({ organizationId: "org-cached" }))

    const first = await mod.getOrganizationId()
    const second = await mod.getOrganizationId()

    expect(first).toBe("org-cached")
    expect(second).toBe("org-cached")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("getOrganizationId falls back to project.all when admin.one fails", async () => {
    const mod = await import("../src/client/dokploy-client")
    mod.initializeDokployClient("https://dok.example.com", "k")

    fetchMock.mockResolvedValueOnce(mockResponse("forbidden", { ok: false, status: 403, statusText: "Forbidden" }))
    fetchMock.mockResolvedValueOnce(mockResponse([{ organizationId: "org-from-project" }]))

    const orgId = await mod.getOrganizationId()

    expect(orgId).toBe("org-from-project")
    const firstUrl = (fetchMock.mock.calls[0] as FetchArgs)[0]
    const secondUrl = (fetchMock.mock.calls[1] as FetchArgs)[0]
    expect(firstUrl).toContain("/api/admin.one")
    expect(secondUrl).toContain("/api/project.all")
  })

  it("getOrganizationId throws if fallback finds no projects", async () => {
    const mod = await import("../src/client/dokploy-client")
    mod.initializeDokployClient("https://dok.example.com", "k")

    fetchMock.mockResolvedValueOnce(mockResponse("forbidden", { ok: false, status: 403, statusText: "Forbidden" }))
    fetchMock.mockResolvedValueOnce(mockResponse([]))

    await expect(mod.getOrganizationId()).rejects.toThrow(/Cannot resolve organizationId/)
  })
})
