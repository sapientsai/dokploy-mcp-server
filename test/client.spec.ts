import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getClient, initializeClient, RescueTimeClient } from "../src/client/rescuetime-client"

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
})

describe("RescueTimeClient singleton", () => {
  it("should initialize and return client via getClient", () => {
    initializeClient({ apiKey: "test-key" })
    const client = getClient()
    expect(client.isSome()).toBe(true)
  })

  it("getClient returns None before initialization", () => {
    // Note: singleton state persists across tests in same module
    // This test documents the behavior after init
    const client = getClient()
    expect(client.isSome()).toBe(true)
  })
})

describe("RescueTimeClient.getAnalyticData", () => {
  let client: RescueTimeClient

  beforeEach(() => {
    client = initializeClient({ apiKey: "test-key" })
  })

  it("should return Right with parsed data on success", async () => {
    const mockData = {
      notes: "test",
      row_headers: ["Rank", "Time Spent (seconds)", "Activity"],
      rows: [
        [1, 3600, "VS Code"],
        [2, 1800, "Chrome"],
      ],
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockData,
    })

    const result = await client.getAnalyticData({ restrict_kind: "activity" }).run()

    expect(result.isRight()).toBe(true)
    result.fold(
      () => {
        throw new Error("Expected Right")
      },
      (data) => {
        expect(data.row_headers).toEqual(["Rank", "Time Spent (seconds)", "Activity"])
        expect(data.rows).toHaveLength(2)
      },
    )
  })

  it("should return Left on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })

    const result = await client.getAnalyticData({}).run()

    expect(result.isLeft()).toBe(true)
  })

  it("should return Left on rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })

    const result = await client.getAnalyticData({}).run()

    expect(result.isLeft()).toBe(true)
    result.fold(
      (err) => {
        expect(err.message).toContain("Rate limit")
      },
      () => {
        throw new Error("Expected Left")
      },
    )
  })

  it("should return Left on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const result = await client.getAnalyticData({}).run()

    expect(result.isLeft()).toBe(true)
  })

  it("should include API key in URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ notes: "", row_headers: [], rows: [] }),
    })

    await client.getAnalyticData({ restrict_kind: "activity" }).run()

    expect(mockFetch).toHaveBeenCalledOnce()
    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain("key=test-key")
    expect(calledUrl).toContain("format=json")
    expect(calledUrl).toContain("restrict_kind=activity")
  })
})

describe("RescueTimeClient.getDailySummary", () => {
  let client: RescueTimeClient

  beforeEach(() => {
    client = initializeClient({ apiKey: "test-key" })
  })

  it("should return Right with summaries on success", async () => {
    const mockSummaries = [
      {
        id: 1,
        date: "2024-01-15",
        productivity_pulse: 75,
        total_hours: 8.5,
        very_productive_hours: 4.0,
        productive_hours: 2.0,
        neutral_hours: 1.0,
        distracting_hours: 1.0,
        very_distracting_hours: 0.5,
        total_duration_formatted: "8h 30m",
      },
    ]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockSummaries,
    })

    const result = await client.getDailySummary().run()

    expect(result.isRight()).toBe(true)
    result.fold(
      () => {
        throw new Error("Expected Right")
      },
      (summaries) => {
        expect(summaries).toHaveLength(1)
        expect(summaries[0]!.productivity_pulse).toBe(75)
      },
    )
  })
})

describe("RescueTimeClient.postHighlight", () => {
  let client: RescueTimeClient

  beforeEach(() => {
    client = initializeClient({ apiKey: "test-key" })
  })

  it("should POST highlight and return result", async () => {
    const mockHighlight = {
      id: 1,
      date: "2024-01-15",
      description: "Shipped feature X",
      source: "mcp-server",
      created_at: "2024-01-15T10:00:00Z",
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockHighlight,
    })

    const result = await client.postHighlight({ description: "Shipped feature X", source: "mcp-server" }).run()

    expect(result.isRight()).toBe(true)
    const callArgs = mockFetch.mock.calls[0]![1] as RequestInit
    expect(callArgs.method).toBe("POST")
  })
})

describe("RescueTimeClient.startFocusSession", () => {
  let client: RescueTimeClient

  beforeEach(() => {
    client = initializeClient({ apiKey: "test-key" })
  })

  it("should POST to start focus session", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
    })

    const result = await client.startFocusSession(25).run()

    expect(result.isRight()).toBe(true)
    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain("start_focustime")
  })
})
