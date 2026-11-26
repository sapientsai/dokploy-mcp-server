import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKey } from "../../brands"
import { getDakboardClient, initializeDakboardClient } from "../dakboard-client"

describe("dakboard-client", () => {
  beforeEach(() => {
    initializeDakboardClient(ApiKey("test-api-key"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should initialize and return a client", () => {
    const clientOption = getDakboardClient()
    expect(clientOption.isSome()).toBe(true)
    const client = clientOption.orThrow()
    expect(client.listScreens).toBeTypeOf("function")
    expect(client.getScreen).toBeTypeOf("function")
    expect(client.updateScreen).toBeTypeOf("function")
    expect(client.listBlocks).toBeTypeOf("function")
    expect(client.getBlock).toBeTypeOf("function")
    expect(client.updateBlock).toBeTypeOf("function")
    expect(client.listLoops).toBeTypeOf("function")
    expect(client.getLoop).toBeTypeOf("function")
    expect(client.listDevices).toBeTypeOf("function")
    expect(client.getDevice).toBeTypeOf("function")
    expect(client.updateDevice).toBeTypeOf("function")
    expect(client.listMetrics).toBeTypeOf("function")
    expect(client.getMetric).toBeTypeOf("function")
    expect(client.createMetricDataPoints).toBeTypeOf("function")
    expect(client.deleteMetric).toBeTypeOf("function")
    expect(client.deleteMetricDataPoints).toBeTypeOf("function")
  })

  it("should return Right on successful API response", async () => {
    const mockScreens = [
      { id: "1", name: "Test Screen", is_default: 1, created_at: "2024-01-01", updated_at: "2024-01-01" },
    ]

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(mockScreens), { status: 200 }))

    const client = getDakboardClient().orThrow()
    const result = await client.listScreens()

    expect(
      result.fold(
        () => null,
        (screens) => screens,
      ),
    ).toEqual(mockScreens)
  })

  it("should return Left on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404, statusText: "Not Found" }))

    const client = getDakboardClient().orThrow()
    const result = await client.listScreens()

    expect(
      result.fold(
        (error) => error.type,
        () => null,
      ),
    ).toBe("api")
  })

  it("should return Left on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Connection refused"))

    const client = getDakboardClient().orThrow()
    const result = await client.listScreens()

    expect(
      result.fold(
        (error) => error.type,
        () => null,
      ),
    ).toBe("network")
  })

  it("should return Left on invalid JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not json {{{", { status: 200 }))

    const client = getDakboardClient().orThrow()
    const result = await client.listScreens()

    expect(
      result.fold(
        (error) => error.type,
        () => null,
      ),
    ).toBe("parse")
  })

  it("should handle empty response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }))

    const client = getDakboardClient().orThrow()
    const result = await client.listScreens()

    expect(
      result.fold(
        () => false,
        () => true,
      ),
    ).toBe(true)
  })

  it("should send form-encoded body for PUT requests", async () => {
    const mockScreen = { id: "1", name: "Updated", is_default: 0, created_at: "2024-01-01", updated_at: "2024-01-02" }

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(mockScreen), { status: 200 }))

    const client = getDakboardClient().orThrow()
    const { ScreenId } = await import("../../brands")
    await client.updateScreen(ScreenId("1"), { name: "Updated" })

    const [, options] = fetchSpy.mock.calls[0]
    expect(options?.method).toBe("PUT")
    expect((options?.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded")
    expect(options?.body).toContain("name=Updated")
  })

  it("should include api_key as query parameter", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }))

    const client = getDakboardClient().orThrow()
    await client.listScreens()

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toContain("api_key=test-api-key")
  })

  it("client object should be frozen", () => {
    const client = getDakboardClient().orThrow()
    expect(Object.isFrozen(client)).toBe(true)
  })
})
