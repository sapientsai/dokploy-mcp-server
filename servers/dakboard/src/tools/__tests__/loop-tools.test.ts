import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKey } from "../../brands"
import { initializeDakboardClient } from "../../client/dakboard-client"
import { getLoop, listLoops } from "../loop-tools"

describe("loop-tools", () => {
  beforeEach(() => {
    initializeDakboardClient(ApiKey("test-key"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should list loops", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: "l1", name: "Daily", created_at: "2024-01-01", updated_at: "2024-01-01" }]), {
        status: 200,
      }),
    )

    const result = await listLoops()
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("DAKboard Loops")
    expect(result.orThrow()).toContain("Daily")
  })

  it("should get loop detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "l1",
          name: "Daily",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
          screens: [{ screen_id: "s1", duration: 30, order: 1 }],
        }),
        { status: 200 },
      ),
    )

    const result = await getLoop({ loop_id: "l1" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("Daily")
    expect(result.orThrow()).toContain("Screen s1")
    expect(result.orThrow()).toContain("30s")
  })

  it("should return Left on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Error", { status: 500, statusText: "Server Error" }))

    const result = await listLoops()
    expect(result.isLeft()).toBe(true)
    result.fold(
      (e) => expect(e.message).toContain("Failed to list loops"),
      () => expect.unreachable("should be Left"),
    )
  })
})
