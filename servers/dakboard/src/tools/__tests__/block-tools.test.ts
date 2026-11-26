import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKey } from "../../brands"
import { initializeDakboardClient } from "../../client/dakboard-client"
import { getBlock, listBlocks, updateBlock } from "../block-tools"

describe("block-tools", () => {
  beforeEach(() => {
    initializeDakboardClient(ApiKey("test-key"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should list blocks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "b1",
            screen_id: "s1",
            name: "Weather",
            type: "weather",
            w: 400,
            h: 300,
            x: 0,
            y: 0,
            is_disabled: 0,
            z_index: 1,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ]),
        { status: 200 },
      ),
    )

    const result = await listBlocks({ screen_id: "s1" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("Blocks for Screen s1")
    expect(result.orThrow()).toContain("Weather")
    expect(result.orThrow()).toContain("weather")
  })

  it("should get block detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "b1",
          screen_id: "s1",
          name: "Weather",
          type: "weather",
          w: 400,
          h: 300,
          x: 0,
          y: 0,
          is_disabled: 0,
          z_index: 1,
          text: "Current temp: 72F",
          location: "Concord, MA",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        }),
        { status: 200 },
      ),
    )

    const result = await getBlock({ screen_id: "s1", block_id: "b1" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("Weather")
    expect(result.orThrow()).toContain("Current temp: 72F")
    expect(result.orThrow()).toContain("Concord, MA")
  })

  it("should update block", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "b1",
          screen_id: "s1",
          name: "Updated Weather",
          type: "weather",
          w: 500,
          h: 300,
          x: 0,
          y: 0,
          is_disabled: 0,
          z_index: 1,
          created_at: "2024-01-01",
          updated_at: "2024-01-02",
        }),
        { status: 200 },
      ),
    )

    const result = await updateBlock({ screen_id: "s1", block_id: "b1", name: "Updated Weather", w: 500 })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("updated successfully")
    expect(result.orThrow()).toContain("Updated Weather")
  })

  it("should return Left on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Error", { status: 500, statusText: "Server Error" }))

    const result = await listBlocks({ screen_id: "s1" })
    expect(result.isLeft()).toBe(true)
    result.fold(
      (e) => expect(e.message).toContain("Failed to list blocks"),
      () => expect.unreachable("should be Left"),
    )
  })
})
