import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKey } from "../../brands"
import { initializeDakboardClient } from "../../client/dakboard-client"
import { createMetricDataPoints, deleteMetric, deleteMetricDataPoints, getMetric, listMetrics } from "../metric-tools"

describe("metric-tools", () => {
  beforeEach(() => {
    initializeDakboardClient(ApiKey("test-key"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should list metrics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([{ metric_name: "temperature", created_at: "2024-01-01", updated_at: "2024-01-01" }]),
        { status: 200 },
      ),
    )

    const result = await listMetrics()
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("DAKboard Metrics")
    expect(result.orThrow()).toContain("temperature")
  })

  it("should get metric detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          metric_name: "temperature",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
          data_points: [{ timestamp: "2024-06-15T12:00:00Z", value: 72 }],
        }),
        { status: 200 },
      ),
    )

    const result = await getMetric({ metric_name: "temperature" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("temperature")
    expect(result.orThrow()).toContain("72")
  })

  it("should create metric data points", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{ value: 72 }]), { status: 200 }))

    const result = await createMetricDataPoints({
      metric_name: "temperature",
      data_points: [{ value: 72 }],
    })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("Successfully created 1 data point(s)")
    expect(result.orThrow()).toContain("temperature")
  })

  it("should delete metric", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }))

    const result = await deleteMetric({ metric_name: "temperature" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("deleted")
    expect(result.orThrow()).toContain("temperature")
  })

  it("should delete metric data points", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }))

    const result = await deleteMetricDataPoints({
      metric_name: "temperature",
      timestamp: "2024-06-15T12:00:00Z",
    })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("deleted")
    expect(result.orThrow()).toContain("temperature")
  })

  it("should return Left on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Error", { status: 500, statusText: "Server Error" }))

    const result = await listMetrics()
    expect(result.isLeft()).toBe(true)
    result.fold(
      (e) => expect(e.message).toContain("Failed to list metrics"),
      () => expect.unreachable("should be Left"),
    )
  })
})
